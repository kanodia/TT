'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Map } from '@/components/Map';
import { PageTitle } from '@/components/Shell';
import { Cover, Empty, ErrorNote, Field, Loading, Notice, StatusPill, Tabs, useFlash } from '@/components/ui';
import { api, errorMessage, media } from '@/lib/api';
import { DAYS, ago, hoursByDay, humanize, rupees } from '@/lib/format';
import type { Filters } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Payload = {
  name: string;
  nameHi?: string | null;
  cityId: string;
  localityId?: string | null;
  addressLine: string;
  landmark?: string | null;
  lat: number;
  lng: number;
  phone?: string | null;
  whatsapp?: string | null;
  typeSlug?: string | null;
  cuisineSlugs: string[];
  attributeKeys: string[];
  costForTwo: number;
  knownFor?: string[];
  hours: { dayOfWeek: number; opensAt: string; closesAt: string }[];
  ownerName?: string | null;
  ownerPhone?: string | null;
  ownerConsent: boolean;
  wantsToManage: boolean;
  notes?: string | null;
  photos: { url?: string; category: string; exif?: { lat?: number; lng?: number; takenAt?: string } }[];
};
type Submission = {
  id: string;
  status: string;
  reviewNote: string | null;
  gpsAccuracyM: number | null;
  capturedAt: string;
  syncedAt: string;
  restaurantId: string | null;
  leadId: string | null;
  agent: { id: string; name: string | null; phone: string };
  payload: Payload | null;
};
type Nearby = {
  restaurants: { id: string; name: string; addressLine: string; distanceM: number; status: string; likelyDuplicate: boolean }[];
  pendingCaptures: { id: string; name: string; distanceM: number; likelyDuplicate: boolean }[];
};

const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
};

function Review({ s, filters, onDone }: { s: Submission; filters: Filters | undefined; onDone: (msg: string) => void }) {
  const p = s.payload!;
  const [edits, setEdits] = useState<Partial<Payload>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nearby = useApi<Nearby>(s.status === 'submitted' ? '/v1/field/places/nearby' : null, { lat: p.lat, lng: p.lng, name: p.name });
  const dupes = [...(nearby.data?.restaurants ?? []), ...(nearby.data?.pendingCaptures.filter((c) => c.id !== s.id) ?? [])];
  const v = { ...p, ...edits };
  const city = filters?.cities.find((c) => c.id === v.cityId);
  const name = (list: { slug?: string; key?: string; name: string }[] | undefined, id: string) => list?.find((x) => (x.slug ?? x.key) === id)?.name ?? humanize(id);
  // EXIF QA (spec 7.3): how far each photo was taken from the pin.
  const exifGaps = p.photos.flatMap((ph) => (ph.exif?.lat != null && ph.exif.lng != null ? [metres({ lat: ph.exif.lat, lng: ph.exif.lng }, p)] : []));
  const maxGap = exifGaps.length ? Math.max(...exifGaps) : null;

  async function act(kind: 'approve' | 'send-back') {
    if (kind === 'send-back' && note.trim().length < 3) return setError('Tell the agent what to fix');
    setBusy(true);
    setError(null);
    try {
      if (kind === 'approve') {
        await api(`/v1/admin/field/submissions/${s.id}/approve`, { method: 'POST', body: Object.keys(edits).length ? { edits } : {} });
        onDone(`${v.name} is now live`);
      } else {
        await api(`/v1/admin/field/submissions/${s.id}/send-back`, { method: 'POST', body: { note: note.trim() } });
        onDone(`Sent back to ${s.agent.name ?? s.agent.phone}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const byDay = hoursByDay(v.hours);
  return (
    <li className="card overflow-hidden">
      <div className="grid gap-0 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-semibold">
                {v.name} {v.nameHi && <span className="text-sm font-normal text-muted">{v.nameHi}</span>}
              </p>
              <p className="text-sm text-muted">
                {v.addressLine}
                {v.landmark && `, near ${v.landmark}`}, {city?.localities.find((l) => l.id === v.localityId)?.name ?? ''} {city?.name}
              </p>
              <p className="text-xs text-muted">
                By {s.agent.name ?? s.agent.phone} · captured {ago(s.capturedAt)} · uploaded {ago(s.syncedAt)}
                {s.gpsAccuracyM != null && <span className={s.gpsAccuracyM > 30 ? 'font-medium text-warn' : ''}> · GPS ±{Math.round(s.gpsAccuracyM)} m</span>}
                {s.leadId && ' · from a lead'}
              </p>
            </div>
            <StatusPill status={s.status} />
          </div>

          {dupes.some((d) => d.likelyDuplicate) && (
            <Notice tone="warn">
              <b>Likely duplicate</b> (similar name within 50 m):{' '}
              {dupes
                .filter((d) => d.likelyDuplicate)
                .map((d) => `${d.name} (${d.distanceM} m${'status' in d ? `, ${d.status}` : ', pending capture'})`)
                .join('; ')}
            </Notice>
          )}
          {dupes.some((d) => !d.likelyDuplicate) && <p className="text-xs text-muted">Also within 200 m: {dupes.filter((d) => !d.likelyDuplicate).map((d) => `${d.name} (${d.distanceM} m)`).join(', ')}</p>}
          {!p.ownerConsent && <Notice tone="warn">Owner consent was not recorded.</Notice>}
          {maxGap != null && maxGap > 150 && <Notice tone="warn">A photo was taken {maxGap} m from the pin. Check the location before approving.</Notice>}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {p.photos.map((ph, i) => (
              <a key={i} href={media(ph.url, 'lg') ?? undefined} target="_blank" rel="noreferrer" className="relative block">
                <Cover url={ph.url} seed={`${s.id}${i}`} size="sm" className="aspect-square w-full rounded-lg" />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                  {ph.category}
                  {ph.exif?.lat != null && ph.exif.lng != null && ` · ${metres({ lat: ph.exif.lat, lng: ph.exif.lng }, p)} m`}
                </span>
              </a>
            ))}
          </div>

          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">Type & cuisines</p>
              <p>
                {v.typeSlug ? name(filters?.types, v.typeSlug) : '—'} · {v.cuisineSlugs.map((c) => name(filters?.cuisines, c)).join(', ') || 'no cuisines'}
              </p>
              <p className="text-xs text-muted">{v.attributeKeys.map((a) => name(filters?.attributes, a)).join(', ')}</p>
              <p className="mt-1">
                {v.costForTwo ? `${rupees(v.costForTwo)} for two` : 'Cost not given'}
                {v.knownFor?.length ? ` · known for ${v.knownFor.join(', ')}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Contact</p>
              <p>
                Phone: {v.phone ?? '—'} · WhatsApp: {v.whatsapp ?? '—'}
              </p>
              <p>
                Owner: {p.ownerName ?? '—'} {p.ownerPhone && `(+91 ${p.ownerPhone})`}
              </p>
              <p className="text-xs">
                Consent {p.ownerConsent ? '✓' : '✕'} · wants to manage {p.wantsToManage ? '✓ (invite SMS on approval)' : '✕'}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs text-muted">Hours</p>
              {v.hours.length === 0 ? <p>Not captured</p> : <p className="text-xs">{byDay.map((sh, d) => `${DAYS[d]}: ${sh.length ? sh.map((x) => (x.opensAt === x.closesAt ? '24h' : `${x.opensAt}–${x.closesAt}`)).join(', ') : 'closed'}`).join(' · ')}</p>}
            </div>
            {p.notes && <p className="rounded-lg bg-surface p-2 sm:col-span-2">Agent note: “{p.notes}”</p>}
          </div>

          {s.status === 'submitted' && (
            <details className="rounded-lg border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Fix details before approving</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Name">
                  <input className="input" value={v.name} onChange={(e) => setEdits({ ...edits, name: e.target.value })} />
                </Field>
                <Field label="Name in Hindi">
                  <input className="input" value={v.nameHi ?? ''} onChange={(e) => setEdits({ ...edits, nameHi: e.target.value || null })} />
                </Field>
                <Field label="Address" className="sm:col-span-2">
                  <input className="input" value={v.addressLine} onChange={(e) => setEdits({ ...edits, addressLine: e.target.value })} />
                </Field>
                <Field label="Type">
                  <select className="input" value={v.typeSlug ?? ''} onChange={(e) => setEdits({ ...edits, typeSlug: e.target.value || null })}>
                    <option value="">—</option>
                    {filters?.types.map((ty) => (
                      <option key={ty.slug} value={ty.slug}>
                        {ty.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Cost for two (₹)">
                  <input className="input" type="number" min={0} value={v.costForTwo || ''} onChange={(e) => setEdits({ ...edits, costForTwo: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                </Field>
                <Field label="Phone">
                  <input className="input" inputMode="numeric" maxLength={10} value={v.phone ?? ''} onChange={(e) => setEdits({ ...edits, phone: e.target.value.replace(/\D/g, '') || null })} />
                </Field>
              </div>
            </details>
          )}

          {s.status === 'submitted' ? (
            <div className="space-y-2 border-t border-border pt-3">
              <ErrorNote message={error} />
              <input className="input" placeholder="What should the agent fix? (required to send back)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary bg-good" disabled={busy} onClick={() => act('approve')}>
                  ✓ Approve & publish
                </button>
                <button className="btn-outline" disabled={busy} onClick={() => act('send-back')}>
                  ↩ Send back
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {s.reviewNote && `Note: ${s.reviewNote}. `}
              {s.restaurantId && (
                <Link href={`/partner/${s.restaurantId}`} className="text-brand">
                  Open listing →
                </Link>
              )}
            </p>
          )}
        </div>
        <Map
          className="h-72 rounded-none lg:h-full"
          center={[p.lat, p.lng]}
          pins={[
            { id: s.id, lat: p.lat, lng: p.lng, label: v.name },
            ...p.photos.flatMap((ph, i) => (ph.exif?.lat != null && ph.exif.lng != null ? [{ id: `exif-${i}`, lat: ph.exif.lat, lng: ph.exif.lng, label: `Photo ${i + 1} (${ph.category})`, tone: 'muted' as const }] : [])),
          ]}
        />
      </div>
    </li>
  );
}

export default function Captures() {
  const [status, setStatus] = useState<'submitted' | 'approved' | 'sent_back'>('submitted');
  const list = useApi<{ data: Submission[] }>('/v1/admin/field/submissions', { status });
  const filters = useApi<Filters>('/v1/filters');
  const [flash, setFlash] = useFlash();
  return (
    <div className="space-y-4">
      <PageTitle title="Field captures" sub="Approving publishes the place as an unclaimed listing (hidden in towns where unclaimed listings are switched off)." />
      <Tabs
        value={status}
        onChange={setStatus}
        tabs={[
          { key: 'submitted', label: 'To review' },
          { key: 'sent_back', label: 'Sent back' },
          { key: 'approved', label: 'Approved' },
        ]}
      />
      <ErrorNote message={list.error} onRetry={list.reload} />
      {list.loading && <Loading />}
      {list.data?.data.length === 0 && <Empty title="Queue is empty" icon="✅" />}
      <ul className="space-y-4">
        {list.data?.data
          .filter((s) => s.payload)
          .map((s) => (
            <Review
              key={s.id}
              s={s}
              filters={filters.data}
              onDone={(m) => {
                setFlash(m);
                list.reload();
              }}
            />
          ))}
      </ul>
      {flash}
    </div>
  );
}
