import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import Link from 'next/link';
import Script from 'next/script';
import { CircleIcon } from 'lucide-react';
import { MetrikaHit } from '@/components/metrika-hit';
import { getUser } from '@/lib/db/queries';

export const metadata: Metadata = {
  title: 'SEORISK.RU',
  description:
    'Проверка URL на индексируемость и расхождения между браузером, SEO- и LLM-ботами.',
  verification: { yandex: 'e034bf48077e0fff' },
};

export const viewport: Viewport = {
  maximumScale: 1,
};

const manrope = Manrope({ subsets: ['latin', 'cyrillic'] });
const METRIKA_ID = 107086812;

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getUser();
  const authHref = user ? '/dashboard' : '/sign-in';
  const authLabel = user ? 'Кабинет' : 'Войти';

  return (
    <html lang="ru" className={`${manrope.className} bg-white text-black`}>
      <head>
        <meta name="yandex-verification" content="e034bf48077e0fff" />
      </head>
      <body className="min-h-[100dvh] bg-gray-50">
        <Script
          id="yandex-metrika"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function(m,e,t,r,i,k,a){
  m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
  m[i].l=1*new Date();
  for (var j = 0; j < document.scripts.length; j++) { if (document.scripts[j].src === r) { return; } }
  k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a);
})(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}', 'ym');

ym(${METRIKA_ID}, 'init', {
  ssr: true,
  webvisor: true,
  clickmap: true,
  ecommerce: "dataLayer",
  referrer: document.referrer,
  url: location.href,
  accurateTrackBounce: true,
  trackLinks: true
});
            `,
          }}
        />

        <MetrikaHit metrikaId={METRIKA_ID} />

        <header className="border-b border-gray-200">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center">
              <CircleIcon className="h-6 w-6 text-orange-500" />
              <span className="ml-2 text-xl font-semibold text-gray-900">SEORISK.RU</span>
            </Link>

            <nav className="flex items-center gap-4">
              <Link href="/" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Главная
              </Link>
              <Link
                href="/tools/ssr-check"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                SSR Check
              </Link>
              <Link
                href="/tools/llm-check"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                LLM Check
              </Link>
              <Link
                href="/tools/index-check"
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Index Check
              </Link>
              <Link
                href={authHref}
                className="text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                {authLabel}
              </Link>
            </nav>
          </div>
        </header>

        {children}

        <footer className="mt-auto border-t border-gray-200">
          <div className="mx-auto max-w-7xl px-4 py-6 text-sm text-gray-500 sm:px-6 lg:px-8">
            © {new Date().getFullYear()} SEORISK.RU
          </div>
        </footer>

        <noscript>
          <div>
            <img
              src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
              style={{ position: 'absolute', left: '-9999px' }}
              alt=""
            />
          </div>
        </noscript>
      </body>
    </html>
  );
}
