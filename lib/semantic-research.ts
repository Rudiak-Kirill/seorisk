import { URL } from 'node:url';
import { buildDefaultContentPlanBrief, type ContentPlanBrief } from '@/lib/content-plan-brief';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const LLM_RELAY_URL = (process.env.LLM_RELAY_URL || '').replace(/\/+$/, '');
const LLM_RELAY_SECRET = process.env.LLM_RELAY_SECRET || '';
const WORDSTAT_TOKEN = process.env.WORDSTAT_TOKEN || '';
const WORDSTAT_BASE_URL = 'https://api.wordstat.yandex.net';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const WORDSTAT_SEED_LIMIT = 20;
const WORDSTAT_CONCURRENCY = 1;
const WORDSTAT_DELAY_MS = 400;
const WORDSTAT_RETRY_DELAYS_MS = [2000, 5000] as const;
const WORDSTAT_REGION_IDS = [225] as const;
const WORDSTAT_NUM_PHRASES = 50;

const STOP_WORDS = [
  'скачать',
  'торрент',
  'crack',
  'вакансия',
  'работа',
  'wikipedia',
  'бесплатно',
  'реферат',
];

const COMPETITOR_BRANDS = [
  'topvisor',
  'serpstat',
  'ahrefs',
  'semrush',
  'rush analytics',
  'pr-cy',
];

const RUSSIAN_STOPWORDS = new Set([
  'и',
  'в',
  'во',
  'на',
  'по',
  'для',
  'как',
  'что',
  'это',
  'или',
  'из',
  'с',
  'со',
  'от',
  'до',
  'к',
  'у',
  'за',
  'под',
  'над',
  'не',
  'нет',
  'ли',
  'а',
  'но',
  'же',
  'при',
  'про',
  'после',
  'если',
  'то',
  'где',
  'когда',
  'почему',
  'зачем',
  'бы',
]);

export type ResearchPageContext = {
  url: string;
  finalUrl: string;
  title: string;
  h1: string;
  description: string;
  faq: Array<{ question: string; answer: string }>;
  mainText: string;
  textExcerpt: string;
};

export type SeedGenerationResult = {
  queries: string[];
  raw: unknown;
  source: 'relay' | 'fallback';
};

export type CleanupSuggestion = {
  queryId: string;
  status: 'danger' | 'warn' | 'neutral';
  reason: string;
};

export type QueryClassificationItem = {
  query: string;
  relevance: number;
  type: 'instrumental' | 'symptom' | 'technical' | 'informational';
  destination: 'tool' | 'blog' | 'unclear' | 'deleted';
  reason: string | null;
};

export type ClusterDraft = {
  id: string;
  mainQuery: string;
  totalFrequency: number;
  queriesCount: number;
  queryIds: string[];
};

export type ContentPlanDraft = {
  clusterId: string | null;
  sourceUrl: string;
  targetUrl: string;
  contentType: 'tool_page' | 'blog_article';
  title: string;
  metaDescription: string;
  mainQuery: string;
  secondaryQueries: string[];
  generationSettings: ContentPlanBrief['generationSettings'];
  requiredBlocks: string[];
  articleOutline: string[];
  faqItems: string[];
  schemaTypes: string[];
  linkingHints: string[];
  notesForLlm: string;
};

type RelayArticleResponse = {
  title: string;
  meta_description: string;
  article_markdown: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value: string) {
  return normalizeWhitespace(
    value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
  );
}

function stripHtml(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function stripLayoutBlocks(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
}

function extractTagText(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeHtmlEntities(stripHtml(match?.[1] || ''));
}

function extractMetaContent(html: string, attr: 'name' | 'property', value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`<meta\\b[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["'][^>]*>`, 'i');
  return decodeHtmlEntities(html.match(direct)?.[1] || html.match(reverse)?.[1] || '');
}

function pickMainText(html: string) {
  const mainMatch =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    html.match(/<div\b[^>]*(class|id)=["'][^"']*(content|entry|article-body|post-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[3] ||
    stripLayoutBlocks(html);

  return stripHtml(mainMatch || html);
}

function extractFaqPairs(html: string) {
  const pairs: Array<{ question: string; answer: string }> = [];

  for (const match of html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi)) {
    const question = decodeHtmlEntities(
      stripHtml(match[1].match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1] || '')
    );
    const answer = decodeHtmlEntities(
      stripHtml(match[1].replace(/<summary\b[^>]*>[\s\S]*?<\/summary>/i, ''))
    );
    if (question && answer) {
      pairs.push({ question, answer });
    }
  }

  const jsonLdFaqMatches = Array.from(
    html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );
  for (const match of jsonLdFaqMatches) {
    try {
      const parsed = JSON.parse(match[1] || '');
      collectFaqEntities(parsed, pairs);
    } catch {
      continue;
    }
  }

  return pairs.slice(0, 12);
}

function collectFaqEntities(value: unknown, target: Array<{ question: string; answer: string }>) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectFaqEntities(item, target));
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const typeValue = record['@type'];
  const types = Array.isArray(typeValue) ? typeValue : [typeValue];
  const isFaqQuestion = types.some((item) => typeof item === 'string' && /question/i.test(item));
  if (isFaqQuestion) {
    const question = normalizeWhitespace(String(record.name || ''));
    const answerValue = record.acceptedAnswer;
    const answer =
      typeof answerValue === 'string'
        ? normalizeWhitespace(answerValue)
        : normalizeWhitespace(
            String(
              (answerValue as Record<string, unknown> | undefined)?.text ||
                (answerValue as Record<string, unknown> | undefined)?.['@value'] ||
                ''
            )
          );
    if (question && answer && !target.some((item) => item.question === question)) {
      target.push({ question, answer });
    }
  }

  Object.values(record).forEach((item) => collectFaqEntities(item, target));
}

async function fetchHtml(url: string) {
  const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(normalized, {
      cache: 'no-store',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    return {
      html: await response.text(),
      finalUrl: response.url || normalized,
      status: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function extractResearchContext(url: string): Promise<ResearchPageContext> {
  const { html, finalUrl } = await fetchHtml(url);
  const title = extractTagText(html, 'title');
  const h1 = extractTagText(html, 'h1');
  const description = extractMetaContent(html, 'name', 'description');
  const faq = extractFaqPairs(html);
  const mainText = pickMainText(html);
  const textExcerpt = normalizeWhitespace(mainText).slice(0, 5000);

  return {
    url,
    finalUrl,
    title,
    h1,
    description,
    faq,
    mainText,
    textExcerpt,
  };
}

async function callRelayJson<T>(path: string, payload: Record<string, unknown>): Promise<T | null> {
  if (!LLM_RELAY_URL || !LLM_RELAY_SECRET) return null;

  try {
    const response = await fetch(`${LLM_RELAY_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-relay-secret': LLM_RELAY_SECRET,
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const text = await response.text();
    if (!response.ok || !text) return null;

    const parsed = JSON.parse(text) as { ok?: boolean; data?: T };
    return parsed?.ok ? parsed.data || null : null;
  } catch {
    return null;
  }
}

const TOOL_SEED_PRESETS: Record<string, string[]> = {
  'subdomain-check': [
    'поддомены сайта',
    'проверка поддоменов',
    'проверить поддомены',
    'проверить поддомены сайта',
    'найти поддомены',
    'найти поддомены сайта',
    'узнать поддомены сайта',
    'посмотреть поддомены сайта',
    'все поддомены сайта',
    'список поддоменов',
    'открытые поддомены',
    'тестовые поддомены',
    'dev поддомены',
    'test поддомены',
    'stage поддомены',
    'региональные поддомены',
    'robots txt поддоменов',
    'редиректы поддоменов',
    'дубли контента поддоменов',
    'индексация поддоменов',
  ],
  'ssr-check': [
    'проверить рендеринг сайта',
    'проверить ssr сайта',
    'как googlebot видит страницу',
    'проверить html для бота',
    'react не индексируется',
    'next js seo проверка',
    'csr проблемы seo',
    'бот не видит контент',
    'проверка рендера страницы',
    'проверить серверный рендеринг',
  ],
  'llm-check': [
    'проверить gptbot',
    'доступность для gptbot',
    'доступность для ai ботов',
    'страница закрыта для ai',
    'как ai бот видит страницу',
    'проверить chatgpt bot',
    'проверить ai ботов',
    'сайт закрыт для chatgpt',
  ],
  'index-check': [
    'проверить индексацию страницы',
    'проверить возможность индексации',
    'страница закрыта от индексации',
    'robots txt блокирует страницу',
    'canonical настроен неправильно',
    'почему страница не индексируется',
    'проверить robots txt страницы',
    'проверить canonical страницы',
  ],
  'speed-check': [
    'проверить скорость сайта',
    'проверить скорость страницы',
    'скорость загрузки сайта',
    'скорость загрузки страницы',
    'низкий pagespeed mobile',
    'медленный сайт на мобильных',
    'проверить ttfb сайта',
    'проверить pagespeed сайта',
  ],
  'site-profile': [
    'профиль сайта',
    'структура сайта',
    'структура sitemap сайта',
    'определить тип сайта',
    'проверить икс сайта',
    'определить cms сайта',
    'анализ структуры сайта',
    'анализ sitemap сайта',
  ],
  'content-check': [
    'проверка контента страницы',
    'аудит контента страницы',
    'проверить контент страницы',
    'проверить страницу на seo',
    'проверить страницу товара',
    'проверить страницу каталога',
    'проверить статью на seo',
    'контент аудит страницы',
  ],
  'ru-access-check': [
    'проверить доступность сайта из рф',
    'проверить сайт из россии',
    'сайт недоступен из россии',
    'проверить реестр ркн',
    'сайт заблокирован в россии',
    'доступ к сайту из рф',
    'проверить блокировку сайта',
    'проверить доступ из рф',
  ],
  compare: [
    'сравнить сайт с конкурентами',
    'сравнение сайта с конкурентами',
    'seo сравнение конкурентов',
    'сравнить показатели сайта',
    'анализ конкурентов сайта',
    'сравнить сайт по seo',
  ],
};

function getToolSlug(context: ResearchPageContext) {
  const candidates = [context.url, context.finalUrl];

  for (const candidate of candidates) {
    try {
      const pathname = new URL(candidate).pathname;
      const match = pathname.match(/\/tools\/([^/]+)/i);
      if (match?.[1]) return match[1].toLowerCase();
    } catch {
      continue;
    }
  }

  return '';
}

function normalizeSeedPhrase(value: string) {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/[–—/]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
      .replace(/\bseorisk\b/giu, ' ')
      .replace(/\b(?:site|tool|checker|check)\b/giu, ' ')
      .replace(/\bru\b/giu, ' ')
      .replace(/^проверьте\s+/u, 'проверить ')
      .replace(/^найдите\s+/u, 'найти ')
      .replace(/^проверить\s+проверить\s+/u, 'проверить ')
  );
}

const GENERIC_SEED_TOKEN_STEMS = new Set([
  'провер',
  'найт',
  'узнат',
  'посмотр',
  'спис',
  'все',
  'весь',
  'сайт',
  'страниц',
  'главн',
  'регион',
  'региональ',
  'открыт',
]);

function normalizeComparableToken(value: string) {
  return normalizeSeedPhrase(value)
    .replace(/(?:иями|ями|ами|ов|ев|ей|ий|ый|ой|ое|ее|ая|яя|ые|ие|ым|им|ом|ем|ую|юю|ых|их|ах|ях|ам|ям|ов|ев|а|я|ы|и|у|ю|е|о)$/u, '')
    .replace(/ь$/u, '');
}

function extractComparableTokens(value: string) {
  return normalizeSeedPhrase(value)
    .split(/\s+/)
    .map((item) => normalizeComparableToken(item.trim()))
    .filter(
      (item) =>
        item.length >= 4 &&
        !RUSSIAN_STOPWORDS.has(item) &&
        !/^(?:проверить|проверка|найти|сайт|сайта|страница|страницы)$/u.test(item)
    );
}

function extractSeedAnchorTokens(value: string) {
  const tokens = extractComparableTokens(value);
  const anchors = tokens.filter((item) => !GENERIC_SEED_TOKEN_STEMS.has(item));
  return anchors.length ? anchors : tokens;
}

function hasTokenOverlap(seed: string, candidate: string) {
  const seedTokens = extractSeedAnchorTokens(seed);
  const candidateTokens = extractComparableTokens(candidate);
  if (!seedTokens.length || !candidateTokens.length) return false;

  return seedTokens.some((seedToken) =>
    candidateTokens.some(
      (candidateToken) =>
        seedToken === candidateToken ||
        seedToken.startsWith(candidateToken) ||
        candidateToken.startsWith(seedToken)
    )
  );
}

function isUsefulSeedPhrase(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 6) return false;
  if (/^(?:найти|проверить|проверка)$/u.test(value)) return false;
  if (/\b(?:subdomain|site|tool)\b/i.test(value)) return false;
  if (/(?:^|\s)(?:найти|проверить)$/u.test(value)) return false;
  if (/^проверить\s+проверка(?:\s|$)/u.test(value)) return false;
  if (/(?:^|\s)(?:сайта|страницы)\s+(?:найти|проверить)(?:\s|$)/u.test(value)) return false;
  if (/(?:^|\s)проверить\s+поддоменов(?:\s|$)/u.test(value)) return false;
  return true;
}

function buildPresetSeedQueries(slug: string) {
  return dedupeQueries((TOOL_SEED_PRESETS[slug] || []).map(normalizeSeedPhrase).filter(isUsefulSeedPhrase));
}

export function buildFallbackSeedQueries(context: ResearchPageContext) {
  const phrases = new Set<string>();
  const excerpt = context.textExcerpt.toLowerCase();
  const slug = getToolSlug(context);
  const presetSeeds = buildPresetSeedQueries(slug);

  for (const preset of presetSeeds) {
    phrases.add(preset);
  }

  const titleRoot = normalizeSeedPhrase(context.title.split('|')[0] || '');
  const h1Root = normalizeSeedPhrase(context.h1 || '');
  const descriptionFragments = context.description
    .split(/[.!?;,:]/)
    .map((item) => normalizeSeedPhrase(item))
    .filter(Boolean);
  const faqRoots = context.faq.map((item) => normalizeSeedPhrase(item.question));

  const base = [titleRoot, h1Root, ...descriptionFragments, ...faqRoots]
    .filter(Boolean)
    .join(' ');

  if (!presetSeeds.length) {
    for (const phrase of extractNgrams(base, 2, 4).slice(0, 30)) {
      const normalized = normalizeSeedPhrase(phrase);
      if (!isUsefulSeedPhrase(normalized)) continue;
      phrases.add(normalized);

      const words = normalized.split(/\s+/).filter(Boolean);
      if (words.length <= 4 && !/^провер(ить|ка)(?:\s|$)/u.test(normalized)) {
        phrases.add(`проверить ${normalized}`);
      }
    }
  }

  if (/react|next\.?js|csr|ssr/i.test(excerpt)) {
    ['react индексация', 'next js seo', 'csr seo проблемы', 'проверка рендера сайта'].forEach(
      (item) => phrases.add(item)
    );
  }

  if (/индексац|googlebot|бот/i.test(excerpt)) {
    [
      'сайт не индексируется',
      'как видит googlebot',
      'проверить индексацию страницы',
      'бот не видит контент сайта',
      'упал трафик после редизайна',
    ].forEach((item) => phrases.add(item));
  }

  return dedupeQueries(
    Array.from(phrases).map(normalizeSeedPhrase).filter(isUsefulSeedPhrase)
  ).slice(0, 60);
}

export async function generateSeedQueries(context: ResearchPageContext): Promise<SeedGenerationResult> {
  const slug = getToolSlug(context);
  const presetSeeds = buildPresetSeedQueries(slug);

  if (presetSeeds.length) {
    return {
      queries: presetSeeds,
      raw: { strategy: 'preset', slug },
      source: 'fallback',
    };
  }

  const relayResult = await callRelayJson<{ queries?: string[]; raw?: unknown }>(
    '/api/semantic/seeds',
    {
      title: context.title,
      h1: context.h1,
      description: context.description,
      faq: context.faq,
      text_excerpt: context.textExcerpt,
    }
  );

  if (relayResult?.queries?.length) {
    return {
      queries: dedupeQueries(
        relayResult.queries.map(normalizeSeedPhrase).filter(isUsefulSeedPhrase)
      ),
      raw: relayResult.raw || relayResult,
      source: 'relay',
    };
  }

  return {
    queries: buildFallbackSeedQueries(context),
    raw: null,
    source: 'fallback',
  };
}

function dedupeQueries(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeWhitespace(value).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function extractNgrams(text: string, minWords: number, maxWords: number) {
  const tokens = text
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && !RUSSIAN_STOPWORDS.has(item));
  const phrases: string[] = [];

  for (let size = minWords; size <= maxWords; size += 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phrase = tokens.slice(index, index + size).join(' ');
      if (phrase.length >= 8) phrases.push(phrase);
    }
  }

  return Array.from(new Set(phrases));
}

function chunk<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithConcurrency<T, R>(
  values: T[],
  limit: number,
  task: (value: T) => Promise<R>
) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const current = values[cursor];
      cursor += 1;
      results.push(await task(current));
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return results;
}

type WordstatCallResult = {
  requestPhrase: string | null;
  totalCount: number;
  topRequests: Array<{ query: string; frequency: number }>;
  associations: Array<{ query: string; frequency: number }>;
  quotaLimited: boolean;
  authError: boolean;
};

function extractWordstatEntries(raw: unknown, bucket: 'topRequests' | 'associations') {
  if (!raw || typeof raw !== 'object') return [];

  const items = (raw as Record<string, unknown>)[bucket];
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const phrase =
        typeof record.phrase === 'string'
          ? record.phrase
          : typeof record.query === 'string'
            ? record.query
            : null;
      const count =
        typeof record.count === 'number'
          ? record.count
          : typeof record.frequency === 'number'
            ? record.frequency
            : typeof record.shows === 'number'
              ? record.shows
              : 0;

      if (!phrase) return null;
      return {
        query: normalizeWhitespace(phrase),
        frequency: count || 0,
      };
    })
    .filter((item): item is { query: string; frequency: number } => Boolean(item));
}

async function callWordstat(phrase: string): Promise<WordstatCallResult> {
  if (!WORDSTAT_TOKEN) {
    return {
      requestPhrase: null,
      totalCount: 0,
      topRequests: [],
      associations: [],
      quotaLimited: false,
      authError: false,
    };
  }

  let quotaLimited = false;
  const payload = {
    phrase,
    regions: [...WORDSTAT_REGION_IDS],
    numPhrases: WORDSTAT_NUM_PHRASES,
  };

  for (let attempt = 0; attempt <= WORDSTAT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(`${WORDSTAT_BASE_URL}/v1/topRequests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WORDSTAT_TOKEN}`,
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });

      if (response.status === 401 || response.status === 403) {
        return {
          requestPhrase: null,
          totalCount: 0,
          topRequests: [],
          associations: [],
          quotaLimited: false,
          authError: true,
        };
      }

      if (response.status === 429 || response.status === 503) {
        quotaLimited = true;
        if (attempt < WORDSTAT_RETRY_DELAYS_MS.length) {
          await delay(WORDSTAT_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return {
          requestPhrase: null,
          totalCount: 0,
          topRequests: [],
          associations: [],
          quotaLimited: true,
          authError: false,
        };
      }

      if (!response.ok) {
        return {
          requestPhrase: null,
          totalCount: 0,
          topRequests: [],
          associations: [],
          quotaLimited: false,
          authError: false,
        };
      }

      const json = (await response.json()) as unknown;
      const requestPhrase =
        json && typeof json === 'object' && typeof (json as Record<string, unknown>).requestPhrase === 'string'
          ? normalizeWhitespace((json as Record<string, unknown>).requestPhrase as string)
          : null;
      const totalCount =
        json && typeof json === 'object' && typeof (json as Record<string, unknown>).totalCount === 'number'
          ? ((json as Record<string, unknown>).totalCount as number)
          : 0;
      return {
        requestPhrase,
        totalCount,
        topRequests: extractWordstatEntries(json, 'topRequests'),
        associations: extractWordstatEntries(json, 'associations'),
        quotaLimited,
        authError: false,
      };
    } catch {
      return {
        requestPhrase: null,
        totalCount: 0,
        topRequests: [],
        associations: [],
        quotaLimited,
        authError: false,
      };
    }
  }

  return {
    requestPhrase: null,
    totalCount: 0,
    topRequests: [],
    associations: [],
    quotaLimited,
    authError: false,
  };
}

export async function expandQueriesWithWordstat(seedQueries: string[]) {
  if (!WORDSTAT_TOKEN || !seedQueries.length) {
    return {
      items: [] as Array<{ query: string; frequency: number; source: 'wordstat' }>,
      seedFrequencies: [] as Array<{ query: string; frequency: number }>,
      status: WORDSTAT_TOKEN ? 'ok' : 'token_missing',
      processedSeeds: 0,
      seedLimit: WORDSTAT_SEED_LIMIT,
      sourceCount: 1,
    };
  }

  const limitedSeeds = seedQueries.slice(0, WORDSTAT_SEED_LIMIT);
  let quotaLimited = false;
  let authError = false;

  const results = await runWithConcurrency(limitedSeeds, WORDSTAT_CONCURRENCY, async (seed) => {
    const wordstat = await callWordstat(seed);
    quotaLimited = quotaLimited || wordstat.quotaLimited;
    authError = authError || wordstat.authError;

    return {
      seedFrequency:
        wordstat.requestPhrase && wordstat.totalCount > 0
          ? {
              query: wordstat.requestPhrase,
              frequency: wordstat.totalCount,
            }
          : null,
      topRequests: wordstat.topRequests
        .filter(
          (item) =>
            normalizeSeedPhrase(item.query) !== normalizeSeedPhrase(seed) && hasTokenOverlap(seed, item.query)
        )
        .map((item) => ({ ...item, source: 'wordstat' as const })),
    };
  });

  const deduped = new Map<string, { query: string; frequency: number; source: 'wordstat' }>();
  const seedFrequencies = new Map<string, { query: string; frequency: number }>();
  for (const result of results) {
    if (result.seedFrequency) {
      seedFrequencies.set(result.seedFrequency.query.toLowerCase(), result.seedFrequency);
    }
    for (const item of result.topRequests) {
      const key = item.query.toLowerCase();
      const current = deduped.get(key);
      if (!current || item.frequency > current.frequency) {
        deduped.set(key, item);
      }
    }
  }

  return {
    items: Array.from(deduped.values()),
    seedFrequencies: Array.from(seedFrequencies.values()),
    status: authError ? 'auth_error' : quotaLimited ? 'quota_limited' : 'ok',
    processedSeeds: limitedSeeds.length,
    seedLimit: WORDSTAT_SEED_LIMIT,
    sourceCount: 1,
  };
}

export function buildCleanupSuggestions(queryRows: Array<{ id: string; query: string; frequency: number }>) {
  return queryRows.map<CleanupSuggestion>((row) => {
    const query = row.query.toLowerCase();
    const words = query.split(/\s+/).filter(Boolean);

    if (row.frequency < 10) {
      return { queryId: row.id, status: 'danger', reason: 'Частотность ниже 10/мес.' };
    }

    if (STOP_WORDS.some((word) => query.includes(word))) {
      return { queryId: row.id, status: 'danger', reason: 'Содержит стоп-слово или мусорный интент.' };
    }

    if (words.length > 7) {
      return { queryId: row.id, status: 'danger', reason: 'Слишком длинный запрос для семантики.' };
    }

    if (/\b(?:v?\d+(?:\.\d+){1,3}|202\d|203\d)\b/.test(query) && !/44-фз|окпд|оквэд|seo|бот|google|яндекс/i.test(query)) {
      return { queryId: row.id, status: 'danger', reason: 'Есть версия/год без понятного SEO-контекста.' };
    }

    if (row.frequency > 50000) {
      return { queryId: row.id, status: 'warn', reason: 'Слишком общий запрос с высокой частотностью.' };
    }

    if (COMPETITOR_BRANDS.some((brand) => query.includes(brand))) {
      return { queryId: row.id, status: 'warn', reason: 'Есть бренд конкурента.' };
    }

    if (/[a-z]{4,}/i.test(query) && !/seo|ssr|csr|bot|render|react|next|google|index/i.test(query)) {
      return { queryId: row.id, status: 'warn', reason: 'Английский запрос — проверь интент вручную.' };
    }

    return { queryId: row.id, status: 'neutral', reason: 'Нейтральный запрос.' };
  });
}

export async function classifyQueries(
  context: Pick<ResearchPageContext, 'title' | 'description'>,
  items: Array<{ query: string; frequency: number }>
) {
  const batches = chunk(items, 50);
  const relayResults = await runWithConcurrency(batches, 3, async (batch) =>
    callRelayJson<{ items?: QueryClassificationItem[] }>('/api/semantic/classify', {
      title: context.title,
      description: context.description,
      queries: batch,
    })
  );

  const relayItems = relayResults.flatMap((item) => item?.items || []);
  if (relayItems.length) {
    return relayItems;
  }

  return items.map<QueryClassificationItem>((item) => classifyFallback(item.query));
}

function classifyFallback(query: string): QueryClassificationItem {
  const lower = query.toLowerCase();
  let type: QueryClassificationItem['type'] = 'informational';
  let destination: QueryClassificationItem['destination'] = 'blog';
  let relevance = 6;
  let reason: string | null = null;

  if (/проверить|чекер|симулятор|анализатор|проверка|tool|checker/i.test(lower)) {
    type = 'instrumental';
    destination = 'tool';
    relevance = 9;
  } else if (/ошибка|не индекс|не открыва|не работает|упал|404|500|бот/i.test(lower)) {
    type = 'symptom';
    destination = 'blog';
    relevance = 8;
  } else if (/react|next|csr|ssr|canonical|robots|schema|googlebot|llms\.txt/i.test(lower)) {
    type = 'technical';
    destination = 'blog';
    relevance = 8;
  }

  if (STOP_WORDS.some((word) => lower.includes(word))) {
    destination = 'deleted';
    relevance = 1;
    reason = 'Мусорный интент.';
  }

  return { query, relevance, type, destination, reason };
}

function tokenizeQuery(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 2 && !RUSSIAN_STOPWORDS.has(item));
}

function similarity(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = Array.from(leftSet).filter((item) => rightSet.has(item)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union ? intersection / union : 0;
}

export function clusterBlogQueries(
  items: Array<{ id: string; query: string; frequency: number }>
) {
  const sorted = [...items].sort((left, right) => right.frequency - left.frequency);
  const clustersDraft: ClusterDraft[] = [];

  for (const item of sorted) {
    const tokens = tokenizeQuery(item.query);
    let target = clustersDraft.find((cluster) => {
      const clusterTokens = tokenizeQuery(cluster.mainQuery);
      return similarity(tokens, clusterTokens) >= 0.5;
    });

    if (!target) {
      target = {
        id: crypto.randomUUID(),
        mainQuery: item.query,
        totalFrequency: 0,
        queriesCount: 0,
        queryIds: [],
      };
      clustersDraft.push(target);
    }

    target.queryIds.push(item.id);
    target.totalFrequency += item.frequency || 0;
    target.queriesCount += 1;
    if ((item.frequency || 0) > target.totalFrequency / Math.max(target.queriesCount, 1)) {
      target.mainQuery = item.query;
    }
  }

  return clustersDraft.sort((left, right) => right.totalFrequency - left.totalFrequency);
}

const TRANSLIT_MAP: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'j',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'cz',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function slugifyQuery(value: string) {
  const transliterated = value
    .toLowerCase()
    .split('')
    .map((char) => TRANSLIT_MAP[char] ?? char)
    .join('');

  return transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function buildDraftTitle(mainQuery: string, contentType: 'tool_page' | 'blog_article') {
  const normalized = mainQuery.charAt(0).toUpperCase() + mainQuery.slice(1);
  return contentType === 'tool_page'
    ? `${normalized} — проверка и решение`
    : `${normalized}: что проверить и как исправить`;
}

function buildDraftDescription(mainQuery: string, contentType: 'tool_page' | 'blog_article') {
  return contentType === 'tool_page'
    ? `Проверьте запрос «${mainQuery}» через инструмент SEORISK и найдите причину проблемы.`
    : `Разбираем запрос «${mainQuery}»: причины, диагностика и пошаговые действия.`;
}

export function buildContentPlanDrafts(params: {
  researchId: string;
  researchUrl: string;
  toolMainQuery: string | null;
  toolSecondaryQueries: string[];
  clusters: Array<{ id: string; mainQuery: string; totalFrequency: number }>;
  clusterQueriesById: Record<string, string[]>;
}) {
  const items: ContentPlanDraft[] = [];
  const toolQuery = params.toolMainQuery || 'seo инструмент';
  const toolBrief = buildDefaultContentPlanBrief('tool_page', {
    secondaryQueries: params.toolSecondaryQueries,
    linkingHints: [params.researchUrl],
  });

  items.push({
    clusterId: null,
    sourceUrl: params.researchUrl,
    targetUrl: new URL(params.researchUrl).pathname || params.researchUrl,
    contentType: 'tool_page',
    title: buildDraftTitle(toolQuery, 'tool_page'),
    metaDescription: buildDraftDescription(toolQuery, 'tool_page'),
    mainQuery: toolQuery,
    secondaryQueries: toolBrief.secondaryQueries,
    generationSettings: toolBrief.generationSettings,
    requiredBlocks: toolBrief.requiredBlocks,
    articleOutline: toolBrief.articleOutline,
    faqItems: toolBrief.faqItems,
    schemaTypes: toolBrief.schemaTypes,
    linkingHints: toolBrief.linkingHints,
    notesForLlm: toolBrief.notesForLlm,
  });

  for (const cluster of params.clusters) {
    const slug = slugifyQuery(cluster.mainQuery);
    const blogBrief = buildDefaultContentPlanBrief('blog_article', {
      secondaryQueries: params.clusterQueriesById[cluster.id] || [],
      linkingHints: [params.researchUrl],
    });
    items.push({
      clusterId: cluster.id,
      sourceUrl: params.researchUrl,
      targetUrl: `/blog/${slug}/`,
      contentType: 'blog_article',
      title: buildDraftTitle(cluster.mainQuery, 'blog_article'),
      metaDescription: buildDraftDescription(cluster.mainQuery, 'blog_article'),
      mainQuery: cluster.mainQuery,
      secondaryQueries: blogBrief.secondaryQueries,
      generationSettings: blogBrief.generationSettings,
      requiredBlocks: blogBrief.requiredBlocks,
      articleOutline: blogBrief.articleOutline,
      faqItems: blogBrief.faqItems,
      schemaTypes: blogBrief.schemaTypes,
      linkingHints: blogBrief.linkingHints,
      notesForLlm: blogBrief.notesForLlm,
    });
  }

  return items;
}

export async function generateArticleDraft(input: {
  title: string;
  mainQuery: string;
  metaDescription: string;
  sourceUrl: string;
  clusterQueries: string[];
  secondaryQueries: string[];
  generationSettings: ContentPlanBrief['generationSettings'];
  requiredBlocks: string[];
  articleOutline: string[];
  faqItems: string[];
  schemaTypes: string[];
  linkingHints: string[];
  notesForLlm: string;
}) {
  const relayResult = await callRelayJson<RelayArticleResponse>('/api/semantic/article', input);
  if (relayResult?.article_markdown) {
    return relayResult;
  }

  const sections = input.articleOutline.length ? input.articleOutline : input.requiredBlocks;
  const faqSection =
    input.generationSettings.includeFaq && input.faqItems.length
      ? input.faqItems.map((item) => `- ${item}`).join('\n')
      : '- Добавьте 3-5 вопросов и ответов по интенту статьи.';

  return {
    title: input.title,
    meta_description: input.metaDescription,
    article_markdown: [
      `# ${input.title}`,
      '',
      `Ключевой запрос: **${input.mainQuery}**`,
      '',
      `Целевой тон: ${input.generationSettings.tone}. Цель: ${input.generationSettings.goal}.`,
      '',
      ...sections.flatMap((section) => [`## ${section}`, 'Заполните этот блок содержанием по интенту страницы.', '']),
      '## Вторичные запросы',
      (input.secondaryQueries.length ? input.secondaryQueries : input.clusterQueries).slice(0, 8).map((item) => `- ${item}`).join('\n'),
      '',
      '## FAQ',
      faqSection,
      '',
      '## Что сослать внутри сайта',
      (input.linkingHints.length ? input.linkingHints : [input.sourceUrl]).map((item) => `- ${item}`).join('\n'),
      '',
      '## Schema',
      input.schemaTypes.map((item) => `- ${item}`).join('\n') || '- FAQPage',
      '',
      '## Вывод',
      input.generationSettings.includeCta ? 'Сформулируйте итог и CTA на инструмент.' : 'Сформулируйте краткий итог.',
    ].join('\n'),
  };
}
