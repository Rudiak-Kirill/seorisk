'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ToolProgress from '@/components/tool-progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  ContentCheckResponse,
  ContentIssueCard,
  ContentPageType,
} from '@/lib/content-check';

const PAGE_TYPE_OPTIONS: Array<{ key: ContentPageType; label: string }> = [
  { key: 'product', label: 'Товар' },
  { key: 'category', label: 'Каталог' },
  { key: 'article', label: 'Статья' },
  { key: 'informational', label: 'Информационная' },
  { key: 'home', label: 'Главная' },
  { key: 'landing', label: 'Лендинг' },
];

function normalizeUrlInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const prepared = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(prepared).toString();
  } catch {
    return trimmed;
  }
}

function verdictClass(status: ContentCheckResponse['verdict']['status']) {
  if (status === 'fail') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-green-200 bg-green-50 text-green-700';
}

function issueClass(severity: ContentIssueCard['severity']) {
  if (severity === 'critical') return 'border-red-200 bg-red-50';
  if (severity === 'warn') return 'border-amber-200 bg-amber-50';
  return 'border-orange-200 bg-orange-50';
}

function sectionLabel(severity: 'critical' | 'warn' | 'improve') {
  if (severity === 'critical') return 'Критично';
  if (severity === 'warn') return 'Важно';
  return 'Улучшить';
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('ru-RU').format(value);
}

function IssueSection({
  title,
  items,
}: {
  title: string;
  items: ContentIssueCard[];
}) {
  if (!items.length) return null;

  return (
    <section className="mt-8">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <div className="mt-4 grid gap-4">
        {items.map((item, index) => (
          <div
            key={`${item.title}-${index}`}
            className={`rounded-2xl border p-5 shadow-sm ${issueClass(item.severity)}`}
          >
            <div className="text-base font-semibold text-gray-900">{item.title}</div>
            <div className="mt-2 text-sm text-gray-700">→ {item.action}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ContentCheckPage() {
  const searchParams = useSearchParams();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContentCheckResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [requestedOverride, setRequestedOverride] = useState<ContentPageType | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const queryUrl = searchParams.get('url');
    if (queryUrl) {
      const normalized = normalizeUrlInput(queryUrl);
      if (normalized) setUrl(normalized);
    }
  }, [searchParams]);

  const runCheck = async (overrideType?: ContentPageType) => {
    const normalized = normalizeUrlInput(url);
    if (!normalized) {
      setError('Введите корректный URL');
      return;
    }

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    setUrl(normalized);
    setLoading(true);
    setError(null);
    setResult(null);
    setShowDetails(false);
    setShowTypePicker(false);
    setRequestedOverride(overrideType || null);

    try {
      const response = await fetch('/api/content-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized, pageType: overrideType || undefined }),
      });
      const payload = (await response.json()) as ContentCheckResponse;

      if (requestId !== requestIdRef.current) return;

      setResult(payload);

      if (!response.ok || payload.ok === false) {
        setError(payload.error || 'Не удалось проверить контент страницы');
        return;
      }

      if (payload.needs_type_choice) {
        setShowTypePicker(true);
      }
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Ошибка запроса');
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  const progressTitle =
    requestedOverride || result?.phase === 'full'
      ? 'Анализируем содержимое...'
      : 'Определяем тип страницы...';
  const progressDescription =
    requestedOverride || result?.phase === 'full'
      ? 'Проверяем страницу по чеклисту выбранного типа.'
      : 'Собираем URL, H1, schema.org, CTA, листинг, формы и базовую структуру страницы.';

  const typeSuggestions =
    result?.type_suggestions.length ? result.type_suggestions : PAGE_TYPE_OPTIONS;

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">Проверка контента страницы</h1>
        <p className="mt-2 text-sm text-gray-500">
          Определите тип страницы и проверьте, что есть, чего не хватает и какие проблемы критичны
          для SEO, AI и конверсии.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="https://example.ru/page"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => setUrl((current) => normalizeUrlInput(current))}
            />
            <Button className="rounded-full" onClick={() => runCheck()} disabled={loading}>
              {loading ? 'Проверяем...' : 'Проверить'}
            </Button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <ToolProgress
            active={loading}
            phase={requestedOverride ? 'deep' : 'initial'}
            title={progressTitle}
            description={progressDescription}
          />

          {result ? (
            <>
              <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-500">Тип страницы</div>
                    <div className="mt-1 text-2xl font-semibold text-gray-900">
                      {result.page_type.label}
                    </div>
                    <div className="mt-1 text-sm text-gray-600">
                      {result.page_type.reason} · уверенность {result.page_type.confidence}%
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setShowTypePicker((value) => !value)}
                  >
                    Изменить тип
                  </Button>
                </div>

                {showTypePicker || result.needs_type_choice ? (
                  <div className="mt-4">
                    <div className="text-sm text-gray-600">
                      Похоже на другой тип страницы? Выберите нужный чеклист.
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {typeSuggestions.map((option) => (
                        <Button
                          key={option.key}
                          type="button"
                          variant={
                            option.key === result.page_type.key && !result.needs_type_choice
                              ? 'default'
                              : 'outline'
                          }
                          className="rounded-full"
                          onClick={() => runCheck(option.key)}
                          disabled={loading}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              {!result.needs_type_choice ? (
                <>
                  <section
                    className={`mt-6 rounded-2xl border px-5 py-4 ${verdictClass(
                      result.verdict.status
                    )}`}
                  >
                    <div className="text-xl font-semibold">{result.verdict.title}</div>
                    <div className="mt-2 text-sm">{result.verdict.summary}</div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-4">
                      <div className="rounded-xl bg-white/60 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide">Пройдено</div>
                        <div className="mt-1 text-lg font-semibold">
                          {result.verdict.passed_checks} из {result.verdict.total_checks}
                        </div>
                      </div>
                      <div className="rounded-xl bg-white/60 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide">Критичных</div>
                        <div className="mt-1 text-lg font-semibold">{result.verdict.critical_count}</div>
                      </div>
                      <div className="rounded-xl bg-white/60 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide">Важных</div>
                        <div className="mt-1 text-lg font-semibold">{result.verdict.important_count}</div>
                      </div>
                      <div className="rounded-xl bg-white/60 px-3 py-2">
                        <div className="text-xs uppercase tracking-wide">Улучшений</div>
                        <div className="mt-1 text-lg font-semibold">{result.verdict.improve_count}</div>
                      </div>
                    </div>
                  </section>

                  {result.page_type.key === 'category' ? (
                    <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                      <h3 className="text-lg font-semibold text-gray-900">Структура каталога</h3>
                      <div className="mt-4 grid gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            Товаров на странице
                          </div>
                          <div className="mt-2 text-2xl font-semibold text-gray-900">
                            {formatNumber(result.catalog_structure.items_on_page)}
                          </div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            Страниц пагинации
                          </div>
                          <div className="mt-2 text-2xl font-semibold text-gray-900">
                            {result.catalog_structure.infinite_scroll
                              ? 'Infinite scroll'
                              : result.catalog_structure.pagination_pages !== null
                                ? formatNumber(result.catalog_structure.pagination_pages)
                                : 'не найдена'}
                          </div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs uppercase tracking-wide text-gray-500">
                            Примерный ассортимент
                          </div>
                          <div className="mt-2 text-2xl font-semibold text-gray-900">
                            {result.catalog_structure.estimated_assortment
                              ? `~${formatNumber(result.catalog_structure.estimated_assortment)}`
                              : result.catalog_structure.infinite_scroll
                                ? 'не определить точно'
                                : 'не удалось определить'}
                          </div>
                        </div>
                      </div>
                      {result.catalog_structure.note ? (
                        <div className="mt-4 text-sm text-gray-600">{result.catalog_structure.note}</div>
                      ) : null}
                    </section>
                  ) : null}

                  <IssueSection title={sectionLabel('critical')} items={result.issues.critical} />
                  <IssueSection title={sectionLabel('warn')} items={result.issues.important} />
                  <IssueSection title={sectionLabel('improve')} items={result.issues.improve} />

                  <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap gap-3">
                      <Button asChild variant="outline" className="rounded-full">
                        <Link href="/tools/ssr-check">Проверить как боты видят эту страницу</Link>
                      </Button>
                      <Button asChild variant="outline" className="rounded-full">
                        <Link href="/tools/index-check">Проверить индексацию</Link>
                      </Button>
                      <Button asChild variant="outline" className="rounded-full">
                        <Link href="/tools/speed-check">Проверить скорость</Link>
                      </Button>
                    </div>
                  </section>
                </>
              ) : null}

              <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setShowDetails((value) => !value)}
                >
                  <span className="text-base font-semibold text-gray-900">Показать детали</span>
                  {showDetails ? (
                    <ChevronUp className="h-5 w-5 text-gray-500" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-gray-500" />
                  )}
                </button>

                {showDetails ? (
                  <div className="mt-4 space-y-5">
                    {result.details.map((group) => (
                      <div
                        key={group.title}
                        className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                      >
                        <div className="text-sm font-semibold text-gray-900">{group.title}</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {group.items.map((item) => (
                            <div
                              key={`${group.title}-${item.label}`}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-2"
                            >
                              <div className="text-xs uppercase tracking-wide text-gray-500">
                                {item.label}
                              </div>
                              <div className="mt-1 text-sm text-gray-900">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
