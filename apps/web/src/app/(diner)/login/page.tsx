'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { LoginForm } from '@/components/auth';
import { Loading } from '@/components/ui';
import { useSession } from '@/lib/session';

/** Only same-site paths, so ?next= can't bounce people to another site. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

function Login() {
  const { me } = useSession();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  useEffect(() => {
    if (me) router.replace(next);
  }, [me, next, router]);
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <LoginForm />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Login />
    </Suspense>
  );
}
