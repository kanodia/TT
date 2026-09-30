'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Map } from '@/components/Map';
import { ErrorNote, Field, Modal, Notice, Spinner, Stat, useFlash } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { cached, listQueue, listVisits, putVisit, removeQueued, syncQueue, type QueuedCapture, type QueuedVisit, type VisitOutcome } from '@/lib/fieldQueue';
import { ago, dayDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useOnline } from '@/lib/useOnline';

type Lead = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  source: string;
  city: { name: string };
  area: { name: string } | null;
  lastVisit: { outcome: string; revisitOn: string | null; note: string | null; createdAt: string } | null;
};
type Stats = { today: number; week: number; approved: number; sentBack: number; pending: number; openLeads: number; visitsToday: number; approvalRate: number | null; revisitsDue: { id: string; leadId: string; name: string; revisitOn: string; note: string | null }[]; minGpsAccuracyM: number };
type Areas = {
  data: { id: string; name: string; city: { name: string; lat: number; lng: number }; boundary: { type: 'Polygon'; coordinates: [number, number][][] } | null }[];
  leads: { id: string; name: string; lat: number | null; lng: number | null }[];
  places: { id: string; name: string; lat: number; lng: number; status: string }[];
};

const OUTCOMES: VisitOutcome[] = ['revisit', 'closed', 'refused', 'duplicate', 'not_found'];

/** Visit log (spec 7.3): outcome, optional revisit date and note. Queued offline like captures. */
function VisitModal({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useSession();
  const [outcome, setOutcome] = useState<VisitOutcome | ''>('');
  const [revisitOn, setRevisitOn] = useState('');
  const [note, setNote] = useState('');
  const [tomorrow] = useState(() => new Date(Date.now() + 864e5).toISOString().slice(0, 10));
  return (
    <Modal open={!!lead} onClose={onClose} title={t('fvisit.title', { name: lead?.name ?? '' })}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!lead || !outcome) return;
          const v: QueuedVisit = {
            clientUuid: crypto.randomUUID(),
            leadId: lead.id,
            outcome,
            revisitOn: outcome === 'revisit' ? revisitOn || tomorrow : null,
            note: note.trim() || null,
            createdAt: new Date().toISOString(),
          };
          await putVisit(v);
          setOutcome('');
          setNote('');
          setRevisitOn('');
          onSaved();
          onClose();
        }}
      >
        <div className="space-y-1">
          {OUTCOMES.map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface">
              <input type="radio" checked={outcome === o} onChange={() => setOutcome(o)} className="accent-[var(--brand)]" />
              <span className="text-sm">{t(`fvisit.outcome.${o}` as MessageKey)}</span>
            </label>
          ))}
        </div>
        {outcome === 'revisit' && (
          <Field label={t('fvisit.revisitOn')}>
            <input type="date" className="input" min={new Date().toISOString().slice(0, 10)} value={revisitOn || tomorrow} onChange={(e) => setRevisitOn(e.target.value)} />
          </Field>
        )}
        <Field label={t('fvisit.note')}>
          <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('fvisit.notePlaceholder')} />
        </Field>
        <button className="btn-primary w-full" disabled={!outcome}>
          {t('fvisit.save')}
        </button>
      </form>
    </Modal>
  );
}

export default function FieldHome() {
  const { t, lang } = useSession();
  const online = useOnline();
  const [queue, setQueue] = useState<QueuedCapture[]>([]);
  const [visits, setVisits] = useState<QueuedVisit[]>([]);
  const [leads, setLeads] = useState<{ data: Lead[]; offline: boolean } | null>(null);
  const [areas, setAreas] = useState<Areas | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visitFor, setVisitFor] = useState<Lead | null>(null);
  const [flash, setFlash] = useFlash();

  const refresh = useCallback(async () => {
    setQueue(await listQueue());
    setVisits(await listVisits());
    cached('leads', () => api<{ data: Lead[] }>('/v1/field/leads').then((r) => r.data))
      .then(setLeads)
      .catch((e) => setError(errorMessage(e)));
    cached('areas', () => api<Areas>('/v1/field/me/areas'))
      .then((r) => setAreas(r.data))
      .catch(() => {});
    api<Stats>('/v1/field/me/stats')
      .then(setStats)
      .catch(() => {});
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const r = await syncQueue();
      if (r.sent) setFlash(t('fhome.uploaded', { n: r.sent }));
      if (r.failed) setError(t('fhome.needFix', { n: r.failed }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [refresh, setFlash, t]);

  // Load on mount, and upload automatically whenever the phone gets signal.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load
    refresh();
  }, [refresh]);
  useEffect(() => {
    // Syncing with the server is the external system this effect exists for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (online) sync();
  }, [online, sync]);

  const waiting = queue.filter((q) => !q.error);
  const broken = queue.filter((q) => q.error);
  const pendingVisits = visits.filter((v) => !v.error);
  const area = areas?.data[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('fhome.title')}</h1>
          <p className={`text-sm font-medium ${online ? 'text-good' : 'text-warn'}`}>{online ? `● ${t('fhome.online')}` : `● ${t('fhome.offline')}`}</p>
        </div>
        <Link href="/field/capture" className="btn-primary px-5 py-3 text-base">
          + {t('fhome.capture')}
        </Link>
      </div>

      <ErrorNote message={error} />

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('fhome.capturedToday')} value={stats.today} sub={t('fhome.thisWeek', { n: stats.week })} />
          <Stat label={t('fhome.visitsToday')} value={stats.visitsToday} />
          <Stat label={t('fhome.waiting')} value={stats.pending} />
          <Stat label={t('fhome.approvalRate')} value={stats.approvalRate == null ? '–' : `${stats.approvalRate}%`} sub={stats.sentBack ? <Link href="/field/submissions" className="text-brand">{t('fhome.sentBack', { n: stats.sentBack })}</Link> : t('fhome.approved', { n: stats.approved })} />
        </div>
      )}

      {stats && stats.revisitsDue.length > 0 && (
        <Notice tone="warn">
          <b>{t('fhome.revisitsDue')}</b>
          <ul className="mt-1 list-disc pl-5">
            {stats.revisitsDue.map((r) => (
              <li key={r.id}>
                {r.name} · {dayDate(r.revisitOn.slice(0, 10), lang)}
                {r.note && ` — ${r.note}`}
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <section className="card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t('fhome.onPhone', { n: queue.length + pendingVisits.length })}</h2>
          <button className="btn-outline py-1.5" onClick={sync} disabled={!online || syncing || (!waiting.length && !pendingVisits.length)}>
            {syncing ? <Spinner className="h-4 w-4" /> : '⟳'} {t('fhome.uploadNow')}
          </button>
        </div>
        {queue.length === 0 && pendingVisits.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">{t('fhome.allUploaded')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {[...broken, ...waiting].map((q) => (
              <li key={q.clientUuid} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">{q.error ? '⚠️' : '⏳'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{q.payload.name}</p>
                  <p className="text-xs text-muted">
                    {q.payload.addressLine} · {ago(q.capturedAt, t)} · {t('fhome.photos', { n: q.payload.photos.length })}
                  </p>
                  {q.error && <p className="text-xs text-red-700">{q.error}</p>}
                </div>
                <Link href={`/field/capture?draft=${q.clientUuid}`} className="text-sm text-brand">
                  {q.error ? t('fhome.fix') : t('action.edit')}
                </Link>
                <button
                  className="text-sm text-muted hover:text-red-600"
                  onClick={async () => {
                    if (!confirm(t('fhome.confirmDelete', { name: q.payload.name }))) return;
                    await removeQueued(q.clientUuid);
                    refresh();
                  }}
                  aria-label={t('action.delete')}
                >
                  ✕
                </button>
              </li>
            ))}
            {pendingVisits.map((v) => (
              <li key={v.clientUuid} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span>📝</span>
                <span className="flex-1">
                  {leads?.data.find((l) => l.id === v.leadId)?.name ?? t('fhome.visit')} · {t(`fvisit.outcome.${v.outcome}` as MessageKey)}
                </span>
                <span className="text-xs text-muted">{ago(v.createdAt, t)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {areas && (areas.data.length > 0 || areas.leads.length > 0) && (
        <section className="card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-semibold">
              {t('fhome.myArea')}
              {area && <span className="ml-2 text-sm font-normal text-muted">{area.name}</span>}
            </h2>
            <button className="text-sm text-brand" onClick={() => setShowMap(!showMap)}>
              {showMap ? t('fhome.hideMap') : t('fhome.showMap')}
            </button>
          </div>
          {showMap && (
            <div className="p-3">
              <Map
                className="h-80"
                center={[area?.city.lat ?? 27.735, area?.city.lng ?? 75.78]}
                areas={areas.data.flatMap((a) => (a.boundary ? [{ id: a.id, ring: a.boundary.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]) }] : []))}
                pins={[
                  ...areas.places.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, label: p.name, tone: 'muted' as const, sub: t('fhome.alreadyListed') })),
                  ...areas.leads.filter((l) => l.lat != null && l.lng != null).map((l) => ({ id: `lead-${l.id}`, lat: l.lat!, lng: l.lng!, label: l.name, tone: 'lead' as const, sub: t('fhome.toVisit') })),
                ]}
              />
              <p className="mt-2 text-xs text-muted">
                <span className="text-amber-600">●</span> {t('fhome.toVisit')} · <span className="text-gray-500">●</span> {t('fhome.alreadyListed')}
              </p>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{t('fhome.leads', { n: leads?.data.length ?? '…' })}</h2>
          {leads?.offline && <span className="text-xs text-warn">{t('fhome.savedCopy')}</span>}
        </div>
        {leads?.data.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted">{t('fhome.noLeads')}</p>}
        <ul className="divide-y divide-border">
          {leads?.data.map((l) => (
            <li key={l.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-muted">
                    {[l.address, l.area?.name, l.city.name].filter(Boolean).join(', ')} · {t('fhome.from', { source: l.source.replace(/_/g, ' ') })}
                  </p>
                  {l.phone && (
                    <a href={`tel:+91${l.phone}`} className="text-xs text-brand">
                      📞 {l.phone}
                    </a>
                  )}
                  {l.lastVisit && (
                    <p className="text-xs text-muted">
                      {t('fhome.lastVisit', { outcome: t(`fvisit.outcome.${l.lastVisit.outcome}` as MessageKey), when: ago(l.lastVisit.createdAt, t) })}
                      {l.lastVisit.note && ` — ${l.lastVisit.note}`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Link href={`/field/capture?lead=${l.id}`} className="btn-primary px-3 py-1.5">
                    {t('fhome.captureLead')}
                  </Link>
                  {l.lat != null && l.lng != null && (
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`} target="_blank" rel="noreferrer" className="text-xs text-brand">
                      {t('fhome.navigate')}
                    </a>
                  )}
                </div>
              </div>
              <button className="text-xs text-muted underline" onClick={() => setVisitFor(l)}>
                {t('fhome.logVisit')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {stats && <Notice>{t('fhome.gpsTip', { m: stats.minGpsAccuracyM })}</Notice>}
      <VisitModal
        lead={visitFor}
        onClose={() => setVisitFor(null)}
        onSaved={() => {
          setFlash(t('fvisit.saved'));
          if (online) void sync();
          else void refresh();
        }}
      />
      {flash}
    </div>
  );
}
