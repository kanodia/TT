'use client';

import { useParams } from 'next/navigation';
import { CardGridSkeleton, RestaurantCard } from '@/components/RestaurantCard';
import { Cover, Empty } from '@/components/ui';
import { useSession } from '@/lib/session';
import type { Card } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Collection = { title: string; titleHi: string | null; description: string | null; coverUrl: string | null; city: { name: string } | null; items: Card[] };

/** Editorial or auto collection (spec 3.4). */
export default function CollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const { place, lang, t, tp } = useSession();
  const c = useApi<Collection>(`/v1/collections/${slug}`, { lat: place.lat, lng: place.lng });
  if (c.error) return <Empty title={t('collection.notFound')} icon="📚" />;
  const d = c.data;
  return (
    <div>
      {d?.coverUrl && <Cover url={d.coverUrl} seed={slug} size="lg" className="h-48 w-full sm:h-64" />}
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {!d ? (
          <CardGridSkeleton n={3} />
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold tracking-wide text-brand uppercase">{t('collection.label')}{d.city ? ` · ${d.city.name}` : ''}</p>
              <h1 className="text-3xl font-bold">{lang === 'hi' && d.titleHi ? d.titleHi : d.title}</h1>
              {d.description && <p className="mt-1 max-w-2xl text-muted">{d.description}</p>}
              <p className="mt-1 text-sm text-muted">{tp('places', d.items.length)}</p>
            </div>
            <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {d.items.map((r, i) => (
                <RestaurantCard key={r.id} r={r} position={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
