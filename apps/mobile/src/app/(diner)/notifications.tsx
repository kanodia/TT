import { router } from 'expo-router';
import { useEffect } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { ago } from '@shared/format';
import type { AppNotification } from '@shared/types';
import { RequireAuth } from '@/components/RequireAuth';
import { Card, Empty, ErrorNote, Loading, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

function List() {
  const { t, refreshMe } = useSession();
  const brand = useBrand();
  const n = useApi<{ data: AppNotification[] }>('/v1/me/notifications');

  // Opening the list marks everything read.
  useEffect(() => {
    if (!n.data?.data.some((x) => !x.readAt)) return;
    api('/v1/me/notifications/read', { method: 'POST' })
      .then(refreshMe)
      .catch(() => {});
  }, [n.data, refreshMe]);

  if (n.loading && !n.stale) return <Loading />;
  const items = (n.data ?? n.stale)?.data ?? [];
  return (
    <FlatList
      data={items}
      keyExtractor={(x) => x.id}
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={n.refreshing} onRefresh={n.refresh} tintColor={brand} colors={[brand]} />}
      ListHeaderComponent={<ErrorNote message={n.error} onRetry={n.reload} />}
      ListEmptyComponent={<Empty icon="🔔" title={t('notif.empty')} />}
      renderItem={({ item }) => {
        const restaurant = item.payload.restaurantSlug && item.payload.citySlug ? `/r/${item.payload.citySlug}/${item.payload.restaurantSlug}` : null;
        return (
          <Card onPress={restaurant ? () => router.push(restaurant as never) : undefined} style={!item.readAt ? { borderColor: brand } : undefined}>
            <Row style={{ alignItems: 'flex-start' }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt bold>{item.title}</Txt>
                <Txt v="small" muted>
                  {item.body}
                </Txt>
              </View>
              <Txt v="tiny" muted>
                {ago(item.createdAt, t)}
              </Txt>
            </Row>
          </Card>
        );
      }}
    />
  );
}

export default function NotificationsScreen() {
  return <RequireAuth>{() => <List />}</RequireAuth>;
}
