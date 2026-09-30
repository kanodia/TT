'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useSession();
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-4xl">🍽️</p>
      <h1 className="mt-3 text-lg font-semibold">{t('state.error')}</h1>
      <div className="mt-5 flex justify-center gap-2">
        <button className="btn-primary" onClick={reset}>
          {t('action.retry')}
        </button>
        <Link href="/" className="btn-outline">
          {t('action.goHome')}
        </Link>
      </div>
    </div>
  );
}
