'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { HoursEditor, LocationPicker, TaxonomyFields } from '@/components/forms';
import { ErrorNote, Field, Loading, Notice, Toggle } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, media } from '@/lib/api';
import { cached, compressPhoto, getQueued, putQueued, readExif, syncQueue, type CapturePayload, type CapturePhoto } from '@/lib/fieldQueue';
import { useSession } from '@/lib/session';
import type { Filters } from '@/lib/types';
import { useOnline } from '@/lib/useOnline';

type Nearby = {
  restaurants: { id: string; name: string; addressLine: string; distanceM: number; status: string; likelyDuplicate: boolean }[];
  pendingCaptures: { id: string; name: string; distanceM: number; likelyDuplicate: boolean }[];
  leads: { id: string; name: string; distanceM: number }[];
};
type Lead = { id: string; name: string; address: string | null; phone: string | null; lat: number | null; lng: number | null; cityId: string };

const MIN_ACCURACY_M = 30;
const PHOTO_KINDS: CapturePhoto['category'][] = ['exterior', 'food', 'menu', 'ambience'];

const blank = (lat: number, lng: number, cityId: string): CapturePayload => ({
  name: '',
  nameHi: null,
  cityId,
  localityId: null,
  addressLine: '',
  landmark: null,
  pincode: null,
  lat,
  lng,
  phone: null,
  whatsapp: null,
  typeSlug: null,
  cuisineSlugs: [],
  attributeKeys: [],
  costForTwo: 0,
  knownFor: [],
  hours: [],
  ownerName: null,
  ownerPhone: null,
  ownerConsent: false,
  wantsToManage: false,
  notes: null,
  photos: [],
});

const orNull = (s: string) => (s.trim() ? s.trim() : null);

/** Town whose centre is closest to a point (the default place carries no town id). */
function nearestCityId(cities: Filters['cities'], lat: number, lng: number) {
  let best: { id: string; d: number } | null = null;
  for (const c of cities) {
    const d = (c.lat - lat) ** 2 + ((c.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (!best || d < best.d) best = { id: c.id, d };
  }
  return best?.id ?? '';
}

function validate(p: CapturePayload, accuracy: number | null): MessageKey | null {
  if (p.name.trim().length < 2) return 'fcap.err.name';
  if (!p.cityId) return 'fcap.err.town';
  if (p.addressLine.trim().length < 3) return 'fcap.err.address';
  if (!p.lat || !p.lng) return 'fcap.err.gps';
  if (!p.photos.some((ph) => ph.category === 'exterior')) return 'fcap.err.storefront';
  for (const v of [p.phone, p.whatsapp, p.ownerPhone]) if (v && !/^[6-9]\d{9}$/.test(v)) return 'fcap.err.phone';
  if (p.pincode && !/^\d{6}$/.test(p.pincode)) return 'fcap.err.pincode';
  if (!p.ownerConsent) return 'fcap.err.consent';
  if (p.wantsToManage && !p.ownerPhone) return 'fcap.err.ownerPhone';
  if (accuracy != null && accuracy > MIN_ACCURACY_M * 3) return 'fcap.err.accuracy';
  return null;
}

function Capture() {
  const params = useSearchParams();
  const router = useRouter();
  const online = useOnline();
  const { place, t, lang } = useSession();
  const leadId = params.get('lead');
  const draftId = params.get('draft');
  const resubmitId = params.get('resubmit');

  const [filters, setFilters] = useState<Filters | null>(null);
  const [p, setP] = useState<CapturePayload | null>(null);
  const [meta, setMeta] = useState<{ clientUuid: string; leadId: string | null; capturedAt: string | null }>({ clientUuid: '', leadId, capturedAt: null });
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [knowHours, setKnowHours] = useState(true);
  const [dish, setDish] = useState('');
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const [photoKind, setPhotoKind] = useState<CapturePhoto['category']>('exterior');
  // Until the agent picks a town, it follows the GPS fix.
  const [townPicked, setTownPicked] = useState(false);
  const set = (patch: Partial<CapturePayload>) => setP((cur) => (cur ? { ...cur, ...patch } : cur));

  function grabGps(cities?: Filters['cities']) {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const list = cities ?? filters?.cities;
        set({ lat: pos.coords.latitude, lng: pos.coords.longitude, ...(list && !townPicked ? { cityId: nearestCityId(list, pos.coords.latitude, pos.coords.longitude) } : {}) });
        setAccuracy(pos.coords.accuracy);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  // Load reference data (cached for offline) and the draft / lead / sent-back capture to start from.
  useEffect(() => {
    (async () => {
      try {
        const f = await cached('filters', () => api<Filters>('/v1/filters'));
        setFilters(f.data);
        if (draftId) {
          const d = await getQueued(draftId);
          if (d) {
            setP({ ...blank(d.payload.lat, d.payload.lng, d.payload.cityId), ...d.payload });
            setAccuracy(d.gpsAccuracyM);
            setKnowHours(d.payload.hours.length > 0);
            setMeta({ clientUuid: d.clientUuid, leadId: d.leadId, capturedAt: d.capturedAt });
            if (d.error) setError(t('fcap.serverSaid', { error: d.error }));
            return;
          }
        }
        if (resubmitId) {
          // A capture the reviewer sent back: reopen it as a new capture with the fixes (photos already uploaded).
          const subs = await api<{ data: { id: string; payload?: CapturePayload; reviewNote: string | null }[] }>('/v1/field/me/submissions');
          const s = subs.data.find((x) => x.id === resubmitId);
          if (s?.payload) {
            setP({ ...blank(s.payload.lat, s.payload.lng, s.payload.cityId), ...s.payload });
            setKnowHours((s.payload.hours ?? []).length > 0);
            setMeta({ clientUuid: crypto.randomUUID(), leadId: null, capturedAt: null });
            if (s.reviewNote) setError(t('fcap.reviewerSaid', { note: s.reviewNote }));
            return;
          }
        }
        let lead: Lead | undefined;
        let start = blank(place.lat, place.lng, place.cityId ?? nearestCityId(f.data.cities, place.lat, place.lng));
        if (leadId) {
          const leads = await cached('leads', () => api<{ data: Lead[] }>('/v1/field/leads').then((r) => r.data)).catch(() => null);
          lead = leads?.data.find((l) => l.id === leadId);
          if (lead) start = { ...start, name: lead.name, addressLine: lead.address ?? '', phone: lead.phone, cityId: lead.cityId, ...(lead.lat && lead.lng ? { lat: lead.lat, lng: lead.lng } : {}) };
        }
        setP(start);
        setMeta({ clientUuid: crypto.randomUUID(), leadId, capturedAt: null });
        if (lead) setTownPicked(true);
        grabGps(f.data.cities);
      } catch {
        setError(t('fcap.loadFailed'));
      }
    })();
    // Runs once per draft/lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, leadId, resubmitId]);

  // Duplicate check whenever the pin or name settles (online only, spec 7.3).
  const lat = p?.lat;
  const lng = p?.lng;
  const name = p?.name ?? '';
  useEffect(() => {
    if (!online || !lat || !lng) return;
    const timer = setTimeout(() => {
      api<Nearby>('/v1/field/places/nearby', { query: { lat, lng, name: name.trim() || undefined } })
        .then(setNearby)
        .catch(() => setNearby(null));
    }, 700);
    return () => clearTimeout(timer);
  }, [lat, lng, name, online]);

  if (!p || !filters) return error ? <ErrorNote message={error} /> : <Loading />;
  const city = filters.cities.find((c) => c.id === p.cityId);
  const likely = [...(nearby?.restaurants ?? []), ...(nearby?.pendingCaptures ?? [])].filter((d) => d.likelyDuplicate);
  const others = [...(nearby?.restaurants ?? []), ...(nearby?.pendingCaptures ?? [])].filter((d) => !d.likelyDuplicate);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    try {
      const added: CapturePhoto[] = [];
      for (const f of Array.from(files).slice(0, 24 - p!.photos.length)) {
        const exif = await readExif(f);
        added.push({ dataUrl: await compressPhoto(f), category: photoKind, ...(exif ? { exif } : {}) });
      }
      set({ photos: [...p!.photos, ...added] });
    } catch {
      setError(t('fcap.photoFailed'));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload: CapturePayload = { ...p!, hours: knowHours ? p!.hours : [], name: p!.name.trim(), addressLine: p!.addressLine.trim() };
    const problem = validate(payload, accuracy);
    if (problem) {
      setError(t(problem, { m: accuracy != null ? Math.round(accuracy) : '' }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSaving(true);
    await putQueued({ clientUuid: meta.clientUuid, leadId: meta.leadId, capturedAt: meta.capturedAt ?? new Date().toISOString(), gpsAccuracyM: accuracy, payload });
    if (online) syncQueue().catch(() => {});
    router.push('/field');
  }

  const addDish = () => {
    const v = dish.trim();
    if (v && !p.knownFor.includes(v) && p.knownFor.length < 6) set({ knownFor: [...p.knownFor, v] });
    setDish('');
  };

  return (
    <form onSubmit={save} className="space-y-5 pb-4">
      <h1 className="text-2xl font-semibold">{draftId ? t('fcap.editTitle') : resubmitId ? t('fcap.fixTitle') : t('fcap.title')}</h1>
      {!online && <Notice tone="warn">{t('fcap.offline')}</Notice>}
      <ErrorNote message={error} />

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">1. {t('fcap.location')}</h2>
        <LocationPicker
          lat={p.lat}
          lng={p.lng}
          accuracy={accuracy}
          onChange={(la, ln, acc) => {
            set({ lat: la, lng: ln });
            if (acc !== undefined) setAccuracy(acc);
          }}
        />
        {accuracy != null && accuracy > MIN_ACCURACY_M && <p className="text-xs text-warn">{t('fcap.accuracyWarn', { m: Math.round(accuracy), min: MIN_ACCURACY_M })}</p>}
        {likely.length > 0 && (
          <Notice tone="warn">
            <b>⚠️ {t('fcap.likelyDup')}</b>
            <ul className="mt-1 list-disc pl-5">
              {likely.map((d) => (
                <li key={d.id}>
                  {d.name} ({d.distanceM} m{'status' in d ? `, ${d.status}` : `, ${t('fcap.pendingCapture')}`})
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">{t('fcap.likelyDupHint')}</p>
          </Notice>
        )}
        {others.length > 0 && (
          <p className="text-xs text-muted">
            {t('fcap.nearby')}: {others.map((d) => `${d.name} (${d.distanceM} m)`).join(', ')}
          </p>
        )}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">2. {t('fcap.nameAddress')}</h2>
        <Field label={`${t('fcap.boardName')} *`}>
          <input className="input" value={p.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t('pform.nameHi')}>
          <input className="input" value={p.nameHi ?? ''} maxLength={100} onChange={(e) => set({ nameHi: orNull(e.target.value) })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t('pform.town')} *`}>
            <select
              className="input"
              value={p.cityId}
              onChange={(e) => {
                setTownPicked(true);
                set({ cityId: e.target.value, localityId: null });
              }}
            >
              {filters.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {lang === 'hi' && c.nameHi ? c.nameHi : c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('pform.locality')}>
            <select className="input" value={p.localityId ?? ''} onChange={(e) => set({ localityId: e.target.value || null })}>
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
          <input className="input" value={p.addressLine} maxLength={200} onChange={(e) => set({ addressLine: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('pform.landmark')}>
            <input className="input" value={p.landmark ?? ''} maxLength={120} onChange={(e) => set({ landmark: orNull(e.target.value) })} />
          </Field>
          <Field label={t('pform.pincode')}>
            <input className="input" inputMode="numeric" maxLength={6} value={p.pincode ?? ''} onChange={(e) => set({ pincode: orNull(e.target.value.replace(/\D/g, '')) })} />
          </Field>
        </div>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">3. {t('fcap.photos')}</h2>
        <div className="flex flex-wrap gap-2">
          {PHOTO_KINDS.map((k) => (
            <button
              type="button"
              key={k}
              className={`chip ${p.photos.some((ph) => ph.category === k) ? 'chip-on' : ''}`}
              onClick={() => {
                setPhotoKind(k);
                photoInput.current?.click();
              }}
            >
              📷 {t(`fcap.photo.${k}` as MessageKey)}
            </button>
          ))}
        </div>
        <input
          ref={photoInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = '';
          }}
        />
        {p.photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {p.photos.map((ph, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ph.dataUrl ?? media(ph.url, 'sm') ?? ''} alt="" className="aspect-square w-full rounded-lg object-cover" />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  {t(`fcap.photo.${ph.category}` as MessageKey)}
                  {ph.exif?.lat != null && ' 📍'}
                </span>
                <button type="button" className="absolute top-1 right-1 rounded-full bg-black/60 px-1.5 text-xs text-white" onClick={() => set({ photos: p.photos.filter((_, j) => j !== i) })} aria-label={t('action.remove')}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">{t('fcap.photoHelp')}</p>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">4. {t('fcap.details')}</h2>
        <Field label={t('pform.cost')}>
          <input className="input" type="number" min={0} max={100000} value={p.costForTwo || ''} onChange={(e) => set({ costForTwo: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </Field>
        <Field label={t('pform.knownFor')}>
          <div className="flex flex-wrap gap-2">
            {p.knownFor.map((k) => (
              <span key={k} className="chip chip-on">
                {k}
                <button type="button" onClick={() => set({ knownFor: p.knownFor.filter((x) => x !== k) })}>
                  ×
                </button>
              </span>
            ))}
            <input
              className="input w-40"
              value={dish}
              placeholder={t('pform.knownForPlaceholder')}
              onChange={(e) => setDish(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDish();
                }
              }}
              onBlur={addDish}
            />
          </div>
        </Field>
        <TaxonomyFields filters={filters} typeSlug={p.typeSlug} cuisineSlugs={p.cuisineSlugs} attributeKeys={p.attributeKeys} onChange={set} />
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">5. {t('detail.hours')}</h2>
        <Toggle checked={knowHours} onChange={setKnowHours} label={t('fcap.ownerToldHours')} />
        {knowHours && <HoursEditor value={p.hours} onChange={(hours) => set({ hours })} />}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="font-semibold">6. {t('fcap.consent')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('fcap.restaurantPhone')}>
            <input className="input" inputMode="numeric" maxLength={10} value={p.phone ?? ''} onChange={(e) => set({ phone: orNull(e.target.value.replace(/\D/g, '')) })} />
          </Field>
          <Field label="WhatsApp">
            <input className="input" inputMode="numeric" maxLength={10} value={p.whatsapp ?? ''} onChange={(e) => set({ whatsapp: orNull(e.target.value.replace(/\D/g, '')) })} />
          </Field>
          <Field label={t('fcap.ownerName')}>
            <input className="input" maxLength={80} value={p.ownerName ?? ''} onChange={(e) => set({ ownerName: orNull(e.target.value) })} />
          </Field>
          <Field label={t('fcap.ownerMobile')}>
            <input className="input" inputMode="numeric" maxLength={10} value={p.ownerPhone ?? ''} onChange={(e) => set({ ownerPhone: orNull(e.target.value.replace(/\D/g, '')) })} />
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-lg bg-surface p-3">
          <input type="checkbox" className="mt-1 accent-[var(--brand)]" checked={p.ownerConsent} onChange={(e) => set({ ownerConsent: e.target.checked })} />
          <span className="text-sm">
            <b>{t('fcap.consentLabel')}</b> <span className="text-muted">{t('fcap.required')}</span>
          </span>
        </label>
        <Toggle checked={p.wantsToManage} onChange={(v) => set({ wantsToManage: v })} label={t('fcap.wantsToManage')} />
        <Field label={t('fcap.notes')}>
          <textarea className="input" maxLength={1000} value={p.notes ?? ''} onChange={(e) => set({ notes: orNull(e.target.value) })} placeholder={t('fcap.notesPlaceholder')} />
        </Field>
      </section>

      <div className="sticky bottom-0 -mx-4 border-t border-border bg-white/95 px-4 py-3 backdrop-blur">
        <button className="btn-primary w-full py-3 text-base" disabled={saving}>
          {saving ? t('action.saving') : online ? t('fcap.saveUpload') : t('fcap.saveOnPhone')}
        </button>
      </div>
    </form>
  );
}

export default function CapturePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Capture />
    </Suspense>
  );
}
