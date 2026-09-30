'use client';

import Link from 'next/link';
import { useState } from 'react';
import { track } from '@/lib/api';
import { distance, nm, priceBand, restaurantHref, rupees } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Card } from '@/lib/types';
import { LoginForm } from './auth';
import { Cover, Modal, OpenBadge, RatingBadge } from './ui';

/** Heart on cards and the detail page; asks to sign in first (spec 2.3 "Save (heart)"). */
export function Heart({ restaurantId, className = '' }: { restaurantId: string; className?: string }) {
  const { me, savedIds, toggleSaved, t } = useSession();
  const [login, setLogin] = useState(false);
  const saved = savedIds.has(restaurantId);
  return (
    <>
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? t('card.unsave') : t('card.save')}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!me) return setLogin(true);
          toggleSaved(restaurantId).catch(() => {});
        }}
        className={`flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-lg shadow ${saved ? 'text-brand' : 'text-gray-600'} ${className}`}
      >
        {saved ? '♥' : '♡'}
      </button>
      <Modal open={login} onClose={() => setLogin(false)} title={t('auth.signIn')}>
        <LoginForm intro={t('card.signInToSave')} onDone={() => setLogin(false)} />
      </Modal>
    </>
  );
}

function Photos({ r, compact }: { r: Card; compact?: boolean }) {
  const [i, setI] = useState(0);
  const photos = r.photos.length ? r.photos : [null];
  return (
    <div className="relative overflow-hidden rounded-xl">
      <Cover url={photos[i]} seed={r.slug} cuisine={r.cuisines[0]?.slug} alt={r.name} className={`w-full transition duration-300 group-hover:scale-[1.03] ${compact ? 'h-36' : 'h-48'}`} />
      {photos.length > 1 && (
        <div className="absolute inset-x-0 bottom-1.5 flex justify-center gap-1" onClick={(e) => e.preventDefault()}>
          {photos.map((_, k) => (
            <button key={k} aria-label={`Photo ${k + 1}`} onClick={() => setI(k)} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-4 bg-white' : 'w-1.5 bg-white/60'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RestaurantCard({ r, compact, position }: { r: Card; compact?: boolean; position?: number }) {
  const { lang, t } = useSession();
  const dist = distance(r.distanceM);
  // Max 3 cuisines, then "+N" (spec 2.3).
  const cuisines = r.cuisines.slice(0, 3).map((c) => nm(c, lang)).join(', ') + (r.cuisines.length > 3 ? ` +${r.cuisines.length - 3}` : '');
  return (
    <Link href={restaurantHref(r)} className={`group block ${compact ? 'w-64 shrink-0' : ''}`} onClick={() => track('card_tap', r.id, { position, promoted: r.isPromoted })}>
      <div className="relative">
        <Photos r={r} compact={compact} />
        {r.offer && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-blue-900/90 to-transparent px-3 pt-6 pb-3 text-xs font-semibold text-white">🏷️ {r.offer.title}</div>
        )}
        {r.isPromoted && <span className="absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{t('card.promoted')}</span>}
        <Heart restaurantId={r.id} className="absolute top-2 right-2" />
      </div>
      <div className="mt-2 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold">
            {nm(r, lang)}
            {r.isVerified && (
              <span className="ml-1 text-xs text-blue-600" title={t('card.verified')}>
                ✔
              </span>
            )}
          </h3>
          <RatingBadge rating={r.rating} />
        </div>
        <div className="flex justify-between gap-2 text-sm text-muted">
          <span className="line-clamp-1">{cuisines || nm(r.type, lang)}</span>
          {r.costForTwo > 0 && (
            <span className="shrink-0" title={priceBand(r.priceBand)}>
              {t('card.forTwo', { cost: rupees(r.costForTwo) })}
            </span>
          )}
        </div>
        <div className="flex justify-between gap-2 text-xs text-muted">
          <OpenBadge status={r.openStatus} />
          <span className="shrink-0">{[nm(r.locality, lang), dist].filter(Boolean).join(' · ')}</span>
        </div>
        {r.tags.length > 0 && (
          <div className="flex gap-1.5 pt-0.5">
            {r.tags.map((tag) => (
              <span key={tag.key} className="rounded bg-surface px-1.5 py-0.5 text-[11px] text-muted">
                {nm(tag, lang)}
              </span>
            ))}
            <span className="ml-auto text-[11px] text-muted">{priceBand(r.priceBand)}</span>
          </div>
        )}
      </div>
    </Link>
  );
}

export function CardGridSkeleton({ n = 6 }: { n?: number }) {
  return (
    <div className="grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-48 rounded-xl bg-surface" />
          <div className="mt-2 h-4 w-2/3 rounded bg-surface" />
          <div className="mt-1.5 h-3 w-1/2 rounded bg-surface" />
        </div>
      ))}
    </div>
  );
}
