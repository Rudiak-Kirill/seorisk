import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type Phase = 'quick' | 'full';
type Verdict = 'ok' | 'warn' | 'fail';
type Severity = 'critical' | 'warn' | 'improve';
type TtfbState = 'fast' | 'normal' | 'slow' | 'critical' | 'unknown';
type MetricState = 'good' | 'slow' | 'critical' | 'problem' | 'unknown';
type CacheState = 'good' | 'partial' | 'none' | 'unknown';
type ServerCacheState = 'likely' | 'not_detected';

type PageSpeedMetrics = {
  performance_score: number | null;
  fcp_ms: number | null;
  lcp_ms: number | null;
  cls: number | null;
  tbt_ms: number | null;
  speed_index_ms: number | null;
};

type Opportunity = {
  id: string;
  title: string;
  savings_ms: number | null;
  savings_bytes: number | null;
};

type ProblemCard = {
  severity: Severity;
  title: string;
  action: string;
  reason: string;
};

type QuickDetails = {
  http_status: number;
  final_url: string;
  ttfb_ms: number | null;
  ttfb_state: TtfbState;
  cache_state: CacheState;
  server_cache_state: ServerCacheState;
  cache_control: string | null;
  content_encoding: string | null;
  cms: string;
  cdn: string | null;
};

type FullDetails = {
  mobile: PageSpeedMetrics | null;
  desktop: PageSpeedMetrics | null;
  mobile_gap: number | null;
  page_weight_bytes: number | null;
  opportunities: Opportunity[];
  google_fonts_detected: boolean;
  psi_available: boolean;
  psi_error: string | null;
  mobile_error: string | null;
  desktop_error: string | null;
};

type SpeedCheckResponse = {
  ok: boolean;
  phase: Phase;
  checked_at: string;
  input_url: string;
  final_url: string;
  verdict: Verdict;
  verdict_title: string;
  verdict_summary: string;
  loading_text?: string | null;
  problem_cards: ProblemCard[];
  details: {
    quick: QuickDetails;
    full: FullDetails;
  };
};

type FetchSnapshot = {
  ok: boolean;
  status: number;
  final_url: string;
  html: string;
  headers: Headers;
  ttfb_ms: number | null;
  error?: string | null;
};

type PsiResult = {
  ok: boolean;
  metrics: PageSpeedMetrics | null;
  opportunities: Opportunity[];
  page_weight_bytes: number | null;
  error: string | null;
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SECONDARY_BROWSER_UA =
  'Mozilla/5.0 (X11; Linux x86_64; rv:123.0) Gecko/20100101 Firefox/123.0';
const FETCH_TIMEOUT_MS = 15_000;
const FETCH_RETRY_TIMEOUT_MS = 25_000;

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${bytes} Б`;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    return url.toString();
  } catch {
    return value;
  }
}

async function fetchPage(url: string): Promise<FetchSnapshot> {
  const attemptPlan = [
    { timeoutMs: FETCH_TIMEOUT_MS, userAgent: BROWSER_UA },
    { timeoutMs: FETCH_RETRY_TIMEOUT_MS, userAgent: SECONDARY_BROWSER_UA },
  ];
  const candidates = /^https:\/\//i.test(url) ? [url, url.replace(/^https:\/\//i, 'http://')] : [url];

  let lastSnapshot: FetchSnapshot | null = null;

  for (const candidate of candidates) {
    for (let index = 0; index < attemptPlan.length; index += 1) {
      const attempt = attemptPlan[index];
      const started = process.hrtime.bigint();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), attempt.timeoutMs);

      try {
        const response = await fetch(candidate, {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'User-Agent': attempt.userAgent,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
          },
          cache: 'no-store',
          signal: controller.signal,
        });
        const ttfb_ms = Number((Number(process.hrtime.bigint() - started) / 1_000_000).toFixed(0));
        const html = await response.text();

        clearTimeout(timer);

        return {
          ok: response.ok,
          status: response.status,
          final_url: response.url || candidate,
          html,
          headers: response.headers,
          ttfb_ms,
          error: null,
        };
      } catch (error) {
        clearTimeout(timer);
        lastSnapshot = {
          ok: false,
          status: 0,
          final_url: candidate,
          html: '',
          headers: new Headers(),
          ttfb_ms: null,
          error:
            error instanceof DOMException && error.name === 'AbortError'
              ? 'timeout'
              : error instanceof Error
                ? error.message || error.name
                : String(error || 'fetch_error'),
        };
      }

      if (index < attemptPlan.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
  }

  return (
    lastSnapshot || {
      ok: false,
      status: 0,
      final_url: url,
      html: '',
      headers: new Headers(),
      ttfb_ms: null,
      error: 'fetch_error',
    }
  );
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

function detectCdn(headers: Headers) {
  const server = (headers.get('server') || '').toLowerCase();
  const via = (headers.get('via') || '').toLowerCase();
  const xCache = (headers.get('x-cache') || '').toLowerCase();

  if (headers.has('cf-ray') || server.includes('cloudflare')) return 'Cloudflare';
  if (headers.has('x-vercel-cache') || server.includes('vercel')) return 'Vercel';
  if (headers.has('x-amz-cf-id')) return 'CloudFront';
  if (headers.has('x-served-by') || server.includes('fastly') || via.includes('fastly')) {
    return 'Fastly';
  }
  if (server.includes('qrator')) return 'Qrator';
  if (server.includes('akamai') || headers.has('akamai-grn')) return 'Akamai';
  if (xCache.includes('hit') || via.includes('cdn')) return 'CDN';

  return null;
}

function detectCacheState(headers: Headers): CacheState {
  const cacheControl = (headers.get('cache-control') || '').toLowerCase();
  const pragma = (headers.get('pragma') || '').toLowerCase();
  const xCache = (headers.get('x-cache') || '').toLowerCase();
  const vercelCache = (headers.get('x-vercel-cache') || '').toLowerCase();
  const cfCache = (headers.get('cf-cache-status') || '').toLowerCase();
  const hasValidator = headers.has('etag') || headers.has('last-modified');

  const hasHit = xCache.includes('hit') || vercelCache === 'hit' || cfCache === 'hit';
  const maxAge = cacheControl.match(/max-age=(\d+)/)?.[1];
  const maxAgeValue = maxAge ? Number(maxAge) : 0;

  if (hasHit || (cacheControl.includes('public') && maxAgeValue > 0)) {
    return 'good';
  }

  if (cacheControl.includes('no-store') || cacheControl.includes('no-cache') || pragma.includes('no-cache')) {
    return 'none';
  }

  if (!cacheControl) {
    return hasValidator ? 'partial' : 'none';
  }

  if (hasValidator) {
    return 'partial';
  }

  return 'unknown';
}


function detectServerCache(headers: Headers, html: string, ttfbMs: number | null): ServerCacheState {
  const headerValues = [
    headers.get('x-cache'),
    headers.get('x-litespeed-cache'),
    headers.get('x-varnish'),
    headers.get('x-proxy-cache'),
    headers.get('x-fastcgi-cache'),
    headers.get('cf-cache-status'),
    headers.get('x-rocket-nginx-serving-static'),
    headers.get('x-cache-enabled'),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    headerValues.includes('hit') ||
    headerValues.includes('miss') ||
    headerValues.includes('bypass') ||
    headerValues.includes('varnish') ||
    headerValues.includes('litespeed')
  ) {
    return 'likely';
  }

  const htmlLower = html.toLowerCase();
  const dynamicCms =
    htmlLower.includes('wp-content') ||
    htmlLower.includes('/bitrix/') ||
    htmlLower.includes('bx.setcsslist') ||
    htmlLower.includes('wordpress');

  if (dynamicCms && ttfbMs !== null && ttfbMs < 100) {
    return 'likely';
  }

  return 'not_detected';
}

function ttfbState(ttfb: number | null): TtfbState {
  if (!ttfb) return 'unknown';
  if (ttfb > 2000) return 'critical';
  if (ttfb > 800) return 'slow';
  if (ttfb >= 200) return 'normal';
  return 'fast';
}

function lcpState(value: number | null): MetricState {
  if (value === null) return 'unknown';
  if (value > 4000) return 'critical';
  if (value >= 2500) return 'slow';
  return 'good';
}

function clsState(value: number | null): MetricState {
  if (value === null) return 'unknown';
  return value > 0.1 ? 'problem' : 'good';
}

function tbtState(value: number | null): MetricState {
  if (value === null) return 'unknown';
  return value > 300 ? 'problem' : value < 200 ? 'good' : 'slow';
}

async function fetchPsi(strategy: 'mobile' | 'desktop', url: string): Promise<PsiResult> {
  const key = process.env.PAGESPEED_API_KEY;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('strategy', strategy);
    endpoint.searchParams.set('category', 'performance');
    if (key) endpoint.searchParams.set('key', key);

    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        metrics: null,
        opportunities: [],
        page_weight_bytes: null,
        error: data?.error?.message || `PSI ${strategy} returned ${response.status}`,
      };
    }

    const audits = data?.lighthouseResult?.audits || {};
    const performanceScore = toNumber(data?.lighthouseResult?.categories?.performance?.score);
    const resourceSummary = audits['resource-summary']?.details?.items;
    const totalBytes = Array.isArray(resourceSummary)
      ? resourceSummary.reduce((sum: number, item: any) => sum + (Number(item?.transferSize) || 0), 0)
      : toNumber(audits['total-byte-weight']?.numericValue);

    const opportunityIds = [
      'modern-image-formats',
      'uses-optimized-images',
      'offscreen-images',
      'render-blocking-resources',
      'unused-javascript',
      'unused-css-rules',
      'font-display',
    ];

    const opportunities = opportunityIds
      .map((id) => {
        const audit = audits[id];
        if (!audit) return null;

        const savingsMs = toNumber(audit?.details?.overallSavingsMs) ?? toNumber(audit?.numericValue);
        const savingsBytes = toNumber(audit?.details?.overallSavingsBytes);

        if ((savingsMs || 0) <= 0 && (savingsBytes || 0) <= 0 && audit.score !== 0) {
          return null;
        }

        return {
          id,
          title: audit.title || id,
          savings_ms: savingsMs,
          savings_bytes: savingsBytes,
        } satisfies Opportunity;
      })
      .filter(Boolean) as Opportunity[];

    return {
      ok: true,
      metrics: {
        performance_score: performanceScore !== null ? Math.round(performanceScore * 100) : null,
        fcp_ms: toNumber(audits['first-contentful-paint']?.numericValue),
        lcp_ms: toNumber(audits['largest-contentful-paint']?.numericValue),
        cls: toNumber(audits['cumulative-layout-shift']?.numericValue),
        tbt_ms: toNumber(audits['total-blocking-time']?.numericValue),
        speed_index_ms: toNumber(audits['speed-index']?.numericValue),
      },
      opportunities,
      page_weight_bytes: totalBytes,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? `Анализ ${strategy} превысил лимит 30 секунд`
        : error instanceof Error
          ? error.message
          : 'PSI request failed';

    return {
      ok: false,
      metrics: null,
      opportunities: [],
      page_weight_bytes: null,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hasOpportunity(opportunities: Opportunity[], ids: string[]) {
  return opportunities.some((item) => ids.includes(item.id));
}

function getSeverityRank(severity: Severity) {
  if (severity === 'critical') return 0;
  if (severity === 'warn') return 1;
  return 2;
}

function pushProblem(cards: ProblemCard[], card: ProblemCard) {
  if (!cards.some((item) => item.title === card.title && item.action === card.action)) {
    cards.push(card);
  }
}

function buildProblemCards(
  quick: QuickDetails,
  full: FullDetails
): { verdict: Verdict; verdict_title: string; verdict_summary: string; problem_cards: ProblemCard[] } {
  const cards: ProblemCard[] = [];
  const mobileLcp = lcpState(full.mobile?.lcp_ms ?? null);
  const mobileCls = clsState(full.mobile?.cls ?? null);
  const mobileTbt = tbtState(full.mobile?.tbt_ms ?? null);
  const psiPartial = Boolean((full.mobile && !full.desktop) || (!full.mobile && full.desktop));
  const noCdn = !quick.cdn;
  const mobileGap = full.mobile_gap ?? 0;
  const hasImageIssue = hasOpportunity(full.opportunities, [
    'modern-image-formats',
    'uses-optimized-images',
    'offscreen-images',
  ]);
  const hasJsBlocking = hasOpportunity(full.opportunities, [
    'render-blocking-resources',
    'unused-javascript',
    'unused-css-rules',
  ]);
  const hasFontsIssue = hasOpportunity(full.opportunities, ['font-display']);

  if (!full.psi_available) {
    pushProblem(cards, {
      severity: 'warn',
      title: 'Полный Lighthouse-анализ недоступен',
      action: 'Повторите проверку позже или проверьте лимиты PageSpeed Insights API.',
      reason: full.psi_error || 'Не удалось получить mobile и desktop данные.',
    });
  } else if (psiPartial) {
    pushProblem(cards, {
      severity: 'warn',
      title: 'Анализ скорости собран частично',
      action: 'Повторите проверку: одна из стратегий PSI не завершилась вовремя.',
      reason: full.mobile ? full.desktop_error || 'Desktop-анализ не завершился.' : full.mobile_error || 'Mobile-анализ не завершился.',
    });
  }

  if (quick.ttfb_state === 'slow' || quick.ttfb_state === 'critical') {
    if (quick.cms === 'Битрикс') {
      pushProblem(cards, {
        severity: 'critical',
        title: 'Сервер отвечает медленно',
        action: 'Проверьте Битрикс Композит, серверную нагрузку и тяжёлые запросы к базе.',
        reason: 'TTFB выше нормы, страница долго начинает отдавать HTML.',
      });
    } else if (quick.cms === 'WordPress') {
      pushProblem(cards, {
        severity: 'critical',
        title: 'Сервер отвечает медленно',
        action: 'Проверьте тяжёлые плагины, object/page cache и нагрузку на PHP и базу.',
        reason: 'TTFB выше нормы, страница долго начинает отдавать HTML.',
      });
    } else if (quick.cms === 'Next.js') {
      pushProblem(cards, {
        severity: 'critical',
        title: 'Сервер отвечает медленно',
        action: 'Проверьте SSR/ISR, запросы к API и базу данных на серверной стороне.',
        reason: 'TTFB выше нормы, HTML собирается слишком долго.',
      });
    } else if (quick.cms === 'Тильда') {
      pushProblem(cards, {
        severity: 'warn',
        title: 'Сервер отвечает медленно',
        action: 'Платформа ограничивает тонкую оптимизацию. Проверьте тяжёлые блоки и внешний код.',
        reason: 'TTFB выше нормы, страница долго начинает загружаться.',
      });
    } else {
      pushProblem(cards, {
        severity: 'critical',
        title: 'Сервер отвечает медленно',
        action: 'Проверьте сервер, базу данных и код рендера. Нужна задача разработчику.',
        reason: 'TTFB выше нормы, страница долго начинает отдавать HTML.',
      });
    }
  }

  if ((mobileLcp === 'slow' || mobileLcp === 'critical') && hasImageIssue) {
    pushProblem(cards, {
      severity: mobileLcp === 'critical' ? 'critical' : 'warn',
      title: 'Изображения замедляют загрузку',
      action: 'Конвертируйте изображения в WebP или AVIF — это обычно снижает вес страницы на 30–50%.',
      reason: 'LCP медленный и Lighthouse видит проблемы по изображениям.',
    });
  }

  if ((mobileLcp === 'slow' || mobileLcp === 'critical') && hasJsBlocking) {
    pushProblem(cards, {
      severity: mobileLcp === 'critical' ? 'critical' : 'warn',
      title: 'JavaScript блокирует загрузку',
      action: 'Добавьте defer/async и разберите тяжёлые JS/CSS ресурсы. Это задача разработчику.',
      reason: 'LCP медленный и есть render-blocking ресурсы.',
    });
  }

  if (mobileTbt === 'problem' && quick.cms === 'WordPress') {
    pushProblem(cards, {
      severity: 'warn',
      title: 'Тяжёлые плагины тормозят сайт',
      action: 'Отключите неиспользуемые плагины и проверьте нагрузку на страницу.',
      reason: 'Высокий TBT на WordPress.',
    });
  }

  if (hasFontsIssue) {
    pushProblem(cards, {
      severity: 'improve',
      title: 'Внешние шрифты замедляют загрузку',
      action: 'Перенесите шрифты на свой сервер или сократите набор шрифтов.',
      reason: 'Найдены проблемы со шрифтами.',
    });
  }

  if (noCdn && (quick.ttfb_ms || 0) > 500) {
    pushProblem(cards, {
      severity: 'improve',
      title: 'CDN не подключён',
      action: 'Добавьте CDN для ускорения сайта в регионах России.',
      reason: 'TTFB выше 500 мс и CDN не определяется.',
    });
  }

  if (mobileGap > 30) {
    pushProblem(cards, {
      severity: 'warn',
      title: 'Мобильная версия намного хуже десктопа',
      action: 'Нужна отдельная задача разработчику на мобильную оптимизацию.',
      reason: `Разрыв между desktop и mobile: ${mobileGap} пунктов.`,
    });
  }

  if (mobileCls === 'problem') {
    pushProblem(cards, {
      severity: 'warn',
      title: 'Элементы страницы прыгают при загрузке',
      action: 'Укажите размеры изображений и блоков. Это задача разработчику.',
      reason: 'CLS выше 0,1.',
    });
  }

  cards.sort((left, right) => getSeverityRank(left.severity) - getSeverityRank(right.severity));

  const hasCritical = cards.some((item) => item.severity === 'critical');
  const hasWarn = cards.some((item) => item.severity === 'warn');
  const hasImprove = cards.some((item) => item.severity === 'improve');

  if (hasCritical) {
    return {
      verdict: 'fail',
      verdict_title: 'Есть проблемы со скоростью',
      verdict_summary: 'Сначала исправьте сервер и крупные блокирующие узкие места.',
      problem_cards: cards,
    };
  }

  if (hasWarn) {
    return {
      verdict: 'warn',
      verdict_title: 'Скорость средняя — есть что улучшить',
      verdict_summary: 'Критичных проблем нет, но часть узких мест уже влияет на загрузку.',
      problem_cards: cards,
    };
  }

  if (hasImprove) {
    return {
      verdict: 'ok',
      verdict_title: 'Сайт загружается быстро',
      verdict_summary: 'Критичных проблем нет, но есть небольшие улучшения по фронтенду и инфраструктуре.',
      problem_cards: cards,
    };
  }

  return {
    verdict: 'ok',
    verdict_title: 'Сайт загружается быстро',
    verdict_summary: 'Явных проблем со скоростью не обнаружено.',
    problem_cards: [],
  };
}

function buildQuickPayload(inputUrl: string, snapshot: FetchSnapshot): SpeedCheckResponse {
  const quick: QuickDetails = {
    http_status: snapshot.status,
    final_url: snapshot.final_url,
    ttfb_ms: snapshot.ttfb_ms,
    ttfb_state: ttfbState(snapshot.ttfb_ms),
    cache_state: detectCacheState(snapshot.headers),
    server_cache_state: detectServerCache(snapshot.headers, snapshot.html, snapshot.ttfb_ms),
    cache_control: snapshot.headers.get('cache-control'),
    content_encoding: snapshot.headers.get('content-encoding'),
    cms: detectCms(snapshot.html, snapshot.headers),
    cdn: detectCdn(snapshot.headers),
  };

  const summary = buildProblemCards(quick, {
    mobile: null,
    desktop: null,
    mobile_gap: null,
    page_weight_bytes: null,
    opportunities: [],
    google_fonts_detected: /fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(snapshot.html),
    psi_available: false,
    psi_error: null,
    mobile_error: null,
    desktop_error: null,
  });

  return {
    ok: true,
    phase: 'quick',
    checked_at: new Date().toISOString(),
    input_url: inputUrl,
    final_url: snapshot.final_url,
    verdict: summary.verdict,
    verdict_title: summary.verdict_title,
    verdict_summary: summary.verdict_summary,
    loading_text: 'Запускаем полный анализ...',
    problem_cards: summary.problem_cards,
    details: {
      quick,
      full: {
        mobile: null,
        desktop: null,
        mobile_gap: null,
        page_weight_bytes: null,
        opportunities: [],
        google_fonts_detected: /fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(snapshot.html),
        psi_available: false,
        psi_error: null,
        mobile_error: null,
        desktop_error: null,
      },
    },
  };
}

async function buildFullPayload(inputUrl: string, snapshot: FetchSnapshot): Promise<SpeedCheckResponse> {
  const quick = buildQuickPayload(inputUrl, snapshot).details.quick;
  const googleFontsDetected = /fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(snapshot.html);

  const [mobile, desktop] = await Promise.all([
    fetchPsi('mobile', snapshot.final_url),
    fetchPsi('desktop', snapshot.final_url),
  ]);

  const full: FullDetails = {
    mobile: mobile.metrics,
    desktop: desktop.metrics,
    mobile_gap:
      mobile.metrics &&
      desktop.metrics &&
      mobile.metrics.performance_score !== null &&
      desktop.metrics.performance_score !== null
        ? desktop.metrics.performance_score - mobile.metrics.performance_score
        : null,
    page_weight_bytes: mobile.page_weight_bytes ?? desktop.page_weight_bytes ?? null,
    opportunities: [...mobile.opportunities, ...desktop.opportunities].filter(
      (item, index, array) => array.findIndex((other) => other.id === item.id) === index
    ),
    google_fonts_detected: googleFontsDetected,
    psi_available: mobile.ok || desktop.ok,
    psi_error: !mobile.ok && !desktop.ok ? mobile.error || desktop.error || null : null,
    mobile_error: mobile.error || null,
    desktop_error: desktop.error || null,
  };

  const summary = buildProblemCards(quick, full);

  return {
    ok: true,
    phase: 'full',
    checked_at: new Date().toISOString(),
    input_url: inputUrl,
    final_url: snapshot.final_url,
    verdict: summary.verdict,
    verdict_title: summary.verdict_title,
    verdict_summary: summary.verdict_summary,
    loading_text: null,
    problem_cards: summary.problem_cards,
    details: {
      quick,
      full,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; phase?: Phase };
    const inputUrl = normalizeUrl((body.url || '').trim());
    const phase: Phase = body.phase === 'full' ? 'full' : 'quick';

    if (!inputUrl) {
      return NextResponse.json({ ok: false, error: 'Неверный URL' }, { status: 400 });
    }

    const snapshot = await fetchPage(inputUrl);

    if (!snapshot.status) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Не удалось получить ответ от страницы',
          reason: snapshot.error || 'fetch_error',
        },
        { status: 502 }
      );
    }

    const payload =
      phase === 'full'
        ? await buildFullPayload(inputUrl, snapshot)
        : buildQuickPayload(inputUrl, snapshot);

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Ошибка сервиса' },
      { status: 500 }
    );
  }
}
