import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Профиль сайта онлайн — структура, сигналы, индекс | SEORISK.RU',
  description:
    'Соберите профиль сайта одним экраном: тип проекта, структура sitemap, коммерческие сигналы, индекс и технический профиль.',
  alternates: {
    canonical: `${siteUrl}/tools/site-profile`,
  },
  openGraph: {
    title: 'Профиль сайта — Site Profile',
    description:
      'Тип сайта, структура sitemap, коммерческие сигналы, индекс и технический профиль без лишней технички.',
    url: `${siteUrl}/tools/site-profile`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function SiteProfileLayout({ children }: { children: ReactNode }) {
  return children;
}
