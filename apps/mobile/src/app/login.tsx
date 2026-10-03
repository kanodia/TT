import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView } from 'react-native';
import { LoginForm } from '@/components/auth';

/** Sign-in sheet opened from anywhere that needs an account (save, review, report). */
export default function LoginScreen() {
  const { intro } = useLocalSearchParams<{ intro?: string }>();
  return (
    <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
      <LoginForm intro={intro} onDone={() => router.back()} />
    </ScrollView>
  );
}
