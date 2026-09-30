'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { UploadButton } from '@/components/forms';
import { PageTitle } from '@/components/Shell';
import { Cover, Empty, ErrorNote, Field, Loading, Modal, StatusPill, Toggle, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { Filters } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Rules = { attributes?: string[]; cuisines?: string[]; types?: string[]; ratingMin?: number; costMax?: number; sort?: string; isNew?: boolean; hasOffers?: boolean };
type Collection = {
  id: string;
  slug: string;
  title: string;
  titleHi: string | null;
  description: string | null;
  coverUrl: string | null;
  cityId: string | null;
  city: { name: string } | null;
  type: 'editorial' | 'auto';
  rules: Rules | null;
  startsOn: string | null;
  endsOn: string | null;
  isPublished: boolean;
  sortOrder: number;
  restaurants: { restaurant: { id: string; name: string; status: string } }[];
};
type Draft = {
  id?: string;
  title: string;
  titleHi: string;
  description: string;
  coverUrl: string | null;
  cityId: string;
  type: 'editorial' | 'auto';
  rules: Rules;
  startsOn: string;
  endsOn: string;
  isPublished: boolean;
  sortOrder: number;
  picks: { id: string; name: string }[];
};

const empty: Draft = { title: '', titleHi: '', description: '', coverUrl: null, cityId: '', type: 'editorial', rules: {}, startsOn: '', endsOn: '', isPublished: false, sortOrder: 0, picks: [] };

function RestaurantPicker({ picks, onChange }: { picks: Draft['picks']; onChange: (p: Draft['picks']) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; name: string; status: string; city: { name: string } }[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return;
    const timer = setTimeout(() => {
      api<{ data: typeof results }>('/v1/admin/restaurants/search', { query: { q: q.trim() } })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);
  const move = (i: number, d: number) => {
    const next = [...picks];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <ol className="space-y-1">
        {picks.map((p, i) => (
          <li key={p.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
            <span className="w-5 text-muted">{i + 1}.</span>
            <span className="flex-1">{p.name}</span>
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="px-1 text-muted disabled:opacity-30">
              ↑
            </button>
            <button type="button" disabled={i === picks.length - 1} onClick={() => move(i, 1)} className="px-1 text-muted disabled:opacity-30">
              ↓
            </button>
            <button type="button" onClick={() => onChange(picks.filter((x) => x.id !== p.id))} className="px-1 text-muted hover:text-red-600">
              ✕
            </button>
          </li>
        ))}
      </ol>
      <input className="input" placeholder="Add a restaurant…" value={q} onChange={(e) => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {results
            .filter((r) => !picks.some((p) => p.id === r.id))
            .map((r) => (
              <li key={r.id}>
                <button type="button" className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-surface" onClick={() => onChange([...picks, { id: r.id, name: r.name }])}>
                  <span>
                    {r.name} <span className="text-xs text-muted">· {r.city.name}</span>
                  </span>
                  <StatusPill status={r.status} />
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function Editor({ draft, filters, onClose, onSaved }: { draft: Draft; filters: Filters; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState(draft);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const setRule = (p: Partial<Rules>) => set({ rules: { ...d.rules, ...p } });
  const toggleIn = (k: 'attributes' | 'cuisines' | 'types', v: string) => {
    const cur = d.rules[k] ?? [];
    setRule({ [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      title: d.title.trim(),
      titleHi: d.titleHi.trim() || null,
      description: d.description.trim() || null,
      coverUrl: d.coverUrl,
      cityId: d.cityId || null,
      type: d.type,
      rules: d.type === 'auto' ? d.rules : null,
      startsOn: d.startsOn || null,
      endsOn: d.endsOn || null,
      isPublished: d.isPublished,
      sortOrder: d.sortOrder,
      restaurantIds: d.type === 'editorial' ? d.picks.map((p) => p.id) : [],
    };
    try {
      if (d.id) await api(`/v1/admin/collections/${d.id}`, { method: 'PATCH', body });
      else await api('/v1/admin/collections', { method: 'POST', body });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={d.id ? 'Edit collection' : 'New collection'} wide>
      <form onSubmit={save} className="space-y-4">
        <ErrorNote message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title *">
            <input className="input" value={d.title} maxLength={80} onChange={(e) => set({ title: e.target.value })} required />
          </Field>
          <Field label="Title in Hindi">
            <input className="input" value={d.titleHi} maxLength={80} onChange={(e) => set({ titleHi: e.target.value })} />
          </Field>
        </div>
        <Field label="Description">
          <input className="input" value={d.description} maxLength={300} onChange={(e) => set({ description: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Town">
            <select className="input" value={d.cityId} onChange={(e) => set({ cityId: e.target.value })}>
              <option value="">All towns</option>
              {filters.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input type="date" className="input" value={d.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" className="input" value={d.endsOn} min={d.startsOn || undefined} onChange={(e) => set({ endsOn: e.target.value })} />
          </Field>
          <Field label="Order">
            <input type="number" className="input" value={d.sortOrder} onChange={(e) => set({ sortOrder: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <div className="flex items-center gap-4">
          {d.coverUrl && <Cover url={d.coverUrl} seed="cover" size="sm" className="h-14 w-24 rounded-lg" />}
          <UploadButton label={d.coverUrl ? 'Change cover' : 'Cover image'} onUploaded={(u) => set({ coverUrl: u.url })} />
          <div className="ml-auto w-48">
            <Toggle checked={d.isPublished} onChange={(v) => set({ isPublished: v })} label="Published" />
          </div>
        </div>
        <div className="flex gap-2">
          {(['editorial', 'auto'] as const).map((k) => (
            <button type="button" key={k} className={`chip ${d.type === k ? 'chip-on' : ''}`} onClick={() => set({ type: k })}>
              {k === 'editorial' ? '✍️ Hand-picked' : '⚙️ Auto (from filters)'}
            </button>
          ))}
        </div>
        {d.type === 'editorial' ? (
          <RestaurantPicker picks={d.picks} onChange={(picks) => set({ picks })} />
        ) : (
          <div className="space-y-3 rounded-lg bg-surface p-3">
            <div>
              <span className="label">Features & occasions</span>
              <div className="flex flex-wrap gap-1.5">
                {filters.attributes.map((a) => (
                  <button type="button" key={a.key} className={`chip py-1 text-xs ${d.rules.attributes?.includes(a.key) ? 'chip-on' : ''}`} onClick={() => toggleIn('attributes', a.key)}>
                    {a.icon} {a.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="label">Cuisines</span>
              <div className="flex flex-wrap gap-1.5">
                {filters.cuisines.map((c) => (
                  <button type="button" key={c.slug} className={`chip py-1 text-xs ${d.rules.cuisines?.includes(c.slug) ? 'chip-on' : ''}`} onClick={() => toggleIn('cuisines', c.slug)}>
                    {c.icon} {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Minimum rating">
                <input type="number" step="0.5" min={0} max={5} className="input" value={d.rules.ratingMin ?? ''} onChange={(e) => setRule({ ratingMin: e.target.value ? Number(e.target.value) : undefined })} />
              </Field>
              <Field label="Max cost for two (₹)">
                <input type="number" min={0} className="input" value={d.rules.costMax ?? ''} onChange={(e) => setRule({ costMax: e.target.value ? Number(e.target.value) : undefined })} />
              </Field>
              <Field label="Sort">
                <select className="input" value={d.rules.sort ?? 'relevance'} onChange={(e) => setRule({ sort: e.target.value })}>
                  {['relevance', 'rating', 'popularity', 'distance', 'cost_asc'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy || d.title.trim().length < 3}>
          {busy ? 'Saving…' : 'Save collection'}
        </button>
      </form>
    </Modal>
  );
}

export default function Collections() {
  const list = useApi<{ data: Collection[] }>('/v1/admin/collections');
  const filters = useApi<Filters>('/v1/filters');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const toDraft = (c: Collection): Draft => ({
    id: c.id,
    title: c.title,
    titleHi: c.titleHi ?? '',
    description: c.description ?? '',
    coverUrl: c.coverUrl,
    cityId: c.cityId ?? '',
    type: c.type,
    rules: c.rules ?? {},
    startsOn: c.startsOn ? new Date(c.startsOn).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '',
    endsOn: c.endsOn ? new Date(c.endsOn).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '',
    isPublished: c.isPublished,
    sortOrder: c.sortOrder,
    picks: c.restaurants.map((r) => ({ id: r.restaurant.id, name: r.restaurant.name })),
  });

  return (
    <div className="space-y-4">
      <PageTitle
        title="Collections"
        sub="Editorial lists per town (“Best thalis in Neem Ka Thana”) and rule-based ones. Published collections appear on the home feed."
        actions={
          <button className="btn-primary" onClick={() => setDraft(empty)} disabled={!filters.data}>
            + New collection
          </button>
        }
      />
      <ErrorNote message={error ?? list.error} />
      {list.loading && <Loading />}
      {list.data?.data.length === 0 && <Empty title="No collections yet" icon="📚" />}
      <div className="grid gap-4 md:grid-cols-2">
        {list.data?.data.map((c) => (
          <div key={c.id} className="card flex gap-3 p-3">
            <Cover url={c.coverUrl} seed={c.slug} size="sm" className="h-20 w-28 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{c.title}</p>
                <StatusPill status={c.isPublished ? 'live' : 'draft'} />
              </div>
              <p className="text-xs text-muted">
                {c.city?.name ?? 'All towns'} · {c.type === 'auto' ? 'auto' : `${c.restaurants.length} places`}
                {c.startsOn && ` · from ${c.startsOn.slice(0, 10)}`}
                {c.endsOn && ` to ${c.endsOn.slice(0, 10)}`}
              </p>
              <div className="flex gap-3 text-xs">
                <button className="text-brand" onClick={() => setDraft(toDraft(c))}>
                  Edit
                </button>
                {c.isPublished && (
                  <Link href={`/c/${c.slug}`} target="_blank" className="text-brand">
                    View ↗
                  </Link>
                )}
                <button
                  className="text-muted hover:text-red-600"
                  onClick={async () => {
                    if (!confirm(`Delete “${c.title}”?`)) return;
                    try {
                      await api(`/v1/admin/collections/${c.id}`, { method: 'DELETE' });
                      list.reload();
                    } catch (e) {
                      setError(errorMessage(e));
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {draft && filters.data && (
        <Editor
          key={draft.id ?? 'new'}
          draft={draft}
          filters={filters.data}
          onClose={() => setDraft(null)}
          onSaved={() => {
            setFlash('Collection saved');
            list.reload();
          }}
        />
      )}
      {flash}
    </div>
  );
}
