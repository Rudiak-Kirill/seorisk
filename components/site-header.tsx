'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import LogoMark from '@/components/logo-mark';

type SiteHeaderProps = {
  authHref: string;
  authLabel: string;
};

const navLinks = [
  { href: '/', label: 'Главная' },
  { href: '/tools/ssr-check', label: 'SSR Check' },
  { href: '/tools/llm-check', label: 'LLM Check' },
  { href: '/tools/index-check', label: 'Index Check' },
  { href: '/tools/speed-check', label: 'Speed Check (Бета)' },
  { href: '/tools/site-profile', label: 'Site Profile (Бета)' },
];

export default function SiteHeader({ authHref, authLabel }: SiteHeaderProps) {
  const [isOpen, setIsOpen] = useState(false);

  const allLinks = [...navLinks, { href: authHref, label: authLabel }];

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center">
          <LogoMark className="h-6 w-6 shrink-0" />
          <span className="ml-2 truncate text-xl font-semibold text-gray-900">SEORISK.RU</span>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          {allLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          aria-expanded={isOpen}
          aria-label={isOpen ? 'Закрыть меню' : 'Открыть меню'}
          onClick={() => setIsOpen((value) => !value)}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 text-gray-700 transition hover:border-gray-300 hover:text-gray-900 md:hidden"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isOpen ? (
        <div className="border-t border-gray-200 bg-white md:hidden">
          <nav className="mx-auto flex max-w-7xl flex-col px-4 py-3 sm:px-6">
            {allLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="rounded-xl px-3 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-gray-900"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
