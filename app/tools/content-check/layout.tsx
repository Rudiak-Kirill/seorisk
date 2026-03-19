import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Проверка контента страницы по типу | SEORISK.RU',
  description:
    'Определите тип страницы и проверьте по чеклисту для товара, каталога, статьи, главной, лендинга или контактов.',
  alternates: {
    canonical: `${siteUrl}/tools/content-check`,
  },
  openGraph: {
    title: 'Проверка контента страницы по типу',
    description:
      'Найдите, чего не хватает странице: цены, Schema Product, H1, автора, CTA, FAQ и других типовых элементов.',
    url: `${siteUrl}/tools/content-check`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function ContentCheckLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
