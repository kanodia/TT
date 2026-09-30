'use client';

import { usePartner } from '@/components/partner/context';
import { StatusPill, Toggle, useFlash } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { NotificationPrefs } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Docs = { data: { id: string; type: string; status: string; createdAt: string; documents: string[] }[] };

/** Partner settings (spec 5.2): notification preferences, documents on file, billing placeholder. */
export default function PartnerSettings() {
  const { restaurant: r, can } = usePartner();
  const { me, t, refreshMe } = useSession();
  const docs = useApi<Docs>(can('core') ? `/v1/partner/restaurants/${r.id}/documents` : null);
  const [flash, setFlash] = useFlash();
  const prefs: NotificationPrefs = { sms: true, email: true, digest: true, ...me?.notificationPrefs };

  async function setPref(k: keyof NotificationPrefs, v: boolean) {
    await api('/v1/me', { method: 'PATCH', body: { notificationPrefs: { ...prefs, [k]: v } } }).catch(() => {});
    await refreshMe();
    setFlash(t('account.saved'));
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card space-y-1 p-5">
        <h2 className="mb-1 font-semibold">{t('psettings.notifications')}</h2>
        <p className="mb-2 text-sm text-muted">{t('psettings.notificationsBody')}</p>
        {(['sms', 'email', 'digest'] as const).map((k) => (
          <Toggle key={k} checked={prefs[k] !== false} onChange={(v) => setPref(k, v)} label={t(`psettings.pref.${k}` as MessageKey)} />
        ))}
      </div>
      {can('core') && (
        <div className="card p-5">
          <h2 className="mb-2 font-semibold">{t('psettings.documents')}</h2>
          {docs.data?.data.length === 0 && <p className="text-sm text-muted">{t('psettings.noDocuments')}</p>}
          <ul className="divide-y divide-border text-sm">
            {docs.data?.data.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  {t(`verif.${d.type}` as MessageKey)} · {ago(d.createdAt, t)}
                  <span className="block text-xs text-muted">📄 {d.documents.length} {t('psettings.files')}</span>
                </span>
                <StatusPill status={d.status} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">{t('psettings.documentsPrivate')}</p>
        </div>
      )}
      <div className="card p-5">
        <h2 className="mb-1 font-semibold">{t('psettings.billing')}</h2>
        <p className="text-sm text-muted">{t('psettings.billingBody')}</p>
      </div>
      {flash}
    </div>
  );
}
