import { notFound } from 'next/navigation';
import {
  getClustersForResearch,
  getContentPlanByResearch,
  getQueriesForResearch,
  getSeoResearchById,
} from '@/lib/db/seo-research';
import { buildCleanupSuggestions } from '@/lib/semantic-research';
import AdminResearchDetail from '@/components/admin-research-detail';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminResearchDetailPage({ params }: PageProps) {
  const { id } = await params;
  const research = await getSeoResearchById(id);
  if (!research) notFound();

  const [queries, clusters, contentPlan] = await Promise.all([
    getQueriesForResearch(id),
    getClustersForResearch(id),
    getContentPlanByResearch(id),
  ]);

  const cleanupSuggestions = buildCleanupSuggestions(
    queries.map((item) => ({
      id: item.id,
      query: item.query,
      frequency: item.frequency || 0,
    }))
  );

  return (
    <AdminResearchDetail
      initialData={{
        research,
        queries,
        clusters,
        contentPlan,
        cleanupSuggestions,
      }}
    />
  );
}
