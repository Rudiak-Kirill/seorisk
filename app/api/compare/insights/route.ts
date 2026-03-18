import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const LLM_RELAY_URL = (process.env.LLM_RELAY_URL || '').replace(/\/+$/, '');
const LLM_RELAY_SECRET = process.env.LLM_RELAY_SECRET || '';

type CompareSiteMetrics = {
  profile: {
    type: string | null;
    age_years: number | null;
    age_label: string | null;
    cms: string | null;
    yandex_iks: number | null;
  };
  structure: {
    sitemap_total: number | null;
    commercial_percent: number | null;
    informational_percent: number | null;
    commercial_signals_found: number | null;
    commercial_signals_total: number | null;
  };
  speed: {
    ttfb_ms: number | null;
    mobile_score: number | null;
    desktop_score: number | null;
  };
  bots: {
    googlebot_ok: boolean | null;
    yandexbot_ok: boolean | null;
  };
  indexability: {
    canonical_ok: boolean | null;
    robots_ok: boolean | null;
  };
  ai: {
    gptbot_ok: boolean | null;
    llms_txt: boolean | null;
    schema_critical: boolean | null;
    faq_found: boolean | null;
  };
  subdomains: {
    found: number | null;
    checked: number | null;
    regional: number | null;
    open_dev_test: boolean | null;
  };
};

type CompareSiteItem = {
  site_url: string;
  domain: string;
  metrics: CompareSiteMetrics;
};

type InsightItem = {
  title: string;
  detail: string;
  action?: string;
};

type CompareInsightsResponse = {
  ok: true;
  lagging: InsightItem[];
  leading: InsightItem[];
  quick_wins: InsightItem[];
  tasks: {
    seo: string[];
    dev: string[];
    ok: string[];
  };
  source: 'relay' | 'fallback';
};

function addUnique(target: string[], value: string | null) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
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

function buildFallbackInsights(sites: CompareSiteItem[]): Omit<CompareInsightsResponse, 'ok'> {
  const own = sites[0];
  const competitors = sites.slice(1);

  const lagging: InsightItem[] = [];
  const leading: InsightItem[] = [];
  const quick_wins: InsightItem[] = [];
  const seoTasks: string[] = [];
  const devTasks: string[] = [];
  const okItems: string[] = [];

  for (const competitor of competitors) {
    const ownIks = own.metrics.profile.yandex_iks;
    const competitorIks = competitor.metrics.profile.yandex_iks;
    if (ownIks && competitorIks && competitorIks >= ownIks * 2) {
      lagging.push({
        title: 'ИКС заметно ниже конкурента',
        detail: `У ${competitor.domain}: ${competitorIks}, у вас: ${ownIks}.`,
        action: 'Сеошнику: работа над авторитетом сайта.',
      });
      addUnique(seoTasks, 'Работа над авторитетом сайта — отставание по ИКС от конкурентов.');
    }

    const ownSitemap = own.metrics.structure.sitemap_total;
    const competitorSitemap = competitor.metrics.structure.sitemap_total;
    if (ownSitemap && competitorSitemap && competitorSitemap >= ownSitemap * 2) {
      lagging.push({
        title: 'В sitemap заметно меньше страниц',
        detail: `У ${competitor.domain}: ${competitorSitemap}, у вас: ${ownSitemap}.`,
        action: 'Сеошнику: расширить охват семантики и контент.',
      });
      addUnique(seoTasks, 'Расширить контент и семантику — у конкурентов в 2+ раза больше страниц в sitemap.');
    }

    const ownMobile = own.metrics.speed.mobile_score;
    const competitorMobile = competitor.metrics.speed.mobile_score;
    if (ownMobile !== null && competitorMobile !== null && competitorMobile >= ownMobile + 20) {
      lagging.push({
        title: 'Мобильная скорость уступает конкуренту',
        detail: `${competitor.domain}: ${competitorMobile}, у вас: ${ownMobile}.`,
        action: 'Разработчику: оптимизация мобильной версии.',
      });
      addUnique(devTasks, 'Оптимизировать мобильную версию — у конкурентов score выше на 20+ пунктов.');
    }

    if (competitor.metrics.ai.schema_critical && own.metrics.ai.schema_critical === false) {
      lagging.push({
        title: 'У конкурента есть критическая Schema.org, у вас нет',
        detail: `${competitor.domain} уже использует критические типы schema.org.`,
        action: 'Разработчику: добавить критическую schema-разметку.',
      });
      addUnique(devTasks, 'Добавить Schema.org — у конкурентов есть критические типы, у вас нет.');
    }

    const ownInfo = own.metrics.structure.informational_percent;
    const competitorInfo = competitor.metrics.structure.informational_percent;
    if (ownInfo !== null && competitorInfo !== null && competitorInfo >= ownInfo + 15) {
      lagging.push({
        title: 'Информационного контента меньше, чем у конкурента',
        detail: `${competitor.domain}: ${competitorInfo}%, у вас: ${ownInfo}%.`,
        action: 'Сеошнику: развивать блог и инфо-кластеры.',
      });
      addUnique(seoTasks, 'Развивать информационный контент — у конкурентов доля инфо-страниц выше.');
    }

    if (own.metrics.ai.llms_txt && competitor.metrics.ai.llms_txt === false) {
      quick_wins.push({
        title: 'У конкурента нет llms.txt',
        detail: `${competitor.domain} ещё не настроил llms.txt — это шанс закрепить преимущество в AI-поиске.`,
      });
      addUnique(okItems, 'llms.txt уже настроен — по AI-готовности вы впереди части конкурентов.');
    }

    if (own.metrics.speed.mobile_score !== null && competitor.metrics.speed.mobile_score !== null && own.metrics.speed.mobile_score >= competitor.metrics.speed.mobile_score + 20) {
      leading.push({
        title: 'Мобильная скорость лучше конкурента',
        detail: `У вас ${own.metrics.speed.mobile_score}, у ${competitor.domain} — ${competitor.metrics.speed.mobile_score}.`,
      });
      addUnique(okItems, 'Скорость лучше конкурентов — это текущее преимущество, не трогать без необходимости.');
    }

    if (own.metrics.subdomains.regional && own.metrics.subdomains.regional > 0 && (competitor.metrics.subdomains.regional || 0) === 0) {
      leading.push({
        title: 'Есть региональная структура, у конкурента её нет',
        detail: `У вас региональных поддоменов: ${own.metrics.subdomains.regional}, у ${competitor.domain} — 0.`,
      });
      addUnique(okItems, 'Региональные поддомены уже есть — это преимущество по охвату регионов.');
    }

    if (competitor.metrics.bots.googlebot_ok === false || competitor.metrics.bots.yandexbot_ok === false) {
      quick_wins.push({
        title: 'У конкурента проблемы с доступностью ботов',
        detail: `${competitor.domain} отдаёт проблему хотя бы одному поисковому боту.`,
      });
      addUnique(okItems, 'Доступность ботов в порядке — часть конкурентов теряет индексацию.');
    }
  }

  if (own.metrics.ai.llms_txt === false && competitors.some((item) => item.metrics.ai.llms_txt)) {
    addUnique(devTasks, 'Создать llms.txt — у части конкурентов он уже есть.');
  }

  return {
    lagging: lagging.slice(0, 4),
    leading: leading.slice(0, 3),
    quick_wins: quick_wins.slice(0, 3),
    tasks: {
      seo: seoTasks,
      dev: devTasks,
      ok: okItems,
    },
    source: 'fallback',
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { sites?: CompareSiteItem[] };
    const sites = Array.isArray(body.sites) ? body.sites : [];

    if (sites.length < 2) {
      return NextResponse.json({ ok: false, error: 'Нужно минимум два сайта для сравнения' }, { status: 400 });
    }

    const relayResult = await callRelayJson<{
      lagging?: InsightItem[];
      leading?: InsightItem[];
      quick_wins?: InsightItem[];
    }>('/api/compare/insights', { sites });

    const fallback = buildFallbackInsights(sites);

    if (!relayResult) {
      return NextResponse.json({ ok: true, ...fallback });
    }

    return NextResponse.json({
      ok: true,
      lagging: relayResult.lagging || fallback.lagging,
      leading: relayResult.leading || fallback.leading,
      quick_wins: relayResult.quick_wins || fallback.quick_wins,
      tasks: fallback.tasks,
      source: 'relay',
    } satisfies CompareInsightsResponse);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Ошибка сервиса' },
      { status: 500 }
    );
  }
}
