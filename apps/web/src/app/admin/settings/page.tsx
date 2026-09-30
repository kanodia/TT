'use client';

import { useState } from 'react';
import { UploadButton } from '@/components/forms';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Field, Loading, Toggle, useFlash } from '@/components/ui';
import { api, errorMessage, media } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Brand, Filters } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type ReviewRules = { minChars: number; perDayLimit: number; cooldownDays: number; burstThreshold: number };
type Settings = {
  unclaimed_listings_enabled: boolean;
  sponsored_enabled: boolean;
  review_rules: ReviewRules;
  brand: Brand;
  cityOverrides: { cityId: string; city: string; key: string; value: unknown }[];
};
const FLAGS = [
  { key: 'unclaimed_listings_enabled', label: 'Show unclaimed listings', help: "Places added by the field team that the owner hasn't claimed yet" },
  { key: 'sponsored_enabled', label: 'Sponsored placements', help: 'Promoted restaurants appear first, marked “Promoted”' },
] as const;

function BrandForm({ initial, onSave }: { initial: Brand; onSave: (b: Brand) => Promise<void> }) {
  const [b, setB] = useState(initial);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Brand>) => setB({ ...b, ...p });
  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave(b).finally(() => setBusy(false));
      }}
    >
      <div>
        <h2 className="font-semibold">Brand</h2>
        <p className="text-sm text-muted">The app name, colours, logo and support contacts come only from here, so a rebrand needs no code change (spec 11.6).</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="App name">
          <input className="input" value={b.appName} minLength={2} maxLength={40} onChange={(e) => set({ appName: e.target.value })} required />
        </Field>
        <Field label="Short name (logo badge)" hint="Up to 6 characters">
          <input className="input" value={b.shortName} maxLength={6} onChange={(e) => set({ shortName: e.target.value })} required />
        </Field>
        <Field label="Tagline">
          <input className="input" value={b.tagline} maxLength={80} onChange={(e) => set({ tagline: e.target.value })} />
        </Field>
        <Field label="Tagline (Hindi)">
          <input className="input" value={b.taglineHi} maxLength={80} onChange={(e) => set({ taglineHi: e.target.value })} />
        </Field>
        <Field label="Primary colour">
          <div className="flex items-center gap-2">
            <input type="color" value={b.primaryColor} onChange={(e) => set({ primaryColor: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-border" />
            <input className="input font-mono" value={b.primaryColor} pattern="^#[0-9a-fA-F]{6}$" onChange={(e) => set({ primaryColor: e.target.value })} />
          </div>
        </Field>
        <Field label="Web domain" hint="Used in SMS links, e.g. example.in">
          <input className="input" value={b.webDomain ?? ''} maxLength={120} onChange={(e) => set({ webDomain: e.target.value || null })} />
        </Field>
        {(['logoUrl', 'iconUrl'] as const).map((k) => (
          <Field key={k} label={k === 'logoUrl' ? 'Logo' : 'App icon'}>
            <div className="flex items-center gap-3">
              {b[k] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={media(b[k], 'sm')!} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ background: b.primaryColor }}>
                  {b.shortName}
                </span>
              )}
              <UploadButton label="Upload" onUploaded={(u) => set({ [k]: u.url })} />
              {b[k] && (
                <button type="button" className="text-sm text-muted" onClick={() => set({ [k]: null })}>
                  Remove
                </button>
              )}
            </div>
          </Field>
        ))}
        <Field label="Support email">
          <input className="input" type="email" value={b.supportEmail} maxLength={120} onChange={(e) => set({ supportEmail: e.target.value })} />
        </Field>
        <Field label="Support phone">
          <input className="input" value={b.supportPhone} maxLength={40} onChange={(e) => set({ supportPhone: e.target.value })} />
        </Field>
      </div>
      <button className="btn-primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save brand'}
      </button>
    </form>
  );
}

function RulesForm({ initial, onSave }: { initial: ReviewRules; onSave: (r: ReviewRules) => Promise<void> }) {
  const [r, setR] = useState(initial);
  const num = (k: keyof ReviewRules, label: string, hint: string) => (
    <Field label={label} hint={hint}>
      <input type="number" className="input" min={0} value={r[k]} onChange={(e) => setR({ ...r, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
    </Field>
  );
  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(r);
      }}
    >
      <div>
        <h2 className="font-semibold">Review rules</h2>
        <p className="text-sm text-muted">Fake review defences (spec 6). Verified phone is always required.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {num('minChars', 'Minimum characters', 'Spec: 20')}
        {num('cooldownDays', 'Days between reviews', 'Same person, same place')}
        {num('perDayLimit', 'Reviews per day', 'Per person')}
        {num('burstThreshold', '5★ burst threshold', 'In 24 h, holds new 5★ reviews')}
      </div>
      <button className="btn-primary">Save rules</button>
    </form>
  );
}

export default function SettingsPage() {
  const settings = useApi<Settings>('/v1/admin/settings');
  const filters = useApi<Filters>('/v1/filters');
  const { refreshConfig } = useSession();
  const [overrideCity, setOverrideCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  async function save(body: Record<string, unknown>, cityId: string | null = null) {
    setError(null);
    try {
      await api('/v1/admin/settings', { method: 'PUT', body: { ...body, cityId } });
      settings.reload();
      setFlash('Saved. Diners see the change on their next visit.');
      refreshConfig();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (settings.loading) return <Loading />;
  if (!settings.data) return <ErrorNote message={settings.error} onRetry={settings.reload} />;
  const s = settings.data;
  const overrides = s.cityOverrides.filter((o) => FLAGS.some((f) => f.key === o.key));
  // Cities (live or not) come from the filters endpoint's live list plus any with overrides.
  const cities = filters.data?.cities ?? [];

  return (
    <div className="space-y-6">
      <PageTitle title="Settings" />
      <ErrorNote message={error} />
      <div className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Feature switches</h2>
          <p className="text-sm text-muted">Global values apply everywhere unless a town overrides them (spec 9.3).</p>
        </div>
        {FLAGS.map((f) => (
          <Toggle
            key={f.key}
            checked={s[f.key]}
            onChange={(v) => save({ [f.key]: v })}
            label={
              <span>
                {f.label} <span className="block text-xs text-muted">{f.help}</span>
              </span>
            }
          />
        ))}
        <div className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-semibold">Per-town overrides</h3>
          {overrides.length === 0 && <p className="text-sm text-muted">No overrides — every town uses the global values.</p>}
          <ul className="divide-y divide-border text-sm">
            {overrides.map((o) => (
              <li key={`${o.cityId}-${o.key}`} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <b>{o.city}</b>: {FLAGS.find((f) => f.key === o.key)?.label} = <b>{String(o.value)}</b>
                </span>
                <button className="text-xs text-muted underline" onClick={() => save({ [o.key]: null }, o.cityId)}>
                  Remove override
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select className="input w-auto" value={overrideCity} onChange={(e) => setOverrideCity(e.target.value)}>
              <option value="">Pick a town…</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {overrideCity &&
              FLAGS.map((f) => (
                <span key={f.key} className="flex gap-1">
                  <button className="chip py-1 text-xs" onClick={() => save({ [f.key]: true }, overrideCity)}>
                    {f.label}: on
                  </button>
                  <button className="chip py-1 text-xs" onClick={() => save({ [f.key]: false }, overrideCity)}>
                    off
                  </button>
                </span>
              ))}
          </div>
        </div>
      </div>
      <RulesForm initial={s.review_rules} onSave={(review_rules) => save({ review_rules })} />
      <BrandForm initial={s.brand} onSave={(brand) => save({ brand })} />
      <p className="text-sm text-muted">Towns, cuisines and other vocabulary live in Catalogue.</p>
      {flash}
    </div>
  );
}
