import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import Link from 'next/link';
import { CircleIcon } from 'lucide-react';

export const metadata: Metadata = {
  title: 'SEORISK.RU',
  description:
    'Разовая проверка URL на расхождения контента между браузером и ботами.'
};

export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white ${manrope.className}`}
    >
      <body className="min-h-[100dvh] bg-gray-50">
        <header className="border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
            <Link href="/" className="flex items-center">
              <CircleIcon className="h-6 w-6 text-orange-500" />
              <span className="ml-2 text-xl font-semibold text-gray-900">
                SEORISK.RU
              </span>
            </Link>
            <nav className="flex items-center gap-4">
              <Link
                href="/"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Главная
              </Link>
              <Link
                href="/tools/ssr-check"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                SSR Check
              </Link>
              <Link
                href="/sign-in"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Войти
              </Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mt-auto border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-sm text-gray-500">
            © {new Date().getFullYear()} SEORISK.RU
          </div>
        </footer>
      </body>
    </html>
  );
}
