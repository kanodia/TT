'use client';

import { Shell } from '@/components/Shell';
import { useSession } from '@/lib/session';

/** Partner portal chrome (client side: navigation depends on the signed-in user's restaurants). */
export function PartnerShell({ children }: { children: React.ReactNode }) {
  const { t, me } = useSession();
  const multi = (me?.memberships.filter((m) => ['owner', 'manager'].includes(m.role)).length ?? 0) > 1;
  return (
    <Shell
      area={t('partner.area')}
      intro={t('partner.signIn')}
      nav={[{ href: '/partner', label: t('partner.myRestaurants'), exact: true }, ...(multi ? [{ href: '/partner/bulk', label: t('partner.bulk') }] : [])]}
    >
      {children}
    </Shell>
  );
}
