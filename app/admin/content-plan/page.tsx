import { listContentPlanItems } from '@/lib/db/seo-research';
import AdminContentPlanTable from '@/components/admin-content-plan-table';

export const dynamic = 'force-dynamic';

export default async function AdminContentPlanPage() {
  const items = await listContentPlanItems();

  return (
    <main className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Контент-план</h2>
        <p className="mt-2 text-sm text-gray-600">
          Черновики, ревью, одобрение и даты публикаций для страниц инструментов и статей.
        </p>
      </div>
      <AdminContentPlanTable initialItems={items} />
    </main>
  );
}
