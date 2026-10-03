import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';
import type { Me } from '@shared/types';
import { useSession } from '@/lib/session';
import { LoginForm } from './auth';
import { Loading } from './ui';

/** Renders children only for a signed-in user; otherwise the sign-in form in place. */
export function RequireAuth({ children, intro }: { children: (me: Me) => ReactNode; intro?: string }) {
  const { me, ready } = useSession();
  if (!ready) return <Loading />;
  if (!me) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 32 }} keyboardShouldPersistTaps="handled">
        <LoginForm intro={intro} />
      </ScrollView>
    );
  }
  return <>{children(me)}</>;
}
