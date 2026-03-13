'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from 'lucide-react';
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
  { key: 'cohere-ai', label: 'Cohere' },
] as const;

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

type AgentStatus = 'ok' | 'warn' | 'fail';

type AgentResult = {
  key: string;
  label: string;
  snap: Snapshot;
  status: AgentStatus;
  badge: string;
  summary: string;
};

const LLM_FAQ: FaqItem[] = [
  {
    question: 'Какую боль решает LLM Check?',
    answer:
      'Сайт может быть доступен обычным пользователям и поисковым ботам, но недоступен или частично недоступен для LLM-ботов и AI-краулеров. Это значит, что контент хуже попадает в AI-поиск, AI-ответы и будущие каналы обнаружения контента.',
  },
  {
    question: 'Что делает LLM Check?',
    answer:
      'Инструмент проверяет, как страницу видят разные LLM-боты и AI-агенты. Сравнивает ответ браузера и популярных AI-ботов по HTTP, тексту, ссылкам, H1, title и статусу доступа.',
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
      'Позволяет увидеть, какие AI-боты получают страницу нормально, а какие — нет. Помогает быстро найти технические ограничения, которые могут снижать видимость сайта для LLM-платформ.',
  },
  {
    question: 'Какие вопросы помогает ответить LLM Check?',
    answer:
      'Доступна ли страница для GPTBot, ClaudeBot, PerplexityBot и других?\nНе блокируются ли AI-боты сервером, CDN или правилами защиты?\nПолучают ли они текст и основные элементы страницы?\nЕсть ли расхождения между браузером и AI-ботами?',
  },
  {
    question: 'Что не делает LLM Check?',
    answer:
      'Инструмент не гарантирует, что конкретная LLM использует страницу в ответах. Он проверяет техническую доступность и базовый ответ страницы для AI-ботов, а не факт включения контента в модель или выдачу.',
  },
];

function getAccessLabel(value?: string | null) {
  return value || 'ok';
}

function getBotSummary(browser: Snapshot, snap: Snapshot) {
  const access = getAccessLabel(snap.access_state);

  if (snap.http_code !== 200 || access !== 'ok') {
    if (snap.http_code >= 500) {
      return {
        status: 'fail' as const,
        badge: snap.http_code ? String(snap.http_code) : 'ERR',
        summary:
          'Сервер вернул ошибку. Бот не получил страницу — возможна блокировка на уровне CDN или сервера.',
      };
    }

    if (snap.http_code >= 400) {
      return {
        status: 'fail' as const,
        badge: String(snap.http_code),
        summary:
          'Доступ для бота ограничен. Проверьте правила защиты, CDN и фильтрацию по user-agent.',
      };
    }

    if (access === 'captcha' || access === 'challenge' || access === 'blocked') {
      return {
        status: 'fail' as const,
        badge: access,
        summary:
          'Бот упирается в защиту сайта и не получает нормальный ответ страницы.',
      };
    }

    return {
      status: 'fail' as const,
      badge: 'ошибка',
      summary:
        'Бот не смог получить страницу. Проверьте доступность, таймауты и ответы сервера.',
    };
  }

  const issues: string[] = [];

  if (browser.text_len >= 100 && snap.text_len < browser.text_len * 0.7) {
    issues.push('бот получает заметно меньше текста');
  }

  if (browser.links_count > 0 && snap.links_count < browser.links_count) {
    issues.push('бот видит меньше ссылок');
  }

  if (browser.has_h1 && !snap.has_h1) {
    issues.push('бот не видит H1');
  }

  if (browser.has_title && !snap.has_title) {
    issues.push('бот не видит title');
  }

  if (issues.length > 0) {
    return {
      status: 'warn' as const,
      badge: 'warn',
      summary: `${issues[0][0].toUpperCase()}${issues[0].slice(1)}.`,
    };
  }

  return {
    status: 'ok' as const,
    badge: 'ok',
    summary: 'Бот получает страницу без заметных расхождений.',
  };
}

function getBannerConfig(failCount: number, warnCount: number) {
  if (failCount > 0) {
    return {
      title: 'Есть проблема',
      description:
        failCount === 1
          ? 'Один AI-бот не может получить страницу.'
          : `${failCount} AI-бота не могут получить страницу.`,
      icon: ShieldAlert,
      className: 'border-red-200 bg-red-50 text-red-800',
      iconClassName: 'text-red-600',
    };
  }

  if (warnCount > 0) {
    return {
      title: 'Есть расхождения',
      description:
        warnCount === 1
          ? 'Один AI-бот видит урезанную версию страницы.'
          : `${warnCount} AI-бота видят урезанную версию страницы.`,
      icon: AlertTriangle,
      className: 'border-amber-200 bg-amber-50 text-amber-800',
      iconClassName: 'text-amber-600',
    };
  }

  return {
    title: 'Всё в порядке',
    description: 'AI-боты получают страницу без заметных расхождений.',
    icon: CheckCircle2,
    className: 'border-green-200 bg-green-50 text-green-800',
    iconClassName: 'text-green-600',
  };
}

function getCountPillClass(status: AgentStatus) {
  if (status === 'fail') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'warn') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-green-200 bg-green-50 text-green-700';
}

function formatSnapshot(snap: Snapshot) {
  return {
    http: snap.http_code,
    text: snap.text_len,
    links: snap.links_count,
    h1: snap.has_h1 ? 'есть' : 'нет',
    title: snap.has_title ? 'есть' : 'нет',
    access: getAccessLabel(snap.access_state),
  };
}

export default function LlmCheckPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LlmResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const browserSnapshot = data?.checks.browser;

  const agentResults = useMemo(() => {
    if (!data || !browserSnapshot) return [];

    return LLM_OPTIONS.map((option) => {
      const snap = data.checks[option.key];
      if (!snap) return null;

      const result = getBotSummary(browserSnapshot, snap);

      return {
        key: option.key,
        label: option.label,
        snap,
        ...result,
      } satisfies AgentResult;
    }).filter(Boolean) as AgentResult[];
  }, [browserSnapshot, data]);

  const okCount = agentResults.filter((item) => item.status === 'ok').length;
  const warnCount = agentResults.filter((item) => item.status === 'warn').length;
  const failCount = agentResults.filter((item) => item.status === 'fail').length;
  const problemAgents = agentResults.filter((item) => item.status !== 'ok');

  const banner = useMemo(
    () => getBannerConfig(failCount, warnCount),
    [failCount, warnCount],
  );

  const detailRows = useMemo(() => {
    if (!data) return [];

    const sortedAgents = [...agentResults].sort((left, right) => {
      const order: Record<AgentStatus, number> = { fail: 0, warn: 1, ok: 2 };
      return order[left.status] - order[right.status];
    });

    return [
      { key: 'browser', label: 'Browser', snap: data.checks.browser, status: 'ok' as AgentStatus },
      ...sortedAgents,
    ];
  }, [agentResults, data]);

  const maxTextLen = useMemo(() => {
    if (!detailRows.length) return 0;

    return detailRows.reduce(
      (maxValue, row) => Math.max(maxValue, row.snap.text_len),
      0,
    );
  }, [detailRows]);

  const onCheck = async () => {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setData(null);
    setShowDetails(false);

    try {
      const response = await fetch('/api/llm-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const payload = (await response.json()) as LlmResponse;

      if (!response.ok || payload.ok === false) {
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
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">
          Доступна ли ваша страница для AI-ботов
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Проверьте, доступна ли ваша страница для GPTBot, ClaudeBot, PerplexityBot
          и других AI-ботов.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button className="rounded-full" onClick={onCheck} disabled={loading}>
              {loading ? 'Проверяем...' : 'Проверить'}
            </Button>
          </div>

          {error && (
            <div className="mt-4 rounded-md bg-black px-4 py-3 text-sm text-white">
              {error}
            </div>
          )}

          {data && (
            <>
              <section
                className={`mt-6 rounded-2xl border ${banner.className}`}
              >
                <div className="flex flex-col gap-4 px-5 py-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <banner.icon className={`mt-0.5 h-6 w-6 shrink-0 ${banner.iconClassName}`} />
                    <div>
                      <div className="text-lg font-semibold">{banner.title}</div>
                      <p className="mt-1 text-sm leading-6 text-current/90">
                        {banner.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getCountPillClass(
                        'ok',
                      )}`}
                    >
                      {okCount} ботов — норма
                    </span>
                    {warnCount > 0 && (
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getCountPillClass(
                          'warn',
                        )}`}
                      >
                        {warnCount} с расхождениями
                      </span>
                    )}
                    {failCount > 0 && (
                      <span
                        className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${getCountPillClass(
                          'fail',
                        )}`}
                      >
                        {failCount} заблокирован
                      </span>
                    )}
                  </div>
                </div>

                {problemAgents.length > 0 && (
                  <div className="border-t border-black/10 bg-white/60">
                    {problemAgents.map((agent) => (
                      <div
                        key={agent.key}
                        className="grid gap-3 px-5 py-4 md:grid-cols-[180px_1fr]"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`inline-flex min-w-14 justify-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                              agent.status === 'fail'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {agent.badge}
                          </span>
                          <span className="font-medium text-gray-900">{agent.label}</span>
                        </div>
                        <div className="text-sm text-gray-600">{agent.summary}</div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <div className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setShowDetails((prev) => !prev)}
                >
                  {showDetails ? 'Скрыть детали' : 'Показать детали'}
                  {showDetails ? (
                    <ChevronUp className="ml-2 h-4 w-4" />
                  ) : (
                    <ChevronDown className="ml-2 h-4 w-4" />
                  )}
                </Button>
              </div>

              {showDetails && (
                <section className="mt-6 overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
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
                      {detailRows.map((row) => {
                        const view = formatSnapshot(row.snap);
                        const textClass =
                          row.key !== 'browser' && row.snap.text_len < maxTextLen
                            ? 'font-semibold text-red-600'
                            : row.key === 'browser'
                              ? 'text-gray-900'
                              : 'font-semibold text-green-600';
                        const linksClass =
                          row.snap.links_count > 0
                            ? 'font-semibold text-green-600'
                            : 'font-semibold text-red-600';
                        const boolTrueClass = 'font-semibold text-green-600';
                        const boolFalseClass = 'font-semibold text-red-600';
                        const accessClass =
                          getAccessLabel(row.snap.access_state) === 'ok'
                            ? 'font-semibold text-green-600'
                            : 'font-semibold text-red-600';

                        return (
                          <tr key={row.key} className="border-t border-gray-100">
                            <td className="px-4 py-3 font-medium text-gray-900">{row.label}</td>
                            <td className="px-4 py-3">
                              <span
                                className={
                                  row.snap.http_code === 200
                                    ? 'font-semibold text-green-600'
                                    : 'font-semibold text-red-600'
                                }
                              >
                                {view.http}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={textClass}>{view.text}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={linksClass}>{view.links}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={row.snap.has_h1 ? boolTrueClass : boolFalseClass}>
                                {view.h1}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={row.snap.has_title ? boolTrueClass : boolFalseClass}>
                                {view.title}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className={accessClass}>{view.access}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              )}
            </>
          )}
        </div>

        <ToolFaq title="FAQ по LLM Check" items={LLM_FAQ} />
      </main>
    </div>
  );
}
