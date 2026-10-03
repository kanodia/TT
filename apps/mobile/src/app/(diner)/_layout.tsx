import { Stack } from 'expo-router';
import { useSession } from '@/lib/session';

export default function DinerLayout() {
  const { t } = useSession();
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="restaurants" options={{ title: '' }} />
      <Stack.Screen name="r/[city]/[slug]" options={{ title: '' }} />
      <Stack.Screen name="c/[slug]" options={{ title: '' }} />
      <Stack.Screen name="lists/[id]" options={{ title: '' }} />
      <Stack.Screen name="notifications" options={{ title: t('notif.title') }} />
      <Stack.Screen name="location" options={{ presentation: 'modal', title: t('place.title') }} />
      <Stack.Screen name="review" options={{ presentation: 'modal', title: t('review.writeTitle') }} />
    </Stack>
  );
}
