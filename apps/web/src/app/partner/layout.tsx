import type { Metadata } from 'next';
import { PartnerShell } from '@/components/partner/PartnerShell';

// Owners can add the portal to their home screen as its own app, opening straight into /partner.
export const metadata: Metadata = { manifest: '/partner/manifest.webmanifest' };

export default function PartnerLayout({ children }: LayoutProps<'/partner'>) {
  return <PartnerShell>{children}</PartnerShell>;
}
