'use client';

import { useState } from 'react';
import { Map } from '@/components/Map';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Field, Loading, Modal, Tabs, Toggle, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useApi } from '@/lib/useApi';

type Locality = { id: string; name: string; nameHi: string | null; lat: number; lng: number };
type City = { id: string; slug: string; name: string; nameHi: string | null; state: string; lat: number; lng: number; isLive: boolean; localities: Locality[]; _count: { restaurants: number; waitlist: number } };
type Vocab = { id: string; slug?: string; key?: string; name: string; nameHi: string | null; icon?: string | null; group?: string; _count: { restaurants: number } };
type Catalog = { cities: City[]; cuisines: Vocab[]; types: Vocab[]; attributes: Vocab[]; synonyms: { term: string; canonical: string }[]; waitlistOutsideCities: number };
type Tab = 'towns' | 'cuisines' | 'establishment-types' | 'attributes' | 'synonyms';

const slugify = (s: string, sep = '-') => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}|\\${sep}$`, 'g'), '');

function VocabTab({ kind, rows, onChange }: { kind: 'cuisines' | 'establishment-types' | 'attributes'; rows: Vocab[]; onChange: (msg: string) => void }) {
  const [form, setForm] = useState({ name: '', nameHi: '', icon: '', group: 'feature' });
  const [error, setError] = useState<string | null>(null);
  const keyName = kind === 'attributes' ? 'key' : 'slug';

  async function run(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    try {
      await fn();
      onChange(msg);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-3">
      <ErrorNote message={error} />
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Hindi</th>
              {kind === 'attributes' && <th className="px-3 py-2">Group</th>}
              <th className="px-3 py-2">{keyName}</th>
              <th className="px-3 py-2">Places</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((v) => (
              <tr key={v.id}>
                <td className="px-3 py-2">
                  {v.icon} {v.name}
                </td>
                <td className="px-3 py-2">{v.nameHi ?? <span className="text-red-600">missing</span>}</td>
                {kind === 'attributes' && <td className="px-3 py-2 text-xs">{v.group}</td>}
                <td className="px-3 py-2 font-mono text-xs">{v.slug ?? v.key}</td>
                <td className="px-3 py-2 tabular-nums">{v._count.restaurants}</td>
                <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                  <button
                    className="text-brand"
                    onClick={() => {
                      const name = prompt('English name', v.name)?.trim();
                      if (name === undefined) return;
                      const nameHi = prompt('Hindi name', v.nameHi ?? '')?.trim();
                      run(() => api(`/v1/admin/catalog/${kind}/${v.id}`, { method: 'PATCH', body: { ...(name ? { name } : {}), ...(nameHi !== undefined ? { nameHi: nameHi || null } : {}) } }), 'Updated');
                    }}
                  >
                    Edit
                  </button>
                  <button className="ml-3 text-muted hover:text-red-600" disabled={v._count.restaurants > 0} title={v._count.restaurants ? 'In use' : ''} onClick={() => confirm(`Delete ${v.name}?`) && run(() => api(`/v1/admin/catalog/${kind}/${v.id}`, { method: 'DELETE' }), 'Deleted')}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="card flex flex-wrap items-end gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          const body = {
            [keyName]: kind === 'attributes' ? slugify(form.name, '_') : slugify(form.name),
            name: form.name.trim(),
            ...(form.nameHi.trim() ? { nameHi: form.nameHi.trim() } : {}),
            ...(kind !== 'establishment-types' && form.icon.trim() ? { icon: form.icon.trim() } : {}),
            ...(kind === 'attributes' ? { group: form.group } : {}),
          };
          run(() => api(`/v1/admin/catalog/${kind}`, { method: 'POST', body }), 'Added').then(() => setForm({ ...form, name: '', nameHi: '', icon: '' }));
        }}
      >
        <Field label="Name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Hindi name">
          <input className="input" value={form.nameHi} onChange={(e) => setForm({ ...form, nameHi: e.target.value })} />
        </Field>
        {kind !== 'establishment-types' && (
          <Field label="Emoji">
            <input className="input w-20" maxLength={4} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
          </Field>
        )}
        {kind === 'attributes' && (
          <Field label="Group">
            <select className="input" value={form.group} onChange={(e) => setForm({ ...form, group: e.target.value })}>
              {['feature', 'dietary', 'service', 'payment', 'occasion'].map((g) => (
                <option key={g} value={g}>
                  {humanize(g)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <button className="btn-primary" disabled={form.name.trim().length < 2}>
          + Add
        </button>
      </form>
    </div>
  );
}

export default function CatalogPage() {
  const catalog = useApi<Catalog>('/v1/admin/catalog');
  const [tab, setTab] = useState<Tab>('towns');
  const [newCity, setNewCity] = useState<{ name: string; nameHi: string; state: string; lat: number; lng: number } | null>(null);
  const [newLocality, setNewLocality] = useState<{ city: City; name: string; nameHi: string; lat: number; lng: number } | null>(null);
  const [synonyms, setSynonyms] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  async function run(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    try {
      await fn();
      setFlash(msg);
      catalog.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (catalog.loading) return <Loading />;
  if (!catalog.data) return <ErrorNote message={catalog.error} onRetry={catalog.reload} />;
  const c = catalog.data;
  const synonymText = synonyms ?? c.synonyms.map((s) => `${s.term} = ${s.canonical}`).join('\n');

  return (
    <div className="space-y-4">
      <PageTitle title="Catalogue" sub="Towns, localities and the filter vocabulary diners search with (spec 6)." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'towns', label: `Towns (${c.cities.length})` },
          { key: 'cuisines', label: `Cuisines (${c.cuisines.length})` },
          { key: 'establishment-types', label: `Place types (${c.types.length})` },
          { key: 'attributes', label: `Features & tags (${c.attributes.length})` },
          { key: 'synonyms', label: 'Search synonyms' },
        ]}
      />
      <ErrorNote message={error} />

      {tab === 'towns' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted">{c.waitlistOutsideCities} people outside live towns asked to be notified.</p>
            <button className="btn-primary" onClick={() => setNewCity({ name: '', nameHi: '', state: 'Rajasthan', lat: 27.735, lng: 75.78 })}>
              + Add town
            </button>
          </div>
          {c.cities.map((city) => (
            <div key={city.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {city.name} {city.nameHi && <span className="font-normal text-muted">{city.nameHi}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {city.state} · {city._count.restaurants} restaurants · {city._count.waitlist} waiting · <span className="font-mono">{city.slug}</span>
                  </p>
                </div>
                <div className="w-56">
                  <Toggle
                    checked={city.isLive}
                    onChange={(v) => (!v || confirm(`Launch ${city.name}? Everyone on its waitlist gets an SMS.`)) && run(() => api(`/v1/admin/catalog/cities/${city.id}`, { method: 'PATCH', body: { isLive: v } }), v ? `${city.name} is live` : `${city.name} hidden`)}
                    label={city.isLive ? 'Live for diners' : 'Not live'}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {city.localities.map((l) => (
                  <span key={l.id} className="chip py-1 text-xs">
                    {l.name}
                    <button className="text-muted hover:text-red-600" onClick={() => confirm(`Remove ${l.name}?`) && run(() => api(`/v1/admin/catalog/localities/${l.id}`, { method: 'DELETE' }), 'Locality removed')} aria-label={`Remove ${l.name}`}>
                      ×
                    </button>
                  </span>
                ))}
                <button className="chip py-1 text-xs text-brand" onClick={() => setNewLocality({ city, name: '', nameHi: '', lat: city.lat, lng: city.lng })}>
                  + Locality
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'cuisines' && <VocabTab kind="cuisines" rows={c.cuisines} onChange={(m) => { setFlash(m); catalog.reload(); }} />}
      {tab === 'establishment-types' && <VocabTab kind="establishment-types" rows={c.types} onChange={(m) => { setFlash(m); catalog.reload(); }} />}
      {tab === 'attributes' && <VocabTab kind="attributes" rows={c.attributes} onChange={(m) => { setFlash(m); catalog.reload(); }} />}

      {tab === 'synonyms' && (
        <div className="card space-y-3 p-4">
          <p className="text-sm text-muted">One per line: <code>misspelling = correct word</code>. Search maps the left side to the right (spec 3.1 “biriyani → biryani”).</p>
          <textarea className="input min-h-72 font-mono text-xs" value={synonymText} onChange={(e) => setSynonyms(e.target.value)} />
          <button
            className="btn-primary"
            onClick={() => {
              const rows = synonymText
                .split('\n')
                .map((l) => l.split('=').map((x) => x.trim().toLowerCase()))
                .filter(([a, b]) => a && b && a !== b)
                .map(([term, canonical]) => ({ term, canonical }));
              run(() => api('/v1/admin/catalog/synonyms', { method: 'PUT', body: { synonyms: rows } }), `${rows.length} synonyms saved`).then(() => setSynonyms(null));
            }}
          >
            Save synonyms
          </button>
        </div>
      )}

      <Modal open={!!newCity} onClose={() => setNewCity(null)} title="Add town" wide>
        {newCity && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api('/v1/admin/catalog/cities', { method: 'POST', body: { ...newCity, nameHi: newCity.nameHi || null, isLive: false } }), 'Town added — switch it live when listings are ready').then(() => setNewCity(null));
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Name">
                <input className="input" value={newCity.name} onChange={(e) => setNewCity({ ...newCity, name: e.target.value })} required />
              </Field>
              <Field label="Hindi name">
                <input className="input" value={newCity.nameHi} onChange={(e) => setNewCity({ ...newCity, nameHi: e.target.value })} />
              </Field>
              <Field label="State">
                <input className="input" value={newCity.state} onChange={(e) => setNewCity({ ...newCity, state: e.target.value })} required />
              </Field>
            </div>
            <p className="text-xs text-muted">Click the map at the town centre.</p>
            <Map className="h-72" center={[newCity.lat, newCity.lng]} pins={[{ id: 'c', lat: newCity.lat, lng: newCity.lng, label: newCity.name }]} onPick={(lat, lng) => setNewCity({ ...newCity, lat, lng })} />
            <button className="btn-primary w-full" disabled={newCity.name.trim().length < 2}>
              Add town (not live yet)
            </button>
          </form>
        )}
      </Modal>
      <Modal open={!!newLocality} onClose={() => setNewLocality(null)} title={`Add locality to ${newLocality?.city.name ?? ''}`}>
        {newLocality && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const { city, ...rest } = newLocality;
              run(() => api('/v1/admin/catalog/localities', { method: 'POST', body: { ...rest, cityId: city.id, nameHi: rest.nameHi || null } }), 'Locality added').then(() => setNewLocality(null));
            }}
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input className="input" value={newLocality.name} onChange={(e) => setNewLocality({ ...newLocality, name: e.target.value })} required />
              </Field>
              <Field label="Hindi name">
                <input className="input" value={newLocality.nameHi} onChange={(e) => setNewLocality({ ...newLocality, nameHi: e.target.value })} />
              </Field>
            </div>
            <Map className="h-64" center={[newLocality.lat, newLocality.lng]} pins={[{ id: 'l', lat: newLocality.lat, lng: newLocality.lng, label: newLocality.name }]} onPick={(lat, lng) => setNewLocality({ ...newLocality, lat, lng })} />
            <button className="btn-primary w-full" disabled={newLocality.name.trim().length < 2}>
              Add locality
            </button>
          </form>
        )}
      </Modal>
      {flash}
    </div>
  );
}
