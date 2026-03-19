import { createConnection } from 'node:net';
import { NextResponse } from 'next/server';
import { decodeFetchedText, looksLikeSitemapResource } from '@/lib/sitemap-xml';
import { getSubdomainSummary } from '@/lib/subdomain-check';

export const runtime = 'nodejs';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SECONDARY_BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0';

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const LLM_RELAY_URL = (process.env.LLM_RELAY_URL || '').replace(/\/+$/, '');
const LLM_RELAY_SECRET = process.env.LLM_RELAY_SECRET || '';
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_RETRY_TIMEOUT_MS = 25_000;
const SEARCH_TIMEOUT_MS = 12_000;
const MAX_SITEMAP_URLS = 200_000;
const MAX_SITEMAP_FILES = 200;
const SITE_PROFILE_SUMMARY_PROMPT = [
  'Ты SEO-аналитик. Напиши краткий аналитический вывод о сайте на основе данных. 2-3 предложения.',
  '',
  'Правила:',
  '- Первое предложение: тип + тематика + аудитория',
  '- Второе предложение: что хорошо (факты, не похвала)',
  '- Третье предложение: главные пробелы (конкретно)',
  '- Не используй слова: удобный, широкий, активно, качественный, отличный',
  '- Говори фактами: цифры, конкретные проблемы',
  '- Если есть пробелы — называй их прямо',
  '',
  "Пример правильного вердикта: 'B2B интернет-магазин строительных материалов, Россия. Коммерческих страниц 85% — хорошее покрытие каталога. Пробелы: нет чат-виджета, 124 страницы не классифицированы, данные индекса недоступны.'",
  "Пример неправильного вердикта: 'Сайт предлагает широкий выбор товаров для бизнеса. Имеет удобный интерфейс с корзиной и формой заявки. Активно обновляется и содержит актуальную информацию.'",
  '',
  'Отвечай только JSON.',
].join('\n');

type Phase = 'quick' | 'full';
type Status = 'ok' | 'warn' | 'fail';
type SitemapBucket =
  | 'commercial'
  | 'informational'
  | 'application'
  | 'search'
  | 'documents'
  | 'video'
  | 'faq'
  | 'service'
  | 'unknown';

type TextFetchResult = {
  ok: boolean;
  status: number;
  text: string;
  finalUrl: string;
  headers: Headers;
  error?: string | null;
};

type SitemapUrlEntry = {
  loc: string;
  lastmod: string | null;
};

type MenuLink = {
  label: string;
  url: string;
};

type PageDoc = {
  url: string;
  html: string;
  text: string;
};

type SiteClassification = {
  site_type: string;
  audience: string;
  topic: string;
  region: string;
};

type SearchSignals = {
  google_index: string;
  yandex_index: string;
  yandex_iks: string;
};

type CountGroup = {
  count: number | null;
  percent: number | null;
};

type SignalItem = {
  label: string;
  status: Status;
  value: string;
};

type DetectedSiteSignals = {
  phoneFound: boolean;
  pricesFound: boolean;
  cartFound: boolean;
  formFound: boolean;
  requisitesFound: boolean;
  addressFound: boolean;
  emailFound: boolean;
  reviewsFound: boolean;
  chatFound: boolean;
  messengerFound: boolean;
  docsFound: boolean;
  faqFound: boolean;
  demoFound: boolean;
};

type DetailSection = {
  section: string;
  count: number;
};

type RobotsGroup = {
  userAgents: string[];
  rules: { directive: 'allow' | 'disallow'; value: string }[];
};

type SiteProfileResponse = {
  ok: boolean;
  phase: Phase;
  checked_at: string;
  input_url: string;
  site_url: string;
  final_url: string;
  loading_text?: string | null;
  verdict_text: string | null;
  profile: {
    type: string;
    audience: string;
    topic: string;
    region: string;
    domain_age_years: number | null;
    domain_age_label: string;
  };
  structure: {
    sitemap_found: boolean;
    sitemap_url: string | null;
    total_urls: number | null;
    commercial: CountGroup;
    informational: CountGroup;
    application: CountGroup;
    search: CountGroup;
    documents: CountGroup;
    video: CountGroup;
    faq: CountGroup;
    service: CountGroup;
    unknown: CountGroup;
    depth: {
      level1: number | null;
      level2: number | null;
      level3plus: number | null;
    };
    lastmod_latest: string | null;
    updated_last30: number | null;
    yandex_index: string;
    google_index: string;
    yandex_iks: string;
    message: string | null;
  };
  commerce: {
    critical: { found: number; total: number; items: SignalItem[] };
    important: { found: number; total: number; items: SignalItem[] };
    additional: { found: number; total: number; items: SignalItem[] };
  };
  technical: {
    cms: string;
    llms_txt: {
      status: Status;
      value: string;
      description: string;
    };
    analytics: {
      yandex: boolean;
      google: boolean;
      vk: boolean;
      facebook: boolean;
    };
  };
  subdomains: {
    found: number | null;
    checked: number | null;
    risks: number | null;
    message: string | null;
  };
  details: {
    menu_pages: MenuLink[];
    sitemap_sections: DetailSection[];
    analytics_scripts: string[];
    whois: {
      created_at: string | null;
      age_years: number | null;
      registrar: string;
      raw_source: string;
    };
    registrar: string;
    robots_url: string;
    robots_found: boolean;
    llms_txt_url: string;
    llms_txt_status: number;
    llms_txt_conflict_rule: string | null;
    llms_txt_conflict_agent: string | null;
    sitemap_urls: string[];
  };
  error?: string;
  reason?: string | null;
};

const commercialPatterns = [
  '/catalog/',
  '/product/',
  '/products/',
  '/shop/',
  '/tovar/',
  '/tovary/',
  '/price/',
  '/prices/',
  '/services/',
  '/uslugi/',
  '/order/',
  '/buy/',
  '/korzina/',
  '/cart/',
  '/checkout/',
];

const informationalPatterns = [
  '/blog/',
  '/articles/',
  '/stati/',
  '/news/',
  '/novosti/',
  '/help/',
  '/pomoshch/',
];

const applicationPatterns = ['/app/', '/lk/', '/cabinet/', '/dashboard/', '/platform/'];

const searchPatterns = ['/search/', '/poisk/', '/find/', '/results/'];

const documentPatterns = ['/docs/', '/documentation/', '/doc-cat/', '/documents/', '/dokument'];

const videoPatterns = ['/video/', '/videos/', '/webinar', '/webinars/', '/vebinar'];

const faqPatterns = ['/faq/', '/voprosy-otvety/', '/questions/', '/question/', '/answer/', '/dwqa-'];

const servicePatterns = [
  '/about/',
  '/o-nas/',
  '/contacts/',
  '/kontakty/',
  '/policy/',
  '/privacy/',
  '/oferta/',
  '/dostavka/',
];

const sitemapBucketLabels: Record<SitemapBucket, string> = {
  commercial: 'коммерческих',
  informational: 'информационных',
  application: 'приложение',
  search: 'поиск',
  documents: 'документы',
  video: 'видео/вебинары',
  faq: 'faq',
  service: 'служебных',
  unknown: 'не определено',
};

const cityRegex =
  /\b(Москва|Санкт-Петербург|Новосибирск|Екатеринбург|Казань|Нижний Новгород|Челябинск|Самара|Омск|Ростов-на-Дону|Уфа|Краснодар|Пермь|Воронеж)\b/i;

const llmAgentTokens = [
  'gptbot',
  'chatgpt-user',
  'oai-searchbot',
  'claudebot',
  'anthropic-ai',
  'perplexitybot',
  'youbot',
  'applebot-extended',
  'amazonbot',
  'bytespider',
  'diffbot',
  'ccbot',
  'cohere-ai',
] as const;

function createEmptyFullResponse(inputUrl: string, siteUrl: string, finalUrl: string): SiteProfileResponse {
  return {
    ok: true,
    phase: 'full',
    checked_at: new Date().toISOString(),
    input_url: inputUrl,
    site_url: siteUrl,
    final_url: finalUrl,
    verdict_text: null,
    profile: {
      type: 'не удалось определить',
      audience: 'не удалось определить',
      topic: 'не удалось определить',
      region: 'не удалось определить',
      domain_age_years: null,
      domain_age_label: 'не удалось определить',
    },
    structure: {
      sitemap_found: false,
      sitemap_url: null,
      total_urls: null,
      commercial: { count: null, percent: null },
      informational: { count: null, percent: null },
      application: { count: null, percent: null },
      search: { count: null, percent: null },
      documents: { count: null, percent: null },
      video: { count: null, percent: null },
      faq: { count: null, percent: null },
      service: { count: null, percent: null },
      unknown: { count: null, percent: null },
      depth: { level1: null, level2: null, level3plus: null },
      lastmod_latest: null,
      updated_last30: null,
      yandex_index: 'не удалось определить',
      google_index: 'не удалось определить',
      yandex_iks: 'не удалось получить',
      message: null,
    },
    commerce: {
      critical: { found: 0, total: 4, items: [] },
      important: { found: 0, total: 4, items: [] },
      additional: { found: 0, total: 2, items: [] },
    },
    technical: {
      cms: 'не удалось определить',
      llms_txt: {
        status: 'warn',
        value: 'Нет',
        description: 'Файл /llms.txt не найден.',
      },
      analytics: {
        yandex: false,
        google: false,
        vk: false,
        facebook: false,
      },
    },
    subdomains: {
      found: null,
      checked: null,
      risks: null,
      message: null,
    },
    details: {
      menu_pages: [],
      sitemap_sections: [],
      analytics_scripts: [],
      whois: {
        created_at: null,
        age_years: null,
        registrar: 'не удалось определить',
        raw_source: 'не удалось определить',
      },
      registrar: 'не удалось определить',
      robots_url: siteUrl ? `${siteUrl}/robots.txt` : '',
      robots_found: false,
      llms_txt_url: siteUrl ? `${siteUrl}/llms.txt` : '',
      llms_txt_status: 0,
      llms_txt_conflict_rule: null,
      llms_txt_conflict_agent: null,
      sitemap_urls: [],
    },
  };
}

function normalizeInputUrl(value: string) {
  const prepared = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(prepared);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS
) {
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

function describeFetchError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'timeout';
  }

  if (error instanceof Error) {
    return error.message || error.name || 'fetch_error';
  }

  return String(error || 'fetch_error');
}

async function fetchTextOnce(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
  userAgent = BROWSER_UA
): Promise<TextFetchResult> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
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
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: '',
      finalUrl: url,
      headers: new Headers(),
      error: describeFetchError(error),
    };
  }
}

async function fetchSitemapTextOnce(
  url: string,
  timeoutMs = FETCH_TIMEOUT_MS,
  userAgent = BROWSER_UA
): Promise<TextFetchResult> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': userAgent,
          Accept: 'application/xml,text/xml,application/gzip,application/x-gzip,text/plain;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
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
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: '',
      finalUrl: url,
      headers: new Headers(),
      error: describeFetchError(error),
    };
  }
}

function getFetchCandidates(url: string) {
  if (!/^https:\/\//i.test(url)) return [url];
  return [url, url.replace(/^https:\/\//i, 'http://')];
}

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<TextFetchResult> {
  const candidates = getFetchCandidates(url);
  const attemptPlan = [
    { timeoutMs, userAgent: BROWSER_UA },
    { timeoutMs: FETCH_RETRY_TIMEOUT_MS, userAgent: SECONDARY_BROWSER_UA },
  ];

  let lastResult: TextFetchResult | null = null;

  for (const candidate of candidates) {
    for (let index = 0; index < attemptPlan.length; index += 1) {
      const attempt = attemptPlan[index];
      const result = await fetchTextOnce(candidate, attempt.timeoutMs, attempt.userAgent);
      if (result.text || result.ok || result.status >= 400) {
        return result;
      }

      lastResult = result;

      if (index < attemptPlan.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  return (
    lastResult || {
      ok: false,
      status: 0,
      text: '',
      finalUrl: url,
      headers: new Headers(),
      error: 'fetch_error',
    }
  );
}

async function fetchSitemapText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<TextFetchResult> {
  const candidates = getFetchCandidates(url);
  const attemptPlan = [
    { timeoutMs, userAgent: BROWSER_UA },
    { timeoutMs: FETCH_RETRY_TIMEOUT_MS, userAgent: SECONDARY_BROWSER_UA },
  ];

  let lastResult: TextFetchResult | null = null;

  for (const candidate of candidates) {
    for (let index = 0; index < attemptPlan.length; index += 1) {
      const attempt = attemptPlan[index];
      const result = await fetchSitemapTextOnce(candidate, attempt.timeoutMs, attempt.userAgent);
      if (result.text || result.ok || result.status >= 400) {
        return result;
      }

      lastResult = result;

      if (index < attemptPlan.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  return (
    lastResult || {
      ok: false,
      status: 0,
      text: '',
      finalUrl: url,
      headers: new Headers(),
      error: 'fetch_error',
    }
  );
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripHtml(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function extractTagText(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeHtmlEntities(stripHtml(match?.[1] || ''));
}

function extractMetaContent(html: string, attr: 'name' | 'property', value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(
    `<meta\\b[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const reverse = new RegExp(
    `<meta\\b[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["'][^>]*>`,
    'i'
  );

  return decodeHtmlEntities(html.match(direct)?.[1] || html.match(reverse)?.[1] || '');
}

function detectCms(html: string, headers: Headers) {
  const server = (headers.get('server') || '').toLowerCase();
  const poweredBy = (headers.get('x-powered-by') || '').toLowerCase();
  const poweredCms = (headers.get('x-powered-cms') || '').toLowerCase();
  const setCookie = (headers.get('set-cookie') || '').toLowerCase();
  const htmlLower = html.toLowerCase();

  const hasBitrix =
    /bitrix/i.test(server) ||
    /bitrix/i.test(poweredBy) ||
    /bitrix/i.test(poweredCms) ||
    htmlLower.includes('/bitrix/') ||
    htmlLower.includes('/local/templates/') ||
    htmlLower.includes('/upload/iblock/') ||
    htmlLower.includes('/upload/resize_cache/') ||
    htmlLower.includes('bx.setcsslist') ||
    htmlLower.includes('bx-core') ||
    htmlLower.includes('bitrix_sessid') ||
    setCookie.includes('bitrix_sm_') ||
    headers.has('x-powered-cms');

  const hasWordPress =
    htmlLower.includes('wp-content') ||
    htmlLower.includes('wp-includes') ||
    htmlLower.includes('content="wordpress') ||
    headers.has('x-pingback');

  const hasOpenCart =
    htmlLower.includes('catalog/view/theme/') ||
    htmlLower.includes('catalog/view/javascript/') ||
    htmlLower.includes('index.php?route=') ||
    htmlLower.includes('route=product/') ||
    htmlLower.includes('ocstore') ||
    htmlLower.includes('opencart');

  const hasDrupal =
    htmlLower.includes('drupal-settings-json') ||
    htmlLower.includes('/sites/default/files/') ||
    htmlLower.includes('/misc/drupal.js');

  const hasJoomla =
    htmlLower.includes('/media/system/js/') ||
    htmlLower.includes('option=com_') ||
    htmlLower.includes('joomla!');

  const hasModx =
    htmlLower.includes('content="modx') ||
    htmlLower.includes('/assets/components/') ||
    htmlLower.includes('/assets/templates/');

  const hasWebasyst =
    htmlLower.includes('webasyst') ||
    htmlLower.includes('wa-content') ||
    htmlLower.includes('shop-script');

  const hasGooru =
    htmlLower.includes('/gooru/') ||
    htmlLower.includes('gooru/css/') ||
    htmlLower.includes('gooru/js/');

  const hasLaravel = poweredBy.includes('laravel') || setCookie.includes('laravel_session');

  const hasNext =
    /next\.js/i.test(poweredBy) ||
    htmlLower.includes('/_next/static/') ||
    htmlLower.includes('__next_data__') ||
    htmlLower.includes('__next_f') ||
    htmlLower.includes('next-route-announcer');

  const hasReact =
    hasNext ||
    htmlLower.includes('react-dom') ||
    htmlLower.includes('data-reactroot') ||
    htmlLower.includes('__react_devtools_global_hook__') ||
    htmlLower.includes('/static/js/main.') ||
    htmlLower.includes('/assets/index-');

  const hasTilda =
    htmlLower.includes('tilda') ||
    htmlLower.includes('tildacdn') ||
    htmlLower.includes('t-records');

  const hasShopify =
    /shopify/i.test(server) ||
    headers.has('x-shopify-stage') ||
    htmlLower.includes('cdn.shopify.com');

  const hasSpaShell =
    (htmlLower.includes('id="root"') || htmlLower.includes("id='root'") || htmlLower.includes('id="app"')) &&
    htmlLower.includes('<script');

  const primaryCms =
    (hasBitrix && 'Битрикс') ||
    (hasWordPress && 'WordPress') ||
    (hasOpenCart && 'OpenCart') ||
    (hasDrupal && 'Drupal') ||
    (hasJoomla && 'Joomla') ||
    (hasModx && 'MODX') ||
    (hasWebasyst && 'Webasyst') ||
    (hasGooru && 'Gooru') ||
    (hasShopify && 'Shopify') ||
    (hasTilda && 'Тильда') ||
    (hasLaravel && 'Laravel') ||
    null;

  const frontendLayer = hasNext ? 'Next.js' : hasReact ? 'React' : hasSpaShell ? 'SPA' : null;

  if (primaryCms && frontendLayer) {
    return `${primaryCms} + ${frontendLayer}`;
  }

  if (primaryCms) return primaryCms;
  if (poweredBy.includes('php')) return 'Самописный PHP';
  if (hasNext) return 'Next.js';
  if (hasReact) return 'React';
  if (hasSpaShell) return 'SPA';

  return 'Другой / самописный';
}

function detectAnalytics(html: string) {
  const htmlLower = html.toLowerCase();
  const analytics = {
    yandex:
      htmlLower.includes('mc.yandex.ru') ||
      htmlLower.includes('ym(') ||
      htmlLower.includes('metrika'),
    google:
      htmlLower.includes('googletagmanager.com/gtag/js') ||
      htmlLower.includes('google-analytics.com') ||
      htmlLower.includes('analytics.js') ||
      htmlLower.includes('gtag('),
    vk:
      htmlLower.includes('vk.com/js/api/openapi.js') ||
      htmlLower.includes('vk.retargeting'),
    facebook:
      htmlLower.includes('connect.facebook.net') || htmlLower.includes('fbq('),
  };

  const scripts: string[] = [];
  if (analytics.yandex) scripts.push('Яндекс Метрика');
  if (analytics.google) scripts.push('Google Analytics');
  if (analytics.vk) scripts.push('VK Pixel');
  if (analytics.facebook) scripts.push('Facebook Pixel');

  return { analytics, scripts };
}

function extractMenuData(html: string, siteUrl: string) {
  const origin = new URL(siteUrl).origin;
  const buckets = [
    ...html.matchAll(/<(nav|header)\b[^>]*>([\s\S]*?)<\/\1>/gi),
  ].map((match) => match[2] || '');
  const source = buckets.length ? buckets.join(' ') : html;

  const links = new Map<string, MenuLink>();
  const labels: string[] = [];

  for (const match of source.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const rawHref = decodeHtmlEntities(match[1] || '');
    const rawLabel = decodeHtmlEntities(stripHtml(match[2] || ''));
    if (!rawHref || !rawLabel) continue;

    try {
      const normalized = new URL(rawHref, origin);
      if (normalized.origin !== origin) continue;
      if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|xml)$/i.test(normalized.pathname)) continue;
      if (rawLabel.length > 80) continue;

      labels.push(rawLabel);
      if (!links.has(normalized.toString())) {
        links.set(normalized.toString(), {
          label: rawLabel,
          url: normalized.toString(),
        });
      }
    } catch {
      continue;
    }
  }

  return {
    labels: Array.from(new Set(labels)).slice(0, 20),
    links: Array.from(links.values())
      .filter((link) => {
        try {
          const parsed = new URL(link.url);
          return parsed.pathname !== '/' && parsed.pathname !== '';
        } catch {
          return false;
        }
      })
      .slice(0, 10),
  };
}

function extractContentPreview(html: string) {
  const mainMatch =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ||
    html;
  return stripHtml(mainMatch).slice(0, 500);
}

function parseRobotsSitemapUrls(text: string, siteUrl: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => line.replace(/^sitemap:\s*/i, '').trim())
    .map((value) => {
      try {
        return new URL(value, siteUrl).toString();
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

function looksLikeSitemapUrl(value: string) {
  return looksLikeSitemapResource(value);
}

function parseSitemapUrlset(xml: string) {
  const items: SitemapUrlEntry[] = [];

  for (const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const chunk = match[1] || '';
    const loc = decodeHtmlEntities(chunk.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] || '');
    const lastmod = decodeHtmlEntities(chunk.match(/<lastmod>([\s\S]*?)<\/lastmod>/i)?.[1] || '');
    if (loc) {
      items.push({
        loc,
        lastmod: lastmod || null,
      });
    }
  }

  return items;
}

function parseSitemapIndex(xml: string) {
  const nested: string[] = [];

  for (const match of xml.matchAll(/<sitemap\b[^>]*>([\s\S]*?)<\/sitemap>/gi)) {
    const chunk = match[1] || '';
    const loc = decodeHtmlEntities(chunk.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1] || '');
    if (loc) nested.push(loc);
  }

  return nested;
}

async function crawlSitemaps(initialUrls: string[]) {
  const queue = [...new Set(initialUrls)];
  const visited = new Set<string>();
  const entries: SitemapUrlEntry[] = [];
  let detectedType: string | null = null;
  let truncatedByUrlLimit = false;
  let truncatedByFileLimit = false;

  while (queue.length && entries.length < MAX_SITEMAP_URLS && visited.size < MAX_SITEMAP_FILES) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);

    const response = await fetchSitemapText(sitemapUrl);
    if (!response.ok || !response.text) continue;

    const xml = response.text;
    if (/<sitemapindex\b/i.test(xml)) {
      detectedType = detectedType || 'sitemapindex';
      for (const nested of parseSitemapIndex(xml)) {
        if (!visited.has(nested)) queue.push(nested);
      }
      continue;
    }

    if (/<urlset\b/i.test(xml)) {
      detectedType = detectedType || 'urlset';
      for (const entry of parseSitemapUrlset(xml)) {
        entries.push(entry);
        if (entries.length >= MAX_SITEMAP_URLS) {
          truncatedByUrlLimit = true;
          break;
        }
      }
    }
  }

  if (visited.size >= MAX_SITEMAP_FILES && queue.length) {
    truncatedByFileLimit = true;
  }

  return {
    entries,
    type: detectedType,
    visited: Array.from(visited),
    truncatedByUrlLimit,
    truncatedByFileLimit,
  };
}

function classifyUrl(loc: string): SitemapBucket {
  let path = loc.toLowerCase();

  try {
    path = decodeURIComponent(new URL(loc).pathname.toLowerCase());
  } catch {
    path = loc.toLowerCase();
  }

  if (applicationPatterns.some((pattern) => path.includes(pattern))) return 'application';
  if (searchPatterns.some((pattern) => path.includes(pattern))) return 'search';
  if (documentPatterns.some((pattern) => path.includes(pattern))) return 'documents';
  if (videoPatterns.some((pattern) => path.includes(pattern))) return 'video';
  if (faqPatterns.some((pattern) => path.includes(pattern))) return 'faq';
  if (commercialPatterns.some((pattern) => path.includes(pattern))) return 'commercial';
  if (informationalPatterns.some((pattern) => path.includes(pattern))) return 'informational';
  if (servicePatterns.some((pattern) => path.includes(pattern))) return 'service';

  if (/(search|find|query|lookup|okpd2|nkmi|registry|reestr)/i.test(path)) {
    return 'search';
  }

  if (/(docs?|documentation|document|паспорт|инструкц|руководство|manual|guide)/i.test(path)) {
    return 'documents';
  }

  if (/(video|webinar|vebinar|recording|youtube|rutube)/i.test(path)) {
    return 'video';
  }

  if (/(faq|question|answer|вопрос|ответ|dwqa)/i.test(path)) {
    return 'faq';
  }

  if (/(купить|цена|заказать|стоимость|product|shop|catalog|товар|услуг)/i.test(path)) {
    return 'commercial';
  }

  if (/(как|почему|что-такое|что_такое|статья|blog|news|guide|help)/i.test(path)) {
    return 'informational';
  }

  return 'unknown';
}

function getTopStructureBuckets(structure: SiteProfileResponse['structure']) {
  const bucketOrder: SitemapBucket[] = [
    'commercial',
    'informational',
    'application',
    'search',
    'documents',
    'video',
    'faq',
    'service',
    'unknown',
  ];

  const ordered: Array<{ key: SitemapBucket; percent: number; count: number }> = bucketOrder
    .map((key) => ({
      key,
      percent: structure[key].percent ?? 0,
      count: structure[key].count ?? 0,
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.percent - a.percent);

  return ordered.slice(0, 3);
}

function countDepth(loc: string) {
  try {
    const pathname = new URL(loc).pathname;
    const segments = pathname.split('/').filter(Boolean).length;
    if (segments <= 1) return 'level1';
    if (segments === 2) return 'level2';
    return 'level3plus';
  } catch {
    return 'level1';
  }
}

function formatPercent(count: number, total: number) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

function formatDateLabel(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU').format(date);
}

function formatDomainAge(years: number | null) {
  if (years === null || Number.isNaN(years)) return 'не удалось определить';
  const rounded = Math.floor(years);
  if (rounded <= 0) return 'меньше 1 года';
  if (rounded === 1) return '1 год';
  if (rounded >= 2 && rounded <= 4) return `${rounded} года`;
  return `${rounded} лет`;
}

function createEmptyWhois(rawSource: string) {
  return {
    createdAt: null,
    ageYears: null,
    registrar: 'не удалось определить',
    rawSource,
  };
}

function parseRobotsTxt(text: string) {
  const groups: RobotsGroup[] = [];
  let currentAgents: string[] = [];
  let currentRules: RobotsGroup['rules'] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#', 1)[0]?.trim();
    if (!line || !line.includes(':')) continue;

    const [fieldRaw, ...rest] = line.split(':');
    const field = fieldRaw.trim().toLowerCase();
    const value = rest.join(':').trim();

    if (field === 'user-agent') {
      if (currentAgents.length) {
        groups.push({ userAgents: currentAgents, rules: currentRules });
        currentRules = [];
      }
      currentAgents = [...currentAgents, value.toLowerCase()];
      continue;
    }

    if ((field === 'allow' || field === 'disallow') && currentAgents.length) {
      currentRules.push({
        directive: field,
        value,
      });
    }
  }

  if (currentAgents.length) {
    groups.push({ userAgents: currentAgents, rules: currentRules });
  }

  return groups;
}

function chooseRobotsGroup(groups: RobotsGroup[], targetUserAgent: string) {
  let bestGroup: RobotsGroup | null = null;
  let bestAgent: string | null = null;
  let bestScore = -1;
  const target = targetUserAgent.toLowerCase();

  for (const group of groups) {
    for (const agent of group.userAgents) {
      let score = -1;

      if (agent === target) score = 100;
      else if (agent === '*') score = 1;
      else if (target.startsWith(agent)) score = agent.length;

      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
        bestAgent = agent;
      }
    }
  }

  return { group: bestGroup, agent: bestAgent };
}

function evaluateRobots(group: RobotsGroup | null, pageUrl: string) {
  if (!group) {
    return { allowed: true, matchedRule: null as string | null };
  }

  const parsed = new URL(pageUrl);
  const pagePath = parsed.pathname + parsed.search;
  let matchedRule: { directive: 'allow' | 'disallow'; value: string } | null = null;
  let matchedLength = -1;

  for (const rule of group.rules) {
    if (rule.directive === 'disallow' && rule.value === '') continue;
    if (!pagePath.startsWith(rule.value)) continue;

    if (rule.value.length > matchedLength) {
      matchedRule = rule;
      matchedLength = rule.value.length;
      continue;
    }

    if (
      rule.value.length === matchedLength &&
      matchedRule?.directive === 'disallow' &&
      rule.directive === 'allow'
    ) {
      matchedRule = rule;
    }
  }

  if (!matchedRule) {
    return { allowed: true, matchedRule: null as string | null };
  }

  return {
    allowed: matchedRule.directive !== 'disallow',
    matchedRule: `${matchedRule.directive}: ${matchedRule.value}`,
  };
}

function isLlmTxtSyntaxOk(text: string) {
  const cleanedLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  if (!cleanedLines.length) return false;
  if (text.includes('\u0000')) return false;

  return cleanedLines.some(
    (line) =>
      /^https?:\/\//i.test(line) ||
      /^[A-Za-z][A-Za-z0-9 _-]{1,40}:/i.test(line) ||
      /^[-*]\s+/.test(line)
  );
}

function buildLlmsTxtStatus(
  llmsTxt: TextFetchResult,
  robotsConflict: { agent: string | null; rule: string | null }
) {
  if (!llmsTxt.ok || llmsTxt.status === 404) {
    return {
      status: 'warn' as const,
      value: 'Нет',
      description: 'Файл /llms.txt не найден.',
    };
  }

  if (robotsConflict.rule) {
    return {
      status: 'fail' as const,
      value: 'Конфликт',
      description: `robots.txt блокирует ${robotsConflict.agent || 'AI-ботов'}: ${robotsConflict.rule}.`,
    };
  }

  if (!isLlmTxtSyntaxOk(llmsTxt.text)) {
    return {
      status: 'warn' as const,
      value: 'Пустой',
      description: 'Файл /llms.txt найден, но выглядит пустым или нечитаемым.',
    };
  }

  return {
    status: 'ok' as const,
    value: 'Найден',
    description: 'Файл /llms.txt найден и выглядит корректно.',
  };
}

function getMenuLinkPriority(link: MenuLink) {
  const source = `${link.label} ${link.url}`.toLowerCase();
  if (/(contact|контакт|about|о нас|company|requisite|реквизит|legal|privacy|policy|oferta|terms|company)/i.test(source)) {
    return 5;
  }
  if (/(faq|вопрос|question|docs|documentation|help|поддержк)/i.test(source)) {
    return 4;
  }
  if (/(service|услуг|catalog|каталог|product|решени|pricing|тариф)/i.test(source)) {
    return 3;
  }
  return 1;
}

function calculateAgeYears(createdAt: string | null) {
  const createdDate = createdAt ? new Date(createdAt) : null;
  if (!createdDate || Number.isNaN(createdDate.getTime())) return null;

  const ageYears = (Date.now() - createdDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Number.isFinite(ageYears) ? ageYears : null;
}

function normalizeWhoisDate(rawValue: string | null) {
  if (!rawValue) return null;
  const value = rawValue.trim();
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/i.test(value)) {
    const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
    return Number.isNaN(new Date(normalized).getTime()) ? null : normalized;
  }

  const dotted = value.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotted) {
    const [, day, month, year] = dotted;
    const normalized = `${year}-${month}-${day}T00:00:00Z`;
    return Number.isNaN(new Date(normalized).getTime()) ? null : normalized;
  }

  const textDate = Date.parse(value);
  if (!Number.isNaN(textDate)) {
    return new Date(textDate).toISOString();
  }

  return null;
}

function extractWhoisRegistrar(text: string) {
  const patterns = [
    /registrar\s*[:>]\s*([^\n<]+)/i,
    /Регистратор\s*[:>]\s*([^\n<]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(stripHtml(match[1])).trim() || 'не удалось определить';
    }
  }

  return 'не удалось определить';
}

function extractWhoisCreatedAt(text: string) {
  const patterns = [
    /created\s*[:>]\s*([0-9TZ:\-\. ]+)/i,
    /registered\s*[:>]\s*([0-9TZ:\-\. ]+)/i,
    /Дата регистрации\s*[:>]\s*([0-9TZ:\-\. ]+)/i,
    /created[^0-9]*(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}(?:T[0-9:]+Z)?)/i,
    /registered[^0-9]*(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}(?:T[0-9:]+Z)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const normalized = normalizeWhoisDate(match?.[1] || null);
    if (normalized) return normalized;
  }

  return null;
}

async function fetchRuWhoisFromHttp(url: string, rawSource: string) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
          'User-Agent': BROWSER_UA,
        },
      },
      SEARCH_TIMEOUT_MS
    );

    if (!response.ok) return createEmptyWhois(rawSource);

    const text = await response.text();
    const createdAt = extractWhoisCreatedAt(text);
    const registrar = extractWhoisRegistrar(text);

    return {
      createdAt,
      ageYears: calculateAgeYears(createdAt),
      registrar,
      rawSource,
    };
  } catch {
    return createEmptyWhois(rawSource);
  }
}

async function fetchRuWhoisViaTcinetHttp(domain: string) {
  try {
    const response = await fetchWithTimeout(
      'https://whois.tcinet.ru/domain/',
      {
        method: 'POST',
        headers: {
          Accept: 'text/plain,text/html;q=0.9,*/*;q=0.8',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'User-Agent': BROWSER_UA,
        },
        body: new URLSearchParams({ dmn: domain }).toString(),
      },
      SEARCH_TIMEOUT_MS
    );

    if (!response.ok) {
      return createEmptyWhois('whois.tcinet.ru/http');
    }

    const text = await response.text();
    const createdAt = extractWhoisCreatedAt(text);
    const registrar = extractWhoisRegistrar(text);

    return {
      createdAt,
      ageYears: calculateAgeYears(createdAt),
      registrar,
      rawSource: 'whois.tcinet.ru/http',
    };
  } catch {
    return createEmptyWhois('whois.tcinet.ru/http');
  }
}

async function fetchRuWhoisViaTcinet(domain: string) {
  return await new Promise<{
    createdAt: string | null;
    ageYears: number | null;
    registrar: string;
    rawSource: string;
  }>((resolve) => {
    const socket = createConnection({ host: 'whois.tcinet.ru', port: 43 });
    let raw = '';
    let settled = false;

    const finish = (payload: {
      createdAt: string | null;
      ageYears: number | null;
      registrar: string;
      rawSource: string;
    }) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(payload);
    };

    const timer = setTimeout(() => finish(createEmptyWhois('whois.tcinet.ru')), SEARCH_TIMEOUT_MS);

    socket.setEncoding('utf8');
    socket.on('connect', () => {
      socket.write(`${domain}\r\n`);
    });
    socket.on('data', (chunk) => {
      raw += chunk;
    });
    socket.on('end', () => {
      clearTimeout(timer);
      const createdAt = extractWhoisCreatedAt(raw);
      const registrar = extractWhoisRegistrar(raw);
      finish({
        createdAt,
        ageYears: calculateAgeYears(createdAt),
        registrar,
        rawSource: 'whois.tcinet.ru',
      });
    });
    socket.on('error', () => {
      clearTimeout(timer);
      finish(createEmptyWhois('whois.tcinet.ru'));
    });
    socket.on('timeout', () => {
      clearTimeout(timer);
      finish(createEmptyWhois('whois.tcinet.ru'));
    });
  });
}

async function fetchRdapWhois(domain: string) {
  try {
    const response = await fetchWithTimeout(
      `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': BROWSER_UA,
        },
      },
      SEARCH_TIMEOUT_MS
    );

    if (!response.ok) {
      return createEmptyWhois('rdap');
    }

    const data = (await response.json()) as Record<string, unknown>;
    const events = Array.isArray(data.events) ? (data.events as Record<string, unknown>[]) : [];
    const registrationEvent = events.find(
      (event) => String(event.eventAction || '').toLowerCase() === 'registration'
    );
    const createdAt = normalizeWhoisDate(
      typeof registrationEvent?.eventDate === 'string' ? registrationEvent.eventDate : null
    );

    const registrarEntity = Array.isArray(data.entities)
      ? (data.entities as Record<string, unknown>[]).find((entity) =>
          Array.isArray(entity.roles)
            ? (entity.roles as unknown[]).some((role) => String(role).toLowerCase() === 'registrar')
            : false
        )
      : null;

    const registrar =
      typeof registrarEntity?.vcardArray === 'object'
        ? extractRegistrarName(registrarEntity.vcardArray)
        : 'не удалось определить';

    return {
      createdAt,
      ageYears: calculateAgeYears(createdAt),
      registrar,
      rawSource: 'rdap',
    };
  } catch {
    return createEmptyWhois('rdap');
  }
}

async function fetchDomainWhois(domain: string) {
  const lowerDomain = domain.toLowerCase();
  const isRuZone =
    lowerDomain.endsWith('.ru') || lowerDomain.endsWith('.рф') || lowerDomain.endsWith('.xn--p1ai');

  if (isRuZone) {
    const nic = await fetchRuWhoisFromHttp(
      `https://www.nic.ru/whois/?query=${encodeURIComponent(domain)}`,
      'nic.ru'
    );
    if (nic.createdAt) return nic;

    const reg = await fetchRuWhoisFromHttp(
      `https://www.reg.ru/whois/?dname=${encodeURIComponent(domain)}`,
      'reg.ru'
    );
    if (reg.createdAt) return reg;

    const tcinetHttp = await fetchRuWhoisViaTcinetHttp(domain);
    if (tcinetHttp.createdAt) return tcinetHttp;

    const tcinet = await fetchRuWhoisViaTcinet(domain);
    if (tcinet.createdAt) return tcinet;
  }

  return await fetchRdapWhois(domain);
}

function extractRegistrarName(vcardArray: unknown) {
  if (!Array.isArray(vcardArray) || !Array.isArray(vcardArray[1])) return 'не удалось определить';
  const items = vcardArray[1] as unknown[];

  for (const item of items) {
    if (!Array.isArray(item) || item[0] !== 'fn') continue;
    const value = item[3];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return 'не удалось определить';
}

async function fetchSearchIndexCount(engine: 'google' | 'yandex', domain: string) {
  const url =
    engine === 'google'
      ? `https://www.google.com/search?q=${encodeURIComponent(`site:${domain}`)}`
      : `https://yandex.ru/search/?text=${encodeURIComponent(`site:${domain}`)}`;

  try {
    const response = await fetchText(url, SEARCH_TIMEOUT_MS);
    if (!response.ok || !response.text) return 'не удалось получить';

    const text = response.text;
    const patterns =
      engine === 'google'
        ? [
            /About ([\d,.\s]+) results/i,
            /Результатов: примерно ([\d\s .,]+)/i,
            /id="result-stats"[^>]*>([\s\S]*?)</i,
          ]
        : [
            /Нашл(?:ось|о)[^0-9]{0,20}([\d\s .,]+)/i,
            /found[^0-9]{0,20}([\d\s .,]+)/i,
          ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const raw = match?.[1];
      if (!raw) continue;
      const digits = raw.replace(/[^\d]/g, '');
      if (digits) {
        return `~${new Intl.NumberFormat('ru-RU').format(Number(digits))}`;
      }
    }

    return 'не удалось получить';
  } catch {
    return 'не удалось получить';
  }
}

async function fetchYandexIks(domain: string) {
  try {
    const response = await fetchText(
      `https://checker.yandex.ru/indexrank?url=${encodeURIComponent(`https://${domain}`)}`,
      SEARCH_TIMEOUT_MS
    );
    if (!response.ok || !response.text) return 'не удалось получить';

    const patterns = [
      /ИКС[^0-9]{0,20}([\d\s]+)/i,
      /indexrank[^0-9]{0,20}([\d\s]+)/i,
      /<title>\s*([\d\s]+)\s*<\/title>/i,
    ];

    for (const pattern of patterns) {
      const raw = response.text.match(pattern)?.[1];
      if (!raw) continue;
      const digits = raw.replace(/[^\d]/g, '');
      if (digits) return new Intl.NumberFormat('ru-RU').format(Number(digits));
    }

    return 'не удалось получить';
  } catch {
    return 'не удалось получить';
  }
}

function buildSignal(label: string, found: boolean, positiveValue: string, negativeValue: string): SignalItem {
  return {
    label,
    status: found ? 'ok' : 'warn',
    value: found ? positiveValue : negativeValue,
  };
}

function detectSiteSignals(pages: PageDoc[]): DetectedSiteSignals {
  const html = pages.map((page) => page.html).join('\n');
  const text = pages.map((page) => page.text).join('\n');
  const htmlLower = html.toLowerCase();
  const textLower = text.toLowerCase();

  const phoneFound =
    /(?:\+7|8)[\s(.-]*\d{3}[\s).-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}/.test(text) ||
    htmlLower.includes('tel:');
  const pricesFound =
    /\d[\d\s]{1,8}\s?(?:₽|руб\.?|р\.)/iu.test(text) ||
    /(цена|стоимость|от\s+\d)/i.test(textLower);
  const cartFound =
    /\/(?:cart|checkout|korzina)\b/i.test(htmlLower) ||
    /(корзина|оформить заказ|checkout)/i.test(textLower);
  const formFound =
    /<form\b/i.test(htmlLower) &&
    (/(name|имя)/i.test(html) || /(phone|телефон)/i.test(html));

  const requisitesFound =
    /\bинн\b/i.test(textLower) ||
    /\bогрн\b/i.test(textLower) ||
    /\bкпп\b/i.test(textLower) ||
    /\b(ооо|ао|зао|пао|ип)\b/i.test(textLower) ||
    /\b\d{10}\b/.test(text) ||
    /\b\d{12}\b/.test(text) ||
    /\b\d{13}\b/.test(text) ||
    /\b\d{15}\b/.test(text);
  const addressFound =
    /postaladdress/i.test(htmlLower) ||
    /\b(ул\.|улица|проспект|д\.|дом|офис|город|г\.)\b/i.test(textLower);
  const emailFound = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text);
  const reviewsFound =
    /(review|aggregaterating|отзывы|отзыв)/i.test(htmlLower) ||
    /\/(?:reviews|review|otzyvy|otzyv)\b/i.test(htmlLower);

  const chatFound =
    /(jivosite|jivo|bitrix24|tawk\.to|livetex|usedesk|chatra)/i.test(htmlLower);
  const messengerFound = /(wa\.me|whatsapp|t\.me|telegram)/i.test(htmlLower);
  const docsFound =
    /(documentation|knowledge base|developer|api docs|docs\b|документац|база знаний|руководств|инструкц)/i.test(
      htmlLower
    ) || /\/(?:docs|documentation|help|api|knowledge-base)\b/i.test(htmlLower);
  const faqFound =
    /(faq|частые вопросы|вопросы и ответы|вопрос-ответ)/i.test(textLower) ||
    /\/(?:faq|questions|question|answer|voprosy-otvety)\b/i.test(htmlLower);
  const demoFound =
    /(demo|trial|бесплатн(ая|ый|ое) пробн|запросить демо|получить демо|регистрация|зарегистрироваться|личный кабинет|войти)/i.test(
      textLower
    ) || /\/(?:demo|trial|register|signup|sign-up|sign-in|login|lk|cabinet)\b/i.test(htmlLower);

  return {
    phoneFound,
    pricesFound,
    cartFound,
    formFound,
    requisitesFound,
    addressFound,
    emailFound,
    reviewsFound,
    chatFound,
    messengerFound,
    docsFound,
    faqFound,
    demoFound,
  };
}

function analyzeCommercialSignals(signals: DetectedSiteSignals, siteType: string) {
  const normalizedType = siteType.toLowerCase();

  let critical: SignalItem[];
  let important: SignalItem[];
  const additional = [
    buildSignal('Чат виджет', signals.chatFound, 'Чат найден', 'Чат не найден'),
    buildSignal('Мессенджеры', signals.messengerFound, 'Мессенджеры найдены', 'Мессенджеры не найдены'),
  ];

  if (normalizedType.includes('saas') || normalizedType.includes('сервис')) {
    critical = [
      buildSignal('Телефон', signals.phoneFound, 'Телефон найден', 'Телефон не найден'),
      buildSignal('Email', signals.emailFound, 'Email найден', 'Email не найден'),
      buildSignal('Форма заявки', signals.formFound, 'Форма заявки найдена', 'Форма заявки не найдена'),
      buildSignal('Демо/регистрация', signals.demoFound, 'Демо или регистрация найдены', 'Демо или регистрация не найдены'),
    ];
    important = [
      buildSignal('Документация', signals.docsFound, 'Документация найдена', 'Документация не найдена'),
      buildSignal('FAQ', signals.faqFound, 'FAQ найден', 'FAQ не найден'),
      buildSignal('Реквизиты', signals.requisitesFound, 'Реквизиты найдены', 'Реквизиты не найдены'),
      buildSignal('Отзывы', signals.reviewsFound, 'Отзывы найдены', 'Отзывы не найдены'),
    ];
  } else if (
    normalizedType.includes('корпоратив') ||
    normalizedType.includes('лендинг') ||
    normalizedType.includes('агрегатор') ||
    normalizedType.includes('блог')
  ) {
    critical = [
      buildSignal('Телефон', signals.phoneFound, 'Телефон найден', 'Телефон не найден'),
      buildSignal('Email', signals.emailFound, 'Email найден', 'Email не найден'),
      buildSignal('Форма заявки', signals.formFound, 'Форма заявки найдена', 'Форма заявки не найдена'),
      buildSignal('Адрес', signals.addressFound, 'Адрес найден', 'Адрес не найден'),
    ];
    important = [
      buildSignal('Реквизиты', signals.requisitesFound, 'Реквизиты найдены', 'Реквизиты не найдены'),
      buildSignal('FAQ', signals.faqFound, 'FAQ найден', 'FAQ не найден'),
      buildSignal('Отзывы', signals.reviewsFound, 'Отзывы найдены', 'Отзывы не найдены'),
      buildSignal('Документация', signals.docsFound, 'Документация найдена', 'Документация не найдена'),
    ];
  } else {
    critical = [
      buildSignal('Телефон', signals.phoneFound, 'Телефон найден', 'Телефон не найден'),
      buildSignal('Цены', signals.pricesFound, 'Цены найдены', 'Цены не найдены'),
      buildSignal('Корзина', signals.cartFound, 'Корзина найдена', 'Корзина не найдена'),
      buildSignal('Форма заявки', signals.formFound, 'Форма заявки найдена', 'Форма заявки не найдена'),
    ];
    important = [
      buildSignal('Реквизиты', signals.requisitesFound, 'Реквизиты найдены', 'Реквизиты не найдены'),
      buildSignal('Адрес', signals.addressFound, 'Адрес найден', 'Адрес не найден'),
      buildSignal('Email', signals.emailFound, 'Email найден', 'Email не найден'),
      buildSignal('Отзывы', signals.reviewsFound, 'Отзывы найдены', 'Отзывы не найдены'),
    ];
  }

  return {
    critical: {
      found: critical.filter((item) => item.status === 'ok').length,
      total: critical.length,
      items: critical,
    },
    important: {
      found: important.filter((item) => item.status === 'ok').length,
      total: important.length,
      items: important,
    },
    additional: {
      found: additional.filter((item) => item.status === 'ok').length,
      total: additional.length,
      items: additional,
    },
  };
}

function deriveHeuristicProfile(input: {
  title: string;
  h1: string;
  metaDescription: string;
  menuLabels: string[];
  previewText: string;
  structure: SiteProfileResponse['structure'];
  signals: DetectedSiteSignals;
  cms: string;
}) {
  const haystack = [
    input.title,
    input.h1,
    input.metaDescription,
    input.previewText,
    input.menuLabels.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  let siteType = 'не удалось определить';

  if (
    /(crm|saas|платформа|сервис|api|dashboard|demo|trial|личный кабинет)/i.test(haystack) &&
    !/(магазин|каталог|товар)/i.test(haystack)
  ) {
    siteType = 'SaaS-сервис';
  } else if (
    input.signals.cartFound ||
    (input.structure.commercial.percent !== null && input.structure.commercial.percent >= 40)
  ) {
    siteType = 'интернет-магазин';
  } else if (
    input.structure.informational.percent !== null &&
    input.structure.informational.percent >= 50
  ) {
    siteType = 'блог';
  } else if (/агрегатор|сравнение|подбор|каталог компаний|marketplace/i.test(haystack)) {
    siteType = 'агрегатор';
  } else if (
    input.structure.total_urls !== null &&
    input.structure.total_urls <= 20 &&
    input.signals.formFound
  ) {
    siteType = 'лендинг';
  } else if (/о компании|контакты|услуги|решения|команда/i.test(haystack)) {
    siteType = 'корпоративный сайт';
  }

  let audience = 'не удалось определить';
  const b2b = /(b2b|для бизнеса|для компаний|оптом|партнерам|корпоративным клиентам)/i.test(haystack);
  const b2c = /(купить|доставка|каталог|корзина|заказать|для дома|для себя)/i.test(haystack);

  if (b2b && b2c) audience = 'смешанная';
  else if (b2b) audience = 'B2B';
  else if (b2c) audience = 'B2C';

  const topic =
    [input.h1, input.title, input.metaDescription]
      .map((value) => value.split('|')[0]?.split('—')[0]?.trim() || value.trim())
      .find((value) => value && value.length >= 8) || 'не удалось определить';

  const regionMatch = [input.title, input.h1, input.metaDescription, input.previewText].find((value) =>
    cityRegex.test(value)
  );
  const region =
    regionMatch?.match(cityRegex)?.[1] ||
    (/(росси|рф\b|44-фз|госзакуп)/i.test(haystack) ? 'Россия' : 'не удалось определить');

  return {
    site_type: siteType,
    audience,
    topic,
    region,
  };
}

async function callLlmJson<T>(system: string, user: string): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      },
      25_000
    );

    if (!response.ok) return null;
    const data = (await response.json()) as Record<string, unknown>;
    const choices = data.choices as Array<{ message?: { content?: string } }> | undefined;
    const content = choices?.[0]?.message?.content || '';
    if (!content) return null;
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function callRelayJson<T>(path: string, payload: Record<string, unknown>): Promise<T | null> {
  if (!LLM_RELAY_URL || !LLM_RELAY_SECRET) return null;

  try {
    const response = await fetchWithTimeout(
      `${LLM_RELAY_URL}${path}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-relay-secret': LLM_RELAY_SECRET,
        },
        body: JSON.stringify(payload),
      },
      25_000
    );

    if (!response.ok) return null;
    const data = (await response.json()) as { ok?: boolean; data?: T };
    if (data.ok !== true || !data.data) return null;
    return data.data;
  } catch {
    return null;
  }
}

function sanitizeValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : 'не удалось определить';
}

async function fetchSearchSignals(domain: string): Promise<SearchSignals> {
  const relayResult = await callRelayJson<Partial<SearchSignals>>('/api/site-profile/search-signals', {
    domain,
  });

  const fallbackUnavailable = 'не удалось получить';
  const relayGoogle = sanitizeValue(relayResult?.google_index);
  const relayYandex = sanitizeValue(relayResult?.yandex_index);
  const relayIks = sanitizeValue(relayResult?.yandex_iks);

  const [google_index, yandex_index, yandex_iks] = await Promise.all([
    relayGoogle !== 'не удалось определить' && relayGoogle !== fallbackUnavailable
      ? Promise.resolve(relayGoogle)
      : fetchSearchIndexCount('google', domain),
    relayYandex !== 'не удалось определить' && relayYandex !== fallbackUnavailable
      ? Promise.resolve(relayYandex)
      : fetchSearchIndexCount('yandex', domain),
    relayIks !== 'не удалось определить' && relayIks !== fallbackUnavailable
      ? Promise.resolve(relayIks)
      : fetchYandexIks(domain),
  ]);

  return {
    google_index,
    yandex_index,
    yandex_iks,
  };
}

async function classifySiteWithLlm(input: {
  title: string;
  h1: string;
  metaDescription: string;
  menuText: string;
  previewText: string;
}) {
  const payload = {
    title: input.title,
    h1: input.h1,
    metaDescription: input.metaDescription,
    menuText: input.menuText,
    previewText: input.previewText,
  };

  const result =
    (await callRelayJson<Partial<SiteClassification>>('/api/site-profile/classify', payload)) ||
    (await callLlmJson<Partial<SiteClassification>>(
      'Ты определяешь тип сайта по кратким данным главной страницы. Отвечай только JSON без пояснений. Если не уверен — пиши "не удалось определить".',
      JSON.stringify(
        {
          task: 'Определи тип сайта, аудиторию, тематику и регион.',
          required_fields: ['site_type', 'audience', 'topic', 'region'],
          allowed_site_types: [
            'интернет-магазин',
            'SaaS-сервис',
            'блог',
            'лендинг',
            'корпоративный сайт',
            'агрегатор',
            'не удалось определить',
          ],
          allowed_audience: ['B2B', 'B2C', 'смешанная', 'не удалось определить'],
          source: {
            title: input.title,
            h1: input.h1,
            meta_description: input.metaDescription,
            menu_text: input.menuText,
            preview_text: input.previewText,
          },
        },
        null,
        2
      )
    ));

  return {
    site_type: sanitizeValue(result?.site_type),
    audience: sanitizeValue(result?.audience),
    topic: sanitizeValue(result?.topic),
    region: sanitizeValue(result?.region),
  };
}

function buildFallbackSummary(input: {
  classification: SiteClassification;
  structure: SiteProfileResponse['structure'];
  commerce: SiteProfileResponse['commerce'];
  technical: SiteProfileResponse['technical'];
}) {
  const sentences: string[] = [];
  const firstSentenceParts = [
    input.classification.audience !== 'не удалось определить' ? input.classification.audience : null,
    input.classification.site_type !== 'не удалось определить' ? input.classification.site_type : null,
    input.classification.topic !== 'не удалось определить' ? input.classification.topic : null,
    input.classification.region !== 'не удалось определить' ? input.classification.region : null,
  ].filter(Boolean);

  sentences.push(firstSentenceParts.length ? `${firstSentenceParts.join(', ')}.` : 'Тип сайта определить не удалось.');

  if (input.structure.sitemap_found && input.structure.total_urls !== null) {
    const topBuckets = getTopStructureBuckets(input.structure)
      .slice(0, 2)
      .map((item) => `${sitemapBucketLabels[item.key]} ${item.percent}%`)
      .join(', ');

    sentences.push(
      `В sitemap найдено ${new Intl.NumberFormat('ru-RU').format(input.structure.total_urls)} URL${topBuckets ? `; основные разделы: ${topBuckets}.` : '.'}`
    );
  } else {
    sentences.push('Sitemap не найден, структура сайта определена частично.');
  }

  const gaps: string[] = [];
  if (input.commerce.important.items.find((item) => item.label === 'Адрес')?.status !== 'ok') gaps.push('адрес не найден');
  if (input.commerce.important.items.find((item) => item.label === 'Отзывы')?.status !== 'ok') gaps.push('отзывы не найдены');
  if (input.structure.unknown.count && input.structure.unknown.count > 0) {
    gaps.push(`${new Intl.NumberFormat('ru-RU').format(input.structure.unknown.count)} страниц не классифицированы`);
  }
  if (gaps.length) {
    sentences.push(`Пробелы: ${gaps.slice(0, 3).join(', ')}.`);
  }

  return sentences.join(' ');
}

async function summarizeProfileWithLlm(input: {
  classification: SiteClassification;
  structure: SiteProfileResponse['structure'];
  commerce: SiteProfileResponse['commerce'];
  technical: SiteProfileResponse['technical'];
  subdomains: SiteProfileResponse['subdomains'];
  whois: {
    ageYears: number | null;
    registrar: string;
  };
}) {
  const { google_index: _googleIndex, yandex_index: _yandexIndex, ...structureForSummary } = input.structure;
  const summaryInput = {
    ...input,
    structure: structureForSummary,
  };

  const result =
    (await callRelayJson<{ summary?: string }>('/api/site-profile/summarize', summaryInput)) ||
    (await callLlmJson<{ summary?: string }>(
      SITE_PROFILE_SUMMARY_PROMPT,
      JSON.stringify(
        {
          required_field: 'summary',
          input: summaryInput,
        },
        null,
        2
      )
    ));

  if (typeof result?.summary === 'string' && result.summary.trim()) {
    return result.summary.trim();
  }

  return buildFallbackSummary(input);
}

function buildStructureSummary(entries: SitemapUrlEntry[]) {
  const total = entries.length;
  const counters: Record<SitemapBucket, number> = {
    commercial: 0,
    informational: 0,
    application: 0,
    search: 0,
    documents: 0,
    video: 0,
    faq: 0,
    service: 0,
    unknown: 0,
  };
  const depth = {
    level1: 0,
    level2: 0,
    level3plus: 0,
  };
  const sectionCounts = new Map<string, number>();
  let latestDate: Date | null = null;
  let updatedLast30 = 0;
  const threshold = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    const bucket = classifyUrl(entry.loc);
    counters[bucket] += 1;
    depth[countDepth(entry.loc)] += 1;

    try {
      const pathname = new URL(entry.loc).pathname;
      const firstSegment = pathname.split('/').filter(Boolean)[0] || '/';
      sectionCounts.set(firstSegment, (sectionCounts.get(firstSegment) || 0) + 1);
    } catch {
      sectionCounts.set('/', (sectionCounts.get('/') || 0) + 1);
    }

    if (entry.lastmod) {
      const parsed = new Date(entry.lastmod);
      if (!Number.isNaN(parsed.getTime())) {
        if (!latestDate || parsed > latestDate) latestDate = parsed;
        if (parsed.getTime() >= threshold) updatedLast30 += 1;
      }
    }
  }

  const sections = Array.from(sectionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([section, count]) => ({ section, count }));

  return {
    total,
    commercial: { count: counters.commercial, percent: formatPercent(counters.commercial, total) },
    informational: { count: counters.informational, percent: formatPercent(counters.informational, total) },
    application: { count: counters.application, percent: formatPercent(counters.application, total) },
    search: { count: counters.search, percent: formatPercent(counters.search, total) },
    documents: { count: counters.documents, percent: formatPercent(counters.documents, total) },
    video: { count: counters.video, percent: formatPercent(counters.video, total) },
    faq: { count: counters.faq, percent: formatPercent(counters.faq, total) },
    service: { count: counters.service, percent: formatPercent(counters.service, total) },
    unknown: { count: counters.unknown, percent: formatPercent(counters.unknown, total) },
    depth,
    lastmodLatest: latestDate ? latestDate.toISOString() : null,
    updatedLast30,
    sections,
  };
}

async function fetchInternalPages(links: MenuLink[]) {
  const selected = [...links]
    .sort((a, b) => getMenuLinkPriority(b) - getMenuLinkPriority(a))
    .slice(0, 6);
  const pages = await Promise.all(
    selected.map(async (link) => {
      const response = await fetchText(link.url);
      return {
        ...link,
        html: response.text,
        text: stripHtml(response.text),
      };
    })
  );

  return pages.filter((page) => page.html);
}

async function buildFullProfile(inputUrl: string): Promise<SiteProfileResponse> {
  const normalizedInput = normalizeInputUrl(inputUrl);
  const siteUrl = normalizedInput.origin;
  const homeResponse = await fetchText(siteUrl);

  if (!homeResponse.text) {
    return {
      ...createEmptyFullResponse(inputUrl, siteUrl, siteUrl),
      ok: false,
      error: 'Не удалось получить главную страницу сайта',
      reason: homeResponse.error || 'fetch_error',
    };
  }

  const finalHomeUrl = homeResponse.finalUrl || siteUrl;
  const finalSiteUrl = new URL(finalHomeUrl).origin;
  const finalHostname = new URL(finalSiteUrl).hostname;
  const title = extractTagText(homeResponse.text, 'title');
  const h1 = extractTagText(homeResponse.text, 'h1');
  const metaDescription = extractMetaContent(homeResponse.text, 'name', 'description');
  const { labels: menuLabels, links: menuLinks } = extractMenuData(homeResponse.text, finalSiteUrl);
  const previewText = extractContentPreview(homeResponse.text);
  const internalPagesRaw = await fetchInternalPages(menuLinks);
  const internalPages: PageDoc[] = internalPagesRaw.map((page) => ({
    url: page.url,
    html: page.html,
    text: page.text,
  }));

  const pageDocs: PageDoc[] = [
    { url: finalHomeUrl, html: homeResponse.text, text: stripHtml(homeResponse.text) },
    ...internalPages,
  ];

  const robotsUrl = `${finalSiteUrl}/robots.txt`;
  const llmsTxtUrl = `${finalSiteUrl}/llms.txt`;
  const [robotsResponse, llmsTxtResponse] = await Promise.all([
    fetchText(robotsUrl),
    fetchText(llmsTxtUrl),
  ]);
  const sitemapCandidates = robotsResponse.text
    ? parseRobotsSitemapUrls(robotsResponse.text, finalSiteUrl)
    : [];
  const validSitemapCandidates = sitemapCandidates.filter(looksLikeSitemapUrl);
  const fallbackSitemapUrls = [`${finalSiteUrl}/sitemap.xml`, `${finalSiteUrl}/sitemap.xml.gz`];
  const sitemapUrls = validSitemapCandidates.length ? validSitemapCandidates : fallbackSitemapUrls;
  let sitemapCrawl = await crawlSitemaps(sitemapUrls);
  let sitemapSourceUrls = sitemapUrls;

  if (!sitemapCrawl.entries.length && sitemapUrls.join('|') !== fallbackSitemapUrls.join('|')) {
    const fallbackCrawl = await crawlSitemaps(fallbackSitemapUrls);
    if (fallbackCrawl.entries.length) {
      sitemapCrawl = fallbackCrawl;
      sitemapSourceUrls = fallbackSitemapUrls;
    }
  }
  const structureSummary = buildStructureSummary(sitemapCrawl.entries);
  const cms = detectCms(homeResponse.text, homeResponse.headers);
  const { analytics, scripts } = detectAnalytics(homeResponse.text);
  const detectedSignals = detectSiteSignals(pageDocs);
  let llmsTxtConflict = { agent: null as string | null, rule: null as string | null };
  if (robotsResponse.ok && robotsResponse.text) {
    const groups = parseRobotsTxt(robotsResponse.text);

    for (const token of llmAgentTokens) {
      const chosen = chooseRobotsGroup(groups, token);
      const evaluated = evaluateRobots(chosen.group, finalHomeUrl);
      if (!evaluated.allowed) {
        llmsTxtConflict = {
          agent: chosen.agent || token,
          rule: evaluated.matchedRule,
        };
        break;
      }
    }
  }
  const llmsTxtStatus = buildLlmsTxtStatus(llmsTxtResponse, llmsTxtConflict);
  const whois = await fetchDomainWhois(finalHostname);
  const classificationFallback = deriveHeuristicProfile({
    title,
    h1,
    metaDescription,
    menuLabels,
    previewText,
    structure: {
      ...createEmptyFullResponse(inputUrl, finalSiteUrl, finalHomeUrl).structure,
      sitemap_found: sitemapCrawl.entries.length > 0,
      sitemap_url: sitemapSourceUrls[0] || null,
      total_urls: structureSummary.total,
      commercial: structureSummary.commercial,
      informational: structureSummary.informational,
      application: structureSummary.application,
      search: structureSummary.search,
      documents: structureSummary.documents,
      video: structureSummary.video,
      faq: structureSummary.faq,
      service: structureSummary.service,
      unknown: structureSummary.unknown,
    },
    signals: detectedSignals,
    cms,
  });

  const classificationLlm = await classifySiteWithLlm({
    title,
    h1,
    metaDescription,
    menuText: menuLabels.join(' | '),
    previewText,
  });

  const classification: SiteClassification = {
    site_type:
      classificationLlm.site_type !== 'не удалось определить'
        ? classificationLlm.site_type
        : classificationFallback.site_type,
    audience:
      classificationLlm.audience !== 'не удалось определить'
        ? classificationLlm.audience
        : classificationFallback.audience,
    topic:
      classificationLlm.topic !== 'не удалось определить'
        ? classificationLlm.topic
        : classificationFallback.topic,
    region:
      classificationLlm.region !== 'не удалось определить'
        ? classificationLlm.region
        : classificationFallback.region,
  };

  const commerce = analyzeCommercialSignals(detectedSignals, classification.site_type);

  const searchSignals = await fetchSearchSignals(finalHostname);

  const structure: SiteProfileResponse['structure'] = {
    sitemap_found: sitemapCrawl.entries.length > 0,
    sitemap_url: sitemapSourceUrls[0] || null,
    total_urls: sitemapCrawl.entries.length || null,
    commercial: sitemapCrawl.entries.length
      ? structureSummary.commercial
      : { count: null, percent: null },
    informational: sitemapCrawl.entries.length
      ? structureSummary.informational
      : { count: null, percent: null },
    application: sitemapCrawl.entries.length
      ? structureSummary.application
      : { count: null, percent: null },
    search: sitemapCrawl.entries.length ? structureSummary.search : { count: null, percent: null },
    documents: sitemapCrawl.entries.length
      ? structureSummary.documents
      : { count: null, percent: null },
    video: sitemapCrawl.entries.length ? structureSummary.video : { count: null, percent: null },
    faq: sitemapCrawl.entries.length ? structureSummary.faq : { count: null, percent: null },
    service: sitemapCrawl.entries.length ? structureSummary.service : { count: null, percent: null },
    unknown: sitemapCrawl.entries.length ? structureSummary.unknown : { count: null, percent: null },
    depth: sitemapCrawl.entries.length
      ? structureSummary.depth
      : { level1: null, level2: null, level3plus: null },
    lastmod_latest: structureSummary.lastmodLatest,
    updated_last30: sitemapCrawl.entries.length ? structureSummary.updatedLast30 : null,
    yandex_index: searchSignals.yandex_index,
    google_index: searchSignals.google_index,
    yandex_iks: searchSignals.yandex_iks,
    message: !sitemapCrawl.entries.length
      ? 'Sitemap не найден — структуру сайта не удалось определить'
      : sitemapCrawl.truncatedByUrlLimit
        ? `Обработаны первые ${new Intl.NumberFormat('ru-RU').format(MAX_SITEMAP_URLS)} URL из sitemap. Для очень больших сайтов структура может быть неполной.`
        : sitemapCrawl.truncatedByFileLimit
          ? `Обработаны первые ${new Intl.NumberFormat('ru-RU').format(MAX_SITEMAP_FILES)} sitemap-файлов. Для очень больших сайтов структура может быть неполной.`
          : null,
  };

  const technical: SiteProfileResponse['technical'] = {
    cms,
    llms_txt: llmsTxtStatus,
    analytics,
  };

  const subdomains = await getSubdomainSummary(finalHostname).catch(() => ({
    found: null,
    checked: null,
    risks: null,
    message: 'не удалось проверить',
  }));

  const verdictText = await summarizeProfileWithLlm({
    classification,
    structure,
    commerce,
    technical,
    subdomains,
    whois: {
      ageYears: whois.ageYears,
      registrar: whois.registrar,
    },
  });

  return {
    ok: true,
    phase: 'full',
    checked_at: new Date().toISOString(),
    input_url: inputUrl,
    site_url: finalSiteUrl,
    final_url: finalHomeUrl,
    verdict_text: verdictText,
    profile: {
      type: classification.site_type,
      audience: classification.audience,
      topic: classification.topic,
      region: classification.region,
      domain_age_years:
        whois.ageYears !== null && Number.isFinite(whois.ageYears) ? Number(whois.ageYears.toFixed(1)) : null,
      domain_age_label: formatDomainAge(whois.ageYears),
    },
    structure,
    commerce,
    technical,
    subdomains,
    details: {
      menu_pages: menuLinks.slice(0, 6),
      sitemap_sections: structureSummary.sections,
      analytics_scripts: scripts,
      whois: {
        created_at: formatDateLabel(whois.createdAt),
        age_years:
          whois.ageYears !== null && Number.isFinite(whois.ageYears) ? Number(whois.ageYears.toFixed(1)) : null,
        registrar: whois.registrar,
        raw_source: whois.rawSource,
      },
      registrar: whois.registrar,
      robots_url: robotsUrl,
      robots_found: robotsResponse.ok,
      llms_txt_url: llmsTxtUrl,
      llms_txt_status: llmsTxtResponse.status,
      llms_txt_conflict_rule: llmsTxtConflict.rule,
      llms_txt_conflict_agent: llmsTxtConflict.agent,
      sitemap_urls: sitemapCrawl.visited,
    },
  };
}

function createQuickResponse(inputUrl: string, siteUrl: string, finalUrl: string): SiteProfileResponse {
  return {
    ...createEmptyFullResponse(inputUrl, siteUrl, finalUrl),
    phase: 'quick',
    loading_text: 'Анализируем профиль...',
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; phase?: Phase };
    const rawUrl = (body.url || '').trim();
    const phase = body.phase === 'full' ? 'full' : 'quick';

    if (!rawUrl) {
      return NextResponse.json({ ok: false, error: 'Неверный URL' }, { status: 400 });
    }

    let normalized: URL;
    try {
      normalized = normalizeInputUrl(rawUrl);
    } catch {
      return NextResponse.json({ ok: false, error: 'Неверный URL' }, { status: 400 });
    }

    if (phase === 'quick') {
      const homepage = await fetchText(normalized.origin);
      if (!homepage.text) {
        return NextResponse.json(
          { ok: false, error: 'Не удалось получить главную страницу сайта', reason: homepage.error || 'fetch_error' },
          { status: 502 }
        );
      }

      return NextResponse.json(createQuickResponse(rawUrl, normalized.origin, homepage.finalUrl), {
        status: 200,
      });
    }

    const payload = await buildFullProfile(rawUrl);
    if (!payload.ok) {
      return NextResponse.json(payload, { status: 502 });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
