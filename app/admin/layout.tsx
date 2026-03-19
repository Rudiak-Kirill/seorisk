import Link from 'next/link';
import { ReactNode } from 'react';
import { getAdminUser } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

const links = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/research', label: 'Семантика' },
  { href: '/admin/content-plan', label: 'Контент-план' },
  { href: '/admin/ssr', label: 'SSR' },
  { href: '/admin/llm', label: 'LLM' },
  { href: '/admin/index', label: 'Index' },
  { href: '/admin/users', label: 'Users' },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getAdminUser();

  if (!user) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900">Доступ запрещён</h1>
        <p className="mt-2 text-sm text-gray-600">
          Админ-раздел доступен только авторизованному администратору.
        </p>
        <Link
          href="/sign-in"
          className="mt-4 inline-block text-sm text-orange-600 hover:text-orange-700"
        >
          Войти
        </Link>
      </main>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      <div className="mb-8 flex flex-col gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-gray-900">Admin</h1>
          <p className="mt-1 text-sm text-gray-600">{user.email}</p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-full border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:border-orange-200 hover:text-orange-700"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
