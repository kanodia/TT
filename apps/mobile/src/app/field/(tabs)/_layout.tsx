import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';
import { C } from '@/components/ui';
import { useFieldSync } from '@/lib/fieldSync';
import { useBrand, useSession } from '@/lib/session';

type Icon = keyof typeof Ionicons.glyphMap;
const icon = (name: Icon, focused: Icon) =>
  function TabIcon({ color, size, focused: on }: { color: ColorValue; size: number; focused: boolean }) {
    return <Ionicons name={on ? focused : name} size={size} color={color as string} />;
  };

export default function FieldTabs() {
  const { t } = useSession();
  const brand = useBrand();
  const { queue, visits } = useFieldSync();
  const pending = queue.length + visits.filter((v) => !v.error).length;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: brand, tabBarInactiveTintColor: C.muted, headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: t('fhome.title'), tabBarIcon: icon('today-outline', 'today') }} />
      <Tabs.Screen name="area" options={{ title: t('fhome.myArea'), tabBarIcon: icon('map-outline', 'map') }} />
      <Tabs.Screen name="queue" options={{ title: t('fsubs.title'), tabBarIcon: icon('cloud-upload-outline', 'cloud-upload'), tabBarBadge: pending || undefined }} />
      <Tabs.Screen name="me" options={{ title: t('tab.account'), tabBarIcon: icon('person-outline', 'person') }} />
    </Tabs>
  );
}
