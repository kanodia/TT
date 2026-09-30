'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { PartnerCtx } from '@/components/partner/context';
import { ErrorNote, Loading, NavTabs, StatusPill } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { restaurantHref } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { PartnerArea, PartnerRestaurant } from '@/lib/types';
import { useApi } from '@/lib/useApi';

export default function PartnerRestaurantLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const { t } = useSession();
  const r = useApi<PartnerRestaurant>(`/v1/partner/restaurants/${id}`);
  const restaurant = r.data ?? r.stale;
  const reload = r.reload;
  const ctx = useMemo(() => (restaurant ? { restaurant, reload, can: (a: PartnerArea) => restaurant.permissions.includes(a) } : null), [restaurant, reload]);

  if (r.error) return <ErrorNote message={r.error} onRetry={r.reload} />;
  if (!ctx || !restaurant) return <Loading />;

  const base = `/partner/${id}`;
  const tabs: { href: string; label: string; area: PartnerArea }[] = [
    { href: base, label: t('ptab.dashboard'), area: 'menu' },
    { href: `${base}/profile`, label: t('ptab.profile'), area: 'profile' },
    { href: `${base}/hours`, label: t('ptab.hours'), area: 'profile' },
    { href: `${base}/menu`, label: t('ptab.menu'), area: 'menu' },
    { href: `${base}/photos`, label: t('ptab.photos'), area: 'photos' },
    { href: `${base}/reviews`, label: t('ptab.reviews'), area: 'reviews' },
    { href: `${base}/offers`, label: t('ptab.offers'), area: 'offers' },
    { href: `${base}/team`, label: t('ptab.team'), area: 'team' },
    { href: `${base}/settings`, label: t('ptab.settings'), area: 'menu' },
  ];

  return (
    <PartnerCtx.Provider value={ctx}>
      <div className="mb-4">
        <Link href="/partner" className="text-sm text-muted hover:text-foreground">
          ← {t('partner.myRestaurants')}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{restaurant.name}</h1>
          <StatusPill status={restaurant.status} />
          {restaurant.isVerified && <span className="text-xs font-medium text-blue-700">✔ {t('detail.verified')}</span>}
          {restaurant.status === 'live' && (
            <Link href={restaurantHref({ slug: restaurant.slug, citySlug: restaurant.city.slug })} target="_blank" className="text-sm text-brand">
              {t('partner.viewPublic')}
            </Link>
          )}
        </div>
        <p className="text-sm text-muted">
          {restaurant.addressLine}, {restaurant.city.name} · {t('partner.youAre', { role: t(`role.${restaurant.myRole}` as MessageKey) })}
        </p>
      </div>
      <NavTabs items={tabs.filter((tab) => restaurant.permissions.includes(tab.area))} active={pathname} />
      <div className="pt-6">{children}</div>
    </PartnerCtx.Provider>
  );
}
