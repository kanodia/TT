'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { UploadButton } from '@/components/forms';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Field, Loading, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';

type Claimable = { id: string; name: string; address: string; city: string; locality?: string };

function Claim() {
  const { t } = useSession();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('name') ?? '');
  const [results, setResults] = useState<Claimable[] | null>(null);
  const [picked, setPicked] = useState<Claimable | null>(
    params.get('id') ? { id: params.get('id')!, name: params.get('name') ?? '', address: '', city: '' } : null,
  );
  const [docs, setDocs] = useState<{ url: string; name: string }[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2 || picked) return;
    const t = setTimeout(() => {
      api<{ data: Claimable[] }>('/v1/partner/claimable', { query: { q: q.trim() } })
        .then((r) => setResults(r.data))
        .catch((e) => setError(errorMessage(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [q, picked]);

  async function submit() {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/partner/restaurants/${picked.id}/claim`, {
        method: 'POST',
        body: { documents: docs.map((d) => d.url), ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-8 text-center">
        <p className="text-4xl">📨</p>
        <h1 className="text-xl font-semibold">{t('claim.sentTitle')}</h1>
        <p className="text-sm text-muted">{t('claim.sentBody', { name: picked?.name })}</p>
        <Link href="/partner" className="btn-primary">
          {t('claim.back')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle title={t('claim.title')} sub={t('claim.sub')} />
      <ErrorNote message={error} />
      {!picked ? (
        <div className="card space-y-3 p-5">
          <Field label={t('claim.search')}>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={t('claim.searchPlaceholder')} />
          </Field>
          {results?.length === 0 && (
            <p className="text-sm text-muted">
              {t('claim.notFound')}{' '}
              <Link href="/partner/new" className="text-brand underline">
                {t('claim.addNew')}
              </Link>
            </p>
          )}
          <ul className="divide-y divide-border">
            {results?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted">{[r.address, r.locality, r.city].filter(Boolean).join(', ')}</p>
                </div>
                <button className="btn-outline" onClick={() => setPicked(r)}>
                  {t('claim.mine')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="card space-y-4 p-5">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
            <div>
              <p className="font-medium">{picked.name}</p>
              {picked.address && <p className="text-xs text-muted">{[picked.address, picked.city].filter(Boolean).join(', ')}</p>}
            </div>
            <button className="text-sm text-brand" onClick={() => setPicked(null)}>
              {t('action.change')}
            </button>
          </div>
          <Notice>{t('claim.docsHelp')}</Notice>
          <div className="space-y-2">
            {docs.map((d, i) => (
              <div key={d.url} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
                <span className="truncate">📄 {d.name}</span>
                <button className="text-muted hover:text-red-600" onClick={() => setDocs(docs.filter((_, j) => j !== i))}>
                  {t('action.remove')}
                </button>
              </div>
            ))}
            {docs.length < 5 && <UploadButton kind="document" label={t('claim.uploadDoc')} onUploaded={(u, file) => setDocs([...docs, { url: u.url, name: file.name }])} />}
          </div>
          <Field label={t('claim.note')}>
            <textarea className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('claim.notePlaceholder')} />
          </Field>
          <button className="btn-primary w-full" disabled={busy || docs.length === 0} onClick={submit}>
            {busy ? t('report.sending') : t('claim.send')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Claim />
    </Suspense>
  );
}
