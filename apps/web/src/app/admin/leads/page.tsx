'use client';

import { useState } from 'react';
import { PageTitle } from '@/components/Shell';
import { Empty, ErrorNote, Field, Loading, Modal, StatusPill, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { ago, humanize } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Filters } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Area = { id: string; name: string; cityId: string };
type Lead = {
  id: string;
  area: { id: string; name: string } | null;
  visits: { outcome: string; createdAt: string; revisitOn: string | null }[];
  name: string;
  address: string | null;
  phone: string | null;
  source: string;
  sourceUrl: string | null;
  status: string;
  createdAt: string;
  city: { name: string };
  assignedTo: { id: string; name: string | null; phone: string } | null;
};
type Agent = { id: string; name: string | null; phone: string; role: string };

function ImportLeads({ open, onClose, onDone, areas }: { open: boolean; onClose: () => void; onDone: () => void; areas: Area[] }) {
  const filters = useApi<Filters>(open ? '/v1/filters' : null);
  const [cityId, setCityId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState<{ created: number; duplicates: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api('/v1/admin/leads/import', { method: 'POST', body: { csv, cityId, ...(areaId ? { areaId } : {}) } }));
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setResult(null);
        setCsv('');
        onClose();
      }}
      title="Import leads"
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">
          Columns: <code className="rounded bg-surface px-1">name,phone,address,lat,lng,source,source_url,place_id</code>. Source is google_maps, justdial, social, directory or other. Quoted fields may contain commas. Places already listed or imported (same name, same Google place_id, or a similar name within 30 m) are skipped. Store Google&apos;s place_id only — never copy its photos or reviews (spec 7.2).
        </p>
        <ErrorNote message={error} />
        {result ? (
          <div>
            <p className="font-medium text-good">
              {result.created} leads added, {result.duplicates} duplicates skipped.
            </p>
            {result.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-red-700">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <Field label="Town">
              <select className="input" value={cityId} onChange={(e) => setCityId(e.target.value)}>
                <option value="">Select…</option>
                {filters.data?.cities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Beat (optional)">
              <select className="input" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
                <option value="">—</option>
                {areas
                  .filter((a) => !cityId || a.cityId === cityId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            <input type="file" accept=".csv,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
            <textarea className="input min-h-40 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="…or paste CSV here" />
            <button className="btn-primary w-full" disabled={busy || !cityId || !csv.trim()} onClick={run}>
              {busy ? 'Importing…' : 'Import'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function Leads() {
  const { me } = useSession();
  const [status, setStatus] = useState('');
  const leads = useApi<{ data: Lead[] }>('/v1/admin/leads', { status });
  // Supervisors can list field staff too (the API limits them to field roles).
  const agents = useApi<{ data: Agent[] }>('/v1/admin/users');
  const [selected, setSelected] = useState<string[]>([]);
  const [agentId, setAgentId] = useState('');
  const [assignArea, setAssignArea] = useState('');
  const areas = useApi<{ data: Area[] }>('/v1/admin/field/areas');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  const knownAgents: Agent[] = [
    ...(agents.data?.data.filter((u) => u.role === 'field_agent' || u.role === 'field_supervisor') ?? []),
    ...(leads.data?.data.flatMap((l) => (l.assignedTo ? [{ ...l.assignedTo, role: 'field_agent' }] : [])) ?? []),
    ...(me && me.role === 'field_supervisor' ? [{ id: me.id, name: `${me.name ?? 'Me'} (me)`, phone: me.phone, role: me.role }] : []),
  ].filter((a, i, arr) => arr.findIndex((b) => b.id === a.id) === i);

  const assignable = (l: Lead) => l.status === 'new' || l.status === 'assigned';

  async function assign() {
    setError(null);
    try {
      const r = await api<{ assigned: number }>('/v1/admin/leads/assign', { method: 'POST', body: { leadIds: selected, agentId, ...(assignArea ? { areaId: assignArea } : {}) } });
      setFlash(`${r.assigned} lead(s) assigned`);
      setSelected([]);
      leads.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const rows = leads.data?.data ?? [];
  const selectable = rows.filter(assignable);
  return (
    <div className="space-y-4">
      <PageTitle
        title="Leads"
        sub="Places found online that the field team should visit and verify."
        actions={
          <button className="btn-primary" onClick={() => setImporting(true)}>
            ⬆ Import CSV
          </button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        {['', 'new', 'assigned', 'verified', 'rejected', 'duplicate'].map((s) => (
          <button key={s} className={`chip ${status === s ? 'chip-on' : ''}`} onClick={() => { setStatus(s); setSelected([]); }}>
            {s ? humanize(s) : 'All'}
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <div className="card sticky top-16 z-10 flex flex-wrap items-center gap-2 p-3">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <select className="input w-auto" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">Assign to…</option>
            {knownAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.phone} ({humanize(a.role)})
              </option>
            ))}
          </select>
          <select className="input w-auto" value={assignArea} onChange={(e) => setAssignArea(e.target.value)}>
            <option value="">Beat (optional)</option>
            {areas.data?.data.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button className="btn-primary" disabled={!agentId} onClick={assign}>
            Assign
          </button>
          <button className="btn-ghost" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      )}
      <ErrorNote message={error ?? leads.error} />
      {leads.loading && <Loading />}
      {leads.data && rows.length === 0 && <Empty title="No leads" icon="🗂️">Import a CSV exported from Google Maps, Justdial or local directories.</Empty>}
      {rows.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={selectable.length > 0 && selected.length === selectable.length}
                    onChange={(e) => setSelected(e.target.checked ? selectable.map((l) => l.id) : [])}
                  />
                </th>
                <th className="px-3 py-2">Place</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Assigned to</th>
                <th className="px-3 py-2">Last visit</th>
                <th className="px-3 py-2">Added</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((l) => (
                <tr key={l.id} className={selected.includes(l.id) ? 'bg-brand/5' : ''}>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      disabled={!assignable(l)}
                      checked={selected.includes(l.id)}
                      onChange={(e) => setSelected(e.target.checked ? [...selected, l.id] : selected.filter((x) => x !== l.id))}
                      aria-label={`Select ${l.name}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-muted">{[l.address, l.city.name, l.phone].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.sourceUrl ? (
                      <a href={l.sourceUrl} target="_blank" rel="noreferrer" className="text-brand">
                        {humanize(l.source)} ↗
                      </a>
                    ) : (
                      humanize(l.source)
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <StatusPill status={l.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {l.assignedTo ? l.assignedTo.name ?? l.assignedTo.phone : '—'}
                    {l.area && <span className="block text-muted">{l.area.name}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{l.visits[0] ? `${humanize(l.visits[0].outcome)} · ${ago(l.visits[0].createdAt)}` : '—'}</td>
                  <td className="px-3 py-2 text-xs text-muted">{ago(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ImportLeads open={importing} onClose={() => setImporting(false)} onDone={leads.reload} areas={areas.data?.data ?? []} />
      {flash}
    </div>
  );
}
