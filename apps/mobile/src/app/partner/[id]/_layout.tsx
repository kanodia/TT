import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import type { PartnerArea, PartnerRestaurant } from '@shared/types';
import { PartnerCtx } from '@/components/partner/context';
import { ErrorNote, Loading } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

/** Loads the restaurant once for all its tabs and screens. */
export default function RestaurantLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useSession();
  const r = useApi<PartnerRestaurant>(`/v1/partner/restaurants/${id}`);
  const restaurant = r.data ?? r.stale;
  const reload = r.reload;
  const ctx = useMemo(() => (restaurant ? { restaurant, reload, can: (a: PartnerArea) => restaurant.permissions.includes(a) } : null), [restaurant, reload]);

  if (r.error && !restaurant) return <ErrorNote message={r.error} onRetry={r.reload} style={{ margin: 16, marginTop: 80 }} />;
  if (!ctx) return <Loading />;
  return (
    <PartnerCtx.Provider value={ctx}>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ title: ctx.restaurant.name }} />
        <Stack.Screen name="hours" options={{ title: t('ptab.hours') }} />
        <Stack.Screen name="offers" options={{ title: t('ptab.offers') }} />
        <Stack.Screen name="dish" options={{ presentation: 'modal', title: t('menuEd.editDish') }} />
      </Stack>
    </PartnerCtx.Provider>
  );
}
