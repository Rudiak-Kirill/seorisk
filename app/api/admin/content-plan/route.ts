import { NextResponse } from 'next/server';
import { listContentPlanItems } from '@/lib/db/seo-research';
import { requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const items = await listContentPlanItems();
  return NextResponse.json({ ok: true, items });
}
