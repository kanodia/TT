'use client';

import { createContext, useContext } from 'react';
import { useSession } from '@/lib/session';
import type { PartnerArea, PartnerRestaurant } from '@/lib/types';

type Ctx = { restaurant: PartnerRestaurant; reload: () => void; can: (a: PartnerArea) => boolean };

export const PartnerCtx = createContext<Ctx | null>(null);

export function usePartner() {
  const ctx = useContext(PartnerCtx);
  if (!ctx) throw new Error('usePartner must be used inside the partner restaurant layout');
  return ctx;
}

export function NoAccess({ area }: { area: string }) {
  const { t } = useSession();
  return <p className="card p-6 text-center text-sm text-muted">{t('partner.noAccess', { area })}</p>;
}
