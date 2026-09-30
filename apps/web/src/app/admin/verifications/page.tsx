'use client';

import Link from 'next/link';
import { useState } from 'react';
import { openPrivateDocument } from '@/components/forms';
import { PageTitle } from '@/components/Shell';
import { Empty, ErrorNote, Loading, StatusPill, Tabs, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { ago, humanize, rupees } from '@/lib/format';
import { useApi } from '@/lib/useApi';

type Row = {
  id: string;
  type: 'new' | 'claim' | 'core_change';
  status: string;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
  documents: string[];
  changes: Record<string, unknown> | null;
  submitter: { id: string; name: string | null; phone: string } | null;
  restaurant: {
    id: string;
    slug: string;
    name: string;
    addressLine: string;
    phone: string | null;
    fssaiNumber: string | null;
    costForTwo: number;
    status: string;
    isClaimed: boolean;
    source: string;
    lat: number;
    lng: number;
    city: { name: string };
    type: { name: string } | null;
    cuisines: { cuisine: { name: string } }[];
  };
};

const TYPE_LABEL = { new: 'New listing', claim: 'Ownership claim', core_change: 'Name / address change' };

function Card({ row, onDone }: { row: Row; onDone: (msg: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const r = row.restaurant;

  async function decide(decision: 'approve' | 'reject') {
    if (decision === 'reject' && !note.trim()) return setError('Write the reason the partner will see');
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/admin/verifications/${row.id}/${decision}`, { method: 'POST', body: note.trim() ? { note: note.trim() } : {} });
      onDone(decision === 'approve' ? `Approved: ${r.name}` : `Rejected: ${r.name}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand uppercase">{TYPE_LABEL[row.type]}</p>
          <p className="text-lg font-semibold">{r.name}</p>
          <p className="text-sm text-muted">
            {r.addressLine}, {r.city.name} · {r.type?.name ?? 'type not set'} · {r.cuisines.map((c) => c.cuisine.name).join(', ') || 'no cuisines'}
          </p>
          <p className="text-xs text-muted">
            Listing: {humanize(r.status)} · source {r.source} · {r.isClaimed ? 'claimed' : 'unclaimed'}
            {r.costForTwo > 0 && ` · ${rupees(r.costForTwo)} for two`}
          </p>
        </div>
        <div className="text-right text-xs text-muted">
          <StatusPill status={row.status} />
          <p className="mt-1">{ago(row.createdAt)}</p>
        </div>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-surface p-3">
          <p className="text-xs text-muted">Submitted by</p>
          <p className="font-medium">{row.submitter?.name ?? '—'}</p>
          {row.submitter && <p className="text-xs">+91 {row.submitter.phone}</p>}
          {r.phone && <p className="mt-1 text-xs text-muted">Restaurant phone: {r.phone}{row.submitter?.phone === r.phone && ' (matches ✓)'}</p>}
        </div>
        <div className="rounded-lg bg-surface p-3">
          <p className="text-xs text-muted">FSSAI number</p>
          <p className="font-mono">{r.fssaiNumber ?? '— not given —'}</p>
          {r.fssaiNumber && (
            <a href="https://foscos.fssai.gov.in/" target="_blank" rel="noreferrer" className="text-xs text-brand">
              Check on FoSCoS ↗
            </a>
          )}
        </div>
        <div className="rounded-lg bg-surface p-3">
          <p className="text-xs text-muted">Location</p>
          <a href={`https://www.google.com/maps?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer" className="text-brand">
            {r.lat.toFixed(5)}, {r.lng.toFixed(5)} ↗
          </a>
          <Link href={`/partner/${r.id}`} className="mt-1 block text-xs text-brand">
            Open full listing →
          </Link>
        </div>
      </div>

      {row.changes && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="mb-1 font-medium">Requested changes</p>
          <table className="text-sm">
            <tbody>
              {Object.entries(row.changes).map(([k, v]) => (
                <tr key={k}>
                  <td className="pr-4 text-muted">{humanize(k)}</td>
                  <td className="pr-4 line-through">{String((r as Record<string, unknown>)[k] ?? '—')}</td>
                  <td className="font-medium">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {row.type !== 'core_change' && row.note && <p className="text-sm">Partner note: “{row.note}”</p>}

      {row.documents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {row.documents.map((d, i) => (
            <button key={d} className="chip" onClick={() => openPrivateDocument(d)}>
              📄 Document {i + 1}
            </button>
          ))}
        </div>
      )}

      {row.status === 'pending' ? (
        <div className="space-y-2 border-t border-border pt-3">
          <ErrorNote message={error} />
          <input className="input" placeholder="Note to partner (required to reject)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary bg-good" disabled={busy} onClick={() => decide('approve')}>
              ✓ Approve
            </button>
            <button className="btn-outline text-red-600" disabled={busy} onClick={() => decide('reject')}>
              ✕ Reject
            </button>
          </div>
        </div>
      ) : (
        row.decisionNote && <p className="text-sm text-muted">Decision note: {row.decisionNote}</p>
      )}
    </li>
  );
}

export default function Verifications() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const list = useApi<{ data: Row[] }>('/v1/admin/verifications', { status });
  const [flash, setFlash] = useFlash();
  return (
    <div className="space-y-4">
      <PageTitle title="Verifications" sub="Check documents against the listing. Oldest first." />
      <Tabs
        value={status}
        onChange={setStatus}
        tabs={[
          { key: 'pending', label: 'Pending' },
          { key: 'approved', label: 'Approved' },
          { key: 'rejected', label: 'Rejected' },
        ]}
      />
      <ErrorNote message={list.error} onRetry={list.reload} />
      {list.loading && <Loading />}
      {list.data?.data.length === 0 && <Empty title="Nothing here" icon="✅" />}
      <ul className="space-y-4">
        {list.data?.data.map((row) => (
          <Card
            key={row.id}
            row={row}
            onDone={(msg) => {
              setFlash(msg);
              list.reload();
            }}
          />
        ))}
      </ul>
      {flash}
    </div>
  );
}
