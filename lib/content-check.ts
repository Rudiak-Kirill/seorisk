import { URL } from 'node:url';

export type ContentPageType =
  | 'product'
  | 'category'
  | 'article'
  | 'informational'
  | 'home'
  | 'landing'
  | 'contacts'
  | 'unknown';
export type ContentCheckSeverity = 'critical' | 'warn' | 'improve';
export type ContentCheckVerdict = 'ok' | 'warn' | 'fail';
export type ContentCheckPhase = 'detect' | 'full';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const SECONDARY_BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0';
const FETCH_TIMEOUT_MS = 15000;
const FETCH_RETRY_TIMEOUT_MS = 25000;
const REPRESENTATIVE_MAX_SITEMAP_URLS = 120;
const REPRESENTATIVE_MAX_SITEMAP_FILES = 12;

const PAGE_TYPE_LABELS: Record<ContentPageType, string> = {
  product: 'Товар',
  category: 'Каталог',
  article: 'Статья',
  informational: 'Информационная страница',
  home: 'Главная',
  landing: 'Лендинг',
  contacts: 'Контакты',
  unknown: 'Неопределённый тип',
};

const PRODUCT_SCHEMA_TYPES = ['Product', 'Offer', 'AggregateOffer', 'Review', 'AggregateRating'];
const CATEGORY_SCHEMA_TYPES = ['ItemList', 'CollectionPage', 'OfferCatalog'];
const ARTICLE_SCHEMA_TYPES = ['Article', 'NewsArticle', 'BlogPosting'];
const CONTACT_SCHEMA_TYPES = ['Organization', 'LocalBusiness', 'PostalAddress', 'ContactPoint'];

export type ContentIssueCard = {
  severity: ContentCheckSeverity;
  title: string;
  action: string;
};

export type ContentDetailItem = {
  label: string;
  value: string;
};

export type ContentDetailGroup = {
  title: string;
  items: ContentDetailItem[];
};

export type ContentCheckResponse = {
  ok: boolean;
  phase: ContentCheckPhase;
  checked_at: string;
  input_url: string;
  final_url: string;
  page_type: {
    key: ContentPageType;
    label: string;
    confidence: number;
    reason: string;
  };
  needs_type_choice: boolean;
  type_suggestions: Array<{ key: ContentPageType; label: string }>;
  verdict: {
    status: ContentCheckVerdict;
    title: string;
    summary: string;
    passed_checks: number;
    total_checks: number;
    critical_count: number;
    important_count: number;
    improve_count: number;
  };
  issues: {
    critical: ContentIssueCard[];
    important: ContentIssueCard[];
    improve: ContentIssueCard[];
  };
  catalog_structure: {
    items_on_page: number | null;
    pagination_pages: number | null;
    infinite_scroll: boolean;
    estimated_assortment: number | null;
    minimum_items: number | null;
    note: string | null;
  };
  details: ContentDetailGroup[];
  compare_summary: {
    representative_url: string;
    page_type: string;
    critical_count: number;
    important_count: number;
    improve_count: number;
    word_count: number | null;
    content_density_percent: number | null;
    internal_links: number | null;
    content_images: number | null;
    author_found: boolean | null;
    article_schema_found: boolean | null;
    items_on_page: number | null;
    pagination_pages: number | null;
    estimated_assortment: number | null;
    infinite_scroll: boolean;
  };
  error?: string;
};

type FetchSnapshot = {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
  headers: Headers;
  error: string | null;
};

type LinkInfo = {
  href: string;
  internal: boolean;
  text: string;
  nofollow: boolean;
};

type ImageInfo = {
  src: string;
  alt: string;
  contentImage: boolean;
};

type BaseFeatures = {
  normalizedUrl: string;
  finalUrl: string;
  status: number;
  title: string;
  titleLength: number;
  description: string;
  descriptionLength: number;
  h1Text: string;
  h1Count: number;
  h2Count: number;
  h3Count: number;
  canonical: string | null;
  robotsMeta: string | null;
  ogTitle: boolean;
  ogDescription: boolean;
  ogImage: boolean;
  schemaTypes: string[];
  images: ImageInfo[];
  contentImages: ImageInfo[];
  contentImagesWithoutAlt: number;
  internalLinks: LinkInfo[];
  externalLinks: LinkInfo[];
  nofollowLinksCount: number;
  wordCount: number;
  visibleText: string;
  bodyHtml: string;
  contentDensityPercent: number;
  priceText: string | null;
  buyButtonLabel: string | null;
  formFound: boolean;
  filterFound: boolean;
  listingCards: number;
  paginationPageCount: number | null;
  paginationInfiniteScroll: boolean;
  paginationMode: 'pages' | 'infinite' | 'single';
  estimatedAssortment: number | null;
  skuFound: boolean;
  stockFound: boolean;
  specsFound: boolean;
  descriptionBlockFound: boolean;
  reviewsFound: boolean;
  ratingFound: boolean;
  breadcrumbsFound: boolean;
  relatedFound: boolean;
  deliveryFound: boolean;
  categoryDescriptionFound: boolean;
  sortingFound: boolean;
  paginationFound: boolean;
  infiniteScrollFound: boolean;
  subcategoriesFound: boolean;
  tocFound: boolean;
  readingTimeFound: boolean;
  publishedDate: string | null;
  updatedDate: string | null;
  authorFound: boolean;
  authorPhotoFound: boolean;
  authorRoleFound: boolean;
  tablesCount: number;
  listsCount: number;
  quotesCount: number;
  videosCount: number;
  codeBlocksCount: number;
  ctaFound: boolean;
  tagsFound: boolean;
  commentsFound: boolean;
  socialButtonsFound: boolean;
  mapFound: boolean;
  relatedArticlesFound: boolean;
  faqQuestionCount: number;
  teamPhotoFound: boolean;
  addressFound: boolean;
  phoneFound: boolean;
  emailFound: boolean;
  requisitesFound: boolean;
  faqFound: boolean;
  productSchemaFound: boolean;
  offerSchemaFound: boolean;
  reviewSchemaFound: boolean;
  itemListSchemaFound: boolean;
  breadcrumbSchemaFound: boolean;
  articleSchemaFound: boolean;
  authorSchemaFound: boolean;
  datePublishedSchemaFound: boolean;
};

type TypeScore = {
  key: ContentPageType;
  score: number;
  reasons: string[];
};

type AnalyzeOptions = {
  overrideType?: ContentPageType | null;
  representativeMode?: boolean;
  representativeKind?: 'default' | 'article';
};

function normalizeInputUrl(value: string) {
  const prepared = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(prepared).toString();
}

function describeFetchError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return 'timeout';
  if (error instanceof Error) return error.message || error.name || 'fetch_error';
  return String(error || 'fetch_error');
}

async function fetchWithTimeout(url: string, userAgent: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml,text/plain;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url: string): Promise<FetchSnapshot> {
  const attempts = [
    { timeoutMs: FETCH_TIMEOUT_MS, userAgent: BROWSER_UA },
    { timeoutMs: FETCH_RETRY_TIMEOUT_MS, userAgent: SECONDARY_BROWSER_UA },
  ];
  const candidates = /^https:\/\//i.test(url) ? [url, url.replace(/^https:\/\//i, 'http://')] : [url];
  let lastError: string | null = null;

  for (const candidate of candidates) {
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        const response = await fetchWithTimeout(candidate, attempt.userAgent, attempt.timeoutMs);
        return {
          ok: response.ok,
          status: response.status,
          html: await response.text(),
          finalUrl: response.url || candidate,
          headers: response.headers,
          error: null,
        };
      } catch (error) {
        lastError = describeFetchError(error);
        if (index < attempts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 800));
        }
      }
    }
  }

  return {
    ok: false,
    status: 0,
    html: '',
    finalUrl: url,
    headers: new Headers(),
    error: lastError,
  };
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
      .replace(/<!--([\s\S]*?)-->/g, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function stripNonContentBlocks(html: string) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<(header|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+(?:hidden|aria-hidden=["']true["']|style=["'][^"']*display\s*:\s*none[^"']*["'])[^>]*>[\s\S]*?<\/[^>]+>/gi, ' ');
}

function extractTagText(html: string, tag: string) {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return decodeHtmlEntities(stripHtml(match?.[1] || ''));
}

function extractMetaContent(html: string, attr: 'name' | 'property', value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const direct = new RegExp(`<meta\\b[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["'][^>]*>`, 'i');
  return decodeHtmlEntities(html.match(direct)?.[1] || html.match(reverse)?.[1] || '');
}

function extractCanonical(html: string) {
  return (
    html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["'][^>]*>/i)?.[1] ||
    null
  );
}

function collectJsonLdTypes(value: unknown, target: Set<string>) {
  if (!value) return;
  if (Array.isArray(value)) {
    value.forEach((item) => collectJsonLdTypes(item, target));
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as Record<string, unknown>;
  const typeValue = record['@type'];
  if (typeof typeValue === 'string') target.add(typeValue);
  if (Array.isArray(typeValue)) {
    typeValue.forEach((item) => {
      if (typeof item === 'string') target.add(item);
    });
  }

  Object.values(record).forEach((item) => collectJsonLdTypes(item, target));
}

function extractJsonLdTypes(html: string) {
  const types = new Set<string>();
  const matches = Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      collectJsonLdTypes(JSON.parse(raw), types);
      continue;
    } catch {
      Array.from(raw.matchAll(/"@type"\s*:\s*"([^"]+)"/g)).forEach((item) => types.add(item[1]));
    }
  }

  return Array.from(types);
}

function countMatches(text: string, pattern: RegExp) {
  return Array.from(text.matchAll(pattern)).length;
}

function countWords(text: string) {
  if (!text.trim()) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function absoluteUrl(href: string, baseUrl: string) {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractLinks(html: string, baseUrl: string) {
  const baseHost = new URL(baseUrl).hostname;
  const links: LinkInfo[] = [];

  for (const match of html.matchAll(/<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const attrs = `${match[1] || ''} ${match[3] || ''}`;
    const href = decodeHtmlEntities(match[2] || '');
    const absolute = absoluteUrl(href, baseUrl);
    if (!absolute) continue;
    links.push({
      href: absolute,
      internal: new URL(absolute).hostname === baseHost,
      text: decodeHtmlEntities(stripHtml(match[4] || '')),
      nofollow: /\brel=["'][^"']*nofollow[^"']*["']/i.test(attrs),
    });
  }

  return links;
}

function calculateContentDensityPercent(visibleText: string, html: string) {
  const textLength = visibleText.replace(/\s+/g, ' ').trim().length;
  const htmlLength = html.replace(/\s+/g, ' ').trim().length;
  if (!textLength || !htmlLength) return 0;
  return Number(((textLength / htmlLength) * 100).toFixed(1));
}

function resolveInformationalSubtype(features: BaseFeatures) {
  const path = new URL(features.finalUrl).pathname.toLowerCase();
  if (/\/contacts?\/|\/kontakty?\/|\/contact-us\/|\/support\/contacts/i.test(path)) return 'contacts';
  if (/\/about\/|\/o-nas\/|\/company\/|\/about-us\//i.test(path)) return 'about';
  if (/\/faq\/|\/help\/|\/pomoshch\/|\/questions\//i.test(path) || features.faqFound) return 'faq';
  return 'generic';
}

function extractImages(html: string) {
  const images: ImageInfo[] = [];

  for (const match of html.matchAll(/<img\b([^>]*?)>/gi)) {
    const attrs = match[1] || '';
    const src = attrs.match(/src=["']([^"']+)["']/i)?.[1] || '';
    const alt = decodeHtmlEntities(attrs.match(/alt=["']([^"']*)["']/i)?.[1] || '');
    const width = Number(attrs.match(/width=["']?(\d+)/i)?.[1] || 0);
    const height = Number(attrs.match(/height=["']?(\d+)/i)?.[1] || 0);
    const className = (attrs.match(/class=["']([^"']+)"/i)?.[1] || '').toLowerCase();
    const contentImage = !/sprite|icon|logo|avatar|emoji/.test(className) && !/\.svg($|\?)/i.test(src) && (width === 0 || width >= 50) && (height === 0 || height >= 50);
    images.push({ src, alt, contentImage });
  }

  return images;
}

function extractButtonTexts(html: string) {
  return Array.from(html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi))
    .map((item) => decodeHtmlEntities(stripHtml(item[2] || '')))
    .filter(Boolean);
}

function extractPageNumber(value: string) {
  const patterns = [
    /[?&](?:page|paged|pagen(?:_\d+)?)=(\d{1,5})/i,
    /\/page\/(\d{1,5})(?:\/|$)/i,
    /[-_/]page[-_/]?(\d{1,5})(?:\/|$)/i,
  ];

  let maxPage = 0;
  for (const pattern of patterns) {
    const match = value.match(pattern);
    const candidate = Number(match?.[1] || 0);
    if (candidate > maxPage) maxPage = candidate;
  }

  return maxPage || null;
}

function countListingBlocks(html: string) {
  const counts = new Map<string, number>();
  const excluded = /(sidebar|aside|filter|recommend|related|similar|upsell|crosssell|banner|nav|menu|footer|header|breadcrumb|pager)/i;
  const targeted = /(product-card|catalog-item|product-item|goods-item|catalog__item|product__item|item-card|grid-item|card-item|listing-item)/i;

  for (const match of html.matchAll(/<(div|li|article|section)\b([^>]*?)>/gi)) {
    const attrs = match[2] || '';
    const className = (attrs.match(/class=["']([^"']+)["']/i)?.[1] || '').toLowerCase();
    if (!className || excluded.test(className) || !targeted.test(className)) continue;
    counts.set(className, (counts.get(className) || 0) + 1);
  }

  let maxCount = 0;
  for (const value of counts.values()) {
    if (value > maxCount) maxCount = value;
  }

  for (const match of html.matchAll(/<(ul|ol)\b([^>]*class=["'][^"']*(catalog|products|listing|grid|items)[^"']*["'][^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const listClass = match[2] || '';
    if (excluded.test(listClass)) continue;
    const liCount = countMatches(match[4] || '', /<li\b/gi);
    if (liCount > maxCount) maxCount = liCount;
  }

  const productLinkCount = countMatches(
    html,
    /<(a|div|article|li)\b[^>]*>(?:(?!<\/\1>).)*?<img\b(?:(?!<\/\1>).)*?(?:₽|руб\.?|р\.\b|\$|€)(?:(?!<\/\1>).)*?<\/\1>/gis
  );

  return Math.max(maxCount, productLinkCount);
}

function detectPagination(html: string, finalUrl: string) {
  const links = Array.from(html.matchAll(/<(a|link)\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi)).map((item) => ({
    attrs: `${item[2] || ''} ${item[4] || ''}`,
    href: item[3] || '',
  }));

  const relLast = links.find((item) => /\brel=["'][^"']*last[^"']*["']/i.test(item.attrs));
  let maxPage = extractPageNumber(relLast?.href || '') || 0;

  for (const link of links) {
    const absoluteHref = absoluteUrl(link.href, finalUrl) || link.href;
    const candidate = extractPageNumber(absoluteHref) || 0;
    if (candidate > maxPage) maxPage = candidate;
  }

  const paginationBlocks = Array.from(
    html.matchAll(/<(nav|div|ul)\b[^>]*class=["'][^"']*(pagination|pager|nav-pages|page-nav)[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi)
  );
  for (const block of paginationBlocks) {
    for (const numberMatch of (block[3] || '').matchAll(/(?:^|[>\s])(\d{1,5})(?:[<\s]|$)/g)) {
      const candidate = Number(numberMatch[1] || 0);
      if (candidate > maxPage) maxPage = candidate;
    }
  }

  const infiniteScroll = /infinite\s*scroll|load more|show more|показать ещё|загрузить ещё|data-next-page|ajaxpager|catalog-more/i.test(
    html
  );

  if (maxPage > 1) {
    return { pageCount: maxPage, infiniteScroll: false, mode: 'pages' as const };
  }

  if (infiniteScroll) {
    return { pageCount: null, infiniteScroll: true, mode: 'infinite' as const };
  }

  return { pageCount: 1, infiniteScroll: false, mode: 'single' as const };
}

function buildBaseFeatures(snapshot: FetchSnapshot, inputUrl: string): BaseFeatures {
  const finalUrl = snapshot.finalUrl || inputUrl;
  const bodyHtml = stripNonContentBlocks(snapshot.html);
  const visibleText = stripHtml(bodyHtml);
  const schemaTypes = extractJsonLdTypes(snapshot.html);
  const images = extractImages(snapshot.html);
  const contentImages = images.filter((item) => item.contentImage);
  const links = extractLinks(snapshot.html, finalUrl);
  const internalLinks = links.filter((item) => item.internal);
  const externalLinks = links.filter((item) => !item.internal);
  const nofollowLinksCount = links.filter((item) => item.nofollow).length;
  const buttonTexts = extractButtonTexts(snapshot.html);
  const buyButtonLabel = buttonTexts.find((value) => /купить|в корзину|заказать|buy now|add to cart|оформить/i.test(value)) || null;
  const priceText = Array.from(visibleText.matchAll(/(?:\d[\d\s]{1,12})(?:[,.]\d+)?\s*(?:₽|руб\.?|р\.\b|₸|\$|€)/gi))[0]?.[0] || null;
  const title = extractTagText(snapshot.html, 'title');
  const description = extractMetaContent(snapshot.html, 'name', 'description');
  const h1Text = extractTagText(snapshot.html, 'h1');
  const lowerHtml = snapshot.html.toLowerCase();
  const contentDensityPercent = calculateContentDensityPercent(visibleText, bodyHtml);
  const listingCards = Math.max(
    countListingBlocks(snapshot.html),
    countMatches(snapshot.html, /<(article|li|div)\b[^>]*data-product/gi),
    countMatches(snapshot.html, /class=["'][^"']*(product|catalog)[^"']*(card|item)[^"']*["']/gi)
  );
  const pagination = detectPagination(snapshot.html, finalUrl);
  const schemaProduct = schemaTypes.some((item) => PRODUCT_SCHEMA_TYPES.includes(item));
  const schemaOffer = schemaTypes.includes('Offer') || schemaTypes.includes('AggregateOffer');
  const schemaReview = schemaTypes.includes('Review') || schemaTypes.includes('AggregateRating');
  const schemaItemList = schemaTypes.some((item) => CATEGORY_SCHEMA_TYPES.includes(item));
  const schemaArticle = schemaTypes.some((item) => ARTICLE_SCHEMA_TYPES.includes(item));

  return {
    normalizedUrl: finalUrl,
    finalUrl,
    status: snapshot.status,
    title,
    titleLength: title.length,
    description,
    descriptionLength: description.length,
    h1Text,
    h1Count: countMatches(snapshot.html, /<h1\b/gi),
    h2Count: countMatches(snapshot.html, /<h2\b/gi),
    h3Count: countMatches(snapshot.html, /<h3\b/gi),
    canonical: extractCanonical(snapshot.html),
    robotsMeta: extractMetaContent(snapshot.html, 'name', 'robots') || extractMetaContent(snapshot.html, 'name', 'googlebot') || null,
    ogTitle: Boolean(extractMetaContent(snapshot.html, 'property', 'og:title')),
    ogDescription: Boolean(extractMetaContent(snapshot.html, 'property', 'og:description')),
    ogImage: Boolean(extractMetaContent(snapshot.html, 'property', 'og:image')),
    schemaTypes,
    images,
    contentImages,
    contentImagesWithoutAlt: contentImages.filter((item) => !item.alt.trim()).length,
    internalLinks,
    externalLinks,
    nofollowLinksCount,
    wordCount: countWords(visibleText),
    visibleText,
    bodyHtml,
    contentDensityPercent,
    priceText,
    buyButtonLabel,
    formFound: /<form\b/i.test(snapshot.html),
    filterFound: /filter|фильтр/i.test(lowerHtml) && /<(form|select|input)\b/i.test(snapshot.html),
    listingCards,
    paginationPageCount: pagination.pageCount,
    paginationInfiniteScroll: pagination.infiniteScroll,
    paginationMode: pagination.mode,
    estimatedAssortment:
      listingCards > 0 && pagination.pageCount && pagination.pageCount > 0
        ? listingCards * pagination.pageCount
        : null,
    skuFound: /артикул|sku|код товара|код:/i.test(visibleText),
    stockFound: /в наличии|нет в наличии|под заказ|доступно/i.test(visibleText),
    specsFound: /характеристик|спецификац/i.test(visibleText) || /<table\b/i.test(snapshot.html),
    descriptionBlockFound: /описани/i.test(visibleText) || /class=["'][^"']*description/i.test(snapshot.html),
    reviewsFound: /отзыв|reviews?/i.test(visibleText) || schemaReview,
    ratingFound: /rating|рейтинг|звезд/i.test(visibleText) || schemaTypes.includes('AggregateRating'),
    breadcrumbsFound: /breadcrumb|хлебн/i.test(lowerHtml) || schemaTypes.includes('BreadcrumbList'),
    relatedFound: /похожие товары|с этим товаром|вам может понравиться|recommended/i.test(visibleText),
    deliveryFound: /доставк|оплат/i.test(visibleText),
    categoryDescriptionFound: /описание категории|о категории/i.test(visibleText) || countWords(visibleText) >= 120,
    sortingFound: /sort|сортиров/i.test(lowerHtml),
    paginationFound: /page=|rel=["']next["']|pagination|\/page\/\d+/i.test(lowerHtml),
    infiniteScrollFound: /infinite|load more|подгрузить ещё/i.test(visibleText),
    subcategoriesFound: /подкатегор|подраздел/i.test(visibleText) || /class=["'][^"']*subcategory/i.test(snapshot.html),
    tocFound: /содержание|оглавление|table of contents/i.test(visibleText),
    readingTimeFound: /время чтения|мин чтения|read time/i.test(visibleText),
    publishedDate: extractMetaContent(snapshot.html, 'property', 'article:published_time') || extractMetaContent(snapshot.html, 'name', 'datePublished') || snapshot.html.match(/<time\b[^>]*datetime=["']([^"']+)["']/i)?.[1] || visibleText.match(/\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/)?.[0] || null,
    updatedDate: extractMetaContent(snapshot.html, 'property', 'article:modified_time') || extractMetaContent(snapshot.html, 'name', 'dateModified') || null,
    authorFound: Boolean(extractMetaContent(snapshot.html, 'name', 'author')) || /автор|author/i.test(visibleText) || /rel=["']author["']/i.test(snapshot.html),
    authorPhotoFound: /author/i.test(lowerHtml) && /<img\b/i.test(snapshot.html),
    authorRoleFound: /редактор|эксперт|author-role|должность|position|главный редактор|контент-менеджер/i.test(visibleText),
    tablesCount: countMatches(snapshot.html, /<table\b/gi),
    listsCount: countMatches(snapshot.html, /<(ul|ol)\b/gi),
    quotesCount: countMatches(snapshot.html, /<blockquote\b/gi),
    videosCount: countMatches(snapshot.html, /<(video|iframe)\b/gi),
    codeBlocksCount: countMatches(snapshot.html, /<(code|pre)\b/gi),
    ctaFound: /оставить заявку|получить|заказать|купить|попробовать|зарегистрироваться|подать заявку/i.test(visibleText),
    tagsFound: /rel=["']tag["']|теги|категор/i.test(lowerHtml),
    commentsFound: /comment|комментар/i.test(lowerHtml),
    socialButtonsFound: /telegram|whatsapp|vk\.com\/share|facebook\.com\/sharer|twitter\.com\/intent|sharethis|поделиться/i.test(lowerHtml),
    mapFound: /yandex\.ru\/map|google\.com\/maps|2gis|leaflet|ymaps|карта/i.test(lowerHtml),
    relatedArticlesFound: /похожие статьи|ещё по теме|читайте также|related posts|similar articles/i.test(visibleText),
    faqQuestionCount: countMatches(snapshot.html, /<(details|summary)\b/gi) + countMatches(snapshot.html, /(class|id)=["'][^"']*(faq|question|answer)[^"']*["']/gi),
    teamPhotoFound: /команда|офис|team|about-us|company/i.test(lowerHtml) && contentImages.length > 0,
    addressFound: /ул\.|улица|проспект|офис|адрес|г\.|город/i.test(visibleText) || schemaTypes.includes('PostalAddress'),
    phoneFound: /\+7|8\s?\(?\d{3}\)?[\s-]?\d{3}/i.test(visibleText) || /tel:/i.test(lowerHtml),
    emailFound: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(visibleText),
    requisitesFound: /инн|огрн|кпп|ооо|ип\b|ао\b|пао\b/i.test(visibleText),
    faqFound: /faq|вопросы и ответы|частые вопросы/i.test(lowerHtml) || schemaTypes.includes('FAQPage'),
    productSchemaFound: schemaProduct,
    offerSchemaFound: schemaOffer,
    reviewSchemaFound: schemaReview,
    itemListSchemaFound: schemaItemList,
    breadcrumbSchemaFound: schemaTypes.includes('BreadcrumbList'),
    articleSchemaFound: schemaArticle,
    authorSchemaFound: schemaTypes.includes('Person') || /"author"/i.test(snapshot.html),
    datePublishedSchemaFound: /"datePublished"/i.test(snapshot.html),
  };
}
function scorePageType(features: BaseFeatures): TypeScore[] {
  const path = new URL(features.finalUrl).pathname.toLowerCase();
  const scores: Record<ContentPageType, TypeScore> = {
    product: { key: 'product', score: 0, reasons: [] },
    category: { key: 'category', score: 0, reasons: [] },
    article: { key: 'article', score: 0, reasons: [] },
    informational: { key: 'informational', score: 0, reasons: [] },
    home: { key: 'home', score: 0, reasons: [] },
    landing: { key: 'landing', score: 0, reasons: [] },
    contacts: { key: 'contacts', score: 0, reasons: [] },
    unknown: { key: 'unknown', score: 0, reasons: [] },
  };

  const add = (key: ContentPageType, score: number, reason: string) => {
    scores[key].score += score;
    scores[key].reasons.push(reason);
  };

  if (path === '/' || path === '') add('home', 45, 'корень домена');
  if (/contact|kontakty|contacts|o-nas|about/i.test(path)) add('contacts', 35, 'URL похож на контакты');
  if (/contact|kontakty|contacts|o-nas|about|faq|help|pomoshch/i.test(path)) {
    add('informational', 40, 'URL похож на информационную страницу');
  }
  if (/catalog|category|shop|store|collection|products/i.test(path)) add('category', 25, 'URL похож на каталог');
  if (/product|tovar|item|goods/i.test(path)) add('product', 35, 'URL похож на товар');
  if (/blog|article|news|stati|post/i.test(path)) add('article', 35, 'URL похож на статью');
  if (/landing|lp|promo/i.test(path)) add('landing', 25, 'URL похож на лендинг');

  if (features.productSchemaFound) add('product', 60, 'есть schema Product');
  if (features.itemListSchemaFound) add('category', 45, 'есть schema ItemList');
  if (features.articleSchemaFound) add('article', 60, 'есть schema Article');
  if (features.phoneFound && features.addressFound && features.formFound) add('contacts', 35, 'есть контактные данные и форма');
  if (features.schemaTypes.includes('Organization') || features.schemaTypes.includes('LocalBusiness')) {
    add('informational', 30, 'есть schema Organization/LocalBusiness');
  }
  if (features.priceText) add('product', 25, 'найдена цена');
  if (features.buyButtonLabel) add('product', 30, 'найдена кнопка купить');
  if (features.listingCards >= 4) add('category', 35, 'найден листинг карточек');
  if (features.filterFound) add('category', 25, 'найдены фильтры');
  if (features.wordCount >= 500 && features.h2Count + features.h3Count >= 3) add('article', 35, 'длинный текст с H2/H3');
  if (features.authorFound) add('article', 15, 'найден автор');
  if (features.publishedDate) add('article', 20, 'найдена дата публикации');
  if (features.wordCount < 500 && !features.authorFound && !features.publishedDate) {
    add('informational', 20, 'короткая информационная страница без автора и даты');
  }
  if (features.formFound && features.ctaFound && features.listingCards < 3) add('landing', 30, 'форма и оффер');
  if (features.ctaFound && path === '/') add('home', 20, 'главная с CTA');
  if (features.wordCount < 220 && features.formFound && !features.articleSchemaFound && !features.itemListSchemaFound) add('landing', 15, 'короткий офферный контент');
  if (features.categoryDescriptionFound && features.listingCards >= 4) add('category', 10, 'есть описание категории');
  if (features.relatedFound && features.priceText && features.buyButtonLabel) add('product', 10, 'есть рекомендации товара');
  if (features.faqFound && !features.articleSchemaFound && features.wordCount < 700) {
    add('informational', 20, 'есть FAQ-сигналы на информационной странице');
  }
  if ((features.phoneFound || features.addressFound) && !features.publishedDate && !features.authorFound) {
    add('informational', 20, 'контактные сигналы без признаков статьи');
  }

  if (!Object.values(scores).some((item) => item.score > 0)) {
    add('unknown', 20, 'тип не определён по базовым сигналам');
  }

  return Object.values(scores).sort((a, b) => b.score - a.score);
}

function resolvePageType(features: BaseFeatures, overrideType?: ContentPageType | null, forceBest = false) {
  if (overrideType && overrideType !== 'unknown') {
    return {
      key: overrideType,
      label: PAGE_TYPE_LABELS[overrideType],
      confidence: 100,
      reason: 'Тип выбран вручную',
      needsChoice: false,
      suggestions: [] as Array<{ key: ContentPageType; label: string }>,
    };
  }

  const scores = scorePageType(features);
  const best = scores[0].key === 'contacts' ? { ...scores[0], key: 'informational' as ContentPageType } : scores[0];
  const second = scores[1] || { score: 0 };
  const confidence = Math.max(35, Math.min(98, best.score + (best.score - second.score)));

  return {
    key: best.key,
    label: PAGE_TYPE_LABELS[best.key],
    confidence,
    reason: best.reasons[0] || 'Тип определён по структуре страницы',
    needsChoice: !forceBest && (best.key === 'unknown' || confidence < 80),
    suggestions: scores
      .filter((item) => item.key !== 'unknown' && item.score > 0)
      .slice(0, 3)
      .map((item) => {
        const key = item.key === 'contacts' ? 'informational' : item.key;
        return { key, label: PAGE_TYPE_LABELS[key] };
      }),
  };
}

function createIssue(severity: ContentCheckSeverity, title: string, action: string): ContentIssueCard {
  return { severity, title, action };
}

function evaluateChecks(features: BaseFeatures, pageType: ContentPageType) {
  const critical: ContentIssueCard[] = [];
  const important: ContentIssueCard[] = [];
  const improve: ContentIssueCard[] = [];
  const informationalSubtype = resolveInformationalSubtype(features);
  const push = (list: ContentIssueCard[], condition: boolean, title: string, action: string) => {
    if (!condition) return;
    const severity: ContentCheckSeverity = list === critical ? 'critical' : list === important ? 'warn' : 'improve';
    list.push(createIssue(severity, title, action));
  };

  if (pageType === 'product') {
    push(critical, !features.priceText, 'Цена не найдена на странице', 'Добавьте явную цену в карточку товара.');
    push(critical, !features.buyButtonLabel, 'Кнопка купить не найдена', 'Добавьте CTA “Купить” или “В корзину”.');
    push(critical, features.contentImages.length === 0, 'Изображения товара не найдены', 'Добавьте контентные фото товара.');
    push(critical, features.h1Count === 0, 'Заголовок H1 отсутствует', 'Добавьте один H1 с названием товара.');
    push(critical, !features.productSchemaFound, 'Разметка товара отсутствует', 'Добавьте Schema Product — без неё нет rich results.');
    push(important, !features.reviewsFound, 'Отзывы не найдены', 'Добавьте отзывы — это влияет на доверие и конверсию.');
    push(important, !features.breadcrumbsFound, 'Хлебные крошки отсутствуют', 'Добавьте breadcrumbs для навигации и индексации.');
    push(important, !features.specsFound, 'Характеристики не найдены', 'Добавьте характеристики товара в таблице или списке.');
    push(important, !features.offerSchemaFound, 'Цена не в разметке', 'Добавьте Schema Offer, чтобы цена попадала в сниппет.');
    push(important, !features.descriptionBlockFound, 'Описание товара отсутствует', 'Добавьте отдельный блок описания товара.');
    push(important, !features.deliveryFound, 'Условия доставки не найдены', 'Добавьте блок доставки и оплаты.');
    push(improve, !features.relatedFound, 'Нет блока похожих товаров', 'Добавьте рекомендации и связанные товары.');
    push(improve, !features.faqFound, 'Нет вопрос-ответ блока', 'Добавьте Q&A для AI-видимости и конверсии.');
    push(improve, !features.reviewSchemaFound, 'Нет Schema Review', 'Добавьте разметку отзывов.');
    push(improve, features.contentImages.length > 0 && features.contentImagesWithoutAlt > 0, 'Нет alt у части фото', 'Добавьте alt к изображениям товара.');
  } else if (pageType === 'category') {
    push(critical, features.h1Count === 0, 'Заголовок категории отсутствует', 'Добавьте один H1 для категории.');
    push(critical, !features.priceText, 'Цены не видны в листинге', 'Показывайте цены прямо на карточках товаров.');
    push(critical, features.filterFound && !features.canonical, 'Фильтры создают дубли страниц', 'Настройте canonical или robots для filter URL.');
    push(important, !features.categoryDescriptionFound, 'Описание категории не найдено', 'Добавьте текстовое описание категории.');
    push(important, !features.filterFound, 'Фильтры не найдены', 'Добавьте фильтры для UX и SEO.');
    push(important, !features.itemListSchemaFound, 'Разметка списка товаров отсутствует', 'Добавьте Schema ItemList.');
    push(important, !features.breadcrumbsFound, 'Хлебные крошки отсутствуют', 'Добавьте breadcrumbs в категорию.');
    push(important, !features.paginationFound && !features.infiniteScrollFound, 'Пагинация не найдена', 'Проверьте индексацию всех страниц каталога.');
    push(
      important,
      features.paginationMode !== 'infinite' && (features.estimatedAssortment || features.listingCards) > 0 && (features.estimatedAssortment || features.listingCards) < 20,
      'Малый ассортимент категории',
      'Возможно категория неразвита — проверьте полноту ассортимента и семантику раздела.'
    );
    push(
      important,
      (features.estimatedAssortment || 0) > 1000,
      'Очень большой ассортимент',
      'Убедитесь, что страницы пагинации индексируются и все товары попадают в sitemap.'
    );
    push(improve, !features.buyButtonLabel, 'Нет быстрой покупки в листинге', 'Добавьте CTA на карточках списка.');
    push(improve, !features.subcategoriesFound, 'Нет подкатегорий', 'Структурируйте раздел через дочерние категории.');
    push(improve, features.infiniteScrollFound && !features.paginationFound, 'Infinite scroll без пагинации', 'Добавьте /page/2/ или альтернативные URL для индексации.');
    push(
      improve,
      (features.estimatedAssortment || 0) > 500 && (features.estimatedAssortment || 0) <= 1000,
      'Большой ассортимент категории',
      'Проверьте индексацию глубоких страниц пагинации и полноту обхода раздела.'
    );
  } else if (pageType === 'article') {
    push(critical, features.h1Count === 0, 'Заголовок статьи отсутствует', 'Добавьте H1.');
    push(critical, features.wordCount < 300, 'Слишком мало текста для SEO', 'Нарастите материал минимум до 300 слов.');
    push(critical, !features.articleSchemaFound, 'Разметка статьи отсутствует', 'Добавьте Schema Article.');
    push(critical, !features.publishedDate, 'Дата публикации не найдена', 'Добавьте дату публикации на страницу.');
    push(critical, features.contentDensityPercent < 10, 'Страница почти пустая', 'Увеличьте объём основного контента — сейчас на странице слишком много кода и мало текста.');
    push(important, !features.authorFound, 'Автор не указан', 'Добавьте автора — это усиливает E-E-A-T.');
    push(important, features.h2Count + features.h3Count === 0, 'Нет H2/H3 структуры', 'Добавьте подзаголовки и разбейте материал.');
    push(important, features.internalLinks.length === 0, 'Нет внутренних ссылок', 'Добавьте перелинковку на смежные материалы.');
    push(important, features.contentImages.length === 0, 'Нет изображений', 'Добавьте иллюстрации к статье.');
    push(important, !features.datePublishedSchemaFound, 'Дата не в разметке', 'Добавьте datePublished в Schema.org.');
    push(important, !features.ctaFound, 'Нет CTA', 'Добавьте призыв к действию или форму внизу статьи.');
    push(
      important,
      features.contentImagesWithoutAlt > 0,
      `${features.contentImagesWithoutAlt} изображений без alt`,
      'Добавьте alt к контентным изображениям статьи.'
    );
    push(
      important,
      features.contentDensityPercent >= 10 && features.contentDensityPercent < 25,
      'Низкая плотность контента',
      'Усилите основной текст и сократите шумные служебные блоки.'
    );
    push(improve, !features.tocFound, 'Нет содержания', 'Добавьте оглавление с якорями.');
    push(improve, !features.readingTimeFound, 'Нет времени чтения', 'Добавьте время чтения.');
    push(improve, features.tablesCount === 0, 'Нет таблиц', 'Структурируйте часть данных в таблицы.');
    push(improve, features.externalLinks.length === 0, 'Нет внешних ссылок', 'Добавьте ссылки на авторитетные источники.');
    push(improve, !features.schemaTypes.includes('FAQPage'), 'Нет Schema FAQPage', 'Если в статье есть вопросы и ответы, добавьте FAQPage разметку.');
    push(improve, !features.relatedArticlesFound, 'Нет похожих статей', 'Добавьте блок рекомендаций по теме.');
    push(improve, !features.commentsFound, 'Нет комментариев', 'Добавьте комментарии или другой UGC-блок.');
    push(improve, features.videosCount === 0, 'Нет видео', 'Добавьте видео или встраиваемый контент.');
    push(improve, !features.tagsFound, 'Нет тегов или категорий', 'Добавьте теги для навигации.');
  } else if (pageType === 'informational') {
    push(critical, features.h1Count === 0, 'H1 отсутствует', 'Добавьте заголовок страницы.');
    push(
      critical,
      features.contentDensityPercent < 10,
      'Страница почти пустая',
      'Добавьте больше основного контента или сократите лишние служебные блоки.'
    );

    if (informationalSubtype === 'contacts') {
      push(critical, !features.phoneFound, 'Контактная информация не найдена', 'Добавьте телефон в явном виде и tel: ссылку.');
      push(critical, !features.addressFound, 'Адрес не найден', 'Добавьте адрес — это важно для локального SEO.');
      push(important, !features.schemaTypes.includes('LocalBusiness'), 'Нет Schema LocalBusiness', 'Добавьте разметку LocalBusiness.');
      push(important, !features.emailFound, 'Email не найден', 'Добавьте email для связи.');
      push(improve, !features.mapFound, 'Нет карты', 'Добавьте карту офиса или точки продаж.');
    } else if (informationalSubtype === 'about') {
      push(important, !features.schemaTypes.includes('Organization'), 'Нет Schema Organization', 'Добавьте Organization schema.');
      push(important, !(features.phoneFound || features.emailFound || features.addressFound), 'Нет контактных данных', 'Добавьте контакты на страницу о компании.');
      push(improve, !features.teamPhotoFound, 'Нет фото команды или офиса', 'Добавьте визуальный контент о компании.');
    } else if (informationalSubtype === 'faq') {
      push(critical, !features.schemaTypes.includes('FAQPage'), 'Schema FAQPage отсутствует', 'Добавьте разметку FAQPage.');
      push(important, !features.faqFound, 'Нет структуры вопрос-ответ', 'Сделайте FAQ как явные вопросы и ответы.');
      push(improve, features.faqQuestionCount > 0 && features.faqQuestionCount < 5, 'Мало вопросов в FAQ', 'Расширьте FAQ минимум до 5 вопросов.');
    } else {
      push(important, !features.schemaTypes.includes('Organization') && !features.schemaTypes.includes('LocalBusiness'), 'Нет schema организации', 'Добавьте Organization или LocalBusiness в разметку.');
      push(important, !(features.phoneFound || features.emailFound || features.addressFound), 'Нет контактных данных', 'Добавьте контакты или явные реквизиты.');
      push(improve, features.contentImages.length === 0, 'Нет иллюстраций', 'Добавьте изображения или визуальные блоки.');
    }
  } else if (pageType === 'landing') {
    push(critical, features.h1Count === 0, 'H1 отсутствует', 'Добавьте H1 с оффером.');
    push(critical, !features.formFound, 'Форма заявки не найдена', 'Добавьте форму на первом экране или рядом с CTA.');
    push(critical, !features.ctaFound, 'Нет основного CTA', 'Добавьте явный призыв к действию.');
    push(important, !features.reviewsFound, 'Нет блока доверия', 'Добавьте отзывы, кейсы или цифры доверия.');
    push(important, !features.ogImage, 'Нет og:image', 'Добавьте Open Graph image.');
    push(important, !features.schemaTypes.includes('Service'), 'Нет Schema Service', 'Добавьте Service schema для лендинга.');
    push(improve, !features.faqFound, 'Нет FAQ блока', 'Добавьте FAQ для SEO и AI-поиска.');
    push(improve, features.wordCount < 250, 'Мало текста для лендинга', 'Усилите оффер, преимущества и доверие.');
  } else if (pageType === 'contacts') {
    push(critical, !features.phoneFound, 'Телефон не найден', 'Добавьте телефон в явном виде и tel: ссылку.');
    push(critical, !features.addressFound, 'Адрес не найден', 'Добавьте адрес и карту.');
    push(critical, !features.formFound, 'Форма связи не найдена', 'Добавьте форму обратной связи.');
    push(important, !features.emailFound, 'Email не найден', 'Добавьте email для связи.');
    push(important, !features.requisitesFound, 'Реквизиты не найдены', 'Добавьте ИНН/ОГРН/КПП или реквизиты компании.');
    push(important, !features.schemaTypes.some((item) => CONTACT_SCHEMA_TYPES.includes(item)), 'Нет schema контактов', 'Добавьте Organization/LocalBusiness/PostalAddress.');
    push(improve, !features.ogTitle || !features.ogDescription, 'Open Graph заполнен не полностью', 'Добавьте og:title и og:description.');
  } else {
    push(critical, features.h1Count === 0, 'H1 отсутствует', 'Добавьте H1.');
    push(critical, features.titleLength === 0, 'Title отсутствует', 'Добавьте title страницы.');
    push(important, features.descriptionLength === 0, 'Description отсутствует', 'Добавьте meta description.');
    push(important, features.wordCount < 250, 'Мало основного текста', 'Добавьте больше полезного текста на страницу.');
    push(improve, features.contentImages.length === 0, 'Нет контентных изображений', 'Добавьте изображения по теме страницы.');
  }

  return { critical, important, improve };
}
function buildDetailGroups(features: BaseFeatures, pageType: ContentPageType) {
  const informationalSubtype = resolveInformationalSubtype(features);
  const groups: ContentDetailGroup[] = [
    {
      title: 'Общие данные',
      items: [
        { label: 'HTTP статус', value: String(features.status || '—') },
        { label: 'Title', value: features.title ? `${features.title} (${features.titleLength} симв.)` : 'не найден' },
        { label: 'Description', value: features.description ? `${features.description} (${features.descriptionLength} симв.)` : 'не найден' },
        { label: 'H1', value: features.h1Text ? `${features.h1Text} (${features.h1Count})` : 'не найден' },
        { label: 'H2 / H3', value: `${features.h2Count} / ${features.h3Count}` },
        { label: 'H1 совпадает с title', value: features.h1Text && features.title ? (features.title.toLowerCase().includes(features.h1Text.toLowerCase()) || features.h1Text.toLowerCase().includes(features.title.toLowerCase()) ? 'да' : 'нет') : 'не определить' },
        { label: 'Canonical', value: features.canonical || 'не найден' },
        { label: 'robots meta', value: features.robotsMeta || 'не найден' },
        { label: 'Open Graph', value: `${features.ogTitle ? 'title' : '—'} · ${features.ogDescription ? 'description' : '—'} · ${features.ogImage ? 'image' : '—'}` },
        { label: 'Schema types', value: features.schemaTypes.length ? features.schemaTypes.join(', ') : 'не найдены' },
        { label: 'Изображения', value: `${features.contentImages.length} (без alt: ${features.contentImagesWithoutAlt})` },
        { label: 'Внутренние ссылки', value: String(features.internalLinks.length) },
        { label: 'Внешние ссылки', value: `${features.externalLinks.length} (nofollow: ${features.nofollowLinksCount})` },
        { label: 'Слов текста', value: String(features.wordCount) },
        { label: 'Плотность контента', value: `${features.contentDensityPercent}%` },
      ],
    },
  ];

  if (pageType === 'product') {
    groups.push({
      title: 'Проверка товара',
      items: [
        { label: 'Цена', value: features.priceText || 'не найдена' },
        { label: 'Кнопка купить', value: features.buyButtonLabel || 'не найдена' },
        { label: 'Артикул', value: features.skuFound ? 'найден' : 'не найден' },
        { label: 'Наличие', value: features.stockFound ? 'найдено' : 'не найдено' },
        { label: 'Характеристики', value: features.specsFound ? 'найдены' : 'не найдены' },
        { label: 'Описание', value: features.descriptionBlockFound ? 'найдено' : 'не найдено' },
        { label: 'Отзывы / рейтинг', value: `${features.reviewsFound ? 'есть' : 'нет'} / ${features.ratingFound ? 'есть' : 'нет'}` },
        { label: 'Хлебные крошки', value: features.breadcrumbsFound ? 'найдены' : 'не найдены' },
        { label: 'Похожие товары', value: features.relatedFound ? 'найдены' : 'не найдены' },
        { label: 'Доставка / оплата', value: features.deliveryFound ? 'найдены' : 'не найдены' },
        { label: 'Schema Product / Offer / Review', value: `${features.productSchemaFound ? '✅' : '❌'} / ${features.offerSchemaFound ? '✅' : '❌'} / ${features.reviewSchemaFound ? '✅' : '❌'}` },
      ],
    });
  }

  if (pageType === 'category') {
    groups.push({
      title: 'Проверка каталога',
      items: [
        { label: 'Карточек в листинге', value: String(features.listingCards) },
        {
          label: 'Страниц пагинации',
          value:
            features.paginationMode === 'infinite'
              ? 'Infinite scroll'
              : String(features.paginationPageCount || 1),
        },
        {
          label: 'Примерный ассортимент',
          value:
            features.paginationMode === 'infinite'
              ? features.listingCards > 0
                ? `не определить точно, минимум ${features.listingCards}`
                : 'не определить точно'
              : features.estimatedAssortment
                ? `~${features.estimatedAssortment}`
                : features.listingCards > 0
                  ? `~${features.listingCards}`
                  : 'не найден',
        },
        { label: 'Цены в листинге', value: features.priceText ? 'есть' : 'нет' },
        { label: 'Фото в листинге', value: features.contentImages.length ? 'есть' : 'нет' },
        { label: 'Кнопка купить', value: features.buyButtonLabel ? 'есть' : 'нет' },
        { label: 'Фильтры', value: features.filterFound ? 'есть' : 'нет' },
        { label: 'Сортировка', value: features.sortingFound ? 'есть' : 'нет' },
        { label: 'Пагинация', value: features.paginationFound ? 'есть' : features.infiniteScrollFound ? 'infinite scroll' : 'нет' },
        { label: 'Подкатегории', value: features.subcategoriesFound ? 'есть' : 'нет' },
        { label: 'Описание категории', value: features.categoryDescriptionFound ? 'есть' : 'нет' },
        { label: 'Schema ItemList / BreadcrumbList', value: `${features.itemListSchemaFound ? '✅' : '❌'} / ${features.breadcrumbSchemaFound ? '✅' : '❌'}` },
      ],
    });
  }

  if (pageType === 'article') {
    groups.push({
      title: 'Проверка статьи',
      items: [
        { label: 'Объём текста', value: `${features.wordCount} слов` },
        { label: 'Плотность контента', value: `${features.contentDensityPercent}%` },
        { label: 'Содержание', value: features.tocFound ? 'найдено' : 'не найдено' },
        { label: 'Время чтения', value: features.readingTimeFound ? 'найдено' : 'не найдено' },
        { label: 'Дата публикации', value: features.publishedDate || 'не найдена' },
        { label: 'Дата обновления', value: features.updatedDate || 'не найдена' },
        { label: 'Автор', value: features.authorFound ? 'найден' : 'не найден' },
        { label: 'Фото автора', value: features.authorPhotoFound ? 'найдено' : 'не найдено' },
        { label: 'Должность автора', value: features.authorRoleFound ? 'найдена' : 'не найдена' },
        { label: 'Таблицы / списки / цитаты', value: `${features.tablesCount} / ${features.listsCount} / ${features.quotesCount}` },
        { label: 'Видео', value: String(features.videosCount) },
        { label: 'Блоки кода', value: String(features.codeBlocksCount) },
        { label: 'CTA', value: features.ctaFound ? 'найдено' : 'не найдено' },
        { label: 'Теги / комментарии / соцкнопки', value: `${features.tagsFound ? 'есть' : 'нет'} / ${features.commentsFound ? 'есть' : 'нет'} / ${features.socialButtonsFound ? 'есть' : 'нет'}` },
        { label: 'Похожие статьи', value: features.relatedArticlesFound ? 'найдены' : 'не найдены' },
        { label: 'Schema Article / Author / datePublished / FAQPage', value: `${features.articleSchemaFound ? '✅' : '❌'} / ${features.authorSchemaFound ? '✅' : '❌'} / ${features.datePublishedSchemaFound ? '✅' : '❌'} / ${features.schemaTypes.includes('FAQPage') ? '✅' : '❌'}` },
      ],
    });
  }

  if (pageType === 'informational') {
    groups.push({
      title: 'Проверка информационной страницы',
      items: [
        { label: 'Подтип', value: informationalSubtype === 'contacts' ? 'Контакты' : informationalSubtype === 'about' ? 'О компании' : informationalSubtype === 'faq' ? 'FAQ' : 'Информационная' },
        { label: 'Плотность контента', value: `${features.contentDensityPercent}%` },
        { label: 'Телефон / Email / Адрес', value: `${features.phoneFound ? 'есть' : 'нет'} / ${features.emailFound ? 'есть' : 'нет'} / ${features.addressFound ? 'есть' : 'нет'}` },
        { label: 'Форма / Карта', value: `${features.formFound ? 'есть' : 'нет'} / ${features.mapFound ? 'есть' : 'нет'}` },
        { label: 'Реквизиты', value: features.requisitesFound ? 'найдены' : 'не найдены' },
        { label: 'FAQ-сигналы', value: `${features.faqFound ? 'есть' : 'нет'} (вопросов: ${features.faqQuestionCount})` },
        { label: 'Фото команды / офиса', value: features.teamPhotoFound ? 'найдены' : 'не найдены' },
        { label: 'Schema Organization / LocalBusiness / FAQPage', value: `${features.schemaTypes.includes('Organization') ? '✅' : '❌'} / ${features.schemaTypes.includes('LocalBusiness') ? '✅' : '❌'} / ${features.schemaTypes.includes('FAQPage') ? '✅' : '❌'}` },
      ],
    });
  }

  if (pageType === 'landing') {
    groups.push({
      title: 'Проверка лендинга',
      items: [
        { label: 'Форма', value: features.formFound ? 'найдена' : 'не найдена' },
        { label: 'CTA', value: features.ctaFound ? 'найден' : 'не найден' },
        { label: 'Отзывы', value: features.reviewsFound ? 'найдены' : 'не найдены' },
        { label: 'FAQ', value: features.faqFound ? 'найден' : 'не найден' },
      ],
    });
  }

  if (pageType === 'contacts') {
    groups.push({
      title: 'Проверка контактов',
      items: [
        { label: 'Телефон', value: features.phoneFound ? 'найден' : 'не найден' },
        { label: 'Email', value: features.emailFound ? 'найден' : 'не найден' },
        { label: 'Адрес', value: features.addressFound ? 'найден' : 'не найден' },
        { label: 'Форма', value: features.formFound ? 'найдена' : 'не найдена' },
        { label: 'Реквизиты', value: features.requisitesFound ? 'найдены' : 'не найдены' },
      ],
    });
  }

  return groups;
}

function expectedCheckCount(pageType: ContentPageType, features: BaseFeatures) {
  if (pageType === 'product') return 15;
  if (pageType === 'category') return 13;
  if (pageType === 'article') return 19;
  if (pageType === 'landing') return 8;
  if (pageType === 'contacts') return 7;
  if (pageType === 'informational') {
    const subtype = resolveInformationalSubtype(features);
    if (subtype === 'contacts') return 7;
    if (subtype === 'about') return 6;
    if (subtype === 'faq') return 6;
    return 6;
  }
  return 5;
}

function buildVerdict(
  issues: { critical: ContentIssueCard[]; important: ContentIssueCard[]; improve: ContentIssueCard[] },
  pageType: ContentPageType,
  features: BaseFeatures
) {
  const criticalCount = issues.critical.length;
  const importantCount = issues.important.length;
  const improveCount = issues.improve.length;
  const totalChecks = expectedCheckCount(pageType, features);
  const passedChecks = Math.max(0, totalChecks - (criticalCount + importantCount + improveCount));
  const status: ContentCheckVerdict = criticalCount > 0 ? 'fail' : importantCount > 0 ? 'warn' : 'ok';
  return {
    status,
    title: status === 'fail' ? 'Есть критические проблемы' : status === 'warn' ? 'Есть важные пробелы' : 'Контент страницы в порядке',
    summary: `Пройдено: ${passedChecks} из ${totalChecks} проверок`,
    passed_checks: passedChecks,
    total_checks: totalChecks,
    critical_count: criticalCount,
    important_count: importantCount,
    improve_count: improveCount,
  };
}

function buildCatalogStructure(features: BaseFeatures) {
  const note =
    features.paginationMode === 'infinite'
      ? features.listingCards > 0
        ? `Infinite scroll — точный подсчёт невозможен, минимум ${features.listingCards} товаров.`
        : 'Infinite scroll — точный подсчёт невозможен.'
      : features.estimatedAssortment
        ? 'Приблизительно: товаров на странице × страниц пагинации.'
        : null;

  return {
    items_on_page: features.listingCards || null,
    pagination_pages:
      features.paginationMode === 'infinite' ? null : (features.paginationPageCount || 1),
    infinite_scroll: features.paginationMode === 'infinite',
    estimated_assortment: features.estimatedAssortment,
    minimum_items: features.listingCards || null,
    note,
  };
}

function buildEmptyResponse(inputUrl: string, normalizedUrl: string, finalUrl: string, error: string): ContentCheckResponse {
  return {
    ok: false,
    phase: 'full',
    checked_at: new Date().toISOString(),
    input_url: inputUrl,
    final_url: finalUrl,
    page_type: { key: 'unknown', label: PAGE_TYPE_LABELS.unknown, confidence: 0, reason: 'Тип не определён' },
    needs_type_choice: false,
    type_suggestions: [],
    verdict: {
      status: 'fail',
      title: 'Не удалось проверить страницу',
      summary: 'Пройдено: 0 из 0 проверок',
      passed_checks: 0,
      total_checks: 0,
      critical_count: 0,
      important_count: 0,
      improve_count: 0,
    },
    issues: { critical: [], important: [], improve: [] },
    catalog_structure: {
      items_on_page: null,
      pagination_pages: null,
      infinite_scroll: false,
      estimated_assortment: null,
      minimum_items: null,
      note: null,
    },
    details: [{ title: 'Ошибка', items: [{ label: 'URL', value: normalizedUrl }, { label: 'Причина', value: error }] }],
    compare_summary: {
      representative_url: finalUrl,
      page_type: PAGE_TYPE_LABELS.unknown,
      critical_count: 0,
      important_count: 0,
      improve_count: 0,
      word_count: null,
      content_density_percent: null,
      internal_links: null,
      content_images: null,
      author_found: null,
      article_schema_found: null,
      items_on_page: null,
      pagination_pages: null,
      estimated_assortment: null,
      infinite_scroll: false,
    },
    error,
  };
}
async function fetchSitemapText(url: string) {
  try {
    const response = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': BROWSER_UA } });
    return response.ok ? await response.text() : '';
  } catch {
    return '';
  }
}

function looksLikeSitemapUrl(url: string) {
  return /sitemap/i.test(url) || /\.xml(\.gz)?$/i.test(url);
}

function parseSitemapLocs(xml: string) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/gi)).map((item) => decodeHtmlEntities(item[1] || '').trim()).filter(Boolean);
}

async function getRepresentativeUrl(siteUrl: string, preferredKind: 'default' | 'article' = 'default') {
  const origin = new URL(siteUrl).origin;
  const robots = await fetchSitemapText(`${origin}/robots.txt`);
  const sitemapCandidates = Array.from(robots.matchAll(/^\s*Sitemap:\s*(.+)$/gim)).map((item) => item[1].trim()).filter(looksLikeSitemapUrl);
  const queue = (sitemapCandidates.length ? sitemapCandidates : [`${origin}/sitemap.xml`]).slice(0, REPRESENTATIVE_MAX_SITEMAP_FILES);
  const pageUrls: string[] = [];
  const visited = new Set<string>();

  while (queue.length && visited.size < REPRESENTATIVE_MAX_SITEMAP_FILES && pageUrls.length < REPRESENTATIVE_MAX_SITEMAP_URLS) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || visited.has(sitemapUrl)) continue;
    visited.add(sitemapUrl);
    const xml = await fetchSitemapText(sitemapUrl);
    if (!xml) continue;
    const locs = parseSitemapLocs(xml);
    const nested = locs.filter(looksLikeSitemapUrl);
    if (nested.length && /<sitemapindex/i.test(xml)) {
      nested.slice(0, REPRESENTATIVE_MAX_SITEMAP_FILES).forEach((item) => {
        if (!visited.has(item)) queue.push(item);
      });
      continue;
    }
    pageUrls.push(...locs.filter((item) => !looksLikeSitemapUrl(item)).slice(0, REPRESENTATIVE_MAX_SITEMAP_URLS - pageUrls.length));
  }

  const scored = pageUrls
    .map((url) => {
      const path = (() => {
        try {
          return new URL(url).pathname.toLowerCase();
        } catch {
          return url.toLowerCase();
        }
      })();
      let score = 0;
      if (preferredKind === 'article') {
        if (/\/blog\/|\/article\/|\/news\/|\/stati\/|\/post\//i.test(path)) score += 120;
        if (/\/blog\/|\/article\/|\/news\//i.test(path)) score += 40;
      } else {
        if (/\/product\/|\/tovar\/|\/item\//i.test(path)) score += 100;
        if (/\/catalog\/[^/]+\/[^/]+/i.test(path)) score += 90;
        if (/\/catalog\/|\/category\/|\/shop\//i.test(path)) score += 70;
        if (/\/blog\/|\/article\/|\/news\//i.test(path)) score += 40;
      }
      return { url, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.find((item) => item.score > 0)?.url || siteUrl;
}

export async function runContentCheck(inputUrl: string, options: AnalyzeOptions = {}): Promise<ContentCheckResponse> {
  let normalizedUrl: string;
  try {
    normalizedUrl = normalizeInputUrl(inputUrl);
  } catch {
    return buildEmptyResponse(inputUrl, inputUrl, inputUrl, 'Неверный URL');
  }

  const targetUrl = options.representativeMode
    ? await getRepresentativeUrl(normalizedUrl, options.representativeKind || 'default')
    : normalizedUrl;
  const snapshot = await fetchHtml(targetUrl);
  if (!snapshot.html) {
    return buildEmptyResponse(inputUrl, normalizedUrl, snapshot.finalUrl || targetUrl, snapshot.error || 'Не удалось получить HTML страницы');
  }

  const features = buildBaseFeatures(snapshot, targetUrl);
  const pageType = resolvePageType(features, options.overrideType, Boolean(options.representativeMode));

  if (pageType.needsChoice) {
    const categoryItemsOnPage = pageType.key === 'category' ? features.listingCards || null : null;
    const categoryPaginationPages =
      pageType.key === 'category' && features.paginationMode !== 'infinite'
        ? (features.paginationPageCount || 1)
        : null;
    const categoryEstimatedAssortment =
      pageType.key === 'category' ? features.estimatedAssortment : null;

    return {
      ok: true,
      phase: 'detect',
      checked_at: new Date().toISOString(),
      input_url: inputUrl,
      final_url: features.finalUrl,
      page_type: {
        key: pageType.key,
        label: pageType.label,
        confidence: pageType.confidence,
        reason: pageType.reason,
      },
      needs_type_choice: true,
      type_suggestions: pageType.suggestions,
      verdict: {
        status: 'warn',
        title: 'Нужно уточнить тип страницы',
        summary: 'Выберите подходящий тип, чтобы запустить корректный чеклист.',
        passed_checks: 0,
        total_checks: 0,
        critical_count: 0,
        important_count: 0,
        improve_count: 0,
      },
      issues: { critical: [], important: [], improve: [] },
      catalog_structure: buildCatalogStructure(features),
      details: [
        {
          title: 'Определение типа',
          items: [
            { label: 'URL', value: features.finalUrl },
            { label: 'Похоже на', value: `${pageType.label} (${pageType.confidence}%)` },
            { label: 'Причина', value: pageType.reason },
          ],
        },
      ],
      compare_summary: {
        representative_url: features.finalUrl,
        page_type: pageType.label,
        critical_count: 0,
        important_count: 0,
        improve_count: 0,
        word_count: features.wordCount,
        content_density_percent: Number(features.contentDensityPercent.toFixed(1)),
        internal_links: features.internalLinks.length,
        content_images: features.contentImages.length,
        author_found: features.authorFound,
        article_schema_found: features.articleSchemaFound,
        items_on_page: categoryItemsOnPage,
        pagination_pages: categoryPaginationPages,
        estimated_assortment: categoryEstimatedAssortment,
        infinite_scroll: pageType.key === 'category' ? features.paginationMode === 'infinite' : false,
      },
    };
  }

  const issues = evaluateChecks(features, pageType.key);
  const verdict = buildVerdict(issues, pageType.key, features);
  const categoryItemsOnPage = pageType.key === 'category' ? features.listingCards || null : null;
  const categoryPaginationPages =
    pageType.key === 'category' && features.paginationMode !== 'infinite'
      ? (features.paginationPageCount || 1)
      : null;
  const categoryEstimatedAssortment =
    pageType.key === 'category' ? features.estimatedAssortment : null;

  return {
    ok: true,
    phase: 'full',
    checked_at: new Date().toISOString(),
    input_url: inputUrl,
    final_url: features.finalUrl,
    page_type: {
      key: pageType.key,
      label: pageType.label,
      confidence: pageType.confidence,
      reason: pageType.reason,
    },
    needs_type_choice: false,
    type_suggestions: pageType.suggestions,
    verdict,
    issues,
    catalog_structure: buildCatalogStructure(features),
    details: buildDetailGroups(features, pageType.key),
    compare_summary: {
      representative_url: features.finalUrl,
      page_type: pageType.label,
      critical_count: verdict.critical_count,
      important_count: verdict.important_count,
      improve_count: verdict.improve_count,
      word_count: features.wordCount,
      content_density_percent: Number(features.contentDensityPercent.toFixed(1)),
      internal_links: features.internalLinks.length,
      content_images: features.contentImages.length,
      author_found: features.authorFound,
      article_schema_found: features.articleSchemaFound,
      items_on_page: categoryItemsOnPage,
      pagination_pages: categoryPaginationPages,
      estimated_assortment: categoryEstimatedAssortment,
      infinite_scroll: pageType.key === 'category' ? features.paginationMode === 'infinite' : false,
    },
  };
}
