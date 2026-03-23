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

  try {
    const { id } = await context.params;
    const research = await getSeoResearchById(id);
    if (!research) return jsonError('Исследование не найдено', 404);

    const seedQueries = (await getQueriesForResearch(id))
      .filter((item) => item.source === 'seed')
      .map((item) => item.query);

    const expansion = await expandQueriesWithWordstat(seedQueries);

    if (expansion.status === 'auth_error') {
      return jsonError('Wordstat: токен недействителен или у приложения нет доступа к API', 502);
    }

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

    const message =
      expansion.status === 'token_missing'
        ? 'Wordstat не подключён'
        : expansion.status === 'quota_limited'
          ? `Лимит Wordstat исчерпан, часть запросов пропущена. Безопасный режим: ${expansion.seedLimit} seed × ${expansion.sourceCount} источника`
          : `Использован безопасный режим: ${expansion.seedLimit} seed × ${expansion.sourceCount} источника`;

    return NextResponse.json({
      ok: true,
      count: expansion.items.length,
      status: expansion.status,
      message,
      processedSeeds: expansion.processedSeeds,
      seedLimit: expansion.seedLimit,
      sourceCount: expansion.sourceCount,
    });
  } catch (error) {
    console.error('admin wordstat expansion failed', error);
    return jsonError('Не удалось расширить семантику через Wordstat', 500);
  }
}
