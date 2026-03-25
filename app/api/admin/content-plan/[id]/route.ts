import { NextResponse } from 'next/server';
import {
  deleteContentPlanItem,
  getContentPlanItem,
  updateContentPlanItem,
} from '@/lib/db/seo-research';
import { normalizeContentPlanBrief, normalizeStringArray } from '@/lib/content-plan-brief';
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
    mainQuery?: string;
    secondaryQueries?: string[];
    generationSettings?: Record<string, unknown>;
    requiredBlocks?: string[];
    articleOutline?: string[];
    faqItems?: string[];
    schemaTypes?: string[];
    linkingHints?: string[];
    notesForLlm?: string | null;
    articlePreview?: string | null;
    plannedDate?: string | null;
    status?: string;
    isApproved?: boolean;
    approvedAt?: string | null;
    publishedAt?: string | null;
    publishedUrl?: string | null;
  };

  const brief = normalizeContentPlanBrief(
    {
      secondaryQueries: body.secondaryQueries,
      generationSettings: body.generationSettings,
      requiredBlocks: body.requiredBlocks,
      articleOutline: body.articleOutline,
      faqItems: body.faqItems,
      schemaTypes: body.schemaTypes,
      linkingHints: body.linkingHints,
      notesForLlm: body.notesForLlm || '',
    },
    item.contentType
  );

  await updateContentPlanItem(id, {
    title: body.title ?? item.title,
    metaDescription: body.metaDescription ?? item.metaDescription,
    mainQuery: body.mainQuery ? body.mainQuery.trim() : item.mainQuery,
    secondaryQueries: body.secondaryQueries ? normalizeStringArray(body.secondaryQueries) : item.secondaryQueries,
    generationSettings: body.generationSettings ? brief.generationSettings : item.generationSettings,
    requiredBlocks: body.requiredBlocks ? normalizeStringArray(body.requiredBlocks) : item.requiredBlocks,
    articleOutline: body.articleOutline ? normalizeStringArray(body.articleOutline) : item.articleOutline,
    faqItems: body.faqItems ? normalizeStringArray(body.faqItems) : item.faqItems,
    schemaTypes: body.schemaTypes ? normalizeStringArray(body.schemaTypes) : item.schemaTypes,
    linkingHints: body.linkingHints ? normalizeStringArray(body.linkingHints) : item.linkingHints,
    notesForLlm: body.notesForLlm ?? item.notesForLlm,
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
