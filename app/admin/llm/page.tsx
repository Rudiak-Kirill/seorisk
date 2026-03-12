import Link from 'next/link';
import AdminSsrTable from '@/components/admin-ssr-table';
import { getLlmChecksForAdmin } from '@/lib/db/queries';

export const dynamic = 'force-dynamic';

export default async function AdminLlmChecksPage() {
  const rows = await getLlmChecksForAdmin(2000);

  if (!rows) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900">Доступ запрещён</h1>
        <p className="mt-2 text-sm text-gray-600">
          Эта страница доступна только администратору.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block text-sm text-orange-600 hover:text-orange-700"
        >
          На главную
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">LLM Checks (админ)</h1>
        <div className="text-sm text-gray-500">Всего: {rows.length}</div>
      </div>
      <AdminSsrTable rows={rows} />
    </main>
  );
}
