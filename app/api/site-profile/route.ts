import { createConnection } from 'node:net';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const LLM_RELAY_URL = (process.env.LLM_RELAY_URL || '').replace(/\/+$/, '');
const LLM_RELAY_SECRET = process.env.LLM_RELAY_SECRET || '';
const FETCH_TIMEOUT_MS = 15_000;
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

type DetailSection = {
  section: string;
  count: number;
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
    analytics: {
      yandex: boolean;
      google: boolean;
      vk: boolean;
      facebook: boolean;
    };
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
    sitemap_urls: string[];
  };
  error?: string;
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
      analytics: {
        yandex: false,
        google: false,
        vk: false,
        facebook: false,
      },
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

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<TextFetchResult> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
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
  const htmlLower = html.toLowerCase();
  const hasBitrix =
    /bitrix/i.test(server) ||
    /bitrix/i.test(poweredBy) ||
    htmlLower.includes('/bitrix/') ||
    htmlLower.includes('bx.setcsslist') ||
    headers.has('x-powered-cms');

  const hasWordPress =
    htmlLower.includes('wp-content') ||
    htmlLower.includes('wp-includes') ||
    htmlLower.includes('content="wordpress') ||
    headers.has('x-pingback');

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
    (hasShopify && 'Shopify') ||
    (hasTilda && 'Тильда') ||
    null;

  const frontendLayer = hasNext ? 'Next.js' : hasReact ? 'React' : hasSpaShell ? 'SPA' : null;

  if (primaryCms && frontendLayer) {
    return `${primaryCms} + ${frontendLayer}`;
  }

  if (primaryCms) return primaryCms;
  if (hasNext) return 'Next.js';
  if (hasReact) return 'React';
  if (hasSpaShell) return 'SPA';

  return 'Другой';
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

    const response = await fetchText(sitemapUrl);
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

function analyzeCommercialSignals(pages: PageDoc[]) {
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

  const critical = [
    buildSignal('Телефон', phoneFound, 'Телефон найден', 'Телефон не найден'),
    buildSignal('Цены', pricesFound, 'Цены найдены', 'Цены не найдены'),
    buildSignal('Корзина', cartFound, 'Корзина найдена', 'Корзина не найдена'),
    buildSignal('Форма заявки', formFound, 'Форма заявки найдена', 'Форма заявки не найдена'),
  ];
  const important = [
    buildSignal('Реквизиты', requisitesFound, 'Реквизиты найдены', 'Реквизиты не найдены'),
    buildSignal('Адрес', addressFound, 'Адрес найден', 'Адрес не найден'),
    buildSignal('Email', emailFound, 'Email найден', 'Email не найден'),
    buildSignal('Отзывы', reviewsFound, 'Отзывы найдены', 'Отзывы не найдены'),
  ];
  const additional = [
    buildSignal('Чат виджет', chatFound, 'Чат найден', 'Чат не найден'),
    buildSignal('Мессенджеры', messengerFound, 'Мессенджеры найдены', 'Мессенджеры не найдены'),
  ];

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
  commerce: SiteProfileResponse['commerce'];
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
    input.commerce.critical.items.find((item) => item.label === 'Корзина')?.status === 'ok' ||
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
    input.commerce.critical.items.find((item) => item.label === 'Форма заявки')?.status === 'ok'
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
  const region = regionMatch?.match(cityRegex)?.[1] || 'не удалось определить';

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
  if (input.structure.yandex_index === 'не удалось получить' || input.structure.google_index === 'не удалось получить') {
    gaps.push('данные индекса недоступны');
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
  whois: {
    ageYears: number | null;
    registrar: string;
  };
}) {
  const result =
    (await callRelayJson<{ summary?: string }>('/api/site-profile/summarize', input)) ||
    (await callLlmJson<{ summary?: string }>(
      SITE_PROFILE_SUMMARY_PROMPT,
      JSON.stringify(
        {
          required_field: 'summary',
          input,
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
  const selected = links.slice(0, 3);
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
  const robotsResponse = await fetchText(robotsUrl);
  const sitemapCandidates = robotsResponse.text
    ? parseRobotsSitemapUrls(robotsResponse.text, finalSiteUrl)
    : [];
  const sitemapUrls = sitemapCandidates.length ? sitemapCandidates : [`${finalSiteUrl}/sitemap.xml`];
  const sitemapCrawl = await crawlSitemaps(sitemapUrls);
  const structureSummary = buildStructureSummary(sitemapCrawl.entries);
  const cms = detectCms(homeResponse.text, homeResponse.headers);
  const { analytics, scripts } = detectAnalytics(homeResponse.text);
  const commerce = analyzeCommercialSignals(pageDocs);
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
      sitemap_url: sitemapUrls[0] || null,
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
    commerce,
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

  const searchSignals = await fetchSearchSignals(finalHostname);

  const structure: SiteProfileResponse['structure'] = {
    sitemap_found: sitemapCrawl.entries.length > 0,
    sitemap_url: sitemapUrls[0] || null,
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
    analytics,
  };

  const verdictText = await summarizeProfileWithLlm({
    classification,
    structure,
    commerce,
    technical,
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
          { ok: false, error: 'Не удалось получить главную страницу сайта' },
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
