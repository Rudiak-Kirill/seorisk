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
    llm1: Snapshot;
    llm2: Snapshot;
    llm3: Snapshot;
  };
  agents: {
    llm1: { key: string; label: string; ua: string };
    llm2: { key: string; label: string; ua: string };
    llm3: { key: string; label: string; ua: string };
  };
  error?: string;
};

const labelMap = {
  http: 'HTTP',
  text_len: 'Текст',
  links: 'Ссылки',
  h1: 'H1',
  title: 'Title',
  access: 'Access',
} as const;

const formatSnapshot = (snap: Snapshot) => ({
  http: snap.http_code,
  text_len: snap.text_len,
  links: snap.links_count,
  h1: snap.has_h1 ? 'есть' : 'нет',
  title: snap.has_title ? 'есть' : 'нет',
  access: snap.access_state || 'ok',
});

function ResultCard({
  snap,
  diffSet,
  agentKey,
  onChange,
}: {
  snap: ReturnType<typeof formatSnapshot>;
  diffSet: Set<string>;
  agentKey: string;
  onChange: (next: string) => void;
}) {
  const hasDiff = (kind: string) => diffSet.has(kind);
  const rowClass = (kind: string) =>
    `flex items-center justify-between border-b border-dashed border-gray-200 py-1 text-sm ${
      hasDiff(kind) ? 'text-red-600 font-semibold' : 'text-gray-700'
    }`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3">
        <select
          value={agentKey}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
        >
          {LLM_OPTIONS.map((opt) => (
            <option key={opt.key} value={opt.key}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className={rowClass('http_code')}>
        <span>{labelMap.http}</span>
        <span>{snap.http}</span>
      </div>
      <div className={rowClass('text_len')}>
        <span>{labelMap.text_len}</span>
        <span>{snap.text_len}</span>
      </div>
      <div className={rowClass('links_count')}>
        <span>{labelMap.links}</span>
        <span>{snap.links}</span>
      </div>
      <div className={rowClass('has_h1')}>
        <span>{labelMap.h1}</span>
        <span>{snap.h1}</span>
      </div>
      <div className={rowClass('has_title')}>
        <span>{labelMap.title}</span>
        <span>{snap.title}</span>
      </div>
      <div className="flex items-center justify-between py-1 text-sm text-gray-700">
        <span>{labelMap.access}</span>
        <span>{snap.access}</span>
      </div>
    </div>
  );
}

export default function LlmCheckPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LlmResponse | null>(null);
  const [a1, setA1] = useState('gptbot');
  const [a2, setA2] = useState('claudebot');
  const [a3, setA3] = useState('perplexitybot');

  const browser = data?.checks.browser;

  const diffSet = useMemo(() => {
    if (!data || !browser) return new Map<string, Set<string>>();
    const base = formatSnapshot(browser);
    const map = new Map<string, Set<string>>();
    ['llm1', 'llm2', 'llm3'].forEach((key) => {
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
        body: JSON.stringify({ url, a1, a2, a3 }),
      });
      const payload = (await resp.json()) as LlmResponse & { error?: string };
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
            <>
              <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-sm font-semibold text-gray-900">Browser</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-gray-700 sm:grid-cols-3">
                  <div>HTTP: {data.checks.browser.http_code}</div>
                  <div>Текст: {data.checks.browser.text_len}</div>
                  <div>Ссылки: {data.checks.browser.links_count}</div>
                  <div>H1: {data.checks.browser.has_h1 ? 'есть' : 'нет'}</div>
                  <div>Title: {data.checks.browser.has_title ? 'есть' : 'нет'}</div>
                  <div>Access: {data.checks.browser.access_state || 'ok'}</div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <ResultCard
                  snap={formatSnapshot(data.checks.llm1)}
                  diffSet={diffSet.get('llm1') || new Set()}
                  agentKey={a1}
                  onChange={setA1}
                />
                <ResultCard
                  snap={formatSnapshot(data.checks.llm2)}
                  diffSet={diffSet.get('llm2') || new Set()}
                  agentKey={a2}
                  onChange={setA2}
                />
                <ResultCard
                  snap={formatSnapshot(data.checks.llm3)}
                  diffSet={diffSet.get('llm3') || new Set()}
                  agentKey={a3}
                  onChange={setA3}
                />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
