'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

export default function LlmCheckPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LlmResponse | null>(null);
  const browser = data?.checks.browser;

  const diffSet = useMemo(() => {
    if (!data || !browser) return new Map<string, Set<string>>();
    const base = formatSnapshot(browser);
    const map = new Map<string, Set<string>>();
    Object.keys(data.checks)
      .filter((key) => key !== 'browser')
      .forEach((key) => {
        const snap = formatSnapshot((data.checks as any)[key]);
        const diffs = new Set<string>();
        if (snap.http !== base.http) diffs.add('http_code');
        if (snap.text_len !== base.text_len) diffs.add('text_len');
        if (snap.links !== base.links) diffs.add('links_count');
        if (snap.h1 !== base.h1) diffs.add('has_h1');
        if (snap.title !== base.title) diffs.add('has_title');
        if (snap.access !== base.access) diffs.add('access');
        map.set(key, diffs);
      });
    return map;
  }, [data, browser]);

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
                    <tr className="border-t border-gray-100 bg-gray-50/50">
                      <td className="px-4 py-3 font-medium text-gray-900">Browser</td>
                      <td className="px-4 py-3 text-gray-700">{data.checks.browser.http_code}</td>
                      <td className="px-4 py-3 text-gray-700">{data.checks.browser.text_len}</td>
                      <td className="px-4 py-3 text-gray-700">{data.checks.browser.links_count}</td>
                      <td className="px-4 py-3 text-gray-700">
                        {data.checks.browser.has_h1 ? 'есть' : 'нет'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {data.checks.browser.has_title ? 'есть' : 'нет'}
                      </td>
                      <td className="px-4 py-3 text-gray-700">
                        {data.checks.browser.access_state || 'ok'}
                      </td>
                    </tr>
                    {LLM_OPTIONS.map((opt) => {
                      const snap = data.checks[opt.key];
                      if (!snap) return null;
                      const base = formatSnapshot(data.checks.browser);
                      const row = formatSnapshot(snap);
                      const diffs = diffSet.get(opt.key) || new Set();
                      const cellClass = (key: string) =>
                        diffs.has(key) ? 'text-red-600 font-semibold' : 'text-gray-700';
                      return (
                        <tr key={opt.key} className="border-t border-gray-100">
                          <td className="px-4 py-3">{opt.label}</td>
                          <td className="px-4 py-3">{row.http}</td>
                          <td className="px-4 py-3"><span className={cellClass('text_len')}>{row.text_len}</span></td>
                          <td className="px-4 py-3"><span className={cellClass('links_count')}>{row.links}</span></td>
                          <td className="px-4 py-3"><span className={cellClass('has_h1')}>{row.h1}</span></td>
                          <td className="px-4 py-3"><span className={cellClass('has_title')}>{row.title}</span></td>
                          <td className="px-4 py-3"><span className={cellClass('access')}>{row.access}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          )}
        </div>
      </main>
    </div>
  );
}
