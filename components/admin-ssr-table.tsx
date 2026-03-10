'use client';

import { useMemo, useState } from 'react';

type AdminRow = {
  id: number;
  url: string;
  verdict: string | null;
  reasons: any;
  createdAt: string | Date | null;
  ipAddress: string | null;
  userAgent: string | null;
  userEmail: string | null;
  teamName: string | null;
};

type AdminSsrTableProps = {
  rows: AdminRow[];
};

function toCsvValue(value: unknown) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/\r?\n/g, ' ');
  if (str.includes(',') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function AdminSsrTable({ rows }: AdminSsrTableProps) {
  const [query, setQuery] = useState('');
  const [verdict, setVerdict] = useState<'all' | 'ok' | 'mismatch' | 'error'>('all');
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const rowVerdict = row.verdict || 'error';
      if (verdict !== 'all' && rowVerdict !== verdict) return false;
      if (!q) return true;
      const haystack = [
        row.url,
        row.userEmail || '',
        row.teamName || '',
        row.ipAddress || '',
        Array.isArray(row.reasons) ? row.reasons.join(', ') : ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, query, verdict]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const exportCsv = () => {
    const header = [
      'Время',
      'URL',
      'Вердикт',
      'Причины',
      'Пользователь',
      'Команда',
      'IP',
      'User-Agent'
    ];
    const lines = [header.join(',')];
    filtered.forEach((row) => {
      const createdAt = row.createdAt ? new Date(row.createdAt).toLocaleString('ru-RU') : '';
      const reasons = Array.isArray(row.reasons) ? row.reasons.join('; ') : '';
      lines.push(
        [
          createdAt,
          row.url,
          row.verdict || '',
          reasons,
          row.userEmail || '',
          row.teamName || '',
          row.ipAddress || '',
          row.userAgent || ''
        ].map(toCsvValue).join(',')
      );
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ssr-checks-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <input
            value={query}
            onChange={(e) => {
              setPage(1);
              setQuery(e.target.value);
            }}
            placeholder="Поиск по URL, пользователю, IP"
            className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          />
          <select
            value={verdict}
            onChange={(e) => {
              setPage(1);
              setVerdict(e.target.value as any);
            }}
            className="rounded-md border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="all">Все</option>
            <option value="ok">ok</option>
            <option value="mismatch">mismatch</option>
            <option value="error">error</option>
          </select>
        </div>
        <button
          onClick={exportCsv}
          className="rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Экспорт CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">Время</th>
              <th className="px-4 py-3 text-left">URL</th>
              <th className="px-4 py-3 text-left">Вердикт</th>
              <th className="px-4 py-3 text-left">Причины</th>
              <th className="px-4 py-3 text-left">Пользователь</th>
              <th className="px-4 py-3 text-left">Команда</th>
              <th className="px-4 py-3 text-left">IP</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-3 whitespace-nowrap">
                  {row.createdAt ? new Date(row.createdAt).toLocaleString('ru-RU') : '-'}
                </td>
                <td className="px-4 py-3 max-w-[420px] break-words">{row.url}</td>
                <td className="px-4 py-3">{row.verdict || '-'}</td>
                <td className="px-4 py-3 max-w-[320px] break-words">
                  {Array.isArray(row.reasons) ? row.reasons.join(', ') : '-'}
                </td>
                <td className="px-4 py-3">{row.userEmail || '-'}</td>
                <td className="px-4 py-3">{row.teamName || '-'}</td>
                <td className="px-4 py-3">{row.ipAddress || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
        <div>
          Показано: {pageRows.length} из {filtered.length}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage(1)}
            disabled={currentPage === 1}
            className="rounded-md border border-gray-200 px-2 py-1 disabled:opacity-50"
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="rounded-md border border-gray-200 px-2 py-1 disabled:opacity-50"
          >
            Назад
          </button>
          <span>
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="rounded-md border border-gray-200 px-2 py-1 disabled:opacity-50"
          >
            Вперёд
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={currentPage === totalPages}
            className="rounded-md border border-gray-200 px-2 py-1 disabled:opacity-50"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
