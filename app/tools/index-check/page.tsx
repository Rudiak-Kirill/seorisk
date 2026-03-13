'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ToolFaq, { type FaqItem } from '@/components/tool-faq';

type RedirectStep = {
  from_url: string;
  to_url: string;
  status_code: number;
};

type IndexCheckResponse = {
  ok: boolean;
  checked_at: string;
  input_url: string;
  final_url: string;
  status_code: number;
  redirect_chain: RedirectStep[];
  meta_robots: string | null;
  x_robots_tag: string | null;
  canonical_url: string | null;
  canonical_self: boolean | null;
  canonical_ok: boolean;
  robots_url: string;
  robots_found: boolean;
  robots_status_code: number;
  robots_rules_found: boolean;
  robots_rules: string[];
  robots_allowed_for_page: boolean;
  robots_matched_rule: string | null;
  robots_matched_user_agent: string | null;
  sitemap_found: boolean;
  sitemap_source: string | null;
  sitemap_url: string | null;
  sitemap_status_code: number;
  sitemap_type: string | null;
  page_in_sitemap: boolean;
  sitemap_urls_count: number;
  http_ok: boolean;
  indexable_meta: boolean;
  verdict: 'ok' | 'warn' | 'fail';
  reasons: string[];
  errors?: {
    page?: string | null;
    robots?: string | null;
  };
  error?: string;
};

function stateClass(ok: boolean) {
  return ok ? 'text-green-600' : 'text-red-600';
}

function boolLabel(value: boolean | null | undefined, positive = 'Да', negative = 'Нет') {
  if (value === null || value === undefined) return 'Неизвестно';
  return value ? positive : negative;
}

function verdictClass(verdict: IndexCheckResponse['verdict']) {
  if (verdict === 'ok') return 'border-green-200 bg-green-50 text-green-700';
  if (verdict === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-red-200 bg-red-50 text-red-700';
}

function verdictLabel(verdict: IndexCheckResponse['verdict']) {
  if (verdict === 'ok') return 'OK';
  if (verdict === 'warn') return 'WARN';
  return 'FAIL';
}

function reasonLabel(reason: string) {
  const labels: Record<string, string> = {
    http_not_ok: 'HTTP-ответ страницы проблемный',
    noindex_detected: 'Найден noindex в meta или X-Robots-Tag',
    blocked_by_robots: 'Страница запрещена в robots.txt',
    not_in_sitemap: 'Страница не найдена в sitemap',
  };

  return labels[reason] || reason;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-dashed border-gray-200 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 text-sm text-gray-500">{label}</div>
      <div className="min-w-0 break-words text-sm text-gray-900 sm:max-w-[65%] sm:text-right [&_*]:break-all">
        {value}
      </div>
    </div>
  );
}

function summaryText(data: IndexCheckResponse) {
  return {
    robots: data.robots_found
      ? data.robots_allowed_for_page
        ? data.robots_matched_rule
          ? `Сработало правило: ${data.robots_matched_rule}`
          : 'Блокирующее правило не найдено'
        : `Блокирует правило: ${data.robots_matched_rule || 'не найдено'}`
      : 'robots.txt не найден',
    sitemap: data.sitemap_found
      ? `Найдено URL: ${data.sitemap_urls_count || 0}`
      : 'Sitemap не найден',
    canonical: !data.canonical_url
      ? 'Canonical не найден'
      : data.canonical_self
        ? 'Canonical совпадает с final URL'
        : 'Canonical не совпадает с final URL',
  };
}

const INDEX_FAQ: FaqItem[] = [
  {
    question: 'Какую проблему решает Index Check?',
    answer:
      'Страница может быть технически открыта в браузере, но при этом не индексироваться из-за robots.txt, meta robots, canonical, отсутствия в sitemap или других базовых ограничений. Часто такие проблемы приходится проверять вручную в нескольких местах.',
  },
  {
    question: 'Что делает Index Check?',
    answer:
      'Инструмент проверяет базовую индексируемость страницы: HTTP-ответ, meta robots, X-Robots-Tag, canonical, robots.txt и наличие URL в sitemap.',
  },
  {
    question: 'Кому нужен этот инструмент?',
    answer:
      'SEO-специалистам, контент-менеджерам, владельцам сайтов, редакторам, разработчикам и всем, кто публикует страницы и хочет быстро понять, открыта ли страница для индексации.',
  },
  {
    question: 'Когда Index Check особенно полезен?',
    answer:
      'После публикации новой страницы.\nПри проверке страниц, которые не заходят в индекс.\nПосле миграций, редизайнов, смены CMS, SEO-плагинов, robots.txt или sitemap.',
  },
  {
    question: 'Какой результат даёт Index Check?',
    answer:
      'Инструмент позволяет за один экран понять, индексируемая ли страница технически: не закрыта ли она от ботов, не стоит ли noindex, нет ли проблем с canonical и присутствует ли URL в sitemap.',
  },
  {
    question: 'На какие вопросы помогает ответить Index Check?',
    answer:
      'Отдает ли страница нормальный HTTP-код?\nНет ли noindex или X-Robots-Tag?\nНе закрыта ли страница в robots.txt?\nЕсть ли canonical и не ломает ли он индексацию?\nНайдена ли страница в sitemap?',
  },
  {
    question: 'Что не делает Index Check?',
    answer:
      'Инструмент не гарантирует фактическое попадание страницы в поиск и не заменяет данные поисковой системы. Он делает быстрый технический чек базовых условий индексируемости.',
  },
];

export default function IndexCheckPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<IndexCheckResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const onCheck = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setData(null);
    setShowDetails(false);

    try {
      const response = await fetch('/api/index-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const raw = await response.text();

      let payload: IndexCheckResponse | null = null;
      try {
        payload = JSON.parse(raw) as IndexCheckResponse;
      } catch {
        setError(raw || 'Ошибка');
        return;
      }

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

  const summary = data ? summaryText(data) : null;

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">Проверка индексации страницы</h1>
        <p className="mt-2 text-sm text-gray-500">
          Проверьте, почему страница не индексируется: HTTP-ответ, meta robots, robots.txt,
          canonical и наличие в sitemap.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="https://example.com/page"
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

          {data && summary && (
            <>
              <div
                className={`mt-6 rounded-xl border px-4 py-3 text-sm font-medium ${verdictClass(data.verdict)}`}
              >
                {verdictLabel(data.verdict)}:{' '}
                {data.reasons.length
                  ? data.reasons.map(reasonLabel).join(', ')
                  : 'Явных проблем не найдено'}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-900">HTTP ответ</div>
                  <div className={`mt-3 text-2xl font-semibold ${stateClass(data.http_ok)}`}>
                    {data.status_code || '0'}
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    {data.http_ok
                      ? 'Финальный ответ страницы нормальный'
                      : 'Есть проблема с HTTP-ответом страницы'}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-900">Meta / X-Robots</div>
                  <div
                    className={`mt-3 text-2xl font-semibold ${stateClass(data.indexable_meta)}`}
                  >
                    {boolLabel(data.indexable_meta, 'Открыта', 'Закрыта')}
                  </div>
                  <div className="mt-2 text-sm text-gray-600">
                    {data.indexable_meta
                      ? 'Noindex не найден'
                      : 'Найден запрет индексации'}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-900">Canonical</div>
                  <div
                    className={`mt-3 text-2xl font-semibold ${stateClass(data.canonical_ok)}`}
                  >
                    {data.canonical_ok ? 'OK' : 'Нет'}
                  </div>
                  <div className="mt-2 text-sm text-gray-600">{summary.canonical}</div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-900">Robots.txt</div>
                  <div
                    className={`mt-3 text-2xl font-semibold ${stateClass(
                      data.robots_allowed_for_page
                    )}`}
                  >
                    {boolLabel(data.robots_allowed_for_page, 'Разрешена', 'Запрещена')}
                  </div>
                  <div className="mt-2 break-words text-sm text-gray-600">
                    {summary.robots}
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="text-sm font-semibold text-gray-900">Sitemap</div>
                  <div
                    className={`mt-3 text-2xl font-semibold ${stateClass(data.page_in_sitemap)}`}
                  >
                    {boolLabel(data.page_in_sitemap, 'Есть', 'Нет')}
                  </div>
                  <div className="mt-2 text-sm text-gray-600">{summary.sitemap}</div>
                </div>
              </div>

              <div className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setShowDetails((prev) => !prev)}
                >
                  {showDetails ? 'Скрыть детали' : 'Показать детали'}
                </Button>
              </div>

              {showDetails && (
                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Страница</h2>
                    <div className="mt-3">
                      <DetailRow label="Input URL" value={data.input_url} />
                      <DetailRow label="Final URL" value={data.final_url} />
                      <DetailRow label="HTTP status" value={data.status_code || '-'} />
                      <DetailRow
                        label="Redirect chain"
                        value={
                          data.redirect_chain.length ? (
                            <div className="space-y-1">
                              {data.redirect_chain.map((step, index) => (
                                <div key={`${step.from_url}-${index}`}>
                                  {step.status_code}: {step.from_url} → {step.to_url}
                                </div>
                              ))}
                            </div>
                          ) : (
                            'Нет'
                          )
                        }
                      />
                      <DetailRow label="Meta robots" value={data.meta_robots || 'Не найден'} />
                      <DetailRow
                        label="X-Robots-Tag"
                        value={data.x_robots_tag || 'Не найден'}
                      />
                      <DetailRow label="Canonical" value={data.canonical_url || 'Не найден'} />
                      <DetailRow
                        label="Canonical self"
                        value={boolLabel(data.canonical_self, 'Да', 'Нет')}
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Robots.txt</h2>
                    <div className="mt-3">
                      <DetailRow label="Robots URL" value={data.robots_url} />
                      <DetailRow
                        label="Robots found"
                        value={boolLabel(data.robots_found, 'Да', 'Нет')}
                      />
                      <DetailRow label="Robots status" value={data.robots_status_code || '-'} />
                      <DetailRow
                        label="Rules found"
                        value={boolLabel(data.robots_rules_found, 'Да', 'Нет')}
                      />
                      <DetailRow
                        label="Allowed for page"
                        value={boolLabel(data.robots_allowed_for_page, 'Да', 'Нет')}
                      />
                      <DetailRow
                        label="Matched rule"
                        value={data.robots_matched_rule || 'Не найдено'}
                      />
                      <DetailRow
                        label="Matched user-agent"
                        value={data.robots_matched_user_agent || 'Не найдено'}
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Sitemap</h2>
                    <div className="mt-3">
                      <DetailRow
                        label="Sitemap found"
                        value={boolLabel(data.sitemap_found, 'Да', 'Нет')}
                      />
                      <DetailRow label="Source" value={data.sitemap_source || 'Не найден'} />
                      <DetailRow label="Sitemap URL" value={data.sitemap_url || 'Не найден'} />
                      <DetailRow
                        label="Sitemap status"
                        value={data.sitemap_status_code || '-'}
                      />
                      <DetailRow
                        label="Sitemap type"
                        value={data.sitemap_type || 'Неизвестно'}
                      />
                      <DetailRow label="URL count" value={data.sitemap_urls_count || 0} />
                      <DetailRow
                        label="Page in sitemap"
                        value={boolLabel(data.page_in_sitemap, 'Да', 'Нет')}
                      />
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </div>

        <ToolFaq title="FAQ по Index Check" items={INDEX_FAQ} />
      </main>
    </div>
  );
}
