'use client';

import { useState } from 'react';
import { ErrorNote, Field, Modal } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import { DAY_KEYS } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Offer } from '@/lib/types';

export type OfferDraft = Omit<Offer, 'id' | 'startsOn' | 'endsOn'> & { id?: string; startsOn: string; endsOn: string };

export const blankOffer: OfferDraft = { title: '', terms: null, discountType: 'percent', value: null, validDays: [0, 1, 2, 3, 4, 5, 6], validFromTime: null, validToTime: null, startsOn: '', endsOn: '', status: 'active' };

/** Offer body in the API's shape: whole-day dates in India time. */
export function offerBody(d: OfferDraft) {
  const { startsOn, endsOn, ...withId } = d;
  const rest = { ...withId, id: undefined };
  return {
    ...rest,
    title: rest.title.trim(),
    startsOn: startsOn ? new Date(`${startsOn}T00:00:00+05:30`).toISOString() : null,
    endsOn: endsOn ? new Date(`${endsOn}T23:59:59+05:30`).toISOString() : null,
  };
}

export function OfferModal({ draft, onClose, onSave }: { draft: OfferDraft; onClose: () => void; onSave: (d: OfferDraft) => Promise<void> }) {
  const { t } = useSession();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<OfferDraft>) => setD({ ...d, ...p });
  const timed = !!(d.validFromTime || d.validToTime);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) return setError(t('offer.errDates'));
    if (timed && (!d.validFromTime || !d.validToTime || d.validFromTime >= d.validToTime)) return setError(t('offer.errTimes'));
    setBusy(true);
    setError(null);
    try {
      await onSave(d);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={d.id ? t('offer.edit') : t('offer.new')}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <Field label={`${t('offer.headline')} *`} hint={t('offer.headlineHint')}>
          <input className="input" value={d.title} maxLength={80} minLength={3} onChange={(e) => set({ title: e.target.value })} required autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('offer.type')}>
            <select className="input" value={d.discountType} onChange={(e) => set({ discountType: e.target.value as OfferDraft['discountType'] })}>
              <option value="percent">{t('offer.percent')}</option>
              <option value="flat">{t('offer.flat')}</option>
              <option value="bogo">{t('offer.bogo')}</option>
              <option value="other">{t('offer.other')}</option>
            </select>
          </Field>
          {(d.discountType === 'percent' || d.discountType === 'flat') && (
            <Field label={d.discountType === 'percent' ? t('offer.percentValue') : t('offer.amount')}>
              <input className="input" type="number" min={0} max={d.discountType === 'percent' ? 100 : 100000} value={d.value ?? ''} onChange={(e) => set({ value: e.target.value ? Math.round(Number(e.target.value)) : null })} />
            </Field>
          )}
        </div>
        <Field label={t('offer.terms')}>
          <textarea className="input" maxLength={300} value={d.terms ?? ''} onChange={(e) => set({ terms: e.target.value || null })} placeholder={t('offer.termsPlaceholder')} />
        </Field>
        <div>
          <span className="label">{t('offer.days')}</span>
          <div className="flex flex-wrap gap-1.5">
            {DAY_KEYS.map((k, i) => (
              <button type="button" key={k} className={`chip px-2.5 ${d.validDays.includes(i) ? 'chip-on' : ''}`} onClick={() => set({ validDays: d.validDays.includes(i) ? d.validDays.filter((x) => x !== i) : [...d.validDays, i].sort() })}>
                {t(k)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={timed} onChange={(e) => set(e.target.checked ? { validFromTime: '15:00', validToTime: '18:00' } : { validFromTime: null, validToTime: null })} className="accent-[var(--brand)]" />
            {t('offer.onlyHours')}
          </label>
          {timed && (
            <div className="mt-2 flex items-center gap-2">
              <input type="time" className="input w-28" value={d.validFromTime ?? ''} onChange={(e) => set({ validFromTime: e.target.value })} />
              <span className="text-muted">–</span>
              <input type="time" className="input w-28" value={d.validToTime ?? ''} onChange={(e) => set({ validToTime: e.target.value })} />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('offer.starts')}>
            <input type="date" className="input" value={d.startsOn} onChange={(e) => set({ startsOn: e.target.value })} />
          </Field>
          <Field label={t('offer.ends')}>
            <input type="date" className="input" value={d.endsOn} onChange={(e) => set({ endsOn: e.target.value })} />
          </Field>
        </div>
        <button className="btn-primary w-full" disabled={busy || d.title.trim().length < 3 || !d.validDays.length}>
          {busy ? t('action.saving') : t('offer.save')}
        </button>
      </form>
    </Modal>
  );
}
