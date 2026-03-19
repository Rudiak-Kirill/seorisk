import { NextResponse } from 'next/server';
import { ensureAdminUser } from '@/lib/auth/admin';

export async function requireAdminApi() {
  try {
    await ensureAdminUser();
    return null;
  } catch {
    return NextResponse.json({ ok: false, error: 'Доступ запрещён' }, { status: 403 });
  }
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
