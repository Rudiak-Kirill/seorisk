import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const secret = process.env.AUTH_SECRET || "";
  return NextResponse.json({
    auth_secret_present: secret.length > 0,
    auth_secret_length: secret.length,
  });
}
