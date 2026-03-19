import { gunzipSync } from 'node:zlib';

const GZIP_MAGIC_BYTE_1 = 0x1f;
const GZIP_MAGIC_BYTE_2 = 0x8b;

export function looksLikeSitemapResource(value: string) {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith('.xml') || pathname.endsWith('.xml.gz') || pathname.includes('sitemap');
  } catch {
    const lowered = value.toLowerCase();
    return lowered.endsWith('.xml') || lowered.endsWith('.xml.gz') || lowered.includes('sitemap');
  }
}

function hasGzipMagic(buffer: Buffer) {
  return buffer.length >= 2 && buffer[0] === GZIP_MAGIC_BYTE_1 && buffer[1] === GZIP_MAGIC_BYTE_2;
}

function shouldGunzip(buffer: Buffer, finalUrl: string, headers: Headers) {
  const contentType = (headers.get('content-type') || '').toLowerCase();
  const contentEncoding = (headers.get('content-encoding') || '').toLowerCase();
  return (
    finalUrl.toLowerCase().includes('.xml.gz') ||
    contentType.includes('application/x-gzip') ||
    contentType.includes('application/gzip') ||
    contentType.includes('gzip') ||
    contentEncoding.includes('gzip') ||
    hasGzipMagic(buffer)
  );
}

export function decodeFetchedText(buffer: Buffer, finalUrl: string, headers: Headers) {
  if (!buffer.length) return '';

  let payload = buffer;
  if (shouldGunzip(buffer, finalUrl, headers)) {
    try {
      payload = gunzipSync(buffer);
    } catch {
      payload = buffer;
    }
  }

  return payload.toString('utf-8').replace(/^\uFEFF/, '');
}
