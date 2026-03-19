'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ToolProgress from '@/components/tool-progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type VerdictStatus = 'ok' | 'warn' | 'fail';
type RegistryStatus = 'blocked' | 'not_blocked' | 'unknown';
type AccessStatus = 'accessible' | 'accessible_with_error' | 'timeout' | 'refused' | 'error' | 'unknown';

type RuAccessResponse = {
  ok: boolean;
  checked_at: string;
  input: string;
  normalized_url: string;
  domain: string;
  verdict: {
    key: string;
    status: VerdictStatus;
    title: string;
    summary: string;
  };
  registry: {
    status: RegistryStatus;
    blocked: boolean | null;
    reason: string | null;
    date: string | null;
    source: string | null;
    error: string | null;
  };
  ru_access: {
    status: AccessStatus;
    reachable: boolean | null;
    http_status: number | null;
    final_url: string;
    redirect_target: string | null;
    error: string | null;
  };
  external_access: {
    status: AccessStatus;
    reachable: boolean | null;
    http_status: number | null;
    final_url: string;
    redirect_target: string | null;
    error: string | null;
  };
  hosting: {
    provider: string;
    reason: string | null;
  };
  recommendations: Array<{
    severity: 'critical' | 'warn' | 'improve';
    title: string;
    action: string;
  }>;
  error?: string;
};

const HOSTING_LINKS = [
  { label: 'Timeweb', href: 'https://timeweb.com/ru/' },
  { label: 'Beget', href: 'https://beget.com/ru' },
  { label: 'Selectel', href: 'https://selectel.ru/' },
] as const;

function normalizeInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const prepared = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(prepared).toString();
  } catch {
    return trimmed;
  }
}

function verdictClass(status: VerdictStatus) {
  if (status === 'ok') return 'border-green-200 bg-green-50 text-green-800';
  if (status === 'fail') return 'border-red-200 bg-red-50 text-red-800';
  return 'border-amber-200 bg-amber-50 text-amber-800';
}

function statusLabel(status: AccessStatus, httpStatus: number | null) {
  if (status === 'accessible') return httpStatus ? `Открывается (${httpStatus})` : 'Открывается';
  if (status === 'accessible_with_error') return httpStatus ? `Открывается с ошибкой (${httpStatus})` : 'Открывается с ошибкой';
  if (status === 'timeout') return 'Не открывается (таймаут)';
  if (status === 'refused') return 'Не открывается (connection refused)';
  if (status === 'error') return 'Не открывается (ошибка)';
  return 'Не удалось проверить';
}

function statusTone(status: AccessStatus | RegistryStatus) {
  if (status === 'accessible' || status === 'not_blocked') return 'text-green-600';
  if (status === 'blocked' || status === 'timeout' || status === 'refused' || status === 'error') return 'text-red-600';
  if (status === 'accessible_with_error') return 'text-amber-600';
  return 'text-gray-500';
}

function registryLabel(registry: RuAccessResponse['registry']) {
  if (registry.status === 'blocked') {
    return registry.date ? `Найден (дата: ${registry.date})` : 'Найден';
  }
  if (registry.status === 'not_blocked') return 'Не найден';
  return 'Не удалось проверить';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-dashed border-gray-200 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 text-sm text-gray-500">{label}</div>
      <div className="min-w-0 break-words text-sm text-gray-900 sm:max-w-[65%] sm:text-right">{value}</div>
    </div>
  );
}

export default function RuAccessCheckPage() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RuAccessResponse | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const query = searchParams.get('url') || searchParams.get('site');
    if (query) {
      setUrl(normalizeInput(query));
    }
  }, [searchParams]);

  const onCheck = async () => {
    const normalized = normalizeInput(url);
    if (!normalized) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setUrl(normalized);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch('/api/ru-access-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized }),
      });
      const payload = (await response.json()) as RuAccessResponse;

      if (requestId !== requestIdRef.current) return;

      if (!response.ok || payload.ok === false) {
        setError(payload.error || 'Не удалось проверить доступность из РФ');
        return;
      }

      setData(payload);
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const showHostingLinks =
    data &&
    data.verdict.key === 'not_blocked_but_unavailable' &&
    ['Cloudflare', 'Vercel', 'AWS', 'GCP', 'Azure'].includes(data.hosting.provider);

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">Проверка доступности сайта из РФ</h1>
        <p className="mt-2 text-sm text-gray-500">
          Два независимых сигнала: реестр блокировок и фактический доступ с российского IP. Отдельно проверяем доступ снаружи РФ.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => setUrl((current) => normalizeInput(current))}
            />
            <Button className="rounded-full" onClick={onCheck} disabled={loading}>
              {loading ? 'Проверяем...' : 'Проверить'}
            </Button>
          </div>

          {error ? <div className="mt-4 rounded-md bg-black px-4 py-3 text-sm text-white">{error}</div> : null}

          <ToolProgress
            active={loading}
            phase="deep"
            title={loading ? 'Проверяем реестр Роскомнадзора и доступность...' : ''}
            description={
              loading
                ? 'Сначала проверяем реестр РКН, затем доступ с российского IP и внешний сигнал через check-host.'
                : ''
            }
          />

          {data ? (
            <>
              <section className={`mt-6 rounded-2xl border px-5 py-4 ${verdictClass(data.verdict.status)}`}>
                <div className="text-lg font-semibold">{data.verdict.title}</div>
                <p className="mt-2 text-sm leading-6 text-current/90">{data.verdict.summary}</p>
              </section>

              <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Детали</h2>
                <div className="mt-3">
                  <DetailRow
                    label="Реестр РКН"
                    value={registryLabel(data.registry)}
                  />
                  <DetailRow
                    label="Доступ из РФ"
                    value={statusLabel(data.ru_access.status, data.ru_access.http_status)}
                  />
                  <DetailRow
                    label="Доступ снаружи РФ"
                    value={statusLabel(data.external_access.status, data.external_access.http_status)}
                  />
                  <DetailRow label="Хостинг" value={data.hosting.provider} />
                  {data.registry.reason ? <DetailRow label="Причина в реестре" value={data.registry.reason} /> : null}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Реестр</div>
                    <div className={`mt-1 text-sm font-medium ${statusTone(data.registry.status)}`}>{registryLabel(data.registry)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Из РФ</div>
                    <div className={`mt-1 text-sm font-medium ${statusTone(data.ru_access.status)}`}>{statusLabel(data.ru_access.status, data.ru_access.http_status)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Снаружи РФ</div>
                    <div className={`mt-1 text-sm font-medium ${statusTone(data.external_access.status)}`}>{statusLabel(data.external_access.status, data.external_access.http_status)}</div>
                  </div>
                </div>
              </section>

              {data.recommendations.length ? (
                <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900">Что делать</h2>
                  <div className="mt-4 space-y-3">
                    {data.recommendations.map((item) => (
                      <div key={`${item.severity}-${item.title}`} className="rounded-xl border border-gray-200 p-4">
                        <div className="text-sm font-semibold text-gray-900">{item.title}</div>
                        <div className="mt-2 text-sm text-gray-600">{item.action}</div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {showHostingLinks ? (
                <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-gray-900">Рекомендация по хостингу</h2>
                  <p className="mt-2 text-sm text-gray-600">
                    Если проблема связана с Cloudflare, Vercel или зарубежной инфраструктурой, перенос на российский хостинг обычно снимает вопрос доступа из РФ.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    {HOSTING_LINKS.map((item) => (
                      <Button key={item.href} asChild variant="outline" className="rounded-full">
                        <a href={item.href} target="_blank" rel="noreferrer">
                          {item.label}
                        </a>
                      </Button>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/tools/site-profile?site=${encodeURIComponent(data.normalized_url)}`}>Профиль сайта</Link>
                </Button>
                <Button asChild variant="outline" className="rounded-full">
                  <Link href={`/tools/ssr-check?url=${encodeURIComponent(data.normalized_url)}`}>SSR Check</Link>
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
