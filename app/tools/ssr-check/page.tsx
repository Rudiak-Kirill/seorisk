'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ToolFaq, { type FaqItem } from '@/components/tool-faq';

type Snapshot = {
  http_code: number;
  text_len: number;
  links_count: number;
  has_h1: boolean;
  has_title: boolean;
  access_state?: string | null;
};

type MatchedRule = {
  id: string;
  severity: string;
  verdict: string;
  summary: string;
  recommendation: string;
};

type CheckResponse = {
  ok: boolean;
  url: string;
  checked_at: string;
  verdict: 'ok' | 'mismatch';
  rule_verdict?: 'ok' | 'warn' | 'fail';
  rule_severity?: string;
  rule_id?: string;
  rule_summary?: string;
  rule_recommendation?: string;
  matched_rules?: MatchedRule[];
  reasons: string[];
  checks: {
    browser: Snapshot;
    yandex: Snapshot;
    google: Snapshot;
  };
  error?: string;
};

const SSR_FAQ: FaqItem[] = [
  {
    question: 'Какую боль решает SSR Check?',
    answer:
      'Страница может нормально открываться в браузере, но для Googlebot или Яндекс-бота отдавать ошибку, пустой HTML или урезанный контент. Из-за этого страница выпадает из поиска, плохо индексируется или теряет трафик, а причина неочевидна.',
  },
  {
    question: 'Что делает SSR Check?',
    answer:
      'Инструмент сравнивает ответ страницы для обычного браузера и SEO-ботов. Показывает различия по HTTP-ответу, наличию текста, ссылок, H1, title и общему доступу страницы.',
  },
  {
    question: 'Кому нужен этот инструмент?',
    answer:
      'SEO-специалистам, техническим SEO, разработчикам, владельцам сайтов на React, Next.js, Nuxt, SSR/SPA-проектах, а также тем, кто сталкивается с проблемами индексации и подозревает разные ответы для ботов и пользователей.',
  },
  {
    question: 'Когда SSR Check особенно полезен?',
    answer:
      'Когда страница есть на сайте, но не попадает в поиск.\nКогда после релиза или настройки CDN начались проблемы с индексацией.\nКогда браузер открывает страницу нормально, а поисковик ведёт себя так, будто страницы нет.',
  },
  {
    question: 'Какой результат даёт SSR Check?',
    answer:
      'Инструмент позволяет быстро понять, есть ли расхождение между браузером и ботами, и сразу увидеть первичную причину: ошибка сервера, пустой контент, отсутствие title или проблемы с доступом.',
  },
  {
    question: 'Какие вопросы помогает ответить SSR Check?',
    answer:
      'Видит ли Googlebot страницу так же, как обычный пользователь?\nНе отдается ли ботам ошибка 4xx/5xx?\nЕсть ли на странице контент для индексации?\nНе теряется ли SSR-рендер для поисковых ботов?',
  },
  {
    question: 'Что не делает SSR Check?',
    answer:
      'Инструмент не эмулирует поисковые системы на 100% как их реальная инфраструктура. Это быстрая проверка ответа страницы по разным User-Agent, которая помогает поймать очевидные и практические проблемы.',
  },
];

const parameterRows = [
  { key: 'http', label: 'HTTP' },
  { key: 'text', label: 'Текст' },
  { key: 'links', label: 'Ссылки' },
  { key: 'h1', label: 'H1' },
  { key: 'title', label: 'Title' },
  { key: 'access', label: 'Access' },
] as const;

function formatBoolean(value: boolean) {
  return value ? 'есть' : 'нет';
}

function normalizeAccess(value?: string | null) {
  return value || 'ok';
}

function getVisibleRules(rules: MatchedRule[] | undefined) {
  return (rules || [])
    .filter((rule) => !['R001', 'R902'].includes(rule.id))
    .filter(
      (rule, index, list) =>
        list.findIndex(
          (candidate) =>
            candidate.summary === rule.summary &&
            candidate.recommendation === rule.recommendation,
        ) === index,
    )
    .sort((left, right) => {
      const order: Record<string, number> = {
        critical: 3,
        high: 2,
        medium: 2,
        low: 1,
        info: 0,
      };

      return (order[right.severity] || 0) - (order[left.severity] || 0);
    });
}

function getSeverityBadge(severity?: string) {
  if (severity === 'critical') {
    return {
      label: 'critical',
      className: 'border-red-200 bg-red-50 text-red-700',
    };
  }

  return {
    label: 'warn',
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  };
}

function getBannerConfig(data: CheckResponse) {
  if (data.rule_verdict === 'ok') {
    return {
      title: 'Всё в порядке',
      description:
        'Страница выглядит одинаково для пользователя и поисковых ботов. Явных рисков индексации не найдено.',
      icon: CheckCircle2,
      className: 'border-green-200 bg-green-50 text-green-800',
      iconClassName: 'text-green-600',
    };
  }

  if (data.rule_verdict === 'fail') {
    return {
      title: 'Боты не видят страницу',
      description:
        'У поисковых ботов есть критичная проблема доступа или рендера. Это уже влияет на индексируемость страницы.',
      icon: ShieldAlert,
      className: 'border-red-200 bg-red-50 text-red-800',
      iconClassName: 'text-red-600',
    };
  }

  return {
    title: 'Есть расхождения',
    description:
      'Страница открывается, но часть SEO-сигналов у ботов отличается от браузера. Это стоит проверить до просадки индексации.',
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    iconClassName: 'text-amber-600',
  };
}

function getCellClass(params: {
  rowKey: (typeof parameterRows)[number]['key'];
  agent: 'browser' | 'yandex' | 'google';
  browser: Snapshot;
  current: Snapshot;
}) {
  const { rowKey, agent, browser, current } = params;

  if (agent === 'browser') {
    if (rowKey === 'http') {
      return current.http_code === 200 ? 'font-semibold text-green-600' : 'font-semibold text-red-600';
    }
    if (rowKey === 'access') {
      return normalizeAccess(current.access_state) === 'ok'
        ? 'font-semibold text-green-600'
        : 'font-semibold text-red-600';
    }

    return 'text-gray-900';
  }

  if (rowKey === 'http') {
    if (current.http_code === 200 && browser.http_code === 200) {
      return 'font-semibold text-green-600';
    }

    if (
      (browser.http_code === 200 && current.http_code !== 200) ||
      (current.http_code !== browser.http_code && current.http_code !== 200)
    ) {
      return 'font-semibold text-red-600';
    }

    return 'text-gray-900';
  }

  if (rowKey === 'text') {
    if (browser.text_len > 0 && current.text_len < browser.text_len * 0.7) {
      return 'font-semibold text-red-600';
    }

    return 'text-gray-900';
  }

  if (rowKey === 'links') {
    if (browser.links_count > 0 && current.links_count < browser.links_count) {
      return 'font-semibold text-red-600';
    }

    return 'text-gray-900';
  }

  if (rowKey === 'h1') {
    if (browser.has_h1 && !current.has_h1) {
      return 'font-semibold text-red-600';
    }

    return 'text-gray-900';
  }

  if (rowKey === 'title') {
    if (browser.has_title && !current.has_title) {
      return 'font-semibold text-red-600';
    }

    return 'text-gray-900';
  }

  if (rowKey === 'access') {
    if (normalizeAccess(browser.access_state) === 'ok' && normalizeAccess(current.access_state) !== 'ok') {
      return 'font-semibold text-red-600';
    }

    if (normalizeAccess(current.access_state) === 'ok') {
      return 'font-semibold text-green-600';
    }

    return 'text-gray-900';
  }

  return 'text-gray-900';
}

function getCellValue(rowKey: (typeof parameterRows)[number]['key'], snapshot: Snapshot) {
  if (rowKey === 'http') return snapshot.http_code || 0;
  if (rowKey === 'text') return snapshot.text_len;
  if (rowKey === 'links') return snapshot.links_count;
  if (rowKey === 'h1') return formatBoolean(snapshot.has_h1);
  if (rowKey === 'title') return formatBoolean(snapshot.has_title);
  return normalizeAccess(snapshot.access_state);
}

export default function SsrCheckPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CheckResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const visibleRules = useMemo(
    () => getVisibleRules(data?.matched_rules),
    [data?.matched_rules],
  );

  const banner = useMemo(() => (data ? getBannerConfig(data) : null), [data]);

  const onCheck = async () => {
    if (!url.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);
    setShowDetails(false);

    try {
      const response = await fetch('/api/ssr-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const payload = (await response.json()) as CheckResponse;

      if (!response.ok || payload.ok === false) {
        setError(payload.error || 'Ошибка');
        return;
      }

      setData(payload);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">Bot vs Browser SEO Check</h1>
        <p className="mt-2 text-sm text-gray-500">
          Проверьте, как вашу страницу видят Google, Яндекс и браузер.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button className="rounded-full" onClick={onCheck} disabled={loading}>
              {loading ? 'Проверяем...' : 'Проверить'}
            </Button>
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-black px-4 py-3 text-sm text-white">
              {error}
            </div>
          )}

          {data && banner && (
            <>
              <section
                className={`mt-6 rounded-2xl border px-5 py-4 ${banner.className}`}
              >
                <div className="flex items-start gap-3">
                  <banner.icon className={`mt-0.5 h-6 w-6 shrink-0 ${banner.iconClassName}`} />
                  <div>
                    <div className="text-lg font-semibold">{banner.title}</div>
                    <p className="mt-1 text-sm leading-6 text-current/90">
                      {banner.description}
                    </p>
                  </div>
                </div>
              </section>

              {visibleRules.length > 0 && (
                <section className="mt-6 space-y-3">
                  {visibleRules.map((rule) => {
                    const badge = getSeverityBadge(rule.severity);

                    return (
                      <article
                        key={rule.id}
                        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                          <h2 className="text-base font-semibold text-gray-900">
                            {rule.summary}
                          </h2>
                        </div>
                        <div className="mt-3 text-sm text-gray-600">
                          Что проверить: {rule.recommendation}
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}

              <div className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setShowDetails((prev) => !prev)}
                >
                  {showDetails ? 'Скрыть детали' : 'Показать детали'}
                  {showDetails ? (
                    <ChevronUp className="ml-2 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </div>

              {showDetails && (
                <section className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-gray-600">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Параметр</th>
                        <th className="px-4 py-3 text-left font-medium">Browser</th>
                        <th className="px-4 py-3 text-left font-medium">Яндекс</th>
                        <th className="px-4 py-3 text-left font-medium">Google</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parameterRows.map((row) => (
                        <tr key={row.key} className="border-t border-gray-100">
                          <th className="px-4 py-3 text-left font-medium text-gray-900">
                            {row.label}
                          </th>
                          <td
                            className={`px-4 py-3 ${getCellClass({
                              rowKey: row.key,
                              agent: 'browser',
                              browser: data.checks.browser,
                              current: data.checks.browser,
                            })}`}
                          >
                            {getCellValue(row.key, data.checks.browser)}
                          </td>
                          <td
                            className={`px-4 py-3 ${getCellClass({
                              rowKey: row.key,
                              agent: 'yandex',
                              browser: data.checks.browser,
                              current: data.checks.yandex,
                            })}`}
                          >
                            {getCellValue(row.key, data.checks.yandex)}
                          </td>
                          <td
                            className={`px-4 py-3 ${getCellClass({
                              rowKey: row.key,
                              agent: 'google',
                              browser: data.checks.browser,
                              current: data.checks.google,
                            })}`}
                          >
                            {getCellValue(row.key, data.checks.google)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </>
          )}
        </div>

        <ToolFaq title="FAQ по SSR Check" items={SSR_FAQ} />
      </main>
    </div>
  );
}
