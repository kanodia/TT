'use client';

import { useState } from 'react';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Loading } from '@/components/ui';
import { shortDate } from '@/lib/format';
import { useApi } from '@/lib/useApi';

type Entry = {
  id: string;
  actorId: string | null;
  actor: { name: string | null; phone: string } | null;
  action: string;
  entityType: string;
  entityId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
};

const ENTITY_TYPES = ['restaurant', 'review', 'photo', 'user', 'settings', 'city', 'locality', 'collection', 'field_area', 'cuisines', 'attributes', 'establishment-types', 'search'];

/** Who changed what, when, with before and after values (spec 6). */
export default function AuditLog() {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [entityId, setEntityId] = useState('');
  const [query, setQuery] = useState({ entity_type: '', action: '', entity_id: '' });
  const log = useApi<{ data: Entry[] }>('/v1/admin/audit-log', query);
  return (
    <div className="space-y-4">
      <PageTitle title="Audit log" sub="Latest 300 matching changes. Append-only." />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ entity_type: entityType, action: action.trim(), entity_id: entityId.trim() });
        }}
      >
        <select className="input w-auto" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input className="input max-w-48" placeholder="Action starts with…" value={action} onChange={(e) => setAction(e.target.value)} />
        <input className="input max-w-72 font-mono text-xs" placeholder="Entity id" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        <button className="btn-outline">Filter</button>
      </form>
      <ErrorNote message={log.error} onRetry={log.reload} />
      {log.loading && <Loading />}
      {log.data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Who</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Entity</th>
                <th className="px-3 py-2">Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {log.data.data.map((e) => (
                <tr key={e.id} className="align-top">
                  <td className="px-3 py-2 text-xs whitespace-nowrap text-muted">
                    {shortDate(e.createdAt)} {new Date(e.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2 text-xs">{e.actor ? e.actor.name ?? e.actor.phone : 'system'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                  <td className="px-3 py-2 text-xs">
                    {e.entityType}
                    <button className="block font-mono text-[10px] text-brand" onClick={() => { setEntityId(e.entityId); setQuery({ ...query, entity_id: e.entityId }); }}>
                      {e.entityId.slice(0, 8)}
                    </button>
                  </td>
                  <td className="max-w-lg px-3 py-2">
                    {(e.before != null || e.after != null) && (
                      <details>
                        <summary className="cursor-pointer text-xs text-brand">Show</summary>
                        <div className="mt-1 grid gap-2 md:grid-cols-2">
                          {e.before != null && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted uppercase">Before</p>
                              <pre className="max-h-60 overflow-auto rounded bg-red-50 p-2 text-[11px] whitespace-pre-wrap">{JSON.stringify(e.before, null, 2)}</pre>
                            </div>
                          )}
                          {e.after != null && (
                            <div>
                              <p className="text-[10px] font-semibold text-muted uppercase">After</p>
                              <pre className="max-h-60 overflow-auto rounded bg-green-50 p-2 text-[11px] whitespace-pre-wrap">{JSON.stringify(e.after, null, 2)}</pre>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
