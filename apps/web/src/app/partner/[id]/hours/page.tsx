'use client';

import { useState } from 'react';
import { HoursEditor, SpecialHoursEditor } from '@/components/forms';
import { NoAccess, usePartner } from '@/components/partner/context';
import { ErrorNote, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { ago } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Shift, SpecialDay } from '@/lib/types';

const plain = (hours: Shift[]) => hours.map(({ dayOfWeek, opensAt, closesAt }) => ({ dayOfWeek, opensAt, closesAt }));
const plainSpecial = (days: SpecialDay[]) => days.map(({ date, isClosed, opensAt, closesAt, note }) => ({ date, isClosed, opensAt, closesAt, note }));

export default function HoursPage() {
  const { restaurant: r, reload, can } = usePartner();
  const { t } = useSession();
  const [hours, setHours] = useState<Shift[]>(() => plain(r.hours));
  const [special, setSpecial] = useState<SpecialDay[]>(() => plainSpecial(r.specialHours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  if (!can('profile')) return <NoAccess area={t('ptab.hours')} />;

  const dirty = JSON.stringify(hours) !== JSON.stringify(plain(r.hours));
  const specialDirty = JSON.stringify(special) !== JSON.stringify(plainSpecial(r.specialHours));

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setFlash(msg);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ErrorNote message={error} />
      <div className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">{t('detail.hours')}</h2>
          <p className="text-sm text-muted">{t('hoursPage.help')}</p>
        </div>
        <HoursEditor value={hours} onChange={setHours} />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary" disabled={busy || !dirty} onClick={() => run(() => api(`/v1/partner/restaurants/${r.id}/hours`, { method: 'PUT', body: { shifts: hours } }), t('hoursPage.saved'))}>
            {t('hoursPage.save')}
          </button>
          {!dirty && r.hours.length > 0 && (
            <button className="btn-outline" disabled={busy} onClick={() => run(() => api(`/v1/partner/restaurants/${r.id}/hours/confirm`, { method: 'POST' }), t('hoursPage.confirmed'))}>
              ✓ {t('hoursPage.stillCorrect')}
            </button>
          )}
          {r.hoursConfirmedAt && <span className="text-xs text-muted">{t('detail.hoursConfirmed', { when: ago(r.hoursConfirmedAt, t) })}</span>}
        </div>
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">{t('detail.specialHours')}</h2>
          <p className="text-sm text-muted">{t('hoursPage.specialHelp')}</p>
        </div>
        <SpecialHoursEditor value={special} onChange={setSpecial} />
        <button
          className="btn-primary"
          disabled={busy || !specialDirty}
          onClick={() => run(() => api(`/v1/partner/restaurants/${r.id}/special-hours`, { method: 'PUT', body: { days: special } }), t('hoursPage.saved'))}
        >
          {t('hoursPage.saveSpecial')}
        </button>
      </div>
      {flash}
    </div>
  );
}
