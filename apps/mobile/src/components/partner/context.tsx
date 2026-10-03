import { createContext, useContext } from 'react';
import type { PartnerArea, PartnerRestaurant } from '@shared/types';

type Ctx = { restaurant: PartnerRestaurant; reload: () => void; can: (a: PartnerArea) => boolean };

/** The restaurant being managed, shared by its tabs and screens (permissions per team role, spec 5.3). */
export const PartnerCtx = createContext<Ctx | null>(null);

export function usePartner() {
  const ctx = useContext(PartnerCtx);
  if (!ctx) throw new Error('usePartner must be used inside a restaurant screen');
  return ctx;
}

/** Badge colours (text, background) per listing / claim status. */
export const STATUS_TONE: Record<string, [string, string]> = {
  live: ['#166534', '#dcfce7'],
  approved: ['#166534', '#dcfce7'],
  pending: ['#92400e', '#fef3c7'],
  draft: ['#374151', '#f3f4f6'],
  rejected: ['#991b1b', '#fee2e2'],
  suspended: ['#991b1b', '#fee2e2'],
};
