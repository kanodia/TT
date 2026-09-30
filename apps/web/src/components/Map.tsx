'use client';

import dynamic from 'next/dynamic';

export type { Pin } from './LeafletMap';

/** Leaflet touches `window`, so it only ever renders in the browser. */
export const Map = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="h-80 w-full animate-pulse rounded-xl bg-surface" />,
});
