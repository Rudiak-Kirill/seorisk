import Link from 'next/link';

const cards = [
  {
    href: '/admin/research',
    title: 'Семантика',
    description: 'Сбор seed-запросов, Wordstat, очистка, распределение и кластеризация.',
  },
  {
    href: '/admin/content-plan',
    title: 'Контент-план',
    description: 'План публикаций, генерация черновиков, ревью, даты и статусы.',
  },
  {
    href: '/admin/ssr',
    title: 'SSR Checks',
    description: 'История SSR-проверок и экспорт.',
  },
];

export default function AdminHomePage() {
  return (
    <main className="space-y-6">
      <section className="rounded-3xl border border-gray-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-gray-900">Внутренние инструменты</h2>
        <p className="mt-2 max-w-3xl text-sm text-gray-600">
          Здесь собирается семантика по страницам инструментов, формируется контент-план и хранится история
          проверок.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-3xl border border-gray-200 bg-white p-6 transition hover:border-orange-200 hover:shadow-sm"
          >
            <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-600">{card.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
