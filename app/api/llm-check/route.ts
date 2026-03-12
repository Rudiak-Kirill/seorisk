import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const defaultAgents = ['gptbot', 'claudebot', 'perplexitybot'];

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
