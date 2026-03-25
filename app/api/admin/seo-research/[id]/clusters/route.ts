import { NextResponse } from 'next/server';
import {
  clearQueryClusters,
  getQueriesForResearch,
  getSeoResearchById,
  replaceClustersForResearch,
  replaceContentPlanForResearch,
  updateQueriesAssignments,
  updateSeoResearch,
} from '@/lib/db/seo-research';
import {
  buildContentPlanDrafts,
  clusterBlogQueries,
} from '@/lib/semantic-research';
import { jsonError, requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const research = await getSeoResearchById(id);
    if (!research) return jsonError('Исследование не найдено', 404);

    const rows = await getQueriesForResearch(id);
    const toolMainQuery =
      rows
        .filter((item) => item.destination === 'tool')
        .sort((left, right) => (right.frequency || 0) - (left.frequency || 0))[0]?.query ||
      rows[0]?.query ||
      null;
    const toolSecondaryQueries = rows
      .filter((item) => item.destination === 'tool' && item.query !== toolMainQuery)
      .sort((left, right) => (right.frequency || 0) - (left.frequency || 0))
      .map((item) => item.query)
      .slice(0, 12);

    const blogQueries = rows
      .filter((item) => item.destination === 'blog')
      .map((item) => ({
        id: item.id,
        query: item.query,
        frequency: item.frequency || 0,
      }));

    const clustered = clusterBlogQueries(blogQueries);
    const insertedClusters = await replaceClustersForResearch(
      id,
      clustered.map((item) => ({
        mainQuery: item.mainQuery,
        totalFrequency: item.totalFrequency,
        queriesCount: item.queriesCount,
      }))
    );

    await clearQueryClusters(id);
    const rowLookup = new Map(rows.map((item) => [item.id, item]));
    await updateQueriesAssignments(
      clustered.flatMap((cluster, index) =>
        cluster.queryIds.map((queryId) => {
          const row = rowLookup.get(queryId);
          return {
            id: queryId,
            destination: 'blog' as const,
            type: row?.type || null,
            relevance: row?.relevance ?? null,
            reason: row?.reason || null,
            clusterId: insertedClusters[index]?.id || null,
          };
        })
      )
    );

    const clusterQueriesById: Record<string, string[]> = {};
    clustered.forEach((cluster, index) => {
      const clusterId = insertedClusters[index]?.id;
      if (!clusterId) return;
      clusterQueriesById[clusterId] = cluster.queryIds
        .map((queryId) => rowLookup.get(queryId)?.query || '')
        .filter(Boolean)
        .slice(0, 12);
    });

    const planDrafts = buildContentPlanDrafts({
      researchId: id,
      researchUrl: research.url,
      toolMainQuery,
      toolSecondaryQueries,
      clusters: insertedClusters.map((item) => ({
        id: item.id,
        mainQuery: item.mainQuery,
        totalFrequency: item.totalFrequency,
      })),
      clusterQueriesById,
    });

    await replaceContentPlanForResearch(
      id,
      planDrafts.map((item) => ({
        clusterId: item.clusterId,
        sourceUrl: item.sourceUrl,
        targetUrl: item.targetUrl,
        contentType: item.contentType,
        title: item.title,
        metaDescription: item.metaDescription,
        mainQuery: item.mainQuery,
        secondaryQueries: item.secondaryQueries,
        generationSettings: item.generationSettings,
        requiredBlocks: item.requiredBlocks,
        articleOutline: item.articleOutline,
        faqItems: item.faqItems,
        schemaTypes: item.schemaTypes,
        linkingHints: item.linkingHints,
        notesForLlm: item.notesForLlm,
        articlePreview: null,
        plannedDate: null,
        status: 'draft',
        isApproved: false,
        approvedAt: null,
        publishedAt: null,
        publishedUrl: null,
      }))
    );

    await updateSeoResearch(id, { status: 'done', updatedAt: new Date() });

    return NextResponse.json({
      ok: true,
      clusters: insertedClusters.length,
      contentPlan: planDrafts.length,
    });
  } catch (error) {
    console.error('admin clustering failed', error);
    return jsonError('Не удалось создать кластеры и контент-план', 500);
  }
}
