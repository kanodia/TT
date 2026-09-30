'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PlacePicker } from '@/components/Header';
import { CardGridSkeleton, RestaurantCard } from '@/components/RestaurantCard';
import { Empty, ErrorNote, Spinner } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { nm } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Card, Listing } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Home = {
  nearbyCount: number;
  cityId: string | null;
  chips: { key: string; label: string; labelHi: string; filter: string }[];
  cuisines: { slug: string; name: string; nameHi: string | null; icon: string | null; count: number }[];
  collections: { key: string; slug?: string; title: string; titleHi: string; description?: string | null; filter: string | null; items: Card[] }[];
};

function Nearby({ lat, lng }: { lat: number; lng: number }) {
  const { t } = useSession();
  const query = { lat, lng, sort: 'relevance', radius_km: 25, limit: 12 };
  const first = useApi<Listing>('/v1/restaurants', query);
  const [more, setMore] = useState<{ key: string; items: Card[]; next: string | null }>({ key: '', items: [], next: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = `${lat},${lng}`;
  const extra = more.key === key ? more : null;
  const next = extra ? extra.next : first.data?.nextCursor;

  async function loadMore() {
    if (!next) return;
    setBusy(true);
    try {
      const r = await api<Listing>('/v1/restaurants', { query: { ...query, cursor: next } });
      setMore({ key, items: [...(extra?.items ?? []), ...r.data], next: r.nextCursor });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (first.loading) return <CardGridSkeleton />;
  if (first.error) return <ErrorNote message={first.error} onRetry={first.reload} />;
  const items = [...(first.data?.data ?? []), ...(extra?.items ?? [])];
  return (
    <>
      <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r, i) => (
          <RestaurantCard key={r.id} r={r} position={i} />
        ))}
      </div>
      <ErrorNote message={error} />
      {next && (
        <div className="mt-8 text-center">
          <button className="btn-outline" onClick={loadMore} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : t('action.showMore')}
          </button>
        </div>
      )}
    </>
  );
}

export default function HomePage() {
  const { place, lang, config, t, tp } = useSession();
  const home = useApi<Home>('/v1/home', { lat: place.lat, lng: place.lng });
  const [picking, setPicking] = useState(false);
  const data = home.data;

  return (
    <div>
      <section className="bg-gradient-to-br from-brand to-brand/80 text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
          <h1 className="max-w-xl text-3xl font-bold sm:text-4xl">{lang === 'hi' ? config.brand.taglineHi : config.brand.tagline}</h1>
          <p className="mt-2 text-white/85">
            {t('home.subtitle', { place: place.label })}{' '}
            <button onClick={() => setPicking(true)} className="underline underline-offset-2">
              {t('action.change')}
            </button>
          </p>
          {data && data.chips.length > 0 && (
            <div className="scrollbar-none mt-6 flex gap-2 overflow-x-auto pb-1">
              {data.chips.map((c) => (
                <Link key={c.key} href={`/restaurants?${c.filter}`} className="chip border-white/30 bg-white/15 text-white hover:bg-white/25">
                  {lang === 'hi' ? c.labelHi : c.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-8">
        {home.error && <ErrorNote message={home.error} onRetry={home.reload} />}

        {data && data.nearbyCount === 0 && (
          <Empty title={t('home.notHereTitle', { place: place.label })} icon="🗺️">
            {t('home.notHereBody')}
            <div className="mt-3">
              <button className="btn-primary" onClick={() => setPicking(true)}>
                {t('home.pickTown')}
              </button>
            </div>
          </Empty>
        )}

        {data && data.cuisines.length > 0 && (
          <section>
            <h2 className="mb-4 text-xl font-semibold">{t('home.mood')}</h2>
            <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
              {data.cuisines.map((c) => (
                <Link key={c.slug} href={`/restaurants?cuisines=${c.slug}`} className="group flex w-20 shrink-0 flex-col items-center gap-1.5 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-3xl transition group-hover:scale-105 group-hover:bg-brand/10">{c.icon ?? '🍽️'}</span>
                  <span className="text-xs leading-tight font-medium">{nm(c, lang)}</span>
                  <span className="text-[10px] text-muted">{tp('places', c.count)}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {home.loading && <CardGridSkeleton n={3} />}

        {data?.collections.map((col) => (
          <section key={col.key}>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{lang === 'hi' ? col.titleHi : col.title}</h2>
                {col.description && <p className="text-sm text-muted">{col.description}</p>}
              </div>
              <Link href={col.slug ? `/c/${col.slug}` : `/restaurants?${col.filter}`} className="shrink-0 text-sm font-medium text-brand">
                {t('action.seeAll')}
              </Link>
            </div>
            <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
              {col.items.map((r, i) => (
                <RestaurantCard key={r.id} r={r} compact position={i} />
              ))}
            </div>
          </section>
        ))}

        {data && data.nearbyCount > 0 && (
          <section>
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-xl font-semibold">{tp('home.nearby', data.nearbyCount)}</h2>
              <Link href="/restaurants?view=map" className="text-sm font-medium text-brand">
                🗺️ {t('home.mapView')}
              </Link>
            </div>
            <Nearby lat={place.lat} lng={place.lng} />
          </section>
        )}

        <section className="card flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('home.ownerTitle')}</h2>
            <p className="text-sm text-muted">{t('home.ownerBody')}</p>
          </div>
          <Link href="/partner" className="btn-primary">
            {t('home.ownerCta')}
          </Link>
        </section>
      </div>
      <PlacePicker open={picking} onClose={() => setPicking(false)} />
    </div>
  );
}
