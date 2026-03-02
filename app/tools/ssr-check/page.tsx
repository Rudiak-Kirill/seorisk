"use client";

import { useMemo, useState } from "react";

type Snapshot = {
  http_code: number;
  text_len: number;
  links_count: number;
  has_h1: boolean;
  has_title: boolean;
  access_state?: string | null;
};

type CheckResponse = {
  ok: boolean;
  url: string;
  checked_at: string;
  verdict: "ok" | "mismatch";
  reasons: string[];
  checks: {
    browser: Snapshot;
    yandex: Snapshot;
    google: Snapshot;
  };
  error?: string;
};

const labelMap = {
  http: "HTTP",
  text_len: "Текст",
  links: "Ссылки",
  h1: "H1",
  title: "Title",
  access: "Access",
} as const;

const formatSnapshot = (snap: Snapshot) => ({
  http: snap.http_code,
  text_len: snap.text_len,
  links: snap.links_count,
  h1: snap.has_h1 ? "есть" : "нет",
  title: snap.has_title ? "есть" : "нет",
  access: snap.access_state || "ok",
});

const cleanReasons = (reasons: string[]) =>
  reasons
    .filter((r) => !/http_code=0|access=error/i.test(r))
    .map((r) =>
      r
        .replace(/^yandex:\s*/i, "Яндекс: ")
        .replace(/^google:\s*/i, "Google: ")
        .replace("text_diff", "текст отличается")
        .replace("links_diff", "ссылки отличаются")
        .replace("h1_diff", "H1 отличается")
        .replace("title_diff", "Title отличается"),
    );

function ResultCard({
  title,
  snap,
  diffSet,
}: {
  title: "browser" | "yandex" | "google";
  snap: ReturnType<typeof formatSnapshot>;
  diffSet: Set<string>;
}) {
  const hasDiff = (kind: string) => diffSet.has(`${title}: ${kind}`);
  const rowClass = (kind: string) =>
    `flex items-center justify-between border-b border-dashed border-[#eee3d7] py-1 text-sm ${
      hasDiff(kind) ? "text-[#b2271d] font-semibold" : ""
    }`;

  return (
    <div className="rounded-lg border border-[#e3d6c7] bg-[#fffefb] p-3">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      <div className={rowClass("http_code")}>
        <span>{labelMap.http}</span>
        <span>{snap.http}</span>
      </div>
      <div className={rowClass("text_diff")}>
        <span>{labelMap.text_len}</span>
        <span>{snap.text_len}</span>
      </div>
      <div className={rowClass("links_diff")}>
        <span>{labelMap.links}</span>
        <span>{snap.links}</span>
      </div>
      <div className={rowClass("h1_diff")}>
        <span>{labelMap.h1}</span>
        <span>{snap.h1}</span>
      </div>
      <div className={rowClass("title_diff")}>
        <span>{labelMap.title}</span>
        <span>{snap.title}</span>
      </div>
      <div className="flex items-center justify-between py-1 text-sm">
        <span>{labelMap.access}</span>
        <span>{snap.access}</span>
      </div>
    </div>
  );
}

export default function SsrCheckPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CheckResponse | null>(null);

  const diffSet = useMemo(() => new Set(data?.reasons || []), [data?.reasons]);
  const reasons = useMemo(() => cleanReasons(data?.reasons || []), [data?.reasons]);

  const onCheck = async () => {
    if (!url.trim()) {
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const resp = await fetch("/api/ssr-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await resp.json()) as CheckResponse & { error?: string };
      if (!resp.ok || payload.ok === false) {
        setError(payload.error || "Ошибка");
        return;
      }
      setData(payload);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const status = data?.verdict === "ok" ? "ОК" : data ? "Есть расхождения" : "";

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-3xl font-semibold">SEO Risk Check</h1>
        <p className="mt-2 text-[15px] text-[var(--muted)]">
          Разовая проверка URL. Ограничение: 1 URL на IP в сутки.
        </p>

        <div className="mt-6 rounded-xl border border-[#eadfd2] bg-[var(--card)] p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              className="flex-1 rounded-md border border-[#cdbca8] px-4 py-3 text-sm"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              onClick={onCheck}
              disabled={loading}
            >
              {loading ? "Проверяем..." : "Проверить"}
            </button>
          </div>

          <div className="mt-4 text-sm text-[var(--muted)]">
            {loading ? "Проверяем..." : status}
          </div>

          {error && (
            <div className="mt-3 rounded-md bg-black px-4 py-3 text-sm text-white">
              {error}
            </div>
          )}

          {data && (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <ResultCard
                  title="browser"
                  snap={formatSnapshot(data.checks.browser)}
                  diffSet={diffSet}
                />
                <ResultCard
                  title="yandex"
                  snap={formatSnapshot(data.checks.yandex)}
                  diffSet={diffSet}
                />
                <ResultCard
                  title="google"
                  snap={formatSnapshot(data.checks.google)}
                  diffSet={diffSet}
                />
              </div>

              {reasons.length > 0 && (
                <div className="mt-4 rounded-lg border border-[#e3d6c7] bg-[#fffefb] p-4">
                  <div className="space-y-1 text-sm text-[#b2271d]">
                    {reasons.map((r) => (
                      <div key={r}>• {r}</div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
