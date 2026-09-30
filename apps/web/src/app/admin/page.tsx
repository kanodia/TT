'use client';

import Link from 'next/link';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Loading, Notice, Stat } from '@/components/ui';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Overview = {
  pending: { verifications: number; captures: number; reports: number; leads: number; heldReviews: number; pendingPhotos: number };
  oldestVerificationHours: number | null;
  restaurants: { live: number; unclaimed: number };
  users: number;
};

export default function AdminOverview() {
  const { me } = useSession();
  const o = useApi<Overview>('/v1/admin/overview');
  const isAdmin = me?.role === 'admin';
  if (o.loading) return <Loading />;
  if (!o.data) return <ErrorNote message={o.error} onRetry={o.reload} />;
  const { pending, restaurants, users, oldestVerificationHours } = o.data;

  const queues = [
    { href: '/admin/verifications', label: 'Verifications waiting', n: pending.verifications, help: 'New listings, ownership claims and name/address changes', adminOnly: true },
    { href: '/admin/moderation', label: 'Held reviews & diner photos', n: pending.heldReviews + pending.pendingPhotos, help: `${pending.heldReviews} auto-flagged reviews · ${pending.pendingPhotos} photos`, adminOnly: true },
    { href: '/admin/reports', label: 'Open reports', n: pending.reports, help: 'Flags and info corrections from diners and partners', adminOnly: true },
    { href: '/admin/captures', label: 'Field captures to review', n: pending.captures, help: 'Places captured by the field team', adminOnly: false },
    { href: '/admin/leads', label: 'Open leads', n: pending.leads, help: 'Places to visit, new or assigned', adminOnly: false },
  ].filter((q) => isAdmin || !q.adminOnly);

  return (
    <div className="space-y-6">
      <PageTitle title="Overview" sub="What needs attention today." />
      {isAdmin && oldestVerificationHours != null && oldestVerificationHours > 36 && (
        <Notice tone="warn">The oldest verification has waited {oldestVerificationHours} h. The target is 48 h (spec 5.1).</Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {queues.map((q) => (
          <Link key={q.href} href={q.href} className={`card p-4 transition hover:shadow-md ${q.n ? 'border-brand/40' : ''}`}>
            <div className="text-xs text-muted">{q.label}</div>
            <div className={`mt-1 text-3xl font-semibold tabular-nums ${q.n ? 'text-brand' : ''}`}>{q.n}</div>
            <div className="mt-1 text-xs text-muted">{q.help}</div>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Live restaurants" value={restaurants.live} />
        <Stat label="Live but unclaimed" value={restaurants.unclaimed} sub="Listed by the field team; owner hasn't claimed yet" />
        <Stat label="Registered users" value={users} />
      </div>
    </div>
  );
}
