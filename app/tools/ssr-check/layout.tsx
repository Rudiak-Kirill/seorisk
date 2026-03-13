import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Как видят сайт поисковые боты — проверить онлайн | SEORISK.RU',
  description:
    'Сравните как страницу видят браузер, Googlebot и Яндекс-бот. Найдите расхождения в рендеринге которые мешают индексации. Бесплатная проверка онлайн.',
  alternates: {
    canonical: `${siteUrl}/tools/ssr-check`,
  },
  openGraph: {
    title: 'Как видят сайт поисковые боты — SSR Check',
    description:
      'Браузер видит страницу, а Googlebot — нет? Проверьте рендеринг за 30 секунд. Бесплатно.',
    url: `${siteUrl}/tools/ssr-check`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function SsrCheckLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
