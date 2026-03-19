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
    commercial_count: number | null;
    commercial_percent: number | null;
    informational_count: number | null;
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

type RelayInsights = {
  lagging?: InsightItem[];
  leading?: InsightItem[];
  quick_wins?: InsightItem[];
};

type InsightCandidate = {
  key: string;
  priority: number;
  item: InsightItem;
};


function normalizeBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function normalizeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeSiteItem(raw: unknown): CompareSiteItem | null {
  if (!raw || typeof raw !== 'object') return null;

  const source = raw as Record<string, unknown>;
  const metrics = (source.metrics && typeof source.metrics === 'object' ? source.metrics : {}) as Record<string, unknown>;
  const profile = (metrics.profile && typeof metrics.profile === 'object' ? metrics.profile : {}) as Record<string, unknown>;
  const structure = (metrics.structure && typeof metrics.structure === 'object' ? metrics.structure : {}) as Record<string, unknown>;
  const speed = (metrics.speed && typeof metrics.speed === 'object' ? metrics.speed : {}) as Record<string, unknown>;
  const bots = (metrics.bots && typeof metrics.bots === 'object' ? metrics.bots : {}) as Record<string, unknown>;
  const indexability = (metrics.indexability && typeof metrics.indexability === 'object' ? metrics.indexability : {}) as Record<string, unknown>;
  const ai = (metrics.ai && typeof metrics.ai === 'object' ? metrics.ai : {}) as Record<string, unknown>;
  const subdomains = (metrics.subdomains && typeof metrics.subdomains === 'object' ? metrics.subdomains : {}) as Record<string, unknown>;

  return {
    site_url: normalizeString(source.site_url) || '',
    domain: normalizeString(source.domain) || '',
    metrics: {
      profile: {
        type: normalizeString(profile.type),
        age_years: normalizeNumber(profile.age_years),
        age_label: normalizeString(profile.age_label),
        cms: normalizeString(profile.cms),
        yandex_iks: normalizeNumber(profile.yandex_iks),
      },
      structure: {
        sitemap_total: normalizeNumber(structure.sitemap_total),
        commercial_count: normalizeNumber(structure.commercial_count),
        commercial_percent: normalizeNumber(structure.commercial_percent),
        informational_count: normalizeNumber(structure.informational_count),
        informational_percent: normalizeNumber(structure.informational_percent),
        commercial_signals_found: normalizeNumber(structure.commercial_signals_found),
        commercial_signals_total: normalizeNumber(structure.commercial_signals_total),
      },
      speed: {
        ttfb_ms: normalizeNumber(speed.ttfb_ms),
        mobile_score: normalizeNumber(speed.mobile_score),
        desktop_score: normalizeNumber(speed.desktop_score),
      },
      bots: {
        googlebot_ok: normalizeBoolean(bots.googlebot_ok),
        yandexbot_ok: normalizeBoolean(bots.yandexbot_ok),
      },
      indexability: {
        canonical_ok: normalizeBoolean(indexability.canonical_ok),
        robots_ok: normalizeBoolean(indexability.robots_ok),
      },
      ai: {
        gptbot_ok: normalizeBoolean(ai.gptbot_ok),
        llms_txt: normalizeBoolean(ai.llms_txt),
        schema_critical: normalizeBoolean(ai.schema_critical),
        faq_found: normalizeBoolean(ai.faq_found),
      },
      subdomains: {
        found: normalizeNumber(subdomains.found),
        checked: normalizeNumber(subdomains.checked),
        regional: normalizeNumber(subdomains.regional),
        open_dev_test: normalizeBoolean(subdomains.open_dev_test),
      },
    },
  };
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatTimes(ratio: number) {
  if (!Number.isFinite(ratio) || ratio <= 0) return '1 раз';
  const rounded = ratio >= 3 ? Math.round(ratio * 10) / 10 : Math.round(ratio * 10) / 10;
  const normalized = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');

  const numeric = Math.round(rounded * 10) / 10;
  const integer = Math.floor(numeric);
  const mod10 = integer % 10;
  const mod100 = integer % 100;
  const noun = mod10 === 1 && mod100 !== 11 ? 'раз' : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? 'раза' : 'раз';
  return `${normalized} ${noun}`;
}

function addUnique(target: string[], value: string | null) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

function addCandidate(target: InsightCandidate[], candidate: InsightCandidate) {
  const existing = target.find((item) => item.key === candidate.key);
  if (!existing) {
    target.push(candidate);
    return;
  }
  if (candidate.priority > existing.priority) {
    existing.priority = candidate.priority;
    existing.item = candidate.item;
  }
}

function mergeInsights(primary: InsightItem[], secondary: InsightItem[] | undefined, limit: number) {
  const merged: InsightItem[] = [];
  const seen = new Set<string>();

  for (const item of [...primary, ...(secondary || [])]) {
    const key = `${item.title}::${item.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }

  return merged;
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

function buildDeterministicInsights(sites: CompareSiteItem[]): Omit<CompareInsightsResponse, 'ok'> {
  const own = sites[0];
  const competitors = sites.slice(1);

  const laggingCandidates: InsightCandidate[] = [];
  const leadingCandidates: InsightCandidate[] = [];
  const quickWinCandidates: InsightCandidate[] = [];

  const seoTasks: string[] = [];
  const devTasks: string[] = [];
  const okItems: string[] = [];

  const openGptCompetitors = competitors.filter((item) => item.metrics.ai.gptbot_ok === true);
  if (own.metrics.ai.gptbot_ok === false && openGptCompetitors.length > 0) {
    const bestCompetitor = openGptCompetitors[0];
    addCandidate(laggingCandidates, {
      key: 'gptbot',
      priority: 100,
      item: {
        title: 'GPTBot заблокирован',
        detail: `${bestCompetitor.domain} открыт для ChatGPT, а у тебя GPTBot недоступен — теряешь AI-трафик.`,
        action: 'Разработчику: проверить CDN и server rules.',
      },
    });
    addUnique(
      devTasks,
      `Открыть доступ для GPTBot — ${openGptCompetitors.length} из ${competitors.length} конкурентов уже открыты.`
    );
  }

  for (const competitor of competitors) {
    const ownIks = own.metrics.profile.yandex_iks;
    const competitorIks = competitor.metrics.profile.yandex_iks;
    if (ownIks && competitorIks && competitorIks >= ownIks * 1.3) {
      addCandidate(laggingCandidates, {
        key: `iks-${competitor.domain}`,
        priority: Math.round((competitorIks / ownIks) * 100),
        item: {
          title: 'ИКС ниже лидера ниши',
          detail: `ИКС: у ${competitor.domain} ${formatNumber(competitorIks)}, у тебя ${formatNumber(ownIks)} — разница в ${formatTimes(competitorIks / ownIks)}.`,
          action: 'Сеошнику: комплексная работа над авторитетом сайта.',
        },
      });
      addUnique(
        seoTasks,
        `Усилить авторитет сайта — у ${competitor.domain} ИКС ${formatNumber(competitorIks)}, у тебя ${formatNumber(ownIks)}.`
      );
    }

    const ownSitemap = own.metrics.structure.sitemap_total;
    const competitorSitemap = competitor.metrics.structure.sitemap_total;
    if (ownSitemap && competitorSitemap && competitorSitemap >= ownSitemap * 1.5) {
      addCandidate(laggingCandidates, {
        key: `sitemap-${competitor.domain}`,
        priority: Math.round((competitorSitemap / ownSitemap) * 90),
        item: {
          title: 'Контентный охват меньше лидера',
          detail: `Страниц в sitemap: у ${competitor.domain} ${formatNumber(competitorSitemap)}, у тебя ${formatNumber(ownSitemap)} — в ${formatTimes(competitorSitemap / ownSitemap)} больше.`,
          action: 'Сеошнику: расширить контент и семантику.',
        },
      });
      addUnique(
        seoTasks,
        `Расширить контент и семантику — у ${competitor.domain} ${formatNumber(competitorSitemap)} страниц в sitemap, у тебя ${formatNumber(ownSitemap)}.`
      );
    }

    const ownInfoCount = own.metrics.structure.informational_count;
    const competitorInfoCount = competitor.metrics.structure.informational_count;
    if (
      ownInfoCount !== null &&
      competitorInfoCount !== null &&
      ownInfoCount > 0 &&
      competitorInfoCount >= ownInfoCount * 1.5
    ) {
      addCandidate(laggingCandidates, {
        key: `informational-${competitor.domain}`,
        priority: Math.round((competitorInfoCount / ownInfoCount) * 80),
        item: {
          title: 'Информационного контента меньше',
          detail: `Информационных страниц: у ${competitor.domain} ${formatNumber(competitorInfoCount)}, у тебя ${formatNumber(ownInfoCount)} — в ${formatTimes(competitorInfoCount / ownInfoCount)} меньше точек входа.`,
          action: 'Сеошнику: развивать блог и информационные кластеры.',
        },
      });
      addUnique(
        seoTasks,
        `Расширить информационный контент — у ${competitor.domain} ${formatNumber(competitorInfoCount)} информационных страниц, у тебя ${formatNumber(ownInfoCount)}.`
      );
    }

    const ownTtfb = own.metrics.speed.ttfb_ms;
    const competitorTtfb = competitor.metrics.speed.ttfb_ms;
    if (
      ownTtfb !== null &&
      competitorTtfb !== null &&
      competitorTtfb > 0 &&
      competitorTtfb <= ownTtfb * 0.7
    ) {
      addCandidate(laggingCandidates, {
        key: `ttfb-${competitor.domain}`,
        priority: Math.round((ownTtfb / competitorTtfb) * 70),
        item: {
          title: 'Сервер отвечает медленнее',
          detail: `TTFB: у ${competitor.domain} ${formatNumber(competitorTtfb)} мс, у тебя ${formatNumber(ownTtfb)} мс — сайт отвечает в ${formatTimes(ownTtfb / competitorTtfb)} медленнее.`,
          action: 'Разработчику: проверить сервер, кэш и тяжёлые backend-операции.',
        },
      });
      addUnique(
        devTasks,
        `Ускорить ответ сервера — у ${competitor.domain} TTFB ${formatNumber(competitorTtfb)} мс, у тебя ${formatNumber(ownTtfb)} мс.`
      );
    }

    const ownMobile = own.metrics.speed.mobile_score;
    const competitorMobile = competitor.metrics.speed.mobile_score;
    if (ownMobile !== null && competitorMobile !== null && competitorMobile >= ownMobile + 15) {
      addCandidate(laggingCandidates, {
        key: `mobile-${competitor.domain}`,
        priority: competitorMobile - ownMobile + 50,
        item: {
          title: 'Мобильная версия слабее лидера',
          detail: `Mobile score: у ${competitor.domain} ${formatNumber(competitorMobile)}, у тебя ${formatNumber(ownMobile)} — отставание ${formatNumber(competitorMobile - ownMobile)} пунктов.`,
          action: 'Разработчику: приоритетно оптимизировать мобильную версию.',
        },
      });
      addUnique(
        devTasks,
        `Оптимизировать мобильную версию — у ${competitor.domain} Mobile score ${formatNumber(competitorMobile)}, у тебя ${formatNumber(ownMobile)}.`
      );
    }

    if (own.metrics.ai.llms_txt === false && competitor.metrics.ai.llms_txt === true) {
      addCandidate(laggingCandidates, {
        key: `llms-${competitor.domain}`,
        priority: 65,
        item: {
          title: 'Нет llms.txt',
          detail: `${competitor.domain} уже открыл llms.txt, а у тебя этот файл отсутствует.`,
          action: 'Разработчику: создать llms.txt и открыть его для AI-ботов.',
        },
      });
      addUnique(
        devTasks,
        `Создать llms.txt — у ${competitor.domain} файл уже есть, а у тебя его нет.`
      );
    }

    if (own.metrics.ai.schema_critical === false && competitor.metrics.ai.schema_critical === true) {
      addCandidate(laggingCandidates, {
        key: `schema-${competitor.domain}`,
        priority: 60,
        item: {
          title: 'Критическая Schema.org отсутствует',
          detail: `${competitor.domain} имеет критические типы schema.org, а у тебя они не найдены.`,
          action: 'Разработчику: добавить Product / Review / FAQPage или другие релевантные типы schema.org.',
        },
      });
      addUnique(
        devTasks,
        `Добавить критическую Schema.org — у ${competitor.domain} она есть, у тебя нет.`
      );
    }

    if (own.metrics.indexability.canonical_ok === false && competitor.metrics.indexability.canonical_ok === true) {
      addCandidate(laggingCandidates, {
        key: `canonical-${competitor.domain}`,
        priority: 55,
        item: {
          title: 'Canonical настроен хуже конкурента',
          detail: `Canonical: у ${competitor.domain} всё в порядке, у тебя есть проблема с каноникализацией.`,
          action: 'Разработчику: проверить canonical и конфликтующие версии страниц.',
        },
      });
      addUnique(
        devTasks,
        `Починить canonical — у ${competitor.domain} он настроен корректно, у тебя есть проблема.`
      );
    }

    if (own.metrics.ai.gptbot_ok === true && competitor.metrics.ai.gptbot_ok === false) {
      addCandidate(leadingCandidates, {
        key: `gptbot-lead-${competitor.domain}`,
        priority: 70,
        item: {
          title: 'Доступ для GPTBot уже открыт',
          detail: `${competitor.domain} недоступен для GPTBot, а у тебя доступ открыт — это преимущество в AI-поиске.`,
        },
      });
      addUnique(
        okItems,
        `GPTBot открыт — у ${competitor.domain} доступ закрыт, это ваше преимущество в AI-поиске.`
      );
    }

    if (
      own.metrics.speed.mobile_score !== null &&
      competitor.metrics.speed.mobile_score !== null &&
      competitor.metrics.speed.mobile_score > 0 &&
      own.metrics.speed.mobile_score >= competitor.metrics.speed.mobile_score + 20
    ) {
      const ratio = own.metrics.speed.mobile_score / competitor.metrics.speed.mobile_score;
      addCandidate(leadingCandidates, {
        key: `mobile-lead-${competitor.domain}`,
        priority: own.metrics.speed.mobile_score - competitor.metrics.speed.mobile_score + 60,
        item: {
          title: `Мобильная скорость в ${formatTimes(ratio)} лучше ${competitor.domain}`,
          detail: `Их Mobile score ${formatNumber(competitor.metrics.speed.mobile_score)} — критично для мобильного поиска. Google снижает позиции медленных сайтов. Это реальное SEO-преимущество — защищай его.`,
        },
      });
      addUnique(
        okItems,
        `Мобильная скорость лучше ${competitor.domain} — у них score ${formatNumber(competitor.metrics.speed.mobile_score)}, у тебя ${formatNumber(own.metrics.speed.mobile_score)}.`
      );
    }

    if (own.metrics.ai.llms_txt === true && competitor.metrics.ai.llms_txt === false) {
      addCandidate(quickWinCandidates, {
        key: `llms-win-${competitor.domain}`,
        priority: 55,
        item: {
          title: `У ${competitor.domain} нет llms.txt`,
          detail: 'Ты уже впереди по AI-готовности. Развивай этот сигнал и не теряй преимущество.',
        },
      });
    }

    if (own.metrics.indexability.canonical_ok === true && competitor.metrics.indexability.canonical_ok === false) {
      addCandidate(quickWinCandidates, {
        key: `canonical-win-${competitor.domain}`,
        priority: 80,
        item: {
          title: `Проблемы с canonical у ${competitor.domain}`,
          detail: 'Пока не исправят — у тебя преимущество по индексации. Не трогай — это работает в твою пользу.',
        },
      });
      addUnique(
        okItems,
        `Canonical настроен лучше, чем у ${competitor.domain} — это даёт преимущество по индексации.`
      );
    }

    if (
      own.metrics.bots.googlebot_ok === true &&
      own.metrics.bots.yandexbot_ok === true &&
      (competitor.metrics.bots.googlebot_ok === false || competitor.metrics.bots.yandexbot_ok === false)
    ) {
      addCandidate(quickWinCandidates, {
        key: `bots-win-${competitor.domain}`,
        priority: 65,
        item: {
          title: `У ${competitor.domain} проблемы с доступом ботов`,
          detail: 'Пока они не откроют Googlebot и Яндекс-бота, часть индексации будет теряться — это шанс обогнать их.',
        },
      });
    }

    if (
      own.metrics.subdomains.regional !== null &&
      own.metrics.subdomains.regional > 0 &&
      (competitor.metrics.subdomains.regional || 0) === 0
    ) {
      addCandidate(leadingCandidates, {
        key: `regional-lead-${competitor.domain}`,
        priority: 45,
        item: {
          title: 'Региональная структура сильнее конкурента',
          detail: `У тебя региональных поддоменов ${formatNumber(own.metrics.subdomains.regional)}, у ${competitor.domain} — 0.`,
        },
      });
      addUnique(
        okItems,
        `Региональные поддомены уже есть — у ${competitor.domain} такой структуры нет.`
      );
    }
  }

  if (laggingCandidates.length < 3) {
    for (const competitor of competitors) {
      const ownSignals = own.metrics.structure.commercial_signals_found;
      const competitorSignals = competitor.metrics.structure.commercial_signals_found;
      if (
        ownSignals !== null &&
        competitorSignals !== null &&
        competitorSignals > ownSignals
      ) {
        addCandidate(laggingCandidates, {
          key: `signals-${competitor.domain}`,
          priority: 35 + (competitorSignals - ownSignals),
          item: {
            title: 'Коммерческие сигналы слабее конкурента',
            detail: `Коммерческие сигналы: у ${competitor.domain} ${formatNumber(competitorSignals)}, у тебя ${formatNumber(ownSignals)}.`,
            action: 'Сеошнику: усилить коммерческие блоки и доверительные элементы.',
          },
        });
      }

      const ownDesktop = own.metrics.speed.desktop_score;
      const competitorDesktop = competitor.metrics.speed.desktop_score;
      if (
        ownDesktop !== null &&
        competitorDesktop !== null &&
        competitorDesktop > ownDesktop
      ) {
        addCandidate(laggingCandidates, {
          key: `desktop-${competitor.domain}`,
          priority: 20 + (competitorDesktop - ownDesktop),
          item: {
            title: 'Desktop speed уступает конкуренту',
            detail: `Desktop score: у ${competitor.domain} ${formatNumber(competitorDesktop)}, у тебя ${formatNumber(ownDesktop)}.`,
            action: 'Разработчику: добрать производительность на desktop без ухудшения мобильной версии.',
          },
        });
      }
    }
  }

  return {
    lagging: laggingCandidates
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 4)
      .map((item) => item.item),
    leading: leadingCandidates
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 3)
      .map((item) => item.item),
    quick_wins: quickWinCandidates
      .sort((left, right) => right.priority - left.priority)
      .slice(0, 3)
      .map((item) => item.item),
    tasks: {
      seo: seoTasks.slice(0, 4),
      dev: devTasks.slice(0, 4),
      ok: okItems.slice(0, 4),
    },
    source: 'fallback',
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { sites?: unknown[] };
    const sites = Array.isArray(body.sites) ? body.sites.map(normalizeSiteItem).filter((item): item is CompareSiteItem => Boolean(item)) : [];

    if (sites.length < 2) {
      return NextResponse.json({ ok: false, error: 'Нужно минимум два сайта для сравнения' }, { status: 400 });
    }

    const deterministic = buildDeterministicInsights(sites);
    const relayResult = await callRelayJson<RelayInsights>('/api/compare/insights', { sites });

    if (!relayResult) {
      return NextResponse.json({ ok: true, ...deterministic });
    }

    return NextResponse.json({
      ok: true,
      lagging: deterministic.lagging,
      leading: mergeInsights(deterministic.leading, relayResult.leading, 3),
      quick_wins: mergeInsights(deterministic.quick_wins, relayResult.quick_wins, 3),
      tasks: deterministic.tasks,
      source: 'relay',
    } satisfies CompareInsightsResponse);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Ошибка сервиса' },
      { status: 500 }
    );
  }
}
