'use client';

import Link from 'next/link';
import { useSession } from '@/lib/session';

export type LegalSection = { title: string; body: (string | string[])[] };

/**
 * Legal pages. DRAFT text written for a DPDP Act 2023 notice — it must be reviewed by a lawyer,
 * completed (company name, grievance officer, jurisdiction) and translated before launch.
 */
export function Legal({ title, updated, sections }: { title: string; updated: string; sections: (brand: string, email: string) => LegalSection[] }) {
  const { config, lang } = useSession();
  const { appName, supportEmail } = config.brand;
  return (
    <article className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        Draft for legal review — not yet in force.
        {lang === 'hi' && ' हिन्दी अनुवाद कानूनी समीक्षा के बाद जोड़ा जाएगा।'}
      </p>
      <header>
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted">Last updated {updated}</p>
      </header>
      {sections(appName, supportEmail).map((s, i) => (
        <section key={s.title} className="space-y-2">
          <h2 className="text-lg font-semibold">
            {i + 1}. {s.title}
          </h2>
          {s.body.map((b, j) =>
            Array.isArray(b) ? (
              <ul key={j} className="list-disc space-y-1 pl-6 text-sm">
                {b.map((li) => (
                  <li key={li}>{li}</li>
                ))}
              </ul>
            ) : (
              <p key={j} className="text-sm leading-relaxed">
                {b}
              </p>
            ),
          )}
        </section>
      ))}
      <p className="border-t border-border pt-4 text-sm text-muted">
        See also: <Link href="/privacy" className="text-brand underline">Privacy Policy</Link> · <Link href="/terms" className="text-brand underline">Terms of Use</Link> ·{' '}
        <Link href="/account#privacy" className="text-brand underline">Download or delete your data</Link>
      </p>
    </article>
  );
}
