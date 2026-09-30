'use client';

import { useState } from 'react';
import { NoAccess, usePartner } from '@/components/partner/context';
import { ProfileForm, toProfileInput } from '@/components/partner/ProfileForm';
import { ErrorNote, Field, Notice, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

function TemporarilyClosed() {
  const { restaurant: r, reload } = usePartner();
  const { t } = useSession();
  const current = r.temporarilyClosedUntil && new Date(r.temporarilyClosedUntil) > new Date() ? r.temporarilyClosedUntil.slice(0, 10) : '';
  const [until, setUntil] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function save(value: string | null) {
    setBusy(true);
    setError(null);
    try {
      // End of the chosen day in India.
      await api(`/v1/partner/restaurants/${r.id}/temporarily-closed`, { method: 'PUT', body: { until: value ? new Date(`${value}T23:59:00+05:30`).toISOString() : null } });
      if (!value) setUntil('');
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">{t('tempClosed.title')}</h2>
      <p className="text-sm text-muted">{t('tempClosed.body')}</p>
      <ErrorNote message={error} />
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" className="btn-outline" disabled={busy} onClick={() => save(today)}>
          {t('tempClosed.today')}
        </button>
        <Field label={t('tempClosed.until')}>
          <input type="date" className="input" min={today} value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <button type="button" className="btn-primary" disabled={busy || !until || until === current} onClick={() => save(until)}>
          {t('action.save')}
        </button>
        {current && (
          <button type="button" className="btn-outline" disabled={busy} onClick={() => save(null)}>
            {t('tempClosed.reopen')}
          </button>
        )}
      </div>
    </section>
  );
}

export default function ProfilePage() {
  const { restaurant: r, reload, can } = usePartner();
  const { t } = useSession();
  const [flash, setFlash] = useFlash();
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  if (!can('profile')) return <NoAccess area={t('ptab.profile')} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {pending && <Notice>{t('profile.pendingCore', { fields: Object.keys(pending).join(', ') })}</Notice>}
      <ProfileForm
        key={r.id}
        initial={toProfileInput(r)}
        lockedCore={r.status === 'live'}
        submitLabel={t('profile.save')}
        onSubmit={async (p) => {
          const res = await api<{ pendingCoreChange: Record<string, unknown> | null }>(`/v1/partner/restaurants/${r.id}`, { method: 'PATCH', body: p });
          setPending(res.pendingCoreChange);
          setFlash(t('profile.saved'));
          reload();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
      <TemporarilyClosed />
      {flash}
    </div>
  );
}
