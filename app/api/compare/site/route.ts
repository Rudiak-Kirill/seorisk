import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const REQUEST_TIMEOUT_MS = 90_000;
const INTERNAL_COMPARE_ORIGIN = (process.env.INTERNAL_COMPARE_ORIGIN || '').replace(/\/+$/, '');

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

async function postJson<T>(origins: string[], path: string, body: unknown, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    for (const origin of origins) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
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

          if (response.status === 429 && attempt === 0) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
            continue;
          }

          const text = await response.text();
          if (!text) continue;

          try {
            return JSON.parse(text) as T;
          } catch {
            continue;
          }
        } catch {
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

    const [siteProfileResult, speedResult, ssrResult, indexResult, llmResult, subdomainResult] =
      await Promise.allSettled([
        postJson<SiteProfileResponse>(origins, '/api/site-profile', { url: siteUrl, phase: 'full' }),
        postJson<SpeedCheckResponse>(origins, '/api/speed-check', { url: siteUrl, phase: 'full' }),
        postJson<SsrCheckResponse>(origins, '/api/ssr-check', { url: siteUrl }),
        postJson<IndexCheckResponse>(origins, '/api/index-check', { url: siteUrl }),
        postJson<LlmCheckResponse>(origins, '/api/llm-check', { url: siteUrl }),
        postJson<SubdomainCheckResponse>(origins, '/api/subdomain-check', { domain }),
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

    if (!siteProfile) errors.push('site_profile');
    if (!speed) errors.push('speed');
    if (!ssr) errors.push('ssr');
    if (!index) errors.push('index');
    if (!llm) errors.push('llm');
    if (!subdomains) errors.push('subdomains');

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
