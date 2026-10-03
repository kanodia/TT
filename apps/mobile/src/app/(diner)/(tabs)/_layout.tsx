import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { C } from '@/components/ui';
import { useBrand, useSession } from '@/lib/session';

type Icon = keyof typeof Ionicons.glyphMap;
const icon = (name: Icon, focused: Icon) =>
  function TabIcon({ color, size, focused: on }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={on ? focused : name} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const { t, me } = useSession();
  const brand = useBrand();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: brand, tabBarInactiveTintColor: C.muted, headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('tab.home'), tabBarIcon: icon('home-outline', 'home') }} />
      <Tabs.Screen name="search" options={{ title: t('tab.search'), tabBarIcon: icon('search-outline', 'search') }} />
      <Tabs.Screen name="saved" options={{ title: t('tab.saved'), tabBarIcon: icon('heart-outline', 'heart') }} />
      <Tabs.Screen
        name="account"
        options={{ title: t('tab.account'), tabBarIcon: icon('person-outline', 'person'), tabBarBadge: me?.unreadNotifications ? me.unreadNotifications : undefined }}
      />
    </Tabs>
  );
}
