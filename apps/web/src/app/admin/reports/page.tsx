'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageTitle } from '@/components/Shell';
import { Cover, Empty, ErrorNote, Loading, RatingBadge, StatusPill, Tabs, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { DAYS, ago, humanize } from '@/lib/format';
import { useApi } from '@/lib/useApi';

type Proposed = { phone?: string; addressLine?: string; hours?: { dayOfWeek: number; opensAt: string; closesAt: string }[] };
type Report = {
  id: string;
  targetType: 'review' | 'photo' | 'restaurant';
  targetId: string;
  reason: string;
  details: string | null;
  proposed: Proposed | null;
  status: string;
  createdAt: string;
  target: Record<string, unknown> | null;
};
type ReviewTarget = { text: string; rating: number; status: string; restaurant: { name: string; slug: string }; user: { name: string | null; phone: string; status: string } };
type PhotoTarget = { url: string; status: string; restaurant: { name: string; slug: string } };
type RestaurantTarget = { id: string; name: string; slug: string; phone: string | null; addressLine: string; status: string };

const ACTIONS: Record<Report['targetType'], { key: string; label: string; danger?: boolean }[]> = {
  review: [
    { key: 'hide', label: 'Hide review', danger: true },
    { key: 'remove', label: 'Remove review', danger: true },
    { key: 'warn', label: 'Warn author' },
    { key: 'ban', label: 'Hide + ban author', danger: true },
    { key: 'keep', label: 'Keep (not a problem)' },
  ],
  photo: [
    { key: 'hide', label: 'Hide photo', danger: true },
    { key: 'remove', label: 'Delete photo', danger: true },
    { key: 'warn', label: 'Warn uploader' },
    { key: 'keep', label: 'Keep' },
  ],
  restaurant: [
    { key: 'fixed', label: 'I fixed the listing' },
    { key: 'close_restaurant', label: 'Mark closed', danger: true },
    { key: 'dismiss', label: 'Dismiss' },
  ],
};

function Target({ r }: { r: Report }) {
  if (!r.target) return <p className="text-sm text-muted">The reported item no longer exists.</p>;
  if (r.targetType === 'review') {
    const t = r.target as unknown as ReviewTarget;
    return (
      <div className="rounded-lg bg-surface p-3 text-sm">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <RatingBadge rating={t.rating} />
          <span className="text-xs text-muted">
            by {t.user.name ?? 'Diner'} (+91 {t.user.phone}{t.user.status !== 'active' ? `, ${t.user.status}` : ''}) on{' '}
            <Link href={`/r/${t.restaurant.slug}`} target="_blank" className="text-brand">
              {t.restaurant.name}
            </Link>
          </span>
          {t.status !== 'published' && <StatusPill status={t.status} />}
        </div>
        <p className="whitespace-pre-line">{t.text}</p>
      </div>
    );
  }
  if (r.targetType === 'photo') {
    const t = r.target as unknown as PhotoTarget;
    return (
      <div className="flex items-center gap-3">
        <Cover url={t.url} seed={r.targetId} size="sm" className="h-28 w-28 rounded-lg" />
        <Link href={`/r/${t.restaurant.slug}`} target="_blank" className="text-sm text-brand">
          {t.restaurant.name}
        </Link>
        {t.status !== 'approved' && <StatusPill status={t.status} />}
      </div>
    );
  }
  const t = r.target as unknown as RestaurantTarget;
  return (
    <div className="rounded-lg bg-surface p-3 text-sm">
      <Link href={`/r/${t.slug}`} target="_blank" className="font-medium text-brand">
        {t.name}
      </Link>{' '}
      <StatusPill status={t.status} />
      <p className="text-xs text-muted">
        {t.addressLine} · {t.phone ?? 'no phone'} ·{' '}
        <Link href={`/partner/${t.id}`} className="text-brand">
          Edit listing
        </Link>
      </p>
    </div>
  );
}

export default function Reports() {
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const list = useApi<{ data: Report[] }>('/v1/admin/reports', { status });
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  async function resolve(r: Report, action: string) {
    if (action === 'ban' && !confirm('Suspend this account and sign them out everywhere?')) return;
    setError(null);
    try {
      await api(`/v1/admin/reports/${r.id}/resolve`, { method: 'POST', body: { action } });
      setFlash(action === 'apply_correction' ? 'Correction applied' : 'Done');
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Reports & corrections" sub="Flags from diners and partners. Hidden reviews stop counting toward the rating." />
      <Tabs
        value={status}
        onChange={setStatus}
        tabs={[
          { key: 'open', label: 'Open' },
          { key: 'resolved', label: 'Resolved' },
          { key: 'dismissed', label: 'Dismissed' },
        ]}
      />
      <ErrorNote message={error ?? list.error} />
      {list.loading && <Loading />}
      {list.data?.data.length === 0 && <Empty title="No reports" icon="✅" />}
      <ul className="space-y-3">
        {list.data?.data.map((r) => {
          const proposed = r.proposed && Object.keys(r.proposed).length ? r.proposed : null;
          return (
            <li key={r.id} className="card space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <b>{humanize(r.targetType)}</b> reported as <b>{humanize(r.reason)}</b> · {ago(r.createdAt)}
                </p>
                <StatusPill status={r.status} />
              </div>
              {r.details && <p className="text-sm">“{r.details}”</p>}
              <Target r={r} />
              {proposed && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                  <p className="mb-1 font-medium text-blue-900">Suggested correction</p>
                  {proposed.phone && <p>Phone → {proposed.phone}</p>}
                  {proposed.addressLine && <p>Address → {proposed.addressLine}</p>}
                  {proposed.hours && <p>Hours → {proposed.hours.map((h) => `${DAYS[h.dayOfWeek]} ${h.opensAt}–${h.closesAt}`).join(', ')}</p>}
                </div>
              )}
              {r.status === 'open' && (
                <div className="flex flex-wrap gap-2">
                  {proposed && r.targetType === 'restaurant' && (
                    <button className="btn-primary py-1.5" onClick={() => resolve(r, 'apply_correction')}>
                      ✓ Apply correction
                    </button>
                  )}
                  {ACTIONS[r.targetType].map((a) => (
                    <button key={a.key} className={`btn-outline py-1.5 ${a.danger ? 'text-red-600' : ''}`} onClick={() => resolve(r, a.key)}>
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {flash}
    </div>
  );
}
