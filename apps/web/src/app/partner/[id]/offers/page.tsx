'use client';

import { useState } from 'react';
import { OfferModal, blankOffer, offerBody, type OfferDraft } from '@/components/partner/OfferModal';
import { NoAccess, usePartner } from '@/components/partner/context';
import { Empty, ErrorNote, Loading, StatusPill, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { DAY_KEYS, shiftLabel, shortDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Offer } from '@/lib/types';
import { useApi } from '@/lib/useApi';

export default function OffersPage() {
  const { restaurant: r, can } = usePartner();
  const { t } = useSession();
  const offers = useApi<{ data: Offer[] }>(can('offers') ? `/v1/partner/restaurants/${r.id}/offers` : null);
  const [draft, setDraft] = useState<OfferDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const base = `/v1/partner/restaurants/${r.id}/offers`;
  if (!can('offers')) return <NoAccess area={t('ptab.offers')} />;

  async function save(d: OfferDraft) {
    if (d.id) await api(`${base}/${d.id}`, { method: 'PATCH', body: offerBody(d) });
    else await api(base, { method: 'POST', body: offerBody(d) });
    setFlash(t('offer.saved'));
    offers.reload();
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      offers.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const ist = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');
  const toDraft = (o: Offer): OfferDraft => ({ ...o, startsOn: ist(o.startsOn), endsOn: ist(o.endsOn) });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t('offer.intro')}</p>
        <button className="btn-primary" onClick={() => setDraft(blankOffer)}>
          + {t('offer.new')}
        </button>
      </div>
      <ErrorNote message={error ?? offers.error} />
      {offers.loading && <Loading />}
      {offers.data?.data.length === 0 && (
        <div className="card">
          <Empty title={t('offer.emptyTitle')} icon="🏷️">
            {t('offer.emptyBody')}
          </Empty>
        </div>
      )}
      <ul className="space-y-3">
        {offers.data?.data.map((o) => {
          const expired = o.endsOn && new Date(o.endsOn) < new Date();
          return (
            <li key={o.id} className="card flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">🏷️ {o.title}</p>
                <p className="text-xs text-muted">
                  {o.validDays.length === 7 ? t('offer.everyDay') : o.validDays.map((d) => t(DAY_KEYS[d])).join(', ')}
                  {o.validFromTime && o.validToTime && ` · ${shiftLabel({ opensAt: o.validFromTime, closesAt: o.validToTime })}`}
                  {o.startsOn && ` · ${t('offer.from', { date: shortDate(o.startsOn) })}`}
                  {o.endsOn && ` · ${t('offer.until', { date: shortDate(o.endsOn) })}`}
                </p>
                {o.terms && <p className="text-xs text-muted">{o.terms}</p>}
              </div>
              <StatusPill status={expired ? 'ended' : o.status} />
              <div className="flex gap-1 text-sm">
                <button className="btn-ghost px-2" onClick={() => setDraft(toDraft(o))}>
                  {t('action.edit')}
                </button>
                {o.status !== 'ended' && (
                  <button className="btn-ghost px-2" onClick={() => run(() => api(`${base}/${o.id}`, { method: 'PATCH', body: { status: o.status === 'active' ? 'paused' : 'active' } }))}>
                    {o.status === 'active' ? t('offer.pause') : t('offer.resume')}
                  </button>
                )}
                {o.status !== 'ended' && (
                  <button className="btn-ghost px-2" onClick={() => confirm(t('offer.confirmEnd')) && run(() => api(`${base}/${o.id}`, { method: 'PATCH', body: { status: 'ended' } }))}>
                    {t('offer.end')}
                  </button>
                )}
                <button className="btn-ghost px-2 text-red-600" onClick={() => confirm(t('offer.confirmDelete')) && run(() => api(`${base}/${o.id}`, { method: 'DELETE' }))}>
                  {t('action.delete')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {draft && <OfferModal key={draft.id ?? 'new'} draft={draft} onClose={() => setDraft(null)} onSave={save} />}
      {flash}
    </div>
  );
}
