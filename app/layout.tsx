import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import Script from 'next/script';
import { MetrikaHit } from '@/components/metrika-hit';
import SiteHeader from '@/components/site-header';
import { getUser } from '@/lib/db/queries';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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

        <SiteHeader authHref={authHref} authLabel={authLabel} />

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
