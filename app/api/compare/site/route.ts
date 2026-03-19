import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const REQUEST_TIMEOUT_MS = 180_000;
const INTERNAL_COMPARE_ORIGIN = (process.env.INTERNAL_COMPARE_ORIGIN || '').replace(/\/+$/, '');
const CHECK_TIMEOUT_MS = {
  siteProfile: 120_000,
  speed: 135_000,
  ssr: 60_000,
  index: 60_000,
  llm: 120_000,
  subdomains: 75_000,
  content: 90_000,
} as const;

type SiteProfileResponse = {
  ok: boolean;
  site_url: string;
  final_url: string;
  profile: {
    type: string;
    domain_age_years: number | null;
    domain_age_label: string;
  };
  structure: {
    total_urls: number | null;
    commercial: { count: number | null; percent: number | null };
    informational: { count: number | null; percent: number | null };
    application: { count: number | null; percent: number | null };
    search: { count: number | null; percent: number | null };
    documents: { count: number | null; percent: number | null };
    video: { count: number | null; percent: number | null };
    faq: { count: number | null; percent: number | null };
    service: { count: number | null; percent: number | null };
    unknown: { count: number | null; percent: number | null };
    yandex_iks: string;
  };
  commerce: {
    critical: { found: number; total: number };
    important: { found: number; total: number };
    additional: { found: number; total: number };
  };
  technical: {
    cms: string;
    llms_txt: {
      status: 'ok' | 'warn' | 'fail';
    };
  };
};

type SpeedCheckResponse = {
  ok: boolean;
  details: {
    quick: {
      ttfb_ms: number | null;
    };
    full: {
      mobile: { performance_score: number | null } | null;
      desktop: { performance_score: number | null } | null;
    };
  };
};

type SsrSnapshot = {
  http_code: number;
  access_state?: string | null;
};

type SsrCheckResponse = {
  ok: boolean;
  checks?: {
    google?: SsrSnapshot;
    yandex?: SsrSnapshot;
  };
};

type IndexCheckResponse = {
  ok: boolean;
  canonical_ok: boolean;
  robots_allowed_for_page: boolean;
};

type LlmSnapshot = {
  http_code: number;
  access_state?: string | null;
};

type LlmCheckResponse = {
  ok: boolean;
  checks?: {
    gptbot?: LlmSnapshot;
  };
  ai_readiness?: {
    details?: {
      schema_priorities?: {
        critical?: {
          matched?: string[];
        };
      };
      faq_signals?: string[];
    };
  };
};

type SubdomainCheckResponse = {
  ok: boolean;
  summary: {
    found: number;
    checked: number;
  };
  regional: {
    found: number;
  };
  subdomains: Array<{
    category: 'regional' | 'technical' | 'environment' | 'application' | 'content' | 'unknown';
    state: 'working' | 'redirect' | 'closed' | 'missing' | 'timeout' | 'error';
    robots_blocked: boolean;
    noindex: boolean;
  }>;
};

type ContentCheckResponse = {
  ok: boolean;
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
};

type CompareSiteResponse = {
  ok: true;
  site_url: string;
  domain: string;
  metrics: {
    profile: {
      type: string | null;
      age_years: number | null;
      age_label: string | null;
      cms: string | null;
      yandex_iks: number | null;
    };
    structure: {
      sitemap_total: number | null;
      commercial_count: number | null;
      commercial_percent: number | null;
      informational_count: number | null;
      informational_percent: number | null;
      application_count: number | null;
      application_percent: number | null;
      search_count: number | null;
      search_percent: number | null;
      documents_count: number | null;
      documents_percent: number | null;
      video_count: number | null;
      video_percent: number | null;
      faq_count: number | null;
      faq_percent: number | null;
      service_count: number | null;
      service_percent: number | null;
      unknown_count: number | null;
      unknown_percent: number | null;
      commercial_signals_found: number | null;
      commercial_signals_total: number | null;
    };
    speed: {
      ttfb_ms: number | null;
      mobile_score: number | null;
      desktop_score: number | null;
    };
    bots: {
      googlebot_ok: boolean | null;
      yandexbot_ok: boolean | null;
    };
    indexability: {
      canonical_ok: boolean | null;
      robots_ok: boolean | null;
    };
    ai: {
      gptbot_ok: boolean | null;
      llms_txt: boolean | null;
      schema_critical: boolean | null;
      faq_found: boolean | null;
    };
    content: {
      page_type: string | null;
      representative_url: string | null;
      verdict: 'ok' | 'warn' | 'fail' | null;
      critical_count: number | null;
      important_count: number | null;
      improve_count: number | null;
      article_url: string | null;
      article_word_count: number | null;
      article_density_percent: number | null;
      article_author_found: boolean | null;
      article_schema_found: boolean | null;
      article_internal_links: number | null;
      article_images_count: number | null;
      items_on_page: number | null;
      pagination_pages: number | null;
      estimated_assortment: number | null;
      infinite_scroll: boolean | null;
    };
    subdomains: {
      found: number | null;
      checked: number | null;
      regional: number | null;
      open_dev_test: boolean | null;
    };
  };
  errors: string[];
};

function normalizeSiteUrl(rawValue: string) {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  try {
    const prepared = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(prepared);
    return `${url.origin}/`;
  } catch {
    return null;
  }
}

function parseInteger(value: string | number | null | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAccessible(snapshot?: { http_code: number; access_state?: string | null } | null) {
  if (!snapshot) return null;
  return snapshot.http_code === 200 && (snapshot.access_state || 'ok') === 'ok';
}

function getInternalOrigins(req: Request) {
  const requestOrigin = new URL(req.url).origin.replace(/\/+$/, '');
  const appBaseUrl = (process.env.BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '');

  return Array.from(
    new Set(
      [
        INTERNAL_COMPARE_ORIGIN,
        'http://127.0.0.1:3000',
        'http://localhost:3000',
        requestOrigin,
        appBaseUrl,
      ].filter(Boolean)
    )
  );
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

async function postJson<T>(
  origins: string[],
  path: string,
  body: unknown,
  timeoutMs = REQUEST_TIMEOUT_MS,
  retries = 3
): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (const origin of origins) {
      for (let attempt = 0; attempt < retries; attempt += 1) {
        try {
          const response = await fetch(new URL(path, origin), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-compare-internal': '1',
            },
            body: JSON.stringify(body),
            cache: 'no-store',
            signal: controller.signal,
          });

          if (isRetryableStatus(response.status) && attempt < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
            continue;
          }

          const text = await response.text();
          if (!text) continue;

          try {
            const parsed = JSON.parse(text) as T & { ok?: boolean };
            if (parsed && parsed.ok === false && attempt < retries - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
              continue;
            }

            return parsed as T;
          } catch {
            continue;
          }
        } catch {
          if (attempt < retries - 1) {
            await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
          }
          continue;
        }
      }
    }

    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string };
    const siteUrl = normalizeSiteUrl(body.url || '');

    if (!siteUrl) {
      return NextResponse.json({ ok: false, error: 'Неверный URL' }, { status: 400 });
    }

    const origins = getInternalOrigins(req);
    const domain = new URL(siteUrl).hostname.toLowerCase().replace(/^www\./, '');

    const [
      siteProfileResult,
      speedResult,
      ssrResult,
      indexResult,
      llmResult,
      subdomainResult,
      contentResult,
      articleContentResult,
    ] =
      await Promise.allSettled([
        postJson<SiteProfileResponse>(origins, '/api/site-profile', { url: siteUrl, phase: 'full' }, CHECK_TIMEOUT_MS.siteProfile),
        postJson<SpeedCheckResponse>(origins, '/api/speed-check', { url: siteUrl, phase: 'full' }, CHECK_TIMEOUT_MS.speed),
        postJson<SsrCheckResponse>(origins, '/api/ssr-check', { url: siteUrl }, CHECK_TIMEOUT_MS.ssr),
        postJson<IndexCheckResponse>(origins, '/api/index-check', { url: siteUrl }, CHECK_TIMEOUT_MS.index),
        postJson<LlmCheckResponse>(origins, '/api/llm-check', { url: siteUrl }, CHECK_TIMEOUT_MS.llm),
        postJson<SubdomainCheckResponse>(origins, '/api/subdomain-check', { domain }, CHECK_TIMEOUT_MS.subdomains),
        postJson<ContentCheckResponse>(
          origins,
          '/api/content-check',
          { url: siteUrl, mode: 'representative' },
          CHECK_TIMEOUT_MS.content
        ),
        postJson<ContentCheckResponse>(
          origins,
          '/api/content-check',
          { url: siteUrl, mode: 'representative-article' },
          CHECK_TIMEOUT_MS.content
        ),
      ]);

    const errors: string[] = [];

    const siteProfile =
      siteProfileResult.status === 'fulfilled' && siteProfileResult.value?.ok ? siteProfileResult.value : null;
    const speed =
      speedResult.status === 'fulfilled' && speedResult.value?.ok ? speedResult.value : null;
    const ssr = ssrResult.status === 'fulfilled' && ssrResult.value?.ok ? ssrResult.value : null;
    const index = indexResult.status === 'fulfilled' && indexResult.value?.ok ? indexResult.value : null;
    const llm = llmResult.status === 'fulfilled' && llmResult.value?.ok ? llmResult.value : null;
    const subdomains =
      subdomainResult.status === 'fulfilled' && subdomainResult.value?.ok ? subdomainResult.value : null;
    const content =
      contentResult.status === 'fulfilled' && contentResult.value?.ok ? contentResult.value : null;
    const articleContent =
      articleContentResult.status === 'fulfilled' && articleContentResult.value?.ok ? articleContentResult.value : null;

    if (!siteProfile) errors.push('site_profile');
    if (!speed) errors.push('speed');
    if (!ssr) errors.push('ssr');
    if (!index) errors.push('index');
    if (!llm) errors.push('llm');
    if (!subdomains) errors.push('subdomains');
    if (!content) errors.push('content');

    const commerceFound = siteProfile
      ? siteProfile.commerce.critical.found + siteProfile.commerce.important.found + siteProfile.commerce.additional.found
      : null;
    const commerceTotal = siteProfile
      ? siteProfile.commerce.critical.total + siteProfile.commerce.important.total + siteProfile.commerce.additional.total
      : null;

    const openDevTest = subdomains
      ? subdomains.subdomains.some(
          (item) => item.category === 'environment' && item.state === 'working' && !item.robots_blocked && !item.noindex
        )
      : null;
    const articleSummary =
      articleContent?.compare_summary.page_type === 'Статья' ? articleContent.compare_summary : null;

    const payload: CompareSiteResponse = {
      ok: true,
      site_url: siteUrl,
      domain,
      metrics: {
        profile: {
          type: siteProfile?.profile.type || null,
          age_years: siteProfile?.profile.domain_age_years ?? null,
          age_label: siteProfile?.profile.domain_age_label || null,
          cms: siteProfile?.technical.cms || null,
          yandex_iks: parseInteger(siteProfile?.structure.yandex_iks),
        },
        structure: {
          sitemap_total: siteProfile?.structure.total_urls ?? null,
          commercial_count: siteProfile?.structure.commercial.count ?? null,
          commercial_percent: siteProfile?.structure.commercial.percent ?? null,
          informational_count: siteProfile?.structure.informational.count ?? null,
          informational_percent: siteProfile?.structure.informational.percent ?? null,
          application_count: siteProfile?.structure.application.count ?? null,
          application_percent: siteProfile?.structure.application.percent ?? null,
          search_count: siteProfile?.structure.search.count ?? null,
          search_percent: siteProfile?.structure.search.percent ?? null,
          documents_count: siteProfile?.structure.documents.count ?? null,
          documents_percent: siteProfile?.structure.documents.percent ?? null,
          video_count: siteProfile?.structure.video.count ?? null,
          video_percent: siteProfile?.structure.video.percent ?? null,
          faq_count: siteProfile?.structure.faq.count ?? null,
          faq_percent: siteProfile?.structure.faq.percent ?? null,
          service_count: siteProfile?.structure.service.count ?? null,
          service_percent: siteProfile?.structure.service.percent ?? null,
          unknown_count: siteProfile?.structure.unknown.count ?? null,
          unknown_percent: siteProfile?.structure.unknown.percent ?? null,
          commercial_signals_found: commerceFound,
          commercial_signals_total: commerceTotal,
        },
        speed: {
          ttfb_ms: speed?.details.quick.ttfb_ms ?? null,
          mobile_score: speed?.details.full.mobile?.performance_score ?? null,
          desktop_score: speed?.details.full.desktop?.performance_score ?? null,
        },
        bots: {
          googlebot_ok: isAccessible(ssr?.checks?.google),
          yandexbot_ok: isAccessible(ssr?.checks?.yandex),
        },
        indexability: {
          canonical_ok: index?.canonical_ok ?? null,
          robots_ok: index?.robots_allowed_for_page ?? null,
        },
        ai: {
          gptbot_ok: isAccessible(llm?.checks?.gptbot),
          llms_txt: siteProfile ? siteProfile.technical.llms_txt.status === 'ok' : null,
          schema_critical: llm ? (llm.ai_readiness?.details?.schema_priorities?.critical?.matched?.length || 0) > 0 : null,
          faq_found: llm ? (llm.ai_readiness?.details?.faq_signals?.length || 0) > 0 : null,
        },
        content: {
          page_type: content?.compare_summary.page_type || null,
          representative_url: content?.compare_summary.representative_url || null,
          verdict: content
            ? content.compare_summary.critical_count > 0
              ? 'fail'
              : content.compare_summary.important_count > 0
                ? 'warn'
                : 'ok'
            : null,
          critical_count: content?.compare_summary.critical_count ?? null,
          important_count: content?.compare_summary.important_count ?? null,
          improve_count: content?.compare_summary.improve_count ?? null,
          article_url: articleSummary?.representative_url || null,
          article_word_count: articleSummary?.word_count ?? null,
          article_density_percent: articleSummary?.content_density_percent ?? null,
          article_author_found: articleSummary?.author_found ?? null,
          article_schema_found: articleSummary?.article_schema_found ?? null,
          article_internal_links: articleSummary?.internal_links ?? null,
          article_images_count: articleSummary?.content_images ?? null,
          items_on_page: content?.compare_summary.items_on_page ?? null,
          pagination_pages: content?.compare_summary.pagination_pages ?? null,
          estimated_assortment: content?.compare_summary.estimated_assortment ?? null,
          infinite_scroll: content?.compare_summary.infinite_scroll ?? null,
        },
        subdomains: {
          found: subdomains?.summary.found ?? null,
          checked: subdomains?.summary.checked ?? null,
          regional: subdomains?.regional.found ?? null,
          open_dev_test: openDevTest,
        },
      },
      errors,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Ошибка сервиса' },
      { status: 500 }
    );
  }
}
