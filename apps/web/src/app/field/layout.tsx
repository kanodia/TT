'use client';

import { useEffect } from 'react';
import { Shell } from '@/components/Shell';
import { useSession } from '@/lib/session';

export default function FieldLayout({ children }: { children: React.ReactNode }) {
  const { t } = useSession();
  useEffect(() => {
    // Caches the field app shell so it opens without signal. Dev builds skip it to avoid stale bundles.
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return (
    <Shell
      area={t('field.area')}
      width="max-w-3xl"
      roles={['field_agent', 'field_supervisor', 'admin']}
      intro={t('field.signIn')}
      nav={[
        { href: '/field', label: t('fhome.title'), exact: true },
        { href: '/field/capture', label: `+ ${t('fhome.captureLead')}` },
        { href: '/field/submissions', label: t('fsubs.title') },
      ]}
    >
      {children}
    </Shell>
  );
}
