'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RequireAuth } from '@/components/auth';
import { UploadButton } from '@/components/forms';
import { ErrorNote, StatusPill, Toggle, useFlash } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, errorMessage, media } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Me, NotificationPrefs } from '@/lib/types';

function Account({ me }: { me: Me }) {
  const { refreshMe, signOut, lang, setLang, t } = useSession();
  const router = useRouter();
  const [name, setName] = useState(me.name ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const prefs: NotificationPrefs = { sms: true, email: true, push: true, digest: true, ...me.notificationPrefs };

  async function patch(body: Record<string, unknown>, msg = t('action.save')) {
    setError(null);
    try {
      await api('/v1/me', { method: 'PATCH', body });
      await refreshMe();
      setFlash(msg);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await patch({ name: name.trim(), email: email.trim() || null }, t('account.saved'));
    setBusy(false);
  }

  async function exportData() {
    try {
      const data = await api('/v1/me/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function deleteAccount() {
    if (!confirm(t('account.deleteConfirm'))) return;
    try {
      await api('/v1/me', { method: 'DELETE' });
      await signOut();
      alert(t('account.deleteScheduled'));
      router.push('/');
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const areas = [
    { href: '/saved', icon: '♡', title: t('account.lists'), sub: t('account.listsSub'), show: true },
    { href: '/notifications', icon: '🔔', title: t('notif.title'), sub: me.unreadNotifications ? t('account.unread', { n: me.unreadNotifications }) : t('notif.empty'), show: true },
    { href: '/partner', icon: '🏪', title: t('account.partner'), sub: me.memberships.length ? t('account.restaurants', { n: me.memberships.length }) : t('account.partnerSub'), show: true },
    { href: '/field', icon: '🧭', title: t('account.field'), sub: t('account.fieldSub'), show: ['field_agent', 'field_supervisor', 'admin'].includes(me.role) },
    { href: '/admin', icon: '🛠️', title: t('account.admin'), sub: t('account.adminSub'), show: ['field_supervisor', 'admin'].includes(me.role) },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-4">
        {me.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media(me.avatarUrl, 'sm')!} alt="" className="h-14 w-14 rounded-full object-cover" />
        ) : (
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand/10 text-xl font-semibold text-brand">{(me.name ?? me.phone).slice(0, 1).toUpperCase()}</span>
        )}
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{me.name ?? t('account.title')}</h1>
          <p className="text-sm text-muted">+91 {me.phone}</p>
        </div>
        <UploadButton label={t('account.photo')} onUploaded={(u) => patch({ avatarUrl: u.url }, t('account.saved'))} />
      </div>

      <ErrorNote message={error} />
      <form onSubmit={save} className="card space-y-3 p-4">
        <h2 className="font-semibold">{t('account.profile')}</h2>
        <label className="block">
          <span className="label">{t('account.name')}</span>
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t('account.email')}</span>
          <input className="input" type="email" value={email} maxLength={120} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t('account.language')}</span>
            {(['en', 'hi'] as const).map((l) => (
              <button type="button" key={l} className={`chip py-1 ${lang === l ? 'chip-on' : ''}`} onClick={() => setLang(l)}>
                {l === 'en' ? 'English' : 'हिन्दी'}
              </button>
            ))}
          </div>
          <button className="btn-primary" disabled={busy || !name.trim()}>
            {t('action.save')}
          </button>
        </div>
      </form>

      <div className="card space-y-1 p-4">
        <h2 className="mb-2 font-semibold">{t('account.notifications')}</h2>
        {(['sms', 'email', 'digest'] as const).map((k) => (
          <Toggle key={k} checked={prefs[k] !== false} onChange={(v) => patch({ notificationPrefs: { ...prefs, [k]: v } }, t('account.saved'))} label={t(`account.pref.${k}` as MessageKey)} />
        ))}
      </div>

      <div className="card divide-y divide-border">
        {areas
          .filter((a) => a.show)
          .map((a) => (
            <Link key={a.href} href={a.href} className="flex items-center gap-4 px-4 py-3 hover:bg-surface">
              <span className="text-2xl">{a.icon}</span>
              <span className="flex-1">
                <span className="block font-medium">{a.title}</span>
                <span className="block text-sm text-muted">{a.sub}</span>
              </span>
              <span className="text-muted">›</span>
            </Link>
          ))}
      </div>

      {me.memberships.length > 0 && (
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">{t('account.yourRestaurants')}</h2>
          <ul className="space-y-2 text-sm">
            {me.memberships.map((m) => (
              <li key={m.restaurant.id} className="flex items-center justify-between gap-2">
                <Link href={`/partner/${m.restaurant.id}`} className="font-medium hover:text-brand">
                  {m.restaurant.name}
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {t(`role.${m.role}` as MessageKey)} <StatusPill status={m.restaurant.status} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div id="privacy" className="card space-y-3 p-4">
        <h2 className="font-semibold">{t('account.privacy')}</h2>
        <p className="text-sm text-muted">{t('account.privacyBody')}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={exportData}>
            ⬇ {t('account.export')}
          </button>
          <button className="btn-outline text-red-600" onClick={deleteAccount}>
            {t('account.delete')}
          </button>
        </div>
      </div>

      <button
        className="btn-outline w-full"
        onClick={async () => {
          await signOut();
          router.push('/');
        }}
      >
        {t('auth.signOut')}
      </button>
      {flash}
    </div>
  );
}

export default function AccountPage() {
  return <RequireAuth>{(me) => <Account me={me} />}</RequireAuth>;
}
