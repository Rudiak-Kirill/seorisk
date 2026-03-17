'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Verdict = 'ok' | 'warn' | 'fail';
type Severity = 'critical' | 'warn' | 'improve';
type CacheState = 'good' | 'partial' | 'none' | 'unknown';
type TtfbState = 'fast' | 'normal' | 'slow' | 'critical' | 'unknown';

type ProblemCard = {
  severity: Severity;
  title: string;
  action: string;
  reason: string;
};

type Metrics = {
  performance_score: number | null;
  fcp_ms: number | null;
  lcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  speed_index_ms: number | null;
};

type Opportunity = {
  id: string;
  title: string;
  savings_ms: number | null;
  savings_bytes: number | null;
};

type SpeedCheckResponse = {
  ok: boolean;
  phase: 'quick' | 'full';
  checked_at: string;
  input_url: string;
  final_url: string;
  verdict: Verdict;
  verdict_title: string;
  verdict_summary: string;
  loading_text?: string | null;
  problem_cards: ProblemCard[];
  details: {
    quick: {
      http_status: number;
      final_url: string;
      ttfb_ms: number | null;
      ttfb_state: TtfbState;
      cache_state: CacheState;
      cache_control: string | null;
      content_encoding: string | null;
      cms: string;
      cdn: string | null;
    };
    full: {
      mobile: Metrics | null;
      desktop: Metrics | null;
      mobile_gap: number | null;
      page_weight_bytes: number | null;
      opportunities: Opportunity[];
      google_fonts_detected: boolean;
      psi_available: boolean;
      psi_error: string | null;
      mobile_error: string | null;
      desktop_error: string | null;
    };
  };
  error?: string;
};

function verdictClass(verdict: Verdict) {
  if (verdict === 'fail') return 'border-red-200 bg-red-50 text-red-700';
  if (verdict === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-green-200 bg-green-50 text-green-700';
}

function severityClass(severity: Severity) {
  if (severity === 'critical') return 'bg-red-100 text-red-700';
  if (severity === 'warn') return 'bg-amber-100 text-amber-700';
  return 'bg-blue-100 text-blue-700';
}

function severityLabel(severity: Severity) {
  if (severity === 'critical') return 'critical';
  if (severity === 'warn') return 'warn';
  return 'improve';
}

function formatMilliseconds(value: number | null) {
  if (value === null) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} с`;
  return `${Math.round(value)} мс`;
}

function formatCls(value: number | null) {
  if (value === null) return '—';
  return String(Math.round(value * 1000) / 1000).replace('.', ',');
}

function formatScore(value: number | null) {
  if (value === null) return '—';
  return `${value}`;
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) return '—';
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1).replace('.', ',')} МБ`;
  if (value >= 1024) return `${Math.round(value / 1024)} КБ`;
  return `${value} Б`;
}

function cacheLabel(value: CacheState) {
  if (value === 'good') return 'Хороший';
  if (value === 'partial') return 'Частичный';
  if (value === 'none') return 'Нет';
  return 'Неизвестно';
}

function ttfbLabel(value: TtfbState) {
  if (value === 'fast') return 'Быстро';
  if (value === 'normal') return 'Норма';
  if (value === 'slow') return 'Медленно';
  if (value === 'critical') return 'Критично';
  return 'Неизвестно';
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-dashed border-gray-200 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 text-sm text-gray-500">{label}</div>
      <div className="min-w-0 break-words text-sm text-gray-900 sm:max-w-[65%] sm:text-right">
        {value}
      </div>
    </div>
  );
}

export default function SpeedCheckPage() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fullLoading, setFullLoading] = useState(false);
  const [data, setData] = useState<SpeedCheckResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const requestIdRef = useRef(0);

  const onCheck = async () => {
    if (!url.trim()) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setLoading(true);
    setFullLoading(false);
    setShowDetails(false);
    setError(null);
    setData(null);

    try {
      const quickResponse = await fetch('/api/speed-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, phase: 'quick' }),
      });
      const quickPayload = (await quickResponse.json()) as SpeedCheckResponse;

      if (requestId !== requestIdRef.current) return;

      if (!quickResponse.ok || quickPayload.ok === false) {
        setError(quickPayload.error || 'Ошибка сервиса');
        return;
      }

      setData(quickPayload);
      setFullLoading(true);
      setLoading(false);

      const fullResponse = await fetch('/api/speed-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, phase: 'full' }),
      });
      const fullPayload = (await fullResponse.json()) as SpeedCheckResponse;

      if (requestId !== requestIdRef.current) return;

      if (!fullResponse.ok || fullPayload.ok === false) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                loading_text: null,
                details: {
                  ...prev.details,
                  full: {
                    ...prev.details.full,
                    psi_error: fullPayload.error || 'Не удалось получить Lighthouse-данные',
                    mobile_error: null,
                    desktop_error: null,
                  },
                },
              }
            : prev
        );
        return;
      }

      setData(fullPayload);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(String(err));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setFullLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">Проверка скорости сайта</h1>
        <p className="mt-2 text-sm text-gray-500">
          Быстрый вердикт по TTFB, кешированию и CMS, затем полный Lighthouse-анализ без перезагрузки страницы.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button className="rounded-full" onClick={onCheck} disabled={loading || fullLoading}>
              {loading ? 'Проверяем...' : fullLoading ? 'Анализируем...' : 'Проверить'}
            </Button>
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-black px-4 py-3 text-sm text-white">{error}</div>
          )}

          {data && (
            <>
              {fullLoading && data.loading_text ? (
                <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  {data.loading_text}
                </div>
              ) : null}

              <div className={`mt-6 rounded-xl border px-4 py-4 ${verdictClass(data.verdict)}`}>
                <div className="text-base font-semibold">{data.verdict_title}</div>
                <div className="mt-1 text-sm">{data.verdict_summary}</div>
              </div>

              {data.problem_cards.length > 0 ? (
                <section className="mt-6 space-y-3">
                  {data.problem_cards.map((card, index) => (
                    <div
                      key={`${card.title}-${index}`}
                      className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`mt-0.5 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${severityClass(
                            card.severity
                          )}`}
                        >
                          {severityLabel(card.severity)}
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">{card.title}</div>
                          <div className="mt-1 text-sm text-gray-600">→ {card.action}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </section>
              ) : (
                <div className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-4 text-sm text-green-700">
                  ✅ Сайт загружается быстро. Явных проблем со скоростью не обнаружено.
                </div>
              )}

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
                    <h2 className="text-lg font-semibold text-gray-900">Быстрый чек</h2>
                    <div className="mt-3">
                      <DetailRow label="Final URL" value={data.details.quick.final_url} />
                      <DetailRow label="HTTP статус" value={data.details.quick.http_status} />
                      <DetailRow label="TTFB" value={formatMilliseconds(data.details.quick.ttfb_ms)} />
                      <DetailRow label="Оценка TTFB" value={ttfbLabel(data.details.quick.ttfb_state)} />
                      <DetailRow label="Кеш" value={cacheLabel(data.details.quick.cache_state)} />
                      <DetailRow
                        label="Cache-Control"
                        value={data.details.quick.cache_control || '—'}
                      />
                      <DetailRow
                        label="Content-Encoding"
                        value={data.details.quick.content_encoding || '—'}
                      />
                      <DetailRow label="CMS" value={data.details.quick.cms} />
                      <DetailRow label="CDN" value={data.details.quick.cdn || 'Не найден'} />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">PageSpeed</h2>
                    <div className="mt-3">
                      <DetailRow
                        label="Mobile score"
                        value={formatScore(data.details.full.mobile?.performance_score ?? null)}
                      />
                      <DetailRow
                        label="Desktop score"
                        value={formatScore(data.details.full.desktop?.performance_score ?? null)}
                      />
                      <DetailRow
                        label="Mobile gap"
                        value={
                          data.details.full.mobile_gap !== null
                            ? `${data.details.full.mobile_gap} пунктов`
                            : '—'
                        }
                      />
                      <DetailRow
                        label="FCP mobile"
                        value={formatMilliseconds(data.details.full.mobile?.fcp_ms ?? null)}
                      />
                      <DetailRow
                        label="LCP mobile"
                        value={formatMilliseconds(data.details.full.mobile?.lcp_ms ?? null)}
                      />
                      <DetailRow
                        label="CLS mobile"
                        value={formatCls(data.details.full.mobile?.cls ?? null)}
                      />
                      <DetailRow
                        label="TBT mobile"
                        value={formatMilliseconds(data.details.full.mobile?.tbt_ms ?? null)}
                      />
                      <DetailRow
                        label="Вес страницы"
                        value={formatBytes(data.details.full.page_weight_bytes)}
                      />
                      <DetailRow
                        label="Google Fonts"
                        value={data.details.full.google_fonts_detected ? 'Найдены' : 'Нет'}
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Opportunities</h2>
                    {data.details.full.psi_error ? (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                        {data.details.full.psi_error}
                      </div>
                    ) : null}

                    {data.details.full.mobile_error || data.details.full.desktop_error ? (
                      <div className="mt-3 space-y-2">
                        {data.details.full.mobile_error ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                            Mobile: {data.details.full.mobile_error}
                          </div>
                        ) : null}
                        {data.details.full.desktop_error ? (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                            Desktop: {data.details.full.desktop_error}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="mt-3 space-y-3 text-sm text-gray-600">
                      {data.details.full.opportunities.length > 0 ? (
                        data.details.full.opportunities.map((item) => (
                          <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                            <div className="font-medium text-gray-900">{item.title}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {item.savings_ms !== null
                                ? `Экономия: ${formatMilliseconds(item.savings_ms)}`
                                : 'Экономия по времени не указана'}
                              {item.savings_bytes !== null
                                ? ` · Экономия: ${formatBytes(item.savings_bytes)}`
                                : ''}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-gray-200 p-3 text-sm text-gray-600">
                          Явных Lighthouse opportunities не найдено.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
