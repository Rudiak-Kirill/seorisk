import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string };
    const url = (body.url || '').trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: 'Неверный URL' }, { status: 400 });
    }

    const baseEngine = process.env.PY_INDEX_ENGINE_URL || process.env.PY_ENGINE_URL;
    if (!baseEngine) {
      return NextResponse.json(
        { ok: false, error: 'PY_INDEX_ENGINE_URL не задан' },
        { status: 500 }
      );
    }

    const engineUrl = baseEngine.includes('index_check.py')
      ? baseEngine
      : baseEngine.replace('check.py', 'index_check.py');

    const target = engineUrl.includes('?')
      ? `${engineUrl}&url=${encodeURIComponent(url)}`
      : `${engineUrl}?url=${encodeURIComponent(url)}`;

    const upstream = await fetch(target, { method: 'GET' });
    const raw = await upstream.text();
    const contentType = upstream.headers.get('content-type') || '';

    if (!raw) {
      return NextResponse.json(
        { ok: false, error: 'Пустой ответ от сервиса' },
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
        raw: raw.slice(0, 500),
      },
      { status: 502 }
    );
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
