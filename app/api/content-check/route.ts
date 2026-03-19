import { NextResponse } from 'next/server';
import { runContentCheck, type ContentPageType } from '@/lib/content-check';

export const runtime = 'nodejs';

const PAGE_TYPES = new Set<ContentPageType>([
  'product',
  'category',
  'article',
  'informational',
  'home',
  'landing',
  'contacts',
  'unknown',
]);

type RequestBody = {
  url?: string;
  pageType?: ContentPageType | null;
  mode?: 'page' | 'representative' | 'representative-article';
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RequestBody;
    const url = (body.url || '').trim();

    if (!url) {
      return NextResponse.json({ ok: false, error: 'Неверный URL' }, { status: 400 });
    }

    const pageType =
      body.pageType && PAGE_TYPES.has(body.pageType) ? body.pageType : undefined;

    const result = await runContentCheck(url, {
      overrideType: pageType,
      representativeMode: body.mode === 'representative' || body.mode === 'representative-article',
      representativeKind: body.mode === 'representative-article' ? 'article' : 'default',
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Ошибка сервиса',
      },
      { status: 500 }
    );
  }
}
