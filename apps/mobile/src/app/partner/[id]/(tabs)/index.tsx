import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { ago, dayDate, humanize, restaurantHref } from '@shared/format';
import type { Photo } from '@shared/types';
import { STATUS_TONE, usePartner } from '@/components/partner/context';
import { Badge, Button, C, Card, Chip, Divider, ErrorNote, Loading, Note, Row, Txt } from '@/components/ui';
import { WEB_URL } from '@/lib/env';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Metric = 'views' | 'searchImpressions' | 'calls' | 'directions' | 'saves';
type Analytics = {
  totals: Record<Metric | 'shares', number>;
  ratingTrend: { week: string; average: number; reviews: number }[];
  rating: number;
  reviewCount: number;
  newReviews: number;
  isVisibleToDiners: boolean;
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card style={{ width: '48%', gap: 2 }}>
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

/** Setup checklist until the listing is live (spec 5.1). */
function Checklist() {
  const { restaurant: r, can } = usePartner();
  const { t } = useSession();
  const photos = useApi<{ data: Photo[] }>(can('photos') ? `/v1/partner/restaurants/${r.id}/photos` : null);
  const list = photos.data?.data ?? [];
  const items: { done: boolean; label: string; go: () => void }[] = [
    { done: r.cuisineSlugs.length > 0 && !!r.typeSlug, label: t('check.cuisines'), go: () => WebBrowser.openBrowserAsync(`${WEB_URL}/partner/${r.id}/profile`) },
    { done: r.hours.length > 0, label: t('check.hours'), go: () => router.push({ pathname: '/partner/[id]/hours', params: { id: r.id } }) },
    { done: list.some((p) => p.category === 'exterior'), label: t('check.storefront'), go: () => router.push({ pathname: '/partner/[id]/photos', params: { id: r.id } }) },
    { done: !!r.menuUpdatedAt, label: t('check.menu'), go: () => router.push({ pathname: '/partner/[id]/menu', params: { id: r.id } }) },
    { done: list.some((p) => p.category === 'food'), label: t('check.food'), go: () => router.push({ pathname: '/partner/[id]/photos', params: { id: r.id } }) },
    { done: !!r.fssaiNumber, label: t('check.fssai'), go: () => WebBrowser.openBrowserAsync(`${WEB_URL}/partner/${r.id}/profile`) },
  ];
  const done = items.filter((i) => i.done).length;
  return (
    <Card style={{ gap: 10 }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt v="h3">{t('check.title')}</Txt>
        <Txt v="small" muted>
          {t('check.progress', { done, total: items.length })}
        </Txt>
      </Row>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: C.surface, overflow: 'hidden' }}>
        <View style={{ width: `${(done / items.length) * 100}%`, height: '100%', backgroundColor: C.good }} />
      </View>
      {items.map((i) => (
        <Row key={i.label} gap={10}>
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: i.done ? C.good : 'transparent', borderWidth: i.done ? 0 : 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}>
            {i.done ? <Txt v="tiny" color="#fff" bold>✓</Txt> : null}
          </View>
          <Txt v="small" muted={i.done} style={[{ flex: 1 }, i.done && { textDecorationLine: 'line-through' }]} onPress={i.done ? undefined : i.go}>
            {i.label}
          </Txt>
        </Row>
      ))}
    </Card>
  );
}

/** Restaurant overview: status, what needs attention, and how diners find it (spec 5.2 analytics). */
export default function Dashboard() {
  const { restaurant: r, can, reload } = usePartner();
  const { t, lang, config } = useSession();
  const brand = useBrand();
  const [days, setDays] = useState(30);
  const a = useApi<Analytics>(can('analytics') ? `/v1/partner/restaurants/${r.id}/analytics` : null, { days });
  const data = a.data ?? a.stale;
  const [now] = useState(() => Date.now());
  const preLive = ['draft', 'rejected', 'pending'].includes(r.status);
  const hoursStale = !!r.hoursConfirmedAt && new Date(r.hoursConfirmedAt).getTime() < now - 60 * 864e5;
  const menuStale = !!r.menuUpdatedAt && new Date(r.menuUpdatedAt).getTime() < now - 120 * 864e5;
  const tempClosed = r.temporarilyClosedUntil && new Date(r.temporarilyClosedUntil).getTime() > now;
  const pendingCore = r.verification.filter((v) => v.type === 'core_change' && v.status === 'pending');
  const webBase = config.brand.webDomain ? `https://${config.brand.webDomain}` : WEB_URL;

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
      refreshControl={
        <RefreshControl
          refreshing={a.refreshing}
          onRefresh={() => {
            reload();
            a.refresh();
          }}
          tintColor={brand}
          colors={[brand]}
        />
      }
    >
      <Row style={{ flexWrap: 'wrap' }}>
        <Badge label={humanize(r.status)} color={STATUS_TONE[r.status]?.[0]} bg={STATUS_TONE[r.status]?.[1]} />
        {r.isVerified ? <Badge label={`✔ ${t('detail.verified')}`} color={C.info} bg="#eff6ff" /> : null}
        <Txt v="tiny" muted>
          {t('partner.youAre', { role: t(`role.${r.myRole}` as MessageKey) })}
        </Txt>
      </Row>
      {r.status === 'live' ? (
        <Button small kind="outline" icon="↗" title={t('partner.viewPublic')} onPress={() => WebBrowser.openBrowserAsync(`${webBase}${restaurantHref({ slug: r.slug, citySlug: r.city.slug })}`)} style={{ alignSelf: 'flex-start' }} />
      ) : null}

      {r.status === 'pending' ? <Note tone="info">⏳ {t('dash.pending')}</Note> : null}
      {tempClosed ? <Note>{t('dash.tempClosed', { date: new Date(r.temporarilyClosedUntil!).toLocaleDateString('en-IN') })}</Note> : null}
      {pendingCore.map((v) => (
        <Note key={v.id} tone="info">
          {t('dash.coreChange', { when: ago(v.createdAt, t) })}{' '}
          {Object.entries(v.payload ?? {})
            .map(([k, val]) => `${k} → ${String(val)}`)
            .join(', ')}
        </Note>
      ))}
      {r.status === 'live' && can('profile') && hoursStale ? (
        <Note>
          <Txt v="small" color="#92400e">
            {t('dash.hoursStale', { when: ago(r.hoursConfirmedAt!, t) })}
          </Txt>
          <Button small kind="outline" title={t('dash.checkHours')} onPress={() => router.push({ pathname: '/partner/[id]/hours', params: { id: r.id } })} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        </Note>
      ) : null}
      {r.status === 'live' && can('menu') && menuStale ? (
        <Note>
          <Txt v="small" color="#92400e">
            {t('dash.menuStale')}
          </Txt>
          <Button small kind="outline" title={t('dash.updateMenu')} onPress={() => router.push({ pathname: '/partner/[id]/menu', params: { id: r.id } })} style={{ alignSelf: 'flex-start', marginTop: 8 }} />
        </Note>
      ) : null}

      {preLive ? <Checklist /> : null}
      {preLive && can('core') && ['draft', 'rejected'].includes(r.status) ? (
        <Card style={{ gap: 8 }}>
          <Txt v="h3">{t('submit.title')}</Txt>
          <Txt v="small" muted>
            {t('papp.submitOnWeb')}
          </Txt>
          <Button title={t('submit.title')} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/partner/${r.id}`)} />
        </Card>
      ) : null}

      {can('analytics') ? (
        <View style={{ gap: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="h3">{t('stats.title')}</Txt>
            <Row gap={6}>
              {[7, 30, 90].map((d) => (
                <Chip key={d} label={t('stats.days', { n: d })} on={days === d} onPress={() => setDays(d)} />
              ))}
            </Row>
          </Row>
          <ErrorNote message={a.error} onRetry={a.reload} />
          {!data ? (
            <Loading />
          ) : (
            <>
              {!data.isVisibleToDiners ? <Note>{t('stats.notVisible')}</Note> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
                <Stat label={t('stats.searchImpressions')} value={data.totals.searchImpressions} />
                <Stat label={t('stats.views')} value={data.totals.views} />
                <Stat label={t('stats.calls')} value={data.totals.calls} />
                <Stat label={t('stats.directions')} value={data.totals.directions} />
                <Stat label={t('stats.saves')} value={data.totals.saves} />
                <Stat label={t('stats.rating')} value={data.rating > 0 ? data.rating.toFixed(1) : '–'} sub={t('stats.ratingSub', { n: data.reviewCount, new: data.newReviews })} />
              </View>
              {data.ratingTrend.length > 0 ? (
                <Card style={{ gap: 6 }}>
                  <Txt v="small" bold>
                    {t('stats.ratingTrend')}
                  </Txt>
                  {data.ratingTrend.map((w) => (
                    <Row key={w.week} gap={10}>
                      <Txt v="small" style={{ width: 110 }}>
                        {dayDate(w.week, lang)}
                      </Txt>
                      <View style={{ height: 8, width: (w.average / 5) * 90, borderRadius: 4, backgroundColor: C.good }} />
                      <Txt v="small">{w.average.toFixed(1)}★</Txt>
                      <Txt v="tiny" muted style={{ marginLeft: 'auto' }}>
                        {w.reviews}
                      </Txt>
                    </Row>
                  ))}
                </Card>
              ) : null}
            </>
          )}
        </View>
      ) : null}

      {r.verification.length > 0 ? (
        <Card style={{ gap: 6 }}>
          <Txt v="h3">{t('dash.history')}</Txt>
          {r.verification.map((v, i) => (
            <View key={v.id}>
              {i > 0 ? <Divider style={{ marginBottom: 6 }} /> : null}
              <Row style={{ alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Txt v="small">
                    {t(`verif.${v.type}` as MessageKey)} · {ago(v.createdAt, t)}
                  </Txt>
                  {v.decisionNote ? (
                    <Txt v="tiny" muted>
                      {t('dash.note', { note: v.decisionNote })}
                    </Txt>
                  ) : null}
                </View>
                <Badge label={humanize(v.status)} color={STATUS_TONE[v.status]?.[0]} bg={STATUS_TONE[v.status]?.[1]} />
              </Row>
            </View>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
