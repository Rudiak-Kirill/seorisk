import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <main>
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-12 lg:gap-8">
            <div className="sm:text-center md:max-w-2xl md:mx-auto lg:col-span-7 lg:text-left">
              <h1 className="text-4xl font-bold text-gray-900 tracking-tight sm:text-5xl md:text-6xl">
                SEORISK
                <span className="block text-orange-500">
                  Быстрый аудит SSR/ботов
                </span>
              </h1>
              <p className="mt-3 text-base text-gray-700 sm:mt-5 sm:text-xl lg:text-lg xl:text-xl">
                Проверка расхождений между контентом, который видит браузер, и
                тем, что получают поисковые боты.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Button asChild size="lg" className="rounded-full">
                  <Link href="/tools/ssr-check">
                    Открыть SSR Check
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full">
                  <Link href="/sign-in">Войти</Link>
                </Button>
              </div>
            </div>
            <div className="mt-12 sm:max-w-lg sm:mx-auto lg:mt-0 lg:max-w-none lg:mx-0 lg:col-span-5">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Инструменты
                </h2>
                <p className="mt-2 text-sm text-gray-700">
                  Начни с SSR Check. Дальше добавим новые инструменты в этой
                  витрине.
                </p>
                <div className="mt-4 rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        SSR Check
                      </div>
                      <div className="text-xs text-gray-700">
                        Сравнение браузер / боты
                      </div>
                    </div>
                    <Link
                      href="/tools/ssr-check"
                      className="text-sm font-medium text-orange-600 hover:text-orange-700"
                    >
                      Перейти →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
