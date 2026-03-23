'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type ResearchRecord = {
  id: string;
  url: string;
  title: string | null;
  h1: string | null;
  description: string | null;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type QueryRecord = {
  id: string;
  researchId: string;
  query: string;
  frequency: number;
  type: string | null;
  destination: string | null;
  relevance: number | null;
  reason: string | null;
  clusterId: string | null;
  source: string;
  createdAt: string | Date;
};

type ClusterRecord = {
  id: string;
  researchId: string;
  mainQuery: string;
  totalFrequency: number;
  queriesCount: number;
  createdAt: string | Date;
};

type ContentPlanRecord = {
  id: string;
  researchId: string;
  clusterId: string | null;
  sourceUrl: string;
  targetUrl: string;
  contentType: string;
  title: string;
  metaDescription: string | null;
  mainQuery: string;
  articlePreview: string | null;
  plannedDate: string | null;
  status: string;
  isApproved: boolean;
  approvedAt: string | Date | null;
  publishedAt: string | Date | null;
  publishedUrl: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
};

type CleanupSuggestion = {
  queryId: string;
  status: 'danger' | 'warn' | 'neutral';
  reason: string;
};

type DetailPayload = {
  research: ResearchRecord;
  queries: QueryRecord[];
  clusters: ClusterRecord[];
  contentPlan: ContentPlanRecord[];
  cleanupSuggestions: CleanupSuggestion[];
};

type Props = {
  initialData: DetailPayload;
  wordstatEnabled: boolean;
};

const DESTINATION_COLUMNS = [
  { key: 'tool', label: 'Страница инструмента' },
  { key: 'blog', label: 'Блог' },
  { key: 'unclear', label: 'Под вопросом' },
] as const;

type DestinationKey = (typeof DESTINATION_COLUMNS)[number]['key'];

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('ru-RU').format(value);
}

function StatusBadge({ value }: { value: string }) {
  const tone =
    value === 'done'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'cleaning'
        ? 'bg-amber-50 text-amber-700'
        : value === 'collecting'
          ? 'bg-blue-50 text-blue-700'
          : 'bg-gray-100 text-gray-700';
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone}`}>{value}</span>;
}

function SuggestionBadge({ value }: { value: CleanupSuggestion['status'] }) {
  const tone =
    value === 'danger'
      ? 'bg-red-50 text-red-700'
      : value === 'warn'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-600';
  return <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${tone}`}>{value}</span>;
}

function QueryCard({
  item,
  onTypeChange,
  onDelete,
}: {
  item: QueryRecord;
  onTypeChange: (id: string, nextType: QueryRecord['type']) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { destination: item.destination || 'unclear' },
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`rounded-2xl border border-gray-200 bg-white p-3 shadow-sm ${isDragging ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="flex-1 text-left"
          {...attributes}
          {...listeners}
        >
          <div className="text-sm font-medium text-gray-900">{item.query}</div>
          <div className="mt-1 text-xs text-gray-500">
            {formatNumber(item.frequency)}/мес · {item.relevance ?? '—'}/10 · {item.source}
          </div>
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="rounded-full border border-gray-200 px-2 py-1 text-xs text-gray-500"
        >
          ✕
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <select
          value={item.type || ''}
          onChange={(event) => onTypeChange(item.id, (event.target.value || null) as QueryRecord['type'])}
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700"
        >
          <option value="">Тип не задан</option>
          <option value="instrumental">instrumental</option>
          <option value="symptom">symptom</option>
          <option value="technical">technical</option>
          <option value="informational">informational</option>
        </select>
      </div>
    </div>
  );
}

function DestinationColumn({
  destination,
  title,
  items,
  onTypeChange,
  onDelete,
}: {
  destination: DestinationKey;
  title: string;
  items: QueryRecord[];
  onTypeChange: (id: string, nextType: QueryRecord['type']) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: destination,
    data: { destination },
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-3xl border p-4 ${isOver ? 'border-orange-300 bg-orange-50/50' : 'border-gray-200 bg-gray-50/70'}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-500">{items.length}</span>
      </div>
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {items.map((item) => (
            <QueryCard key={item.id} item={item} onTypeChange={onTypeChange} onDelete={onDelete} />
          ))}
          {!items.length ? <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs text-gray-400">Пусто</div> : null}
        </div>
      </SortableContext>
    </div>
  );
}

export default function AdminResearchDetail({ initialData, wordstatEnabled }: Props) {
  const [data, setData] = useState(initialData);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'danger' | 'warn'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [minRelevance, setMinRelevance] = useState(1);
  const [wordstatInfo, setWordstatInfo] = useState(
    wordstatEnabled
      ? 'Использован безопасный режим: 20 seed × 2 источника'
      : 'Wordstat не подключён'
  );
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const suggestionsById = useMemo(
    () => new Map(data.cleanupSuggestions.map((item) => [item.queryId, item])),
    [data.cleanupSuggestions]
  );

  const visibleQueries = useMemo(() => {
    return data.queries.filter((item) => {
      const suggestion = suggestionsById.get(item.id);
      if (filter !== 'all' && suggestion?.status !== filter) return false;
      if (item.destination === 'deleted') return false;
      if ((item.relevance ?? 10) < minRelevance) return false;
      if (!query.trim()) return true;
      return item.query.toLowerCase().includes(query.trim().toLowerCase());
    });
  }, [data.queries, filter, minRelevance, query, suggestionsById]);

  const destinationItems = useMemo(() => {
    return DESTINATION_COLUMNS.map((column) => ({
      ...column,
      items: visibleQueries.filter((item) => (item.destination || 'unclear') === column.key),
    }));
  }, [visibleQueries]);

  const seedCount = data.queries.filter((item) => item.source === 'seed').length;
  const expandedCount = data.queries.filter((item) => item.source !== 'seed').length;

  async function readApiPayload<T extends Record<string, unknown>>(response: Response) {
    const text = await response.text();
    if (!text) return {} as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Сервер вернул невалидный JSON (HTTP ${response.status})`);
    }
  }

  async function reload() {
    const response = await fetch(`/api/admin/seo-research/${data.research.id}`, {
      cache: 'no-store',
    });
    const payload = await readApiPayload<DetailPayload & { ok?: boolean; error?: string }>(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Не удалось обновить данные');
    }
    setData(payload);
  }

  async function runAction(actionKey: string, handler: () => Promise<void>) {
    setError(null);
    setLoadingAction(actionKey);
    try {
      await handler();
      await reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Ошибка');
    } finally {
      setLoadingAction(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function selectByStatus(nextStatus: 'danger' | 'warn') {
    setSelectedIds(
      data.cleanupSuggestions
        .filter((item) => item.status === nextStatus)
        .map((item) => item.queryId)
    );
  }

  function updateQuery(id: string, patch: Partial<QueryRecord>) {
    setData((current) => ({
      ...current,
      queries: current.queries.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overDestination =
      (event.over?.data.current?.destination as DestinationKey | undefined) ||
      ((event.over?.id as string | undefined) as DestinationKey | undefined);

    if (!overDestination) return;
    updateQuery(activeId, { destination: overDestination });
  }

  async function patchQueries(updates: QueryRecord[]) {
    const response = await fetch(`/api/admin/seo-research/${data.research.id}/queries`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: updates.map((item) => ({
          id: item.id,
          destination: item.destination,
          type: item.type,
          relevance: item.relevance,
          reason: item.reason,
          clusterId: item.clusterId,
        })),
      }),
    });
    const payload = await readApiPayload<{ ok?: boolean; error?: string }>(response);
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Не удалось сохранить');
    }
  }

  const cleanupRows = useMemo(() => {
    return data.queries
      .filter((item) => {
        const suggestion = suggestionsById.get(item.id);
        if (filter !== 'all' && suggestion?.status !== filter) return false;
        if (!query.trim()) return true;
        return item.query.toLowerCase().includes(query.trim().toLowerCase());
      })
      .slice(0, 250);
  }, [data.queries, filter, query, suggestionsById]);

  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Исследование семантики</h2>
            <p className="mt-2 text-sm text-gray-600">{data.research.url}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge value={data.research.status} />
              <span className="text-xs text-gray-500">
                Обновлено: {new Date(data.research.updatedAt).toLocaleString('ru-RU')}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/research"
              className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700"
            >
              К списку
            </Link>
            <Link
              href="/admin/content-plan"
              className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700"
            >
              Контент-план
            </Link>
          </div>
        </div>

        {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {[
          {
            key: 'context',
            title: '1. Контекст',
            text: data.research.title || 'Контекст ещё не извлечён.',
            action: 'Извлечь',
            onClick: () =>
              runAction('context', async () => {
                const response = await fetch(`/api/admin/seo-research/${data.research.id}/context`, {
                  method: 'POST',
                });
                const payload = await readApiPayload<{ ok?: boolean; error?: string }>(response);
                if (!response.ok || !payload.ok) throw new Error(payload.error || 'Ошибка извлечения');
              }),
          },
          {
            key: 'seed',
            title: '2. Seed-запросы',
            text: `${seedCount} запросов`,
            action: 'Сгенерировать',
            onClick: () =>
              runAction('seed', async () => {
                const response = await fetch(`/api/admin/seo-research/${data.research.id}/seed`, {
                  method: 'POST',
                });
                const payload = await readApiPayload<{ ok?: boolean; error?: string }>(response);
                if (!response.ok || !payload.ok) throw new Error(payload.error || 'Ошибка генерации seed');
              }),
          },
          {
            key: 'wordstat',
            title: '3. Wordstat',
            text: `${expandedCount} расширенных запросов`,
            action: 'Расширить',
            onClick: () =>
              runAction('wordstat', async () => {
                const response = await fetch(`/api/admin/seo-research/${data.research.id}/wordstat`, {
                  method: 'POST',
                });
                const payload = await readApiPayload<{ ok?: boolean; error?: string; message?: string }>(response);
                if (!response.ok || !payload.ok) throw new Error(payload.error || 'Ошибка Wordstat');
                setWordstatInfo(
                  payload.message ||
                    (wordstatEnabled
                      ? 'Использован безопасный режим: 20 seed × 2 источника'
                      : 'Wordstat не подключён')
                );
              }),
          },
          {
            key: 'classify',
            title: '4. Анализ',
            text: `${data.queries.filter((item) => item.destination === 'blog').length} в блог · ${data.queries.filter((item) => item.destination === 'tool').length} в tool`,
            action: 'Классифицировать',
            onClick: () =>
              runAction('classify', async () => {
                const response = await fetch(`/api/admin/seo-research/${data.research.id}/classify`, {
                  method: 'POST',
                });
                const payload = await readApiPayload<{ ok?: boolean; error?: string }>(response);
                if (!response.ok || !payload.ok) throw new Error(payload.error || 'Ошибка классификации');
              }),
          },
        ].map((card) => (
          <div key={card.key} className="rounded-3xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
            <p className="mt-3 min-h-12 text-sm text-gray-600">{card.text}</p>
            {card.key === 'wordstat' ? (
              <p className="mt-2 text-xs text-gray-500">{wordstatInfo}</p>
            ) : null}
            <button
              type="button"
              disabled={loadingAction === card.key}
              onClick={card.onClick}
              className="mt-4 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              {loadingAction === card.key ? 'Выполняется...' : card.action}
            </button>
          </div>
        ))}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Первичная очистка</h3>
            <p className="mt-1 text-sm text-gray-500">
              Красные — удалить, жёлтые — проверить вручную. Таблица показывает первые 250 строк по фильтру.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setFilter('all')} className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700">Все</button>
            <button type="button" onClick={() => setFilter('danger')} className="rounded-full border border-red-200 px-3 py-2 text-xs text-red-700">Красные</button>
            <button type="button" onClick={() => setFilter('warn')} className="rounded-full border border-amber-200 px-3 py-2 text-xs text-amber-700">Жёлтые</button>
            <button type="button" onClick={() => selectByStatus('danger')} className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700">Выбрать всё красное</button>
            <button type="button" onClick={() => selectByStatus('warn')} className="rounded-full border border-gray-200 px-3 py-2 text-xs text-gray-700">Выбрать всё жёлтое</button>
            <button
              type="button"
              onClick={() =>
                runAction('cleanup', async () => {
                  const updates = data.queries
                    .filter((item) => selectedIds.includes(item.id))
                    .map((item) => ({ ...item, destination: 'deleted' as const }));
                  if (!updates.length) throw new Error('Нет выбранных запросов');
                  await patchQueries(updates);
                  setSelectedIds([]);
                })
              }
              className="rounded-full bg-orange-600 px-3 py-2 text-xs font-medium text-white"
            >
              {loadingAction === 'cleanup' ? 'Сохраняем...' : 'Удалить выбранные'}
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по запросам"
            className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
          />
          <label className="flex items-center gap-3 rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-700">
            Релевантность &gt;=
            <input
              type="range"
              min={1}
              max={10}
              value={minRelevance}
              onChange={(event) => setMinRelevance(Number(event.target.value))}
            />
            <span>{minRelevance}</span>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-3 py-3 font-medium">[ ]</th>
                <th className="px-3 py-3 font-medium">Запрос</th>
                <th className="px-3 py-3 font-medium">Частотность</th>
                <th className="px-3 py-3 font-medium">Статус системы</th>
                <th className="px-3 py-3 font-medium">Причина</th>
              </tr>
            </thead>
            <tbody>
              {cleanupRows.map((item) => {
                const suggestion = suggestionsById.get(item.id);
                return (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                      />
                    </td>
                    <td className="px-3 py-3 text-gray-900">{item.query}</td>
                    <td className="px-3 py-3 text-gray-700">{formatNumber(item.frequency)}</td>
                    <td className="px-3 py-3">
                      <SuggestionBadge value={suggestion?.status || 'neutral'} />
                    </td>
                    <td className="px-3 py-3 text-gray-600">{suggestion?.reason || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Распределение запросов</h3>
            <p className="mt-1 text-sm text-gray-500">Drag-and-drop между колонками. Удалённые запросы в доске не показываются.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                runAction('save-distribution', async () => {
                  await patchQueries(data.queries.filter((item) => item.destination !== 'deleted'));
                })
              }
              className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700"
            >
              {loadingAction === 'save-distribution' ? 'Сохранение...' : 'Сохранить распределение'}
            </button>
            <button
              type="button"
              onClick={() =>
                runAction('clusters', async () => {
                  await patchQueries(data.queries.filter((item) => item.destination !== 'deleted'));
                  const response = await fetch(`/api/admin/seo-research/${data.research.id}/clusters`, {
                    method: 'POST',
                  });
                  const payload = await readApiPayload<{ ok?: boolean; error?: string }>(response);
                  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Ошибка кластеризации');
                })
              }
              className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              {loadingAction === 'clusters' ? 'Группируем...' : 'Сохранить и продолжить'}
            </button>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 xl:grid-cols-3">
            {destinationItems.map((column) => (
              <DestinationColumn
                key={column.key}
                destination={column.key}
                title={column.label}
                items={column.items}
                onTypeChange={(id, nextType) => updateQuery(id, { type: nextType })}
                onDelete={(id) => updateQuery(id, { destination: 'deleted' })}
              />
            ))}
          </div>
        </DndContext>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900">Кластеры блога</h3>
          <div className="mt-4 space-y-3">
            {data.clusters.map((cluster) => (
              <div key={cluster.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                <div className="font-medium text-gray-900">{cluster.mainQuery}</div>
                <div className="mt-1 text-sm text-gray-500">
                  {formatNumber(cluster.totalFrequency)}/мес · {cluster.queriesCount} запросов
                </div>
              </div>
            ))}
            {!data.clusters.length ? <p className="text-sm text-gray-500">Кластеров пока нет.</p> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6">
          <h3 className="text-lg font-semibold text-gray-900">Контент-план</h3>
          <div className="mt-4 space-y-3">
            {data.contentPlan.map((item) => (
              <div key={item.id} className="rounded-2xl border border-gray-100 px-4 py-3">
                <div className="font-medium text-gray-900">{item.title}</div>
                <div className="mt-1 text-sm text-gray-500">
                  {item.contentType} · {item.targetUrl}
                </div>
              </div>
            ))}
            {!data.contentPlan.length ? <p className="text-sm text-gray-500">Контент-план ещё не создан.</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
