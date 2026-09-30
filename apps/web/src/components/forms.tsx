'use client';

import { useRef, useState } from 'react';
import type { MessageKey } from '@/i18n';
import { API_URL, errorMessage, getToken, media, uploadFile, type Uploaded } from '@/lib/api';
import { DAY_KEYS, dayDate, nm } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Filters, Shift, SpecialDay } from '@/lib/types';
import { Map } from './Map';
import { Spinner } from './ui';

// ---------- Opening hours ----------

/** Weekly hours: each day is closed, open 24h (opensAt === closesAt) or one or more shifts. */
export function HoursEditor({ value, onChange }: { value: Shift[]; onChange: (v: Shift[]) => void }) {
  const { t } = useSession();
  const byDay = [0, 1, 2, 3, 4, 5, 6].map((d) => value.filter((s) => s.dayOfWeek === d));
  const setDay = (d: number, shifts: Omit<Shift, 'dayOfWeek'>[]) =>
    onChange(
      [...value.filter((s) => s.dayOfWeek !== d), ...shifts.map((s) => ({ ...s, dayOfWeek: d }))].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt),
      ),
    );

  function copyToAll(from: number) {
    const src = byDay[from];
    onChange([0, 1, 2, 3, 4, 5, 6].flatMap((d) => src.map((s) => ({ ...s, dayOfWeek: d }))));
  }

  return (
    <div className="space-y-2">
      {byDay.map((shifts, d) => {
        const closed = shifts.length === 0;
        const allDay = shifts.length === 1 && shifts[0].opensAt === shifts[0].closesAt;
        return (
          <div key={d} className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-border px-3 py-2">
            <span className="w-12 pt-1.5 text-sm font-medium">{t(DAY_KEYS[d])}</span>
            <div className="flex flex-1 flex-col gap-1.5">
              {closed && <span className="pt-1.5 text-sm text-red-600">{t('open.closed')}</span>}
              {allDay && <span className="pt-1.5 text-sm text-good">{t('open.allDay')}</span>}
              {!closed &&
                !allDay &&
                shifts.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <input type="time" className="input w-28 py-1" value={s.opensAt} onChange={(e) => setDay(d, shifts.map((x, j) => (j === i ? { ...x, opensAt: e.target.value } : x)))} aria-label={`${t(DAY_KEYS[d])} ${t('hours.opens')}`} />
                    <span className="text-muted">–</span>
                    <input type="time" className="input w-28 py-1" value={s.closesAt} onChange={(e) => setDay(d, shifts.map((x, j) => (j === i ? { ...x, closesAt: e.target.value } : x)))} aria-label={`${t(DAY_KEYS[d])} ${t('hours.closes')}`} />
                    {s.closesAt < s.opensAt && <span className="text-xs text-muted">({t('hours.nextDay')})</span>}
                    <button type="button" className="px-1 text-muted hover:text-red-600" onClick={() => setDay(d, shifts.filter((_, j) => j !== i))} aria-label={t('action.remove')}>
                      ✕
                    </button>
                  </div>
                ))}
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {!allDay && shifts.length < 4 && (
                <button type="button" className="chip py-1 text-xs" onClick={() => setDay(d, [...shifts, { opensAt: shifts.length ? '19:00' : '10:00', closesAt: shifts.length ? '23:00' : '22:00' }])}>
                  + {closed ? t('hours.open') : t('hours.shift')}
                </button>
              )}
              {!allDay && (
                <button type="button" className="chip py-1 text-xs" onClick={() => setDay(d, [{ opensAt: '00:00', closesAt: '00:00' }])}>
                  24h
                </button>
              )}
              {!closed && (
                <button type="button" className="chip py-1 text-xs" onClick={() => setDay(d, [])}>
                  {t('open.closed')}
                </button>
              )}
              {!closed && (
                <button type="button" className="chip py-1 text-xs" onClick={() => copyToAll(d)} title={t('hours.copyAllHint')}>
                  {t('hours.copyAll')}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Holidays and one-off days (spec 4.2 "holiday closures", 5.2 "special hours"). */
export function SpecialHoursEditor({ value, onChange }: { value: SpecialDay[]; onChange: (v: SpecialDay[]) => void }) {
  const { t, lang } = useSession();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState('');
  const set = (i: number, patch: Partial<SpecialDay>) => onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-sm text-muted">{t('hours.noSpecial')}</p>}
      {value.map((d, i) => (
        <div key={d.date} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2">
          <span className="w-32 text-sm font-medium">{dayDate(d.date, lang)}</span>
          <select className="input w-auto py-1" value={d.isClosed ? 'closed' : 'open'} onChange={(e) => set(i, e.target.value === 'closed' ? { isClosed: true, opensAt: null, closesAt: null } : { isClosed: false, opensAt: '10:00', closesAt: '18:00' })}>
            <option value="closed">{t('open.closed')}</option>
            <option value="open">{t('hours.specialOpen')}</option>
          </select>
          {!d.isClosed && (
            <>
              <input type="time" className="input w-28 py-1" value={d.opensAt ?? ''} onChange={(e) => set(i, { opensAt: e.target.value })} />
              <span className="text-muted">–</span>
              <input type="time" className="input w-28 py-1" value={d.closesAt ?? ''} onChange={(e) => set(i, { closesAt: e.target.value })} />
            </>
          )}
          <input className="input min-w-32 flex-1 py-1" placeholder={t('hours.notePlaceholder')} maxLength={80} value={d.note ?? ''} onChange={(e) => set(i, { note: e.target.value || null })} />
          <button type="button" className="px-1 text-muted hover:text-red-600" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={t('action.remove')}>
            ✕
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input type="date" className="input w-auto" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
        <button
          type="button"
          className="btn-outline"
          disabled={!date || value.some((d) => d.date === date)}
          onClick={() => {
            onChange([...value, { date, isClosed: true, opensAt: null, closesAt: null, note: null }].sort((a, b) => a.date.localeCompare(b.date)));
            setDate('');
          }}
        >
          + {t('hours.addDay')}
        </button>
      </div>
    </div>
  );
}

// ---------- Cuisines / type / attributes ----------

export function TaxonomyFields({
  filters,
  typeSlug,
  cuisineSlugs,
  attributeKeys,
  onChange,
}: {
  filters: Filters;
  typeSlug: string | null;
  cuisineSlugs: string[];
  attributeKeys: string[];
  onChange: (v: { typeSlug?: string | null; cuisineSlugs?: string[]; attributeKeys?: string[] }) => void;
}) {
  const { t, lang } = useSession();
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  return (
    <div className="space-y-5">
      <div>
        <span className="label">{t('filters.types')}</span>
        <div className="flex flex-wrap gap-2">
          {filters.types.map((ty) => (
            <button type="button" key={ty.slug} className={`chip ${typeSlug === ty.slug ? 'chip-on' : ''}`} onClick={() => onChange({ typeSlug: typeSlug === ty.slug ? null : ty.slug })}>
              {nm(ty, lang)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="label">{t('form.cuisinesHint')}</span>
        <div className="flex flex-wrap gap-2">
          {filters.cuisines.map((c) => {
            const idx = cuisineSlugs.indexOf(c.slug);
            return (
              <button type="button" key={c.slug} disabled={idx < 0 && cuisineSlugs.length >= 8} className={`chip disabled:opacity-40 ${idx >= 0 ? 'chip-on' : ''}`} onClick={() => onChange({ cuisineSlugs: toggle(cuisineSlugs, c.slug) })}>
                {c.icon} {nm(c, lang)}
                {idx === 0 && <span className="text-[10px]">({t('form.main')})</span>}
              </button>
            );
          })}
        </div>
      </div>
      {(['dietary', 'occasion', 'feature', 'service', 'payment'] as const).map((g) => (
        <div key={g}>
          <span className="label">{t(`filters.group.${g}` as MessageKey)}</span>
          <div className="flex flex-wrap gap-2">
            {filters.attributes
              .filter((a) => a.group === g)
              .map((a) => (
                <button type="button" key={a.key} className={`chip ${attributeKeys.includes(a.key) ? 'chip-on' : ''}`} onClick={() => onChange({ attributeKeys: toggle(attributeKeys, a.key) })}>
                  {a.icon} {nm(a, lang)}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Location ----------

export function LocationPicker({
  lat,
  lng,
  onChange,
  accuracy,
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number, accuracyM?: number) => void;
  accuracy?: number | null;
}) {
  const { t } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function gps() {
    if (!navigator.geolocation) return setError(t('form.gpsUnavailable'));
    setBusy(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
        setBusy(false);
      },
      (e) => {
        setError(e.code === e.PERMISSION_DENIED ? t('form.gpsDenied') : t('form.gpsFailed'));
        setBusy(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-outline" onClick={gps} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : '📍'} {t('form.useGps')}
        </button>
        <span className="text-xs text-muted">
          {lat.toFixed(5)}, {lng.toFixed(5)}
          {accuracy != null && ` · ±${Math.round(accuracy)} m`}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Map className="h-64" center={[lat, lng]} pins={[{ id: 'pin', lat, lng, label: '' }]} onPick={(la, ln) => onChange(la, ln)} />
      <p className="text-xs text-muted">{t('form.dragPin')}</p>
    </div>
  );
}

// ---------- Uploads ----------

export function UploadButton({
  onUploaded,
  kind = 'photo',
  label,
  accept,
  className = 'btn-outline',
}: {
  onUploaded: (uploaded: Uploaded, file: File) => void | Promise<void>;
  kind?: 'photo' | 'document';
  label?: string;
  accept?: string;
  className?: string;
}) {
  const { t } = useSession();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Spinner className="h-4 w-4" /> : '⬆'} {label ?? t('action.upload')}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept ?? (kind === 'photo' ? 'image/jpeg,image/png,image/webp,image/heic' : 'image/jpeg,image/png,image/webp,application/pdf')}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          setBusy(true);
          setError(null);
          try {
            await onUploaded(await uploadFile(file, kind), file);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      />
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </span>
  );
}

/** Opens a private document (licence, ownership proof) with the admin's token. */
export async function openPrivateDocument(url: string) {
  if (!url.startsWith('/private/')) return window.open(media(url) ?? url, '_blank');
  const name = url.slice('/private/'.length);
  const res = await fetch(`${API_URL}/v1/admin/files/${name}`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) return alert('Could not open this document');
  const blob = await res.blob();
  window.open(URL.createObjectURL(blob), '_blank');
}
