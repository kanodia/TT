import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { nm } from '@shared/format';
import type { Card, Listing } from '@shared/types';
import { Header, SearchButton } from '@/components/Header';
import { CardSkeleton, RestaurantCard } from '@/components/RestaurantCard';
import { Button, C, Card as Box, Empty, ErrorNote, Loading, Txt } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/env';
import { filterParams } from '@/lib/filters';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Home = {
  nearbyCount: number;
  cityId: string | null;
  chips: { key: string; label: string; labelHi: string; filter: string }[];
  cuisines: { slug: string; name: string; nameHi: string | null; icon: string | null; count: number }[];
  collections: { key: string; slug?: string; title: string; titleHi: string; description?: string | null; filter: string | null; items: Card[] }[];
};

export default function HomeScreen() {
  const { place, lang, config, t, tp } = useSession();
  const brand = useBrand();
  const home = useApi<Home>('/v1/home', { lat: place.lat, lng: place.lng });
  const query = { lat: place.lat, lng: place.lng, sort: 'relevance', radius_km: 25, limit: 12 };
  const first = useApi<Listing>('/v1/restaurants', query);
  const key = `${place.lat},${place.lng}`;
  const [more, setMore] = useState<{ key: string; items: Card[]; next: string | null }>({ key: '', items: [], next: null });
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const extra = more.key === key ? more : null;
  const next = extra ? extra.next : first.data?.nextCursor;
  const items = [...(first.data?.data ?? []), ...(extra?.items ?? [])];
  const data = home.data;

  const loadMore = useCallback(async () => {
    if (!next || busy) return;
    setBusy(true);
    setMoreError(null);
    try {
      const r = await api<Listing>('/v1/restaurants', { query: { ...query, cursor: next } });
      setMore({ key, items: [...(extra?.items ?? []), ...r.data], next: r.nextCursor });
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, busy, key]);

  const refresh = () => {
    home.refresh();
    first.refresh();
    setMore({ key: '', items: [], next: null });
  };

  const header = (
    <View style={{ gap: 20, paddingBottom: 12 }}>
      <View style={{ gap: 12 }}>
        <SearchButton />
        <View style={[styles.hero, { backgroundColor: brand }]}>
          <Txt v="h2" color="#fff">
            {lang === 'hi' ? config.brand.taglineHi : config.brand.tagline}
          </Txt>
          <Txt v="small" color="rgba(255,255,255,0.9)" style={{ marginTop: 4 }}>
            {t('home.subtitle', { place: place.label })}
          </Txt>
          {data && data.chips.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 14 }}>
              {data.chips.map((c) => (
                <Pressable key={c.key} onPress={() => router.push({ pathname: '/restaurants', params: filterParams(c.filter) })} style={styles.heroChip}>
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '500' }}>{lang === 'hi' ? c.labelHi : c.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>

      {home.error ? <ErrorNote message={home.error} onRetry={home.reload} style={{ marginHorizontal: 16 }} /> : null}

      {data && data.nearbyCount === 0 ? (
        <Empty title={t('home.notHereTitle', { place: place.label })} icon="🗺️" action={<Button title={t('home.pickTown')} onPress={() => router.push('/location')} />}>
          {t('home.notHereBody')}
        </Empty>
      ) : null}

      {data && data.cuisines.length > 0 ? (
        <View>
          <Txt v="h3" style={styles.sectionTitle}>
            {t('home.mood')}
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}>
            {data.cuisines.map((c) => (
              <Pressable key={c.slug} onPress={() => router.push({ pathname: '/restaurants', params: { cuisines: c.slug } })} style={{ width: 72, alignItems: 'center', gap: 4 }}>
                <View style={styles.cuisine}>
                  <Text style={{ fontSize: 30 }}>{c.icon ?? '🍽️'}</Text>
                </View>
                <Txt v="tiny" bold numberOfLines={2} style={{ textAlign: 'center' }}>
                  {nm(c, lang)}
                </Txt>
                <Txt v="tiny" muted>
                  {tp('places', c.count)}
                </Txt>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

      {home.loading ? <Loading /> : null}

      {data?.collections.map((col) => (
        <View key={col.key}>
          <View style={[styles.sectionHead]}>
            <View style={{ flex: 1 }}>
              <Txt v="h3">{lang === 'hi' ? col.titleHi : col.title}</Txt>
              {col.description ? (
                <Txt v="small" muted numberOfLines={2}>
                  {col.description}
                </Txt>
              ) : null}
            </View>
            <Pressable
              hitSlop={8}
              onPress={() => (col.slug ? router.push({ pathname: '/c/[slug]', params: { slug: col.slug } }) : router.push({ pathname: '/restaurants', params: filterParams(col.filter) }))}
            >
              <Txt v="small" bold color={brand}>
                {t('action.seeAll')}
              </Txt>
            </Pressable>
          </View>
          <FlatList
            horizontal
            data={col.items}
            keyExtractor={(r) => r.id}
            renderItem={({ item, index }) => <RestaurantCard r={item} compact position={index} from={col.key} />}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 14, paddingHorizontal: 16 }}
          />
        </View>
      ))}

      {data && data.nearbyCount > 0 ? (
        <View style={styles.sectionHead}>
          <Txt v="h3" style={{ flex: 1 }}>
            {tp('home.nearby', data.nearbyCount)}
          </Txt>
          <Pressable hitSlop={8} onPress={() => router.push({ pathname: '/restaurants', params: { view: 'map' } })}>
            <Txt v="small" bold color={brand}>
              🗺️ {t('home.mapView')}
            </Txt>
          </Pressable>
        </View>
      ) : null}
      {first.loading ? (
        <View style={{ paddingHorizontal: 16, gap: 24 }}>
          <CardSkeleton />
          <CardSkeleton />
        </View>
      ) : null}
      {first.error ? <ErrorNote message={first.error} onRetry={first.reload} style={{ marginHorizontal: 16 }} /> : null}
    </View>
  );

  const footer = (
    <View style={{ padding: 16, gap: 16, paddingBottom: 32 }}>
      <ErrorNote message={moreError} onRetry={loadMore} />
      {busy ? <Loading /> : null}
      <Box style={{ gap: 10 }}>
        <Txt v="h3">{t('home.ownerTitle')}</Txt>
        <Txt v="small" muted>
          {t('home.ownerBody')}
        </Txt>
        <Button title={t('home.ownerCta')} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/partner`)} />
      </Box>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Header />
      <FlatList
        data={data && data.nearbyCount > 0 ? items : []}
        keyExtractor={(r) => r.id}
        renderItem={({ item, index }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <RestaurantCard r={item} position={index} from="nearby" />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 24 }} />}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        onEndReached={loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={<RefreshControl refreshing={home.refreshing} onRefresh={refresh} tintColor={brand} colors={[brand]} />}
        initialNumToRender={4}
        windowSize={7}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { marginHorizontal: 16, borderRadius: 16, padding: 18 },
  heroChip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  cuisine: { width: 62, height: 62, borderRadius: 31, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { paddingHorizontal: 16, marginBottom: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 16, marginBottom: 10 },
});
