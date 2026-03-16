import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Проверить скорость сайта онлайн — TTFB, кеш, LCP | SEORISK.RU',
  description:
    'Быстрый Speed Check: TTFB, кеширование, Core Web Vitals и понятные действия без лишней технички. Узнайте, что тормозит сайт, за один экран.',
  alternates: {
    canonical: `${siteUrl}/tools/speed-check`,
  },
  openGraph: {
    title: 'Проверить скорость сайта — Speed Check',
    description:
      'TTFB, кеширование, мобильная скорость и Lighthouse-диагностика в одном инструменте.',
    url: `${siteUrl}/tools/speed-check`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function SpeedCheckLayout({ children }: { children: ReactNode }) {
  return children;
}
