import { getLocales } from 'expo-localization';
import * as Location from 'expo-location';
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { plural, translate, type Lang, type MessageKey, type Vars } from '@shared/i18n';
import type { AppConfig, Me } from '@shared/types';
import { api, getRefreshToken, getToken, loadTokens, onSignedOut, setTokens, track } from './api';
import { registerForPush, unregisterPush } from './push';

export type Place = { lat: number; lng: number; label: string; cityId?: string | null; precise?: boolean; isLive?: boolean };

// Neem Ka Thana — the launch town — until the diner shares location or picks a place.
export const DEFAULT_PLACE: Place = { lat: 27.735, lng: 75.78, label: 'Neem Ka Thana', isLive: true };
const PLACE_KEY = 'tt_place';
const LANG_KEY = 'tt_lang';
const RECENT_KEY = 'tt_recent_searches';
const CONFIG_KEY = 'tt_config';

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
  /** false until the stored token has been checked, so screens don't flash "signed out". */
  ready: boolean;
  signIn: (tokens: Tokens) => Promise<void>;
  signOut: () => Promise<void>;
  refreshMe: () => Promise<void>;
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
    const raw = Storage.getItemSync(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown) {
  try {
    Storage.setItemSync(key, JSON.stringify(value));
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

/** Phone language picks Hindi on first launch; the diner can switch any time. */
function initialLang(): Lang {
  const stored = readStored<Lang>(LANG_KEY);
  if (stored) return stored;
  return getLocales()[0]?.languageCode === 'hi' ? 'hi' : 'en';
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Last config is cached so brand name and colour are right on the first frame, even offline.
  const [config, setConfig] = useState<AppConfig>(() => readStored<AppConfig>(CONFIG_KEY) ?? DEFAULT_CONFIG);
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [place, setPlaceState] = useState<Place>(() => readStored<Place>(PLACE_KEY) ?? DEFAULT_PLACE);
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [recentSearches, setRecent] = useState<string[]>(() => readStored<string[]>(RECENT_KEY) ?? []);

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
    } catch (e) {
      // Offline: keep the stored tokens and try again later instead of signing out.
      if (e instanceof Error && 'status' in e && (e as { status: number }).status === 401) {
        await setTokens(null);
        setMe(null);
      }
    }
  }, [loadSaved]);

  useEffect(() => {
    api<AppConfig>('/v1/config')
      .then((c) => {
        setConfig(c);
        store(CONFIG_KEY, c);
      })
      .catch(() => {});
    loadTokens()
      .then(refreshMe)
      .finally(() => setReady(true));
    track('app_open');
    return onSignedOut(() => {
      setMe(null);
      setSavedIds(new Set());
    });
  }, [refreshMe]);

  // Register this phone for push once someone is signed in.
  const meId = me?.id;
  useEffect(() => {
    if (meId) void registerForPush();
  }, [meId]);

  const setPlace = useCallback((p: Place) => {
    setPlaceState(p);
    store(PLACE_KEY, p);
    // Only the fact that a location was set is tracked, never the coordinates (spec 11.2).
    track('location_set', null, { precise: !!p.precise, live: p.isLive !== false });
  }, []);

  const locate = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) throw new Error(translate(lang, 'place.denied'));
    const pos = (await Location.getLastKnownPositionAsync({ maxAge: 300_000 })) ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const { latitude: lat, longitude: lng } = pos.coords;
    const r = await reverseGeocode(lat, lng);
    const p = { lat, lng, label: r.label ?? translate(lang, 'place.current'), cityId: r.cityId, precise: true, isLive: r.isLive };
    setPlace(p);
    return p;
  }, [lang, setPlace]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    store(LANG_KEY, l);
  }, []);

  const signIn = useCallback(
    async (tokens: Tokens) => {
      await setTokens(tokens);
      await refreshMe();
    },
    [refreshMe],
  );

  const signOut = useCallback(async () => {
    const refreshToken = getRefreshToken();
    const pushToken = await unregisterPush();
    if (refreshToken || pushToken) await api('/v1/auth/logout', { method: 'POST', body: { refreshToken, pushToken }, token: null }).catch(() => {});
    await setTokens(null);
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
      if (next) track('save', restaurantId);
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
    () => ({ config, me, ready, signIn, signOut, refreshMe, place, setPlace, locate, lang, setLang, t, tp, savedIds, toggleSaved, recentSearches, rememberSearch }),
    [config, me, ready, signIn, signOut, refreshMe, place, setPlace, locate, lang, setLang, t, tp, savedIds, toggleSaved, recentSearches, rememberSearch],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** Brand colour from /v1/config, so a rebrand needs no app release (spec 11.6). */
export function useBrand() {
  return useSession().config.brand.primaryColor;
}
