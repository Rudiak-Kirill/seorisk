export function getSiteUrl() {
  const raw =
    process.env.BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://seorisk.ru';

  return raw.replace(/\/+$/, '');
}
