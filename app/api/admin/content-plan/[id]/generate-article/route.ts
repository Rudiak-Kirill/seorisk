import { NextResponse } from 'next/server';
import {
  getContentPlanItem,
  getQueriesForResearch,
  updateContentPlanItem,
} from '@/lib/db/seo-research';
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

  const draft = await generateArticleDraft({
    title: item.title,
    mainQuery: item.mainQuery,
    metaDescription: item.metaDescription || '',
    sourceUrl: item.sourceUrl,
    clusterQueries,
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
