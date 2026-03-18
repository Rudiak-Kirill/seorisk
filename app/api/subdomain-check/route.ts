import { NextResponse } from 'next/server';
import { runSubdomainCheck } from '@/lib/subdomain-check';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { domain?: string };
    const rawDomain = (body.domain || '').trim();

    if (!rawDomain) {
      return NextResponse.json({ ok: false, error: 'Введите домен' }, { status: 400 });
    }

    const payload = await runSubdomainCheck(rawDomain);
    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Не удалось проверить поддомены',
      },
      { status: 500 }
    );
  }
}
