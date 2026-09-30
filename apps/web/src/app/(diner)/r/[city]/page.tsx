import { notFound, permanentRedirect } from 'next/navigation';
import { serverFetch } from '@/lib/serverApi';

// Old single-segment links (/r/<slug>) move to the neutral /r/<city>/<slug> form (spec 11.6).
export default async function LegacyRestaurantRedirect({ params }: PageProps<'/r/[city]'>) {
  const { city: slug } = await params;
  const res = await serverFetch(`/v1/restaurants/${encodeURIComponent(slug)}`, { cache: 'no-store' }).catch(() => null);
  if (!res?.ok) notFound();
  const r = (await res.json()) as { slug: string; citySlug: string };
  permanentRedirect(`/r/${r.citySlug}/${r.slug}`);
}
