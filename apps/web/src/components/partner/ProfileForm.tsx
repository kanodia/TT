'use client';

import { useState } from 'react';
import { HoursEditor, LocationPicker, TaxonomyFields } from '@/components/forms';
import { ErrorNote, Field, Loading } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Filters, ProfileInput, Shift } from '@/lib/types';
import { useApi } from '@/lib/useApi';

export const EMPTY_PROFILE: ProfileInput = {
  name: '',
  nameHi: null,
  description: null,
  cityId: '',
  localityId: null,
  addressLine: '',
  landmark: null,
  pincode: null,
  lat: 0,
  lng: 0,
  phone: null,
  whatsapp: null,
  website: null,
  bookingUrl: null,
  socialLinks: {},
  typeSlug: null,
  cuisineSlugs: [],
  attributeKeys: [],
  costForTwo: 0,
  fssaiNumber: null,
  knownFor: [],
  parkingInfo: null,
  allergenNotes: null,
  dressCode: null,
  agePolicy: null,
  alcoholPolicy: null,
  avgWaitMins: null,
  bestTimeToVisit: null,
};

const orNull = (s: string) => (s.trim() ? s.trim() : null);
const URL_RE = /^https?:\/\/.+\..+/;

/** Client-side checks that mirror the API's zod schema, so partners see problems before submitting. */
export function validateProfile(p: ProfileInput): MessageKey | null {
  if (p.name.trim().length < 2) return 'pform.err.name';
  if (!p.cityId) return 'pform.err.city';
  if (p.addressLine.trim().length < 3) return 'pform.err.address';
  if (!p.lat || !p.lng) return 'pform.err.location';
  for (const v of [p.phone, p.whatsapp]) if (v && !/^[6-9]\d{9}$/.test(v)) return 'pform.err.phone';
  if (p.pincode && !/^\d{6}$/.test(p.pincode)) return 'pform.err.pincode';
  if (p.fssaiNumber && !/^\d{14}$/.test(p.fssaiNumber)) return 'pform.err.fssai';
  for (const v of [p.website, p.bookingUrl, ...Object.values(p.socialLinks)]) if (v && !URL_RE.test(v)) return 'pform.err.url';
  return null;
}

/** Keys the API accepts on create/update (the partner GET returns extra fields). */
export function toProfileInput(r: ProfileInput): ProfileInput {
  return Object.fromEntries(Object.keys(EMPTY_PROFILE).map((k) => [k, r[k as keyof ProfileInput] ?? EMPTY_PROFILE[k as keyof ProfileInput]])) as ProfileInput;
}

function KnownFor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useSession();
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v) && value.length < 6) onChange([...value, v]);
    setDraft('');
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {value.map((k) => (
          <span key={k} className="chip chip-on">
            {k}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== k))} aria-label={t('action.remove')}>
              ×
            </button>
          </span>
        ))}
      </div>
      {value.length < 6 && (
        <input
          className="input"
          value={draft}
          maxLength={40}
          placeholder={t('pform.knownForPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
        />
      )}
    </div>
  );
}

export function ProfileForm({
  initial,
  onSubmit,
  submitLabel,
  hours,
  lockedCore,
  extra,
}: {
  initial: ProfileInput;
  onSubmit: (p: ProfileInput, hours?: Shift[]) => Promise<void>;
  submitLabel: string;
  /** When given, the form also collects opening hours (used on first creation). */
  hours?: Shift[];
  /** Live listings: name/address/location changes go to admin review. */
  lockedCore?: boolean;
  extra?: React.ReactNode;
}) {
  const { place, t, lang } = useSession();
  const filters = useApi<Filters>('/v1/filters');
  const [p, setP] = useState<ProfileInput>(() => (initial.lat ? initial : { ...initial, lat: place.lat, lng: place.lng, cityId: initial.cityId || place.cityId || '' }));
  const [h, setH] = useState<Shift[] | undefined>(hours);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<ProfileInput>) => setP((cur) => ({ ...cur, ...patch }));

  if (filters.loading) return <Loading />;
  if (!filters.data) return <ErrorNote message={filters.error} onRetry={filters.reload} />;
  const f = filters.data;
  const city = f.cities.find((c) => c.id === p.cityId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateProfile(p);
    if (problem) {
      setError(t(problem));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(p, h);
    } catch (err) {
      setError(errorMessage(err));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <ErrorNote message={error} />

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">{t('pform.basics')}</h2>
        {lockedCore && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{t('pform.lockedCore')}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('pform.name')} *`}>
            <input className="input" value={p.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} required />
          </Field>
          <Field label={t('pform.nameHi')}>
            <input className="input" value={p.nameHi ?? ''} maxLength={100} onChange={(e) => set({ nameHi: orNull(e.target.value) })} placeholder="हिन्दी में नाम" />
          </Field>
        </div>
        <Field label={t('pform.description')} hint={t('pform.descriptionHint')}>
          <textarea className="input min-h-20" value={p.description ?? ''} maxLength={500} onChange={(e) => set({ description: e.target.value || null })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('pform.cost')} *`}>
            <input className="input" type="number" min={0} max={100000} value={p.costForTwo || ''} onChange={(e) => set({ costForTwo: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          </Field>
          <Field label={t('pform.knownFor')} hint={t('pform.knownForHint')}>
            <KnownFor value={p.knownFor} onChange={(knownFor) => set({ knownFor })} />
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">{t('pform.location')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('pform.town')} *`}>
            <select className="input" value={p.cityId} onChange={(e) => set({ cityId: e.target.value, localityId: null })} required>
              <option value="">{t('pform.select')}</option>
              {f.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'hi' && c.nameHi ? c.nameHi : c.name}, {c.state}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pform.locality')}>
            <select
              className="input"
              value={p.localityId ?? ''}
              onChange={(e) => {
                const loc = city?.localities.find((l) => l.id === e.target.value);
                set({ localityId: e.target.value || null, ...(loc && !initial.lat ? { lat: loc.lat, lng: loc.lng } : {}) });
              }}
              disabled={!city}
            >
              <option value="">—</option>
              {city?.localities.map((l) => (
                <option key={l.id} value={l.id}>
                  {lang === 'hi' && l.nameHi ? l.nameHi : l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={`${t('pform.address')} *`}>
          <input className="input" value={p.addressLine} maxLength={200} onChange={(e) => set({ addressLine: e.target.value })} placeholder={t('pform.addressPlaceholder')} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pform.landmark')}>
            <input className="input" value={p.landmark ?? ''} maxLength={120} onChange={(e) => set({ landmark: orNull(e.target.value) })} placeholder={t('pform.landmarkPlaceholder')} />
          </Field>
          <Field label={t('pform.pincode')}>
            <input className="input" inputMode="numeric" maxLength={6} value={p.pincode ?? ''} onChange={(e) => set({ pincode: orNull(e.target.value.replace(/\D/g, '')) })} />
          </Field>
        </div>
        <LocationPicker lat={p.lat} lng={p.lng} onChange={(lat, lng) => set({ lat, lng })} />
        <Field label={t('pform.parking')}>
          <input className="input" value={p.parkingInfo ?? ''} maxLength={120} onChange={(e) => set({ parkingInfo: orNull(e.target.value) })} placeholder={t('pform.parkingPlaceholder')} />
        </Field>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">{t('pform.contact')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('pform.phone')}>
            <input className="input" inputMode="numeric" maxLength={10} value={p.phone ?? ''} onChange={(e) => set({ phone: orNull(e.target.value.replace(/\D/g, '')) })} />
          </Field>
          <Field label="WhatsApp">
            <input className="input" inputMode="numeric" maxLength={10} value={p.whatsapp ?? ''} onChange={(e) => set({ whatsapp: orNull(e.target.value.replace(/\D/g, '')) })} />
          </Field>
          <Field label={t('pform.website')}>
            <input className="input" value={p.website ?? ''} onChange={(e) => set({ website: orNull(e.target.value) })} placeholder="https://" />
          </Field>
          <Field label={t('pform.booking')} hint={t('pform.bookingHint')}>
            <input className="input" value={p.bookingUrl ?? ''} onChange={(e) => set({ bookingUrl: orNull(e.target.value) })} placeholder="https://wa.me/91…" />
          </Field>
          {(['instagram', 'facebook', 'youtube'] as const).map((k) => (
            <Field key={k} label={k[0].toUpperCase() + k.slice(1)}>
              <input
                className="input"
                value={p.socialLinks[k] ?? ''}
                onChange={(e) => {
                  const links = { ...p.socialLinks };
                  if (e.target.value.trim()) links[k] = e.target.value.trim();
                  else delete links[k];
                  set({ socialLinks: links });
                }}
                placeholder={`https://${k}.com/…`}
              />
            </Field>
          ))}
        </div>
        <Field label={t('pform.fssai')} hint={t('pform.fssaiHint')}>
          <input className="input" inputMode="numeric" maxLength={14} value={p.fssaiNumber ?? ''} onChange={(e) => set({ fssaiNumber: orNull(e.target.value.replace(/\D/g, '')) })} />
        </Field>
      </section>

      <section className="card p-5">
        <h2 className="mb-4 font-semibold">{t('pform.food')}</h2>
        <TaxonomyFields filters={f} typeSlug={p.typeSlug} cuisineSlugs={p.cuisineSlugs} attributeKeys={p.attributeKeys} onChange={set} />
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">{t('pform.policies')}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('detail.dressCode')}>
            <input className="input" value={p.dressCode ?? ''} maxLength={120} onChange={(e) => set({ dressCode: orNull(e.target.value) })} />
          </Field>
          <Field label={t('detail.agePolicy')}>
            <input className="input" value={p.agePolicy ?? ''} maxLength={120} onChange={(e) => set({ agePolicy: orNull(e.target.value) })} />
          </Field>
          <Field label={t('detail.alcoholPolicy')}>
            <input className="input" value={p.alcoholPolicy ?? ''} maxLength={120} onChange={(e) => set({ alcoholPolicy: orNull(e.target.value) })} />
          </Field>
          <Field label={t('pform.wait')}>
            <input className="input" type="number" min={0} max={180} value={p.avgWaitMins ?? ''} onChange={(e) => set({ avgWaitMins: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))) })} />
          </Field>
          <Field label={t('detail.bestTime')}>
            <input className="input" value={p.bestTimeToVisit ?? ''} maxLength={120} onChange={(e) => set({ bestTimeToVisit: orNull(e.target.value) })} placeholder={t('pform.bestTimePlaceholder')} />
          </Field>
          <Field label={t('detail.allergens')}>
            <input className="input" value={p.allergenNotes ?? ''} maxLength={300} onChange={(e) => set({ allergenNotes: orNull(e.target.value) })} placeholder={t('pform.allergenPlaceholder')} />
          </Field>
        </div>
      </section>

      {h && (
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">{t('detail.hours')}</h2>
          <HoursEditor value={h} onChange={setH} />
        </section>
      )}

      {extra}

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-white/95 px-4 py-3 backdrop-blur">
        <button className="btn-primary w-full sm:w-auto" disabled={busy}>
          {busy ? t('action.saving') : submitLabel}
        </button>
      </div>
    </form>
  );
}
