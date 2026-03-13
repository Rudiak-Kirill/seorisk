import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title:
    'Проверить индексацию страницы онлайн — robots.txt, canonical, sitemap | SEORISK.RU',
  description:
    'Проверьте почему страница не индексируется: HTTP-ответ, meta robots, robots.txt, canonical и наличие в sitemap. Бесплатная проверка индексации онлайн за 30 секунд.',
  alternates: {
    canonical: `${siteUrl}/tools/index-check`,
  },
  openGraph: {
    title: 'Проверить индексацию страницы — Index Check',
    description:
      'Страница не попадает в поиск? Проверьте robots.txt, noindex, canonical и sitemap за 30 секунд.',
    url: `${siteUrl}/tools/index-check`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function IndexCheckLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
