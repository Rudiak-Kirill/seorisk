'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type ResearchListItem = {
  id: string;
  url: string;
  title: string | null;
  h1: string | null;
  description: string | null;
  status: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  queriesCount: number;
};

type Props = {
  initialResearches: ResearchListItem[];
};

function formatDate(value: string | Date) {
  return new Date(value).toLocaleString('ru-RU');
}

export default function AdminResearchDashboard({ initialResearches }: Props) {
  const router = useRouter();
  const [researches, setResearches] = useState(initialResearches);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return researches;

    return researches.filter((item) =>
      [item.url, item.title || '', item.h1 || '', item.status].join(' ').toLowerCase().includes(needle)
    );
  }, [query, researches]);

  async function createResearch(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/admin/seo-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as { ok?: boolean; id?: string; error?: string };
      if (!response.ok || !data.ok || !data.id) {
        throw new Error(data.error || 'Не удалось создать исследование');
      }
      router.push(`/admin/research/${data.id}`);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Ошибка');
    } finally {
      setLoading(false);
    }
  }

  async function refreshList() {
    const response = await fetch('/api/admin/seo-research', { cache: 'no-store' });
    const data = (await response.json()) as { ok?: boolean; items?: ResearchListItem[] };
    if (response.ok && data.ok && data.items) {
      setResearches(data.items);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <form onSubmit={createResearch} className="grid gap-4 lg:grid-cols-[1fr_auto_auto]">
          <div>
            <label htmlFor="research-url" className="mb-2 block text-sm font-medium text-gray-700">
              URL страницы инструмента
            </label>
            <input
              id="research-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://seorisk.ru/tools/ssr-check"
              className="w-full rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="self-end rounded-full bg-gray-900 px-6 py-3 text-sm font-medium text-white disabled:opacity-60"
          >
            {loading ? 'Создаём...' : 'Новое исследование'}
          </button>
          <button
            type="button"
            onClick={refreshList}
            className="self-end rounded-full border border-gray-200 px-6 py-3 text-sm font-medium text-gray-700"
          >
            Обновить
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </section>

      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Исследования</h3>
            <p className="mt-1 text-sm text-gray-500">Всего: {researches.length}</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по URL или статусу"
            className="w-full max-w-sm rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="px-3 py-3 font-medium">URL</th>
                <th className="px-3 py-3 font-medium">Статус</th>
                <th className="px-3 py-3 font-medium">Запросов</th>
                <th className="px-3 py-3 font-medium">Обновлено</th>
                <th className="px-3 py-3 font-medium">Открыть</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="px-3 py-4">
                    <div className="font-medium text-gray-900">{item.url}</div>
                    <div className="mt-1 text-xs text-gray-500">{item.title || item.h1 || 'Без заголовка'}</div>
                  </td>
                  <td className="px-3 py-4 text-gray-700">{item.status}</td>
                  <td className="px-3 py-4 text-gray-700">{item.queriesCount}</td>
                  <td className="px-3 py-4 text-gray-700">{formatDate(item.updatedAt)}</td>
                  <td className="px-3 py-4">
                    <Link
                      href={`/admin/research/${item.id}`}
                      className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:border-orange-200 hover:text-orange-700"
                    >
                      Открыть
                    </Link>
                  </td>
                </tr>
              ))}
              {!filtered.length ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">
                    Ничего не найдено.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
