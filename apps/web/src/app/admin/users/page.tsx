'use client';

import { useState } from 'react';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Field, Loading, Modal, StatusPill, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { ago, humanize } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type User = {
  id: string;
  name: string | null;
  phone: string;
  role: string;
  status: string;
  createdAt: string;
  _count: { reviews: number; memberships: number; submissions: number };
};
const ROLES = ['user', 'field_agent', 'field_supervisor', 'admin'] as const;

function AddUser({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('field_agent');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/v1/admin/users', { method: 'POST', body: { phone, role, ...(name.trim() ? { name: name.trim() } : {}) } });
      setPhone('');
      setName('');
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Add staff member">
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <p className="text-sm text-muted">If the number already has an account, its role is updated. They sign in with an OTP to that number.</p>
        <Field label="Mobile number">
          <input className="input" inputMode="numeric" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} required />
        </Field>
        <Field label="Name">
          <input className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Role">
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn-primary w-full" disabled={busy || !/^[6-9]\d{9}$/.test(phone)}>
          Save
        </button>
      </form>
    </Modal>
  );
}


type UserDetail = {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  memberships: { role: string; restaurant: { id: string; name: string; status: string } }[];
  reviews: { id: string; rating: number; text: string; status: string; createdAt: string; restaurant: { name: string; slug: string } }[];
  reportsAgainst: number;
  reportsFiled: number;
  history: { id: string; action: string; entityType: string; createdAt: string }[];
};

function UserHistory({ id, onClose }: { id: string | null; onClose: () => void }) {
  const d = useApi<UserDetail>(id ? `/v1/admin/users/${id}` : null);
  const u = d.data;
  return (
    <Modal open={!!id} onClose={onClose} title={u ? u.name ?? `+91 ${u.phone}` : 'User'} wide>
      {!u ? (
        <Loading />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-muted">
            +91 {u.phone}
            {u.email && ` · ${u.email}`} · {humanize(u.role)} · joined {ago(u.createdAt)}
            {u.lastLoginAt && ` · last sign-in ${ago(u.lastLoginAt)}`} · <StatusPill status={u.status} />
          </p>
          <p>
            {u.reviews.length} recent reviews · {u.reportsAgainst} reports against their reviews · {u.reportsFiled} reports filed
          </p>
          {u.memberships.length > 0 && (
            <div>
              <p className="label">Restaurants</p>
              <ul className="space-y-1">
                {u.memberships.map((m) => (
                  <li key={m.restaurant.id}>
                    {m.restaurant.name} · {m.role} <StatusPill status={m.restaurant.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {u.reviews.length > 0 && (
            <div>
              <p className="label">Reviews</p>
              <ul className="max-h-60 divide-y divide-border overflow-y-auto">
                {u.reviews.map((r) => (
                  <li key={r.id} className="py-1.5">
                    <b>{r.rating}★</b> {r.restaurant.name} · {ago(r.createdAt)} <StatusPill status={r.status} />
                    <p className="line-clamp-2 text-xs text-muted">{r.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {u.history.length > 0 && (
            <div>
              <p className="label">Audit trail</p>
              <ul className="max-h-40 overflow-y-auto font-mono text-xs">
                {u.history.map((h) => (
                  <li key={h.id}>
                    {h.createdAt.slice(0, 16).replace('T', ' ')} {h.action} ({h.entityType})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Users() {
  const [viewing, setViewing] = useState<string | null>(null);
  const { me } = useSession();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');
  const users = useApi<{ data: User[] }>('/v1/admin/users', { q: query, role });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();

  async function update(u: User, data: { role?: string; status?: string }) {
    if (data.status === 'suspended' && !confirm(`Suspend ${u.name ?? u.phone}? They will be signed out and can't sign in.`)) return;
    setError(null);
    try {
      await api(`/v1/admin/users/${u.id}`, { method: 'PATCH', body: data });
      setFlash('Updated');
      users.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Users"
        actions={
          <button className="btn-primary" onClick={() => setAdding(true)}>
            + Add staff
          </button>
        }
      />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(q.trim());
        }}
      >
        <input className="input max-w-xs" placeholder="Search phone or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input w-auto" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {humanize(r)}
            </option>
          ))}
        </select>
        <button className="btn-outline">Search</button>
      </form>
      <ErrorNote message={error ?? users.error} />
      {users.loading && <Loading />}
      {users.data && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Activity</th>
                <th className="px-3 py-2">Joined</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.data.data.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id}>
                    <td className="px-3 py-2">
                      <button className="font-medium text-brand hover:underline" onClick={() => setViewing(u.id)}>
                        {u.name ?? '—'}
                      </button>
                      <p className="text-xs text-muted">+91 {u.phone}</p>
                    </td>
                    <td className="px-3 py-2">
                      <select className="input w-auto py-1 text-xs" value={u.role} disabled={self} onChange={(e) => update(u, { role: e.target.value })}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {humanize(r)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">
                      {u._count.reviews} reviews · {u._count.memberships} restaurants · {u._count.submissions} captures
                    </td>
                    <td className="px-3 py-2 text-xs text-muted">{ago(u.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <StatusPill status={u.status} />
                        {!self && (
                          <button className="text-xs text-muted underline" onClick={() => update(u, { status: u.status === 'active' ? 'suspended' : 'active' })}>
                            {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AddUser open={adding} onClose={() => setAdding(false)} onDone={() => { setFlash('Saved'); users.reload(); }} />
      <UserHistory id={viewing} onClose={() => setViewing(null)} />
      {flash}
    </div>
  );
}
