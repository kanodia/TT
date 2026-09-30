'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/auth';
import { CardGridSkeleton, RestaurantCard } from '@/components/RestaurantCard';
import { listName } from '@/components/restaurant/SaveToList';
import { Empty, ErrorNote, Toggle, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Card, SavedList } from '@/lib/types';
import { useApi } from '@/lib/useApi';

function ListView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { place, t, tp, refreshMe } = useSession();
  const list = useApi<SavedList & { items: Card[] }>(`/v1/me/lists/${id}`, { lat: place.lat, lng: place.lng });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const l = list.data;

  async function patch(body: Partial<SavedList>) {
    try {
      await api(`/v1/me/lists/${id}`, { method: 'PATCH', body });
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <Link href="/saved" className="text-sm text-muted hover:text-foreground">
        ← {t('lists.title')}
      </Link>
      <ErrorNote message={error ?? list.error} />
      {!l ? (
        <CardGridSkeleton n={3} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold">{listName(l, t)}</h1>
              <p className="text-sm text-muted">{tp('places', l.items.length)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-44">
                <Toggle checked={l.isPublic} onChange={(v) => patch({ isPublic: v })} label={t('lists.shareable')} />
              </div>
              {l.isPublic && (
                <button
                  className="btn-outline"
                  onClick={async () => {
                    const url = `${window.location.origin}/lists/${l.shareSlug}`;
                    try {
                      if (navigator.share) await navigator.share({ title: listName(l, t), url });
                      else {
                        await navigator.clipboard.writeText(url);
                        setFlash(t('detail.linkCopied'));
                      }
                    } catch {
                      /* dismissed */
                    }
                  }}
                >
                  ↗ {t('detail.share')}
                </button>
              )}
              {l.kind === 'custom' && (
                <>
                  <button className="btn-ghost" onClick={() => { const name = prompt(t('lists.rename'), l.name)?.trim(); if (name) patch({ name }); }}>
                    {t('action.edit')}
                  </button>
                  <button
                    className="btn-ghost text-red-600"
                    onClick={async () => {
                      if (!confirm(t('lists.confirmDelete'))) return;
                      await api(`/v1/me/lists/${id}`, { method: 'DELETE' }).catch((e) => setError(errorMessage(e)));
                      await refreshMe();
                      router.push('/saved');
                    }}
                  >
                    {t('action.delete')}
                  </button>
                </>
              )}
            </div>
          </div>
          {l.items.length === 0 ? (
            <Empty title={t('lists.emptyList')} icon="📋" />
          ) : (
            <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {l.items.map((r, i) => (
                <div key={r.id} className="relative">
                  <RestaurantCard r={r} position={i} />
                  <button
                    className="mt-1 text-xs text-muted underline"
                    onClick={async () => {
                      await api(`/v1/me/lists/${id}/items/${r.id}`, { method: 'DELETE' }).catch(() => {});
                      await refreshMe();
                      list.reload();
                    }}
                  >
                    {t('lists.removeFrom')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {flash}
    </div>
  );
}

export default function ListPage() {
  return <RequireAuth>{() => <ListView />}</RequireAuth>;
}
