'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Map } from '@/components/Map';
import { RestaurantCard } from '@/components/RestaurantCard';
import { LoginForm } from '@/components/auth';
import { Menu } from '@/components/restaurant/Menu';
import { ReportDialog } from '@/components/restaurant/ReportDialog';
import { Reviews, WriteReview } from '@/components/restaurant/Reviews';
import { SaveToList } from '@/components/restaurant/SaveToList';
import { Cover, Empty, ErrorNote, Loading, Modal, OpenBadge, RatingBadge, Spinner, Tabs, useFlash } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, media, track } from '@/lib/api';
import { DAY_LONG_KEYS, ago, dayDate, distance, hoursByDay, nm, priceBand, rupees, shiftLabel, shortDate } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Detail } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type Tab = 'overview' | 'menu' | 'reviews' | 'photos';
type PhotoPage = { data: { id: string; url: string; category: string; source: string }[]; total: number; counts: Record<string, number>; nextCursor: string | null };

function Lightbox({ urls, index, onClose }: { urls: string[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setI((n) => (n + 1) % urls.length);
      if (e.key === 'ArrowLeft') setI((n) => (n - 1 + urls.length) % urls.length);
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [urls.length, onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={onClose} role="dialog" aria-modal>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={media(urls[i], 'lg')!} alt="" className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
      <button className="absolute top-4 right-4 text-3xl text-white" onClick={onClose} aria-label="Close">
        ×
      </button>
      {urls.length > 1 && (
        <>
          <button className="absolute left-3 rounded-full bg-white/20 px-3 py-2 text-2xl text-white" onClick={(e) => { e.stopPropagation(); setI((i - 1 + urls.length) % urls.length); }} aria-label="Previous">
            ‹
          </button>
          <button className="absolute right-3 rounded-full bg-white/20 px-3 py-2 text-2xl text-white" onClick={(e) => { e.stopPropagation(); setI((i + 1) % urls.length); }} aria-label="Next">
            ›
          </button>
          <span className="absolute bottom-4 text-sm text-white/80">
            {i + 1} / {urls.length}
          </span>
        </>
      )}
    </div>
  );
}

/** Photos tab: category filter, restaurant + diner photos, paginated (spec 4.4). */
function PhotosTab({ restaurantId, onOpen, onReport }: { restaurantId: string; onOpen: (urls: string[], i: number) => void; onReport: (id: string) => void }) {
  const { t } = useSession();
  const [category, setCategory] = useState<string>('');
  const [pages, setPages] = useState<{ key: string; items: PhotoPage['data']; next: string | null; counts: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    api<PhotoPage>(`/v1/restaurants/${restaurantId}/photos`, { query: { category: category || undefined } })
      .then((r) => live && setPages({ key: category, items: r.data, next: r.nextCursor, counts: r.counts }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [restaurantId, category]);
  if (!pages) return <Loading />;
  const urls = pages.items.map((p) => p.url);
  const total = Object.values(pages.counts).reduce((a, b) => a + b, 0);
  if (!total) return <Empty title={t('photos.emptyTitle')} icon="📷">{t('photos.emptyBody')}</Empty>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {['', 'food', 'ambience', 'menu', 'exterior'].map((c) => (
          <button key={c} className={`chip ${category === c ? 'chip-on' : ''}`} onClick={() => setCategory(c)} disabled={!!c && !pages.counts[c]}>
            {t(`photos.cat.${c || 'all'}` as MessageKey)} ({c ? (pages.counts[c] ?? 0) : total})
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {pages.items.map((p, i) => (
          <div key={p.id} className="group relative">
            <button onClick={() => onOpen(urls, i)} className="block w-full">
              <Cover url={p.url} seed={p.id} size="sm" className="aspect-square w-full rounded-lg" />
            </button>
            <span className="absolute bottom-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
              {t(`photos.cat.${p.category}` as MessageKey)}
              {p.source === 'diner' && ` · ${t('photos.byDiner')}`}
            </span>
            <button onClick={() => onReport(p.id)} className="absolute top-2 right-2 hidden rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {t('review.report')}
            </button>
          </div>
        ))}
      </div>
      {pages.next && (
        <div className="text-center">
          <button
            className="btn-outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await api<PhotoPage>(`/v1/restaurants/${restaurantId}/photos`, { query: { category: category || undefined, cursor: pages.next } }).catch(() => null);
              if (r) setPages({ ...pages, items: [...pages.items, ...r.data], next: r.nextCursor });
              setBusy(false);
            }}
          >
            {busy ? <Spinner className="h-4 w-4" /> : t('action.showMore')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function RestaurantPage() {
  const { slug } = useParams<{ city: string; slug: string }>();
  const { place, lang, me, t, tp, savedIds, toggleSaved } = useSession();
  // Re-fetch once signed in so saved state reflects the user.
  const detail = useApi<Detail>(`/v1/restaurants/${slug}`, { lat: place.lat, lng: place.lng, u: me?.id });
  const [tab, setTab] = useState<Tab>('overview');
  const [writing, setWriting] = useState(false);
  const [reviewVersion, setReviewVersion] = useState(0);
  const [report, setReport] = useState<{ type: 'review' | 'photo' | 'restaurant'; id: string } | null>(null);
  const [lightbox, setLightbox] = useState<{ urls: string[]; i: number } | null>(null);
  const [lists, setLists] = useState<string[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [flash, setFlash] = useFlash();
  const r = detail.data;

  useEffect(() => {
    if (r?.id) track('view', r.id);
  }, [r?.id]);

  if (detail.loading && !detail.stale) return <Loading />;
  if (detail.error) {
    return detail.error.includes('not found') ? (
      <Empty title={t('detail.notFoundTitle')} icon="🤷">
        {t('detail.notFoundBody')}{' '}
        <Link href="/restaurants" className="text-brand underline">
          {t('detail.browseNearby')}
        </Link>
      </Empty>
    ) : (
      <div className="mx-auto max-w-6xl px-4 py-8">
        <ErrorNote message={detail.error} onRetry={detail.reload} />
      </div>
    );
  }
  if (!r) return <Loading />;

  const inLists = lists ?? r.savedInLists;
  const isSaved = savedIds.has(r.id) || inLists.length > 0;
  const photoUrls = r.photos.map((p) => p.url);
  const today = new Date().getDay();
  const byDay = hoursByDay(r.hours);
  const dist = distance(r.distanceM);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`;
  const groups = ['dietary', 'occasion', 'feature', 'service', 'payment'].map((g) => ({ g, items: r.attributes.filter((a) => a.group === g) })).filter((x) => x.items.length);
  const policies = [
    ['detail.dressCode', r.policies.dressCode],
    ['detail.agePolicy', r.policies.agePolicy],
    ['detail.alcoholPolicy', r.policies.alcoholPolicy],
    ['detail.parking', r.parkingInfo],
    ['detail.wait', r.avgWaitMins != null ? t('detail.waitMins', { n: r.avgWaitMins }) : null],
    ['detail.bestTime', r.bestTimeToVisit],
    ['detail.allergens', r.allergenNotes],
  ].filter(([, v]) => v) as [MessageKey, string][];

  async function toggleSave() {
    if (!me) return setNeedLogin(true);
    try {
      const saved = await toggleSaved(r!.id);
      setLists(saved ? inLists : []);
      setFlash(saved ? t('detail.savedFlash') : t('detail.unsavedFlash'));
    } catch {
      /* rolled back in session */
    }
  }

  async function share() {
    track('action_share', r!.id);
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: r!.name, url });
      else {
        await navigator.clipboard.writeText(url);
        setFlash(t('detail.linkCopied'));
      }
    } catch {
      /* dismissed */
    }
  }

  const openTab = (k: Tab) => {
    setTab(k);
    track('detail_tab_view', r.id, { tab: k });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      {/* Gallery: mosaic once there are enough photos, otherwise one wide hero. */}
      {photoUrls.length >= 5 ? (
        <div className="grid h-56 grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-2xl sm:h-80">
          <button className="col-span-4 row-span-2 sm:col-span-2" onClick={() => setLightbox({ urls: photoUrls, i: 0 })}>
            <Cover url={photoUrls[0]} seed={r.slug} alt={r.name} size="lg" className="h-full w-full" />
          </button>
          {photoUrls.slice(1, 5).map((u, i) => (
            <button key={u} className="relative hidden sm:block" onClick={() => setLightbox({ urls: photoUrls, i: i + 1 })}>
              <Cover url={u} seed={u} className="h-full w-full" />
              {i === 3 && r.photoCount > 5 && <span className="absolute inset-0 flex items-center justify-center bg-black/50 font-semibold text-white">{t('detail.morePhotos', { n: r.photoCount - 5 })}</span>}
            </button>
          ))}
        </div>
      ) : (
        <button className="relative block h-56 w-full overflow-hidden rounded-2xl sm:h-72" onClick={() => photoUrls.length && setLightbox({ urls: photoUrls, i: 0 })} disabled={!photoUrls.length}>
          <Cover url={photoUrls[0]} seed={r.slug} cuisine={r.cuisines[0]?.slug} alt={r.name} size="lg" className="h-full w-full" />
          {r.photoCount > 1 && <span className="absolute right-3 bottom-3 rounded-lg bg-black/60 px-2.5 py-1 text-sm font-medium text-white">📷 {t('detail.photoCount', { n: r.photoCount })}</span>}
        </button>
      )}

      {/* Header: the decision on the first screen (spec 4.1) */}
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">
            {nm(r, lang)}
            {lang === 'en' && r.nameHi && <span className="ml-2 text-lg font-normal text-muted">{r.nameHi}</span>}
          </h1>
          <p className="mt-1 text-muted">{r.cuisines.map((c) => nm(c, lang)).join(', ')}</p>
          <p className="text-sm text-muted">
            {[nm(r.type, lang), nm(r.locality, lang), r.address.city].filter(Boolean).join(' · ')}
            {dist && ` · ${t('detail.away', { d: dist })}`}
            {r.travel && ` · ${t(r.travel.mode === 'walk' ? 'detail.walk' : 'detail.drive', { n: r.travel.minutes })}`}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <OpenBadge status={r.openStatus} className="text-sm" />
            {r.todayHours.windows.length > 0 && (
              <span className="text-muted">
                {t('detail.today')}: {r.todayHours.windows.map((w) => shiftLabel(w, t)).join(', ')}
                {r.todayHours.isSpecial && r.todayHours.note && ` (${r.todayHours.note})`}
              </span>
            )}
            {r.costForTwo > 0 && (
              <span className="text-muted">
                {t('detail.costForTwo', { cost: rupees(r.costForTwo) })} · {priceBand(r.priceBand)}
              </span>
            )}
            {r.isVerified ? (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">✔ {t('detail.verified')}</span>
            ) : r.isClaimed ? (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{t('detail.claimed')}</span>
            ) : (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600" title={t('detail.unclaimedHint')}>
                {t('detail.unclaimed')}
              </span>
            )}
          </div>
        </div>
        <button className="shrink-0 text-center" onClick={() => openTab('reviews')}>
          <RatingBadge rating={r.rating} size="lg" />
          <p className="mt-0.5 text-xs text-muted">{tp('reviews', r.reviewCount)}</p>
        </button>
      </div>

      {/* Action bar (spec 4.1) */}
      <div className="scrollbar-none mt-4 flex gap-2 overflow-x-auto">
        <a href={directions} target="_blank" rel="noreferrer" className="btn-outline shrink-0" onClick={() => track('action_directions', r.id)}>
          🧭 {t('detail.directions')}
        </a>
        {r.phone && (
          <a href={`tel:+91${r.phone}`} className="btn-outline shrink-0" onClick={() => track('action_call', r.id)}>
            📞 {t('detail.call')}
          </a>
        )}
        {r.whatsapp && (
          <a href={`https://wa.me/91${r.whatsapp}`} target="_blank" rel="noreferrer" className="btn-outline shrink-0" onClick={() => track('action_call', r.id, { via: 'whatsapp' })}>
            💬 WhatsApp
          </a>
        )}
        {(r.bookingUrl || r.attributes.some((a) => a.key === 'table_reservation')) && (r.bookingUrl || r.phone) && (
          <a
            href={r.bookingUrl ?? `tel:+91${r.phone}`}
            target={r.bookingUrl ? '_blank' : undefined}
            rel="noreferrer"
            className="btn-primary shrink-0"
            onClick={() => track('action_book', r.id)}
          >
            📅 {t('detail.book')}
          </a>
        )}
        <button className={`btn-outline shrink-0 ${isSaved ? 'border-brand text-brand' : ''}`} onClick={toggleSave}>
          {isSaved ? `♥ ${t('detail.saved')}` : `♡ ${t('detail.save')}`}
        </button>
        {me && (
          <button className="btn-outline shrink-0" onClick={() => setChoosing(true)} title={t('lists.saveTo')}>
            ＋ {t('lists.list')}
          </button>
        )}
        <button className="btn-outline shrink-0" onClick={share}>
          ↗ {t('detail.share')}
        </button>
        <button className="btn-outline shrink-0" onClick={() => setWriting(true)}>
          ✍️ {t('detail.review')}
        </button>
      </div>

      {r.offers.length > 0 && (
        <div className="scrollbar-none mt-4 flex gap-3 overflow-x-auto">
          {r.offers.map((o) => (
            <div key={o.id} className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
              <p className="text-sm font-semibold text-blue-900">🏷️ {o.title}</p>
              {(o.terms || o.validFromTime) && (
                <p className="text-xs text-blue-800/80">
                  {o.validFromTime && o.validToTime && `${shiftLabel({ opensAt: o.validFromTime, closesAt: o.validToTime })}. `}
                  {o.terms}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="sticky top-[57px] z-20 mt-6 bg-white md:top-[65px]">
        <Tabs<Tab>
          value={tab}
          onChange={openTab}
          tabs={[
            { key: 'overview', label: t('detail.tab.overview') },
            { key: 'menu', label: `${t('detail.tab.menu')}${r.menuItemCount ? ` (${r.menuItemCount})` : ''}` },
            { key: 'reviews', label: `${t('detail.tab.reviews')} (${r.reviewCount})` },
            { key: 'photos', label: `${t('detail.tab.photos')} (${r.photoCount})` },
          ]}
        />
      </div>

      <div className="py-6">
        {tab === 'overview' && (
          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            <div className="min-w-0 space-y-8">
              {(r.highlights.knownFor.length > 0 || r.highlights.mustTry.length > 0 || r.highlights.greatFor.length > 0) && (
                <section className="grid gap-3 sm:grid-cols-3">
                  {(
                    [
                      ['detail.knownFor', r.highlights.knownFor, 'bg-amber-50 text-amber-900'],
                      ['detail.mustTry', r.highlights.mustTry, 'bg-rose-50 text-rose-900'],
                      ['detail.greatFor', r.highlights.greatFor, 'bg-emerald-50 text-emerald-900'],
                    ] as const
                  )
                    .filter(([, v]) => v.length)
                    .map(([k, v, cls]) => (
                      <div key={k} className={`rounded-xl p-3 ${cls}`}>
                        <p className="text-xs font-semibold tracking-wide uppercase opacity-80">{t(k)}</p>
                        <p className="mt-1 text-sm font-medium">{v.join(', ')}</p>
                      </div>
                    ))}
                </section>
              )}
              {r.description && (
                <section>
                  <h2 className="mb-2 text-lg font-semibold">{t('detail.about')}</h2>
                  <p className="text-sm whitespace-pre-line">{r.description}</p>
                </section>
              )}
              {groups.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-semibold">{t('detail.goodToKnow')}</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {groups.map(({ g, items }) => (
                      <div key={g}>
                        <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{t(`filters.group.${g}` as MessageKey)}</h3>
                        <ul className="grid grid-cols-2 gap-1 text-sm">
                          {items.map((a) => (
                            <li key={a.key}>
                              <span className="mr-1.5">{a.icon ?? '✓'}</span>
                              {nm(a, lang)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {policies.length > 0 && (
                <section>
                  <h2 className="mb-2 text-lg font-semibold">{t('detail.policies')}</h2>
                  <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {policies.map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-muted">{t(k)}:</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
              <section className="flex flex-wrap gap-4">
                <button className="card flex-1 p-4 text-left hover:shadow" onClick={() => openTab('menu')}>
                  <p className="font-semibold">{t('detail.tab.menu')} →</p>
                  <p className="text-sm text-muted">
                    {r.menuItemCount ? t('detail.dishes', { n: r.menuItemCount }) : t('menu.emptyTitle')}
                    {r.menuUpdatedAt && ` · ${t('detail.updated', { when: ago(r.menuUpdatedAt, t) })}`}
                  </p>
                </button>
                <button className="card flex-1 p-4 text-left hover:shadow" onClick={() => setWriting(true)}>
                  <p className="font-semibold">✍️ {t('detail.rate')}</p>
                  <p className="text-sm text-muted">{t('detail.rateBody')}</p>
                </button>
              </section>
              <div className="flex flex-wrap gap-3 border-t border-border pt-4 text-sm">
                <button className="text-muted underline hover:text-foreground" onClick={() => setReport({ type: 'restaurant', id: r.id })}>
                  {t('detail.reportInfo')}
                </button>
                {!r.isClaimed && (
                  <Link href={`/partner/claim?id=${r.id}&name=${encodeURIComponent(r.name)}`} className="text-brand underline">
                    {t('detail.claim')}
                  </Link>
                )}
              </div>
            </div>

            <aside className="space-y-5">
              <div className="card p-4">
                <h2 className="mb-2 font-semibold">{t('detail.hours')}</h2>
                {r.hours.length === 0 ? (
                  <p className="text-sm text-muted">{t('detail.hoursUnknown')}</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {byDay.map((shifts, d) => (
                        <tr key={d} className={d === today ? 'font-semibold' : ''}>
                          <td className="py-0.5 pr-3 align-top">{t(DAY_LONG_KEYS[d])}</td>
                          <td className="py-0.5 text-right">{shifts.length ? shifts.map((s, i) => <div key={i}>{shiftLabel(s, t)}</div>) : <span className="text-red-600">{t('open.closed')}</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {r.specialHours.length > 0 && (
                  <div className="mt-3 border-t border-border pt-2">
                    <p className="text-xs font-semibold text-muted uppercase">{t('detail.specialHours')}</p>
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {r.specialHours.map((s) => (
                        <li key={s.date} className="flex justify-between gap-2">
                          <span>{dayDate(s.date, lang)}</span>
                          <span className={s.isClosed ? 'text-red-600' : ''}>
                            {s.isClosed ? t('open.closed') : shiftLabel({ opensAt: s.opensAt!, closesAt: s.closesAt! }, t)}
                            {s.note && <span className="ml-1 text-xs text-muted">({s.note})</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {r.hoursConfirmedAt && <p className="mt-2 text-xs text-muted">{t('detail.hoursConfirmed', { when: ago(r.hoursConfirmedAt, t) })}</p>}
              </div>
              <div className="card overflow-hidden">
                <Map className="h-48 rounded-none" center={[r.lat, r.lng]} pins={[{ id: r.id, lat: r.lat, lng: r.lng, label: r.name }]} />
                <div className="space-y-1 p-4 text-sm">
                  <p>{r.address.line}</p>
                  {r.address.landmark && <p className="text-muted">{t('detail.near', { place: r.address.landmark })}</p>}
                  <p className="text-muted">
                    {r.address.city}
                    {r.address.pincode && ` – ${r.address.pincode}`}
                  </p>
                  <a href={directions} target="_blank" rel="noreferrer" className="inline-block pt-1 font-medium text-brand" onClick={() => track('action_directions', r.id)}>
                    {t('detail.getDirections')}
                  </a>
                </div>
              </div>
              {(r.phone || r.website || Object.keys(r.socialLinks).length > 0) && (
                <div className="card space-y-1 p-4 text-sm">
                  {r.phone && (
                    <a href={`tel:+91${r.phone}`} className="block font-medium text-brand" onClick={() => track('action_call', r.id)}>
                      📞 +91 {r.phone}
                    </a>
                  )}
                  {r.website && (
                    <a href={r.website} target="_blank" rel="noreferrer" className="block truncate text-brand">
                      🌐 {r.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {Object.entries(r.socialLinks).map(([k, v]) => (
                    <a key={k} href={v} target="_blank" rel="noreferrer" className="block truncate text-brand capitalize">
                      {k === 'instagram' ? '📸' : k === 'youtube' ? '▶️' : '👍'} {k}
                    </a>
                  ))}
                </div>
              )}
              {(r.fssaiNumber || r.lastInspectionOn) && (
                <div className="px-1 text-xs text-muted">
                  {r.fssaiNumber && <p>🛡️ {t('detail.fssai', { n: r.fssaiNumber })}</p>}
                  {r.lastInspectionOn && <p>{t('detail.inspected', { date: shortDate(r.lastInspectionOn) })}</p>}
                </div>
              )}
            </aside>
          </div>
        )}

        {tab === 'menu' && <Menu restaurantId={r.id} onPhoto={(u) => setLightbox({ urls: [u], i: 0 })} />}

        {tab === 'reviews' && (
          <Reviews
            restaurant={r}
            version={reviewVersion}
            onWrite={() => setWriting(true)}
            onReport={(id) => setReport({ type: 'review', id })}
            onPhoto={(urls, i) => setLightbox({ urls, i })}
          />
        )}

        {tab === 'photos' && <PhotosTab restaurantId={r.id} onOpen={(urls, i) => setLightbox({ urls, i })} onReport={(id) => setReport({ type: 'photo', id })} />}
      </div>

      {r.similar.length > 0 && (
        <section className="border-t border-border pt-8">
          <h2 className="mb-4 text-xl font-semibold">{t('detail.similar')}</h2>
          <div className="scrollbar-none -mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
            {r.similar.map((s, i) => (
              <RestaurantCard key={s.id} r={s} compact position={i} />
            ))}
          </div>
        </section>
      )}

      <WriteReview
        restaurant={r}
        open={writing}
        onClose={() => setWriting(false)}
        onPosted={(held) => {
          setReviewVersion((v) => v + 1);
          setTab('reviews');
          detail.reload();
          setFlash(held ? t('review.held') : t('review.live'));
        }}
      />
      <ReportDialog target={report} onClose={() => setReport(null)} />
      {me && <SaveToList open={choosing} onClose={() => setChoosing(false)} restaurantId={r.id} initial={inLists} onChange={setLists} />}
      <Modal open={needLogin} onClose={() => setNeedLogin(false)} title={t('auth.signIn')}>
        <LoginForm intro={t('card.signInToSave')} onDone={() => setNeedLogin(false)} />
      </Modal>
      {lightbox && <Lightbox urls={lightbox.urls} index={lightbox.i} onClose={() => setLightbox(null)} />}
      {flash}
    </div>
  );
}
