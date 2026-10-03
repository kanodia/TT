import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nm, restaurantHref } from '@shared/format';
import type { Card, Cuisine } from '@shared/types';
import { C, Chip, Cover, RatingBadge, Txt } from '@/components/ui';
import { api, track } from '@/lib/api';
import { useSession } from '@/lib/session';

type Suggest = {
  restaurants: Card[];
  cuisines: Cuisine[];
  dishes: { name: string; restaurants: { id: string; slug: string; name: string }[] }[];
  corrected?: string | null;
};

type Row =
  | { kind: 'cuisine'; c: Cuisine }
  | { kind: 'dish'; name: string; count: number }
  | { kind: 'restaurant'; r: Card };

/** Typeahead over restaurants, cuisines and dishes, with recent and trending searches (spec 3.1). */
export default function SearchScreen() {
  const { place, lang, t, recentSearches, rememberSearch } = useSession();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [s, setS] = useState<{ q: string; data: Suggest } | null>(null);
  const [trending, setTrending] = useState<string[]>([]);
  const needle = q.trim();

  useEffect(() => {
    api<{ data: string[] }>('/v1/search/trending')
      .then((r) => setTrending(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (needle.length < 2) return;
    const timer = setTimeout(() => {
      api<Suggest>('/v1/search', { query: { q: needle, lat: place.lat, lng: place.lng } })
        .then((data) => setS({ q: needle, data }))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [needle, place.lat, place.lng]);

  const searchAll = (term: string) => {
    rememberSearch(term);
    router.push({ pathname: '/restaurants', params: { q: term } });
  };

  const typing = needle.length >= 2;
  const data = typing && s ? s.data : null;
  const rows: Row[] = data
    ? [
        ...data.cuisines.map((c) => ({ kind: 'cuisine' as const, c })),
        ...data.dishes.map((d) => ({ kind: 'dish' as const, name: d.name, count: d.restaurants.length })),
        ...data.restaurants.map((r) => ({ kind: 'restaurant' as const, r })),
      ]
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8 }}>
      <View style={styles.box}>
        <Ionicons name="search" size={18} color={C.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder={t('nav.search')}
          placeholderTextColor={C.faint}
          style={{ flex: 1, fontSize: 16, color: C.text, paddingVertical: 10 }}
          returnKeyType="search"
          onSubmitEditing={() => needle && searchAll(needle)}
          autoCorrect={false}
          accessibilityLabel={t('nav.search')}
        />
        {q ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel={t('action.close')}>
            <Ionicons name="close-circle" size={18} color={C.faint} />
          </Pressable>
        ) : null}
      </View>

      {!typing ? (
        <View style={{ padding: 16, gap: 20 }}>
          {recentSearches.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Txt v="small" bold muted>
                {t('search.recent')}
              </Txt>
              <View style={styles.wrap}>
                {recentSearches.map((r) => (
                  <Chip key={r} label={`🕘 ${r}`} onPress={() => searchAll(r)} />
                ))}
              </View>
            </View>
          ) : null}
          {trending.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Txt v="small" bold muted>
                {t('search.trending')}
              </Txt>
              <View style={styles.wrap}>
                {trending.map((r) => (
                  <Chip key={r} label={`📈 ${r}`} onPress={() => searchAll(r)} />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={rows}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(row, i) => `${row.kind}-${i}`}
          ListHeaderComponent={
            data ? (
              <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
                {data.corrected ? (
                  <Txt v="tiny" muted>
                    {t('search.didYouMean', { q: data.corrected })}
                  </Txt>
                ) : null}
                {!rows.length ? <Txt muted style={{ paddingVertical: 12 }}>{t('search.noMatch', { q: needle })}</Txt> : null}
              </View>
            ) : null
          }
          ListFooterComponent={
            <Pressable style={styles.row} onPress={() => searchAll(needle)}>
              <View style={styles.iconCircle}>
                <Ionicons name="search" size={18} color={C.text} />
              </View>
              <Txt bold>{t('search.seeAll', { q: needle })}</Txt>
            </Pressable>
          }
          renderItem={({ item }) => {
            if (item.kind === 'cuisine') {
              return (
                <Pressable
                  style={styles.row}
                  onPress={() => {
                    rememberSearch(needle);
                    router.push({ pathname: '/restaurants', params: { cuisines: item.c.slug } });
                  }}
                >
                  <View style={styles.iconCircle}>
                    <Text style={{ fontSize: 18 }}>{item.c.icon ?? '🍽️'}</Text>
                  </View>
                  <View>
                    <Txt bold>{nm(item.c, lang)}</Txt>
                    <Txt v="tiny" muted>
                      {t('search.cuisine')}
                    </Txt>
                  </View>
                </Pressable>
              );
            }
            if (item.kind === 'dish') {
              return (
                <Pressable style={styles.row} onPress={() => searchAll(item.name)}>
                  <View style={styles.iconCircle}>
                    <Text style={{ fontSize: 18 }}>🥘</Text>
                  </View>
                  <View>
                    <Txt bold>{item.name}</Txt>
                    <Txt v="tiny" muted>
                      {t('search.dish', { count: item.count })}
                    </Txt>
                  </View>
                </Pressable>
              );
            }
            const r = item.r;
            return (
              <Pressable
                style={styles.row}
                onPress={() => {
                  track('card_tap', r.id, { from: 'typeahead' });
                  rememberSearch(needle);
                  router.push(restaurantHref(r) as never);
                }}
              >
                <Cover url={r.photos[0]} seed={r.slug} cuisine={r.cuisines[0]?.slug} size="sm" style={{ width: 40, height: 40 }} rounded={8} />
                <View style={{ flex: 1 }}>
                  <Txt bold numberOfLines={1}>
                    {nm(r, lang)}
                  </Txt>
                  <Txt v="tiny" muted numberOfLines={1}>
                    {[r.cuisines.map((c) => nm(c, lang)).join(', '), nm(r.locality, lang)].filter(Boolean).join(' · ')}
                  </Txt>
                </View>
                <RatingBadge rating={r.rating} />
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
});
