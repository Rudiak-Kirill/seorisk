import { decodeFetchedText, looksLikeSitemapResource } from '@/lib/sitemap-xml';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const CRT_TIMEOUT_MS = 15_000;
const CHECK_TIMEOUT_MS = 5_000;
const ROOT_SITEMAP_TIMEOUT_MS = 8_000;
const DEFAULT_CHECK_LIMIT = 100;
const ROOT_SITEMAP_SCAN_LIMIT = 20;

const COMMON_BRUTE_PREFIXES = [
  'www',
  'mail',
  'api',
  'ru',
  'rus',
  'en',
  'eng',
  'dev',
  'test',
  'stage',
  'beta',
  'admin',
  'panel',
  'lk',
  'cabinet',
  'app',
  'static',
  'img',
  'images',
  'cdn',
  'media',
  'shop',
  'store',
  'blog',
  'news',
  'help',
  'support',
  'docs',
  'wiki',
  'old',
  'new',
  'm',
  'mobile',
  'wap',
  'kz',
  'by',
] as const;

const REGIONAL_PREFIX_TO_CITY: Record<string, string> = {
  msk: 'Москва',
  moscow: 'Москва',
  spb: 'Санкт-Петербург',
  nsk: 'Новосибирск',
  ekb: 'Екатеринбург',
  krd: 'Краснодар',
  nnov: 'Нижний Новгород',
  kzn: 'Казань',
  samara: 'Самара',
  rostov: 'Ростов-на-Дону',
  ufa: 'Уфа',
};

const TECHNICAL_PREFIXES = new Set([
  'mail',
  'smtp',
  'ftp',
  'ns1',
  'ns2',
  'api',
  'cdn',
  'static',
  'img',
  'images',
  'media',
]);

const ENVIRONMENT_PREFIXES = new Set(['dev', 'test', 'stage', 'beta', 'demo', 'old', 'new']);
const APPLICATION_PREFIXES = new Set(['app', 'lk', 'cabinet', 'panel', 'admin']);
const CONTENT_PREFIXES = new Set(['blog', 'news', 'help', 'support', 'docs', 'wiki', 'shop', 'store']);
const LOCALE_PREFIX_TO_LABEL: Record<string, string> = {
  ru: 'Русская версия',
  rus: 'Русская версия',
  en: 'English version',
  eng: 'English version',
  kz: 'Казахстан',
  by: 'Беларусь',
};

const CITY_NAME_PATTERNS: Array<{ city: string; pattern: RegExp }> = [
  { city: 'Москва', pattern: /\b(москва|moscow)\b/i },
  { city: 'Санкт-Петербург', pattern: /\b(санкт-петербург|петербург|spb)\b/i },
  { city: 'Новосибирск', pattern: /\b(новосибирск|nsk)\b/i },
  { city: 'Екатеринбург', pattern: /\b(екатеринбург|ekb)\b/i },
  { city: 'Краснодар', pattern: /\b(краснодар|krd)\b/i },
  { city: 'Нижний Новгород', pattern: /\b(нижний новгород|nnov)\b/i },
  { city: 'Казань', pattern: /\b(казань|kzn)\b/i },
  { city: 'Самара', pattern: /\b(самара|samara)\b/i },
  { city: 'Ростов-на-Дону', pattern: /\b(ростов|rostov)\b/i },
  { city: 'Уфа', pattern: /\b(уфа|ufa)\b/i },
];

export type SubdomainCategory =
  | 'regional'
  | 'technical'
  | 'environment'
  | 'application'
  | 'content'
  | 'unknown';

export type SubdomainState = 'working' | 'redirect' | 'closed' | 'missing' | 'timeout' | 'error';
export type SubdomainRiskLevel = 'critical' | 'warn' | 'ok' | 'none';

export type SubdomainRiskCard = {
  severity: 'critical' | 'warn';
  host: string;
  title: string;
  description: string;
  action: string;
  kind?:
    | 'environment-open'
    | 'duplicate-main'
    | 'old-open'
    | 'regional-no-hreflang'
    | 'api-no-robots'
    | 'application-open'
    | 'technical-open'
    | 'redirect-external'
    | 'cert-ghost'
    | 'cert-ghost-group';
};

export type RegionalSubdomainItem = {
  host: string;
  city: string;
  state: SubdomainState;
  status: number | null;
  hreflang: boolean | null;
  duplicate_main: boolean;
  canonical: string | null;
  in_main_sitemap: boolean | null;
  note: string;
  risk_level: SubdomainRiskLevel;
};

export type SubdomainRow = {
  host: string;
  source: 'crt.sh' | 'bruteforce' | 'mixed';
  status: number | null;
  state: SubdomainState;
  redirect_target: string | null;
  category: SubdomainCategory;
  title: string | null;
  robots_found: boolean;
  robots_blocked: boolean;
  same_title_as_main: boolean;
  hreflang: boolean | null;
  canonical: string | null;
  noindex: boolean;
  regional_city: string | null;
  risk_level: SubdomainRiskLevel;
  risk_label: string | null;
};

export type SubdomainCheckResult = {
  ok: true;
  checked_at: string;
  input_domain: string;
  domain: string;
  summary: {
    found: number;
    checked: number;
    working: number;
    redirects: number;
    unavailable: number;
    crt_found: number;
    brute_found: number;
    message: string | null;
  };
  risks: SubdomainRiskCard[];
  regional: {
    found: number;
    verdict: string | null;
    items: RegionalSubdomainItem[];
  };
  subdomains: SubdomainRow[];
};

export type SubdomainSummary = {
  found: number;
  checked: number;
  risks: number;
  message: string | null;
};

type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  headers: Headers;
};

type ProbeResult = {
  status: number | null;
  state: SubdomainState;
  protocol: 'https' | 'http' | null;
  redirectTarget: string | null;
  headers: Headers;
};

type SourceSet = Set<'crt.sh' | 'bruteforce'>;

type InspectContext = {
  domain: string;
  mainTitle: string | null;
};

type InspectItem = {
  host: string;
  source: SourceSet;
  status: number | null;
  state: SubdomainState;
  redirectTarget: string | null;
  category: SubdomainCategory;
  title: string | null;
  robotsFound: boolean;
  robotsBlocked: boolean;
  sameTitleAsMain: boolean;
  hreflang: boolean | null;
  canonical: string | null;
  noindex: boolean;
  regionalCity: string | null;
  riskLevel: SubdomainRiskLevel;
  riskLabel: string | null;
};

type RunOptions = {
  checkLimit?: number;
  includeRegionalSitemap?: boolean;
};

function normalizeTitle(value: string | null) {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeDomainInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Пустой домен');
  }

  const prepared = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(prepared);
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');

  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
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

async function fetchText(url: string, timeoutMs: number, headers?: HeadersInit): Promise<FetchTextResult> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
          ...headers,
        },
      },
      timeoutMs
    );

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
      finalUrl: response.url || url,
      headers: response.headers,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      text: '',
      finalUrl: url,
      headers: new Headers(),
    };
  }
}


async function fetchSitemapText(url: string, timeoutMs: number): Promise<FetchTextResult> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/xml,text/xml,application/gzip,application/x-gzip,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        },
      },
      timeoutMs
    );

    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      ok: response.ok,
      status: response.status,
      text: decodeFetchedText(buffer, response.url || url, response.headers),
      finalUrl: response.url || url,
      headers: response.headers,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      text: '',
      finalUrl: url,
      headers: new Headers(),
    };
  }
}

async function probeHost(host: string): Promise<ProbeResult> {
  for (const protocol of ['https', 'http'] as const) {
    const url = `${protocol}://${host}`;

    try {
      let response = await fetchWithTimeout(
        url,
        {
          method: 'HEAD',
          redirect: 'manual',
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: '*/*',
          },
        },
        CHECK_TIMEOUT_MS
      );

      if (response.status === 405) {
        response = await fetchWithTimeout(
          url,
          {
            method: 'GET',
            redirect: 'manual',
            headers: {
              'User-Agent': BROWSER_UA,
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          },
          CHECK_TIMEOUT_MS
        );
      }

      const location = response.headers.get('location');
      const redirectTarget = location ? new URL(location, url).toString() : null;

      if (response.status >= 300 && response.status < 400) {
        return {
          status: response.status,
          state: 'redirect',
          protocol,
          redirectTarget,
          headers: response.headers,
        };
      }

      if (response.status === 200) {
        return {
          status: response.status,
          state: 'working',
          protocol,
          redirectTarget: null,
          headers: response.headers,
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          status: response.status,
          state: 'closed',
          protocol,
          redirectTarget: null,
          headers: response.headers,
        };
      }

      if (response.status === 404) {
        return {
          status: response.status,
          state: 'missing',
          protocol,
          redirectTarget: null,
          headers: response.headers,
        };
      }

      return {
        status: response.status,
        state: 'error',
        protocol,
        redirectTarget: null,
        headers: response.headers,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          status: null,
          state: 'timeout',
          protocol,
          redirectTarget: null,
          headers: new Headers(),
        };
      }

      continue;
    }
  }

  return {
    status: null,
    state: 'timeout',
    protocol: null,
    redirectTarget: null,
    headers: new Headers(),
  };
}

function extractTitle(html: string) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, ' ').trim() || null;
}

function extractCanonical(html: string) {
  const match = html.match(/<link[^>]+rel=["'][^"']*canonical[^"']*["'][^>]+href=["']([^"']+)["']/i);
  return match?.[1] || null;
}

function hasHreflang(html: string) {
  return /<link[^>]+hreflang=["'][^"']+["']/i.test(html);
}

function hasNoindex(html: string, headers: Headers) {
  const metaNoindex = /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html);
  const xRobots = (headers.get('x-robots-tag') || '').toLowerCase();
  return metaNoindex || xRobots.includes('noindex');
}

function parseRobotsBlocked(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean);

  let currentAgents: string[] = [];
  let blocked = false;

  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator === -1) continue;

    const directive = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (directive === 'user-agent') {
      currentAgents.push(value.toLowerCase());
      continue;
    }

    if (directive === 'disallow' && value === '/' && currentAgents.some((agent) => agent === '*')) {
      blocked = true;
      break;
    }

    if (directive !== 'allow' && directive !== 'disallow') {
      currentAgents = [];
    }
  }

  return blocked;
}

function parseRobotsSitemaps(text: string, origin: string) {
  const matches = Array.from(text.matchAll(/^\s*sitemap:\s*(\S+)/gim))
    .map((match) => match[1]?.trim())
    .filter(Boolean) as string[];

  return matches.length ? matches : [`${origin}/sitemap.xml`, `${origin}/sitemap.xml.gz`];
}

function detectCategory(host: string, domain: string, title: string | null) {
  const subPart = host.slice(0, -(domain.length + 1));
  const labels = subPart.split('.').filter(Boolean);
  const normalizedLabels = labels.map((label) => label.toLowerCase());
  const first = normalizedLabels[0] || '';
  const hasEnvironmentLabel = normalizedLabels.some((label) =>
    /(^|[-.])(dev|test|stage|staging|beta|demo|sandbox|preprod|apptest|qa)(\d+)?($|[-.])/i.test(label)
  );
  const hasApplicationLabel = normalizedLabels.some((label) =>
    /(^|[-.])(app|lk|cabinet|panel|admin|auth)(\d+)?($|[-.])/i.test(label)
  );
  const hasTechnicalLabel = normalizedLabels.some((label) =>
    /(^|[-.])(mail|smtp|ftp|ns1|ns2|api|cdn|static|img|images|media|files)(\d+)?($|[-.])/i.test(label)
  );
  const hasContentLabel = normalizedLabels.some((label) =>
    /(^|[-.])(blog|news|help|support|docs|wiki|shop|store|offer)(\d+)?($|[-.])/i.test(label)
  );

  if (REGIONAL_PREFIX_TO_CITY[first]) {
    return { category: 'regional' as const, city: REGIONAL_PREFIX_TO_CITY[first] };
  }

  if (LOCALE_PREFIX_TO_LABEL[first]) {
    return { category: 'regional' as const, city: LOCALE_PREFIX_TO_LABEL[first] };
  }

  if (CITY_NAME_PATTERNS.some(({ pattern }) => pattern.test(title || ''))) {
    const city = CITY_NAME_PATTERNS.find(({ pattern }) => pattern.test(title || ''))?.city || null;
    return { category: city ? ('regional' as const) : ('unknown' as const), city };
  }

  if (hasEnvironmentLabel || ENVIRONMENT_PREFIXES.has(first)) return { category: 'environment' as const, city: null };
  if (hasApplicationLabel || APPLICATION_PREFIXES.has(first)) return { category: 'application' as const, city: null };
  if (hasTechnicalLabel || TECHNICAL_PREFIXES.has(first)) return { category: 'technical' as const, city: null };
  if (hasContentLabel || CONTENT_PREFIXES.has(first)) return { category: 'content' as const, city: null };

  return { category: 'unknown' as const, city: null };
}

function shouldFetchHtml(category: SubdomainCategory) {
  return category !== 'technical';
}

function mapRiskLevel(cards: SubdomainRiskCard[]): SubdomainRiskLevel {
  if (cards.some((item) => item.severity === 'critical')) return 'critical';
  if (cards.some((item) => item.severity === 'warn')) return 'warn';
  return 'ok';
}

async function inspectSubdomain(host: string, context: InspectContext): Promise<InspectItem> {
  const initialCategory = detectCategory(host, context.domain, null);
  const probe = await probeHost(host);
  const sourceCategory = initialCategory.category;
  const sourceCity = initialCategory.city;
  let title: string | null = null;
  let hreflang: boolean | null = null;
  let canonical: string | null = null;
  let noindex = false;
  let category = sourceCategory;
  let regionalCity = sourceCity;

  if (probe.state === 'working' && probe.protocol && shouldFetchHtml(sourceCategory)) {
    const page = await fetchText(`${probe.protocol}://${host}`, CHECK_TIMEOUT_MS);
    if (page.text) {
      title = extractTitle(page.text);
      hreflang = hasHreflang(page.text);
      canonical = extractCanonical(page.text);
      noindex = hasNoindex(page.text, page.headers);

      const classified = detectCategory(host, context.domain, title);
      category = classified.category;
      regionalCity = classified.city;
    }
  }

  const robots = probe.protocol
    ? await fetchText(`${probe.protocol}://${host}/robots.txt`, CHECK_TIMEOUT_MS, { Accept: 'text/plain,*/*;q=0.8' })
    : { ok: false, status: 0, text: '', finalUrl: '', headers: new Headers() };

  const robotsFound = robots.ok && !!robots.text;
  const robotsBlocked = robotsFound ? parseRobotsBlocked(robots.text) : false;
  const sameTitleAsMain =
    probe.state === 'working' &&
    !!title &&
    !!context.mainTitle &&
    normalizeTitle(title) === normalizeTitle(context.mainTitle);

  return {
    host,
    source: new Set<'crt.sh' | 'bruteforce'>(),
    status: probe.status,
    state: probe.state,
    redirectTarget: probe.redirectTarget,
    category,
    title,
    robotsFound,
    robotsBlocked,
    sameTitleAsMain,
    hreflang,
    canonical,
    noindex,
    regionalCity,
    riskLevel: 'none',
    riskLabel: null,
  };
}

function isIndexable(item: InspectItem) {
  return item.state === 'working' && !item.robotsBlocked && !item.noindex;
}

function createRiskCards(
  item: InspectItem,
  domain: string,
  includeCertGhostRisk = true
): SubdomainRiskCard[] {
  const firstLabel = item.host.slice(0, -(domain.length + 1)).split('.')[0]?.toLowerCase() || '';
  const cards: SubdomainRiskCard[] = [];
  const redirectsOutsideMainDomain =
    item.state === 'redirect' &&
    !!item.redirectTarget &&
    (() => {
      try {
        const hostname = new URL(item.redirectTarget).hostname.toLowerCase();
        return hostname !== domain && !hostname.endsWith(`.${domain}`);
      } catch {
        return false;
      }
    })();

  if (item.category === 'environment' && isIndexable(item)) {
    cards.push({
      kind: 'environment-open',
      severity: 'critical',
      host: item.host,
      title: `${item.host} открыт публично`,
      description: 'Тестовая среда доступна поисковикам и пользователям.',
      action: 'Закройте через robots.txt, noindex или Basic Auth.',
    });
  }

  if (item.sameTitleAsMain && item.state === 'working' && !item.noindex) {
    cards.push({
      kind: 'duplicate-main',
      severity: 'critical',
      host: item.host,
      title: `${item.host} дублирует главный сайт`,
      description: 'Title совпадает с главным доменом — это риск дубля контента.',
      action: 'Настройте canonical, редирект или закройте поддомен от индексации.',
    });
  }

  if (firstLabel === 'old' && isIndexable(item)) {
    cards.push({
      kind: 'old-open',
      severity: 'critical',
      host: item.host,
      title: `${item.host} выглядит как старая версия`,
      description: 'Старая версия сайта доступна ботам и может дублировать основной домен.',
      action: 'Закройте поддомен или настройте 301-редирект на актуальную версию.',
    });
  }

  if (item.category === 'regional' && item.state === 'working' && item.hreflang === false) {
    cards.push({
      kind: 'regional-no-hreflang',
      severity: 'warn',
      host: item.host,
      title: `${item.host} без hreflang`,
      description: 'Региональный поддомен найден, но hreflang не обнаружен.',
      action: 'Проверьте hreflang и региональные сигналы, чтобы не получить дубль в поиске.',
    });
  }

  if (firstLabel === 'api' && item.state === 'working' && !item.robotsFound) {
    cards.push({
      kind: 'api-no-robots',
      severity: 'warn',
      host: item.host,
      title: `${item.host} без robots.txt`,
      description: 'API-поддомен отвечает, но robots.txt не найден.',
      action: 'Добавьте robots.txt с Disallow: /, если API не нужен в поиске.',
    });
  }

  if (item.category === 'application' && isIndexable(item)) {
    cards.push({
      kind: 'application-open',
      severity: 'warn',
      host: item.host,
      title: `${item.host} открыт для индексации`,
      description: 'Поддомен личного кабинета, app или admin доступен как обычная публичная страница.',
      action: 'Проверьте noindex, robots.txt или авторизацию, если этот поддомен не должен попадать в поиск.',
    });
  }

  if (item.category === 'technical' && firstLabel !== 'api' && isIndexable(item)) {
    cards.push({
      kind: 'technical-open',
      severity: 'warn',
      host: item.host,
      title: `${item.host} открыт как обычный сайт`,
      description: 'Технический поддомен отдает публичную страницу и может попасть в индекс.',
      action: 'Если этот хост не нужен в поиске, закройте его через robots.txt или noindex.',
    });
  }

  if (redirectsOutsideMainDomain) {
    cards.push({
      kind: 'redirect-external',
      severity: 'warn',
      host: item.host,
      title: `${item.host} редиректит на другой домен`,
      description: `Поддомен ведет на ${item.redirectTarget}. Это стоит проверить в схеме редиректов.`,
      action: 'Убедитесь, что редирект ожидаемый и вы не теряете канонический трафик.',
    });
  }

  if (includeCertGhostRisk && ['missing', 'timeout', 'closed', 'error'].includes(item.state)) {
    cards.push({
      kind: 'cert-ghost',
      severity: 'warn',
      host: item.host,
      title: `${item.host} найден в сертификате, но не работает`,
      description: 'Поддомен попал в сертификаты, но сейчас не отвечает корректно.',
      action: 'Проверьте, нужен ли он, и удалите или восстановите конфигурацию.',
    });
  }

  return cards;
}

function aggregateRiskCards(cards: SubdomainRiskCard[]) {
  const certGhostCards = cards.filter((item) => item.kind === 'cert-ghost');
  const redirectExternalCards = cards.filter((item) => item.kind === 'redirect-external');
  const nextCards = [...cards];

  if (certGhostCards.length >= 4) {
    const examples = certGhostCards.slice(0, 5).map((item) => item.host);
    const extraCount = certGhostCards.length - examples.length;
    const summaryCard: SubdomainRiskCard = {
      kind: 'cert-ghost-group',
      severity: 'warn',
      host: `${certGhostCards.length} поддоменов`,
      title: `Найдено ${certGhostCards.length} поддоменов из сертификатов, которые не работают`,
      description:
        extraCount > 0
          ? `Примеры: ${examples.join(', ')} и еще ${extraCount}. Это похоже на брошенные окружения или старые сервисные хосты.`
          : `Примеры: ${examples.join(', ')}. Это похоже на брошенные окружения или старые сервисные хосты.`,
      action:
        'Проверьте, нужны ли эти хосты. Лишние удалите из DNS и сертификатов, рабочие — восстановите или закройте корректно.',
    };

    nextCards.splice(0, nextCards.length, ...nextCards.filter((item) => item.kind !== 'cert-ghost'), summaryCard);
  }

  if (redirectExternalCards.length >= 3) {
    const examples = redirectExternalCards.slice(0, 3).map((item) => item.host);
    const extraCount = redirectExternalCards.length - examples.length;
    const summaryCard: SubdomainRiskCard = {
      kind: 'redirect-external',
      severity: 'warn',
      host: `${redirectExternalCards.length} поддоменов`,
      title: `Найдено ${redirectExternalCards.length} поддоменов с редиректом на другой домен`,
      description:
        extraCount > 0
          ? `Примеры: ${examples.join(', ')} и еще ${extraCount}. Это похоже на старые окружения или внешнюю dev-инфраструктуру.`
          : `Примеры: ${examples.join(', ')}. Это похоже на старые окружения или внешнюю dev-инфраструктуру.`,
      action: 'Проверьте, нужны ли эти редиректы и не уходит ли SEO-сигнал на внешний домен.',
    };

    return [
      ...nextCards.filter((item) => item.kind !== 'redirect-external'),
      summaryCard,
    ];
  }

  return nextCards;
}

function formatSource(source: SourceSet): 'crt.sh' | 'bruteforce' | 'mixed' {
  if (source.size === 2) return 'mixed';
  return source.has('crt.sh') ? 'crt.sh' : 'bruteforce';
}

async function discoverFromCrt(domain: string) {
  const response = await fetchText(
    `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
    CRT_TIMEOUT_MS,
    { Accept: 'application/json,text/plain;q=0.8,*/*;q=0.6' }
  );

  if (!response.ok || !response.text.trim()) {
    return new Set<string>();
  }

  let parsed: Array<{ name_value?: string }> = [];
  try {
    parsed = JSON.parse(response.text);
  } catch {
    return new Set<string>();
  }

  const hosts = new Set<string>();
  for (const row of parsed) {
    const values = (row.name_value || '')
      .split(/\r?\n/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    for (const value of values) {
      if (value.includes('*')) continue;
      if (!value.endsWith(`.${domain}`)) continue;
      if (value === domain) continue;
      hosts.add(value);
    }
  }

  return hosts;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  iteratee: (item: T) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) break;
      results[current] = await iteratee(items[current]);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return results;
}

async function discoverBruteforce(domain: string) {
  const prefixes = new Set<string>([
    ...COMMON_BRUTE_PREFIXES,
    ...Object.keys(REGIONAL_PREFIX_TO_CITY),
  ]);
  const candidates = Array.from(prefixes, (prefix) => `${prefix}.${domain}`);
  const inspected = await mapWithConcurrency(candidates, 12, async (host) => {
    const probe = await probeHost(host);
    return {
      host,
      responded: probe.state === 'working' || probe.state === 'redirect' || probe.state === 'closed',
    };
  });

  return new Set(inspected.filter((item) => item.responded).map((item) => item.host));
}

async function fetchMainTitle(domain: string) {
  const httpsPage = await fetchText(`https://${domain}`, CHECK_TIMEOUT_MS);
  if (httpsPage.text) {
    return extractTitle(httpsPage.text);
  }

  const httpPage = await fetchText(`http://${domain}`, CHECK_TIMEOUT_MS);
  return extractTitle(httpPage.text);
}

async function scanRootSitemapForHosts(domain: string, hosts: string[]) {
  if (!hosts.length) return new Set<string>();

  const origin = `https://${domain}`;
  const robots = await fetchText(`${origin}/robots.txt`, ROOT_SITEMAP_TIMEOUT_MS, {
    Accept: 'text/plain,*/*;q=0.8',
  });

  const queue = robots.text ? parseRobotsSitemaps(robots.text, origin) : [`${origin}/sitemap.xml`, `${origin}/sitemap.xml.gz`];
  const seen = new Set<string>();
  const foundHosts = new Set<string>();
  const hostNeedles = hosts.map((host) => host.toLowerCase());

  while (queue.length && seen.size < ROOT_SITEMAP_SCAN_LIMIT && foundHosts.size < hosts.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    const response = await fetchSitemapText(current, ROOT_SITEMAP_TIMEOUT_MS);
    if (!response.text) continue;

    const xmlLower = response.text.toLowerCase();

    for (const host of hostNeedles) {
      if (xmlLower.includes(`://${host}`)) {
        foundHosts.add(host);
      }
    }

    for (const match of response.text.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)) {
      const loc = match[1]?.trim();
      if (!loc) continue;
      if (looksLikeSitemapResource(loc)) {
        queue.push(loc);
      }
    }
  }

  return new Set(hosts.filter((host) => foundHosts.has(host.toLowerCase())));
}

function buildRegionalVerdict(items: RegionalSubdomainItem[]) {
  if (!items.length) return null;
  const withIssues = items.filter((item) => item.risk_level === 'warn' || item.risk_level === 'critical');

  if (!withIssues.length) {
    return `Найдено ${items.length} региональных поддоменов. Критичных сигналов не найдено.`;
  }

  const firstIssue = withIssues[0];
  return `Найдено ${items.length} региональных поддоменов. У ${firstIssue.host} есть риск: ${firstIssue.note}.`;
}

function categoryPriority(category: SubdomainCategory) {
  if (category === 'environment') return 0;
  if (category === 'regional') return 1;
  if (category === 'application') return 2;
  if (category === 'content') return 3;
  if (category === 'technical') return 4;
  return 5;
}

function sourcePriority(source: SourceSet) {
  if (source.size === 2) return 0;
  return source.has('crt.sh') ? 1 : 2;
}

function riskPriority(level: SubdomainRiskLevel) {
  if (level === 'critical') return 0;
  if (level === 'warn') return 1;
  if (level === 'ok') return 2;
  return 3;
}

export async function runSubdomainCheck(
  rawDomain: string,
  options: RunOptions = {}
): Promise<SubdomainCheckResult> {
  const domain = normalizeDomainInput(rawDomain);
  const checkLimit = options.checkLimit ?? DEFAULT_CHECK_LIMIT;
  const includeRegionalSitemap = options.includeRegionalSitemap ?? true;

  const [mainTitle, crtHosts, bruteHosts] = await Promise.all([
    fetchMainTitle(domain),
    discoverFromCrt(domain),
    discoverBruteforce(domain),
  ]);

  const allSources = new Map<string, SourceSet>();
  for (const host of crtHosts) {
    allSources.set(host, new Set(['crt.sh']));
  }
  for (const host of bruteHosts) {
    const existing = allSources.get(host) || new Set<'crt.sh' | 'bruteforce'>();
    existing.add('bruteforce');
    allSources.set(host, existing);
  }

  const discoveredHosts = Array.from(allSources.entries())
    .sort((a, b) => {
      const categoryDiff =
        categoryPriority(detectCategory(a[0], domain, null).category) -
        categoryPriority(detectCategory(b[0], domain, null).category);
      if (categoryDiff !== 0) return categoryDiff;
      const sourceDiff = sourcePriority(a[1]) - sourcePriority(b[1]);
      if (sourceDiff !== 0) return sourceDiff;
      return a[0].localeCompare(b[0], 'ru');
    })
    .slice(0, checkLimit);

  const inspected = await mapWithConcurrency(discoveredHosts, 12, async ([host, source]) => {
    const item = await inspectSubdomain(host, { domain, mainTitle });
    item.source = source;
    return item;
  });

  const regionalHosts = inspected
    .filter((item) => item.category === 'regional' && item.regionalCity)
    .map((item) => item.host);
  const hostsInRootSitemap = includeRegionalSitemap
    ? await scanRootSitemapForHosts(domain, regionalHosts)
    : new Set<string>();

  const enriched = inspected.map((item) => {
    const cards = createRiskCards(item, domain, item.source.has('crt.sh'));
    const riskLevel = mapRiskLevel(cards);
    const riskLabel = cards[0]?.title || null;
    return {
      ...item,
      cards,
      riskLevel,
      riskLabel,
    };
  });

  const risks = aggregateRiskCards(enriched.flatMap((item) => item.cards))
    .sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
      return a.host.localeCompare(b.host, 'ru');
    });

  const regionalItems: RegionalSubdomainItem[] = enriched
    .filter((item) => item.category === 'regional' && item.regionalCity)
    .map((item) => {
      const canonicalHost = item.canonical ? (() => {
        try {
          return new URL(item.canonical).hostname.toLowerCase();
        } catch {
          return null;
        }
      })() : null;

      let note = 'Работает';
      if (item.hreflang === false) note = 'нет hreflang';
      if (item.sameTitleAsMain) note = 'похоже на дубль главной';
      if (canonicalHost && canonicalHost !== item.host) note = `canonical ведет на ${canonicalHost}`;
      if (item.state !== 'working') note = 'поддомен отвечает нестабильно';

      return {
        host: item.host,
        city: item.regionalCity || 'не определено',
        state: item.state,
        status: item.status,
        hreflang: item.hreflang,
        duplicate_main: item.sameTitleAsMain,
        canonical: item.canonical,
        in_main_sitemap: includeRegionalSitemap ? hostsInRootSitemap.has(item.host) : null,
        note,
        risk_level: item.riskLevel,
      };
    })
    .sort((a, b) => riskPriority(a.risk_level) - riskPriority(b.risk_level) || a.host.localeCompare(b.host, 'ru'));

  const rows: SubdomainRow[] = enriched
    .map((item) => ({
      host: item.host,
      source: formatSource(item.source),
      status: item.status,
      state: item.state,
      redirect_target: item.redirectTarget,
      category: item.category,
      title: item.title,
      robots_found: item.robotsFound,
      robots_blocked: item.robotsBlocked,
      same_title_as_main: item.sameTitleAsMain,
      hreflang: item.hreflang,
      canonical: item.canonical,
      noindex: item.noindex,
      regional_city: item.regionalCity,
      risk_level: item.riskLevel,
      risk_label: item.riskLabel,
    }))
    .sort((a, b) => riskPriority(a.risk_level) - riskPriority(b.risk_level) || a.host.localeCompare(b.host, 'ru'));

  const message =
    allSources.size > checkLimit
      ? `Найдено ${allSources.size} поддоменов, проверены первые ${checkLimit}.`
      : null;

  return {
    ok: true,
    checked_at: new Date().toISOString(),
    input_domain: rawDomain,
    domain,
    summary: {
      found: allSources.size,
      checked: rows.length,
      working: rows.filter((item) => item.state === 'working').length,
      redirects: rows.filter((item) => item.state === 'redirect').length,
      unavailable: rows.filter((item) => !['working', 'redirect'].includes(item.state)).length,
      crt_found: crtHosts.size,
      brute_found: bruteHosts.size,
      message,
    },
    risks,
    regional: {
      found: regionalItems.length,
      verdict: buildRegionalVerdict(regionalItems),
      items: regionalItems,
    },
    subdomains: rows,
  };
}

export async function getSubdomainSummary(rawDomain: string): Promise<SubdomainSummary> {
  const result = await runSubdomainCheck(rawDomain, {
    checkLimit: 40,
    includeRegionalSitemap: false,
  });

  return {
    found: result.summary.found,
    checked: result.summary.checked,
    risks: result.risks.length,
    message: result.summary.message,
  };
}
