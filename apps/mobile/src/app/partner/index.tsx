import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { ago, humanize } from '@shared/format';
import type { PartnerSummary, Verification } from '@shared/types';
import { Badge, Button, C, Card, Cover, Empty, ErrorNote, Loading, RatingBadge, Row, Txt } from '@/components/ui';
import { STATUS_TONE } from '@/components/partner/context';
import { WEB_URL } from '@/lib/env';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Claim = Verification & { restaurant: { id: string; name: string } };


/** "My restaurants" (spec 5.2). Adding or claiming a restaurant needs documents, so it opens the website. */
export default function PartnerHome() {
  const { t, signOut, me, lang, setLang } = useSession();
  const brand = useBrand();
  const list = useApi<{ data: PartnerSummary[]; claims: Claim[] }>('/v1/partner/restaurants');
  const data = list.data ?? list.stale;

  return (
    <ScrollView
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={brand} colors={[brand]} />}
    >
      <Txt muted>{t('partner.homeSub')}</Txt>
      <ErrorNote message={list.error} onRetry={list.reload} />
      {!data ? <Loading /> : null}

      {data?.claims.map((c) => (
        <Card key={c.id} style={{ gap: 4 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt bold style={{ flex: 1 }}>
              {t('partner.claimOf', { name: c.restaurant.name })}
            </Txt>
            <Badge label={humanize(c.status)} color={STATUS_TONE[c.status]?.[0]} bg={STATUS_TONE[c.status]?.[1]} />
          </Row>
          <Txt v="tiny" muted>
            {t('partner.sent', { when: ago(c.createdAt, t) })}
            {c.status === 'rejected' && c.decisionNote ? ` · ${t('partner.reason', { reason: c.decisionNote })}` : ''}
          </Txt>
        </Card>
      ))}

      {data && data.data.length === 0 ? (
        <Empty title={t('partner.emptyTitle')} icon="🏪">
          {t('partner.emptyBody')}
        </Empty>
      ) : null}

      {data?.data.map((r) => (
        <Card key={r.id} style={{ padding: 0, overflow: 'hidden' }} onPress={() => router.push({ pathname: '/partner/[id]', params: { id: r.id } })}>
          <Cover url={r.cover} seed={r.id} style={{ height: 110 }} rounded={0} />
          <View style={{ padding: 12, gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
                {r.name}
              </Txt>
              <RatingBadge rating={r.rating} />
            </Row>
            <Row style={{ flexWrap: 'wrap' }}>
              <Badge label={humanize(r.status)} color={STATUS_TONE[r.status]?.[0]} bg={STATUS_TONE[r.status]?.[1]} />
              <Txt v="tiny" muted>
                {r.city} · {t(`role.${r.role}` as MessageKey)}
              </Txt>
            </Row>
          </View>
        </Card>
      ))}

      <Row>
        <Button style={{ flex: 1 }} kind="outline" title={t('partner.claimExisting')} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/partner/claim`)} />
        <Button style={{ flex: 1 }} title={`+ ${t('partner.addRestaurant')}`} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/partner/new`)} />
      </Row>
      <Txt v="tiny" muted style={{ textAlign: 'center' }}>
        {t('papp.webForDocs')}
      </Txt>

      <Row style={{ justifyContent: 'center', marginTop: 12 }} gap={20}>
        <Pressable onPress={() => setLang(lang === 'en' ? 'hi' : 'en')} hitSlop={8}>
          <Txt v="small" color={brand}>
            {lang === 'en' ? 'हिन्दी' : 'English'}
          </Txt>
        </Pressable>
        <Pressable onPress={signOut} hitSlop={8}>
          <Txt v="small" muted>
            {t('auth.signOut')} (+91 {me?.phone})
          </Txt>
        </Pressable>
      </Row>
    </ScrollView>
  );
}
