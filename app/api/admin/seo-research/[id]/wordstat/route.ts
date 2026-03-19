import { NextResponse } from 'next/server';
import {
  deleteQueriesByResearch,
  getQueriesForResearch,
  getSeoResearchById,
  insertQueries,
  updateSeoResearch,
} from '@/lib/db/seo-research';
import { expandQueriesWithWordstat } from '@/lib/semantic-research';
import { jsonError, requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const research = await getSeoResearchById(id);
  if (!research) return jsonError('Исследование не найдено', 404);

  const seedQueries = (await getQueriesForResearch(id))
    .filter((item) => item.source === 'seed')
    .map((item) => item.query);

  const expansion = await expandQueriesWithWordstat(seedQueries);
  await deleteQueriesByResearch(id, 'wordstat');
  await deleteQueriesByResearch(id, 'association');
  await insertQueries(
    id,
    expansion.items.map((item) => ({
      query: item.query,
      frequency: item.frequency,
      type: null,
      destination: null,
      relevance: null,
      clusterId: null,
      source: item.source,
      reason: null,
    }))
  );
  await updateSeoResearch(id, { status: 'cleaning', updatedAt: new Date() });

  return NextResponse.json({ ok: true, count: expansion.items.length });
}
