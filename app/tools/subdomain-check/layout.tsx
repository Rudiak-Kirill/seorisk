import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: 'Проверить поддомены сайта — Subdomain Check | SEORISK.RU',
  description:
    'Найдите поддомены сайта, проверьте dev/test/stage, региональные поддомены, robots.txt, редиректы и дубли контента.',
  alternates: {
    canonical: `${siteUrl}/tools/subdomain-check`,
  },
  openGraph: {
    title: 'Проверить поддомены сайта — Subdomain Check',
    description:
      'Автоматический аудит поддоменов: crt.sh, dev/test/stage, региональные поддомены, robots.txt и SEO-риски.',
    url: `${siteUrl}/tools/subdomain-check`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function SubdomainCheckLayout({ children }: { children: ReactNode }) {
  return children;
}
