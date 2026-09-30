'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { media } from '@/lib/api';
import { DIET_COLOR, STATUS_TONE, humanize, openLabel, placeholderFor, ratingColor } from '@/lib/format';
import { useT } from '@/lib/session';
import type { OpenStatus } from '@/lib/types';

export function RatingBadge({ rating, count, size = 'sm' }: { rating: number; count?: number; size?: 'sm' | 'lg' }) {
  const { t, tp } = useT();
  const has = rating > 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-0.5 rounded-md font-semibold text-white ${size === 'lg' ? 'px-2 py-1 text-base' : 'px-1.5 py-0.5 text-xs'}`}
        style={{ background: ratingColor(rating) }}
      >
        {has ? rating.toFixed(1) : t('rating.new')}
        {has && <span aria-hidden>★</span>}
      </span>
      {count !== undefined && has && (
        <span className="text-xs text-muted">{tp('reviews', count)}</span>
      )}
    </span>
  );
}

export function Stars({ value, onChange, size = 24 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <span className="inline-flex" onMouseLeave={() => setHover(0)} role={onChange ? 'radiogroup' : undefined}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          onMouseEnter={() => onChange && setHover(n)}
          onClick={() => onChange?.(n)}
          className="leading-none disabled:cursor-default"
          style={{ fontSize: size, color: n <= shown ? ratingColor(shown) : '#d1d5db' }}
        >
          ★
        </button>
      ))}
    </span>
  );
}

const TONE = { good: 'text-good', warn: 'text-warn', bad: 'text-red-600', muted: 'text-muted' };

export function OpenBadge({ status, className = '' }: { status: OpenStatus; className?: string }) {
  const { t } = useT();
  const { text, tone } = openLabel(status, t);
  return <span className={`text-xs font-medium ${TONE[tone]} ${className}`}>{text}</span>;
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {humanize(status)}
    </span>
  );
}

export function DietMark({ diet }: { diet: string }) {
  const { t } = useT();
  const color = DIET_COLOR[diet] ?? '#6b7280';
  return (
    <span
      title={t(`diet.${diet}` as never)}
      className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border-[1.5px]"
      style={{ borderColor: color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

/** Photo, or a colour + emoji placeholder for the many listings that have none yet. */
export function Cover({
  url,
  seed,
  cuisine,
  className = '',
  alt = '',
  size = 'md',
}: {
  url?: string | null;
  seed: string;
  cuisine?: string;
  className?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const src = media(url, size);
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- photos come from the API host / S3, not next/image
    return <img src={src} alt={alt} loading="lazy" className={`object-cover ${className}`} />;
  }
  const p = placeholderFor(seed, cuisine);
  return (
    <div className={`flex items-center justify-center ${className}`} style={{ background: p.background }} aria-hidden>
      <span className="text-4xl opacity-80">{p.emoji}</span>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent text-brand ${className}`}
      aria-label="Loading"
    />
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useT();
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <Spinner /> {label ?? t('state.loading')}
    </div>
  );
}

export function ErrorNote({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  const { t } = useT();
  if (!message) return null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button className="font-medium underline" onClick={onRetry}>
          {t('action.retry')}
        </button>
      )}
    </div>
  );
}

export function Notice({ children, tone = 'info' }: { children: React.ReactNode; tone?: 'info' | 'good' | 'warn' }) {
  const cls = {
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    good: 'border-green-200 bg-green-50 text-green-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone];
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function Empty({ title, children, icon = '🍽️' }: { title: string; children?: React.ReactNode; icon?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="font-semibold">{title}</p>
      {children && <div className="max-w-sm text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto w-[calc(100%-2rem)] rounded-2xl p-0 backdrop:bg-black/50 ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="font-semibold">{title}</h2>
            <button onClick={onClose} className="rounded-full p-1 text-xl leading-none text-muted hover:bg-surface" aria-label="Close">
              ×
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: React.ReactNode }[];
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-border" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${
            value === t.key ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Link-based tabs for sections that are separate routes. */
export function NavTabs({ items, active }: { items: { href: string; label: string }[]; active: string }) {
  return (
    <nav className="scrollbar-none flex gap-1 overflow-x-auto border-b border-border">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${
            active === t.href ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-foreground'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brand' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${checked ? 'left-5.5' : 'left-0.5'}`} />
      </button>
    </label>
  );
}

export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

/** Small transient confirmation line. */
export function useFlash() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg" role="status">
      {msg}
    </div>
  ) : null;
  return [node, setMsg] as const;
}
