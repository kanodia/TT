import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from '@/components/ui';
import { IS_FIELD, IS_PARTNER } from '@/lib/env';
import { onNotificationTap } from '@/lib/push';
import { SessionProvider, useBrand, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

function Navigator() {
  const { ready, t } = useSession();
  const brand = useBrand();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Tapping a push opens the screen it is about.
  useEffect(() => {
    if (!ready) return;
    return onNotificationTap((target) => router.push(target as never));
  }, [ready]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerTintColor: brand, headerTitleStyle: { color: C.text }, headerBackButtonDisplayMode: 'minimal', contentStyle: { backgroundColor: C.bg } }}>
        {/* Each build shows only its own app; the other's screens are unreachable. */}
        <Stack.Protected guard={!IS_FIELD && !IS_PARTNER}>
          <Stack.Screen name="(diner)" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={IS_FIELD}>
          <Stack.Screen name="field" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={IS_PARTNER}>
          <Stack.Screen name="partner" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="login" options={{ presentation: 'modal', title: t('auth.signIn') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Navigator />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
