import { getUser } from '@/lib/db/queries';

const DEFAULT_ADMIN_EMAILS = ['rudyak.kirill@gmail.com'];

function getAdminEmails() {
  const configured = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.length ? configured : DEFAULT_ADMIN_EMAILS;
}

export async function getAdminUser() {
  const user = await getUser();
  if (!user) return null;

  const adminEmails = new Set(getAdminEmails());
  return adminEmails.has(user.email.toLowerCase()) ? user : null;
}

export async function ensureAdminUser() {
  const user = await getAdminUser();
  if (!user) {
    throw new Error('Доступ запрещён');
  }
  return user;
}
