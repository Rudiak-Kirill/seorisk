import { NextResponse } from 'next/server';
import { createSeoResearch, listSeoResearch } from '@/lib/db/seo-research';
import { jsonError, requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

function normalizeUrl(value: string) {
  const prepared = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return new URL(prepared).toString();
}

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const items = await listSeoResearch(100);
  return NextResponse.json({ ok: true, items });
}

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
    const body = (await request.json()) as { url?: string };
    const url = normalizeUrl((body.url || '').trim());
    const id = await createSeoResearch(url);
    return NextResponse.json({ ok: true, id });
  } catch {
    return jsonError('Неверный URL');
  }
}
