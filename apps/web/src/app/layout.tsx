import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { serverFetch } from '@/lib/serverApi';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

// The brand name is admin-configurable (spec 11.6), so titles are built from /v1/config.
export async function generateMetadata(): Promise<Metadata> {
  let brand = { appName: 'TwiggyTomato', tagline: 'Find great food near you' };
  try {
    const res = await serverFetch('/v1/config', { next: { revalidate: 300 } });
    if (res.ok) brand = (await res.json()).brand;
  } catch {
    /* API unreachable: defaults */
  }
  return {
    title: { default: `${brand.appName} — ${brand.tagline}`, template: `%s · ${brand.appName}` },
    description: 'Discover restaurants, dhabas, sweet shops and cafés in your town — menus, hours, photos and honest reviews.',
  };
}

export const viewport: Viewport = { themeColor: '#e23744', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
