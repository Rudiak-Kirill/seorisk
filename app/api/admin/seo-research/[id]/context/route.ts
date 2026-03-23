import { NextResponse } from 'next/server';
import { getSeoResearchById, updateSeoResearch } from '@/lib/db/seo-research';
import { extractResearchContext } from '@/lib/semantic-research';
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

    const extracted = await extractResearchContext(research.url);
    await updateSeoResearch(id, {
      title: extracted.title,
      h1: extracted.h1,
      description: extracted.description,
      status: 'collecting',
      updatedAt: new Date(),
    });

    return NextResponse.json({ ok: true, context: extracted });
  } catch (error) {
    console.error('admin context extraction failed', error);
    return jsonError('Не удалось извлечь контекст страницы', 500);
  }
}
