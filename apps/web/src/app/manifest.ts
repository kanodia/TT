import type { MetadataRoute } from 'next';
import { serverFetch } from '@/lib/serverApi';

// Brand comes from admin settings (spec 11.6), so a rebrand needs no redeploy.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  let brand = { appName: 'TwiggyTomato', shortName: 'TT', tagline: 'Find great food near you', primaryColor: '#e23744' };
  try {
    const res = await serverFetch('/v1/config', { next: { revalidate: 3600 } });
    if (res.ok) brand = (await res.json()).brand;
  } catch {
    /* API down at build time: defaults */
  }
  return {
    name: brand.appName,
    short_name: brand.appName.length <= 12 ? brand.appName : brand.shortName,
    description: brand.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: brand.primaryColor,
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
    shortcuts: [{ name: 'Field capture', url: '/field/capture' }],
  };
}
