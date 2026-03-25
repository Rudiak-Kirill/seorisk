import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { normalizeContentPlanBrief } from '@/lib/content-plan-brief';
import {
  clusters,
  contentPlan,
  queries,
  seoResearch,
  type Cluster,
  type ContentPlan,
  type Query,
  type SeoResearch,
} from '@/lib/db/schema';

type ResearchUpdate = Partial<
  Pick<SeoResearch, 'title' | 'h1' | 'description' | 'status' | 'updatedAt'>
>;

export async function listSeoResearch(limit = 50) {
  return db
    .select({
      id: seoResearch.id,
      url: seoResearch.url,
      title: seoResearch.title,
      h1: seoResearch.h1,
      description: seoResearch.description,
      status: seoResearch.status,
      createdAt: seoResearch.createdAt,
      updatedAt: seoResearch.updatedAt,
      queriesCount: sql<number>`count(${queries.id})`,
    })
    .from(seoResearch)
    .leftJoin(queries, eq(queries.researchId, seoResearch.id))
    .groupBy(seoResearch.id)
    .orderBy(desc(seoResearch.updatedAt))
    .limit(limit);
}

export async function createSeoResearch(url: string) {
  const id = crypto.randomUUID();
  await db.insert(seoResearch).values({
    id,
    url,
    status: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return id;
}

export async function updateSeoResearch(id: string, values: ResearchUpdate) {
  await db
    .update(seoResearch)
    .set({
      ...values,
      updatedAt: values.updatedAt || new Date(),
    })
    .where(eq(seoResearch.id, id));
}

export async function getSeoResearchById(id: string) {
  const result = await db
    .select()
    .from(seoResearch)
    .where(eq(seoResearch.id, id))
    .limit(1);

  return result[0] || null;
}

export async function getQueriesForResearch(researchId: string) {
  return db
    .select()
    .from(queries)
    .where(eq(queries.researchId, researchId))
    .orderBy(desc(queries.frequency), asc(queries.query));
}

export async function deleteQueriesByResearch(researchId: string, source?: string) {
  await db
    .delete(queries)
    .where(
      source
        ? and(eq(queries.researchId, researchId), eq(queries.source, source))
        : eq(queries.researchId, researchId)
    );
}

export async function insertQueries(
  researchId: string,
  items: Array<
    Pick<Query, 'query' | 'frequency' | 'type' | 'destination' | 'relevance' | 'clusterId' | 'source' | 'reason'>
  >
) {
  if (!items.length) return;

  const deduped = new Map<string, (typeof items)[number]>();
  for (const item of items) {
    const key = item.query.trim().toLowerCase();
    const current = deduped.get(key);
    if (!current || (item.frequency || 0) > (current.frequency || 0)) {
      deduped.set(key, item);
    }
  }

  await db.insert(queries).values(
    Array.from(deduped.values()).map((item) => ({
      id: crypto.randomUUID(),
      researchId,
      query: item.query.trim(),
      frequency: item.frequency || 0,
      type: item.type || null,
      destination: item.destination || null,
      relevance: item.relevance || null,
      clusterId: item.clusterId || null,
      source: item.source || 'seed',
      reason: item.reason || null,
      createdAt: new Date(),
    }))
  );
}

export async function updateQueriesAssignments(
  updates: Array<
    Pick<Query, 'id' | 'destination' | 'type' | 'relevance' | 'reason' | 'clusterId'>
  >
) {
  for (const item of updates) {
    await db
      .update(queries)
      .set({
        destination: item.destination || null,
        type: item.type || null,
        relevance: item.relevance || null,
        reason: item.reason || null,
        clusterId: item.clusterId || null,
      })
      .where(eq(queries.id, item.id));
  }
}

export async function updateQueryFrequencies(
  updates: Array<Pick<Query, 'id' | 'frequency'>>
) {
  for (const item of updates) {
    await db
      .update(queries)
      .set({
        frequency: item.frequency || 0,
      })
      .where(eq(queries.id, item.id));
  }
}

export async function getClustersForResearch(researchId: string) {
  return db
    .select()
    .from(clusters)
    .where(eq(clusters.researchId, researchId))
    .orderBy(desc(clusters.totalFrequency), asc(clusters.mainQuery));
}

export async function replaceClustersForResearch(
  researchId: string,
  items: Array<Pick<Cluster, 'mainQuery' | 'totalFrequency' | 'queriesCount'>>
) {
  await db.delete(clusters).where(eq(clusters.researchId, researchId));
  if (!items.length) return [];

  const rows = items.map((item) => ({
    id: crypto.randomUUID(),
    researchId,
    mainQuery: item.mainQuery,
    totalFrequency: item.totalFrequency || 0,
    queriesCount: item.queriesCount || 0,
    createdAt: new Date(),
  }));

  await db.insert(clusters).values(rows);
  return rows;
}

export async function clearQueryClusters(researchId: string) {
  await db
    .update(queries)
    .set({ clusterId: null })
    .where(eq(queries.researchId, researchId));
}

export async function getContentPlanByResearch(researchId: string) {
  return db
    .select()
    .from(contentPlan)
    .where(eq(contentPlan.researchId, researchId))
    .orderBy(
      asc(contentPlan.plannedDate),
      desc(contentPlan.updatedAt),
      asc(contentPlan.title)
    );
}

export async function listContentPlanItems() {
  const rows = await db
    .select({
      id: contentPlan.id,
      researchId: contentPlan.researchId,
      clusterId: contentPlan.clusterId,
      sourceUrl: contentPlan.sourceUrl,
      targetUrl: contentPlan.targetUrl,
      contentType: contentPlan.contentType,
      title: contentPlan.title,
      metaDescription: contentPlan.metaDescription,
      mainQuery: contentPlan.mainQuery,
      secondaryQueries: contentPlan.secondaryQueries,
      generationSettings: contentPlan.generationSettings,
      requiredBlocks: contentPlan.requiredBlocks,
      articleOutline: contentPlan.articleOutline,
      faqItems: contentPlan.faqItems,
      schemaTypes: contentPlan.schemaTypes,
      linkingHints: contentPlan.linkingHints,
      notesForLlm: contentPlan.notesForLlm,
      articlePreview: contentPlan.articlePreview,
      plannedDate: contentPlan.plannedDate,
      status: contentPlan.status,
      isApproved: contentPlan.isApproved,
      approvedAt: contentPlan.approvedAt,
      publishedAt: contentPlan.publishedAt,
      publishedUrl: contentPlan.publishedUrl,
      createdAt: contentPlan.createdAt,
      updatedAt: contentPlan.updatedAt,
      totalFrequency: clusters.totalFrequency,
      researchUrl: seoResearch.url,
    })
    .from(contentPlan)
    .leftJoin(clusters, eq(contentPlan.clusterId, clusters.id))
    .leftJoin(seoResearch, eq(contentPlan.researchId, seoResearch.id))
    .orderBy(
      asc(contentPlan.plannedDate),
      desc(clusters.totalFrequency),
      desc(contentPlan.updatedAt)
    );

  return rows.map((item) => ({
    ...item,
      ...normalizeContentPlanBrief(
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
      ),
    }));
}

export async function replaceContentPlanForResearch(
  researchId: string,
  items: Array<
    Pick<
      ContentPlan,
      | 'clusterId'
      | 'sourceUrl'
      | 'targetUrl'
      | 'contentType'
      | 'title'
      | 'metaDescription'
      | 'mainQuery'
      | 'secondaryQueries'
      | 'generationSettings'
      | 'requiredBlocks'
      | 'articleOutline'
      | 'faqItems'
      | 'schemaTypes'
      | 'linkingHints'
      | 'notesForLlm'
      | 'articlePreview'
      | 'plannedDate'
      | 'status'
      | 'isApproved'
      | 'approvedAt'
      | 'publishedAt'
      | 'publishedUrl'
    >
  >
) {
  await db.delete(contentPlan).where(eq(contentPlan.researchId, researchId));
  if (!items.length) return;

  const now = new Date();
  await db.insert(contentPlan).values(
    items.map((item) => {
      const brief = normalizeContentPlanBrief(
        {
          secondaryQueries: item.secondaryQueries as string[] | undefined,
          generationSettings: item.generationSettings as Record<string, unknown> | undefined,
          requiredBlocks: item.requiredBlocks as string[] | undefined,
          articleOutline: item.articleOutline as string[] | undefined,
          faqItems: item.faqItems as string[] | undefined,
          schemaTypes: item.schemaTypes as string[] | undefined,
          linkingHints: item.linkingHints as string[] | undefined,
          notesForLlm: item.notesForLlm || '',
        },
        item.contentType
      );

      return {
        id: crypto.randomUUID(),
        researchId,
        clusterId: item.clusterId || null,
        sourceUrl: item.sourceUrl,
        targetUrl: item.targetUrl,
        contentType: item.contentType,
        title: item.title,
        metaDescription: item.metaDescription || null,
        mainQuery: item.mainQuery,
        secondaryQueries: brief.secondaryQueries,
        generationSettings: brief.generationSettings,
        requiredBlocks: brief.requiredBlocks,
        articleOutline: brief.articleOutline,
        faqItems: brief.faqItems,
        schemaTypes: brief.schemaTypes,
        linkingHints: brief.linkingHints,
        notesForLlm: brief.notesForLlm || null,
        articlePreview: item.articlePreview || null,
        plannedDate: item.plannedDate || null,
        status: item.status || 'draft',
        isApproved: item.isApproved ?? false,
        approvedAt: item.approvedAt || null,
        publishedAt: item.publishedAt || null,
        publishedUrl: item.publishedUrl || null,
        createdAt: now,
        updatedAt: now,
      };
    })
  );
}

export async function updateContentPlanItem(
  id: string,
  values: Partial<
    Pick<
      ContentPlan,
      | 'title'
      | 'metaDescription'
      | 'mainQuery'
      | 'secondaryQueries'
      | 'generationSettings'
      | 'requiredBlocks'
      | 'articleOutline'
      | 'faqItems'
      | 'schemaTypes'
      | 'linkingHints'
      | 'notesForLlm'
      | 'articlePreview'
      | 'plannedDate'
      | 'status'
      | 'isApproved'
      | 'approvedAt'
      | 'publishedAt'
      | 'publishedUrl'
      | 'updatedAt'
    >
  >
) {
  const current = await getContentPlanItem(id);
  if (!current) return;

  const brief = normalizeContentPlanBrief(
    {
      secondaryQueries:
        (values.secondaryQueries as string[] | undefined) ?? ((current.secondaryQueries as string[] | null) ?? undefined),
      generationSettings:
        (values.generationSettings as Record<string, unknown> | undefined) ??
        ((current.generationSettings as Record<string, unknown> | null) ?? undefined),
      requiredBlocks:
        (values.requiredBlocks as string[] | undefined) ?? ((current.requiredBlocks as string[] | null) ?? undefined),
      articleOutline:
        (values.articleOutline as string[] | undefined) ?? ((current.articleOutline as string[] | null) ?? undefined),
      faqItems: (values.faqItems as string[] | undefined) ?? ((current.faqItems as string[] | null) ?? undefined),
      schemaTypes:
        (values.schemaTypes as string[] | undefined) ?? ((current.schemaTypes as string[] | null) ?? undefined),
      linkingHints:
        (values.linkingHints as string[] | undefined) ?? ((current.linkingHints as string[] | null) ?? undefined),
      notesForLlm: typeof values.notesForLlm === 'string' ? values.notesForLlm : current.notesForLlm || '',
    },
    current.contentType
  );

  await db
    .update(contentPlan)
    .set({
      ...values,
      secondaryQueries: brief.secondaryQueries,
      generationSettings: brief.generationSettings,
      requiredBlocks: brief.requiredBlocks,
      articleOutline: brief.articleOutline,
      faqItems: brief.faqItems,
      schemaTypes: brief.schemaTypes,
      linkingHints: brief.linkingHints,
      notesForLlm: brief.notesForLlm || null,
      updatedAt: values.updatedAt || new Date(),
    })
    .where(eq(contentPlan.id, id));
}

export async function deleteContentPlanItem(id: string) {
  await db.delete(contentPlan).where(eq(contentPlan.id, id));
}

export async function getContentPlanItem(id: string) {
  const result = await db
    .select()
    .from(contentPlan)
    .where(eq(contentPlan.id, id))
    .limit(1);

  const item = result[0] || null;
  if (!item) return null;

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

  return {
    ...item,
    ...brief,
  };
}

export async function getQueriesByIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select().from(queries).where(inArray(queries.id, ids));
}
