'use client';

import { useParams } from 'next/navigation';
import { CardGridSkeleton, RestaurantCard } from '@/components/RestaurantCard';
import { Empty } from '@/components/ui';
import { useSession } from '@/lib/session';
import type { Card } from '@/lib/types';
import { useApi } from '@/lib/useApi';

/** A list someone shared by link (spec 3.4). */
export default function SharedList() {
  const { slug } = useParams<{ slug: string }>();
  const { t, tp } = useSession();
  const list = useApi<{ name: string; owner: string | null; items: Card[] }>(`/v1/lists/${slug}`);
  if (list.error) return <Empty title={t('lists.notShared')} icon="🔒" />;
  const l = list.data;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      {!l ? (
        <CardGridSkeleton n={3} />
      ) : (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{l.name}</h1>
            <p className="text-sm text-muted">
              {l.owner ? t('lists.by', { name: l.owner }) : ''} · {tp('places', l.items.length)}
            </p>
          </div>
          <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {l.items.map((r, i) => (
              <RestaurantCard key={r.id} r={r} position={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
