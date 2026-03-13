import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSiteUrl } from '@/lib/site-url';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title:
    'Как попасть в ответы ИИ — проверка доступности для LLM-ботов | SEORISK.RU',
  description:
    'Проверьте доступна ли ваша страница для GPTBot, ClaudeBot, PerplexityBot и других AI-ботов. Узнайте почему сайт не попадает в ответы ChatGPT и Яндекс ИИ.',
  alternates: {
    canonical: `${siteUrl}/tools/llm-check`,
  },
  openGraph: {
    title: 'Проверка доступности сайта для ИИ-ботов — LLM Check',
    description:
      'Ваш сайт видят ChatGPT, Claude, Perplexity? Проверьте за 30 секунд. Бесплатно.',
    url: `${siteUrl}/tools/llm-check`,
    siteName: 'SEORISK.RU',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function LlmCheckLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
