import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MessageKey } from '@shared/i18n';
import { ago, dayDate } from '@shared/format';
import { SyncStatus, VisitSheet, type Lead } from '@/components/field';
import { Button, C, Card, Divider, ErrorNote, Note, Row, Txt, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { cached } from '@/lib/fieldQueue';
import { useFieldSync } from '@/lib/fieldSync';
import { useBrand, useSession } from '@/lib/session';

type Stats = {
  today: number;
  week: number;
  approved: number;
  sentBack: number;
  pending: number;
  openLeads: number;
  visitsToday: number;
  approvalRate: number | null;
  revisitsDue: { id: string; leadId: string; name: string; revisitOn: string; note: string | null }[];
  minGpsAccuracyM: number;
};

function Stat({ label, value, sub, onPress }: { label: string; value: string | number; sub?: string; onPress?: () => void }) {
  return (
    <Card style={{ flex: 1, minWidth: '45%', gap: 2 }} onPress={onPress}>
      <Txt v="tiny" muted>
        {label}
      </Txt>
      <Txt v="h2">{value}</Txt>
      {sub ? (
        <Txt v="tiny" muted>
          {sub}
        </Txt>
      ) : null}
    </Card>
  );
}

/** Field home (spec 7.3): today's numbers, revisits due and the leads to visit. Works from cache offline. */
export default function FieldToday() {
  const { t, lang, me } = useSession();
  const brand = useBrand();
  const insets = useSafeAreaInsets();
  const { visits } = useFieldSync();
  const [leads, setLeads] = useState<{ data: Lead[]; offline: boolean } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [visitFor, setVisitFor] = useState<Lead | null>(null);
  const [flash, setFlash] = useFlash();

  const load = useCallback(async () => {
    setError(null);
    await Promise.all([
      cached('leads', () => api<{ data: Lead[] }>('/v1/field/leads').then((r) => r.data))
        .then(setLeads)
        .catch((e) => setError(errorMessage(e))),
      cached('stats', () => api<Stats>('/v1/field/me/stats'))
        .then((r) => setStats(r.data))
        .catch(() => {}),
    ]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const loggedToday = (leadId: string) => visits.find((v) => v.leadId === leadId);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: insets.top + 12, gap: 16, paddingBottom: 100 }}
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
        <View>
          <Txt v="h1">{t('fhome.title')}</Txt>
          <Txt muted>{me?.name ?? ''}</Txt>
        </View>
        <SyncStatus />
        <Button icon="＋" title={t('fhome.capture')} onPress={() => router.push('/field/capture')} style={{ minHeight: 54 }} />
        <ErrorNote message={error} onRetry={load} />

        {stats ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Stat label={t('fhome.capturedToday')} value={stats.today} sub={t('fhome.thisWeek', { n: stats.week })} />
            <Stat label={t('fhome.visitsToday')} value={stats.visitsToday} />
            <Stat label={t('fhome.waiting')} value={stats.pending} />
            <Stat
              label={t('fhome.approvalRate')}
              value={stats.approvalRate == null ? '–' : `${stats.approvalRate}%`}
              sub={stats.sentBack ? t('fhome.sentBack', { n: stats.sentBack }) : t('fhome.approved', { n: stats.approved })}
              onPress={stats.sentBack ? () => router.navigate('/field/queue') : undefined}
            />
          </View>
        ) : null}

        {stats && stats.revisitsDue.length > 0 ? (
          <Note>
            <Txt v="small" bold color="#92400e">
              {t('fhome.revisitsDue')}
            </Txt>
            {stats.revisitsDue.map((r) => (
              <Txt key={r.id} v="small" color="#92400e">
                • {r.name} · {dayDate(r.revisitOn.slice(0, 10), lang)}
                {r.note ? ` — ${r.note}` : ''}
              </Txt>
            ))}
          </Note>
        ) : null}

        <Card style={{ padding: 0 }}>
          <Row style={{ justifyContent: 'space-between', padding: 14 }}>
            <Txt v="h3">{t('fhome.leads', { n: leads?.data.length ?? '…' })}</Txt>
            {leads?.offline ? (
              <Txt v="tiny" color={C.warn}>
                {t('fhome.savedCopy')}
              </Txt>
            ) : null}
          </Row>
          {leads?.data.length === 0 ? (
            <Txt muted style={{ textAlign: 'center', padding: 20 }}>
              {t('fhome.noLeads')}
            </Txt>
          ) : null}
          {leads?.data.map((l) => {
            const pendingVisit = loggedToday(l.id);
            return (
              <View key={l.id}>
                <Divider />
                <View style={{ padding: 14, gap: 6 }}>
                  <Txt bold>{l.name}</Txt>
                  <Txt v="tiny" muted>
                    {[l.address, l.area?.name, l.city.name].filter(Boolean).join(', ')} · {t('fhome.from', { source: l.source.replace(/_/g, ' ') })}
                  </Txt>
                  {pendingVisit ? (
                    <Txt v="tiny" color={C.warn}>
                      📝 {t(`fvisit.outcome.${pendingVisit.outcome}` as MessageKey)} · {t('fhome.onPhoneShort')}
                    </Txt>
                  ) : l.lastVisit ? (
                    <Txt v="tiny" muted>
                      {t('fhome.lastVisit', { outcome: t(`fvisit.outcome.${l.lastVisit.outcome}` as MessageKey), when: ago(l.lastVisit.createdAt, t) })}
                      {l.lastVisit.note ? ` — ${l.lastVisit.note}` : ''}
                    </Txt>
                  ) : null}
                  <Row style={{ flexWrap: 'wrap', marginTop: 4 }}>
                    <Button small title={t('fhome.captureLead')} onPress={() => router.push({ pathname: '/field/capture', params: { lead: l.id } })} />
                    {l.lat != null && l.lng != null ? (
                      <Button small kind="outline" title={t('fhome.navigate')} onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lng}`)} />
                    ) : null}
                    {l.phone ? <Button small kind="outline" icon="📞" title={l.phone} onPress={() => Linking.openURL(`tel:+91${l.phone}`)} /> : null}
                    <Pressable onPress={() => setVisitFor(l)} hitSlop={8} style={{ paddingVertical: 8 }}>
                      <Txt v="small" muted style={{ textDecorationLine: 'underline' }}>
                        {t('fhome.logVisit')}
                      </Txt>
                    </Pressable>
                  </Row>
                </View>
              </View>
            );
          })}
        </Card>

        {stats ? <Note tone="info">{t('fhome.gpsTip', { m: stats.minGpsAccuracyM })}</Note> : null}
      </ScrollView>
      <VisitSheet lead={visitFor} onClose={() => setVisitFor(null)} onSaved={() => setFlash(t('fvisit.saved'))} />
      {flash}
    </View>
  );
}
