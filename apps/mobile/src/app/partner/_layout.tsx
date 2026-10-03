import { Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoginForm } from '@/components/auth';
import { C, Loading } from '@/components/ui';
import { useSession } from '@/lib/session';

/** Partner app: any signed-in user; what they can manage comes from their restaurant memberships. */
export default function PartnerLayout() {
  const { me, ready, t } = useSession();
  const insets = useSafeAreaInsets();
  if (!ready) return <Loading />;
  if (!me) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 20, paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
        <LoginForm intro={t('partner.signIn')} />
      </ScrollView>
    );
  }
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: t('partner.myRestaurants') }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
