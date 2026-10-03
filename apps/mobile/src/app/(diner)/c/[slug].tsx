import { Stack, useLocalSearchParams } from 'expo-router';
import { FlatList, View } from 'react-native';
import type { Card } from '@shared/types';
import { CardSkeleton, RestaurantCard } from '@/components/RestaurantCard';
import { Cover, Empty, Txt } from '@/components/ui';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Collection = { title: string; titleHi: string | null; description: string | null; coverUrl: string | null; city: { name: string } | null; items: Card[] };

/** Editorial or auto collection (spec 3.4). */
export default function CollectionScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { place, lang, t, tp } = useSession();
  const brand = useBrand();
  const c = useApi<Collection>(`/v1/collections/${slug}`, { lat: place.lat, lng: place.lng });
  if (c.error) return <Empty title={t('collection.notFound')} icon="📚" />;
  const d = c.data;
  const title = d ? (lang === 'hi' && d.titleHi ? d.titleHi : d.title) : '';
  return (
    <>
      <Stack.Screen options={{ title }} />
      <FlatList
        data={d?.items ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: 48, gap: 24 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {d?.coverUrl ? <Cover url={d.coverUrl} seed={slug} size="lg" style={{ height: 180 }} rounded={0} /> : null}
            {d ? (
              <View style={{ paddingHorizontal: 16, gap: 4 }}>
                <Txt v="tiny" bold color={brand}>
                  {t('collection.label').toUpperCase()}
                  {d.city ? ` · ${d.city.name}` : ''}
                </Txt>
                <Txt v="h1">{title}</Txt>
                {d.description ? <Txt muted>{d.description}</Txt> : null}
                <Txt v="small" muted>
                  {tp('places', d.items.length)}
                </Txt>
              </View>
            ) : (
              <View style={{ padding: 16, gap: 24 }}>
                <CardSkeleton />
                <CardSkeleton />
              </View>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={{ paddingHorizontal: 16 }}>
            <RestaurantCard r={item} position={index} from={`collection:${slug}`} />
          </View>
        )}
      />
    </>
  );
}
