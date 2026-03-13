import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getUser } from '@/lib/db/queries';
import { getSiteUrl } from '@/lib/site-url';

const tools = [
  {
    title: 'SSR Check',
    description: 'Сравнение браузера и SEO-ботов',
    href: '/tools/ssr-check',
  },
  {
    title: 'LLM Check',
    description: 'Сравнение браузера и LLM-ботов',
    href: '/tools/llm-check',
  },
  {
    title: 'Index Check',
    description: 'HTTP, robots.txt, meta robots и sitemap',
    href: '/tools/index-check',
  },
];

export default async function HomePage() {
  const user = await getUser();
  const siteUrl = getSiteUrl();
  const toolsJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'SEORISK tools',
    itemListElement: tools.map((tool, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'SoftwareApplication',
        name: tool.title,
        description: tool.description,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: `${siteUrl}${tool.href}`,
      },
    })),
  };

  return (
    <main>
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(toolsJsonLd) }}
          />
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            <div className="sm:text-center md:mx-auto md:max-w-2xl lg:col-span-7 lg:text-left">
              <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl">
                SEORISK
                <span className="block text-orange-500">
                  Проверка рендеринга и индексируемости
                </span>
              </h1>
              <p className="mt-3 text-base text-gray-700 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                Проверяйте, что видят браузер, поисковые и LLM-боты, и не теряется ли
                страница для индексации из-за `robots.txt`, `meta robots` или sitemap.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Button asChild size="lg" className="rounded-full">
                  <Link href="/tools/ssr-check">
                    Открыть инструменты
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full">
                  <Link href={user ? '/dashboard' : '/sign-in'}>
                    {user ? 'Кабинет' : 'Войти'}
                  </Link>
                </Button>
              </div>
            </div>

            <div className="mt-12 sm:mx-auto sm:max-w-2xl lg:col-span-5 lg:mx-0 lg:mt-0 lg:max-w-none">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">Инструменты</h2>
                <p className="mt-2 text-sm text-gray-700">
                  Три отдельные проверки: рендеринг для SEO-ботов, ответы LLM-ботам и
                  базовая индексируемость страницы.
                </p>

                <div className="mt-4 grid gap-3">
                  {tools.map((tool) => (
                    <div key={tool.href} className="rounded-xl border border-gray-200 p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{tool.title}</div>
                          <div className="text-xs text-gray-700">{tool.description}</div>
                        </div>
                        <Link
                          href={tool.href}
                          className="text-sm font-medium text-orange-600 hover:text-orange-700"
                        >
                          Перейти -&gt;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
