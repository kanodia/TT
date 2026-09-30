'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { UploadButton } from '@/components/forms';
import { DailyChart } from '@/components/partner/DailyChart';
import { usePartner } from '@/components/partner/context';
import { ErrorNote, Field, Loading, Notice, Stat, StatusPill, Tabs } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { ago, dayDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Photo } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Metric = 'views' | 'searchImpressions' | 'calls' | 'directions' | 'saves';
type Analytics = {
  days: number;
  totals: Record<Metric | 'shares', number>;
  series: ({ date: string } & Record<Metric | 'shares', number>)[];
  ratingTrend: { week: string; average: number; reviews: number }[];
  rating: number;
  reviewCount: number;
  newReviews: number;
  isVisibleToDiners: boolean;
};

function Checklist() {
  const { restaurant: r, can } = usePartner();
  const { t } = useSession();
  const photos = useApi<{ data: Photo[] }>(can('photos') ? `/v1/partner/restaurants/${r.id}/photos` : null);
  const base = `/partner/${r.id}`;
  const list = photos.data?.data ?? [];
  const items = [
    { done: r.cuisineSlugs.length > 0 && !!r.typeSlug, label: t('check.cuisines'), href: `${base}/profile` },
    { done: r.hours.length > 0, label: t('check.hours'), href: `${base}/hours` },
    { done: list.some((p) => p.category === 'exterior'), label: t('check.storefront'), href: `${base}/photos` },
    { done: !!r.menuUpdatedAt, label: t('check.menu'), href: `${base}/menu` },
    { done: list.some((p) => p.category === 'food'), label: t('check.food'), href: `${base}/photos` },
    { done: !!r.fssaiNumber, label: t('check.fssai'), href: `${base}/profile` },
  ];
  const doneCount = items.filter((i) => i.done).length;
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{t('check.title')}</h2>
        <span className="text-sm text-muted">{t('check.progress', { done: doneCount, total: items.length })}</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-good transition-all" style={{ width: `${(doneCount / items.length) * 100}%` }} />
      </div>
      <ul className="space-y-2">
        {items.map((i) => (
          <li key={i.label}>
            <Link href={i.href} className="flex items-center gap-3 text-sm hover:text-brand">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${i.done ? 'bg-good text-white' : 'border border-border'}`}>{i.done && '✓'}</span>
              <span className={i.done ? 'text-muted line-through' : ''}>{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SubmitForVerification() {
  const { restaurant: r, reload } = usePartner();
  const { t } = useSession();
  const [docs, setDocs] = useState<{ url: string; name: string }[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/partner/restaurants/${r.id}/submit`, { method: 'POST', body: { documents: docs.map((d) => d.url), ...(note.trim() ? { note: note.trim() } : {}) } });
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const lastRejected = r.verification.find((v) => v.type === 'new' && v.status === 'rejected');
  return (
    <div className="card space-y-3 p-5">
      <h2 className="font-semibold">{t('submit.title')}</h2>
      {r.status === 'rejected' && lastRejected?.decisionNote && <Notice tone="warn">{t('submit.rejected', { reason: lastRejected.decisionNote })}</Notice>}
      <p className="text-sm text-muted">{t('submit.body')}</p>
      <ErrorNote message={error} />
      <div className="space-y-2">
        {docs.map((d, i) => (
          <div key={d.url} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
            <span className="truncate">📄 {d.name}</span>
            <button className="text-muted hover:text-red-600" onClick={() => setDocs(docs.filter((_, j) => j !== i))}>
              {t('action.remove')}
            </button>
          </div>
        ))}
        {docs.length < 5 && <UploadButton kind="document" label={t('submit.upload')} onUploaded={(u, file) => setDocs([...docs, { url: u.url, name: file.name }])} />}
      </div>
      <Field label={t('submit.note')}>
        <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button className="btn-primary" disabled={busy || !docs.length} onClick={submit}>
        {busy ? t('submit.submitting') : t('submit.title')}
      </button>
    </div>
  );
}

function AnalyticsPanel() {
  const { restaurant: r } = usePartner();
  const { t, lang } = useSession();
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<Metric>('views');
  const a = useApi<Analytics>(`/v1/partner/restaurants/${r.id}/analytics`, { days });
  const data = a.data ?? a.stale;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('stats.title')}</h2>
        <div className="flex gap-1">
          {[7, 30, 90].map((d) => (
            <button key={d} className={`chip py-1 ${days === d ? 'chip-on' : ''}`} onClick={() => setDays(d)}>
              {t('stats.days', { n: d })}
            </button>
          ))}
        </div>
      </div>
      <ErrorNote message={a.error} onRetry={a.reload} />
      {!data ? (
        <Loading />
      ) : (
        <>
          {!data.isVisibleToDiners && <Notice tone="warn">{t('stats.notVisible')}</Notice>}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label={t('stats.searchImpressions')} value={data.totals.searchImpressions} />
            <Stat label={t('stats.views')} value={data.totals.views} />
            <Stat label={t('stats.calls')} value={data.totals.calls} />
            <Stat label={t('stats.directions')} value={data.totals.directions} />
            <Stat label={t('stats.saves')} value={data.totals.saves} />
            <Stat label={t('stats.rating')} value={data.rating > 0 ? data.rating.toFixed(1) : '–'} sub={t('stats.ratingSub', { n: data.reviewCount, new: data.newReviews })} />
          </div>
          <div className="card p-4">
            <Tabs
              value={metric}
              onChange={setMetric}
              tabs={(['searchImpressions', 'views', 'calls', 'directions', 'saves'] as const).map((k) => ({ key: k, label: t(`stats.${k}` as MessageKey) }))}
            />
            <div className="pt-4">
              <DailyChart label={t(`stats.${metric}` as MessageKey)} points={data.series.map((s) => ({ date: s.date, value: s[metric] }))} />
            </div>
          </div>
          {data.ratingTrend.length > 0 && (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-semibold">{t('stats.ratingTrend')}</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1">{t('stats.weekOf')}</th>
                    <th className="py-1">{t('stats.rating')}</th>
                    <th className="py-1 text-right">{t('stats.reviews')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.ratingTrend.map((w) => (
                    <tr key={w.week}>
                      <td className="py-1.5">{dayDate(w.week, lang)}</td>
                      <td className="py-1.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 rounded-full bg-good" style={{ width: `${(w.average / 5) * 80}px` }} />
                          {w.average.toFixed(1)}★
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{w.reviews}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Dashboard() {
  const { restaurant: r, can } = usePartner();
  const { t } = useSession();
  const created = useSearchParams().get('created');
  const pendingCore = r.verification.filter((v) => v.type === 'core_change' && v.status === 'pending');
  const preLive = ['draft', 'rejected', 'pending'].includes(r.status);
  const [now] = useState(() => Date.now());
  const hoursStale = !!r.hoursConfirmedAt && new Date(r.hoursConfirmedAt).getTime() < now - 60 * 864e5;
  const menuStale = !!r.menuUpdatedAt && new Date(r.menuUpdatedAt).getTime() < now - 120 * 864e5;

  return (
    <div className="space-y-6">
      {created && <Notice tone="good">🎉 {t('dash.created')}</Notice>}
      {r.status === 'pending' && <Notice>⏳ {t('dash.pending')}</Notice>}
      {r.temporarilyClosedUntil && new Date(r.temporarilyClosedUntil) > new Date() && <Notice tone="warn">{t('dash.tempClosed', { date: new Date(r.temporarilyClosedUntil).toLocaleDateString('en-IN') })}</Notice>}
      {pendingCore.map((v) => (
        <Notice key={v.id}>
          {t('dash.coreChange', { when: ago(v.createdAt, t) })}{' '}
          {Object.entries(v.payload ?? {})
            .map(([k, val]) => `${k} → ${String(val)}`)
            .join(', ')}
        </Notice>
      ))}

      {preLive && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Checklist />
          {can('core') && ['draft', 'rejected'].includes(r.status) && <SubmitForVerification />}
        </div>
      )}

      {r.status === 'live' && can('profile') && hoursStale && (
        <Notice tone="warn">
          {t('dash.hoursStale', { when: ago(r.hoursConfirmedAt!, t) })}{' '}
          <Link href={`/partner/${r.id}/hours`} className="font-medium underline">
            {t('dash.checkHours')}
          </Link>
        </Notice>
      )}
      {r.status === 'live' && can('menu') && menuStale && (
        <Notice tone="warn">
          {t('dash.menuStale')}{' '}
          <Link href={`/partner/${r.id}/menu`} className="font-medium underline">
            {t('dash.updateMenu')}
          </Link>
        </Notice>
      )}

      {can('analytics') && <AnalyticsPanel />}

      {r.verification.length > 0 && (
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">{t('dash.history')}</h2>
          <ul className="divide-y divide-border text-sm">
            {r.verification.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {t(`verif.${v.type}` as MessageKey)} · {ago(v.createdAt, t)}
                  {v.decisionNote && <span className="block text-xs text-muted">{t('dash.note', { note: v.decisionNote })}</span>}
                </span>
                <StatusPill status={v.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function PartnerDashboard() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
