import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db/drizzle';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import { llmChecks } from '@/lib/db/schema';

export const runtime = 'nodejs';

const defaultAgents = ['gptbot', 'claudebot', 'perplexitybot'];

function deriveLlmCheckSummary(payload: any) {
  const checks = payload?.checks;
  const browser = checks?.browser;

  if (!checks || !browser) {
    return {
      verdict: 'error',
      reasons: ['missing_checks'],
    };
  }

  const reasons: string[] = [];

  for (const [agentKey, snap] of Object.entries<any>(checks)) {
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
      return NextResponse.json(
        { ok: false, error: 'Неверный URL' },
        { status: 400 }
      );
    }

    const baseEngine = process.env.PY_LLM_ENGINE_URL || process.env.PY_ENGINE_URL;
    if (!baseEngine) {
      return NextResponse.json(
        { ok: false, error: 'PY_ENGINE_URL не задан' },
        { status: 500 }
      );
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

    try {
      const db = ensureDb();
      const user = await getUser();
      const userWithTeam = user ? await getUserWithTeam(user.id) : null;
      const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const userAgent = req.headers.get('user-agent') || null;

      let details: any = { status: upstream.status };
      let verdict: string | null = null;
      let reasons: string[] | null = null;

      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          details = parsed;
          const summary = deriveLlmCheckSummary(parsed);
          verdict = summary.verdict;
          reasons = summary.reasons;
        } catch {
          details = {
            status: upstream.status,
            raw: raw.length > 10000 ? `${raw.slice(0, 10000)}...` : raw,
          };
          verdict = 'error';
          reasons = ['invalid_json'];
        }
      } else {
        details = { status: upstream.status, raw: '' };
        verdict = 'error';
        reasons = ['empty_response'];
      }

      await db.insert(llmChecks).values({
        teamId: userWithTeam?.teamId || null,
        userId: user?.id || null,
        url,
        verdict,
        reasons,
        details,
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

    if (contentType.includes('application/json')) {
      return new NextResponse(raw, {
        status: upstream.status || 502,
        headers: { 'Content-Type': contentType },
      });
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
