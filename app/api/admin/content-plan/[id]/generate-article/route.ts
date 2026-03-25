import { NextResponse } from 'next/server';
import {
  getContentPlanItem,
  getQueriesForResearch,
  updateContentPlanItem,
} from '@/lib/db/seo-research';
import { normalizeContentPlanBrief } from '@/lib/content-plan-brief';
import { generateArticleDraft } from '@/lib/semantic-research';
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

  const researchQueries = await getQueriesForResearch(item.researchId);
  const clusterQueries = item.clusterId
    ? researchQueries
        .filter((query) => query.clusterId === item.clusterId)
        .map((query) => query.query)
    : researchQueries
        .filter((query) => query.destination === 'tool')
        .map((query) => query.query)
        .slice(0, 20);

  const brief = normalizeContentPlanBrief(
    {
      secondaryQueries: (item.secondaryQueries as string[] | null) ?? undefined,
      generationSettings: (item.generationSettings as Record<string, unknown> | null) ?? undefined,
      requiredBlocks: (item.requiredBlocks as string[] | null) ?? undefined,
      articleOutline: (item.articleOutline as string[] | null) ?? undefined,
      faqItems: (item.faqItems as string[] | null) ?? undefined,
      schemaTypes: (item.schemaTypes as string[] | null) ?? undefined,
      linkingHints: (item.linkingHints as string[] | null) ?? undefined,
      notesForLlm: item.notesForLlm || '',
    },
    item.contentType
  );

  const draft = await generateArticleDraft({
    title: item.title,
    mainQuery: item.mainQuery,
    metaDescription: item.metaDescription || '',
    sourceUrl: item.sourceUrl,
    clusterQueries,
    secondaryQueries: brief.secondaryQueries,
    generationSettings: brief.generationSettings,
    requiredBlocks: brief.requiredBlocks,
    articleOutline: brief.articleOutline,
    faqItems: brief.faqItems,
    schemaTypes: brief.schemaTypes,
    linkingHints: brief.linkingHints,
    notesForLlm: brief.notesForLlm,
  });

  await updateContentPlanItem(id, {
    title: draft.title,
    metaDescription: draft.meta_description,
    articlePreview: draft.article_markdown,
    status: 'review',
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true, draft });
}
