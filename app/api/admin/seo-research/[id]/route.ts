import { NextResponse } from 'next/server';
import {
  getClustersForResearch,
  getContentPlanByResearch,
  getQueriesForResearch,
  getSeoResearchById,
  updateSeoResearch,
} from '@/lib/db/seo-research';
import { buildCleanupSuggestions } from '@/lib/semantic-research';
import { jsonError, requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const research = await getSeoResearchById(id);
  if (!research) return jsonError('Исследование не найдено', 404);

  const [queryRows, clusterRows, contentPlanRows] = await Promise.all([
    getQueriesForResearch(id),
    getClustersForResearch(id),
    getContentPlanByResearch(id),
  ]);

  return NextResponse.json({
    ok: true,
    research,
    queries: queryRows,
    clusters: clusterRows,
    contentPlan: contentPlanRows,
    cleanupSuggestions: buildCleanupSuggestions(
      queryRows.map((item) => ({
        id: item.id,
        query: item.query,
        frequency: item.frequency || 0,
      }))
    ),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const research = await getSeoResearchById(id);
  if (!research) return jsonError('Исследование не найдено', 404);

  const body = (await request.json()) as {
    status?: string;
    title?: string | null;
    h1?: string | null;
    description?: string | null;
  };

  await updateSeoResearch(id, {
    status: body.status || research.status,
    title: body.title ?? research.title,
    h1: body.h1 ?? research.h1,
    description: body.description ?? research.description,
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true });
}
