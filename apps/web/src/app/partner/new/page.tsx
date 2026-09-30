'use client';

import { useRouter } from 'next/navigation';
import { EMPTY_PROFILE, ProfileForm } from '@/components/partner/ProfileForm';
import { PageTitle } from '@/components/Shell';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Shift } from '@/lib/types';

const DEFAULT_HOURS: Shift[] = Array.from({ length: 7 }, (_, d) => ({ dayOfWeek: d, opensAt: '10:00', closesAt: '22:00' }));

export default function NewRestaurant() {
  const router = useRouter();
  const { refreshMe, t } = useSession();
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title={t('partner.addRestaurant')} sub={t('partner.newSub')} />
      <ProfileForm
        initial={EMPTY_PROFILE}
        hours={DEFAULT_HOURS}
        submitLabel={t('partner.saveContinue')}
        onSubmit={async (p, hours) => {
          const r = await api<{ id: string }>('/v1/partner/restaurants', { method: 'POST', body: p });
          // The listing exists now; if hours fail, the dashboard checklist asks for them rather than risking a duplicate on retry.
          if (hours) await api(`/v1/partner/restaurants/${r.id}/hours`, { method: 'PUT', body: { shifts: hours } }).catch(() => {});
          await refreshMe();
          router.push(`/partner/${r.id}?created=1`);
        }}
      />
    </div>
  );
}
