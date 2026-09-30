'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import type { Me } from '@/lib/types';
import { RequireAuth } from './auth';
import { Bell, Logo } from './Header';

/** Chrome for the partner, field and admin workspaces. */
export function Shell({
  area,
  nav,
  roles,
  intro,
  width = 'max-w-6xl',
  children,
}: {
  area: string;
  nav?: { href: string; label: string; exact?: boolean }[];
  roles?: Me['role'][];
  intro?: string;
  width?: string;
  children: React.ReactNode;
}) {
  const { me, t } = useSession();
  const pathname = usePathname();
  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-white">
        <div className={`mx-auto flex ${width} items-center gap-3 px-4 py-2.5`}>
          <Logo />
          <span className="rounded bg-foreground px-1.5 py-0.5 text-xs font-semibold text-white">{area}</span>
          <nav className="scrollbar-none ml-2 hidden flex-1 gap-1 overflow-x-auto md:flex">
            {nav?.map((n) => {
              const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`rounded-lg px-3 py-1.5 text-sm whitespace-nowrap ${active ? 'bg-brand/10 font-medium text-brand' : 'text-muted hover:bg-surface hover:text-foreground'}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Bell />
            <Link href="/" className="hidden text-muted hover:text-foreground sm:inline">
              {t('nav.dinerSite')}
            </Link>
            {me && (
              <Link href="/account" className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand" title={me.name ?? me.phone}>
                {(me.name ?? me.phone).slice(0, 1).toUpperCase()}
              </Link>
            )}
          </div>
        </div>
        {nav && (
          <nav className="scrollbar-none flex gap-1 overflow-x-auto border-t border-border px-2 py-1.5 md:hidden">
            {nav.map((n) => {
              const active = n.exact ? pathname === n.href : pathname.startsWith(n.href);
              return (
                <Link key={n.href} href={n.href} className={`rounded-lg px-3 py-1 text-sm whitespace-nowrap ${active ? 'bg-brand/10 font-medium text-brand' : 'text-muted'}`}>
                  {n.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main className={`mx-auto w-full ${width} flex-1 px-4 py-6`}>
        <RequireAuth roles={roles} intro={intro}>
          {() => children}
        </RequireAuth>
      </main>
    </div>
  );
}

export function PageTitle({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
