import { getUsersForAdmin } from '@/lib/db/queries';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const rows = await getUsersForAdmin(1000);

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
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Пользователи (админ)</h1>
        <div className="text-sm text-gray-500">Всего: {rows.length}</div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Дата регистрации</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-3">{row.id}</td>
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3">
                  {row.createdAt ? new Date(row.createdAt).toLocaleString('ru-RU') : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
