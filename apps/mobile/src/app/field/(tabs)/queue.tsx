import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MessageKey } from '@shared/i18n';
import { ago, humanize } from '@shared/format';
import { SyncStatus } from '@/components/field';
import { Badge, C, Card, Divider, Empty, ErrorNote, Row, Txt } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { removeQueued } from '@/lib/fieldQueue';
import { useFieldSync } from '@/lib/fieldSync';
import { useBrand, useSession } from '@/lib/session';

type Submission = { id: string; name: string; addressLine: string; status: string; reviewNote: string | null; capturedAt: string; restaurantId: string | null };
type Visit = { id: string; outcome: string; revisitOn: string | null; note: string | null; createdAt: string; lead: { name: string } | null; restaurant: { name: string } | null };

const TONE: Record<string, [string, string]> = {
  submitted: ['#92400e', '#fef3c7'],
  approved: ['#166534', '#dcfce7'],
  sent_back: ['#9a3412', '#ffedd5'],
  rejected: ['#991b1b', '#fee2e2'],
  duplicate: ['#374151', '#f3f4f6'],
};

/** What's on the phone, what's been uploaded, and anything the reviewer sent back (spec 7.3, 7.4). */
export default function FieldQueue() {
  const { t } = useSession();
  const brand = useBrand();
  const insets = useSafeAreaInsets();
  const { queue, visits } = useFieldSync();
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [done, setDone] = useState<Visit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, v] = await Promise.all([api<{ data: Submission[] }>('/v1/field/me/submissions'), api<{ data: Visit[] }>('/v1/field/me/visits')]);
      setSubs(s.data);
      setDone(v.data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const broken = queue.filter((q) => q.error);
  const waiting = queue.filter((q) => !q.error);
  const pendingVisits = visits.filter((v) => !v.error);

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 16, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={brand}
          colors={[brand]}
        />
      }
    >
      <Txt v="h1">{t('fsubs.title')}</Txt>
      <SyncStatus />

      <Card style={{ padding: 0 }}>
        <Txt v="h3" style={{ padding: 14 }}>
          {t('fhome.onPhone', { n: queue.length + pendingVisits.length })}
        </Txt>
        {queue.length === 0 && pendingVisits.length === 0 ? (
          <Txt muted style={{ textAlign: 'center', paddingBottom: 16 }}>
            {t('fhome.allUploaded')}
          </Txt>
        ) : null}
        {[...broken, ...waiting].map((q) => (
          <View key={q.clientUuid}>
            <Divider />
            <Row style={{ padding: 14, alignItems: 'flex-start' }} gap={10}>
              <Txt v="h3">{q.error ? '⚠️' : '⏳'}</Txt>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt bold numberOfLines={1}>
                  {q.payload.name}
                </Txt>
                <Txt v="tiny" muted>
                  {q.payload.addressLine} · {ago(q.capturedAt, t)} · {t('fhome.photos', { n: q.payload.photos.length })}
                </Txt>
                {q.error ? (
                  <Txt v="tiny" color={C.bad}>
                    {q.error}
                  </Txt>
                ) : null}
                <Row gap={18} style={{ marginTop: 4 }}>
                  <Pressable onPress={() => router.push({ pathname: '/field/capture', params: { draft: q.clientUuid } })} hitSlop={8}>
                    <Txt v="small" bold color={brand}>
                      {q.error ? t('fhome.fix') : t('action.edit')}
                    </Txt>
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      Alert.alert(t('fhome.confirmDelete', { name: q.payload.name }), '', [
                        { text: t('action.cancel'), style: 'cancel' },
                        { text: t('action.delete'), style: 'destructive', onPress: () => void removeQueued(q.clientUuid) },
                      ])
                    }
                  >
                    <Txt v="small" muted>
                      {t('action.delete')}
                    </Txt>
                  </Pressable>
                </Row>
              </View>
            </Row>
          </View>
        ))}
        {pendingVisits.map((v) => (
          <View key={v.clientUuid}>
            <Divider />
            <Row style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              <Txt>📝</Txt>
              <Txt v="small" style={{ flex: 1 }}>
                {t('fhome.visit')} · {t(`fvisit.outcome.${v.outcome}` as MessageKey)}
              </Txt>
              <Txt v="tiny" muted>
                {ago(v.createdAt, t)}
              </Txt>
            </Row>
          </View>
        ))}
      </Card>

      <ErrorNote message={error} onRetry={load} />

      <View style={{ gap: 8 }}>
        <Txt v="h3">{t('fsubs.uploaded')}</Txt>
        {subs?.length === 0 ? (
          <Empty title={t('fsubs.empty')} icon="🧭">
            {t('fsubs.emptyBody')}
          </Empty>
        ) : null}
        {subs?.map((s) => (
          <Card key={s.id} style={{ gap: 6 }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Txt bold>{s.name}</Txt>
                <Txt v="tiny" muted>
                  {s.addressLine} · {t('fsubs.captured', { when: ago(s.capturedAt, t) })}
                </Txt>
              </View>
              <Badge label={humanize(s.status)} color={TONE[s.status]?.[0]} bg={TONE[s.status]?.[1]} />
            </Row>
            {s.status === 'sent_back' ? (
              <View style={{ backgroundColor: '#fff7ed', borderRadius: 8, padding: 10, gap: 4 }}>
                {s.reviewNote ? (
                  <Txt v="small" color="#9a3412">
                    <Txt v="small" bold color="#9a3412">
                      {t('fsubs.reviewer')}:
                    </Txt>{' '}
                    {s.reviewNote}
                  </Txt>
                ) : null}
                <Pressable onPress={() => router.push({ pathname: '/field/capture', params: { resubmit: s.id } })}>
                  <Txt v="small" bold color="#9a3412" style={{ textDecorationLine: 'underline' }}>
                    {t('fsubs.fix')}
                  </Txt>
                </Pressable>
              </View>
            ) : null}
          </Card>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <Txt v="h3">{t('fsubs.visits')}</Txt>
        {done?.length === 0 ? <Txt v="small" muted>{t('fsubs.noVisits')}</Txt> : null}
        {done?.length ? (
          <Card style={{ padding: 0 }}>
            {done.map((v, i) => (
              <View key={v.id}>
                {i > 0 ? <Divider /> : null}
                <Row style={{ padding: 12, alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Txt v="small">
                      {v.lead?.name ?? v.restaurant?.name ?? '—'} · {t(`fvisit.outcome.${v.outcome}` as MessageKey)}
                      {v.revisitOn ? ` → ${v.revisitOn.slice(0, 10)}` : ''}
                    </Txt>
                    {v.note ? (
                      <Txt v="tiny" muted>
                        {v.note}
                      </Txt>
                    ) : null}
                  </View>
                  <Txt v="tiny" muted>
                    {ago(v.createdAt, t)}
                  </Txt>
                </Row>
              </View>
            ))}
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
}
