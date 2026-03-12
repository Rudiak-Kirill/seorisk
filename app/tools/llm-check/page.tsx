'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ToolFaq, { type FaqItem } from '@/components/tool-faq';

const LLM_OPTIONS = [
  { key: 'gptbot', label: 'GPTBot' },
  { key: 'chatgpt-user', label: 'ChatGPT-User' },
  { key: 'oai-searchbot', label: 'OAI-SearchBot' },
  { key: 'claudebot', label: 'ClaudeBot' },
  { key: 'anthropic-ai', label: 'Anthropic AI' },
  { key: 'perplexitybot', label: 'PerplexityBot' },
  { key: 'youbot', label: 'YouBot' },
  { key: 'applebot-extended', label: 'Applebot-Extended' },
  { key: 'amazonbot', label: 'Amazonbot' },
  { key: 'bytespider', label: 'Bytespider' },
  { key: 'diffbot', label: 'Diffbot' },
  { key: 'ccbot', label: 'CCBot' },
  { key: 'cohere-ai', label: 'Cohere' }
];

type Snapshot = {
  http_code: number;
  text_len: number;
  links_count: number;
  has_h1: boolean;
  has_title: boolean;
  access_state?: string | null;
};

type LlmResponse = {
  ok: boolean;
  url: string;
  checked_at: string;
  checks: {
    browser: Snapshot;
    [key: string]: Snapshot;
  };
  agents: {
    [key: string]: { key: string; label: string; ua: string };
  };
  error?: string;
};

const formatSnapshot = (snap: Snapshot) => ({
  http: snap.http_code,
  text_len: snap.text_len,
  links: snap.links_count,
  h1: snap.has_h1 ? 'есть' : 'нет',
  title: snap.has_title ? 'есть' : 'нет',
  access: snap.access_state || 'ok',
});

const LLM_FAQ: FaqItem[] = [
  {
    question: 'Какую проблему решает LLM Check?',
    answer:
      'Сайт может быть доступен обычным пользователям и поисковым ботам, но недоступен или частично недоступен для LLM-ботов и AI-краулеров. Это снижает вероятность попадания контента в AI-поиск, AI-ответы и новые каналы обнаружения контента.',
  },
  {
    question: 'Что делает LLM Check?',
    answer:
      'Инструмент проверяет, как страницу видят разные LLM-боты и AI-агенты. Он сравнивает ответ браузера и популярных AI-ботов по HTTP, тексту, ссылкам, H1, title и статусу доступа.',
  },
  {
    question: 'Кому нужен этот инструмент?',
    answer:
      'SEO-специалистам, владельцам контентных сайтов, медиа, SaaS-проектам, маркетологам и всем, кто хочет понимать, доступен ли сайт для AI-ботов и новых каналов трафика.',
  },
  {
    question: 'Когда LLM Check особенно полезен?',
    answer:
      'Когда важно понять, может ли контент использоваться AI-системами.\nКогда есть подозрение, что часть ботов получает ошибку или пустой ответ.\nКогда хочется проверить готовность сайта к AI-поиску и LLM visibility.',
  },
  {
    question: 'Какой результат даёт LLM Check?',
    answer:
      'Инструмент позволяет увидеть, какие AI-боты получают страницу нормально, а какие — нет. Это помогает быстро найти технические ограничения, которые могут снижать видимость сайта для LLM-платформ.',
  },
  {
    question: 'На какие вопросы помогает ответить LLM Check?',
    answer:
      'Доступна ли страница для GPTBot, ClaudeBot, PerplexityBot и других?\nНе блокируются ли AI-боты сервером, CDN или правилами защиты?\nПолучают ли они текст и основные элементы страницы?\nЕсть ли расхождения между браузером и AI-ботами?',
  },
  {
    question: 'Что не делает LLM Check?',
    answer:
      'Инструмент не гарантирует, что конкретная LLM использует страницу в ответах. Он проверяет техническую доступность и базовый ответ страницы для AI-ботов, а не факт включения контента в модель или выдачу.',
  },
];

export default function LlmCheckPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LlmResponse | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];

    const result = [
      { key: 'browser', label: 'Browser', snap: data.checks.browser },
      ...LLM_OPTIONS.map((opt) => ({
        key: opt.key,
        label: opt.label,
        snap: data.checks[opt.key],
      })).filter((row) => Boolean(row.snap)),
    ];

    return result as Array<{ key: string; label: string; snap: Snapshot }>;
  }, [data]);

  const maxTextLen = useMemo(() => {
    if (!rows.length) return 0;
    return rows.reduce((maxValue, row) => Math.max(maxValue, row.snap.text_len), 0);
  }, [rows]);

  const okClass = 'font-semibold text-green-600';
  const badClass = 'font-semibold text-red-600';
  const httpClass = (value: number) => (value === 200 ? okClass : badClass);
  const textClass = (value: number) => (value < maxTextLen ? badClass : okClass);
  const linksClass = (value: number) => (value > 0 ? okClass : badClass);
  const boolClass = (value: boolean) => (value ? okClass : badClass);
  const accessClass = (value?: string | null) =>
    (value || 'ok') === 'ok' ? okClass : badClass;

  const onCheck = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const resp = await fetch('/api/llm-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const raw = await resp.text();
      let payload: (LlmResponse & { error?: string }) | null = null;
      try {
        payload = JSON.parse(raw) as LlmResponse & { error?: string };
      } catch {
        setError(raw || 'Ошибка');
        return;
      }
      if (!resp.ok || payload.ok === false) {
        setError(payload.error || 'Ошибка');
        return;
      }
      setData(payload);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">LLM Check</h1>
        <p className="mt-2 text-sm text-gray-500">
          Сравните ответ браузера и популярных LLM-ботов.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button className="rounded-full" onClick={onCheck} disabled={loading}>
              {loading ? 'Проверяем...' : 'Проверить'}
            </Button>
          </div>

          {error && (
            <div className="mt-3 rounded-md bg-black px-4 py-3 text-sm text-white">
              {error}
            </div>
          )}

          {data && (
            <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Агент</th>
                    <th className="px-4 py-3 text-left">HTTP</th>
                    <th className="px-4 py-3 text-left">Текст</th>
                    <th className="px-4 py-3 text-left">Ссылки</th>
                    <th className="px-4 py-3 text-left">H1</th>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Access</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const view = formatSnapshot(row.snap);

                    return (
                      <tr
                        key={row.key}
                        className={
                          index === 0
                            ? 'border-t border-gray-100 bg-gray-50/50'
                            : 'border-t border-gray-100'
                        }
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
                        <td className="px-4 py-3">
                          <span className={httpClass(row.snap.http_code)}>{view.http}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={textClass(row.snap.text_len)}>{view.text_len}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={linksClass(row.snap.links_count)}>{view.links}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={boolClass(row.snap.has_h1)}>{view.h1}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={boolClass(row.snap.has_title)}>{view.title}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={accessClass(row.snap.access_state)}>{view.access}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <ToolFaq title="FAQ по LLM Check" items={LLM_FAQ} />
      </main>
    </div>
  );
}
