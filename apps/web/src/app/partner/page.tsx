'use client';

import Link from 'next/link';
import { PageTitle } from '@/components/Shell';
import { Cover, Empty, ErrorNote, Loading, RatingBadge, StatusPill } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { ago } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { PartnerSummary, Verification } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Claim = Verification & { restaurant: { id: string; name: string } };

export default function PartnerHome() {
  const { t } = useSession();
  const list = useApi<{ data: PartnerSummary[]; claims: Claim[] }>('/v1/partner/restaurants');

  if (list.loading) return <Loading />;
  if (list.error) return <ErrorNote message={list.error} onRetry={list.reload} />;
  const { data, claims } = list.data!;

  return (
    <div className="space-y-6">
      <PageTitle
        title={t('partner.myRestaurants')}
        sub={t('partner.homeSub')}
        actions={
          <>
            <Link href="/partner/claim" className="btn-outline">
              {t('partner.claimExisting')}
            </Link>
            <Link href="/partner/new" className="btn-primary">
              + {t('partner.addRestaurant')}
            </Link>
          </>
        }
      />

      {claims.length > 0 && (
        <div className="card divide-y divide-border">
          {claims.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{t('partner.claimOf', { name: c.restaurant.name })}</p>
                <p className="text-xs text-muted">
                  {t('partner.sent', { when: ago(c.createdAt, t) })}
                  {c.status === 'rejected' && c.decisionNote && ` · ${t('partner.reason', { reason: c.decisionNote })}`}
                </p>
              </div>
              <StatusPill status={c.status} />
            </div>
          ))}
        </div>
      )}

      {data.length === 0 ? (
        <div className="card">
          <Empty title={t('partner.emptyTitle')} icon="🏪">
            {t('partner.emptyBody')}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/partner/new" className="btn-primary">
                {t('partner.addRestaurant')}
              </Link>
              <Link href="/partner/claim" className="btn-outline">
                {t('partner.findClaim')}
              </Link>
            </div>
          </Empty>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((r) => (
            <Link key={r.id} href={`/partner/${r.id}`} className="card flex gap-4 p-4 transition hover:shadow-md">
              <Cover url={r.cover} seed={r.slug} size="sm" className="h-20 w-20 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold">{r.name}</p>
                  <StatusPill status={r.status} />
                </div>
                <p className="text-xs text-muted">
                  {r.city} · {t(`role.${r.role}` as MessageKey)}
                  {r.isVerified && ` · ✔ ${t('detail.verified')}`}
                </p>
                <RatingBadge rating={r.rating} count={r.reviewCount} />
                <p className="text-xs text-muted">{t(`partner.status.${r.status}` as MessageKey)}</p>
                {r.status === 'rejected' && r.latestVerification?.decisionNote && <p className="text-xs text-red-700">{t('partner.reason', { reason: r.latestVerification.decisionNote })}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
