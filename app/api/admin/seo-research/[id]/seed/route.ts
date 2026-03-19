import { NextResponse } from 'next/server';
import {
  deleteQueriesByResearch,
  getSeoResearchById,
  insertQueries,
  updateSeoResearch,
} from '@/lib/db/seo-research';
import { extractResearchContext, generateSeedQueries } from '@/lib/semantic-research';
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

  const pageContext =
    research.title || research.h1 || research.description
      ? {
          url: research.url,
          finalUrl: research.url,
          title: research.title || '',
          h1: research.h1 || '',
          description: research.description || '',
          faq: [],
          mainText: '',
          textExcerpt: [research.title, research.h1, research.description]
            .filter(Boolean)
            .join(' '),
        }
      : await extractResearchContext(research.url);

  const seeds = await generateSeedQueries(pageContext);
  await deleteQueriesByResearch(id, 'seed');
  await insertQueries(
    id,
    seeds.queries.map((query) => ({
      query,
      frequency: 0,
      type: null,
      destination: null,
      relevance: null,
      clusterId: null,
      source: 'seed',
      reason: null,
    }))
  );
  await updateSeoResearch(id, { status: 'collecting', updatedAt: new Date() });

  return NextResponse.json({
    ok: true,
    count: seeds.queries.length,
    source: seeds.source,
  });
}
