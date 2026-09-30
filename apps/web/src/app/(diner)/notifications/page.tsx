'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { RequireAuth } from '@/components/auth';
import { Empty, ErrorNote, Loading } from '@/components/ui';
import { api } from '@/lib/api';
import { ago } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { AppNotification } from '@/lib/types';
import { useApi } from '@/lib/useApi';

function Inbox() {
  const { t, refreshMe } = useSession();
  const list = useApi<{ data: AppNotification[] }>('/v1/me/notifications');
  const unread = list.data?.data.some((n) => !n.readAt);

  // Opening the inbox marks everything read once the list has shown the unread ones.
  useEffect(() => {
    if (!unread) return;
    const timer = setTimeout(() => {
      api('/v1/me/notifications/read', { method: 'POST' })
        .then(refreshMe)
        .catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [unread, refreshMe]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t('notif.title')}</h1>
      <ErrorNote message={list.error} onRetry={list.reload} />
      {list.loading && <Loading />}
      {list.data?.data.length === 0 && <Empty title={t('notif.empty')} icon="🔔" />}
      <ul className="card divide-y divide-border">
        {list.data?.data.map((n) => {
          const rid = typeof n.payload.restaurantId === 'string' ? n.payload.restaurantId : null;
          const body = (
            <>
              <p className={`text-sm ${n.readAt ? '' : 'font-semibold'}`}>{n.title}</p>
              <p className="text-sm text-muted">{n.body}</p>
              <p className="mt-0.5 text-xs text-muted">{ago(n.createdAt, t)}</p>
            </>
          );
          return (
            <li key={n.id} className={`px-4 py-3 ${n.readAt ? '' : 'bg-brand/5'}`}>
              {rid ? (
                <Link href={`/partner/${rid}`} className="block hover:opacity-80">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function NotificationsPage() {
  return <RequireAuth>{() => <Inbox />}</RequireAuth>;
}
