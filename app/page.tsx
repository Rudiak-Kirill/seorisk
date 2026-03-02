import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl px-6 py-16">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold">SEO Risk Check</h1>
          <p className="mt-2 text-[15px] text-[var(--muted)]">
            Набор инструментов для быстрой проверки SEO-рисков.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          <Link
            href="/tools/ssr-check"
            className="rounded-xl border border-[#eadfd2] bg-[var(--card)] p-5 shadow-sm transition hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">SSR Check</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Сравнение HTML для браузера и ботов.
                </p>
              </div>
              <span className="text-sm text-[var(--accent)]">Открыть →</span>
            </div>
          </Link>
        </section>
      </main>
    </div>
  );
}
