import { NextResponse } from 'next/server';
import {
  getSeoResearchById,
  updateQueriesAssignments,
  updateSeoResearch,
} from '@/lib/db/seo-research';
import { jsonError, requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

type QueryUpdate = {
  id: string;
  destination?: 'tool' | 'blog' | 'unclear' | 'deleted' | null;
  type?: 'instrumental' | 'symptom' | 'technical' | 'informational' | null;
  relevance?: number | null;
  reason?: string | null;
  clusterId?: string | null;
};

export async function PATCH(request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const { id } = await context.params;
  const research = await getSeoResearchById(id);
  if (!research) return jsonError('Исследование не найдено', 404);

  const body = (await request.json()) as { updates?: QueryUpdate[] };
  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (!updates.length) return jsonError('Нет изменений');

  await updateQueriesAssignments(
    updates.map((item) => ({
      id: item.id,
      destination: item.destination || null,
      type: item.type || null,
      relevance: item.relevance ?? null,
      reason: item.reason || null,
      clusterId: item.clusterId || null,
    }))
  );
  await updateSeoResearch(id, { status: 'cleaning', updatedAt: new Date() });

  return NextResponse.json({ ok: true });
}
