'use client';

import { Shell } from '@/components/Shell';
import { useSession } from '@/lib/session';

// The admin console is an internal ops tool and stays in English.
const NAV = [
  { href: '/admin', label: 'Overview', exact: true, adminOnly: false },
  { href: '/admin/verifications', label: 'Verifications', adminOnly: true },
  { href: '/admin/moderation', label: 'Moderation', adminOnly: true },
  { href: '/admin/reports', label: 'Reports', adminOnly: true },
  { href: '/admin/captures', label: 'Field captures', adminOnly: false },
  { href: '/admin/field', label: 'Field ops', adminOnly: false },
  { href: '/admin/leads', label: 'Leads', adminOnly: false },
  { href: '/admin/restaurants', label: 'Restaurants', adminOnly: true },
  { href: '/admin/collections', label: 'Collections', adminOnly: true },
  { href: '/admin/catalog', label: 'Catalogue', adminOnly: true },
  { href: '/admin/users', label: 'Users', adminOnly: true },
  { href: '/admin/settings', label: 'Settings', adminOnly: true },
  { href: '/admin/audit', label: 'Audit log', adminOnly: true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { me } = useSession();
  const isAdmin = me?.role === 'admin';
  return (
    <Shell area="Admin" width="max-w-7xl" roles={['admin', 'field_supervisor']} nav={NAV.filter((n) => isAdmin || !n.adminOnly)}>
      {children}
    </Shell>
  );
}
