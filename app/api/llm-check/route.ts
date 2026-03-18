import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db/drizzle';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import { llmChecks } from '@/lib/db/schema';

export const runtime = 'nodejs';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const defaultAgents = ['gptbot', 'claudebot', 'perplexitybot'];

type Snapshot = {
  http_code: number;
  text_len: number;
  links_count: number;
  has_h1: boolean;
  has_title: boolean;
  access_state?: string | null;
};

type LlmPayload = {
  ok: boolean;
  url: string;
  checked_at: string;
  checks: Record<string, Snapshot>;
  agents?: Record<string, { key: string; label: string; ua: string }>;
  ai_readiness?: unknown;
};

type CardStatus = 'ok' | 'warn' | 'fail' | 'na';

type PageTypeKey =
  | 'home'
  | 'article'
  | 'product'
  | 'category'
  | 'service'
  | 'faq'
  | 'docs'
  | 'search'
  | 'unknown';

type PageTypeInfo = {
  key: PageTypeKey;
  label: string;
  reason: string;
};

type ReadinessCard = {
  status: CardStatus;
  value: string;
  description: string;
};

type SchemaPriorityDetails = {
  critical: { matched: string[]; total: number; tracked: string[] };
  important: { matched: string[]; total: number; tracked: string[] };
  basic: { matched: string[]; total: number; tracked: string[] };
};

type ContentCheck = {
  status: CardStatus;
  value: string;
  description: string;
};

type ContentDetails = {
  passed_checks: number;
  total_checks: number;
  checks: {
    h1: ContentCheck;
    meta_description: ContentCheck;
    heading_structure: ContentCheck;
    content_volume: ContentCheck;
    lists: ContentCheck;
    tables: ContentCheck;
    publication_date: ContentCheck;
    author: ContentCheck;
    open_graph: ContentCheck;
    page_language: ContentCheck;
    canonical: ContentCheck;
  };
};

type AiReadiness = {
  verdict: CardStatus;
  summary: string;
  page_type: PageTypeInfo;
  cards: {
    availability: ReadinessCard;
    schema: ReadinessCard;
    faq: ReadinessCard;
    content: ReadinessCard;
  };
  details: {
    schema_types: string[];
    schema_priorities: SchemaPriorityDetails;
    faq_signals: string[];
    headings: { h1: number; h2: number; h3: number };
    text_to_html_ratio: number;
    word_count: number;
    hidden_main_content: boolean;
    content: ContentDetails;
  };
};

type FetchTextResult = {
  ok: boolean;
  status: number;
  text: string;
  final_url: string;
};

const schemaPriorityMap = {
  critical: [
    'FAQPage',
    'QAPage',
    'Product',
    'Offer',
    'AggregateOffer',
    'Article',
    'NewsArticle',
    'BlogPosting',
    'LocalBusiness',
    'HowTo',
    'Review',
    'AggregateRating',
  ],
  important: [
    'Organization',
    'Person',
    'WebSite',
    'WebPage',
    'WebApplication',
    'Service',
    'Event',
    'VideoObject',
    'ImageObject',
  ],
  basic: ['BreadcrumbList', 'ListItem', 'SiteLinksSearchBox', 'SearchAction'],
} as const;

const pageTypeLabels: Record<PageTypeKey, string> = {
  home: 'Главная',
  article: 'Статья',
  product: 'Товар',
  category: 'Категория',
  service: 'Услуга / лендинг',
  faq: 'FAQ / help',
  docs: 'Документация',
  search: 'Поиск / выдача',
  unknown: 'Неопределённый тип',
};

function makeNaCheck(description: string, value = 'Не требуется'): ContentCheck {
  return {
    status: 'na',
    value,
    description,
  };
}

function classifyPageType(
  pageUrl: string,
  finalUrl: string,
  html: string,
  schemaTypes: string[],
  faqSignals: string[]
): PageTypeInfo {
  let parsed: URL | null = null;

  try {
    parsed = new URL(finalUrl || pageUrl);
  } catch {
    try {
      parsed = new URL(pageUrl);
    } catch {
      parsed = null;
    }
  }

  const pathname = (parsed?.pathname || '/').toLowerCase();
  const search = (parsed?.search || '').toLowerCase();
  const normalizedSchema = new Set(schemaTypes.map((type) => type.toLowerCase()));

  if (pathname === '/' || pathname === '') {
    return { key: 'home', label: pageTypeLabels.home, reason: 'Определено по корню сайта.' };
  }

  if (
    /\/search\b|\/results\b|\/find\b|\/poisk\b/.test(pathname) ||
    /[?&](q|query|search|s)=/.test(search)
  ) {
    return { key: 'search', label: pageTypeLabels.search, reason: 'Определено по URL поиска.' };
  }

  if (
    normalizedSchema.has('faqpage') ||
    normalizedSchema.has('qapage') ||
    /\/faq\b|\/help\b|\/question\b|\/answer\b|\/voprosy-otvety\b|\/dwqa-/.test(pathname) ||
    faqSignals.length >= 2
  ) {
    return { key: 'faq', label: pageTypeLabels.faq, reason: 'Определено по FAQ-сигналам и URL.' };
  }

  if (
    /\/docs\b|\/documentation\b|\/guide\b|\/manual\b|\/reference\b|\/knowledge-base\b/.test(pathname)
  ) {
    return { key: 'docs', label: pageTypeLabels.docs, reason: 'Определено по URL документации.' };
  }

  if (
    normalizedSchema.has('article') ||
    normalizedSchema.has('newsarticle') ||
    normalizedSchema.has('blogposting') ||
    /\/blog\b|\/news\b|\/article\b|\/post\b|\/stati\b|\/novosti\b/.test(pathname) ||
    (/<article\b/i.test(html) &&
      (/(datepublished|article:published_time)/i.test(html) || /rel=["'][^"']*author/i.test(html)))
  ) {
    return { key: 'article', label: pageTypeLabels.article, reason: 'Определено по article-сигналам.' };
  }

  if (
    normalizedSchema.has('product') ||
    normalizedSchema.has('offer') ||
    normalizedSchema.has('aggregateoffer') ||
    /\/product\b|\/products\b|\/shop\b|\/tovar\b|\/buy\b/.test(pathname) ||
    (/(₽|руб\.?|price|цена)/i.test(html) && /(add to cart|в корзину|купить|заказать)/i.test(html))
  ) {
    return { key: 'product', label: pageTypeLabels.product, reason: 'Определено по товарным сигналам.' };
  }

  if (
    /\/catalog\b|\/category\b|\/categories\b|\/collection\b|\/tag\b/.test(pathname)
  ) {
    return { key: 'category', label: pageTypeLabels.category, reason: 'Определено по URL раздела.' };
  }

  if (
    normalizedSchema.has('service') ||
    /\/service\b|\/services\b|\/uslugi\b|\/solution\b|\/landing\b/.test(pathname)
  ) {
    return { key: 'service', label: pageTypeLabels.service, reason: 'Определено по service-сигналам.' };
  }

  return { key: 'unknown', label: pageTypeLabels.unknown, reason: 'Не удалось надёжно определить тип страницы.' };
}

function deriveLlmCheckSummary(payload: LlmPayload) {
  const checks = payload?.checks;
  const browser = checks?.browser;

  if (!checks || !browser) {
    return {
      verdict: 'error',
      reasons: ['missing_checks'],
    };
  }

  const reasons: string[] = [];

  for (const [agentKey, snap] of Object.entries(checks)) {
    if (agentKey === 'browser' || !snap) continue;

    if (snap.http_code !== browser.http_code) reasons.push(`${agentKey}:http_code`);
    if (snap.text_len !== browser.text_len) reasons.push(`${agentKey}:text_len`);
    if (snap.links_count !== browser.links_count) reasons.push(`${agentKey}:links_count`);
    if (snap.has_h1 !== browser.has_h1) reasons.push(`${agentKey}:has_h1`);
    if (snap.has_title !== browser.has_title) reasons.push(`${agentKey}:has_title`);
    if ((snap.access_state || 'ok') !== (browser.access_state || 'ok')) {
      reasons.push(`${agentKey}:access_state`);
    }
  }

  return {
    verdict: reasons.length ? 'mismatch' : 'ok',
    reasons,
  };
}

async function fetchText(url: string): Promise<FetchTextResult> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      cache: 'no-store',
    });

    return {
      ok: response.ok,
      status: response.status,
      text: await response.text(),
      final_url: response.url,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      text: '',
      final_url: '',
    };
  }
}

function stripHtml(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function countTag(html: string, tag: 'h1' | 'h2' | 'h3') {
  const matches = html.match(new RegExp(`<${tag}\\b`, 'gi'));
  return matches ? matches.length : 0;
}

function extractSchemaTypesFromNode(node: unknown, types: Set<string>) {
  if (!node) return;

  if (Array.isArray(node)) {
    node.forEach((item) => extractSchemaTypesFromNode(item, types));
    return;
  }

  if (typeof node !== 'object') return;

  const value = node as Record<string, unknown>;
  const typeValue = value['@type'];

  if (typeof typeValue === 'string') {
    types.add(typeValue);
  } else if (Array.isArray(typeValue)) {
    typeValue.forEach((item) => {
      if (typeof item === 'string') types.add(item);
    });
  }

  Object.values(value).forEach((child) => extractSchemaTypesFromNode(child, types));
}

function extractSchemaTypes(html: string) {
  const types = new Set<string>();
  const regex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(regex)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      extractSchemaTypesFromNode(JSON.parse(raw), types);
    } catch {
      continue;
    }
  }

  return Array.from(types);
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

function extractTagText(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeHtmlEntities(stripHtml(match?.[1] || ''));
}

function extractMetaContent(html: string, attr: 'name' | 'property', value: string) {
  const regex = new RegExp(
    `<meta\\b[^>]*${attr}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*content=["']([^"']*)["'][^>]*>`,
    'i'
  );
  const reverseRegex = new RegExp(
    `<meta\\b[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'i'
  );

  return decodeHtmlEntities(html.match(regex)?.[1] || html.match(reverseRegex)?.[1] || '');
}

function extractCanonicalUrl(html: string, baseUrl: string) {
  const href =
    html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i)?.[1] ||
    '';

  if (!href) return '';

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function extractHtmlLang(html: string) {
  return html.match(/<html\b[^>]*lang=["']([^"']+)["']/i)?.[1]?.trim() || '';
}

function countMatches(html: string, regex: RegExp) {
  return html.match(regex)?.length || 0;
}

function normalizeComparableUrl(value: string) {
  try {
    const parsed = new URL(value);
    parsed.hash = '';
    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function tokenizeComparableText(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

function textsMatchByTopic(first: string, second: string) {
  if (!first || !second) return false;

  const firstTokens = tokenizeComparableText(first);
  const secondTokens = tokenizeComparableText(second);

  if (!firstTokens.size || !secondTokens.size) return false;

  let overlap = 0;
  for (const token of firstTokens) {
    if (secondTokens.has(token)) overlap += 1;
  }

  return overlap >= Math.min(2, firstTokens.size, secondTokens.size);
}

function collectJsonLdNodes(html: string) {
  const nodes: unknown[] = [];
  const regex =
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(regex)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      nodes.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }

  return nodes;
}

function findSchemaString(nodes: unknown[], fieldName: string): string | null {
  const visit = (node: unknown): string | null => {
    if (!node) return null;
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }

    if (typeof node !== 'object') return null;

    const value = node as Record<string, unknown>;
    const direct = value[fieldName];

    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    if (typeof direct === 'object' && direct) {
      const nestedName = (direct as Record<string, unknown>).name;
      if (typeof nestedName === 'string' && nestedName.trim()) {
        return nestedName.trim();
      }
    }

    for (const child of Object.values(value)) {
      const found = visit(child);
      if (found) return found;
    }

    return null;
  };

  for (const node of nodes) {
    const found = visit(node);
    if (found) return found;
  }

  return null;
}

function buildSchemaPriorityDetails(schemaTypes: string[]): SchemaPriorityDetails {
  const schemaSet = new Set(schemaTypes);

  return {
    critical: {
      matched: schemaPriorityMap.critical.filter((item) => schemaSet.has(item)),
      total: schemaPriorityMap.critical.length,
      tracked: [...schemaPriorityMap.critical],
    },
    important: {
      matched: schemaPriorityMap.important.filter((item) => schemaSet.has(item)),
      total: schemaPriorityMap.important.length,
      tracked: [...schemaPriorityMap.important],
    },
    basic: {
      matched: schemaPriorityMap.basic.filter((item) => schemaSet.has(item)),
      total: schemaPriorityMap.basic.length,
      tracked: [...schemaPriorityMap.basic],
    },
  };
}

function detectFaqSignals(html: string, schemaTypes: string[]) {
  const signals: string[] = [];

  if (schemaTypes.includes('FAQPage')) {
    signals.push('schema_faqpage');
  }

  if (/<details\b[^>]*>[\s\S]*?<summary\b/gi.test(html)) {
    signals.push('details_summary');
  }

  if (/class=["'][^"']*(faq|question|answer)[^"']*["']/gi.test(html)) {
    signals.push('faq_classes');
  }

  const h3ParagraphMatches = html.match(
    /<h3\b[^>]*>[\s\S]*?<\/h3>\s*<p\b[^>]*>[\s\S]*?<\/p>/gi
  );
  if ((h3ParagraphMatches?.length || 0) >= 2) {
    signals.push('h3_plus_p_pattern');
  }

  return signals;
}

function hasHiddenMainContent(html: string) {
  return /<(main|article|section|div)\b[^>]*(?:id|class)=["'][^"']*(content|main|article|post|entry)[^"']*["'][^>]*(?:style=["'][^"']*display\s*:\s*none[^"']*["']|hidden)/gi.test(
    html
  );
}

function buildAvailabilityCard(payload: LlmPayload): ReadinessCard {
  const checks = payload.checks || {};
  const botEntries = Object.entries(checks).filter(([key]) => key !== 'browser');

  const blocked = botEntries.filter(([, snap]) => {
    const access = snap.access_state || 'ok';
    return snap.http_code !== 200 || access !== 'ok';
  });

  if (!blocked.length) {
    return {
      status: 'ok',
      value: 'OK',
      description: `Все AI-боты получают страницу: ${botEntries.length} из ${botEntries.length}.`,
    };
  }

  return {
    status: 'fail',
    value: `${blocked.length}`,
    description:
      blocked.length === 1
        ? 'Один AI-бот не получает страницу.'
        : `${blocked.length} AI-ботов не получают страницу.`,
  };
}

function buildSchemaCard(
  schemaPriorityDetails: SchemaPriorityDetails,
  pageType: PageTypeInfo
): ReadinessCard {
  const foundCount =
    schemaPriorityDetails.critical.matched.length +
    schemaPriorityDetails.important.matched.length +
    schemaPriorityDetails.basic.matched.length;
  const totalCount =
    schemaPriorityDetails.critical.total +
    schemaPriorityDetails.important.total +
    schemaPriorityDetails.basic.total;
  const criticalSet = new Set(schemaPriorityDetails.critical.matched);
  const importantSet = new Set(schemaPriorityDetails.important.matched);
  const basicSet = new Set(schemaPriorityDetails.basic.matched);

  const hasArticleSchema = ['Article', 'NewsArticle', 'BlogPosting'].some((item) =>
    criticalSet.has(item)
  );
  const hasProductSchema = ['Product', 'Offer', 'AggregateOffer'].some((item) =>
    criticalSet.has(item)
  );
  const hasFaqSchema = ['FAQPage', 'QAPage'].some((item) => criticalSet.has(item));
  const hasServiceSchema = importantSet.has('Service');
  const hasHomeSchema =
    importantSet.has('WebSite') || importantSet.has('Organization') || importantSet.has('WebPage');
  const hasNavigationSchema = basicSet.has('BreadcrumbList') || basicSet.has('ListItem');

  if (pageType.key === 'article') {
    return hasArticleSchema
      ? {
          status: 'ok',
          value: `${foundCount} из ${totalCount}`,
          description: 'Для статьи найдена релевантная schema.org разметка.',
        }
      : {
          status: foundCount ? 'warn' : 'fail',
          value: foundCount ? `${foundCount} из ${totalCount}` : 'Нет',
          description: 'Для статьи не найдена Article / NewsArticle / BlogPosting schema.',
        };
  }

  if (pageType.key === 'product') {
    return hasProductSchema
      ? {
          status: 'ok',
          value: `${foundCount} из ${totalCount}`,
          description: 'Для товарной страницы найдена релевантная schema.org разметка.',
        }
      : {
          status: foundCount ? 'warn' : 'fail',
          value: foundCount ? `${foundCount} из ${totalCount}` : 'Нет',
          description: 'Для товарной страницы не найдена Product / Offer schema.',
        };
  }

  if (pageType.key === 'faq') {
    return hasFaqSchema
      ? {
          status: 'ok',
          value: `${foundCount} из ${totalCount}`,
          description: 'Для FAQ-страницы найдена релевантная schema.org разметка.',
        }
      : {
          status: foundCount ? 'warn' : 'fail',
          value: foundCount ? `${foundCount} из ${totalCount}` : 'Нет',
          description: 'Для FAQ-страницы не найдена FAQPage / QAPage schema.',
        };
  }

  if (pageType.key === 'service') {
    if (hasServiceSchema || hasHomeSchema || hasNavigationSchema) {
      return {
        status: 'ok',
        value: `${foundCount} из ${totalCount}`,
        description: 'Для лендинга или услуги базовая schema.org разметка найдена.',
      };
    }

    return {
      status: 'na',
      value: 'Опционально',
      description: 'Для этого типа страницы schema полезна, но не обязательна.',
    };
  }

  if (pageType.key === 'home' || pageType.key === 'category' || pageType.key === 'search') {
    if (hasHomeSchema || hasNavigationSchema || foundCount) {
      return {
        status: 'ok',
        value: `${foundCount} из ${totalCount}`,
        description: 'Базовая schema.org разметка найдена.',
      };
    }

    return {
      status: 'na',
      value: 'Опционально',
      description: 'Для этого типа страницы schema не обязательна.',
    };
  }

  if (!foundCount) {
    return {
      status: 'na',
      value: 'Опционально',
      description: 'Релевантная schema.org разметка для этого типа страницы не обязательна.',
    };
  }

  return {
    status: 'ok',
    value: `${foundCount} из ${totalCount}`,
    description: 'На странице найдена schema.org разметка.',
  };
}

function buildFaqCard(signals: string[], pageType: PageTypeInfo): ReadinessCard {
  if (!signals.length) {
    if (pageType.key === 'faq') {
      return {
        status: 'fail',
        value: 'Нет',
        description: 'Для FAQ-страницы не найдена FAQ-структура.',
      };
    }

    if (pageType.key === 'docs') {
      return {
        status: 'warn',
        value: 'Нет',
        description: 'Для документации FAQ может усилить ответы AI, но структура не найдена.',
      };
    }

    return {
      status: 'na',
      value: 'Не требуется',
      description: 'Для этого типа страницы FAQ-структура не обязательна.',
    };
  }

  return {
    status: 'ok',
    value: 'Найдена',
    description: `Найдено сигналов FAQ: ${signals.length}.`,
  };
}

function buildContentCard(
  html: string,
  text: string,
  pageUrl: string,
  finalUrl: string,
  pageType: PageTypeInfo
): {
  card: ReadinessCard;
  details: AiReadiness['details'];
} {
  const h1 = countTag(html, 'h1');
  const h2 = countTag(html, 'h2');
  const h3 = countTag(html, 'h3');
  const h1Text = extractTagText(html, 'h1');
  const title = extractTagText(html, 'title');
  const metaDescription = extractMetaContent(html, 'name', 'description');
  const listsCount = countMatches(html, /<(ul|ol)/gi);
  const tablesCount = countMatches(html, /<table/gi);
  const htmlLang = extractHtmlLang(html);
  const ogTitle = extractMetaContent(html, 'property', 'og:title');
  const ogDescription = extractMetaContent(html, 'property', 'og:description');
  const ogImage = extractMetaContent(html, 'property', 'og:image');
  const schemaNodes = collectJsonLdNodes(html);
  const publishedDate =
    findSchemaString(schemaNodes, 'datePublished') ||
    extractMetaContent(html, 'property', 'article:published_time') ||
    extractMetaContent(html, 'name', 'article:published_time');
  const authorValue =
    findSchemaString(schemaNodes, 'author') ||
    (/<a[^>]*rel=["'][^"']*author[^"']*["']/i.test(html) ? 'rel=author' : '');
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const textToHtmlRatio = html.length ? Number((text.length / html.length).toFixed(2)) : 0;
  const hiddenMainContent = hasHiddenMainContent(html);
  const canonicalUrl = extractCanonicalUrl(html, finalUrl || pageUrl);
  const canonicalMatch =
    canonicalUrl &&
    normalizeComparableUrl(canonicalUrl) === normalizeComparableUrl(finalUrl || pageUrl);

  const articleLike = pageType.key === 'article';
  const docsLike = pageType.key === 'docs';
  const searchLike = pageType.key === 'search';
  const structuredContentExpected = articleLike || docsLike || pageType.key === 'faq';
  const listHelpful = articleLike || docsLike || pageType.key === 'faq';
  const tableHelpful = docsLike || articleLike || pageType.key === 'product' || pageType.key === 'category';

  const contentChecks: ContentDetails['checks'] = {
    h1:
      h1 === 0
        ? {
            status: 'fail',
            value: 'Нет',
            description: 'H1 отсутствует.',
          }
        : h1 !== 1
          ? {
              status: 'warn',
              value: `${h1} шт`,
              description: `Найдено ${h1} H1, лучше оставить один.`,
            }
          : title && textsMatchByTopic(h1Text, title)
            ? {
                status: 'ok',
                value: 'Есть',
                description: 'Есть один H1, он совпадает с темой страницы.',
              }
            : {
                status: 'warn',
                value: 'Есть',
                description: 'H1 найден, но не совпадает с title.',
              },
    meta_description:
      !metaDescription
        ? {
            status: 'fail',
            value: 'Нет',
            description: 'Description отсутствует.',
          }
        : metaDescription.length >= 120 && metaDescription.length <= 160
          ? {
              status: 'ok',
              value: `${metaDescription.length} симв.`,
              description: 'Description найден, длина в норме.',
            }
          : {
              status: 'warn',
              value: `${metaDescription.length} симв.`,
              description: 'Description есть, но длина вне диапазона 120–160.',
            },
    heading_structure:
      hiddenMainContent || h1 === 0 || (h3 > 0 && h2 === 0)
        ? {
            status: 'fail',
            value: `H2: ${h2}, H3: ${h3}`,
            description: hiddenMainContent
              ? 'Основной контент скрыт или нечитаем для AI.'
              : 'Заголовки отсутствуют или иерархия нарушена.',
          }
        : h2 === 0 && h3 === 0
          ? structuredContentExpected
            ? {
                status: 'warn',
                value: `H2: ${h2}, H3: ${h3}`,
                description: 'Есть только H1, без H2/H3.',
              }
            : makeNaCheck('Для этого типа страницы расширенная иерархия H2/H3 не обязательна.', `H2: ${h2}, H3: ${h3}`)
          : {
              status: 'ok',
              value: `H2: ${h2}, H3: ${h3}`,
              description: 'Есть логичная иерархия заголовков.',
            },
    content_volume:
      searchLike
        ? makeNaCheck('Для страницы поиска объём основного текста не является обязательным.', `${wordCount} слов`)
        : wordCount < 300
          ? {
              status: 'fail',
              value: `${wordCount} слов`,
              description: 'Менее 300 слов — для AI этого мало.',
            }
          : wordCount <= 500
            ? {
                status: 'warn',
                value: `${wordCount} слов`,
                description: '300–500 слов — достаточно, но можно больше.',
              }
            : {
                status: 'ok',
                value: `${wordCount} слов`,
                description: 'Более 500 слов — хороший объём.',
              },
    lists:
      listsCount > 0
        ? {
            status: 'ok',
            value: `${listsCount} шт`,
            description: 'Списки найдены.',
          }
        : listHelpful
          ? {
              status: 'warn',
              value: 'Нет',
              description: 'Списков нет — можно усилить структуру.',
            }
          : makeNaCheck('Для этого типа страницы списки не обязательны.'),
    tables:
      tablesCount > 0
        ? {
            status: 'ok',
            value: `${tablesCount} шт`,
            description: 'Таблицы с данными найдены.',
          }
        : tableHelpful
          ? {
              status: 'warn',
              value: 'Нет',
              description: 'Таблицы не найдены.',
            }
          : makeNaCheck('Для этого типа страницы таблицы не обязательны.'),
    publication_date:
      publishedDate
        ? {
            status: 'ok',
            value: publishedDate,
            description: 'Дата публикации найдена.',
          }
        : articleLike
          ? {
              status: 'warn',
              value: 'Нет',
              description: 'Для статьи дата публикации не найдена.',
            }
          : docsLike
            ? {
                status: 'warn',
                value: 'Нет',
                description: 'Для документации дата обновления может быть полезна, но не найдена.',
              }
            : makeNaCheck('Для этого типа страницы дата публикации не обязательна.'),
    author:
      authorValue
        ? {
            status: 'ok',
            value: authorValue,
            description: 'Автор указан.',
          }
        : articleLike
          ? {
              status: 'warn',
              value: 'Нет',
              description: 'Для статьи автор не указан — E-E-A-T сигнал слабее.',
            }
          : docsLike
            ? {
                status: 'warn',
                value: 'Нет',
                description: 'Для документации автор или владелец раздела не указан.',
              }
            : makeNaCheck('Для этого типа страницы автор не обязателен.'),
    open_graph: (() => {
      const foundOgTags = [
        ogTitle ? 'og:title' : null,
        ogDescription ? 'og:description' : null,
        ogImage ? 'og:image' : null,
      ].filter(Boolean) as string[];

      if (!foundOgTags.length) {
        return searchLike
          ? makeNaCheck('Для этой страницы Open Graph не обязателен.')
          : {
              status: 'fail' as const,
              value: 'Нет',
              description: 'Open Graph отсутствует.',
            };
      }

      if (foundOgTags.length === 3) {
        return {
          status: 'ok' as const,
          value: 'Все теги',
          description: 'Найдены og:title, og:description и og:image.',
        };
      }

      return {
        status: 'warn' as const,
        value: `${foundOgTags.length} из 3`,
        description: `Найдены: ${foundOgTags.join(', ')}.`,
      };
    })(),
    page_language:
      htmlLang
        ? {
            status: 'ok',
            value: htmlLang,
            description: 'Атрибут lang указан.',
          }
        : {
            status: 'warn',
            value: 'Нет',
            description: 'Атрибут lang не указан.',
          },
    canonical:
      !canonicalUrl
        ? {
            status: 'fail',
            value: 'Нет',
            description: 'Canonical отсутствует.',
          }
        : canonicalMatch
          ? {
              status: 'ok',
              value: 'OK',
              description: 'Canonical совпадает с текущим URL.',
            }
          : {
              status: 'warn',
              value: canonicalUrl,
              description: 'Canonical указывает на другую страницу.',
            },
  };

  const applicableChecks = Object.values(contentChecks).filter((check) => check.status !== 'na');
  const passedChecks = applicableChecks.filter((check) => check.status === 'ok').length;
  const totalChecks = applicableChecks.length;
  const hasFail = applicableChecks.some((check) => check.status === 'fail');
  const hasWarn = applicableChecks.some((check) => check.status === 'warn');

  const card: ReadinessCard =
    hasFail && passedChecks <= Math.max(1, Math.floor(totalChecks / 2))
      ? {
          status: 'fail',
          value: `${passedChecks} из ${totalChecks}`,
          description: 'Есть критичные пробелы в сигналах страницы для AI.',
        }
      : hasFail || hasWarn
        ? {
            status: 'warn',
            value: `${passedChecks} из ${totalChecks}`,
            description: 'Есть риски — часть релевантных сигналов нужно усилить.',
          }
        : {
            status: 'ok',
            value: `${passedChecks} из ${totalChecks}`,
            description: 'Релевантные для этого типа страницы AI-сигналы в норме.',
          };

  return {
    card,
    details: {
      schema_types: [],
      schema_priorities: {
        critical: {
          matched: [],
          total: schemaPriorityMap.critical.length,
          tracked: [...schemaPriorityMap.critical],
        },
        important: {
          matched: [],
          total: schemaPriorityMap.important.length,
          tracked: [...schemaPriorityMap.important],
        },
        basic: {
          matched: [],
          total: schemaPriorityMap.basic.length,
          tracked: [...schemaPriorityMap.basic],
        },
      },
      faq_signals: [],
      headings: { h1, h2, h3 },
      text_to_html_ratio: textToHtmlRatio,
      word_count: wordCount,
      hidden_main_content: hiddenMainContent,
      content: {
        passed_checks: passedChecks,
        total_checks: totalChecks,
        checks: contentChecks,
      },
    },
  };
}

async function buildAiReadiness(payload: LlmPayload): Promise<AiReadiness> {
  const page = await fetchText(payload.url);
  const html = page.text || '';
  const text = stripHtml(html);
  const schemaTypes = extractSchemaTypes(html);
  const schemaPriorityDetails = buildSchemaPriorityDetails(schemaTypes);
  const faqSignals = detectFaqSignals(html, schemaTypes);
  const pageType = classifyPageType(payload.url, page.final_url || payload.url, html, schemaTypes, faqSignals);
  const { card: contentCard, details } = buildContentCard(
    html,
    text,
    payload.url,
    page.final_url || payload.url,
    pageType
  );

  const availabilityCard = buildAvailabilityCard(payload);
  const schemaCard = buildSchemaCard(schemaPriorityDetails, pageType);
  const faqCard = buildFaqCard(faqSignals, pageType);

  const cards = {
    availability: availabilityCard,
    schema: schemaCard,
    faq: faqCard,
    content: contentCard,
  };

  const evaluationCards = Object.values(cards).filter((card) => card.status !== 'na');
  const hasFail = evaluationCards.some((card) => card.status === 'fail');
  const hasWarn = evaluationCards.some((card) => card.status === 'warn');

  return {
    verdict: hasFail ? 'fail' : hasWarn ? 'warn' : 'ok',
    summary:
      hasFail || hasWarn
        ? 'Есть проблемы с AI-готовностью'
        : 'Страница готова к AI-поиску',
    page_type: pageType,
    cards,
    details: {
      ...details,
      schema_types: schemaTypes,
      schema_priorities: schemaPriorityDetails,
      faq_signals: faqSignals,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      url?: string;
      a1?: string;
      a2?: string;
      a3?: string;
    };
    const url = (body.url || '').trim();
    const a1 = (body.a1 || defaultAgents[0]).trim();
    const a2 = (body.a2 || defaultAgents[1]).trim();
    const a3 = (body.a3 || defaultAgents[2]).trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: 'Неверный URL' }, { status: 400 });
    }

    const baseEngine = process.env.PY_LLM_ENGINE_URL || process.env.PY_ENGINE_URL;
    if (!baseEngine) {
      return NextResponse.json({ ok: false, error: 'PY_ENGINE_URL не задан' }, { status: 500 });
    }

    const engineUrl = baseEngine.includes('llm_check.py')
      ? baseEngine
      : baseEngine.replace('check.py', 'llm_check.py');

    const query = new URLSearchParams({ url, a1, a2, a3 });
    const target = engineUrl.includes('?')
      ? `${engineUrl}&${query.toString()}`
      : `${engineUrl}?${query.toString()}`;

    const upstream = await fetch(target, { method: 'GET' });
    const raw = await upstream.text();
    const contentType = upstream.headers.get('content-type') || '';

    let payloadForLog: Record<string, unknown> = { status: upstream.status };
    let verdict: string | null = null;
    let reasons: string[] | null = null;

    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LlmPayload;
        parsed.ai_readiness = await buildAiReadiness(parsed);
        payloadForLog = parsed;

        const summary = deriveLlmCheckSummary(parsed);
        verdict = summary.verdict;
        reasons = summary.reasons;

        try {
          const db = ensureDb();
          const user = await getUser();
          const userWithTeam = user ? await getUserWithTeam(user.id) : null;
          const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
          const userAgent = req.headers.get('user-agent') || null;

          await db.insert(llmChecks).values({
            teamId: userWithTeam?.teamId || null,
            userId: user?.id || null,
            url,
            verdict,
            reasons,
            details: payloadForLog,
            ipAddress: ip,
            userAgent,
          });
        } catch {
          // ignore db logging errors
        }

        if (contentType.includes('application/json')) {
          return NextResponse.json(parsed, { status: upstream.status || 502 });
        }
      } catch {
        payloadForLog = {
          status: upstream.status,
          raw: raw.length > 10000 ? `${raw.slice(0, 10000)}...` : raw,
        };
        verdict = 'error';
        reasons = ['invalid_json'];
      }
    } else {
      payloadForLog = { status: upstream.status, raw: '' };
      verdict = 'error';
      reasons = ['empty_response'];
    }

    try {
      const db = ensureDb();
      const user = await getUser();
      const userWithTeam = user ? await getUserWithTeam(user.id) : null;
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const userAgent = req.headers.get('user-agent') || null;

      await db.insert(llmChecks).values({
        teamId: userWithTeam?.teamId || null,
        userId: user?.id || null,
        url,
        verdict,
        reasons,
        details: payloadForLog,
        ipAddress: ip,
        userAgent,
      });
    } catch {
      // ignore db logging errors
    }

    if (!raw) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Пустой ответ от сервиса',
          status: upstream.status || 502,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: `Ошибка сервиса (${upstream.status || 502})`,
        status: upstream.status || 502,
        raw: raw.slice(0, 500),
      },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
