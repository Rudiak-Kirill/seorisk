import { NextResponse } from 'next/server';
import {
  deleteContentPlanItem,
  getContentPlanItem,
  updateContentPlanItem,
} from '@/lib/db/seo-research';
import { jsonError, requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const item = await getContentPlanItem(id);
  if (!item) return jsonError('Запись контент-плана не найдена', 404);

  const body = (await request.json()) as {
    title?: string;
    metaDescription?: string | null;
    articlePreview?: string | null;
    plannedDate?: string | null;
    status?: string;
    isApproved?: boolean;
    approvedAt?: string | null;
    publishedAt?: string | null;
    publishedUrl?: string | null;
  };

  await updateContentPlanItem(id, {
    title: body.title ?? item.title,
    metaDescription: body.metaDescription ?? item.metaDescription,
    articlePreview: body.articlePreview ?? item.articlePreview,
    plannedDate: body.plannedDate ?? item.plannedDate,
    status: body.status ?? item.status,
    isApproved: body.isApproved ?? item.isApproved,
    approvedAt: body.approvedAt ? new Date(body.approvedAt) : body.approvedAt === null ? null : item.approvedAt,
    publishedAt: body.publishedAt ? new Date(body.publishedAt) : body.publishedAt === null ? null : item.publishedAt,
    publishedUrl: body.publishedUrl ?? item.publishedUrl,
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  await deleteContentPlanItem(id);
  return NextResponse.json({ ok: true });
}
