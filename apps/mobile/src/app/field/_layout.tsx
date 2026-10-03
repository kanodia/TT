import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoginForm } from '@/components/auth';
import { Button, C, Empty, Loading } from '@/components/ui';
import { FieldSyncProvider } from '@/lib/fieldSync';
import { useSession } from '@/lib/session';

const FIELD_ROLES = ['field_agent', 'field_supervisor', 'admin'];

/** The field team's app: only field agents, supervisors and admins get past sign-in (spec 7.3 "Login"). */
export default function FieldLayout() {
  const { me, ready, t, signOut } = useSession();
  const insets = useSafeAreaInsets();
  if (!ready) return <Loading />;
  if (!me) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
        <LoginForm intro={t('field.signIn')} />
      </ScrollView>
    );
  }
  if (!FIELD_ROLES.includes(me.role)) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
        <Empty icon="🔒" title={t('auth.noAccess')} action={<Button kind="outline" title={t('auth.signOut')} onPress={signOut} />}>
          {t('auth.noAccessBody', { phone: me.phone })}
        </Empty>
      </View>
    );
  }
  return (
    <FieldSyncProvider>
      <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="capture" options={{ title: t('fcap.title') }} />
      </Stack>
    </FieldSyncProvider>
  );
}
