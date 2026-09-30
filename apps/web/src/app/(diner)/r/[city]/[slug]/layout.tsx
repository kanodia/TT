import type { Metadata } from 'next';
import { serverFetch } from '@/lib/serverApi';

type R = {
  name: string;
  description: string | null;
  locality: { name: string } | null;
  address: { city: string; line: string; pincode: string | null };
  cuisines: { name: string }[];
  rating: number;
  reviewCount: number;
  costForTwo: number;
  phone: string | null;
  lat: number;
  lng: number;
  photos: { url: string }[];
};

async function load(slug: string): Promise<R | null> {
  try {
    const res = await serverFetch(`/v1/restaurants/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as R) : null;
  } catch {
    return null;
  }
}

// Server-side title/description so shared links and search results show the restaurant.
export async function generateMetadata({ params }: LayoutProps<'/r/[city]/[slug]'>): Promise<Metadata> {
  const { city, slug } = await params;
  const r = await load(slug);
  if (!r) return { title: 'Restaurant' };
  const where = [r.locality?.name, r.address.city].filter(Boolean).join(', ');
  return {
    title: `${r.name}, ${where}`,
    description: r.description ?? `${r.cuisines.map((c) => c.name).join(', ')} in ${where}. Menu, timings, photos and reviews.`,
    alternates: { canonical: `/r/${city}/${slug}` },
  };
}

export default async function RestaurantLayout({ children, params }: LayoutProps<'/r/[city]/[slug]'>) {
  const { slug } = await params;
  const r = await load(slug);
  // schema.org data so search engines can show ratings and cost (SEO-friendly pages, spec 8.1).
  const ld = r && {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: r.name,
    servesCuisine: r.cuisines.map((c) => c.name),
    address: { '@type': 'PostalAddress', streetAddress: r.address.line, addressLocality: r.address.city, postalCode: r.address.pincode ?? undefined, addressCountry: 'IN' },
    geo: { '@type': 'GeoCoordinates', latitude: r.lat, longitude: r.lng },
    ...(r.phone ? { telephone: `+91${r.phone}` } : {}),
    ...(r.costForTwo ? { priceRange: `₹${r.costForTwo} for two` } : {}),
    ...(r.reviewCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: r.rating, reviewCount: r.reviewCount } } : {}),
  };
  return (
    <>
      {ld && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, '\\u003c') }} />}
      {children}
    </>
  );
}
