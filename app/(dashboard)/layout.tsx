import Link from 'next/link';
import { CircleIcon } from 'lucide-react';

function Header() {
  return (
    <header className="border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center">
          <CircleIcon className="h-6 w-6 text-orange-500" />
          <span className="ml-2 text-xl font-semibold text-gray-900">
            SEO Risk Check
          </span>
        </Link>
        <Link
          href="/tools/ssr-check"
          className="text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          SSR Check
        </Link>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex min-h-screen flex-col">
      <Header />
      {children}
    </section>
  );
}
