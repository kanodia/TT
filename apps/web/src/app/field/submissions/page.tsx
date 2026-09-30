'use client';

import Link from 'next/link';
import { Empty, ErrorNote, Loading, StatusPill } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { ago } from '@/lib/format';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type Submission = { id: string; name: string; addressLine: string; status: string; reviewNote: string | null; capturedAt: string; restaurantId: string | null };
type Visit = { id: string; outcome: string; revisitOn: string | null; note: string | null; createdAt: string; lead: { name: string } | null; restaurant: { name: string } | null };

export default function Submissions() {
  const { t } = useSession();
  const subs = useApi<{ data: Submission[] }>('/v1/field/me/submissions');
  const visits = useApi<{ data: Visit[] }>('/v1/field/me/visits');
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">{t('fsubs.title')}</h1>
        <ErrorNote message={subs.error} onRetry={subs.reload} />
        {subs.loading && <Loading />}
        {subs.data?.data.length === 0 && (
          <Empty title={t('fsubs.empty')} icon="🧭">
            {t('fsubs.emptyBody')}
          </Empty>
        )}
        <ul className="card divide-y divide-border">
          {subs.data?.data.map((s) => (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.addressLine} · {t('fsubs.captured', { when: ago(s.capturedAt, t) })}
                  </p>
                </div>
                <StatusPill status={s.status} />
              </div>
              {s.status === 'sent_back' && (
                <div className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-900">
                  {s.reviewNote && (
                    <p>
                      <b>{t('fsubs.reviewer')}:</b> {s.reviewNote}
                    </p>
                  )}
                  <Link href={`/field/capture?resubmit=${s.id}`} className="mt-1 inline-block font-medium underline">
                    {t('fsubs.fix')}
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{t('fsubs.visits')}</h2>
        {visits.data?.data.length === 0 && <p className="text-sm text-muted">{t('fsubs.noVisits')}</p>}
        <ul className="card divide-y divide-border text-sm">
          {visits.data?.data.map((v) => (
            <li key={v.id} className="flex items-center justify-between gap-2 px-4 py-2">
              <span>
                {v.lead?.name ?? v.restaurant?.name ?? '—'} · {t(`fvisit.outcome.${v.outcome}` as MessageKey)}
                {v.revisitOn && ` → ${v.revisitOn.slice(0, 10)}`}
                {v.note && <span className="block text-xs text-muted">{v.note}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{ago(v.createdAt, t)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
