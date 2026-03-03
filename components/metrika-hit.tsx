'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type MetrikaHitProps = {
  metrikaId: number;
};

declare global {
  interface Window {
    ym?: (...args: any[]) => void;
  }
}

export function MetrikaHit({ metrikaId }: MetrikaHitProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!window.ym) return;
    const query = searchParams?.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    window.ym(metrikaId, 'hit', url, { referer: document.referrer });
  }, [pathname, searchParams, metrikaId]);

  return null;
}
