import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { usePartner } from '@/components/partner/context';
import { C } from '@/components/ui';
import { useBrand, useSession } from '@/lib/session';

type Icon = keyof typeof Ionicons.glyphMap;
const icon = (name: Icon, focused: Icon) =>
  function TabIcon({ color, size, focused: on }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={on ? focused : name} size={size} color={color as string} />;
  };

/** One restaurant's tabs; each shows only if the member's role allows it (spec 5.3). */
export default function RestaurantTabs() {
  const { t } = useSession();
  const brand = useBrand();
  const { can } = usePartner();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: brand, tabBarInactiveTintColor: C.muted, headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('ptab.dashboard'), tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
      <Tabs.Screen name="reviews" options={{ title: t('ptab.reviews'), tabBarIcon: icon('chatbubbles-outline', 'chatbubbles'), href: can('reviews') ? undefined : null }} />
      <Tabs.Screen name="menu" options={{ title: t('ptab.menu'), tabBarIcon: icon('restaurant-outline', 'restaurant'), href: can('menu') ? undefined : null }} />
      <Tabs.Screen name="photos" options={{ title: t('ptab.photos'), tabBarIcon: icon('images-outline', 'images'), href: can('photos') ? undefined : null }} />
      <Tabs.Screen name="more" options={{ title: t('papp.more'), tabBarIcon: icon('ellipsis-horizontal-circle-outline', 'ellipsis-horizontal-circle') }} />
    </Tabs>
  );
}
