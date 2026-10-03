import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { nm, restaurantHref, rupees } from '@shared/format';
import type { Card, Filters, Listing } from '@shared/types';
import { Map } from '@/components/Map';
import { CardSkeleton, RestaurantCard } from '@/components/RestaurantCard';
import { Button, C, Chip, Empty, ErrorNote, Field, Loading, Row, Sheet, Txt } from '@/components/ui';
import { api, errorMessage, track } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

const SORTS = ['relevance', 'distance', 'rating', 'popularity', 'cost_asc', 'cost_desc'] as const;
const COST_BANDS = [
  { key: 'u300', min: '', max: '300' },
  { key: '300_600', min: '300', max: '600' },
  { key: '600_1200', min: '600', max: '1200' },
  { key: '1200p', min: '1200', max: '' },
];
const DISTANCES = ['1', '3', '5', '10'];
const LIST_KEYS = ['cuisines', 'types', 'attributes'] as const;
const FLAGS = ['open_now', 'open_late', 'open_24h', 'has_offers', 'is_new'] as const;
const FILTER_KEYS = [...FLAGS, 'rating_min', 'cost_min', 'cost_max', 'radius_km', ...LIST_KEYS] as const;
const GROUPS = ['dietary', 'occasion', 'feature', 'service', 'payment'] as const;

type Params = Record<string, string | undefined>;

/** Route params are the filter state, so back/forward and shared links keep filters (same keys as the website). */
function useParamsState() {
  const params = useLocalSearchParams() as Params;
  const get = (k: string) => (typeof params[k] === 'string' ? (params[k] as string) : '');
  const list = (k: string) => get(k).split(',').filter(Boolean);
  function set(changes: Record<string, string | null>) {
    const next: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(changes)) next[k] = v || undefined;
    router.setParams(next);
    const applied = Object.keys(changes).filter((k) => k !== 'view');
    if (applied.length) track('filter_apply', null, { filters: applied });
  }
  function toggleIn(k: string, value: string) {
    const cur = list(k);
    set({ [k]: (cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]).join(',') || null });
  }
  return { get, list, set, toggleIn };
}

/** Mounted only while open, so the draft always starts from the current params. */
function FilterSheet({ onClose, filters, base }: { onClose: () => void; filters: Filters | undefined; base: Record<string, string | number> }) {
  const { get, set } = useParamsState();
  const { lang, t, tp } = useSession();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, get(k)])));
  const [count, setCount] = useState<number | null>(null);
  const [cuisineQ, setCuisineQ] = useState('');

  // Live result count while the diner edits (spec 3.2 "Show 142 places").
  useEffect(() => {
    const timer = setTimeout(() => {
      const query: Record<string, string | number> = { ...base, count_only: 1 };
      for (const k of FILTER_KEYS) if (draft[k]) query[k] = draft[k];
      api<Listing>('/v1/restaurants', { query })
        .then((r) => setCount(r.total))
        .catch(() => setCount(null));
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, JSON.stringify(base)]);

  const dl = (k: string) => (draft[k] ?? '').split(',').filter(Boolean);
  const toggle = (k: string, v: string) => {
    const cur = dl(k);
    setDraft({ ...draft, [k]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',') });
  };
  const withCount = (label: string, n?: number) => (n != null ? `${label} (${n})` : label);
  const section = (title: string, children: React.ReactNode) => (
    <View style={{ gap: 8 }}>
      <Txt v="small" bold>
        {title}
      </Txt>
      <View style={styles.wrap}>{children}</View>
    </View>
  );

  return (
    <Sheet open onClose={onClose} title={t('filters.title')}>
      {!filters ? (
        <Loading />
      ) : (
        <>
          {section(
            t('filters.availability'),
            FLAGS.map((k) => <Chip key={k} label={t(`filters.${k}` as MessageKey)} on={!!draft[k]} onPress={() => setDraft({ ...draft, [k]: draft[k] ? '' : '1' })} />),
          )}
          {section(
            t('filters.distance'),
            ['', ...DISTANCES].map((d) => (
              <Chip key={d} label={d ? t('filters.within', { km: d }) : t('filters.any')} on={(draft.radius_km ?? '') === d} onPress={() => setDraft({ ...draft, radius_km: d })} />
            )),
          )}
          {section(
            t('filters.rating'),
            ['', '3.5', '4', '4.5'].map((r) => <Chip key={r} label={r ? `${r}+ ★` : t('filters.any')} on={(draft.rating_min ?? '') === r} onPress={() => setDraft({ ...draft, rating_min: r })} />),
          )}
          {section(
            t('filters.cost'),
            COST_BANDS.map((b) => {
              const on = (draft.cost_min ?? '') === b.min && (draft.cost_max ?? '') === b.max;
              return <Chip key={b.key} label={t(`filters.cost.${b.key}` as MessageKey)} on={on} onPress={() => setDraft({ ...draft, cost_min: on ? '' : b.min, cost_max: on ? '' : b.max })} />;
            }),
          )}
          <View style={{ gap: 8 }}>
            <Txt v="small" bold>
              {t('filters.cuisines')}
            </Txt>
            <Field placeholder={t('filters.findCuisine')} value={cuisineQ} onChangeText={setCuisineQ} />
            <View style={styles.wrap}>
              {filters.cuisines
                .filter((c) => !cuisineQ || `${c.name} ${c.nameHi ?? ''}`.toLowerCase().includes(cuisineQ.toLowerCase()))
                .map((c) => (
                  <Chip key={c.slug} label={`${c.icon ?? ''} ${withCount(nm(c, lang), c.count)}`.trim()} on={dl('cuisines').includes(c.slug)} onPress={() => toggle('cuisines', c.slug)} />
                ))}
            </View>
          </View>
          {section(
            t('filters.types'),
            filters.types.map((ty) => <Chip key={ty.slug} label={withCount(nm(ty, lang), ty.count)} on={dl('types').includes(ty.slug)} onPress={() => toggle('types', ty.slug)} />),
          )}
          {GROUPS.map((g) => {
            const attrs = filters.attributes.filter((a) => a.group === g);
            if (!attrs.length) return null;
            return (
              <View key={g}>
                {section(
                  t(`filters.group.${g}` as MessageKey),
                  attrs.map((a) => (
                    <Chip key={a.key} label={`${a.icon ?? ''} ${withCount(nm(a, lang), a.count)}`.trim()} on={dl('attributes').includes(a.key)} onPress={() => toggle('attributes', a.key)} />
                  )),
                )}
              </View>
            );
          })}
          <Row style={{ paddingTop: 8 }}>
            <Button kind="ghost" title={t('filters.clearAll')} onPress={() => setDraft(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))} />
            <Button
              style={{ flex: 1 }}
              title={count == null ? t('filters.apply') : count === 0 ? t('filters.noneMatch') : tp('filters.show', count)}
              onPress={() => {
                set(Object.fromEntries(FILTER_KEYS.map((k) => [k, draft[k] || null])));
                onClose();
              }}
            />
          </Row>
        </>
      )}
    </Sheet>
  );
}

/** Search results and filtered listing, as a list or a map (spec 2.2, 3). */
export default function RestaurantsScreen() {
  const { place, lang, t, tp } = useSession();
  const brand = useBrand();
  const { get, list, set, toggleIn } = useParamsState();
  const filters = useApi<Filters>('/v1/filters', { city_id: place.cityId });
  const [sheet, setSheet] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const view = get('view') === 'map' ? 'map' : 'list';

  // Spec 3.2: a distance filter keeps its radius; otherwise search 40 km around the chosen place.
  const base: Record<string, string | number> = { lat: place.lat, lng: place.lng, radius_km: get('radius_km') || 40 };
  const query: Record<string, string | number> = { ...base, limit: view === 'map' ? 100 : 20 };
  for (const k of ['q', 'sort', ...FILTER_KEYS]) if (get(k) && k !== 'radius_km') query[k] = get(k);
  const first = useApi<Listing>('/v1/restaurants', query);
  const queryKey = JSON.stringify(query);
  const [more, setMore] = useState<{ key: string; items: Card[]; next: string | null }>({ key: '', items: [], next: null });
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const extra = more.key === queryKey ? more : null;
  const next = extra ? extra.next : first.data?.nextCursor;
  const items = [...(first.data?.data ?? first.stale?.data ?? []), ...(extra?.items ?? [])];

  async function loadMore() {
    if (!next || busy || first.loading) return;
    setBusy(true);
    try {
      const r = await api<Listing>('/v1/restaurants', { query: { ...query, cursor: next } });
      setMore({ key: queryKey, items: [...(extra?.items ?? []), ...r.data], next: r.nextCursor });
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const activeCount = FILTER_KEYS.reduce((n, k) => n + (LIST_KEYS.includes(k as never) ? list(k).length : get(k) ? 1 : 0), 0);
  const label = (arr: { slug?: string; key?: string; name: string; nameHi?: string | null }[] | undefined, id: string) => nm(arr?.find((x) => (x.slug ?? x.key) === id), lang) || id;
  const title = get('q')
    ? t('list.resultsFor', { q: get('q') })
    : list('cuisines').length === 1
      ? t('list.cuisineNear', { cuisine: label(filters.data?.cuisines, list('cuisines')[0]), place: place.label })
      : t('list.placesNear', { place: place.label });
  const sort = get('sort') || 'relevance';

  const bar = (
    <View style={{ backgroundColor: C.bg, paddingVertical: 10, gap: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        <Chip label={`⚙️ ${t('filters.title')}${activeCount ? ` (${activeCount})` : ''}`} on={!!activeCount} onPress={() => setSheet(true)} />
        <Chip label={`↕ ${t(`sort.${sort}` as MessageKey)}`} on={sort !== 'relevance'} onPress={() => setSortOpen(true)} />
        <Chip label={view === 'map' ? `☰ ${t('list.list')}` : `🗺️ ${t('list.map')}`} onPress={() => set({ view: view === 'map' ? null : 'map' })} />
        <Chip label={t('filters.open_now')} on={!!get('open_now')} onPress={() => set({ open_now: get('open_now') ? null : '1' })} />
        <Chip label={`🟢 ${t('list.pureVeg')}`} on={list('attributes').includes('pure_veg')} onPress={() => toggleIn('attributes', 'pure_veg')} />
        <Chip label={t('list.rating4')} on={get('rating_min') === '4'} onPress={() => set({ rating_min: get('rating_min') === '4' ? null : '4' })} />
        <Chip label={`📍 ${t('filters.within', { km: 3 })}`} on={get('radius_km') === '3'} onPress={() => set({ radius_km: get('radius_km') === '3' ? null : '3' })} />
        <Chip label={t('filters.has_offers')} on={!!get('has_offers')} onPress={() => set({ has_offers: get('has_offers') ? null : '1' })} />
      </ScrollView>
      {activeCount > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16, alignItems: 'center' }}>
          {LIST_KEYS.flatMap((k) =>
            list(k).map((id) => (
              <Chip key={`${k}-${id}`} on label={`${label(k === 'cuisines' ? filters.data?.cuisines : k === 'types' ? filters.data?.types : filters.data?.attributes, id)} ×`} onPress={() => toggleIn(k, id)} />
            )),
          )}
          {FLAGS.filter((k) => get(k)).map((k) => (
            <Chip key={k} on label={`${t(`filters.${k}` as MessageKey)} ×`} onPress={() => set({ [k]: null })} />
          ))}
          {get('radius_km') ? <Chip on label={`${t('filters.within', { km: get('radius_km') })} ×`} onPress={() => set({ radius_km: null })} /> : null}
          {get('rating_min') ? <Chip on label={`${get('rating_min')}+ ★ ×`} onPress={() => set({ rating_min: null })} /> : null}
          {get('cost_min') || get('cost_max') ? (
            <Chip on label={`${get('cost_min') ? rupees(+get('cost_min')) : '₹0'} – ${get('cost_max') ? rupees(+get('cost_max')) : '∞'} ×`} onPress={() => set({ cost_min: null, cost_max: null })} />
          ) : null}
          <Pressable onPress={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))} hitSlop={8}>
            <Txt v="small" color={brand} style={{ textDecorationLine: 'underline' }}>
              {t('filters.clearAll')}
            </Txt>
          </Pressable>
        </ScrollView>
      ) : null}
      <View style={{ paddingHorizontal: 16 }}>
        {first.data ? (
          <Txt v="small" muted>
            {tp('places', first.data.total)}
          </Txt>
        ) : null}
      </View>
    </View>
  );

  const empty =
    first.data && !items.length ? (
      <Empty title={t('list.emptyTitle')} icon="🔍" action={<Button kind="outline" title={t('list.clearAll')} onPress={() => set(Object.fromEntries(['q', ...FILTER_KEYS].map((k) => [k, null])))} />}>
        {t('list.emptyBody')}
      </Empty>
    ) : first.loading && !items.length ? (
      <View style={{ paddingHorizontal: 16, gap: 24 }}>
        <CardSkeleton />
        <CardSkeleton />
      </View>
    ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <Stack.Screen options={{ title }} />
      {view === 'map' ? (
        <View style={{ flex: 1 }}>
          {bar}
          <ErrorNote message={first.error} onRetry={first.reload} style={{ marginHorizontal: 16 }} />
          {empty}
          {items.length > 0 ? (
            <Map
              style={{ flex: 1 }}
              center={place}
              zoom={13}
              fit
              brand={brand}
              pins={[
                ...(place.precise ? [{ id: 'me', lat: place.lat, lng: place.lng, label: t('list.you'), tone: 'me' as const }] : []),
                ...items.map((r) => ({ id: r.id, lat: r.lat, lng: r.lng, label: nm(r, lang), rating: r.rating, onPress: () => router.push(restaurantHref(r) as never) })),
              ]}
            />
          ) : null}
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(r) => r.id}
          renderItem={({ item, index }) => (
            <View style={{ paddingHorizontal: 16, opacity: first.loading ? 0.6 : 1 }}>
              <RestaurantCard r={item} position={index} from="listing" />
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 24 }} />}
          ListHeaderComponent={
            <>
              {bar}
              <ErrorNote message={first.error} onRetry={first.reload} style={{ marginHorizontal: 16, marginBottom: 12 }} />
            </>
          }
          stickyHeaderIndices={[0]}
          ListEmptyComponent={empty}
          ListFooterComponent={
            <View style={{ padding: 16, paddingBottom: 40 }}>
              <ErrorNote message={moreError} onRetry={loadMore} />
              {busy ? <Loading /> : null}
            </View>
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          initialNumToRender={4}
          windowSize={7}
        />
      )}
      {sheet ? (
        <FilterSheet onClose={() => setSheet(false)} filters={filters.data} base={{ lat: place.lat, lng: place.lng, radius_km: 40, ...(get('q') ? { q: get('q') } : {}) }} />
      ) : null}
      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title={t('list.sort')}>
        {SORTS.map((s) => (
          <Chip
            key={s}
            label={t(`sort.${s}` as MessageKey)}
            on={sort === s}
            onPress={() => {
              set({ sort: s === 'relevance' ? null : s });
              setSortOpen(false);
            }}
            style={{ alignSelf: 'flex-start' }}
          />
        ))}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
