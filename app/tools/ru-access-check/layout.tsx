import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Проверить доступность сайта из РФ — RU Access Check | SEORISK.RU',
  description:
    'Проверьте, внесён ли сайт в реестр блокировок и открывается ли он из России. Отдельно проверяем реестр РКН, доступ с российского IP и доступ снаружи РФ.',
  alternates: {
    canonical: `${siteUrl}/tools/ru-access-check`,
  },
  openGraph: {
    title: 'Проверить доступность сайта из РФ — RU Access Check',
    description:
      'Два независимых сигнала: реестр РКН и фактический доступ из РФ. Быстрый вердикт по блокировке, хостингу и действиям.',
    url: `${siteUrl}/tools/ru-access-check`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function RuAccessCheckLayout({ children }: { children: ReactNode }) {
  return children;
}
