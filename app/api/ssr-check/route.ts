import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string };
    const url = (body.url || "").trim();
    if (!url) {
      return NextResponse.json({ ok: false, error: "Неверный URL" }, { status: 400 });
    }

    const engineUrl = process.env.PY_ENGINE_URL;
    if (!engineUrl) {
      return NextResponse.json({ ok: false, error: "PY_ENGINE_URL не задан" }, { status: 500 });
    }

    const target = engineUrl.includes("?")
      ? `${engineUrl}&url=${encodeURIComponent(url)}`
      : `${engineUrl}?url=${encodeURIComponent(url)}`;

    const upstream = await fetch(target, { method: "GET" });
    const text = await upstream.text();

    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "application/json",
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
