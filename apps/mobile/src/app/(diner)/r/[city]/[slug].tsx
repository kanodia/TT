import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { FlatList, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { DAY_LONG_KEYS, ago, dayDate, distance, hoursByDay, nm, priceBand, restaurantHref, rupees, shiftLabel, shortDate } from '@shared/format';
import type { Detail } from '@shared/types';
import { Map } from '@/components/Map';
import { RestaurantCard } from '@/components/RestaurantCard';
import { Lightbox } from '@/components/restaurant/Lightbox';
import { Menu } from '@/components/restaurant/Menu';
import { PhotosTab } from '@/components/restaurant/Photos';
import { ReportSheet, type ReportTarget } from '@/components/restaurant/ReportSheet';
import { Reviews } from '@/components/restaurant/Reviews';
import { SaveToList } from '@/components/restaurant/SaveToList';
import { Badge, Button, C, Card, Cover, Divider, Empty, ErrorNote, Loading, OpenBadge, RatingBadge, Row, Txt, useFlash } from '@/components/ui';
import { track } from '@/lib/api';
import { reviewPosted } from '@/lib/events';
import { WEB_URL } from '@/lib/env';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Tab = 'overview' | 'menu' | 'reviews' | 'photos';

function ActionButton({ icon, label, onPress, primary }: { icon: string; label: string; onPress: () => void; primary?: boolean }) {
  const brand = useBrand();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, primary && { backgroundColor: brand, borderColor: brand }, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={[styles.actionText, primary && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Txt v="h3">{title}</Txt>
      {children}
    </View>
  );
}

/** Restaurant page (spec 4): the decision on the first screen, then overview, menu, reviews and photos. */
export default function RestaurantScreen() {
  const { slug } = useLocalSearchParams<{ city: string; slug: string }>();
  const { place, lang, me, t, tp, savedIds, toggleSaved, config } = useSession();
  const brand = useBrand();
  const { width } = useWindowDimensions();
  // Re-fetch once signed in so saved state reflects the user.
  const detail = useApi<Detail>(`/v1/restaurants/${slug}`, { lat: place.lat, lng: place.lng, u: me?.id });
  const [tab, setTab] = useState<Tab>('overview');
  const [report, setReport] = useState<ReportTarget | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; i: number } | null>(null);
  const [lists, setLists] = useState<string[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [flash, setFlash] = useFlash();
  const r = detail.data ?? detail.stale;

  useEffect(() => {
    if (detail.data?.id) track('view', detail.data.id);
  }, [detail.data?.id]);

  // Back from the review screen: show the new review.
  const id = detail.data?.id;
  useEffect(
    () =>
      reviewPosted.on(({ restaurantId, held }) => {
        if (restaurantId !== id) return;
        setTab('reviews');
        setReviewVersion((v) => v + 1);
        detail.reload();
        setFlash(held ? t('review.held') : t('review.live'));
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, t],
  );

  if (detail.loading && !r) return <Loading />;
  if (detail.error && !r) {
    return detail.error.includes('not found') ? (
      <Empty title={t('detail.notFoundTitle')} icon="🤷" action={<Button title={t('detail.browseNearby')} onPress={() => router.replace('/restaurants')} />}>
        {t('detail.notFoundBody')}
      </Empty>
    ) : (
      <View style={{ padding: 16 }}>
        <ErrorNote message={detail.error} onRetry={detail.reload} />
      </View>
    );
  }
  if (!r) return <Loading />;

  const inLists = lists ?? r.savedInLists;
  const isSaved = savedIds.has(r.id) || inLists.length > 0;
  const photoUrls = r.photos.map((p) => p.url);
  const today = new Date().getDay();
  const byDay = hoursByDay(r.hours);
  const dist = distance(r.distanceM);
  const groups = ['dietary', 'occasion', 'feature', 'service', 'payment'].map((g) => ({ g, items: r.attributes.filter((a) => a.group === g) })).filter((x) => x.items.length);
  const policies = [
    ['detail.dressCode', r.policies.dressCode],
    ['detail.agePolicy', r.policies.agePolicy],
    ['detail.alcoholPolicy', r.policies.alcoholPolicy],
    ['detail.parking', r.parkingInfo],
    ['detail.wait', r.avgWaitMins != null ? t('detail.waitMins', { n: r.avgWaitMins }) : null],
    ['detail.bestTime', r.bestTimeToVisit],
    ['detail.allergens', r.allergenNotes],
  ].filter(([, v]) => v) as [MessageKey, string][];
  const webBase = config.brand.webDomain ? `https://${config.brand.webDomain}` : WEB_URL;

  const directions = () => {
    track('action_directions', r.id);
    Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`);
  };
  const call = () => {
    track('action_call', r.id);
    Linking.openURL(`tel:+91${r.phone}`);
  };
  const whatsapp = () => {
    track('action_call', r.id, { via: 'whatsapp' });
    Linking.openURL(`https://wa.me/91${r.whatsapp}`);
  };
  const book = () => {
    track('action_book', r.id);
    if (r.bookingUrl) WebBrowser.openBrowserAsync(r.bookingUrl);
    else Linking.openURL(`tel:+91${r.phone}`);
  };
  const share = async () => {
    track('action_share', r.id);
    const url = `${webBase}${restaurantHref(r)}`;
    await Share.share({ message: `${nm(r, lang)} — ${url}`, url }).catch(() => {});
  };
  async function toggleSave() {
    if (!me) return router.push({ pathname: '/login', params: { intro: t('card.signInToSave') } });
    try {
      const saved = await toggleSaved(r!.id);
      setLists(saved ? inLists : []);
      setFlash(saved ? t('detail.savedFlash') : t('detail.unsavedFlash'));
    } catch {
      /* rolled back in session */
    }
  }
  const write = () => router.push({ pathname: '/review', params: { id: r.id, name: nm(r, lang) } });
  const openTab = (k: Tab) => {
    setTab(k);
    track('detail_tab_view', r.id, { tab: k });
  };
  const hero = photoUrls.length ? photoUrls.slice(0, 8) : [null];
  const heroHeight = 230;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title: nm(r, lang) }} />
      <ScrollView stickyHeaderIndices={[3]} contentContainerStyle={{ paddingBottom: 48 }}>
        {/* 0: hero gallery */}
        <View>
          <FlatList
            data={hero}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(u, i) => `${u}${i}`}
            onMomentumScrollEnd={(e) => setHeroIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item, index }) => (
              <Pressable onPress={() => photoUrls.length && setLightbox({ urls: photoUrls, i: index })}>
                <Cover url={item} seed={r.slug} cuisine={r.cuisines[0]?.slug} size="lg" style={{ width, height: heroHeight }} rounded={0} />
              </Pressable>
            )}
          />
          {r.photoCount > 0 ? (
            <View style={styles.photoCount} pointerEvents="none">
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                📷 {heroIndex + 1}/{Math.min(r.photoCount, hero.length)}
                {r.photoCount > hero.length ? ` · ${t('detail.photoCount', { n: r.photoCount })}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 1: header — the decision on the first screen (spec 4.1) */}
        <View style={{ padding: 16, gap: 6 }}>
          <Row style={{ alignItems: 'flex-start' }} gap={12}>
            <View style={{ flex: 1 }}>
              <Txt v="h1">{nm(r, lang)}</Txt>
              {lang === 'en' && r.nameHi ? <Txt muted>{r.nameHi}</Txt> : null}
            </View>
            <Pressable onPress={() => openTab('reviews')} style={{ alignItems: 'center' }} accessibilityRole="button">
              <RatingBadge rating={r.rating} size="lg" />
              <Txt v="tiny" muted style={{ marginTop: 2 }}>
                {tp('reviews', r.reviewCount)}
              </Txt>
            </Pressable>
          </Row>
          <Txt muted>{r.cuisines.map((c) => nm(c, lang)).join(', ')}</Txt>
          <Txt v="small" muted>
            {[nm(r.type, lang), nm(r.locality, lang), r.address.city].filter(Boolean).join(' · ')}
            {dist ? ` · ${t('detail.away', { d: dist })}` : ''}
            {r.travel ? ` · ${t(r.travel.mode === 'walk' ? 'detail.walk' : 'detail.drive', { n: r.travel.minutes })}` : ''}
          </Txt>
          <Row style={{ flexWrap: 'wrap' }} gap={8}>
            <OpenBadge status={r.openStatus} />
            {r.todayHours.windows.length > 0 ? (
              <Txt v="small" muted>
                {t('detail.today')}: {r.todayHours.windows.map((w) => shiftLabel(w, t)).join(', ')}
                {r.todayHours.isSpecial && r.todayHours.note ? ` (${r.todayHours.note})` : ''}
              </Txt>
            ) : null}
          </Row>
          <Row style={{ flexWrap: 'wrap' }} gap={8}>
            {r.costForTwo > 0 ? (
              <Txt v="small" muted>
                {t('detail.costForTwo', { cost: rupees(r.costForTwo) })} · {priceBand(r.priceBand)}
              </Txt>
            ) : null}
            {r.isVerified ? <Badge label={`✔ ${t('detail.verified')}`} color={C.info} bg="#eff6ff" /> : r.isClaimed ? <Badge label={t('detail.claimed')} /> : <Badge label={t('detail.unclaimed')} />}
          </Row>
        </View>

        {/* 2: action bar (spec 4.1) and offers */}
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            <ActionButton icon="🧭" label={t('detail.directions')} onPress={directions} />
            {r.phone ? <ActionButton icon="📞" label={t('detail.call')} onPress={call} /> : null}
            {r.whatsapp ? <ActionButton icon="💬" label="WhatsApp" onPress={whatsapp} /> : null}
            {(r.bookingUrl || r.attributes.some((a) => a.key === 'table_reservation')) && (r.bookingUrl || r.phone) ? <ActionButton primary icon="📅" label={t('detail.book')} onPress={book} /> : null}
            <ActionButton icon={isSaved ? '♥' : '♡'} label={isSaved ? t('detail.saved') : t('detail.save')} onPress={toggleSave} />
            {me ? <ActionButton icon="＋" label={t('lists.list')} onPress={() => setChoosing(true)} /> : null}
            <ActionButton icon="↗" label={t('detail.share')} onPress={share} />
            <ActionButton icon="✍️" label={t('detail.review')} onPress={write} />
          </ScrollView>
          {r.offers.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
              {r.offers.map((o) => (
                <View key={o.id} style={styles.offer}>
                  <Txt v="small" bold color="#1e3a8a">
                    🏷️ {o.title}
                  </Txt>
                  {o.terms || o.validFromTime ? (
                    <Txt v="tiny" color="#1e40af">
                      {o.validFromTime && o.validToTime ? `${shiftLabel({ opensAt: o.validFromTime, closesAt: o.validToTime })}. ` : ''}
                      {o.terms}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>

        {/* 3: sticky tabs (the sticky wrapper replaces the child's style, so the row lives one level down) */}
        <View>
          <View style={styles.tabs}>
          {(
            [
              ['overview', t('detail.tab.overview')],
              ['menu', `${t('detail.tab.menu')}${r.menuItemCount ? ` (${r.menuItemCount})` : ''}`],
              ['reviews', `${t('detail.tab.reviews')} (${r.reviewCount})`],
              ['photos', `${t('detail.tab.photos')} (${r.photoCount})`],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <Pressable key={k} onPress={() => openTab(k)} style={[styles.tab, tab === k && { borderBottomColor: brand }]} accessibilityRole="tab" accessibilityState={{ selected: tab === k }}>
              <Text style={[styles.tabText, tab === k && { color: brand, fontWeight: '600' }]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          ))}
          </View>
        </View>

        {/* 4: tab content */}
        <View style={{ padding: 16, gap: 24 }}>
          {tab === 'overview' ? (
            <>
              {r.highlights.knownFor.length || r.highlights.mustTry.length || r.highlights.greatFor.length ? (
                <View style={{ gap: 8 }}>
                  {(
                    [
                      ['detail.knownFor', r.highlights.knownFor, '#fffbeb', '#78350f'],
                      ['detail.mustTry', r.highlights.mustTry, '#fff1f2', '#881337'],
                      ['detail.greatFor', r.highlights.greatFor, '#ecfdf5', '#064e3b'],
                    ] as const
                  )
                    .filter(([, v]) => v.length)
                    .map(([k, v, bg, fg]) => (
                      <View key={k} style={{ backgroundColor: bg, borderRadius: 12, padding: 12 }}>
                        <Txt v="tiny" bold color={fg} style={{ opacity: 0.8 }}>
                          {t(k).toUpperCase()}
                        </Txt>
                        <Txt v="small" bold color={fg} style={{ marginTop: 2 }}>
                          {v.join(', ')}
                        </Txt>
                      </View>
                    ))}
                </View>
              ) : null}
              {r.description ? (
                <Section title={t('detail.about')}>
                  <Txt v="small">{r.description}</Txt>
                </Section>
              ) : null}
              <Section title={t('detail.hours')}>
                <Card style={{ gap: 4 }}>
                  {r.hours.length === 0 ? (
                    <Txt v="small" muted>
                      {t('detail.hoursUnknown')}
                    </Txt>
                  ) : (
                    byDay.map((shifts, d) => (
                      <Row key={d} style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Txt v="small" bold={d === today}>
                          {t(DAY_LONG_KEYS[d])}
                        </Txt>
                        <View style={{ alignItems: 'flex-end' }}>
                          {shifts.length ? (
                            shifts.map((s, i) => (
                              <Txt key={i} v="small" bold={d === today}>
                                {shiftLabel(s, t)}
                              </Txt>
                            ))
                          ) : (
                            <Txt v="small" color={C.bad}>
                              {t('open.closed')}
                            </Txt>
                          )}
                        </View>
                      </Row>
                    ))
                  )}
                  {r.specialHours.length > 0 ? (
                    <View style={{ marginTop: 8, gap: 2 }}>
                      <Divider style={{ marginBottom: 6 }} />
                      <Txt v="tiny" bold muted>
                        {t('detail.specialHours').toUpperCase()}
                      </Txt>
                      {r.specialHours.map((s) => (
                        <Row key={s.date} style={{ justifyContent: 'space-between' }}>
                          <Txt v="small">{dayDate(s.date, lang)}</Txt>
                          <Txt v="small" color={s.isClosed ? C.bad : C.text}>
                            {s.isClosed ? t('open.closed') : shiftLabel({ opensAt: s.opensAt!, closesAt: s.closesAt! }, t)}
                            {s.note ? ` (${s.note})` : ''}
                          </Txt>
                        </Row>
                      ))}
                    </View>
                  ) : null}
                  {r.hoursConfirmedAt ? (
                    <Txt v="tiny" muted style={{ marginTop: 6 }}>
                      {t('detail.hoursConfirmed', { when: ago(r.hoursConfirmedAt, t) })}
                    </Txt>
                  ) : null}
                </Card>
              </Section>
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <Map style={{ height: 170 }} center={r} zoom={16} brand={brand} pins={[{ id: r.id, lat: r.lat, lng: r.lng, label: r.name, tone: 'brand' }]} />
                <View style={{ padding: 14, gap: 2 }}>
                  <Txt v="small">{r.address.line}</Txt>
                  {r.address.landmark ? (
                    <Txt v="small" muted>
                      {t('detail.near', { place: r.address.landmark })}
                    </Txt>
                  ) : null}
                  <Txt v="small" muted>
                    {r.address.city}
                    {r.address.pincode ? ` – ${r.address.pincode}` : ''}
                  </Txt>
                  <Pressable onPress={directions} style={{ paddingTop: 6 }}>
                    <Txt v="small" bold color={brand}>
                      {t('detail.getDirections')}
                    </Txt>
                  </Pressable>
                </View>
              </Card>
              {groups.length > 0 ? (
                <Section title={t('detail.goodToKnow')}>
                  {groups.map(({ g, items }) => (
                    <View key={g} style={{ gap: 4 }}>
                      <Txt v="tiny" bold muted>
                        {t(`filters.group.${g}` as MessageKey).toUpperCase()}
                      </Txt>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 4 }}>
                        {items.map((a) => (
                          <Txt key={a.key} v="small" style={{ width: '50%' }}>
                            {a.icon ?? '✓'} {nm(a, lang)}
                          </Txt>
                        ))}
                      </View>
                    </View>
                  ))}
                </Section>
              ) : null}
              {policies.length > 0 ? (
                <Section title={t('detail.policies')}>
                  {policies.map(([k, v]) => (
                    <Txt key={k} v="small">
                      <Text style={{ color: C.muted }}>{t(k)}: </Text>
                      {v}
                    </Txt>
                  ))}
                </Section>
              ) : null}
              <Row gap={12}>
                <Card style={{ flex: 1, gap: 2 }} onPress={() => openTab('menu')}>
                  <Txt bold>{t('detail.tab.menu')} →</Txt>
                  <Txt v="tiny" muted>
                    {r.menuItemCount ? t('detail.dishes', { n: r.menuItemCount }) : t('menu.emptyTitle')}
                    {r.menuUpdatedAt ? ` · ${t('detail.updated', { when: ago(r.menuUpdatedAt, t) })}` : ''}
                  </Txt>
                </Card>
                <Card style={{ flex: 1, gap: 2 }} onPress={write}>
                  <Txt bold>✍️ {t('detail.rate')}</Txt>
                  <Txt v="tiny" muted>
                    {t('detail.rateBody')}
                  </Txt>
                </Card>
              </Row>
              {r.phone || r.website || Object.keys(r.socialLinks).length ? (
                <Card style={{ gap: 6 }}>
                  {r.phone ? (
                    <Pressable onPress={call}>
                      <Txt v="small" bold color={brand}>
                        📞 +91 {r.phone}
                      </Txt>
                    </Pressable>
                  ) : null}
                  {r.website ? (
                    <Pressable onPress={() => WebBrowser.openBrowserAsync(r.website!)}>
                      <Txt v="small" color={brand} numberOfLines={1}>
                        🌐 {r.website.replace(/^https?:\/\//, '')}
                      </Txt>
                    </Pressable>
                  ) : null}
                  {Object.entries(r.socialLinks).map(([k, v]) => (
                    <Pressable key={k} onPress={() => Linking.openURL(v)}>
                      <Txt v="small" color={brand} style={{ textTransform: 'capitalize' }}>
                        {k === 'instagram' ? '📸' : k === 'youtube' ? '▶️' : '👍'} {k}
                      </Txt>
                    </Pressable>
                  ))}
                </Card>
              ) : null}
              {r.fssaiNumber || r.lastInspectionOn ? (
                <View>
                  {r.fssaiNumber ? (
                    <Txt v="tiny" muted>
                      🛡️ {t('detail.fssai', { n: r.fssaiNumber })}
                    </Txt>
                  ) : null}
                  {r.lastInspectionOn ? (
                    <Txt v="tiny" muted>
                      {t('detail.inspected', { date: shortDate(r.lastInspectionOn) })}
                    </Txt>
                  ) : null}
                </View>
              ) : null}
              <Row gap={16} style={{ flexWrap: 'wrap' }}>
                <Pressable onPress={() => setReport({ type: 'restaurant', id: r.id })} hitSlop={6}>
                  <Txt v="small" muted style={{ textDecorationLine: 'underline' }}>
                    {t('detail.reportInfo')}
                  </Txt>
                </Pressable>
                {!r.isClaimed ? (
                  <Pressable onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/partner/claim?id=${r.id}&name=${encodeURIComponent(r.name)}`)} hitSlop={6}>
                    <Txt v="small" color={brand} style={{ textDecorationLine: 'underline' }}>
                      {t('detail.claim')}
                    </Txt>
                  </Pressable>
                ) : null}
              </Row>
            </>
          ) : null}
          {tab === 'menu' ? <Menu restaurantId={r.id} onPhoto={(urls, i) => setLightbox({ urls, i })} /> : null}
          {tab === 'reviews' ? <Reviews restaurant={r} version={reviewVersion} onWrite={write} onReport={(id) => setReport({ type: 'review', id })} onPhoto={(urls, i) => setLightbox({ urls, i })} /> : null}
          {tab === 'photos' ? <PhotosTab restaurantId={r.id} onOpen={(urls, i) => setLightbox({ urls, i })} onReport={(id) => setReport({ type: 'photo', id })} /> : null}
        </View>

        {/* 5: similar places */}
        {r.similar.length > 0 ? (
          <View style={{ gap: 10, paddingTop: 8 }}>
            <Txt v="h3" style={{ paddingHorizontal: 16 }}>
              {t('detail.similar')}
            </Txt>
            <FlatList
              horizontal
              data={r.similar}
              keyExtractor={(s) => s.id}
              renderItem={({ item, index }) => <RestaurantCard r={item} compact position={index} from="similar" />}
              contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}
              showsHorizontalScrollIndicator={false}
            />
          </View>
        ) : null}
      </ScrollView>
      <ReportSheet target={report} onClose={() => setReport(null)} />
      {me && choosing ? <SaveToList open={choosing} onClose={() => setChoosing(false)} restaurantId={r.id} initial={inLists} onChange={setLists} /> : null}
      {lightbox ? <Lightbox urls={lightbox.urls} index={lightbox.i} onClose={() => setLightbox(null)} /> : null}
      {flash}
    </View>
  );
}

const styles = StyleSheet.create({
  photoCount: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  action: { alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 74, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
  actionText: { fontSize: 12, fontWeight: '500', color: C.text },
  offer: { backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 280 },
  tabs: { flexDirection: 'row', backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 13, color: C.muted },
});
