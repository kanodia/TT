import { useState } from 'react';
import { Alert, FlatList, Switch, View } from 'react-native';
import { DAY_KEYS, humanize, shiftLabel, shortDate } from '@shared/format';
import type { Offer } from '@shared/types';
import { TimeInput } from '@/components/forms';
import { STATUS_TONE, usePartner } from '@/components/partner/context';
import { Badge, Button, C, Card, Chip, Empty, ErrorNote, Field, Loading, Row, Sheet, Txt, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Draft = Omit<Offer, 'id' | 'startsOn' | 'endsOn'> & { id?: string; endsInDays: number | null; endsOn: string | null; startsOn: string | null };
const blank: Draft = { title: '', terms: null, discountType: 'percent', value: null, validDays: [0, 1, 2, 3, 4, 5, 6], validFromTime: null, validToTime: null, startsOn: null, endsOn: null, endsInDays: null, status: 'active' };

/** End of the chosen day in India time, as the API expects. */
function endOfDayIST(daysFromNow: number) {
  const d = new Date(Date.now() + daysFromNow * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return new Date(`${d}T23:59:59+05:30`).toISOString();
}

function OfferSheet({ draft, onClose, onSave }: { draft: Draft; onClose: () => void; onSave: (body: Record<string, unknown>, id?: string) => Promise<void> }) {
  const { t } = useSession();
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<Draft>) => setD((cur) => ({ ...cur, ...p }));
  const timed = !!(d.validFromTime || d.validToTime);

  async function submit() {
    if (timed && (!d.validFromTime || !d.validToTime || d.validFromTime >= d.validToTime)) return setError(t('offer.errTimes'));
    setBusy(true);
    setError(null);
    const { id, endsInDays, ...rest } = d;
    try {
      await onSave({ ...rest, title: rest.title.trim(), endsOn: endsInDays != null ? endOfDayIST(endsInDays) : rest.endsOn }, id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title={d.id ? t('offer.edit') : t('offer.new')}>
      <ErrorNote message={error} />
      <Field label={`${t('offer.headline')} *`} hint={t('offer.headlineHint')} value={d.title} maxLength={80} onChangeText={(title) => set({ title })} autoFocus={!d.id} />
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('offer.type')}
        </Txt>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {(['percent', 'flat', 'bogo', 'other'] as const).map((k) => (
            <Chip key={k} label={t(`offer.${k}`)} on={d.discountType === k} onPress={() => set({ discountType: k, value: k === 'percent' || k === 'flat' ? d.value : null })} />
          ))}
        </Row>
      </View>
      {d.discountType === 'percent' || d.discountType === 'flat' ? (
        <Field
          label={d.discountType === 'percent' ? t('offer.percentValue') : t('offer.amount')}
          keyboardType="number-pad"
          value={d.value != null ? String(d.value) : ''}
          onChangeText={(v) => set({ value: v ? Math.min(d.discountType === 'percent' ? 100 : 100000, Number(v.replace(/\D/g, '')) || 0) : null })}
        />
      ) : null}
      <Field label={t('offer.terms')} multiline maxLength={300} value={d.terms ?? ''} onChangeText={(v) => set({ terms: v || null })} placeholder={t('offer.termsPlaceholder')} />
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('offer.days')}
        </Txt>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {DAY_KEYS.map((k, i) => (
            <Chip key={k} label={t(k)} on={d.validDays.includes(i)} onPress={() => set({ validDays: d.validDays.includes(i) ? d.validDays.filter((x) => x !== i) : [...d.validDays, i].sort() })} />
          ))}
        </Row>
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="small">{t('offer.onlyHours')}</Txt>
        <Switch value={timed} onValueChange={(on) => set(on ? { validFromTime: '15:00', validToTime: '18:00' } : { validFromTime: null, validToTime: null })} />
      </Row>
      {timed ? (
        <Row>
          <TimeInput label={t('offer.from', { date: '' })} value={d.validFromTime ?? ''} onChange={(v) => set({ validFromTime: v })} />
          <Txt muted>–</Txt>
          <TimeInput label={t('offer.until', { date: '' })} value={d.validToTime ?? ''} onChange={(v) => set({ validToTime: v })} />
        </Row>
      ) : null}
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('offer.ends')}
        </Txt>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {d.endsOn && d.endsInDays == null ? <Chip on label={shortDate(d.endsOn)} /> : null}
          {([null, 7, 30, 90] as const).map((n) => (
            <Chip
              key={String(n)}
              label={n == null ? t('papp.noEnd') : t('papp.endsIn', { n })}
              on={n == null ? d.endsInDays == null && !d.endsOn : d.endsInDays === n}
              onPress={() => set({ endsInDays: n, endsOn: n == null ? null : d.endsOn })}
            />
          ))}
        </Row>
      </View>
      <Button title={busy ? t('action.saving') : t('offer.save')} onPress={submit} busy={busy} disabled={d.title.trim().length < 3 || !d.validDays.length} />
    </Sheet>
  );
}

/** Offers diners see on the card and restaurant page (spec 5.2). */
export default function PartnerOffers() {
  const { restaurant: r } = usePartner();
  const { t } = useSession();
  const offers = useApi<{ data: Offer[] }>(`/v1/partner/restaurants/${r.id}/offers`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const base = `/v1/partner/restaurants/${r.id}/offers`;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
      offers.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const confirm = (title: string, onYes: () => void) =>
    Alert.alert(title, '', [
      { text: t('action.cancel'), style: 'cancel' },
      { text: 'OK', style: 'destructive', onPress: onYes },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={offers.data?.data ?? []}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Txt v="small" muted>
              {t('offer.intro')}
            </Txt>
            <Button icon="＋" title={t('offer.new')} onPress={() => setDraft(blank)} />
            <ErrorNote message={error ?? offers.error} />
            {offers.loading ? <Loading /> : null}
          </View>
        }
        ListEmptyComponent={
          offers.data ? (
            <Empty title={t('offer.emptyTitle')} icon="🏷️">
              {t('offer.emptyBody')}
            </Empty>
          ) : null
        }
        renderItem={({ item: o }) => {
          const expired = !!o.endsOn && new Date(o.endsOn) < new Date();
          const status = expired ? 'ended' : o.status;
          return (
            <Card style={{ gap: 6 }}>
              <Row style={{ alignItems: 'flex-start' }}>
                <Txt bold style={{ flex: 1 }}>
                  🏷️ {o.title}
                </Txt>
                <Badge label={humanize(status)} color={STATUS_TONE[status]?.[0] ?? (status === 'active' ? '#166534' : C.muted)} bg={STATUS_TONE[status]?.[1] ?? (status === 'active' ? '#dcfce7' : C.surface)} />
              </Row>
              <Txt v="tiny" muted>
                {o.validDays.length === 7 ? t('offer.everyDay') : o.validDays.map((d) => t(DAY_KEYS[d])).join(', ')}
                {o.validFromTime && o.validToTime ? ` · ${shiftLabel({ opensAt: o.validFromTime, closesAt: o.validToTime })}` : ''}
                {o.startsOn ? ` · ${t('offer.from', { date: shortDate(o.startsOn) })}` : ''}
                {o.endsOn ? ` · ${t('offer.until', { date: shortDate(o.endsOn) })}` : ''}
              </Txt>
              {o.terms ? (
                <Txt v="tiny" muted>
                  {o.terms}
                </Txt>
              ) : null}
              <Row style={{ flexWrap: 'wrap' }}>
                <Button small kind="outline" title={t('action.edit')} onPress={() => setDraft({ ...o, endsInDays: null })} />
                {o.status !== 'ended' ? (
                  <Button small kind="outline" title={o.status === 'active' ? t('offer.pause') : t('offer.resume')} onPress={() => run(() => api(`${base}/${o.id}`, { method: 'PATCH', body: { status: o.status === 'active' ? 'paused' : 'active' } }))} />
                ) : null}
                {o.status !== 'ended' ? <Button small kind="ghost" title={t('offer.end')} onPress={() => confirm(t('offer.confirmEnd'), () => run(() => api(`${base}/${o.id}`, { method: 'PATCH', body: { status: 'ended' } })))} /> : null}
                <Button small kind="ghost" title={t('action.delete')} onPress={() => confirm(t('offer.confirmDelete'), () => run(() => api(`${base}/${o.id}`, { method: 'DELETE' })))} />
              </Row>
            </Card>
          );
        }}
      />
      {draft ? (
        <OfferSheet
          key={draft.id ?? 'new'}
          draft={draft}
          onClose={() => setDraft(null)}
          onSave={async (body, id) => {
            if (id) await api(`${base}/${id}`, { method: 'PATCH', body });
            else await api(base, { method: 'POST', body });
            setFlash(t('offer.saved'));
            offers.reload();
          }}
        />
      ) : null}
      {flash}
    </View>
  );
}
