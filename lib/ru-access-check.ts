import { lookup, resolveCname, reverse } from 'node:dns/promises';

const REGISTRY_CACHE_TTL_MS = 60 * 60 * 1000;
const ACCESS_CACHE_TTL_MS = 15 * 60 * 1000;
const REGISTRY_TIMEOUT_MS = 5_000;
const RU_TIMEOUT_MS = 10_000;
const EXTERNAL_TIMEOUT_MS = 15_000;
const CHECK_HOST_NODE = 'us1.node.check-host.net';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

type CachedValue<T> = {
  expires_at: number;
  value: T;
};

type RegistryStatus = 'blocked' | 'not_blocked' | 'unknown';
type AccessStatus = 'accessible' | 'accessible_with_error' | 'timeout' | 'refused' | 'error' | 'unknown';
type VerdictKey =
  | 'ok'
  | 'blocked_officially'
  | 'listed_but_accessible'
  | 'not_blocked_but_unavailable'
  | 'unknown';

type RegistryResult = {
  status: RegistryStatus;
  blocked: boolean | null;
  reason: string | null;
  date: string | null;
  source: string | null;
  error: string | null;
};

type AccessProbeResult = {
  status: AccessStatus;
  reachable: boolean | null;
  http_status: number | null;
  final_url: string;
  redirect_target: string | null;
  error: string | null;
  headers: Record<string, string>;
  address: string | null;
  source: 'ru' | 'external';
};

type HostingResult = {
  provider: string;
  reason: string | null;
};

export type RuAccessCheckResult = {
  ok: boolean;
  checked_at: string;
  input: string;
  normalized_url: string;
  domain: string;
  verdict: {
    key: VerdictKey;
    status: 'ok' | 'warn' | 'fail';
    title: string;
    summary: string;
  };
  registry: RegistryResult;
  ru_access: AccessProbeResult;
  external_access: AccessProbeResult;
  hosting: HostingResult;
  recommendations: Array<{
    severity: 'critical' | 'warn' | 'improve';
    title: string;
    action: string;
  }>;
};

const registryCache = new Map<string, CachedValue<RegistryResult>>();
const accessCache = new Map<string, CachedValue<AccessProbeResult>>();
const hostingCache = new Map<string, CachedValue<HostingResult>>();

function getCached<T>(store: Map<string, CachedValue<T>>, key: string) {
  const cached = store.get(key);
  if (!cached) return null;
  if (cached.expires_at <= Date.now()) {
    store.delete(key);
    return null;
  }
  return cached.value;
}

function setCached<T>(store: Map<string, CachedValue<T>>, key: string, ttlMs: number, value: T) {
  store.set(key, { expires_at: Date.now() + ttlMs, value });
  return value;
}

function normalizeInput(value: string) {
  const trimmed = value.trim();
  const prepared = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(prepared);
  return {
    url: parsed.toString(),
    domain: parsed.hostname.toLowerCase(),
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHeaders(headers: Headers) {
  return Object.fromEntries(Array.from(headers.entries()).map(([key, value]) => [key.toLowerCase(), value]));
}

function describeFetchError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return 'timeout';

  if (error instanceof Error) {
    const text = `${error.name} ${error.message}`.trim();
    if (/ECONNREFUSED|connection refused/i.test(text)) return 'connection refused';
    return text || 'fetch_error';
  }

  return String(error || 'fetch_error');
}

function normalizeProbeStatus(status: number | null, error: string | null): AccessStatus {
  if (status !== null && status >= 200 && status <= 399) return 'accessible';
  if (status !== null && status >= 400 && status <= 599) return 'accessible_with_error';
  if (error === 'timeout') return 'timeout';
  if (/connection refused/i.test(error || '')) return 'refused';
  if (error) return 'error';
  return 'unknown';
}

async function probeFromRussia(targetUrl: string): Promise<AccessProbeResult> {
  const cacheKey = `ru:${targetUrl}`;
  const cached = getCached(accessCache, cacheKey);
  if (cached) return cached;

  let httpStatus: number | null = null;
  let finalUrl = targetUrl;
  let redirectTarget: string | null = null;
  let error: string | null = null;
  let headers = new Headers();

  try {
    let response = await fetchWithTimeout(
      targetUrl,
      {
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: '*/*',
        },
      },
      RU_TIMEOUT_MS
    );

    if (response.status === 405) {
      response = await fetchWithTimeout(
        targetUrl,
        {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        },
        RU_TIMEOUT_MS
      );
    }

    httpStatus = response.status;
    finalUrl = response.url || targetUrl;
    headers = response.headers;
    const location = response.headers.get('location');
    redirectTarget = location ? new URL(location, targetUrl).toString() : null;
  } catch (caught) {
    error = describeFetchError(caught);
  }

  const result: AccessProbeResult = {
    status: normalizeProbeStatus(httpStatus, error),
    reachable:
      httpStatus !== null
        ? httpStatus >= 200 && httpStatus <= 599
        : error === null
          ? null
          : false,
    http_status: httpStatus,
    final_url: finalUrl,
    redirect_target: redirectTarget,
    error,
    headers: normalizeHeaders(headers),
    address: null,
    source: 'ru',
  };

  return setCached(accessCache, cacheKey, ACCESS_CACHE_TTL_MS, result);
}

function parseCheckHostResult(payload: unknown, domain: string): AccessProbeResult | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const values = Object.values(payload as Record<string, unknown>);
  const nodeResult = values.find((item) => item !== null);
  if (!Array.isArray(nodeResult) || !Array.isArray(nodeResult[0])) return null;

  const entry = nodeResult[0] as Array<string | number | null>;
  const codeValue = entry[3];
  const address = typeof entry[4] === 'string' ? entry[4] : null;
  const message = typeof entry[2] === 'string' ? entry[2] : null;
  const httpStatus =
    typeof codeValue === 'string' && /^\d+$/.test(codeValue)
      ? Number(codeValue)
      : typeof codeValue === 'number'
        ? codeValue
        : null;
  const error = httpStatus === null ? (message || 'external_check_failed') : null;

  return {
    status: normalizeProbeStatus(httpStatus, error),
    reachable: httpStatus !== null ? httpStatus >= 200 && httpStatus <= 599 : false,
    http_status: httpStatus,
    final_url: `https://${domain}`,
    redirect_target: null,
    error,
    headers: {},
    address,
    source: 'external',
  };
}

async function probeExternally(targetUrl: string, domain: string): Promise<AccessProbeResult> {
  const cacheKey = `external:${targetUrl}`;
  const cached = getCached(accessCache, cacheKey);
  if (cached) return cached;

  try {
    const request = await fetchWithTimeout(
      `https://check-host.net/check-http?host=${encodeURIComponent(targetUrl)}&max_nodes=1&node=${encodeURIComponent(CHECK_HOST_NODE)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': BROWSER_UA,
        },
      },
      EXTERNAL_TIMEOUT_MS
    );

    const requestPayload = (await request.json()) as { request_id?: string };
    if (!request.ok || !requestPayload.request_id) {
      throw new Error('check-host request failed');
    }

    const deadline = Date.now() + EXTERNAL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const resultResponse = await fetchWithTimeout(
        `https://check-host.net/check-result/${requestPayload.request_id}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': BROWSER_UA,
          },
        },
        Math.min(5_000, Math.max(2_000, deadline - Date.now()))
      );

      const resultPayload = (await resultResponse.json()) as unknown;
      const normalized = parseCheckHostResult(resultPayload, domain);
      if (normalized) {
        return setCached(accessCache, cacheKey, ACCESS_CACHE_TTL_MS, normalized);
      }
    }

    throw new Error('external_timeout');
  } catch (caught) {
    const error = describeFetchError(caught);
    const result: AccessProbeResult = {
      status: normalizeProbeStatus(null, error),
      reachable: false,
      http_status: null,
      final_url: targetUrl,
      redirect_target: null,
      error,
      headers: {},
      address: null,
      source: 'external',
    };
    return setCached(accessCache, cacheKey, ACCESS_CACHE_TTL_MS, result);
  }
}

function parseRegistryPayload(payload: unknown): RegistryResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Record<string, unknown>;
  const blockedCandidate =
    source.blocked ??
    (source.data && typeof source.data === 'object' ? (source.data as Record<string, unknown>).blocked : null) ??
    (source.result && typeof source.result === 'object' ? (source.result as Record<string, unknown>).blocked : null);

  if (typeof blockedCandidate !== 'boolean') return null;

  const reason =
    (typeof source.reason === 'string' ? source.reason : null) ||
    (typeof source.comment === 'string' ? source.comment : null) ||
    (source.data && typeof source.data === 'object' && typeof (source.data as Record<string, unknown>).reason === 'string'
      ? ((source.data as Record<string, unknown>).reason as string)
      : null) ||
    (source.result && typeof source.result === 'object' && typeof (source.result as Record<string, unknown>).reason === 'string'
      ? ((source.result as Record<string, unknown>).reason as string)
      : null);

  const date =
    (typeof source.date === 'string' ? source.date : null) ||
    (typeof source.created_at === 'string' ? source.created_at : null) ||
    (source.data && typeof source.data === 'object' && typeof (source.data as Record<string, unknown>).date === 'string'
      ? ((source.data as Record<string, unknown>).date as string)
      : null) ||
    (source.result && typeof source.result === 'object' && typeof (source.result as Record<string, unknown>).date === 'string'
      ? ((source.result as Record<string, unknown>).date as string)
      : null);

  return {
    status: blockedCandidate ? 'blocked' : 'not_blocked',
    blocked: blockedCandidate,
    reason,
    date,
    source: null,
    error: null,
  };
}

async function fetchRegistry(domain: string): Promise<RegistryResult> {
  const cached = getCached(registryCache, domain);
  if (cached) return cached;

  const urls = [
    { url: `https://rknweb.ru/api/check/${encodeURIComponent(domain)}`, source: 'rknweb:path' },
    { url: `https://rknweb.ru/api/check/?url=${encodeURIComponent(`https://${domain}`)}`, source: 'rknweb:query' },
  ];

  for (const candidate of urls) {
    try {
      const response = await fetchWithTimeout(
        candidate.url,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
            'User-Agent': BROWSER_UA,
          },
        },
        REGISTRY_TIMEOUT_MS
      );

      if (!response.ok) continue;
      const payload = (await response.json()) as unknown;
      const normalized = parseRegistryPayload(payload);
      if (normalized) {
        normalized.source = candidate.source;
        return setCached(registryCache, domain, REGISTRY_CACHE_TTL_MS, normalized);
      }
    } catch {
      continue;
    }
  }

  return setCached(registryCache, domain, REGISTRY_CACHE_TTL_MS, {
    status: 'unknown',
    blocked: null,
    reason: null,
    date: null,
    source: null,
    error: 'registry_unavailable',
  });
}

async function detectHosting(domain: string, probe: AccessProbeResult): Promise<HostingResult> {
  const cacheKey = `${domain}:${probe.final_url}`;
  const cached = getCached(hostingCache, cacheKey);
  if (cached) return cached;

  const headers = probe.headers;
  const server = (headers.server || '').toLowerCase();

  if (headers['cf-ray'] || server.includes('cloudflare')) {
    return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
      provider: 'Cloudflare',
      reason: 'Сайт на Cloudflare — часть российских провайдеров режет доступ.',
    });
  }

  if (headers['x-vercel-cache'] || server.includes('vercel')) {
    return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
      provider: 'Vercel',
      reason: 'Сайт на Vercel — в РФ доступ часто нестабилен без VPN.',
    });
  }

  try {
    const cname = await resolveCname(domain);
    const all = cname.join(' ').toLowerCase();
    if (all.includes('vercel-dns.com')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'Vercel',
        reason: 'DNS указывает на Vercel.',
      });
    }
    if (all.includes('cloudfront.net') || all.includes('amazonaws.com')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'AWS',
        reason: 'DNS указывает на инфраструктуру AWS.',
      });
    }
    if (all.includes('googlehosted.com') || all.includes('googleusercontent.com')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'GCP',
        reason: 'DNS указывает на инфраструктуру Google Cloud.',
      });
    }
    if (all.includes('azure') || all.includes('trafficmanager.net') || all.includes('azurefd.net')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'Azure',
        reason: 'DNS указывает на инфраструктуру Microsoft Azure.',
      });
    }
  } catch {}

  try {
    const ip = probe.address || (await lookup(domain)).address;
    const reverseHosts = await reverse(ip).catch(() => []);
    const reverseLine = reverseHosts.join(' ').toLowerCase();

    if (reverseLine.includes('timeweb')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'Timeweb',
        reason: 'Хостинг российский — проблема, вероятно, в настройках сервера или сети.',
      });
    }
    if (reverseLine.includes('beget')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'Beget',
        reason: 'Хостинг российский — проблема, вероятно, в настройках сервера или сети.',
      });
    }
    if (reverseLine.includes('selectel')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'Selectel',
        reason: 'Хостинг российский — проблема, вероятно, в настройках сервера или сети.',
      });
    }
    if (reverseLine.includes('amazonaws')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'AWS',
        reason: 'Сайт на зарубежном хостинге — возможны проблемы доступа из РФ.',
      });
    }
    if (reverseLine.includes('googleusercontent')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'GCP',
        reason: 'Сайт на зарубежном хостинге — возможны проблемы доступа из РФ.',
      });
    }
    if (reverseLine.includes('azure')) {
      return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
        provider: 'Azure',
        reason: 'Сайт на зарубежном хостинге — возможны проблемы доступа из РФ.',
      });
    }
  } catch {}

  return setCached(hostingCache, cacheKey, ACCESS_CACHE_TTL_MS, {
    provider: 'Не удалось определить',
    reason: null,
  });
}

function buildRecommendations(registry: RegistryResult, ruAccess: AccessProbeResult, hosting: HostingResult) {
  const items: RuAccessCheckResult['recommendations'] = [];

  const ruUnavailable = ['timeout', 'refused', 'error'].includes(ruAccess.status);

  if (registry.status === 'blocked' && ruUnavailable) {
    items.push({
      severity: 'critical',
      title: 'Сайт официально заблокирован',
      action: 'Проверьте основание блокировки и устраните причину на rkn.gov.ru или через юриста/хостинг.',
    });
  }

  if (registry.status === 'blocked' && !ruUnavailable) {
    items.push({
      severity: 'warn',
      title: 'Сайт уже в реестре блокировок',
      action: 'Проверьте основание блокировки. Доступ пока есть, но провайдеры могут ужесточить фильтрацию.',
    });
  }

  if (registry.status !== 'blocked' && ruUnavailable && ['Cloudflare', 'Vercel', 'AWS', 'GCP', 'Azure'].includes(hosting.provider)) {
    items.push({
      severity: 'warn',
      title: 'Проблема похожа на зарубежный хостинг или CDN',
      action: 'Перенесите сайт на российский хостинг или отключите проблемный CDN. Практичные варианты: Timeweb, Beget, Selectel.',
    });
  }

  if (registry.status !== 'blocked' && ruUnavailable && ['Timeweb', 'Beget', 'Selectel'].includes(hosting.provider)) {
    items.push({
      severity: 'warn',
      title: 'Хостинг российский, но сайт не открывается',
      action: 'Проверьте firewall, правила CDN, SSL и доступность сервера снаружи.',
    });
  }

  return items;
}

function buildVerdict(registry: RegistryResult, ruAccess: AccessProbeResult, hosting: HostingResult) {
  const ruUnavailable = ['timeout', 'refused', 'error'].includes(ruAccess.status);

  if (registry.status === 'not_blocked' && !ruUnavailable) {
    return {
      key: 'ok' as const,
      status: 'ok' as const,
      title: 'Всё в порядке',
      summary: 'Сайт не заблокирован и открывается из России.',
    };
  }

  if (registry.status === 'blocked' && ruUnavailable) {
    return {
      key: 'blocked_officially' as const,
      status: 'fail' as const,
      title: 'Официально заблокирован',
      summary: `Сайт внесён в реестр Роскомнадзора и недоступен из России.${registry.date ? ` Дата блокировки: ${registry.date}.` : ''}`,
    };
  }

  if (registry.status === 'blocked' && !ruUnavailable) {
    return {
      key: 'listed_but_accessible' as const,
      status: 'warn' as const,
      title: 'В реестре, но пока доступен',
      summary: 'Сайт внесён в реестр блокировок, но сейчас открывается из России. Это временная ситуация — провайдеры могут усилить блокировку.',
    };
  }

  if (registry.status === 'not_blocked' && ruUnavailable) {
    return {
      key: 'not_blocked_but_unavailable' as const,
      status: 'warn' as const,
      title: 'Не заблокирован, но недоступен',
      summary: hosting.reason
        ? `Сайт не числится в реестре блокировок, но не открывается из России. Причина: ${hosting.reason}`
        : 'Сайт не числится в реестре блокировок, но не открывается из России. Проверьте хостинг и CDN.',
    };
  }

  return {
    key: 'unknown' as const,
    status: 'warn' as const,
    title: 'Часть данных не получена',
    summary: 'Не удалось надёжно проверить реестр или доступность. Повторите проверку позже.',
  };
}

export async function runRuAccessCheck(
  input: string,
  options: { includeExternal?: boolean } = {}
): Promise<RuAccessCheckResult> {
  const normalized = normalizeInput(input);
  const registry = await fetchRegistry(normalized.domain);
  const ruAccess = await probeFromRussia(normalized.url);
  const externalAccess = options.includeExternal === false
    ? {
        status: 'unknown' as const,
        reachable: null,
        http_status: null,
        final_url: normalized.url,
        redirect_target: null,
        error: 'skipped',
        headers: {},
        address: null,
        source: 'external' as const,
      }
    : await probeExternally(normalized.url, normalized.domain);
  const hosting = await detectHosting(normalized.domain, ruAccess);
  const verdict = buildVerdict(registry, ruAccess, hosting);

  return {
    ok: true,
    checked_at: new Date().toISOString(),
    input,
    normalized_url: normalized.url,
    domain: normalized.domain,
    verdict,
    registry,
    ru_access: ruAccess,
    external_access: externalAccess,
    hosting,
    recommendations: buildRecommendations(registry, ruAccess, hosting),
  };
}
