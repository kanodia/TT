'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { plural, translate, type Lang, type MessageKey, type Vars } from '@/i18n';
import { api, getRefreshToken, getToken, setTokens, track } from './api';
import type { AppConfig, Me } from './types';

export type Place = { lat: number; lng: number; label: string; cityId?: string | null; precise?: boolean; isLive?: boolean };

// Neem Ka Thana — the launch town — until the diner shares location or picks a place.
const DEFAULT_PLACE: Place = { lat: 27.735, lng: 75.78, label: 'Neem Ka Thana', isLive: true };
const PLACE_KEY = 'tt_place';
const LANG_KEY = 'tt_lang';
const RECENT_KEY = 'tt_recent_searches';

const DEFAULT_CONFIG: AppConfig = {
  brand: {
    appName: 'TwiggyTomato',
    shortName: 'TT',
    tagline: 'Find great food near you',
    taglineHi: 'अपने आस-पास का बढ़िया खाना खोजें',
    primaryColor: '#e23744',
    logoUrl: null,
    iconUrl: null,
    supportEmail: 'support@example.com',
    supportPhone: '',
    webDomain: null,
  },
  features: { unclaimedListings: true, sponsored: false, socialLogin: { google: false, apple: false }, addressSearch: false },
  reviewRules: { minChars: 20, maxPhotos: 10 },
};

type Tokens = { accessToken: string; refreshToken: string };

type Session = {
  config: AppConfig;
  me: Me | null;
  /** false until the stored token has been checked, so pages don't flash "signed out". */
  ready: boolean;
  signIn: (tokens: Tokens) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
  refreshConfig: () => void;
  place: Place;
  setPlace: (p: Place) => void;
  locate: () => Promise<Place>;
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate with `{brand}` pre-filled. */
  t: (key: MessageKey, vars?: Vars) => string;
  tp: (base: string, count: number, vars?: Vars) => string;
  /** Restaurants in any of the user's lists — drives the hearts on cards. */
  savedIds: Set<string>;
  toggleSaved: (restaurantId: string) => Promise<boolean>;
  recentSearches: string[];
  rememberSearch: (q: string) => void;
};

const Ctx = createContext<Session | null>(null);

function readStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export async function reverseGeocode(lat: number, lng: number) {
  try {
    const r = await api<{ isLive: boolean; city: { id: string; name: string } | null; locality: { name: string } | null }>('/v1/geo/reverse', { query: { lat, lng } });
    return { label: r.city ? (r.locality ? `${r.locality.name}, ${r.city.name}` : r.city.name) : null, cityId: r.city?.id ?? null, isLive: r.isLive };
  } catch {
    return { label: null, cityId: null, isLive: true };
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [place, setPlaceState] = useState<Place>(DEFAULT_PLACE);
  const [lang, setLangState] = useState<Lang>('en');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [recentSearches, setRecent] = useState<string[]>([]);

  const loadSaved = useCallback(async () => {
    try {
      setSavedIds(new Set((await api<{ data: string[] }>('/v1/me/saved/ids')).data));
    } catch {
      setSavedIds(new Set());
    }
  }, []);

  const refreshMe = useCallback(async () => {
    if (!getToken() && !getRefreshToken()) {
      setMe(null);
      return;
    }
    try {
      setMe(await api<Me>('/v1/me'));
      void loadSaved();
    } catch {
      setTokens(null);
      setMe(null);
    }
  }, [loadSaved]);

  const refreshConfig = useCallback(() => {
    api<AppConfig>('/v1/config')
      .then(setConfig)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Hydrate client-only preferences after mount to keep SSR markup stable.
    /* eslint-disable react-hooks/set-state-in-effect */
    const storedPlace = readStored<Place>(PLACE_KEY);
    if (storedPlace) setPlaceState(storedPlace);
    const storedLang = readStored<Lang>(LANG_KEY);
    if (storedLang) setLangState(storedLang);
    setRecent(readStored<string[]>(RECENT_KEY) ?? []);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Tokens from the pre-refresh build are dropped; those users just sign in again.
    try {
      localStorage.removeItem('tt_token');
    } catch {
      /* ignore */
    }
    refreshConfig();
    refreshMe().finally(() => setReady(true));
    track('app_open');
    const onSignedOut = () => {
      setMe(null);
      setSavedIds(new Set());
    };
    window.addEventListener('tt:signed-out', onSignedOut);
    return () => window.removeEventListener('tt:signed-out', onSignedOut);
  }, [refreshMe, refreshConfig]);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand', config.brand.primaryColor);
  }, [config]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setPlace = useCallback((p: Place) => {
    setPlaceState(p);
    store(PLACE_KEY, p);
    // Only the fact that a location was set is tracked, never the coordinates (spec 11.2).
    track('location_set', null, { precise: !!p.precise, live: p.isLive !== false });
  }, []);

  const locate = useCallback(
    () =>
      new Promise<Place>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Location is not available on this device'));
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude: lat, longitude: lng } = pos.coords;
            const r = await reverseGeocode(lat, lng);
            const p = { lat, lng, label: r.label ?? 'Current location', cityId: r.cityId, precise: true, isLive: r.isLive };
            setPlace(p);
            resolve(p);
          },
          () => reject(new Error('We could not get your location. Pick your town instead.')),
          { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
        );
      }),
    [setPlace],
  );

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    store(LANG_KEY, l);
  }, []);

  const signIn = useCallback(
    async (tokens: Tokens) => {
      setTokens(tokens);
      await refreshMe();
    },
    [refreshMe],
  );

  const signOut = useCallback(async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) await api('/v1/auth/logout', { method: 'POST', body: { refreshToken }, token: null }).catch(() => {});
    setTokens(null);
    setMe(null);
    setSavedIds(new Set());
  }, []);

  const toggleSaved = useCallback(
    async (restaurantId: string) => {
      const next = !savedIds.has(restaurantId);
      const apply = (add: boolean) =>
        setSavedIds((s) => {
          const n = new Set(s);
          if (add) n.add(restaurantId);
          else n.delete(restaurantId);
          return n;
        });
      apply(next);
      try {
        await api(`/v1/me/saved/${restaurantId}`, { method: next ? 'PUT' : 'DELETE' });
      } catch (e) {
        apply(!next);
        throw e;
      }
      return next;
    },
    [savedIds],
  );

  const rememberSearch = useCallback((q: string) => {
    const clean = q.trim();
    if (clean.length < 2) return;
    setRecent((cur) => {
      const next = [clean, ...cur.filter((x) => x.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
      store(RECENT_KEY, next);
      return next;
    });
  }, []);

  const t = useCallback((key: MessageKey, vars?: Vars) => translate(lang, key, { brand: config.brand.appName, ...vars }), [lang, config.brand.appName]);
  const tp = useCallback((base: string, count: number, vars?: Vars) => plural(lang, base, count, { brand: config.brand.appName, ...vars }), [lang, config.brand.appName]);

  const value = useMemo(
    () => ({ config, me, ready, signIn, signOut, refreshMe, refreshConfig, place, setPlace, locate, lang, setLang, t, tp, savedIds, toggleSaved, recentSearches, rememberSearch }),
    [config, me, ready, signIn, signOut, refreshMe, refreshConfig, place, setPlace, locate, lang, setLang, t, tp, savedIds, toggleSaved, recentSearches, rememberSearch],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** Shorthand for components that only need translations. */
export function useT() {
  const { t, tp, lang } = useSession();
  return { t, tp, lang };
}
