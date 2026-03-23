import { NextResponse } from 'next/server';
import {
  getQueriesForResearch,
  getSeoResearchById,
  updateQueriesAssignments,
  updateSeoResearch,
} from '@/lib/db/seo-research';
import { classifyQueries } from '@/lib/semantic-research';
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

    const rows = (await getQueriesForResearch(id)).filter(
      (item) => item.destination !== 'deleted'
    );
    const classification = await classifyQueries(
      {
        title: research.title || '',
        description: research.description || '',
      },
      rows.map((item) => ({
        query: item.query,
        frequency: item.frequency || 0,
      }))
    );

    const lookup = new Map(
      classification.map((item) => [item.query.trim().toLowerCase(), item])
    );
    await updateQueriesAssignments(
      rows.map((row) => {
        const classified = lookup.get(row.query.trim().toLowerCase());
        return {
          id: row.id,
          destination: classified?.destination || row.destination,
          type: classified?.type || row.type,
          relevance: classified?.relevance ?? row.relevance,
          reason: classified?.reason || row.reason,
          clusterId: null,
        };
      })
    );
    await updateSeoResearch(id, { status: 'cleaning', updatedAt: new Date() });

    return NextResponse.json({ ok: true, count: classification.length });
  } catch (error) {
    console.error('admin query classification failed', error);
    return jsonError('Не удалось классифицировать запросы', 500);
  }
}
