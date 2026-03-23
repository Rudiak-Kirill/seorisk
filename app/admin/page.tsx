import Link from 'next/link';

const toolCards = [
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
];

const reportCards = [
  {
    href: '/admin/ssr',
    title: 'SSR отчёт',
    description: 'История SSR-проверок, статусы и экспорт.',
  },
  {
    href: '/admin/llm',
    title: 'LLM отчёт',
    description: 'История LLM-проверок и доступности AI-ботов.',
  },
  {
    href: '/admin/index',
    title: 'Index отчёт',
    description: 'История проверок индексации и блокировок.',
  },
];

const userCards = [
  {
    href: '/admin/users',
    title: 'Пользователи',
    description: 'Администраторы, команды и доступ к внутренним разделам.',
  },
];

function AdminCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-3xl border border-gray-200 bg-white p-6 transition hover:border-orange-200 hover:shadow-sm"
    >
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
    </Link>
  );
}

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

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Инструменты</h2>
          <p className="mt-1 text-sm text-gray-600">Семантика и контент-план для страниц инструментов.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {toolCards.map((card) => (
            <AdminCard key={card.href} {...card} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Отчёты</h2>
          <p className="mt-1 text-sm text-gray-600">Отдельные внутренние отчёты по SSR, LLM и индексации.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {reportCards.map((card) => (
            <AdminCard key={card.href} {...card} />
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Пользователи</h2>
          <p className="mt-1 text-sm text-gray-600">Доступы, роли и управление участниками.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-1">
          {userCards.map((card) => (
            <AdminCard key={card.href} {...card} />
          ))}
        </div>
      </section>
    </main>
  );
}
