import { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import type { VisitOutcome } from '@shared/field';
import { newId, putVisit } from '@/lib/fieldQueue';
import { useFieldSync } from '@/lib/fieldSync';
import { useBrand, useSession } from '@/lib/session';
import { Button, C, Chip, Field, Note, Row, Sheet, Txt } from './ui';

export type Lead = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  lat: number | null;
  lng: number | null;
  source: string;
  cityId: string;
  city: { name: string };
  area: { name: string } | null;
  lastVisit: { outcome: string; revisitOn: string | null; note: string | null; createdAt: string } | null;
};

const OUTCOMES: VisitOutcome[] = ['revisit', 'closed', 'refused', 'duplicate', 'not_found'];

const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Visit log (spec 7.3): outcome, optional revisit date and note. Queued offline like captures. */
export function VisitSheet({ lead, onClose, onSaved }: { lead: Lead | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useSession();
  const brand = useBrand();
  const { sync } = useFieldSync();
  const [outcome, setOutcome] = useState<VisitOutcome | ''>('');
  const [revisitIn, setRevisitIn] = useState(1);
  const [note, setNote] = useState('');

  async function save() {
    if (!lead || !outcome) return;
    await putVisit({
      clientUuid: newId(),
      leadId: lead.id,
      outcome,
      revisitOn: outcome === 'revisit' ? isoDate(new Date(Date.now() + revisitIn * 864e5)) : null,
      note: note.trim() || null,
      createdAt: new Date().toISOString(),
    });
    setOutcome('');
    setNote('');
    onSaved();
    onClose();
    void sync();
  }

  return (
    <Sheet open={!!lead} onClose={onClose} title={t('fvisit.title', { name: lead?.name ?? '' })}>
      {OUTCOMES.map((o) => (
        <Pressable key={o} onPress={() => setOutcome(o)} accessibilityRole="radio" accessibilityState={{ checked: outcome === o }}>
          <Row gap={10} style={{ paddingVertical: 6 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: outcome === o ? brand : C.border, alignItems: 'center', justifyContent: 'center' }}>
              {outcome === o ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: brand }} /> : null}
            </View>
            <Txt>{t(`fvisit.outcome.${o}` as MessageKey)}</Txt>
          </Row>
        </Pressable>
      ))}
      {outcome === 'revisit' ? (
        <View style={{ gap: 6 }}>
          <Txt v="small" bold>
            {t('fvisit.revisitOn')}
          </Txt>
          <Row style={{ flexWrap: 'wrap' }}>
            {[1, 2, 3, 7, 14].map((n) => (
              <Chip key={n} label={n === 1 ? t('fvisit.tomorrow') : t('fvisit.inDays', { n })} on={revisitIn === n} onPress={() => setRevisitIn(n)} />
            ))}
          </Row>
        </View>
      ) : null}
      <Field label={t('fvisit.note')} value={note} onChangeText={setNote} maxLength={500} placeholder={t('fvisit.notePlaceholder')} />
      <Button title={t('fvisit.save')} onPress={save} disabled={!outcome} />
    </Sheet>
  );
}

/** Online/offline and last-upload banner shown at the top of field screens. */
export function SyncStatus() {
  const { t } = useSession();
  const { online, queue, visits, syncing, last, sync } = useFieldSync();
  const waiting = queue.filter((q) => !q.error).length + visits.filter((v) => !v.error).length;
  const broken = queue.filter((q) => q.error).length;
  return (
    <View style={{ gap: 8 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="small" bold color={online ? C.good : C.warn}>
          ● {online ? t('fhome.online') : t('fhome.offline')}
        </Txt>
        {waiting > 0 ? <Button small kind="outline" icon="⟳" title={t('fhome.uploadNow')} onPress={sync} busy={syncing} disabled={!online} /> : null}
      </Row>
      {waiting > 0 && !online ? <Note>{t('fhome.waitingOffline', { n: waiting })}</Note> : null}
      {broken > 0 ? <Note>{t('fhome.needFix', { n: broken })}</Note> : null}
      {last?.error ? <Note>{last.error}</Note> : null}
    </View>
  );
}
