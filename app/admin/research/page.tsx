import { listSeoResearch } from '@/lib/db/seo-research';
import AdminResearchDashboard from '@/components/admin-research-dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminResearchPage() {
  const researches = await listSeoResearch(100);

  return (
    <main className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-gray-900">Сбор семантики</h2>
        <p className="mt-2 text-sm text-gray-600">
          Исследование по URL инструмента: контекст, seed-запросы, Wordstat, ручная очистка, распределение и
          контент-план.
        </p>
      </div>
      <AdminResearchDashboard initialResearches={researches} />
    </main>
  );
}
