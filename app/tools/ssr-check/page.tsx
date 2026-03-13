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

type CheckResponse = {
  ok: boolean;
  url: string;
  checked_at: string;
  verdict: 'ok' | 'mismatch';
  rule_verdict?: 'ok' | 'warn' | 'fail';
  rule_summary?: string;
  rule_recommendation?: string;
  reasons: string[];
  checks: {
    browser: Snapshot;
    yandex: Snapshot;
    google: Snapshot;
  };
  error?: string;
};

type SeverityFilter = 'all' | 'critical' | 'important';

type AgentProblemCard = {
  key: string;
  label: string;
  severity: Exclude<SeverityFilter, 'all'>;
  title: string;
  facts: string[];
  recommendation: string;
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
      'Позволяет быстро понять, есть ли расхождение между браузером и ботами, и сразу увидеть первичную причину: ошибка сервера, пустой контент, отсутствие title или проблемы с доступом.',
  },
  {
    question: 'Какие вопросы помогает ответить SSR Check?',
    answer:
      'Видит ли Googlebot страницу так же, как обычный пользователь?\nНе отдается ли ботам ошибка 4xx/5xx?\nЕсть ли на странице контент для индексации?\nНе теряется ли SSR-рендер для поисковых ботов?',
  },
  {
    question: 'Что не делает SSR Check?',
    answer:
      'Не эмулирует поисковые системы на 100% как их реальная инфраструктура. Это быстрая проверка ответа страницы по разным User-Agent, которая помогает поймать очевидные и практические проблемы.',
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

function isCriticalAccessIssue(snapshot: Snapshot) {
  return snapshot.http_code >= 400 || snapshot.http_code === 0 || normalizeAccess(snapshot.access_state) !== 'ok';
}

function buildProblemFacts(browser: Snapshot, current: Snapshot) {
  const facts: string[] = [];

  if (current.http_code !== 200) {
    facts.push(`HTTP ${current.http_code || 0}`);
  }

  if (browser.text_len > 0 && current.text_len < browser.text_len) {
    facts.push(`текст: ${current.text_len}`);
  }

  if (browser.links_count > 0 && current.links_count < browser.links_count) {
    facts.push(`ссылки: ${current.links_count}`);
  }

  if (browser.has_h1 && !current.has_h1) {
    facts.push('H1: нет');
  }

  if (browser.has_title && !current.has_title) {
    facts.push('title: нет');
  }

  if (normalizeAccess(current.access_state) !== 'ok' && current.http_code === 200) {
    facts.push(`access: ${normalizeAccess(current.access_state)}`);
  }

  return facts;
}

function buildAgentCard(params: {
  key: string;
  label: string;
  browser: Snapshot;
  current: Snapshot;
}): AgentProblemCard | null {
  const { key, label, browser, current } = params;
  const facts = buildProblemFacts(browser, current);

  const severeContentLoss =
    browser.text_len >= 100 && current.text_len < browser.text_len * 0.3;
  const moderateContentLoss =
    browser.text_len >= 100 && current.text_len < browser.text_len * 0.7;
  const linksReduced =
    browser.links_count > 0 && current.links_count < browser.links_count;
  const missingCoreTags =
    (browser.has_h1 && !current.has_h1) ||
    (browser.has_title && !current.has_title);

  if (isCriticalAccessIssue(current)) {
    return {
      key,
      label,
      severity: 'critical',
      title: `${label} не видит страницу`,
      facts: facts.length ? facts : [`HTTP ${current.http_code || 0}`],
      recommendation: 'Проверить доступ на уровне CDN, сервера и защитных правил.',
    };
  }

  if (severeContentLoss) {
    return {
      key,
      label,
      severity: 'critical',
      title: `${label} получает почти пустую страницу`,
      facts: facts.length ? facts : [`текст: ${current.text_len}`],
      recommendation: 'Проверить SSR, пререндер и исходный HTML для этого user-agent.',
    };
  }

  if (moderateContentLoss || linksReduced || missingCoreTags) {
    return {
      key,
      label,
      severity: 'important',
      title: `${label} видит урезанную версию страницы`,
      facts: facts,
      recommendation: 'Сравнить HTML для браузера и бота и проверить рендер ключевых SEO-элементов.',
    };
  }

  return null;
}

function buildBrowserCard(browser: Snapshot): AgentProblemCard | null {
  if (!isCriticalAccessIssue(browser)) {
    return null;
  }

  const facts = [`HTTP ${browser.http_code || 0}`];

  if (normalizeAccess(browser.access_state) !== 'ok' && browser.http_code === 200) {
    facts.push(`access: ${normalizeAccess(browser.access_state)}`);
  }

  return {
    key: 'browser',
    label: 'Браузер',
    severity: 'critical',
    title: 'Браузер не открывает страницу',
    facts,
    recommendation: 'Проверить доступность страницы и цепочку редиректов.',
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
      return current.http_code === 200
        ? 'font-semibold text-green-600'
        : 'font-semibold text-red-600';
    }

    if (rowKey === 'access') {
      return normalizeAccess(current.access_state) === 'ok'
        ? 'font-semibold text-green-600'
        : 'font-semibold text-red-600';
    }

    return 'text-gray-900';
  }

  if (rowKey === 'http') {
    if (browser.http_code === 200 && current.http_code !== 200) {
      return 'font-semibold text-red-600';
    }

    if (current.http_code === 200) {
      return 'font-semibold text-green-600';
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
    if (
      normalizeAccess(browser.access_state) === 'ok' &&
      normalizeAccess(current.access_state) !== 'ok'
    ) {
      return 'font-semibold text-red-600';
    }

    if (normalizeAccess(current.access_state) === 'ok') {
      return 'font-semibold text-green-600';
    }

    return 'text-gray-900';
  }

  return 'text-gray-900';
}

function getCellValue(
  rowKey: (typeof parameterRows)[number]['key'],
  snapshot: Snapshot,
) {
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
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  const banner = useMemo(() => (data ? getBannerConfig(data) : null), [data]);

  const groupedCards = useMemo(() => {
    if (!data) return [];

    const cards: AgentProblemCard[] = [];
    const browserCard = buildBrowserCard(data.checks.browser);

    if (browserCard) {
      cards.push(browserCard);
    }

    const yandexCard = buildAgentCard({
      key: 'yandex',
      label: 'Яндекс',
      browser: data.checks.browser,
      current: data.checks.yandex,
    });
    const googleCard = buildAgentCard({
      key: 'google',
      label: 'Google',
      browser: data.checks.browser,
      current: data.checks.google,
    });

    if (yandexCard) cards.push(yandexCard);
    if (googleCard) cards.push(googleCard);

    if (cards.length === 0 && data.rule_verdict !== 'ok') {
      cards.push({
        key: 'general',
        label: 'Общая проверка',
        severity: data.rule_verdict === 'fail' ? 'critical' : 'important',
        title: data.rule_summary || 'Требуется ручная проверка',
        facts: [],
        recommendation:
          data.rule_recommendation ||
          'Проверить HTML страницы для браузера и поисковых ботов.',
      });
    }

    return cards;
  }, [data]);

  const criticalCount = groupedCards.filter(
    (card) => card.severity === 'critical',
  ).length;
  const importantCount = groupedCards.filter(
    (card) => card.severity === 'important',
  ).length;

  const filteredCards = groupedCards.filter((card) =>
    severityFilter === 'all' ? true : card.severity === severityFilter,
  );

  const onCheck = async () => {
    if (!url.trim()) {
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);
    setShowDetails(false);
    setSeverityFilter('all');

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
        <h1 className="text-3xl font-semibold text-gray-900">
          Как видят вашу страницу поисковые боты
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Сравните, как страницу видят браузер, Googlebot и Яндекс-бот, и быстро
          найдите расхождения, которые мешают индексации.
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
              <section className={`mt-6 rounded-2xl border px-5 py-4 ${banner.className}`}>
                <div className="flex items-start gap-3">
                  <banner.icon
                    className={`mt-0.5 h-6 w-6 shrink-0 ${banner.iconClassName}`}
                  />
                  <div>
                    <div className="text-lg font-semibold">{banner.title}</div>
                    <p className="mt-1 text-sm leading-6 text-current/90">
                      {banner.description}
                    </p>
                  </div>
                </div>
              </section>

              {groupedCards.length > 0 && (
                <>
                  <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
                    <button
                      type="button"
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                        severityFilter === 'all'
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 bg-white text-gray-700'
                      }`}
                      onClick={() => setSeverityFilter('all')}
                    >
                      <span className="text-xs">●</span>
                      Все проблемы
                    </button>

                    {criticalCount > 0 && (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                          severityFilter === 'critical'
                            ? 'border-red-600 bg-red-600 text-white'
                            : 'border-red-200 bg-red-50 text-red-700'
                        }`}
                        onClick={() => setSeverityFilter('critical')}
                      >
                        <span className="text-xs">●</span>
                        {criticalCount} критических
                      </button>
                    )}

                    {importantCount > 0 && (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${
                          severityFilter === 'important'
                            ? 'border-amber-600 bg-amber-600 text-white'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        }`}
                        onClick={() => setSeverityFilter('important')}
                      >
                        <span className="text-xs">●</span>
                        {importantCount} важных
                      </button>
                    )}
                  </div>

                  <section className="mt-4 space-y-3">
                    {filteredCards.map((card) => (
                      <article
                        key={card.key}
                        className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                              card.severity === 'critical'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-amber-200 bg-amber-50 text-amber-700'
                            }`}
                          >
                            {card.severity}
                          </span>
                          <h2 className="text-base font-semibold text-gray-900">
                            {card.title}
                          </h2>
                        </div>

                        {card.facts.length > 0 && (
                          <div className="mt-3 text-sm text-gray-700">
                            {card.facts.join(' · ')}
                          </div>
                        )}

                        <div className="mt-3 text-sm text-gray-600">
                          Что проверить: {card.recommendation}
                        </div>
                      </article>
                    ))}
                  </section>
                </>
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
