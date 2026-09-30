'use client';

import Link from 'next/link';
import { useState } from 'react';
import { RequireAuth } from '@/components/auth';
import { listName } from '@/components/restaurant/SaveToList';
import { Cover, Empty, ErrorNote, Loading } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { SavedList } from '@/lib/types';
import { useApi } from '@/lib/useApi';

function Lists() {
  const { t, tp } = useSession();
  const lists = useApi<{ data: SavedList[] }>('/v1/me/lists');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (lists.loading) return <Loading />;
  const data = lists.data?.data ?? [];
  const total = data.reduce((n, l) => n + (l.count ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">{t('lists.title')}</h1>
      <ErrorNote message={error ?? lists.error} />
      {total === 0 && (
        <Empty title={t('lists.emptyTitle')} icon="♡">
          {t('lists.emptyBody')}
          <div className="mt-3">
            <Link href="/restaurants" className="btn-primary">
              {t('lists.explore')}
            </Link>
          </div>
        </Empty>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((l) => (
          <Link key={l.id} href={`/saved/${l.id}`} className="card overflow-hidden transition hover:shadow-md">
            <Cover url={l.cover} seed={l.id} className="h-32 w-full" />
            <div className="p-3">
              <p className="font-semibold">{listName(l, t)}</p>
              <p className="text-xs text-muted">
                {tp('places', l.count ?? 0)}
                {l.isPublic && ` · ${t('lists.public')}`}
              </p>
            </div>
          </Link>
        ))}
      </div>
      <form
        className="card flex gap-2 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/v1/me/lists', { method: 'POST', body: { name: name.trim() } });
            setName('');
            lists.reload();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <input className="input" placeholder={t('lists.newPlaceholder')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={!name.trim()}>
          + {t('lists.new')}
        </button>
      </form>
    </div>
  );
}

export default function SavedPage() {
  const { t } = useSession();
  return <RequireAuth intro={t('lists.signIn')}>{() => <Lists />}</RequireAuth>;
}
