'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import ToolProgress from '@/components/tool-progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Severity = 'critical' | 'warn';
type RiskLevel = 'critical' | 'warn' | 'ok' | 'none';
type Category = 'regional' | 'technical' | 'environment' | 'application' | 'content' | 'unknown';
type State = 'working' | 'redirect' | 'closed' | 'missing' | 'timeout' | 'error';

type RiskCard = {
  severity: Severity;
  host: string;
  title: string;
  description: string;
  action: string;
};

type RegionalItem = {
  host: string;
  city: string;
  state: State;
  status: number | null;
  hreflang: boolean | null;
  duplicate_main: boolean;
  canonical: string | null;
  in_main_sitemap: boolean | null;
  note: string;
  risk_level: RiskLevel;
};

type SubdomainRow = {
  host: string;
  source: 'crt.sh' | 'bruteforce' | 'mixed';
  status: number | null;
  state: State;
  redirect_target: string | null;
  category: Category;
  title: string | null;
  robots_found: boolean;
  robots_blocked: boolean;
  same_title_as_main: boolean;
  hreflang: boolean | null;
  canonical: string | null;
  noindex: boolean;
  regional_city: string | null;
  risk_level: RiskLevel;
  risk_label: string | null;
};

type SubdomainCheckResponse = {
  ok: boolean;
  checked_at: string;
  input_domain: string;
  domain: string;
  summary: {
    found: number;
    checked: number;
    working: number;
    redirects: number;
    unavailable: number;
    crt_found: number;
    brute_found: number;
    message: string | null;
  };
  risks: RiskCard[];
  regional: {
    found: number;
    verdict: string | null;
    items: RegionalItem[];
  };
  subdomains: SubdomainRow[];
  error?: string;
};

function normalizeDomainInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const prepared = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(prepared);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return trimmed.toLowerCase().replace(/^www\./, '');
  }
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function categoryLabel(category: Category) {
  switch (category) {
    case 'regional':
      return 'Региональный';
    case 'technical':
      return 'Технический';
    case 'environment':
      return 'Среда';
    case 'application':
      return 'Приложение';
    case 'content':
      return 'Контентный';
    default:
      return 'Неизвестный';
  }
}

function riskBadge(level: RiskLevel) {
  if (level === 'critical') return '🔴';
  if (level === 'warn') return '⚠️';
  if (level === 'ok') return '✅';
  return '—';
}

function severityClass(severity: Severity) {
  return severity === 'critical'
    ? 'bg-red-100 text-red-700 border-red-200'
    : 'bg-amber-100 text-amber-700 border-amber-200';
}

function stateLabel(state: State, status: number | null) {
  if (state === 'working') return status ? String(status) : '200';
  if (state === 'redirect') return status ? String(status) : '301';
  if (state === 'closed') return status ? String(status) : '403';
  if (state === 'missing') return status ? String(status) : '404';
  if (state === 'timeout') return 'таймаут';
  return status ? String(status) : 'ошибка';
}

function stateTone(state: State) {
  if (state === 'working') return 'text-green-600';
  if (state === 'redirect') return 'text-amber-600';
  if (state === 'closed') return 'text-gray-600';
  return 'text-red-600';
}

export default function SubdomainCheckPage() {
  const searchParams = useSearchParams();
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SubdomainCheckResponse | null>(null);
  const [showAll, setShowAll] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const queryDomain = searchParams.get('domain');
    if (queryDomain) {
      setDomain(normalizeDomainInput(queryDomain));
    }
  }, [searchParams]);

  const onCheck = async () => {
    const normalized = normalizeDomainInput(domain);
    if (!normalized) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setDomain(normalized);
    setLoading(true);
    setError(null);
    setData(null);
    setShowAll(false);

    try {
      const response = await fetch('/api/subdomain-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: normalized }),
      });
      const payload = (await response.json()) as SubdomainCheckResponse;

      if (requestId !== requestIdRef.current) return;

      if (!response.ok || payload.ok === false) {
        setError(payload.error || 'Не удалось проверить поддомены');
        return;
      }

      setData(payload);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(String(err));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">Проверка поддоменов сайта</h1>
        <p className="mt-2 text-sm text-gray-500">
          Найдите поддомены через crt.sh и типовые паттерны, проверьте dev/test/stage, региональную
          структуру, robots.txt и риски дублей.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Статусы поддоменов ниже проверяются с российского IP на VDS в Москве.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="example.ru"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              onBlur={() => setDomain((current) => normalizeDomainInput(current))}
            />
            {domain.trim() ? (
              <Button asChild variant="outline" className="rounded-full">
                <Link href={`/tools/compare?site=${encodeURIComponent(domain)}`}>Сравнить с конкурентами</Link>
              </Button>
            ) : null}
            <Button className="rounded-full" onClick={onCheck} disabled={loading}>
              {loading ? 'Ищем...' : 'Найти поддомены'}
            </Button>
          </div>

          {error ? (
            <div className="mt-4 rounded-md bg-black px-4 py-3 text-sm text-white">{error}</div>
          ) : null}

          <ToolProgress
            active={loading}
            title="Ищем поддомены..."
            description="Собираем crt.sh, проверяем типовые поддомены и готовим сводку по рискам."
          />

          {data ? (
            <>
              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Итог</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Найдено</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                      {formatNumber(data.summary.found)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Работают</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                      {formatNumber(data.summary.working)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Редиректы</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                      {formatNumber(data.summary.redirects)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Не отвечают / закрыты</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                      {formatNumber(data.summary.unavailable)}
                    </div>
                  </div>
                </div>

                {data.summary.message ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {data.summary.message}
                  </div>
                ) : null}

                <div className="mt-4 text-sm text-gray-500">
                  crt.sh: {formatNumber(data.summary.crt_found)} · брутфорс: {formatNumber(data.summary.brute_found)}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Риски</h2>
                {data.risks.length ? (
                  <div className="mt-4 space-y-4">
                    {data.risks.map((risk) => (
                      <div key={`${risk.host}-${risk.title}`} className="rounded-2xl border border-gray-200 p-4">
                        <div className="flex items-center gap-3">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityClass(risk.severity)}`}
                          >
                            {risk.severity}
                          </span>
                          <div className="text-base font-semibold text-gray-900">{risk.title}</div>
                        </div>
                        <div className="mt-2 text-sm text-gray-600">{risk.description}</div>
                        <div className="mt-2 text-sm text-gray-900">→ {risk.action}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    Явных SEO-рисков по поддоменам не найдено.
                  </div>
                )}
              </div>

              {data.regional.found > 0 ? (
                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900">Региональные поддомены</h2>
                  {data.regional.verdict ? (
                    <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                      {data.regional.verdict}
                    </div>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {data.regional.items.map((item) => (
                      <div
                        key={item.host}
                        className="flex flex-col gap-2 rounded-xl border border-gray-200 px-4 py-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="text-sm font-medium text-gray-900">{item.host}</div>
                          <div className="text-sm text-gray-500">{item.city}</div>
                        </div>
                        <div className="text-sm text-gray-700 md:text-right">
                          <div>
                            {riskBadge(item.risk_level)} {item.note}
                          </div>
                          <div className="text-xs text-gray-500">
                            hreflang: {item.hreflang === null ? '—' : item.hreflang ? 'да' : 'нет'} · sitemap:{' '}
                            {item.in_main_sitemap === null ? '—' : item.in_main_sitemap ? 'да' : 'нет'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setShowAll((prev) => !prev)}
                >
                  {showAll ? 'Скрыть все' : 'Показать все'}
                </Button>
              </div>

              {showAll ? (
                <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 text-left text-gray-500">
                      <tr>
                        <th className="px-4 py-3 font-medium">Поддомен</th>
                        <th className="px-4 py-3 font-medium">РФ</th>
                        <th className="px-4 py-3 font-medium">Тип</th>
                        <th className="px-4 py-3 font-medium">Риск</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {data.subdomains.map((item) => (
                        <tr key={item.host}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-gray-900">{item.host}</div>
                            {item.redirect_target ? (
                              <div className="mt-1 text-xs text-gray-500">→ {item.redirect_target}</div>
                            ) : null}
                          </td>
                          <td className={`px-4 py-3 align-top ${stateTone(item.state)}`}>
                            {stateLabel(item.state, item.status)}
                          </td>
                          <td className="px-4 py-3 align-top text-gray-700">
                            {categoryLabel(item.category)}
                          </td>
                          <td className="px-4 py-3 align-top text-gray-700">
                            {riskBadge(item.risk_level)} {item.risk_label || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
