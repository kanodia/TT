import { serverFetch } from '@/lib/serverApi';

/** Install manifest for the partner portal: its own name, start page and scope (brand from /v1/config, spec 11.6). */
export async function GET() {
  let brand = { appName: 'TwiggyTomato', primaryColor: '#e23744' };
  try {
    const res = await serverFetch('/v1/config', { next: { revalidate: 3600 } });
    if (res.ok) brand = (await res.json()).brand;
  } catch {
    /* API down: defaults */
  }
  const manifest = {
    id: '/partner',
    name: `${brand.appName} Partner`,
    short_name: 'Partner',
    description: 'Manage your restaurant: menu, hours, photos, offers and reviews.',
    start_url: '/partner',
    scope: '/partner',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: brand.primaryColor,
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    shortcuts: [{ name: 'My restaurants', url: '/partner' }],
  };
  return new Response(JSON.stringify(manifest), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'public, max-age=3600' } });
}
