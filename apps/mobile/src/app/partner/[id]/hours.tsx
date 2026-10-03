import { useState } from 'react';
import { ScrollView } from 'react-native';
import { ago } from '@shared/format';
import type { Shift } from '@shared/types';
import { HoursEditor } from '@/components/forms';
import { usePartner } from '@/components/partner/context';
import { Button, C, Card, ErrorNote, Row, Txt, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

const plain = (hours: Shift[]) => hours.map(({ dayOfWeek, opensAt, closesAt }) => ({ dayOfWeek, opensAt, closesAt }));

/** Weekly hours, plus the one-tap "still correct" confirmation (spec 5.2, hours freshness). */
export default function PartnerHours() {
  const { restaurant: r, reload } = usePartner();
  const { t } = useSession();
  const [hours, setHours] = useState<Shift[]>(() => plain(r.hours));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const dirty = JSON.stringify(hours) !== JSON.stringify(plain(r.hours));

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
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <ErrorNote message={error} />
      {!dirty && r.hours.length > 0 ? (
        <Card style={{ gap: 8 }}>
          <Txt v="small">{t('hoursPage.stillCorrect')}?</Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            <Button icon="✓" title={t('hoursPage.stillCorrect')} busy={busy} onPress={() => run(() => api(`/v1/partner/restaurants/${r.id}/hours/confirm`, { method: 'POST' }), t('hoursPage.confirmed'))} />
          </Row>
          {r.hoursConfirmedAt ? (
            <Txt v="tiny" muted>
              {t('detail.hoursConfirmed', { when: ago(r.hoursConfirmedAt, t) })}
            </Txt>
          ) : null}
        </Card>
      ) : null}
      <Txt v="small" muted>
        {t('hoursPage.help')}
      </Txt>
      <HoursEditor value={hours} onChange={setHours} />
      <Button title={t('hoursPage.save')} busy={busy} disabled={!dirty} onPress={() => run(() => api(`/v1/partner/restaurants/${r.id}/hours`, { method: 'PUT', body: { shifts: hours } }), t('hoursPage.saved'))} />
      {flash}
    </ScrollView>
  );
}
