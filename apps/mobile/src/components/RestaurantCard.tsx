import { router } from 'expo-router';
import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { distance, nm, priceBand, restaurantHref, rupees } from '@shared/format';
import type { Card } from '@shared/types';
import { track } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';
import { C, Cover, OpenBadge, RatingBadge, Txt } from './ui';

/** Heart on cards and the detail page; asks to sign in first (spec 2.3 "Save (heart)"). */
export function Heart({ restaurantId, style }: { restaurantId: string; style?: object }) {
  const { me, savedIds, toggleSaved, t } = useSession();
  const brand = useBrand();
  const saved = savedIds.has(restaurantId);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? t('card.unsave') : t('card.save')}
      hitSlop={8}
      onPress={() => {
        if (!me) return router.push({ pathname: '/login', params: { intro: t('card.signInToSave') } });
        toggleSaved(restaurantId).catch(() => {});
      }}
      style={[styles.heart, style]}
    >
      <Text style={{ fontSize: 18, color: saved ? brand : '#4b5563' }}>{saved ? '♥' : '♡'}</Text>
    </Pressable>
  );
}

/** Swipeable cover photos (up to 3, spec 2.3) with page dots. */
function Photos({ r, width, height }: { r: Card; width: number; height: number }) {
  const [i, setI] = useState(0);
  const photos = r.photos.length ? r.photos.slice(0, 3) : [null];
  if (photos.length === 1) return <Cover url={photos[0]} seed={r.slug} cuisine={r.cuisines[0]?.slug} style={{ width, height }} />;
  return (
    <View style={{ width, height, borderRadius: 12, overflow: 'hidden' }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / width))}>
        {photos.map((p, k) => (
          <Cover key={k} url={p} seed={`${r.slug}${k}`} cuisine={r.cuisines[0]?.slug} style={{ width, height }} rounded={0} />
        ))}
      </ScrollView>
      <View style={styles.dots} pointerEvents="none">
        {photos.map((_, k) => (
          <View key={k} style={[styles.dot, k === i && { width: 14, backgroundColor: '#fff' }]} />
        ))}
      </View>
    </View>
  );
}

function RestaurantCardBase({ r, compact, position, from }: { r: Card; compact?: boolean; position?: number; from?: string }) {
  const { lang, t } = useSession();
  const { width: screen } = useWindowDimensions();
  const width = compact ? 260 : screen - 32;
  const dist = distance(r.distanceM);
  // Max 3 cuisines, then "+N" (spec 2.3).
  const cuisines = r.cuisines.slice(0, 3).map((c) => nm(c, lang)).join(', ') + (r.cuisines.length > 3 ? ` +${r.cuisines.length - 3}` : '');
  const open = () => {
    track('card_tap', r.id, { position, promoted: r.isPromoted, from });
    router.push(restaurantHref(r) as never);
  };
  return (
    <Pressable onPress={open} style={{ width }} accessibilityRole="button" accessibilityLabel={`${nm(r, lang)}, ${r.rating ? `${r.rating.toFixed(1)} stars` : t('rating.new')}`}>
      <View>
        <Photos r={r} width={width} height={compact ? 140 : 190} />
        {r.offer ? (
          <View style={styles.offer} pointerEvents="none">
            <Text style={styles.offerText} numberOfLines={1}>
              🏷️ {r.offer.title}
            </Text>
          </View>
        ) : null}
        {r.isPromoted ? (
          <View style={styles.promoted}>
            <Text style={{ color: '#fff', fontSize: 10 }}>{t('card.promoted')}</Text>
          </View>
        ) : null}
        <Heart restaurantId={r.id} style={{ position: 'absolute', top: 8, right: 8 }} />
      </View>
      <View style={{ marginTop: 8, gap: 2 }}>
        <View style={styles.row}>
          <Txt v="body" bold numberOfLines={1} style={{ flex: 1 }}>
            {nm(r, lang)}
            {r.isVerified ? <Text style={{ color: C.info, fontSize: 12 }}> ✔</Text> : null}
          </Txt>
          <RatingBadge rating={r.rating} />
        </View>
        <View style={styles.row}>
          <Txt v="small" muted numberOfLines={1} style={{ flex: 1 }}>
            {cuisines || nm(r.type, lang)}
          </Txt>
          {r.costForTwo > 0 ? (
            <Txt v="small" muted>
              {t('card.forTwo', { cost: rupees(r.costForTwo) })}
            </Txt>
          ) : null}
        </View>
        <View style={styles.row}>
          <OpenBadge status={r.openStatus} style={{ flex: 1, fontSize: 12 }} />
          <Txt v="tiny" muted numberOfLines={1}>
            {[nm(r.locality, lang), dist].filter(Boolean).join(' · ')}
          </Txt>
        </View>
        {r.tags.length > 0 && !compact ? (
          <View style={[styles.row, { justifyContent: 'flex-start', gap: 6, marginTop: 2 }]}>
            {r.tags.map((tag) => (
              <View key={tag.key} style={styles.tag}>
                <Text style={{ fontSize: 11, color: C.muted }}>{nm(tag, lang)}</Text>
              </View>
            ))}
            <Txt v="tiny" muted style={{ marginLeft: 'auto' }}>
              {priceBand(r.priceBand)}
            </Txt>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export const RestaurantCard = memo(RestaurantCardBase);

export function CardSkeleton({ compact }: { compact?: boolean }) {
  return (
    <View style={{ width: compact ? 260 : undefined, gap: 6 }}>
      <View style={{ height: compact ? 140 : 190, borderRadius: 12, backgroundColor: C.surface }} />
      <View style={{ height: 14, width: '60%', borderRadius: 4, backgroundColor: C.surface }} />
      <View style={{ height: 12, width: '40%', borderRadius: 4, backgroundColor: C.surface }} />
    </View>
  );
}

const styles = StyleSheet.create({
  heart: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  dot: { height: 6, width: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.6)' },
  offer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 10, paddingTop: 16, paddingBottom: 8, backgroundColor: 'rgba(30,58,138,0.85)', borderBottomLeftRadius: 12, borderBottomRightRadius: 12 },
  offerText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  promoted: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tag: { backgroundColor: C.surface, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
});
