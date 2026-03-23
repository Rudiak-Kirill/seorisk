import { NextResponse } from 'next/server';
import {
  deleteQueriesByResearch,
  getSeoResearchById,
  insertQueries,
  updateSeoResearch,
} from '@/lib/db/seo-research';
import {
  extractResearchContext,
  generateSeedQueries,
  type ResearchPageContext,
} from '@/lib/semantic-research';
import { jsonError, requireAdminApi } from '@/lib/admin-api';

export const runtime = 'nodejs';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeSeed(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildEmergencySeeds(context: ResearchPageContext) {
  const basePhrases = [context.h1, context.title, context.description]
    .map((item) => normalizeSeed(item || ''))
    .filter((item) => item.length > 5)
    .slice(0, 3);

  const variants = new Set<string>();

  for (const phrase of basePhrases) {
    variants.add(phrase);
    variants.add(`проверить ${phrase}`);
    variants.add(`${phrase} seo`);
    variants.add(`${phrase} googlebot`);
    variants.add(`${phrase} чекер`);
  }

  return Array.from(variants).filter((item) => item.length > 5).slice(0, 20);
}

export async function POST(_request: Request, context: RouteContext) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  try {
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

    let seeds;
    try {
      seeds = await generateSeedQueries(pageContext);
    } catch (error) {
      console.error('admin seed generation fallback triggered', error);
      seeds = {
        queries: buildEmergencySeeds(pageContext),
        raw: null,
        source: 'fallback' as const,
      };
    }

    if (!seeds.queries.length) {
      seeds = {
        queries: buildEmergencySeeds(pageContext),
        raw: null,
        source: 'fallback' as const,
      };
    }

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
  } catch (error) {
    console.error('admin seed generation failed', error);
    const details = error instanceof Error ? error.message : 'неизвестная ошибка';
    return jsonError(`Не удалось сгенерировать seed-запросы: ${details}`, 500);
  }
}
