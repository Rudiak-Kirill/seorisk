'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Status = 'ok' | 'warn' | 'fail';
type Phase = 'quick' | 'full';

type CountGroup = {
  count: number | null;
  percent: number | null;
};

type SignalItem = {
  label: string;
  status: Status;
  value: string;
};

type SiteProfileResponse = {
  ok: boolean;
  phase: Phase;
  checked_at: string;
  input_url: string;
  site_url: string;
  final_url: string;
  loading_text?: string | null;
  verdict_text: string | null;
  profile: {
    type: string;
    audience: string;
    topic: string;
    region: string;
    domain_age_years: number | null;
    domain_age_label: string;
  };
  structure: {
    sitemap_found: boolean;
    sitemap_url: string | null;
    total_urls: number | null;
    commercial: CountGroup;
    informational: CountGroup;
    application: CountGroup;
    search: CountGroup;
    documents: CountGroup;
    video: CountGroup;
    faq: CountGroup;
    service: CountGroup;
    unknown: CountGroup;
    depth: {
      level1: number | null;
      level2: number | null;
      level3plus: number | null;
    };
    lastmod_latest: string | null;
    updated_last30: number | null;
    yandex_index: string;
    google_index: string;
    yandex_iks: string;
    message: string | null;
  };
  commerce: {
    critical: { found: number; total: number; items: SignalItem[] };
    important: { found: number; total: number; items: SignalItem[] };
    additional: { found: number; total: number; items: SignalItem[] };
  };
  technical: {
    cms: string;
    analytics: {
      yandex: boolean;
      google: boolean;
      vk: boolean;
      facebook: boolean;
    };
  };
  details: {
    menu_pages: { label: string; url: string }[];
    sitemap_sections: { section: string; count: number }[];
    analytics_scripts: string[];
    whois: {
      created_at: string | null;
      age_years: number | null;
      registrar: string;
      raw_source: string;
    };
    registrar: string;
    robots_url: string;
    robots_found: boolean;
    sitemap_urls: string[];
  };
  error?: string;
};

function statusClass(status: Status) {
  if (status === 'ok') return 'text-green-600';
  if (status === 'warn') return 'text-amber-600';
  return 'text-red-600';
}

function progressWidth(value: number | null) {
  return `${Math.max(0, Math.min(100, value || 0))}%`;
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

function SignalList({
  title,
  group,
}: {
  title: string;
  group: { found: number; total: number; items: SignalItem[] };
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <div className="text-sm text-gray-500">
          {group.found} из {group.total}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {group.items.map((item) => (
          <div key={item.label} className="flex items-start gap-3">
            <div className={`mt-0.5 text-sm font-semibold ${statusClass(item.status)}`}>
              {item.status === 'ok' ? '✅' : item.status === 'warn' ? '⚠️' : '🔴'}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900">{item.label}</div>
              <div className="text-sm text-gray-600">{item.value}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SiteProfilePage() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fullLoading, setFullLoading] = useState(false);
  const [data, setData] = useState<SiteProfileResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const requestIdRef = useRef(0);

  const structureRows: Array<{ label: string; group: CountGroup }> = data
    ? [
        { label: 'Коммерческих', group: data.structure.commercial },
        { label: 'Информационных', group: data.structure.informational },
        { label: 'Приложение', group: data.structure.application },
        { label: 'Поиск', group: data.structure.search },
        { label: 'Документы', group: data.structure.documents },
        { label: 'Видео/вебинары', group: data.structure.video },
        { label: 'FAQ', group: data.structure.faq },
        { label: 'Служебных', group: data.structure.service },
        { label: 'Не определено', group: data.structure.unknown },
      ]
    : [];

  const onCheck = async () => {
    if (!url.trim()) return;

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setLoading(true);
    setFullLoading(false);
    setError(null);
    setData(null);
    setShowDetails(false);

    try {
      const quickResponse = await fetch('/api/site-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, phase: 'quick' }),
      });
      const quickPayload = (await quickResponse.json()) as SiteProfileResponse;

      if (requestId !== requestIdRef.current) return;

      if (!quickResponse.ok || quickPayload.ok === false) {
        setError(quickPayload.error || 'Ошибка сервиса');
        return;
      }

      setData(quickPayload);
      setLoading(false);
      setFullLoading(true);

      const fullResponse = await fetch('/api/site-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, phase: 'full' }),
      });
      const fullPayload = (await fullResponse.json()) as SiteProfileResponse;

      if (requestId !== requestIdRef.current) return;

      if (!fullResponse.ok || fullPayload.ok === false) {
        setError(fullPayload.error || 'Не удалось построить профиль сайта');
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
        <h1 className="text-3xl font-semibold text-gray-900">Профиль сайта (Бета)</h1>
        <p className="mt-2 text-sm text-gray-500">
          Соберите один экран с типом сайта, структурой sitemap, коммерческими сигналами,
          индексом и техническим профилем.
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
              {loading ? 'Читаем сайт...' : fullLoading ? 'Анализируем...' : 'Анализировать'}
            </Button>
          </div>

          {error ? (
            <div className="mt-4 rounded-md bg-black px-4 py-3 text-sm text-white">{error}</div>
          ) : null}

          {data?.phase === 'quick' || fullLoading ? (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm text-blue-700">
              <div className="font-medium">Читаем структуру сайта...</div>
              <div className="mt-1">
                {data?.loading_text || 'Анализируем профиль...'}
              </div>
            </div>
          ) : null}

          {data && data.phase === 'full' ? (
            <>
              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Итоговый вердикт</h2>
                <p className="mt-3 text-sm leading-6 text-gray-700">
                  {data.verdict_text || 'Не удалось определить профиль сайта.'}
                </p>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Профиль</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Тип</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.profile.type}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Аудитория</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.profile.audience}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Тематика</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.profile.topic}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Домен</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.profile.domain_age_label}</div>
                  </div>
                  <div className="md:col-span-2 xl:col-span-4">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Регион</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.profile.region}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Структура сайта</h2>
                {data.structure.message ? (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                    {data.structure.message}
                  </div>
                ) : null}

                <div className="mt-4 text-sm text-gray-700">
                  Страниц в sitemap:{' '}
                  <span className="font-semibold text-gray-900">
                    {data.structure.total_urls ?? 'не удалось определить'}
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  {structureRows.map(({ label, group }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-gray-700">{label}</span>
                        <span className="text-gray-900">
                          {group.count ?? '—'} {group.percent !== null ? `${group.percent}%` : ''}
                        </span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-gray-100">
                        <div
                          className="h-2 rounded-full bg-gray-900"
                          style={{ width: progressWidth(group.percent) }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">В индексе Яндекс</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.structure.yandex_index}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">В индексе Google</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.structure.google_index}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">ИКС Яндекс</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.structure.yandex_iks}</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-6 lg:grid-cols-3">
                <SignalList title="Критические сигналы" group={data.commerce.critical} />
                <SignalList title="Важные сигналы" group={data.commerce.important} />
                <SignalList title="Дополнительные сигналы" group={data.commerce.additional} />
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Технический профиль</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">CMS</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{data.technical.cms}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500">Аналитика</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      Яндекс {data.technical.analytics.yandex ? '✅' : '⚠️'} · Google{' '}
                      {data.technical.analytics.google ? '✅' : '⚠️'} · VK{' '}
                      {data.technical.analytics.vk ? '✅' : '⚠️'} · Facebook{' '}
                      {data.technical.analytics.facebook ? '✅' : '⚠️'}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-gray-900">Переходите дальше</h2>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {[
                    { href: '/tools/ssr-check', label: 'Проверить рендеринг' },
                    { href: '/tools/index-check', label: 'Проверить индексацию' },
                    { href: '/tools/speed-check', label: 'Проверить скорость' },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-4 text-sm font-medium text-gray-900 transition hover:border-gray-300"
                    >
                      {item.label}
                      <ArrowRight className="h-4 w-4 text-orange-500" />
                    </Link>
                  ))}
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

              {showDetails ? (
                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Меню и разделы</h2>
                    <div className="mt-3">
                      <DetailRow
                        label="Robots URL"
                        value={data.details.robots_url || 'не удалось определить'}
                      />
                      <DetailRow
                        label="Robots found"
                        value={data.details.robots_found ? 'Да' : 'Нет'}
                      />
                      <DetailRow
                        label="Пункты меню"
                        value={
                          data.details.menu_pages.length ? (
                            <div className="space-y-1">
                              {data.details.menu_pages.map((item) => (
                                <div key={item.url}>
                                  {item.label}: {item.url}
                                </div>
                              ))}
                            </div>
                          ) : (
                            'не удалось определить'
                          )
                        }
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Sitemap и WHOIS</h2>
                    <div className="mt-3">
                      <DetailRow
                        label="Разделы sitemap"
                        value={
                          data.details.sitemap_sections.length ? (
                            <div className="space-y-1">
                              {data.details.sitemap_sections.map((item) => (
                                <div key={item.section}>
                                  /{item.section}/ — {item.count}
                                </div>
                              ))}
                            </div>
                          ) : (
                            'не удалось определить'
                          )
                        }
                      />
                      <DetailRow
                        label="Дата регистрации"
                        value={data.details.whois.created_at || 'не удалось определить'}
                      />
                      <DetailRow
                        label="Возраст"
                        value={
                          data.details.whois.age_years !== null
                            ? `${data.details.whois.age_years} года`
                            : 'не удалось определить'
                        }
                      />
                      <DetailRow
                        label="Регистратор"
                        value={data.details.registrar || 'не удалось определить'}
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-semibold text-gray-900">Технические детали</h2>
                    <div className="mt-3">
                      <DetailRow
                        label="Скрипты аналитики"
                        value={
                          data.details.analytics_scripts.length
                            ? data.details.analytics_scripts.join(', ')
                            : 'не удалось определить'
                        }
                      />
                      <DetailRow
                        label="Sitemap URLs"
                        value={
                          data.details.sitemap_urls.length ? (
                            <div className="space-y-1">
                              {data.details.sitemap_urls.slice(0, 10).map((item) => (
                                <div key={item}>{item}</div>
                              ))}
                            </div>
                          ) : (
                            'не удалось определить'
                          )
                        }
                      />
                      <DetailRow
                        label="Источник WHOIS"
                        value={data.details.whois.raw_source || 'не удалось определить'}
                      />
                    </div>
                  </section>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
