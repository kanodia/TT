'use client';

import Link from 'next/link';
import { useState } from 'react';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Field, Loading, Modal, RatingBadge, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { humanize, restaurantHref, shortDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Row = {
  id: string;
  slug: string;
  citySlug: string;
  name: string;
  city: string;
  cityId: string;
  status: string;
  source: string;
  isClaimed: boolean;
  isVerified: boolean;
  rating: number;
  reviewCount: number;
  members: number;
  deletedAt: string | null;
  sponsored: { id: string; startsOn: string; endsOn: string; slot: number }[];
};
const STATUSES = ['draft', 'pending', 'live', 'rejected', 'suspended', 'closed'];

export default function Restaurants() {
  const { config } = useSession();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [deleted, setDeleted] = useState(false);
  const list = useApi<{ data: Row[] }>('/v1/admin/restaurants', { q: query, status, deleted: deleted ? '1' : undefined });
  const [promo, setPromo] = useState<{ r: Row; startsOn: string; endsOn: string; slot: number } | null>(null);
  const [inspect, setInspect] = useState<{ r: Row; date: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  async function run(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    try {
      await fn();
      setFlash(msg);
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const patch = (r: Row, body: Record<string, unknown>, msg: string) => run(() => api(`/v1/admin/restaurants/${r.id}`, { method: 'PATCH', body }), msg);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <PageTitle title="Restaurants" sub="Admins can open any listing in the partner tools to edit it." />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <input className="input max-w-xs" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={deleted} onChange={(e) => setDeleted(e.target.checked)} /> Deleted only
        </label>
        <button className="btn-outline">Search</button>
      </form>
      {!config.features.sponsored && <p className="text-xs text-muted">Sponsored placements are off (Settings), so promotions are saved but not shown to diners yet.</p>}
      <ErrorNote message={error ?? list.error} />
      {list.loading && <Loading />}
      {list.data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Restaurant</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Promoted</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.data.data.map((r) => (
                <tr key={r.id} className={r.deletedAt ? 'opacity-60' : ''}>
                  <td className="px-3 py-2">
                    <p className="font-medium">
                      {r.name} {r.isVerified && <span className="text-xs text-blue-700">✔</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {r.city} · via {r.source}
                      {r.deletedAt && ` · deleted ${shortDate(r.deletedAt)}`}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <RatingBadge rating={r.rating} count={r.reviewCount} />
                  </td>
                  <td className="px-3 py-2 text-xs">{r.isClaimed ? `Claimed · ${r.members} member(s)` : 'Unclaimed'}</td>
                  <td className="px-3 py-2">
                    <select
                      className="input w-auto py-1 text-xs"
                      value={r.status}
                      disabled={!!r.deletedAt}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (['suspended', 'closed'].includes(next) && !confirm(`${humanize(next)} ${r.name}? It will disappear from the diner app.`)) return;
                        patch(r, { status: next }, 'Status updated');
                      }}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {humanize(s)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.sponsored.map((s) => (
                      <div key={s.id} className="flex items-center gap-1">
                        {shortDate(s.startsOn)} – {shortDate(s.endsOn)} (slot {s.slot})
                        <button className="text-muted hover:text-red-600" onClick={() => run(() => api(`/v1/admin/sponsored/${s.id}`, { method: 'DELETE' }), 'Promotion removed')} aria-label="Remove promotion">
                          ✕
                        </button>
                      </div>
                    ))}
                    {!r.deletedAt && (
                      <button className="text-brand underline" onClick={() => setPromo({ r, startsOn: today, endsOn: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), slot: 1 })}>
                        + Promote
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                    {r.deletedAt ? (
                      <button className="text-brand" onClick={() => patch(r, { deleted: false }, 'Restored')}>
                        Restore
                      </button>
                    ) : (
                      <>
                        <Link href={`/partner/${r.id}`} className="text-brand">
                          Edit
                        </Link>
                        {r.status === 'live' && (
                          <Link href={restaurantHref(r)} target="_blank" className="ml-3 text-brand">
                            View ↗
                          </Link>
                        )}
                        <button className="ml-3 text-brand" onClick={() => setInspect({ r, date: today })}>
                          Inspection
                        </button>
                        <button className="ml-3 text-muted hover:text-red-600" onClick={() => confirm(`Delete ${r.name}? It can be restored later.`) && patch(r, { deleted: true }, 'Deleted')}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!promo} onClose={() => setPromo(null)} title={`Promote ${promo?.r.name ?? ''}`}>
        {promo && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api('/v1/admin/sponsored', { method: 'POST', body: { restaurantId: promo.r.id, startsOn: promo.startsOn, endsOn: promo.endsOn, slot: promo.slot } }), 'Promotion saved').then(() => setPromo(null));
            }}
          >
            <p className="text-sm text-muted">Shown at the top of {promo.r.city} listings with a “Promoted” label while sponsored listings are on for that town.</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="From">
                <input type="date" className="input" value={promo.startsOn} onChange={(e) => setPromo({ ...promo, startsOn: e.target.value })} />
              </Field>
              <Field label="To">
                <input type="date" className="input" value={promo.endsOn} min={promo.startsOn} onChange={(e) => setPromo({ ...promo, endsOn: e.target.value })} />
              </Field>
              <Field label="Slot">
                <select className="input" value={promo.slot} onChange={(e) => setPromo({ ...promo, slot: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button className="btn-primary w-full">Save promotion</button>
          </form>
        )}
      </Modal>
      <Modal open={!!inspect} onClose={() => setInspect(null)} title="Last hygiene inspection">
        {inspect && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              patch(inspect.r, { lastInspectionOn: inspect.date || null }, 'Saved').then(() => setInspect(null));
            }}
          >
            <p className="text-sm text-muted">Shown under “Safety and hygiene” on {inspect.r.name}’s page (spec 4.2). Leave empty to clear.</p>
            <input type="date" className="input" max={today} value={inspect.date} onChange={(e) => setInspect({ ...inspect, date: e.target.value })} />
            <button className="btn-primary w-full">Save</button>
          </form>
        )}
      </Modal>
      {flash}
    </div>
  );
}
