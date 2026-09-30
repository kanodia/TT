'use client';

import { useMemo, useState } from 'react';
import { Map } from '@/components/Map';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Field, Loading, Modal, Tabs, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { Filters } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Agent = { id: string; name: string | null; phone: string; role: string; today: number; week: number; approvalRate: number | null; openLeads: number; areas: { assignmentId: string; id: string; name: string }[] };
type Area = {
  id: string;
  name: string;
  cityId: string;
  city: { name: string };
  boundary: { type: 'Polygon'; coordinates: [number, number][][] } | null;
  assignments: { id: string; startsOn: string; endsOn: string | null; agent: { id: string; name: string | null; phone: string } }[];
  _count: { leads: number };
};
type ReportRow = { day: string; agent: string | null; town: string | null; count: number };
type Tab = 'agents' | 'areas' | 'report';

/** Draw a beat by clicking its corners on the map (spec 7.3 "assigned beat"). */
function AreaEditor({ filters, onClose, onSaved }: { filters: Filters; onClose: () => void; onSaved: () => void }) {
  const [cityId, setCityId] = useState(filters.cities[0]?.id ?? '');
  const [name, setName] = useState('');
  const [points, setPoints] = useState<[number, number][]>([]);
  const [error, setError] = useState<string | null>(null);
  const city = filters.cities.find((c) => c.id === cityId);
  return (
    <Modal open onClose={onClose} title="New beat" wide>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            // GeoJSON wants [lng, lat] and a closed ring.
            const ring = [...points, points[0]].map(([lat, lng]) => [lng, lat] as [number, number]);
            await api('/v1/admin/field/areas', { method: 'POST', body: { cityId, name: name.trim(), boundary: points.length >= 3 ? { type: 'Polygon', coordinates: [ring] } : null } });
            onSaved();
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <ErrorNote message={error} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Town">
            <select className="input" value={cityId} onChange={(e) => { setCityId(e.target.value); setPoints([]); }}>
              {filters.cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Beat name">
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Station Road stretch" required />
          </Field>
        </div>
        <p className="text-xs text-muted">Click the map to add corners ({points.length} so far). Three or more make an area; leave empty for a whole-town beat.</p>
        {city && (
          <Map
            key={cityId}
            className="h-80"
            center={[city.lat, city.lng]}
            onPick={(lat, lng) => setPoints([...points, [lat, lng]])}
            pins={points.map(([lat, lng], i) => ({ id: `p${i}`, lat, lng, label: String(i + 1) }))}
            areas={points.length >= 3 ? [{ id: 'draft', ring: points }] : []}
          />
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => setPoints(points.slice(0, -1))} disabled={!points.length}>
            Undo corner
          </button>
          <button className="btn-primary ml-auto" disabled={name.trim().length < 2 || (points.length > 0 && points.length < 3)}>
            Save beat
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function FieldOps() {
  const [tab, setTab] = useState<Tab>('agents');
  const agents = useApi<{ data: Agent[] }>('/v1/admin/field/agents');
  const areas = useApi<{ data: Area[] }>('/v1/admin/field/areas');
  const filters = useApi<Filters>('/v1/filters');
  const [days, setDays] = useState(14);
  const report = useApi<{ data: ReportRow[] }>(tab === 'report' ? '/v1/admin/field/report' : null, { days });
  const [creating, setCreating] = useState(false);
  const [assign, setAssign] = useState<{ areaId: string; agentId: string; startsOn: string; endsOn: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  async function run(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    try {
      await fn();
      setFlash(msg);
      areas.reload();
      agents.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // Pivot: rows = agent, columns = recent days.
  const pivot = useMemo(() => {
    const rows = report.data?.data ?? [];
    const dayList = [...new Set(rows.map((r) => r.day))].sort().reverse();
    const byAgent = new globalThis.Map<string, Record<string, number>>();
    const byTown = new globalThis.Map<string, number>();
    for (const r of rows) {
      const a = r.agent ?? '—';
      byAgent.set(a, { ...(byAgent.get(a) ?? {}), [r.day]: (byAgent.get(a)?.[r.day] ?? 0) + r.count });
      byTown.set(r.town ?? '—', (byTown.get(r.town ?? '—') ?? 0) + r.count);
    }
    return { dayList, byAgent: [...byAgent.entries()], byTown: [...byTown.entries()].sort((a, b) => b[1] - a[1]) };
  }, [report.data]);

  return (
    <div className="space-y-4">
      <PageTitle title="Field operations" sub="Agents, beats and daily capture progress (spec 6, 7)." />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'agents', label: 'Agents' },
          { key: 'areas', label: 'Beats' },
          { key: 'report', label: 'Daily captures' },
        ]}
      />
      <ErrorNote message={error ?? agents.error ?? areas.error} />

      {tab === 'agents' &&
        (agents.loading ? (
          <Loading />
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Today</th>
                  <th className="px-3 py-2">7 days</th>
                  <th className="px-3 py-2">Approval</th>
                  <th className="px-3 py-2">Open leads</th>
                  <th className="px-3 py-2">Beats</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {agents.data?.data.map((a) => (
                  <tr key={a.id}>
                    <td className="px-3 py-2">
                      <p className="font-medium">{a.name ?? '—'}</p>
                      <p className="text-xs text-muted">
                        +91 {a.phone} · {a.role.replace('field_', '')}
                      </p>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{a.today}</td>
                    <td className="px-3 py-2 tabular-nums">{a.week}</td>
                    <td className="px-3 py-2 tabular-nums">{a.approvalRate == null ? '–' : `${a.approvalRate}%`}</td>
                    <td className="px-3 py-2 tabular-nums">{a.openLeads}</td>
                    <td className="px-3 py-2 text-xs">{a.areas.map((x) => x.name).join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-muted">Create field agents in Users (role: field agent).</p>
          </div>
        ))}

      {tab === 'areas' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button className="btn-primary" onClick={() => setCreating(true)} disabled={!filters.data}>
              + New beat
            </button>
          </div>
          {areas.loading && <Loading />}
          <div className="grid gap-4 lg:grid-cols-2">
            {areas.data?.data.map((a) => {
              const ring = a.boundary?.coordinates[0]?.map(([lng, lat]) => [lat, lng] as [number, number]);
              const city = filters.data?.cities.find((c) => c.id === a.cityId);
              return (
                <div key={a.id} className="card overflow-hidden">
                  {ring && city && <Map className="h-44 rounded-none" center={[city.lat, city.lng]} pins={[]} areas={[{ id: a.id, ring }]} />}
                  <div className="space-y-2 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold">
                        {a.name} <span className="font-normal text-muted">· {a.city.name}</span>
                      </p>
                      <button className="text-xs text-muted hover:text-red-600" onClick={() => confirm(`Delete beat ${a.name}?`) && run(() => api(`/v1/admin/field/areas/${a.id}`, { method: 'DELETE' }), 'Beat deleted')}>
                        Delete
                      </button>
                    </div>
                    <p className="text-xs text-muted">{a._count.leads} leads in this beat</p>
                    <ul className="space-y-1">
                      {a.assignments.map((x) => (
                        <li key={x.id} className="flex items-center justify-between gap-2 text-xs">
                          <span>
                            👤 {x.agent.name ?? x.agent.phone} · from {x.startsOn.slice(0, 10)}
                            {x.endsOn && ` to ${x.endsOn.slice(0, 10)}`}
                          </span>
                          <button className="text-muted underline" onClick={() => run(() => api(`/v1/admin/field/assignments/${x.id}`, { method: 'DELETE' }), 'Assignment ended')}>
                            End
                          </button>
                        </li>
                      ))}
                    </ul>
                    <button className="btn-outline py-1 text-xs" onClick={() => setAssign({ areaId: a.id, agentId: '', startsOn: new Date().toISOString().slice(0, 10), endsOn: '' })}>
                      + Assign agent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'report' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {[7, 14, 30].map((d) => (
              <button key={d} className={`chip py-1 ${days === d ? 'chip-on' : ''}`} onClick={() => setDays(d)}>
                {d} days
              </button>
            ))}
          </div>
          {report.loading && <Loading />}
          {report.data && (
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-xs text-muted">
                    <tr>
                      <th className="px-3 py-2">Agent</th>
                      {pivot.dayList.map((d) => (
                        <th key={d} className="px-2 py-2 text-right whitespace-nowrap">
                          {d.slice(5)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pivot.byAgent.map(([agent, counts]) => (
                      <tr key={agent}>
                        <td className="px-3 py-2 whitespace-nowrap">{agent}</td>
                        {pivot.dayList.map((d) => (
                          <td key={d} className="px-2 py-2 text-right tabular-nums">
                            {counts[d] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pivot.byAgent.length === 0 && <p className="p-4 text-sm text-muted">No captures in this period.</p>}
              </div>
              <div className="card p-3">
                <h3 className="mb-2 text-sm font-semibold">By town</h3>
                <ul className="space-y-1 text-sm">
                  {pivot.byTown.map(([town, n]) => (
                    <li key={town} className="flex justify-between">
                      <span>{town}</span>
                      <span className="tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {creating && filters.data && <AreaEditor filters={filters.data} onClose={() => setCreating(false)} onSaved={() => { setFlash('Beat created'); areas.reload(); }} />}
      <Modal open={!!assign} onClose={() => setAssign(null)} title="Assign agent to beat">
        {assign && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api('/v1/admin/field/assignments', { method: 'POST', body: { ...assign, endsOn: assign.endsOn || null } }), 'Agent assigned').then(() => setAssign(null));
            }}
          >
            <Field label="Agent">
              <select className="input" value={assign.agentId} onChange={(e) => setAssign({ ...assign, agentId: e.target.value })} required>
                <option value="">Pick…</option>
                {agents.data?.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name ?? a.phone}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <input type="date" className="input" value={assign.startsOn} onChange={(e) => setAssign({ ...assign, startsOn: e.target.value })} required />
              </Field>
              <Field label="To (optional)">
                <input type="date" className="input" value={assign.endsOn} min={assign.startsOn} onChange={(e) => setAssign({ ...assign, endsOn: e.target.value })} />
              </Field>
            </div>
            <button className="btn-primary w-full" disabled={!assign.agentId}>
              Assign
            </button>
          </form>
        )}
      </Modal>
      {flash}
    </div>
  );
}
