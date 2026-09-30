'use client';

import { useState } from 'react';
import type { MessageKey } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { LoginForm } from '../auth';
import { ErrorNote, Modal } from '../ui';

type Target = { type: 'review' | 'photo' | 'restaurant'; id: string };

const REASONS: Record<Target['type'], string[]> = {
  review: ['spam', 'offensive', 'fake', 'other'],
  photo: ['offensive', 'wrong_info', 'spam', 'other'],
  restaurant: ['closed_permanently', 'wrong_hours', 'wrong_phone', 'wrong_info', 'fake', 'other'],
};

export function ReportDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const { me, t } = useSession();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setReason('');
    setDetails('');
    setPhone('');
    setAddress('');
    setDone(false);
    setError(null);
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setBusy(true);
    setError(null);
    // Suggested corrections let the ops team apply the fix in one click (spec 6 "Info corrections").
    const proposed = {
      ...(reason === 'wrong_phone' && phone ? { phone } : {}),
      ...(reason === 'wrong_info' && address.trim() ? { addressLine: address.trim() } : {}),
    };
    try {
      await api('/v1/reports', {
        method: 'POST',
        body: { targetType: target.type, targetId: target.id, reason, ...(details.trim() ? { details: details.trim() } : {}), ...(Object.keys(proposed).length ? { proposed } : {}) },
      });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = target?.type === 'restaurant' ? t('report.titleRestaurant') : t(`report.title.${target?.type ?? 'review'}` as MessageKey);
  return (
    <Modal open={!!target} onClose={close} title={title}>
      {!me ? (
        <LoginForm intro={t('report.signIn')} />
      ) : done ? (
        <div className="space-y-4 py-4 text-center">
          <p className="text-3xl">🙏</p>
          <p className="font-medium">{t('report.thanks')}</p>
          <button className="btn-primary" onClick={close}>
            {t('action.done')}
          </button>
        </div>
      ) : (
        target && (
          <form onSubmit={submit} className="space-y-3">
            <ErrorNote message={error} />
            <div className="space-y-1">
              {REASONS[target.type].map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface">
                  <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--brand)]" />
                  <span className="text-sm">{t(`report.reason.${target.type}.${r}` as MessageKey)}</span>
                </label>
              ))}
            </div>
            {reason === 'wrong_phone' && (
              <label className="block">
                <span className="label">{t('report.correctPhone')}</span>
                <input className="input" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
              </label>
            )}
            {reason === 'wrong_info' && target.type === 'restaurant' && (
              <label className="block">
                <span className="label">{t('report.correctAddress')}</span>
                <input className="input" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
              </label>
            )}
            <textarea className="input min-h-20" placeholder={t('report.detailsPlaceholder')} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
            <button className="btn-primary w-full" disabled={!reason || busy || (reason === 'wrong_phone' && phone.length > 0 && phone.length !== 10)}>
              {busy ? t('report.sending') : t('report.send')}
            </button>
          </form>
        )
      )}
    </Modal>
  );
}
