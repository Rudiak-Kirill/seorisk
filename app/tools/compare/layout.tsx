import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Сравнить сайт с конкурентами — Competitor Compare | SEORISK.RU',
  description:
    'Сравните свой сайт с конкурентами по публичным SEO-сигналам: профиль, sitemap, скорость, боты, AI-готовность и поддомены.',
  alternates: {
    canonical: `${siteUrl}/tools/compare`,
  },
  openGraph: {
    title: 'Сравнить сайт с конкурентами — Competitor Compare',
    description:
      'Публичное сравнение доменов по Site Profile, Speed Check, Index Check, LLM Check, SSR Check и Subdomain Check.',
    url: `${siteUrl}/tools/compare`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function CompareLayout({ children }: { children: ReactNode }) {
  return children;
}
