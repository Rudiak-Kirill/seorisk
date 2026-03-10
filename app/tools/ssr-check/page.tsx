"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  rule_verdict?: "ok" | "warn" | "fail";
  rule_severity?: string;
  rule_id?: string;
  rule_summary?: string;
  rule_recommendation?: string;
  matched_rules?: {
    id: string;
    severity: string;
    verdict: string;
    summary: string;
    recommendation: string;
  }[];
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
    `flex items-center justify-between border-b border-dashed border-gray-200 py-1 text-sm ${
      hasDiff(kind) ? "text-red-600 font-semibold" : "text-gray-700"
    }`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-base font-semibold text-gray-900">{title}</h3>
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
      <div className="flex items-center justify-between py-1 text-sm text-gray-700">
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
  const ruleBadge =
    data?.rule_verdict === "fail"
      ? "FAIL"
      : data?.rule_verdict === "warn"
      ? "WARN"
      : data?.rule_verdict === "ok"
      ? "OK"
      : "";

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-semibold text-gray-900">Bot vs Browser SEO Check</h1>
        <p className="mt-2 text-sm text-gray-500">
          Проверьте, как вашу страницу видят Google, Яндекс и браузер.
        </p>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              className="flex-1"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              className="rounded-full"
              onClick={onCheck}
              disabled={loading}
            >
              {loading ? "Проверяем..." : "Проверить"}
            </Button>
          </div>

          <div className="mt-4 text-sm text-gray-600">
            {loading ? "Проверяем..." : status}
          </div>

          {error && (
            <div className="mt-3 rounded-md bg-black px-4 py-3 text-sm text-white">
              {error}
            </div>
          )}

          {data && (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
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

              <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span>{ruleBadge}</span>
                  <span>{data.rule_summary || "Итог проверки"}</span>
                </div>
                {data.rule_id && (
                  <div className="mt-1 text-xs text-gray-500">
                    Правило: {data.rule_id} • {data.rule_severity}
                  </div>
                )}
                {data.rule_recommendation && (
                  <div className="mt-2 text-sm text-gray-700">
                    {data.rule_recommendation}
                  </div>
                )}
              </div>

              {reasons.length > 0 && (
                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="space-y-1 text-sm text-red-600">
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
