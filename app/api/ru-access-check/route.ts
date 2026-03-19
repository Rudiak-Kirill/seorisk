import { NextResponse } from 'next/server';
import { runRuAccessCheck } from '@/lib/ru-access-check';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string };
    const url = (body.url || '').trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: 'Неверный URL или домен' }, { status: 400 });
    }

    const result = await runRuAccessCheck(url, { includeExternal: true });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
