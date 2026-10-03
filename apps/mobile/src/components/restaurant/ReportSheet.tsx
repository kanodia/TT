import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { api, errorMessage } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';
import { Button, C, ErrorNote, Field, Note, Row, Sheet, Txt } from '../ui';

export type ReportTarget = { type: 'review' | 'photo' | 'restaurant'; id: string };

const REASONS: Record<ReportTarget['type'], string[]> = {
  review: ['spam', 'offensive', 'fake', 'other'],
  photo: ['offensive', 'wrong_info', 'spam', 'other'],
  restaurant: ['closed_permanently', 'wrong_hours', 'wrong_phone', 'wrong_info', 'fake', 'other'],
};

/** Report a review, photo or wrong listing info (spec 4.6, 6). Corrections can carry the right value. */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const { me, t } = useSession();
  const brand = useBrand();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setReason('');
    setDetails('');
    setPhone('');
    setAddress('');
    setDone(false);
    setError(null);
    onClose();
  };

  async function send() {
    if (!target) return;
    setBusy(true);
    setError(null);
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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const title = target?.type === 'restaurant' ? t('report.titleRestaurant') : t(`report.title.${target?.type ?? 'review'}` as MessageKey);
  return (
    <Sheet open={!!target} onClose={close} title={title}>
      {!me ? (
        <View style={{ gap: 12 }}>
          <Txt muted>{t('report.signIn')}</Txt>
          <Button
            title={t('auth.signIn')}
            onPress={() => {
              close();
              router.push('/login');
            }}
          />
        </View>
      ) : done ? (
        <Note tone="good">{t('report.thanks')}</Note>
      ) : target ? (
        <>
          <ErrorNote message={error} />
          {REASONS[target.type].map((r) => (
            <Pressable key={r} onPress={() => setReason(r)} accessibilityRole="radio" accessibilityState={{ checked: reason === r }}>
              <Row gap={10} style={{ paddingVertical: 6 }}>
                <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: reason === r ? brand : C.border, alignItems: 'center', justifyContent: 'center' }}>
                  {reason === r ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: brand }} /> : null}
                </View>
                <Txt>{t(`report.reason.${target.type}.${r}` as MessageKey)}</Txt>
              </Row>
            </Pressable>
          ))}
          {reason === 'wrong_phone' ? <Field label={t('report.correctPhone')} value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} keyboardType="number-pad" /> : null}
          {reason === 'wrong_info' && target.type === 'restaurant' ? <Field label={t('report.correctAddress')} value={address} onChangeText={setAddress} /> : null}
          <Field multiline placeholder={t('report.detailsPlaceholder')} value={details} onChangeText={setDetails} maxLength={500} />
          <Button title={busy ? t('report.sending') : t('report.send')} onPress={send} busy={busy} disabled={!reason || (reason === 'wrong_phone' && phone.length > 0 && phone.length !== 10)} />
        </>
      ) : null}
    </Sheet>
  );
}
