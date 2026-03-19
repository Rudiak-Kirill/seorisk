'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ToolProgress from '@/components/tool-progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

type CompareSiteResult = {
  ok: true;
  site_url: string;
  domain: string;
  metrics: CompareSiteMetrics;
  errors: string[];
};

type InsightItem = {
  title: string;
  detail: string;
  action?: string;
};

type CompareInsights = {
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

type ProgressItem = {
  url: string;
  label: string;
  status: 'pending' | 'done' | 'error';
};

type CellNote = {
  text: string;
  tone: string;
};

type RowConfig = {
  label: string;
  getValue: (site: CompareSiteResult) => unknown;
  render: (site: CompareSiteResult) => ReactNode;
  compare?: (own: CompareSiteResult, current: CompareSiteResult) => CellNote | null;
};

const SECTION_ROWS: Array<{ title: string; rows: RowConfig[] }> = [
  {
    title: 'Профиль',
    rows: [
      {
        label: 'Тип',
        getValue: (site) => site.metrics.profile.type,
        render: (site) => site.metrics.profile.type || '—',
      },
      {
        label: 'Возраст домена',
        getValue: (site) => site.metrics.profile.age_years,
        render: (site) => site.metrics.profile.age_label || '—',
        compare: (own, current) => compareNumbers(own.metrics.profile.age_years, current.metrics.profile.age_years, 'higher'),
      },
      {
        label: 'ИКС Яндекса',
        getValue: (site) => site.metrics.profile.yandex_iks,
        render: (site) => formatNumber(site.metrics.profile.yandex_iks),
        compare: (own, current) => compareNumbers(own.metrics.profile.yandex_iks, current.metrics.profile.yandex_iks, 'higher'),
      },
      {
        label: 'CMS',
        getValue: (site) => site.metrics.profile.cms,
        render: (site) => site.metrics.profile.cms || '—',
      },
    ],
  },
  {
    title: 'Структура',
    rows: [
      {
        label: 'Страниц в sitemap',
        getValue: (site) => site.metrics.structure.sitemap_total,
        render: (site) => formatNumber(site.metrics.structure.sitemap_total),
        compare: (own, current) =>
          compareNumbers(own.metrics.structure.sitemap_total, current.metrics.structure.sitemap_total, 'higher'),
      },
      {
        label: 'Коммерческих',
        getValue: (site) => site.metrics.structure.commercial_count,
        render: (site) =>
          renderCountPercent(site.metrics.structure.commercial_count, site.metrics.structure.commercial_percent),
        compare: (own, current) =>
          compareNumbers(own.metrics.structure.commercial_count, current.metrics.structure.commercial_count, 'higher'),
      },
      {
        label: 'Информационных',
        getValue: (site) => site.metrics.structure.informational_count,
        render: (site) =>
          renderCountPercent(
            site.metrics.structure.informational_count,
            site.metrics.structure.informational_percent
          ),
        compare: (own, current) =>
          compareNumbers(
            own.metrics.structure.informational_count,
            current.metrics.structure.informational_count,
            'higher'
          ),
      },
      {
        label: 'Коммерч. сигналы',
        getValue: (site) => site.metrics.structure.commercial_signals_found,
        render: (site) =>
          site.metrics.structure.commercial_signals_found !== null &&
          site.metrics.structure.commercial_signals_total !== null
            ? `${site.metrics.structure.commercial_signals_found}/${site.metrics.structure.commercial_signals_total}`
            : '—',
        compare: (own, current) =>
          compareNumbers(
            own.metrics.structure.commercial_signals_found,
            current.metrics.structure.commercial_signals_found,
            'higher'
          ),
      },
    ],
  },
  {
    title: 'Скорость',
    rows: [
      {
        label: 'TTFB',
        getValue: (site) => site.metrics.speed.ttfb_ms,
        render: (site) => (site.metrics.speed.ttfb_ms !== null ? `${site.metrics.speed.ttfb_ms} мс` : '—'),
        compare: (own, current) => compareNumbers(own.metrics.speed.ttfb_ms, current.metrics.speed.ttfb_ms, 'lower'),
      },
      {
        label: 'Mobile score',
        getValue: (site) => site.metrics.speed.mobile_score,
        render: (site) => formatNumber(site.metrics.speed.mobile_score),
        compare: (own, current) =>
          compareNumbers(own.metrics.speed.mobile_score, current.metrics.speed.mobile_score, 'higher'),
      },
      {
        label: 'Desktop score',
        getValue: (site) => site.metrics.speed.desktop_score,
        render: (site) => formatNumber(site.metrics.speed.desktop_score),
        compare: (own, current) =>
          compareNumbers(own.metrics.speed.desktop_score, current.metrics.speed.desktop_score, 'higher'),
      },
    ],
  },
  {
    title: 'Индексация и боты',
    rows: [
      {
        label: 'Googlebot',
        getValue: (site) => site.metrics.bots.googlebot_ok,
        render: (site) => boolLabel(site.metrics.bots.googlebot_ok),
        compare: (own, current) => compareBotRisk(own.metrics.bots.googlebot_ok, current.metrics.bots.googlebot_ok),
      },
      {
        label: 'Яндекс-бот',
        getValue: (site) => site.metrics.bots.yandexbot_ok,
        render: (site) => boolLabel(site.metrics.bots.yandexbot_ok),
        compare: (own, current) => compareBotRisk(own.metrics.bots.yandexbot_ok, current.metrics.bots.yandexbot_ok),
      },
      {
        label: 'Canonical',
        getValue: (site) => site.metrics.indexability.canonical_ok,
        render: (site) => boolLabel(site.metrics.indexability.canonical_ok),
        compare: (own, current) => compareWarningOrGrowth(own.metrics.indexability.canonical_ok, current.metrics.indexability.canonical_ok),
      },
      {
        label: 'robots.txt',
        getValue: (site) => site.metrics.indexability.robots_ok,
        render: (site) => boolLabel(site.metrics.indexability.robots_ok),
        compare: (own, current) => compareWarningOrGrowth(own.metrics.indexability.robots_ok, current.metrics.indexability.robots_ok),
      },
    ],
  },
  {
    title: 'AI-готовность',
    rows: [
      {
        label: 'GPTBot',
        getValue: (site) => site.metrics.ai.gptbot_ok,
        render: (site) => boolLabel(site.metrics.ai.gptbot_ok),
        compare: (own, current) => compareBotRisk(own.metrics.ai.gptbot_ok, current.metrics.ai.gptbot_ok),
      },
      {
        label: 'llms.txt',
        getValue: (site) => site.metrics.ai.llms_txt,
        render: (site) => boolLabel(site.metrics.ai.llms_txt),
        compare: (own, current) => compareChance(own.metrics.ai.llms_txt, current.metrics.ai.llms_txt),
      },
      {
        label: 'Schema.org',
        getValue: (site) => site.metrics.ai.schema_critical,
        render: (site) => boolLabel(site.metrics.ai.schema_critical),
        compare: (own, current) => compareGrowth(own.metrics.ai.schema_critical, current.metrics.ai.schema_critical),
      },
      {
        label: 'FAQ структура',
        getValue: (site) => site.metrics.ai.faq_found,
        render: (site) => boolLabel(site.metrics.ai.faq_found),
        compare: (own, current) => compareGrowth(own.metrics.ai.faq_found, current.metrics.ai.faq_found),
      },
    ],
  },
  {
    title: 'Поддомены',
    rows: [
      {
        label: 'Всего поддоменов',
        getValue: (site) => site.metrics.subdomains.found,
        render: (site) => formatNumber(site.metrics.subdomains.found),
      },
      {
        label: 'Региональных',
        getValue: (site) => site.metrics.subdomains.regional,
        render: (site) => formatNumber(site.metrics.subdomains.regional),
      },
      {
        label: 'Открытых dev/test',
        getValue: (site) => site.metrics.subdomains.open_dev_test,
        render: (site) => boolLabel(site.metrics.subdomains.open_dev_test, 'Да', 'Нет'),
        compare: (_, current) =>
          current.metrics.subdomains.open_dev_test ? { text: 'риск', tone: 'text-amber-700' } : null,
      },
    ],
  },
];

function normalizeSiteInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const prepared = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(prepared);
    return `${url.origin}/`;
  } catch {
    return '';
  }
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value)}%`;
}

function renderCountPercent(count: number | null | undefined, percent: number | null | undefined) {
  if (count === null || count === undefined || percent === null || percent === undefined) {
    return '—';
  }

  return (
    <div className="flex items-baseline gap-2">
      <span className="text-base font-semibold text-gray-900">{formatNumber(count)}</span>
      <span className="text-xs text-gray-500">{formatPercent(percent)}</span>
    </div>
  );
}

function boolLabel(value: boolean | null | undefined, yes = '✅', no = '❌') {
  if (value === null || value === undefined) return '—';
  return value ? yes : no;
}

function compareNumbers(
  ownValue: number | null | undefined,
  competitorValue: number | null | undefined,
  direction: 'higher' | 'lower'
): CellNote | null {
  if (ownValue === null || ownValue === undefined || competitorValue === null || competitorValue === undefined) {
    return null;
  }

  if (competitorValue === ownValue) return null;

  const competitorBetter =
    direction === 'higher' ? competitorValue > ownValue : competitorValue < ownValue;

  return competitorBetter
    ? { text: '↑', tone: 'text-red-600' }
    : { text: '↓', tone: 'text-green-600' };
}

function compareGrowth(ownValue: boolean | null | undefined, competitorValue: boolean | null | undefined) {
  if (ownValue === null || ownValue === undefined || competitorValue === null || competitorValue === undefined) {
    return null;
  }
  if (ownValue === competitorValue) return null;
  return competitorValue
    ? { text: '↑', tone: 'text-red-600' }
    : { text: '↓', tone: 'text-green-600' };
}

function compareBotRisk(ownValue: boolean | null | undefined, competitorValue: boolean | null | undefined) {
  if (ownValue === null || ownValue === undefined || competitorValue === null || competitorValue === undefined) {
    return null;
  }
  if (ownValue === competitorValue) return null;
  if (ownValue && !competitorValue) return { text: 'риск', tone: 'text-amber-700' };
  if (!ownValue && competitorValue) return { text: '↑', tone: 'text-red-600' };
  return null;
}

function compareChance(ownValue: boolean | null | undefined, competitorValue: boolean | null | undefined) {
  if (ownValue === null || ownValue === undefined || competitorValue === null || competitorValue === undefined) {
    return null;
  }
  if (ownValue === competitorValue) return null;
  if (ownValue && !competitorValue) return { text: 'шанс', tone: 'text-amber-700' };
  if (!ownValue && competitorValue) return { text: '↑', tone: 'text-red-600' };
  return null;
}

function compareWarningOrGrowth(ownValue: boolean | null | undefined, competitorValue: boolean | null | undefined) {
  if (ownValue === null || ownValue === undefined || competitorValue === null || competitorValue === undefined) {
    return null;
  }
  if (ownValue === competitorValue) return null;
  if (ownValue && !competitorValue) return { text: '⚠️', tone: 'text-amber-700' };
  if (!ownValue && competitorValue) return { text: '↑', tone: 'text-red-600' };
  return null;
}

function getHostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function errorLabel(code: string) {
  switch (code) {
    case 'site_profile':
      return 'Site Profile';
    case 'speed':
      return 'Speed Check';
    case 'ssr':
      return 'SSR Check';
    case 'index':
      return 'Index Check';
    case 'llm':
      return 'LLM Check';
    case 'subdomains':
      return 'Subdomain Check';
    default:
      return code;
  }
}

function compareProgressPercent(items: ProgressItem[]) {
  if (!items.length) return 0;
  const done = items.filter((item) => item.status !== 'pending').length;
  return Math.min(100, Math.round((done / items.length) * 100));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  iteratee: (item: T, index: number) => Promise<R>
) {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) break;
      try {
        results[currentIndex] = {
          status: 'fulfilled',
          value: await iteratee(items[currentIndex], currentIndex),
        };
      } catch (error) {
        results[currentIndex] = {
          status: 'rejected',
          reason: error,
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return results;
}

export default function ComparePage() {
  const searchParams = useSearchParams();
  const [ownSite, setOwnSite] = useState('');
  const [competitors, setCompetitors] = useState(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [sites, setSites] = useState<CompareSiteResult[]>([]);
  const [insights, setInsights] = useState<CompareInsights | null>(null);

  useEffect(() => {
    const site = searchParams.get('site');
    const competitorsParam = searchParams.get('competitors');

    if (site) {
      const normalized = normalizeSiteInput(site);
      if (normalized) setOwnSite(normalized);
    }

    if (competitorsParam) {
      const parsed = competitorsParam
        .split(',')
        .map((item) => normalizeSiteInput(item))
        .filter(Boolean)
        .slice(0, 3);

      setCompetitors((current) => current.map((_, index) => parsed[index] || ''));
    }
  }, [searchParams]);

  const orderedSites = useMemo(() => sites, [sites]);
  const ownResult = orderedSites[0] || null;
  const competitorResults = orderedSites.slice(1);

  const onCompare = async () => {
    const normalizedOwn = normalizeSiteInput(ownSite);
    const normalizedCompetitors = competitors.map(normalizeSiteInput).filter(Boolean);

    if (!normalizedOwn) {
      setError('Введите свой сайт');
      return;
    }

    if (!normalizedCompetitors.length) {
      setError('Добавьте хотя бы одного конкурента');
      return;
    }

    const targets = [normalizedOwn, ...normalizedCompetitors].filter(
      (item, index, list) => list.indexOf(item) === index
    );

    setLoading(true);
    setError(null);
    setSites([]);
    setInsights(null);
    setProgress(
      targets.map((item, index) => ({
        url: item,
        label: index === 0 ? 'Ваш сайт' : `Конкурент ${index}`,
        status: 'pending',
      }))
    );

    try {
      const settledResults = await mapWithConcurrency(targets, 2, async (target, index) => {
          const response = await fetch('/api/compare/site', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: target }),
          });
          const payload = (await response.json()) as CompareSiteResult | { ok: false; error?: string };

          setProgress((current) =>
            current.map((item, itemIndex) =>
              itemIndex === index
                ? { ...item, status: response.ok && 'ok' in payload && payload.ok ? 'done' : 'error' }
                : item
            )
          );

          if (!response.ok || !('ok' in payload) || payload.ok === false) {
            throw new Error(('error' in payload && payload.error) || `Не удалось проанализировать ${target}`);
          }

          return payload;
        });
      const resultItems = settledResults
        .filter((item): item is PromiseFulfilledResult<CompareSiteResult> => item.status === 'fulfilled')
        .map((item) => item.value);

      if (resultItems.length < 2) {
        throw new Error('Не удалось собрать достаточно данных для сравнения');
      }

      setSites(resultItems);

      const insightsResponse = await fetch('/api/compare/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sites: resultItems }),
      });
      const insightsPayload = (await insightsResponse.json()) as CompareInsights | { ok: false; error?: string };

      if (insightsResponse.ok && 'ok' in insightsPayload && insightsPayload.ok) {
        setInsights(insightsPayload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось построить сравнение');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">Сравнение с конкурентами</h1>
        <p className="mt-2 text-sm text-gray-500">
          Сравните свой сайт с конкурентами по публичным данным: профиль, структура, скорость, индексация, AI-готовность и поддомены.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium text-gray-900">Ваш сайт</div>
              <Input
                value={ownSite}
                onChange={(event) => setOwnSite(event.target.value)}
                onBlur={() => setOwnSite((current) => normalizeSiteInput(current))}
                placeholder="https://example.com"
              />
            </div>

            <div className="grid gap-3">
              {competitors.map((value, index) => (
                <div key={index}>
                  <div className="mb-2 text-sm font-medium text-gray-900">Конкурент {index + 1}</div>
                  <Input
                    value={value}
                    onChange={(event) =>
                      setCompetitors((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                    }
                    onBlur={() =>
                      setCompetitors((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? normalizeSiteInput(item) : item))
                      )
                    }
                    placeholder="https://competitor.ru"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <Button className="rounded-full" disabled={loading} onClick={onCompare}>
                {loading ? 'Сравниваем...' : 'Сравнить'}
              </Button>
            </div>
          </div>

          {error ? <div className="mt-4 rounded-md bg-black px-4 py-3 text-sm text-white">{error}</div> : null}

          <ToolProgress
            active={loading}
            title="Сравниваем сайты..."
            description="Параллельно собираем Site Profile, Speed Check, SSR, Index, LLM и Subdomain Check для всех доменов."
          />

          {loading && progress.length ? (
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-4 text-sm font-medium text-gray-900">
                <span>Прогресс сравнения</span>
                <span>{compareProgressPercent(progress)}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${compareProgressPercent(progress)}%` }}
                />
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-700">
                {progress.map((item) => (
                  <div key={item.url} className="flex items-center justify-between gap-4">
                    <span>
                      {item.label}: {getHostLabel(item.url)}
                    </span>
                    <span>
                      {item.status === 'done' ? '✅' : item.status === 'error' ? '⚠️' : '⏳'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {orderedSites.length ? (
            <>
              {orderedSites.some((site) => site.errors.length > 0) ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="font-medium">Часть данных не удалось получить</div>
                  <div className="mt-2 space-y-1">
                    {orderedSites
                      .filter((site) => site.errors.length > 0)
                      .map((site) => (
                        <div key={`${site.domain}-errors`}>
                          {site.domain}: {site.errors.map(errorLabel).join(', ')}
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-8 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full table-fixed divide-y divide-gray-200 text-sm">
                  <colgroup>
                    <col className="w-36" />
                    <col className="w-52" />
                    {orderedSites.map((site) => (
                      <col key={`${site.domain}-col`} className="w-44" />
                    ))}
                  </colgroup>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-36 px-4 py-3 text-left font-medium text-gray-500">Раздел</th>
                      <th className="w-64 px-4 py-3 text-left font-medium text-gray-500">Параметр</th>
                      {orderedSites.map((site, index) => (
                        <th key={site.domain} className="min-w-44 px-4 py-3 align-top text-left font-medium text-gray-500">
                          {index === 0 ? 'Мой сайт' : `Конк. ${index}`}
                          <div className="mt-1 break-words font-semibold text-gray-900">{site.domain}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {SECTION_ROWS.map((section) => (
                      section.rows.map((row, rowIndex) => (
                        <tr key={`${section.title}-${row.label}`}>
                          {rowIndex === 0 ? (
                            <td className="px-4 py-3 align-top" rowSpan={section.rows.length}>
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{section.title}</div>
                            </td>
                          ) : null}
                          <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
                          {orderedSites.map((site, siteIndex) => {
                            const note = ownResult && siteIndex > 0 && row.compare ? row.compare(ownResult, site) : null;
                            return (
                              <td key={`${section.title}-${row.label}-${site.domain}`} className="px-4 py-3 text-gray-700">
                                <div className="flex items-center gap-2">
                                  <div className="min-w-0">{row.render(site)}</div>
                                  {note ? <span className={`text-xs font-semibold ${note.tone}`}>{note.text}</span> : null}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>

              {insights ? (
                <div className="mt-8 grid gap-6 xl:grid-cols-3">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-gray-900">Где отстаёшь</h2>
                    <div className="mt-4 space-y-4">
                      {insights.lagging.length ? (
                        insights.lagging.map((item) => (
                          <div key={`${item.title}-${item.detail}`}>
                            <div className="text-sm font-semibold text-red-700">🔴 {item.title}</div>
                            <div className="mt-1 text-sm text-gray-700">{item.detail}</div>
                            {item.action ? <div className="mt-1 text-sm text-gray-900">→ {item.action}</div> : null}
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">Явных отставаний по доступным данным не найдено.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-gray-900">Где впереди</h2>
                    <div className="mt-4 space-y-4">
                      {insights.leading.length ? (
                        insights.leading.map((item) => (
                          <div key={`${item.title}-${item.detail}`}>
                            <div className="text-sm font-semibold text-green-700">✅ {item.title}</div>
                            <div className="mt-1 text-sm text-gray-700">{item.detail}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">Явных преимуществ по доступным данным не найдено.</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-base font-semibold text-gray-900">Быстрые победы</h2>
                    <div className="mt-4 space-y-4">
                      {insights.quick_wins.length ? (
                        insights.quick_wins.map((item) => (
                          <div key={`${item.title}-${item.detail}`}>
                            <div className="text-sm font-semibold text-amber-700">💡 {item.title}</div>
                            <div className="mt-1 text-sm text-gray-700">{item.detail}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-sm text-gray-500">Быстрых побед по доступным данным пока не видно.</div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {insights ? (
                <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900">Кому звонить</h2>
                  <div className="mt-4 grid gap-6 md:grid-cols-3">
                    <div>
                      <div className="text-sm font-semibold text-red-700">🔴 Сеошнику</div>
                      <div className="mt-3 space-y-2 text-sm text-gray-700">
                        {insights.tasks.seo.length ? insights.tasks.seo.map((item) => <div key={item}>• {item}</div>) : <div>—</div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-amber-700">🟡 Разработчику</div>
                      <div className="mt-3 space-y-2 text-sm text-gray-700">
                        {insights.tasks.dev.length ? insights.tasks.dev.map((item) => <div key={item}>• {item}</div>) : <div>—</div>}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-green-700">✅ Всё хорошо — не трогать</div>
                      <div className="mt-3 space-y-2 text-sm text-gray-700">
                        {insights.tasks.ok.length ? insights.tasks.ok.map((item) => <div key={item}>• {item}</div>) : <div>—</div>}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        {ownResult ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/tools/site-profile?site=${encodeURIComponent(ownResult.site_url)}`}>Профиль сайта</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href={`/tools/subdomain-check?domain=${encodeURIComponent(ownResult.domain)}`}>Поддомены</Link>
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
