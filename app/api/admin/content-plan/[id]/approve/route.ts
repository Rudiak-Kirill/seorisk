import { NextResponse } from 'next/server';
import { getContentPlanItem, updateContentPlanItem } from '@/lib/db/seo-research';
import { jsonError, requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const item = await getContentPlanItem(id);
  if (!item) return jsonError('Запись контент-плана не найдена', 404);

  const now = new Date();
  await updateContentPlanItem(id, {
    isApproved: true,
    approvedAt: now,
    status: 'approved',
    updatedAt: now,
  });

  return NextResponse.json({ ok: true });
}
