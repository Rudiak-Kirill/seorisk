import { NextResponse } from 'next/server';
import { ensureDb } from '@/lib/db/drizzle';
import { ssrChecks } from '@/lib/db/schema';
import { getUser, getUserWithTeam } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string; ua?: string };
    const url = (body.url || '').trim();
    const ua = (body.ua || req.headers.get('user-agent') || '').trim();
    if (!url) {
      return NextResponse.json(
        { ok: false, error: 'Неверный URL' },
        { status: 400 }
      );
    }

    const engineUrl = process.env.PY_ENGINE_URL;
    if (!engineUrl) {
      return NextResponse.json(
        { ok: false, error: 'PY_ENGINE_URL не задан' },
        { status: 500 }
      );
    }

    const base = engineUrl.includes('?')
      ? `${engineUrl}&url=${encodeURIComponent(url)}`
      : `${engineUrl}?url=${encodeURIComponent(url)}`;
    const target = ua ? `${base}&ua=${encodeURIComponent(ua)}` : base;

    const upstream = await fetch(target, { method: 'GET' });
    const text = await upstream.text();

    try {
      const db = ensureDb();
      const user = await getUser();
      const userWithTeam = user ? await getUserWithTeam(user.id) : null;
      const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const ua = req.headers.get('user-agent') || null;
      let details: any = { status: upstream.status };
      let verdict: string | null = null;
      let reasons: any = null;

      try {
        const parsed = JSON.parse(text);
        details = parsed;
        verdict = parsed?.verdict || null;
        reasons = parsed?.reasons || null;
      } catch {
        const raw = text.length > 10000 ? `${text.slice(0, 10000)}...` : text;
        details = { status: upstream.status, raw };
      }

      await db.insert(ssrChecks).values({
        teamId: userWithTeam?.teamId || null,
        userId: user?.id || null,
        url,
        verdict,
        reasons,
        details,
        ipAddress: ip,
        userAgent: ua,
      });
    } catch {
      // ignore db logging errors
    }

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        'Content-Type':
          upstream.headers.get('content-type') || 'application/json'
      }
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
