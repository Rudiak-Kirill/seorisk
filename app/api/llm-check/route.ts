import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db/drizzle';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import { llmChecks } from '@/lib/db/schema';

export const runtime = 'nodejs';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const defaultAgents = ['gptbot', 'claudebot', 'perplexitybot'];

const llmAgentTokens = [
  'gptbot',
  'chatgpt-user',
  'oai-searchbot',
  'claudebot',
  'anthropic-ai',
  'perplexitybot',
  'youbot',
  'applebot-extended',
  'amazonbot',
  'bytespider',
  'diffbot',
  'ccbot',
  'cohere-ai',
] as const;

type Snapshot = {
  http_code: number;
  text_len: number;
  links_count: number;
  has_h1: boolean;
  has_title: boolean;
  access_state?: string | null;
};

type LlmPayload = {
  ok: boolean;
  url: string;
  checked_at: string;
  checks: Record<string, Snapshot>;
  agents?: Record<string, { key: string; label: string; ua: string }>;
  ai_readiness?: unknown;
};

type CardStatus = 'ok' | 'warn' | 'fail';

type ReadinessCard = {
  status: CardStatus;
  value: string;
  description: string;
};

type AiReadiness = {
  verdict: CardStatus;
  summary: string;
  cards: {
    availability: ReadinessCard;
    llm_txt: ReadinessCard;
    schema: ReadinessCard;
    faq: ReadinessCard;
    content: ReadinessCard;
  };
  details: {
    llm_txt_url: string;
    llm_txt_status: number;
    llm_txt_conflict_rule: string | null;
    llm_txt_conflict_agent: string | null;
    schema_types: string[];
    faq_signals: string[];
    headings: { h1: number; h2: number; h3: number };
    text_to_html_ratio: number;
    word_count: number;
    hidden_main_content: boolean;
  };
};

type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string;
};

type RobotsGroup = {
  userAgents: string[];
  rules: { directive: 'allow' | 'disallow'; value: string }[];
};

function deriveLlmCheckSummary(payload: LlmPayload) {
  const checks = payload?.checks;
  const browser = checks?.browser;

  if (!checks || !browser) {
    return {
      verdict: 'error',
      reasons: ['missing_checks'],
    };
  }

  const reasons: string[] = [];

  for (const [agentKey, snap] of Object.entries(checks)) {
    if (agentKey === 'browser' || !snap) continue;

    if (snap.http_code !== browser.http_code) reasons.push(`${agentKey}:http_code`);
    if (snap.text_len !== browser.text_len) reasons.push(`${agentKey}:text_len`);
    if (snap.links_count !== browser.links_count) reasons.push(`${agentKey}:links_count`);
    if (snap.has_h1 !== browser.has_h1) reasons.push(`${agentKey}:has_h1`);
    if (snap.has_title !== browser.has_title) reasons.push(`${agentKey}:has_title`);
    if ((snap.access_state || 'ok') !== (browser.access_state || 'ok')) {
      reasons.push(`${agentKey}:access_state`);
    }
  }

  return {
    verdict: reasons.length ? 'mismatch' : 'ok',
    reasons,
  };
}

async function fetchText(url: string): Promise<FetchTextResult> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      cache: 'no-store',
    });

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
    };
  } catch {
    return {
      ok: false,
      status: 0,
      text: '',
    };
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function countTag(html: string, tag: 'h1' | 'h2' | 'h3') {
  const matches = html.match(new RegExp(`<${tag}\\b`, 'gi'));
  return matches ? matches.length : 0;
}

function extractSchemaTypesFromNode(node: unknown, types: Set<string>) {
  if (!node) return;

  if (Array.isArray(node)) {
    node.forEach((item) => extractSchemaTypesFromNode(item, types));
    return;
  }

  if (typeof node !== 'object') return;

  const value = node as Record<string, unknown>;
  const typeValue = value['@type'];

  if (typeof typeValue === 'string') {
    types.add(typeValue);
  } else if (Array.isArray(typeValue)) {
    typeValue.forEach((item) => {
      if (typeof item === 'string') types.add(item);
    });
  }

  Object.values(value).forEach((child) => extractSchemaTypesFromNode(child, types));
}

function extractSchemaTypes(html: string) {
  const types = new Set<string>();
  const regex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(regex)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      extractSchemaTypesFromNode(JSON.parse(raw), types);
    } catch {
      continue;
    }
  }

  return Array.from(types);
}

function detectFaqSignals(html: string, schemaTypes: string[]) {
  const signals: string[] = [];

  if (schemaTypes.includes('FAQPage')) {
    signals.push('schema_faqpage');
  }

  if (/<details\b[^>]*>[\s\S]*?<summary\b/gi.test(html)) {
    signals.push('details_summary');
  }

  if (/class=["'][^"']*(faq|question|answer)[^"']*["']/gi.test(html)) {
    signals.push('faq_classes');
  }

  const h3ParagraphMatches = html.match(
    /<h3\b[^>]*>[\s\S]*?<\/h3>\s*<p\b[^>]*>[\s\S]*?<\/p>/gi
  );
  if ((h3ParagraphMatches?.length || 0) >= 2) {
    signals.push('h3_plus_p_pattern');
  }

  return signals;
}

function hasHiddenMainContent(html: string) {
  return /<(main|article|section|div)\b[^>]*(?:id|class)=["'][^"']*(content|main|article|post|entry)[^"']*["'][^>]*(?:style=["'][^"']*display\s*:\s*none[^"']*["']|hidden)/gi.test(
    html
  );
}

function isLlmTxtSyntaxOk(text: string) {
  const cleanedLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (!cleanedLines.length) return false;
  if (text.includes('\u0000')) return false;

  return cleanedLines.some(
    (line) =>
      /^https?:\/\//i.test(line) ||
      /^[A-Za-z][A-Za-z0-9 _-]{1,40}:/i.test(line) ||
      /^[-*]\s+/.test(line)
  );
}

function parseRobotsTxt(text: string) {
  const groups: RobotsGroup[] = [];
  let currentAgents: string[] = [];
  let currentRules: RobotsGroup['rules'] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#', 1)[0]?.trim();
    if (!line || !line.includes(':')) continue;

    const [fieldRaw, ...rest] = line.split(':');
    const field = fieldRaw.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (field === 'user-agent') {
      if (currentAgents.length) {
        groups.push({ userAgents: currentAgents, rules: currentRules });
        currentRules = [];
      }
      currentAgents = [...currentAgents, value.toLowerCase()];
      continue;
    }

    if ((field === 'allow' || field === 'disallow') && currentAgents.length) {
      currentRules.push({
        directive: field,
        value,
      });
    }
  }

  if (currentAgents.length) {
    groups.push({ userAgents: currentAgents, rules: currentRules });
  }

  return groups;
}

function chooseRobotsGroup(groups: RobotsGroup[], targetUserAgent: string) {
  let bestGroup: RobotsGroup | null = null;
  let bestAgent: string | null = null;
  let bestScore = -1;
  const target = targetUserAgent.toLowerCase();

  for (const group of groups) {
    for (const agent of group.userAgents) {
      let score = -1;

      if (agent === target) score = 100;
      else if (agent === '*') score = 1;
      else if (target.startsWith(agent)) score = agent.length;

      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
        bestAgent = agent;
      }
    }
  }

  return { group: bestGroup, agent: bestAgent };
}

function evaluateRobots(group: RobotsGroup | null, pageUrl: string) {
  if (!group) {
    return { allowed: true, matchedRule: null as string | null };
  }

  const parsed = new URL(pageUrl);
  const pagePath = parsed.pathname + parsed.search;
  let matchedRule: { directive: 'allow' | 'disallow'; value: string } | null = null;
  let matchedLength = -1;

  for (const rule of group.rules) {
    if (rule.directive === 'disallow' && rule.value === '') continue;
    if (!pagePath.startsWith(rule.value)) continue;

    if (rule.value.length > matchedLength) {
      matchedRule = rule;
      matchedLength = rule.value.length;
      continue;
    }

    if (
      rule.value.length === matchedLength &&
      matchedRule?.directive === 'disallow' &&
      rule.directive === 'allow'
    ) {
      matchedRule = rule;
    }
  }

  if (!matchedRule) {
    return { allowed: true, matchedRule: null as string | null };
  }

  return {
    allowed: matchedRule.directive !== 'disallow',
    matchedRule: `${matchedRule.directive}: ${matchedRule.value}`,
  };
}

function buildAvailabilityCard(payload: LlmPayload): ReadinessCard {
  const checks = payload.checks || {};
  const botEntries = Object.entries(checks).filter(([key]) => key !== 'browser');

  const blocked = botEntries.filter(([, snap]) => {
    const access = snap.access_state || 'ok';
    return snap.http_code !== 200 || access !== 'ok';
  });

  if (!blocked.length) {
    return {
      status: 'ok',
      value: 'OK',
      description: `Все AI-боты получают страницу: ${botEntries.length} из ${botEntries.length}.`,
    };
  }

  return {
    status: 'fail',
    value: `${blocked.length}`,
    description:
      blocked.length === 1
        ? 'Один AI-бот не получает страницу.'
        : `${blocked.length} AI-ботов не получают страницу.`,
  };
}

function buildLlmTxtCard(
  llmTxt: FetchTextResult,
  robotsConflict: { agent: string | null; rule: string | null }
): ReadinessCard {
  if (!llmTxt.ok || llmTxt.status === 404) {
    return {
      status: 'warn',
      value: 'Нет',
      description: 'Файл /llm.txt не найден.',
    };
  }

  if (robotsConflict.rule) {
    return {
      status: 'fail',
      value: 'Конфликт',
      description: `robots.txt блокирует ${robotsConflict.agent || 'AI-ботов'}: ${robotsConflict.rule}.`,
    };
  }

  if (!isLlmTxtSyntaxOk(llmTxt.text)) {
    return {
      status: 'warn',
      value: 'Пустой',
      description: 'Файл найден, но выглядит пустым или нечитаемым.',
    };
  }

  return {
    status: 'ok',
    value: 'Найден',
    description: 'Файл /llm.txt найден и выглядит корректно.',
  };
}

function buildSchemaCard(schemaTypes: string[]): ReadinessCard {
  if (!schemaTypes.length) {
    return {
      status: 'warn',
      value: 'Нет',
      description: 'JSON-LD разметка schema.org не найдена.',
    };
  }

  return {
    status: 'ok',
    value: schemaTypes.slice(0, 2).join(', '),
    description:
      schemaTypes.length > 2
        ? `Найдено ${schemaTypes.length} типов schema.org.`
        : 'Schema.org разметка найдена.',
  };
}

function buildFaqCard(signals: string[]): ReadinessCard {
  if (!signals.length) {
    return {
      status: 'warn',
      value: 'Нет',
      description: 'FAQ-структура на странице не найдена.',
    };
  }

  return {
    status: 'ok',
    value: 'Найдена',
    description: `Найдено сигналов FAQ: ${signals.length}.`,
  };
}

function buildContentCard(html: string, text: string): {
  card: ReadinessCard;
  details: AiReadiness['details'];
} {
  const h1 = countTag(html, 'h1');
  const h2 = countTag(html, 'h2');
  const h3 = countTag(html, 'h3');
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const textToHtmlRatio = html.length ? Number((text.length / html.length).toFixed(2)) : 0;
  const hiddenMainContent = hasHiddenMainContent(html);

  let card: ReadinessCard;

  if (hiddenMainContent || wordCount < 100 || textToHtmlRatio < 0.05) {
    card = {
      status: 'fail',
      value: 'Слабый',
      description: 'Контент недоступен для AI или его слишком мало.',
    };
  } else if (h1 < 1 || (h2 < 1 && h3 < 1) || wordCount < 300 || textToHtmlRatio < 0.2) {
    card = {
      status: 'warn',
      value: 'Есть риски',
      description: 'Контент читается, но структура или объём требуют доработки.',
    };
  } else {
    card = {
      status: 'ok',
      value: 'OK',
      description: 'Контент структурирован и читаем для AI-систем.',
    };
  }

  return {
    card,
    details: {
      llm_txt_url: '',
      llm_txt_status: 0,
      llm_txt_conflict_rule: null,
      llm_txt_conflict_agent: null,
      schema_types: [],
      faq_signals: [],
      headings: { h1, h2, h3 },
      text_to_html_ratio: textToHtmlRatio,
      word_count: wordCount,
      hidden_main_content: hiddenMainContent,
    },
  };
}

async function buildAiReadiness(payload: LlmPayload): Promise<AiReadiness> {
  const page = await fetchText(payload.url);
  const html = page.text || '';
  const text = stripHtml(html);
  const schemaTypes = extractSchemaTypes(html);
  const faqSignals = detectFaqSignals(html, schemaTypes);
  const { card: contentCard, details } = buildContentCard(html, text);

  const siteRoot = (() => {
    try {
      const parsed = new URL(payload.url);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return '';
    }
  })();

  const llmTxtUrl = siteRoot ? `${siteRoot}/llm.txt` : '';
  const robotsUrl = siteRoot ? `${siteRoot}/robots.txt` : '';
  const [llmTxt, robotsTxt] = await Promise.all([
    llmTxtUrl ? fetchText(llmTxtUrl) : Promise.resolve({ ok: false, status: 0, text: '' }),
    robotsUrl ? fetchText(robotsUrl) : Promise.resolve({ ok: false, status: 0, text: '' }),
  ]);

  let robotsConflict = { agent: null as string | null, rule: null as string | null };
  if (robotsTxt.ok && robotsTxt.text) {
    const groups = parseRobotsTxt(robotsTxt.text);

    for (const token of llmAgentTokens) {
      const chosen = chooseRobotsGroup(groups, token);
      const evaluated = evaluateRobots(chosen.group, payload.url);
      if (!evaluated.allowed) {
        robotsConflict = {
          agent: chosen.agent || token,
          rule: evaluated.matchedRule,
        };
        break;
      }
    }
  }

  const availabilityCard = buildAvailabilityCard(payload);
  const llmTxtCard = buildLlmTxtCard(llmTxt, robotsConflict);
  const schemaCard = buildSchemaCard(schemaTypes);
  const faqCard = buildFaqCard(faqSignals);

  const cards = {
    availability: availabilityCard,
    llm_txt: llmTxtCard,
    schema: schemaCard,
    faq: faqCard,
    content: contentCard,
  };

  const hasFail = Object.values(cards).some((card) => card.status === 'fail');
  const hasWarn = Object.values(cards).some((card) => card.status === 'warn');

  return {
    verdict: hasFail ? 'fail' : hasWarn ? 'warn' : 'ok',
    summary:
      hasFail || hasWarn
        ? 'Есть проблемы с AI-готовностью'
        : 'Страница готова к AI-поиску',
    cards,
    details: {
      ...details,
      llm_txt_url: llmTxtUrl,
      llm_txt_status: llmTxt.status,
      llm_txt_conflict_rule: robotsConflict.rule,
      llm_txt_conflict_agent: robotsConflict.agent,
      schema_types: schemaTypes,
      faq_signals: faqSignals,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      url?: string;
      a1?: string;
      a2?: string;
      a3?: string;
    };
    const url = (body.url || '').trim();
    const a1 = (body.a1 || defaultAgents[0]).trim();
    const a2 = (body.a2 || defaultAgents[1]).trim();
    const a3 = (body.a3 || defaultAgents[2]).trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: 'Неверный URL' }, { status: 400 });
    }

    const baseEngine = process.env.PY_LLM_ENGINE_URL || process.env.PY_ENGINE_URL;
    if (!baseEngine) {
      return NextResponse.json({ ok: false, error: 'PY_ENGINE_URL не задан' }, { status: 500 });
    }

    const engineUrl = baseEngine.includes('llm_check.py')
      ? baseEngine
      : baseEngine.replace('check.py', 'llm_check.py');

    const query = new URLSearchParams({ url, a1, a2, a3 });
    const target = engineUrl.includes('?')
      ? `${engineUrl}&${query.toString()}`
      : `${engineUrl}?${query.toString()}`;

    const upstream = await fetch(target, { method: 'GET' });
    const raw = await upstream.text();
    const contentType = upstream.headers.get('content-type') || '';

    let payloadForLog: Record<string, unknown> = { status: upstream.status };
    let verdict: string | null = null;
    let reasons: string[] | null = null;

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LlmPayload;
        parsed.ai_readiness = await buildAiReadiness(parsed);
        payloadForLog = parsed;

        const summary = deriveLlmCheckSummary(parsed);
        verdict = summary.verdict;
        reasons = summary.reasons;

        try {
          const db = ensureDb();
          const user = await getUser();
          const userWithTeam = user ? await getUserWithTeam(user.id) : null;
          const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
          const userAgent = req.headers.get('user-agent') || null;

          await db.insert(llmChecks).values({
            teamId: userWithTeam?.teamId || null,
            userId: user?.id || null,
            url,
            verdict,
            reasons,
            details: payloadForLog,
            ipAddress: ip,
            userAgent,
          });
        } catch {
          // ignore db logging errors
        }

        if (contentType.includes('application/json')) {
          return NextResponse.json(parsed, { status: upstream.status || 502 });
        }
      } catch {
        payloadForLog = {
          status: upstream.status,
          raw: raw.length > 10000 ? `${raw.slice(0, 10000)}...` : raw,
        };
        verdict = 'error';
        reasons = ['invalid_json'];
      }
    } else {
      payloadForLog = { status: upstream.status, raw: '' };
      verdict = 'error';
      reasons = ['empty_response'];
    }

    try {
      const db = ensureDb();
      const user = await getUser();
      const userWithTeam = user ? await getUserWithTeam(user.id) : null;
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const userAgent = req.headers.get('user-agent') || null;

      await db.insert(llmChecks).values({
        teamId: userWithTeam?.teamId || null,
        userId: user?.id || null,
        url,
        verdict,
        reasons,
        details: payloadForLog,
        ipAddress: ip,
        userAgent,
      });
    } catch {
      // ignore db logging errors
    }

    if (!raw) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Пустой ответ от сервиса',
          status: upstream.status || 502,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: `Ошибка сервиса (${upstream.status || 502})`,
        status: upstream.status || 502,
        raw: raw.slice(0, 500),
      },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
