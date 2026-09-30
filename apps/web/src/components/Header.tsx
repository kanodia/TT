'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, errorMessage, media, track } from '@/lib/api';
import { nm, restaurantHref } from '@/lib/format';
import { reverseGeocode, useSession, type Place } from '@/lib/session';
import type { Card, Cuisine } from '@/lib/types';
import { Map } from './Map';
import { Cover, ErrorNote, Modal, RatingBadge, Spinner } from './ui';

type GeoPlace = { type: string; id: string; name: string; nameHi: string | null; label: string; lat: number; lng: number; cityId: string | null };
type Address = { id: string; label: 'home' | 'work' | 'other'; addressText: string; lat: number; lng: number; isDefault: boolean };

const LABEL_ICON = { home: '🏠', work: '💼', other: '📌' };

/** "We're not here yet" with an SMS waitlist (spec 2.1). */
function NotLive({ lat, lng }: { lat: number; lng: number }) {
  const { t } = useSession();
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">{t('place.notifyDone')}</p>;
  return (
    <form
      className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await api('/v1/geo/waitlist', { method: 'POST', body: { phone, lat, lng } });
          setDone(true);
        } catch (err) {
          setError(errorMessage(err));
        }
      }}
    >
      <p className="font-medium">{t('place.notLiveTitle')}</p>
      <p className="text-sm text-amber-900">{t('place.notLiveBody')}</p>
      <ErrorNote message={error} />
      <div className="flex gap-2">
        <input className="input" inputMode="numeric" maxLength={10} placeholder="98xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
        <button className="btn-primary shrink-0" disabled={phone.length !== 10}>
          {t('place.notifyMe')}
        </button>
      </div>
    </form>
  );
}

export function PlacePicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { setPlace, locate, place, me, t, lang } = useSession();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [pin, setPin] = useState({ lat: place.lat, lng: place.lng });
  const [locating, setLocating] = useState(false);
  const [notLive, setNotLive] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      api<{ data: GeoPlace[] }>('/v1/geo/autocomplete', { query: { q, lat: place.lat, lng: place.lng } })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [q, open, place.lat, place.lng]);

  useEffect(() => {
    if (!open || !me) return;
    api<{ data: Address[] }>('/v1/me/addresses')
      .then((r) => setAddresses(r.data))
      .catch(() => {});
  }, [open, me]);

  function finish(p: Place) {
    if (p.isLive === false) {
      setNotLive({ lat: p.lat, lng: p.lng });
      setPlace(p);
      return;
    }
    setPlace(p);
    setNotLive(null);
    setMode('list');
    onClose();
  }

  async function useMine() {
    setLocating(true);
    setError(null);
    try {
      const p = await locate();
      if (p.isLive === false) setNotLive({ lat: p.lat, lng: p.lng });
      else onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLocating(false);
    }
  }

  async function pickAt(lat: number, lng: number, label?: string) {
    const r = await reverseGeocode(lat, lng);
    finish({ lat, lng, label: label ?? r.label ?? t('place.pickOnMap'), cityId: r.cityId, precise: true, isLive: r.isLive });
  }

  async function saveCurrent(label: Address['label']) {
    try {
      const a = await api<Address>('/v1/me/addresses', { method: 'POST', body: { label, addressText: place.label, lat: place.lat, lng: place.lng, isDefault: label === 'home' } });
      setAddresses([...addresses, a]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('place.title')}>
      <div className="space-y-3">
        {notLive && <NotLive lat={notLive.lat} lng={notLive.lng} />}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={useMine} disabled={locating} className="btn-outline justify-start text-brand">
            {locating ? <Spinner className="h-4 w-4" /> : '📍'} {t('place.useCurrent')}
          </button>
          <button onClick={() => { setPin({ lat: place.lat, lng: place.lng }); setMode(mode === 'map' ? 'list' : 'map'); }} className={`btn-outline justify-start ${mode === 'map' ? 'border-brand text-brand' : ''}`}>
            🗺️ {t('place.pickOnMap')}
          </button>
        </div>
        <ErrorNote message={error} />
        {mode === 'map' ? (
          <div className="space-y-2">
            <p className="text-xs text-muted">{t('place.pickOnMapHint')}</p>
            <Map className="h-72" center={[pin.lat, pin.lng]} pins={[{ id: 'pin', lat: pin.lat, lng: pin.lng, label: '' }]} onPick={(lat, lng) => setPin({ lat, lng })} />
            <button className="btn-primary w-full" onClick={() => pickAt(pin.lat, pin.lng)}>
              {t('place.confirmPin')}
            </button>
          </div>
        ) : (
          <>
            {me && addresses.length > 0 && (
              <div>
                <p className="label">{t('place.saved')}</p>
                <ul className="divide-y divide-border">
                  {addresses.map((a) => (
                    <li key={a.id} className="flex items-center">
                      <button onClick={() => pickAt(a.lat, a.lng, a.addressText)} className="flex flex-1 items-center gap-3 py-2 text-left hover:bg-surface">
                        <span>{LABEL_ICON[a.label]}</span>
                        <span>
                          <span className="block text-sm font-medium">{t(`place.label.${a.label}`)}</span>
                          <span className="block text-xs text-muted">{a.addressText}</span>
                        </span>
                      </button>
                      <button
                        className="px-2 text-xs text-muted hover:text-red-600"
                        onClick={async () => {
                          await api(`/v1/me/addresses/${a.id}`, { method: 'DELETE' }).catch(() => {});
                          setAddresses(addresses.filter((x) => x.id !== a.id));
                        }}
                        aria-label={t('action.remove')}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {me && (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted">{t('place.saveThis')}:</span>
                {(['home', 'work', 'other'] as const).map((l) => (
                  <button key={l} className="chip py-1 text-xs" onClick={() => saveCurrent(l)}>
                    {LABEL_ICON[l]} {t(`place.label.${l}`)}
                  </button>
                ))}
              </div>
            )}
            <input className="input" placeholder={t('place.search')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
            <ul className="divide-y divide-border">
              {results.map((p) => (
                <li key={`${p.type}-${p.id}`}>
                  <button
                    onClick={() => (p.cityId ? finish({ lat: p.lat, lng: p.lng, label: p.label, cityId: p.cityId, isLive: true }) : pickAt(p.lat, p.lng, p.label))}
                    className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-surface"
                  >
                    <span>{p.type === 'city' ? '🏙️' : p.type === 'address' ? '🏠' : '📌'}</span>
                    <span>
                      <span className="block text-sm font-medium">{lang === 'hi' && p.nameHi ? p.nameHi : p.name}</span>
                      <span className="block text-xs text-muted">{p.label}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted">{t('place.liveNote')}</p>
          </>
        )}
      </div>
    </Modal>
  );
}

type Suggest = {
  restaurants: Card[];
  cuisines: Cuisine[];
  dishes: { name: string; restaurants: { id: string; slug: string; name: string }[] }[];
  trending?: string[];
  corrected?: string | null;
};

function SearchBox({ className = '' }: { className?: string }) {
  const { place, lang, t, recentSearches, rememberSearch } = useSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [s, setS] = useState<Suggest | null>(null);
  const [trending, setTrending] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) return;
    const timer = setTimeout(() => {
      api<Suggest>('/v1/search', { query: { q: needle, lat: place.lat, lng: place.lng } })
        .then(setS)
        .catch(() => setS(null));
    }, 200);
    return () => clearTimeout(timer);
  }, [q, place.lat, place.lng]);

  useEffect(() => {
    if (!open || trending.length) return;
    api<{ data: string[] }>('/v1/search/trending')
      .then((r) => setTrending(r.data))
      .catch(() => {});
  }, [open, trending.length]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function go(href: string, term?: string) {
    setOpen(false);
    if (term) rememberSearch(term);
    router.push(href);
  }
  const searchAll = (term: string) => go(`/restaurants?q=${encodeURIComponent(term)}`, term);

  const typing = q.trim().length >= 2;
  const empty = s && !s.restaurants.length && !s.cuisines.length && !s.dishes.length;

  return (
    <div ref={box} className={`relative ${className}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) searchAll(q.trim());
        }}
      >
        <input
          className="input bg-surface pl-9"
          placeholder={t('nav.search')}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          aria-label={t('nav.search')}
        />
        <span className="pointer-events-none absolute top-2 left-3 text-muted">🔍</span>
      </form>
      {open && (typing ? s : recentSearches.length || trending.length) && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-white py-2 shadow-xl">
          {!typing ? (
            <div className="space-y-3 px-4 py-1">
              {recentSearches.length > 0 && (
                <div>
                  <p className="label">{t('search.recent')}</p>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((r) => (
                      <button key={r} className="chip py-1 text-xs" onClick={() => searchAll(r)}>
                        🕘 {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {trending.length > 0 && (
                <div>
                  <p className="label">{t('search.trending')}</p>
                  <div className="flex flex-wrap gap-2">
                    {trending.map((r) => (
                      <button key={r} className="chip py-1 text-xs" onClick={() => searchAll(r)}>
                        📈 {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            s && (
              <>
                {s.corrected && <p className="px-4 pb-1 text-xs text-muted">{t('search.didYouMean', { q: s.corrected })}</p>}
                {empty && <p className="px-4 py-3 text-sm text-muted">{t('search.noMatch', { q })}</p>}
                {s.cuisines.map((c) => (
                  <button key={c.id} onClick={() => go(`/restaurants?cuisines=${c.slug}`, q)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg">{c.icon ?? '🍽️'}</span>
                    <span>
                      <span className="block text-sm font-medium">{nm(c, lang)}</span>
                      <span className="block text-xs text-muted">{t('search.cuisine')}</span>
                    </span>
                  </button>
                ))}
                {s.dishes.map((d) => (
                  <button key={d.name} onClick={() => searchAll(d.name)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg">🥘</span>
                    <span>
                      <span className="block text-sm font-medium">{d.name}</span>
                      <span className="block text-xs text-muted">{t('search.dish', { count: d.restaurants.length })}</span>
                    </span>
                  </button>
                ))}
                {s.restaurants.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => {
                      track('card_tap', r.id, { from: 'typeahead' });
                      go(restaurantHref(r), q);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface"
                  >
                    <Cover url={r.photos[0]} seed={r.slug} cuisine={r.cuisines[0]?.slug} size="sm" className="h-9 w-9 shrink-0 rounded-lg [&>span]:text-base" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{nm(r, lang)}</span>
                      <span className="block truncate text-xs text-muted">{r.cuisines.map((c) => nm(c, lang)).join(', ')}</span>
                    </span>
                    <RatingBadge rating={r.rating} />
                  </button>
                ))}
                {!empty && (
                  <button onClick={() => searchAll(q.trim())} className="w-full px-4 py-2 text-left text-sm text-brand hover:bg-surface">
                    {t('search.seeAll', { q: q.trim() })}
                  </button>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function Logo() {
  const { config } = useSession();
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2">
      {config.brand.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={media(config.brand.logoUrl, 'sm')!} alt="" className="h-8 w-8 rounded-lg object-cover" />
      ) : (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">{config.brand.shortName}</span>
      )}
      <span className="hidden text-lg font-bold tracking-tight text-brand sm:inline">{config.brand.appName}</span>
    </Link>
  );
}

export function Bell() {
  const { me, t } = useSession();
  if (!me) return null;
  return (
    <Link href="/notifications" className="btn-ghost relative px-2" title={t('nav.notifications')} aria-label={t('nav.notifications')}>
      🔔
      {me.unreadNotifications > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-4 rounded-full bg-brand px-1 text-center text-[10px] leading-4 font-semibold text-white">
          {me.unreadNotifications > 9 ? '9+' : me.unreadNotifications}
        </span>
      )}
    </Link>
  );
}

export function Header() {
  const { place, me, lang, setLang, t } = useSession();
  const [picking, setPicking] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Logo />
        <button onClick={() => setPicking(true)} className="flex min-w-0 items-center gap-1 text-sm hover:text-brand" aria-label={t('nav.changeLocation')}>
          <span className="text-brand">📍</span>
          <span className="max-w-40 truncate font-medium">{place.label}</span>
          <span className="text-muted">▾</span>
        </button>
        <SearchBox className="order-last w-full md:order-none md:w-auto md:flex-1" />
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="btn-ghost px-2" title={t('lang.switchTo')}>
            {lang === 'en' ? 'हिं' : 'EN'}
          </button>
          <Link href="/saved" className="btn-ghost px-2" title={t('nav.saved')}>
            ♡<span className="hidden sm:inline">{t('nav.saved')}</span>
          </Link>
          <Bell />
          {me ? (
            <Link href="/account" className="btn-ghost px-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand">{(me.name ?? me.phone).slice(0, 1).toUpperCase()}</span>
            </Link>
          ) : (
            <Link href="/login" className="btn-primary px-3 py-1.5">
              {t('auth.signIn')}
            </Link>
          )}
        </nav>
      </div>
      <PlacePicker open={picking} onClose={() => setPicking(false)} />
    </header>
  );
}

export function Footer() {
  const { config, t, lang } = useSession();
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-3">
        <div>
          <p className="font-semibold text-brand">{config.brand.appName}</p>
          <p className="mt-1 text-muted">{lang === 'hi' ? config.brand.taglineHi : config.brand.tagline}</p>
        </div>
        <div className="space-y-1.5">
          <p className="font-semibold">{t('footer.forRestaurants')}</p>
          <Link href="/partner" className="block text-muted hover:text-foreground">
            {t('footer.addRestaurant')}
          </Link>
          <Link href="/partner/claim" className="block text-muted hover:text-foreground">
            {t('footer.claim')}
          </Link>
        </div>
        <div className="space-y-1.5">
          <p className="font-semibold">{t('footer.help')}</p>
          <a href={`mailto:${config.brand.supportEmail}`} className="block text-muted hover:text-foreground">
            {config.brand.supportEmail}
          </a>
          {config.brand.supportPhone && <p className="text-muted">{config.brand.supportPhone}</p>}
          <Link href="/account#privacy" className="block text-muted hover:text-foreground">
            {t('footer.privacy')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
