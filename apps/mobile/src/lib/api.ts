import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';
import { API_URL, DEV_OTP_KEY, VARIANT } from './env';

const ACCESS_KEY = 'tt_access';
const REFRESH_KEY = 'tt_refresh';
const DEVICE_KEY = 'tt_device';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

// Tokens live in the keychain/keystore; a memory copy keeps requests synchronous to build.
let access: string | null = null;
let refresh: string | null = null;

export async function loadTokens() {
  [access, refresh] = await Promise.all([SecureStore.getItemAsync(ACCESS_KEY), SecureStore.getItemAsync(REFRESH_KEY)]).catch(() => [null, null]);
}

export const getToken = () => access;
export const getRefreshToken = () => refresh;

export async function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  access = tokens?.accessToken ?? null;
  refresh = tokens?.refreshToken ?? null;
  await Promise.all(
    tokens
      ? [SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken), SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken)]
      : [SecureStore.deleteItemAsync(ACCESS_KEY), SecureStore.deleteItemAsync(REFRESH_KEY)],
  ).catch(() => {});
}

const signedOutListeners = new Set<() => void>();
/** Called when the server rejects the refresh token (signed out elsewhere, or expired). */
export function onSignedOut(cb: () => void) {
  signedOutListeners.add(cb);
  return () => void signedOutListeners.delete(cb);
}

/** Stable per-install id: anonymous analytics and fake-review checks (spec 6, 11.3). */
export function deviceId() {
  let id = Storage.getItemSync(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    Storage.setItemSync(DEVICE_KEY, id);
  }
  return id;
}

/** Aborts a request that hangs (patchy rural data). Not relying on AbortSignal.timeout being in Hermes. */
function timeout(ms: number) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(query?: Query) {
  if (!query) return '';
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

let refreshing: Promise<boolean> | null = null;

/** Swaps the refresh token for a new pair once, however many requests hit a 401 together. */
function refreshTokens() {
  if (!refreshing) {
    refreshing = (async () => {
      if (!refresh) return false;
      try {
        const res = await fetch(`${API_URL}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken: refresh }),
        });
        if (!res.ok) {
          await setTokens(null);
          signedOutListeners.forEach((cb) => cb());
          return false;
        }
        await setTokens(await res.json());
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

function headers(token: string | null, json: boolean) {
  return {
    'x-device-id': deviceId(),
    'x-app': VARIANT,
    ...(DEV_OTP_KEY ? { 'x-dev-otp-key': DEV_OTP_KEY } : {}),
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; token?: string | null; timeoutMs?: number } = {},
): Promise<T> {
  const explicit = opts.token !== undefined;
  const send = (token: string | null) =>
    fetch(`${API_URL}${path}${qs(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers: headers(token, opts.body !== undefined),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: timeout(opts.timeoutMs ?? 20_000),
    });
  let res = await send(explicit ? opts.token! : access);
  // Access tokens last 15 minutes; refresh silently and retry once.
  if (res.status === 401 && !explicit && refresh && (await refreshTokens())) res = await send(access);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Request failed (${res.status})`, data?.error?.details);
  }
  return data as T;
}

/** Uploads a local photo (file:// URI) and returns its public URL. */
export async function uploadPhoto(uri: string): Promise<{ url: string }> {
  const go = () => {
    const form = new FormData();
    // React Native's FormData takes a { uri, name, type } file descriptor.
    form.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
    return fetch(`${API_URL}/v1/uploads`, { method: 'POST', headers: headers(access, false), body: form, signal: timeout(60_000) });
  };
  let res = await go();
  if (res.status === 401 && (await refreshTokens())) res = await go();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Upload failed');
  return data as { url: string };
}

/** Public media URL. `size` swaps the WebP rendition (sm 320 / md 800 / lg 1600, spec 11.1). */
export function media(url?: string | null, size?: 'sm' | 'md' | 'lg') {
  if (!url) return null;
  const sized = size ? url.replace(/-(sm|md|lg)\.webp$/, `-${size}.webp`) : url;
  return sized.startsWith('/uploads/') ? `${API_URL}${sized}` : sized;
}

export const isNetworkError = (e: unknown) => e instanceof TypeError || (e instanceof Error && /Network request failed|aborted|timed? ?out/i.test(e.message));

export function errorMessage(e: unknown) {
  if (isNetworkError(e)) return 'No connection. Check your internet and try again.';
  return e instanceof Error ? e.message : 'Something went wrong';
}

/** Fire-and-forget product events (spec 11.3). Never includes precise location. */
export function track(name: string, restaurantId?: string | null, props?: Record<string, unknown>) {
  api('/v1/events', { method: 'POST', body: { events: [{ name, ...(restaurantId ? { restaurantId } : {}), props: { ...props, app: VARIANT } }] } }).catch(() => {});
}
