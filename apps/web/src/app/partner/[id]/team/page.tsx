'use client';

import { useState } from 'react';
import { NoAccess, usePartner } from '@/components/partner/context';
import { ErrorNote, Field, Loading, useFlash } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Member = { role: string; status: string; user: { id: string; name: string | null; phone: string; email: string | null } };

export default function TeamPage() {
  const { restaurant: r, can } = usePartner();
  const { me, t } = useSession();
  const members = useApi<{ data: Member[] }>(can('team') ? `/v1/partner/restaurants/${r.id}/members` : null);
  const [by, setBy] = useState<'phone' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<'manager' | 'staff'>('staff');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const base = `/v1/partner/restaurants/${r.id}/members`;
  if (!can('team')) return <NoAccess area={t('ptab.team')} />;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(base, { method: 'POST', body: { role, ...(by === 'phone' ? { phone } : { email: email.trim() }), ...(name.trim() ? { name: name.trim() } : {}) } });
      setPhone('');
      setEmail('');
      setName('');
      setFlash(t('team.added'));
      members.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    try {
      await fn();
      setFlash(msg);
      members.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const valid = by === 'phone' ? /^[6-9]\d{9}$/.test(phone) : /^\S+@\S+\.\S+$/.test(email.trim());
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ErrorNote message={error ?? members.error} />
      <div className="card">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t('ptab.team')}</h2>
        {members.loading ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-border">
            {members.data?.data.map((m) => (
              <li key={m.user.id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand">{(m.user.name ?? m.user.phone).slice(0, 1)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {m.user.name ?? t('team.noName')} {m.user.id === me?.id && <span className="text-muted">({t('team.you')})</span>}
                  </p>
                  <p className="text-xs text-muted">
                    +91 {m.user.phone}
                    {m.user.email && ` · ${m.user.email}`}
                  </p>
                </div>
                {m.role === 'owner' || m.user.id === me?.id ? (
                  <span className="text-xs text-muted">{t(`role.${m.role}` as MessageKey)}</span>
                ) : (
                  <>
                    <select className="input w-auto py-1 text-xs" value={m.role} onChange={(e) => run(() => api(`${base}/${m.user.id}`, { method: 'PATCH', body: { role: e.target.value } }), t('team.roleChanged'))} aria-label={t('team.role')}>
                      <option value="manager">{t('role.manager')}</option>
                      <option value="staff">{t('role.staff')}</option>
                    </select>
                    <button className="text-sm text-muted hover:text-red-600" onClick={() => confirm(t('team.confirmRemove', { name: m.user.name ?? m.user.phone })) && run(() => api(`${base}/${m.user.id}`, { method: 'DELETE' }), t('team.removed'))}>
                      {t('action.remove')}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <form onSubmit={add} className="card space-y-3 p-4">
        <h2 className="font-semibold">{t('team.add')}</h2>
        <div className="flex gap-2">
          {(['phone', 'email'] as const).map((k) => (
            <button type="button" key={k} className={`chip ${by === k ? 'chip-on' : ''}`} onClick={() => setBy(k)}>
              {k === 'phone' ? `📱 ${t('team.byPhone')}` : `✉️ ${t('team.byEmail')}`}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {by === 'phone' ? (
            <Field label={`${t('auth.mobile')} *`}>
              <input className="input" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required />
            </Field>
          ) : (
            <Field label={`${t('account.email')} *`} hint={t('team.emailHint')}>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
          )}
          <Field label={t('team.name')}>
            <input className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="space-y-1">
          {(['manager', 'staff'] as const).map((k) => (
            <label key={k} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-1.5 hover:bg-surface">
              <input type="radio" checked={role === k} onChange={() => setRole(k)} className="mt-1 accent-[var(--brand)]" />
              <span>
                <span className="block text-sm font-medium">{t(`role.${k}`)}</span>
                <span className="block text-xs text-muted">{t(`team.can.${k}`)}</span>
              </span>
            </label>
          ))}
        </div>
        <button className="btn-primary" disabled={busy || !valid}>
          {busy ? t('team.adding') : t('team.addButton')}
        </button>
        <p className="text-xs text-muted">{t('team.inviteNote')}</p>
      </form>
      {flash}
    </div>
  );
}
