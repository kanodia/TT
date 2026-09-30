'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageTitle } from '@/components/Shell';
import { Cover, Empty, ErrorNote, Loading, RatingBadge, StatusPill, Tabs, useFlash } from '@/components/ui';
import { api, errorMessage, media } from '@/lib/api';
import { ago, humanize } from '@/lib/format';
import { useApi } from '@/lib/useApi';

type HeldReview = {
  id: string;
  rating: number;
  text: string;
  status: string;
  flagReasons: string[];
  deviceId: string | null;
  createdAt: string;
  restaurant: { name: string; slug: string };
  user: { id: string; name: string | null; phone: string; status: string; createdAt: string };
  photos: { photo: { id: string; url: string } }[];
};
type DinerPhoto = { id: string; url: string; status: string; createdAt: string; restaurant: { name: string; slug: string }; reviews: { review: { id: string; rating: number; text: string; status: string } }[] };
type Clusters = { devices: { deviceId: string; accounts: number; reviews: number; restaurants: string[] }[]; bursts: { restaurantId: string; name: string; day: string; count: number }[] };

type Tab = 'reviews' | 'photos' | 'clusters';

/** Auto-flagged reviews, diner photos and suspected fake-review clusters (spec 4.4, 6). */
export default function Moderation() {
  const [tab, setTab] = useState<Tab>('reviews');
  const reviews = useApi<{ data: HeldReview[] }>(tab === 'reviews' ? '/v1/admin/reviews' : null, { status: 'pending' });
  const photos = useApi<{ data: DinerPhoto[] }>(tab === 'photos' ? '/v1/admin/photos' : null, { status: 'pending' });
  const clusters = useApi<Clusters>(tab === 'clusters' ? '/v1/admin/reviews/clusters' : null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  async function run(fn: () => Promise<unknown>, msg: string, reload: () => void) {
    setError(null);
    try {
      await fn();
      setFlash(msg);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Moderation" sub="Nothing here is visible to diners until you publish it." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'reviews', label: 'Held reviews' },
          { key: 'photos', label: 'Diner photos' },
          { key: 'clusters', label: 'Suspicious clusters' },
        ]}
      />
      <ErrorNote message={error} />

      {tab === 'reviews' && (
        <>
          {reviews.loading && <Loading />}
          {reviews.data?.data.length === 0 && <Empty title="No held reviews" icon="✅" />}
          <ul className="space-y-3">
            {reviews.data?.data.map((r) => (
              <li key={r.id} className="card space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <Link href={`/r/${r.restaurant.slug}`} target="_blank" className="font-medium text-brand">
                      {r.restaurant.name}
                    </Link>{' '}
                    · by {r.user.name ?? '—'} (+91 {r.user.phone}, joined {ago(r.user.createdAt)}) · {ago(r.createdAt)}
                  </p>
                  <RatingBadge rating={r.rating} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.flagReasons.map((f) => (
                    <span key={f} className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
                      {humanize(f)}
                    </span>
                  ))}
                  {r.deviceId && <span className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted">device {r.deviceId.slice(0, 8)}</span>}
                </div>
                <p className="text-sm whitespace-pre-line">{r.text}</p>
                {r.photos.length > 0 && (
                  <div className="flex gap-2">
                    {r.photos.map((p) => (
                      <Cover key={p.photo.id} url={p.photo.url} seed={p.photo.id} size="sm" className="h-16 w-16 rounded-lg" />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary bg-good py-1.5" onClick={() => run(() => api(`/v1/admin/reviews/${r.id}/publish`, { method: 'POST' }), 'Published', reviews.reload)}>
                    ✓ Publish (with photos)
                  </button>
                  <button className="btn-outline py-1.5" onClick={() => run(() => api(`/v1/admin/reviews/${r.id}/hide`, { method: 'POST' }), 'Hidden', reviews.reload)}>
                    Hide
                  </button>
                  <button className="btn-outline py-1.5 text-red-600" onClick={() => run(() => api(`/v1/admin/reviews/${r.id}/remove`, { method: 'POST' }), 'Removed', reviews.reload)}>
                    Remove
                  </button>
                  <button
                    className="btn-ghost py-1.5 text-red-600"
                    onClick={() =>
                      confirm(`Hide every review by ${r.user.name ?? r.user.phone}?`) && run(() => api('/v1/admin/reviews/bulk-hide', { method: 'POST', body: { userId: r.user.id } }), 'Author’s reviews hidden', reviews.reload)
                    }
                  >
                    Hide all by author
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === 'photos' && (
        <>
          {photos.loading && <Loading />}
          {photos.data?.data.length === 0 && <Empty title="No photos waiting" icon="✅" />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {photos.data?.data.map((p) => (
              <div key={p.id} className="card overflow-hidden">
                <a href={media(p.url, 'lg') ?? undefined} target="_blank" rel="noreferrer">
                  <Cover url={p.url} seed={p.id} className="aspect-square w-full" />
                </a>
                <div className="space-y-2 p-2 text-xs">
                  <p className="font-medium">{p.restaurant.name}</p>
                  {p.reviews[0] && (
                    <p className="line-clamp-2 text-muted">
                      {p.reviews[0].review.rating}★ “{p.reviews[0].review.text}” <StatusPill status={p.reviews[0].review.status} />
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button className="btn-primary flex-1 bg-good py-1" onClick={() => run(() => api(`/v1/admin/photos/${p.id}/approve`, { method: 'POST' }), 'Approved', photos.reload)}>
                      Approve
                    </button>
                    <button className="btn-outline flex-1 py-1 text-red-600" onClick={() => run(() => api(`/v1/admin/photos/${p.id}/reject`, { method: 'POST' }), 'Rejected', photos.reload)}>
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'clusters' && (
        <>
          {clusters.loading && <Loading />}
          {clusters.data && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="card p-4">
                <h2 className="mb-1 font-semibold">One device, several accounts</h2>
                <p className="mb-3 text-xs text-muted">Last 60 days. Often one person reviewing from multiple numbers.</p>
                {clusters.data.devices.length === 0 && <p className="text-sm text-muted">None found.</p>}
                <ul className="divide-y divide-border text-sm">
                  {clusters.data.devices.map((d) => (
                    <li key={d.deviceId} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        <span className="font-mono text-xs">{d.deviceId.slice(0, 12)}</span> · {d.accounts} accounts · {d.reviews} reviews · {d.restaurants.length} places
                      </span>
                      <button className="btn-outline py-1 text-red-600" onClick={() => confirm('Hide every review from this device?') && run(() => api('/v1/admin/reviews/bulk-hide', { method: 'POST', body: { deviceId: d.deviceId } }), 'Cluster hidden', clusters.reload)}>
                        Hide all
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card p-4">
                <h2 className="mb-1 font-semibold">5★ bursts</h2>
                <p className="mb-3 text-xs text-muted">Five or more 5★ reviews for one place in a day (last 30 days).</p>
                {clusters.data.bursts.length === 0 && <p className="text-sm text-muted">None found.</p>}
                <ul className="divide-y divide-border text-sm">
                  {clusters.data.bursts.map((b) => (
                    <li key={`${b.restaurantId}-${b.day}`} className="flex items-center justify-between gap-2 py-2">
                      <span>
                        {b.name} · {b.day} · {b.count} × 5★
                      </span>
                      <button
                        className="btn-outline py-1 text-red-600"
                        onClick={() =>
                          confirm(`Hide the 5★ reviews for ${b.name} from ${b.day}?`) &&
                          run(() => api('/v1/admin/reviews/bulk-hide', { method: 'POST', body: { restaurantId: b.restaurantId, since: new Date(`${b.day}T00:00:00+05:30`).toISOString() } }), 'Burst hidden', clusters.reload)
                        }
                      >
                        Hide burst
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </>
      )}
      {flash}
    </div>
  );
}
