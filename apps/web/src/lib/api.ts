export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
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

function read(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable (private mode) — session-only sign-in */
  }
}

export const getToken = () => read(ACCESS_KEY);
export const getRefreshToken = () => read(REFRESH_KEY);

export function setTokens(tokens: { accessToken: string; refreshToken: string } | null) {
  write(ACCESS_KEY, tokens?.accessToken ?? null);
  write(REFRESH_KEY, tokens?.refreshToken ?? null);
}

/** Stable per-browser id: anonymous analytics and fake-review checks (spec 6, 11.3). */
export function deviceId() {
  let id = read(DEVICE_KEY);
  if (!id && typeof window !== 'undefined') {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/[^\w-]/g, '');
    write(DEVICE_KEY, id);
  }
  return id;
}

type Query = Record<string, string | number | boolean | undefined | null>;

export function qs(query?: Query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '' && v !== false) params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

let refreshing: Promise<boolean> | null = null;

/** Swaps the refresh token for a new pair once, however many requests hit a 401 together. */
function refreshTokens() {
  if (!refreshing) {
    refreshing = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) return false;
      try {
        const res = await fetch(`${API_URL}/v1/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          setTokens(null);
          window.dispatchEvent(new Event('tt:signed-out'));
          return false;
        }
        setTokens(await res.json());
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

// Staging only: lets the team use on-screen sign-in codes before SMS is live (see API DEV_OTP_KEY).
const DEV_OTP_KEY = process.env.NEXT_PUBLIC_DEV_OTP_KEY;

function headers(token: string | null, json: boolean) {
  const device = deviceId();
  return {
    ...(DEV_OTP_KEY ? { 'x-dev-otp-key': DEV_OTP_KEY } : {}),
    ...(json ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(device ? { 'x-device-id': device } : {}),
  };
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; query?: Query; token?: string | null } = {},
): Promise<T> {
  const explicit = opts.token !== undefined;
  const send = (token: string | null) =>
    fetch(`${API_URL}${path}${qs(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers: headers(token, opts.body !== undefined),
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: 'no-store',
    });
  let res = await send(explicit ? opts.token! : getToken());
  // Access tokens last 15 minutes; refresh silently and retry once.
  if (res.status === 401 && !explicit && getRefreshToken() && (await refreshTokens())) res = await send(getToken());
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? `Request failed (${res.status})`, data?.error?.details);
  }
  return data as T;
}

export type Uploaded = { url: string; width?: number; height?: number };

export async function uploadFile(file: File, kind: 'photo' | 'document' = 'photo'): Promise<Uploaded> {
  const go = () => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_URL}/v1/uploads${kind === 'document' ? '?kind=document' : ''}`, { method: 'POST', headers: headers(getToken(), false), body: form });
  };
  let res = await go();
  if (res.status === 401 && (await refreshTokens())) res = await go();
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? 'Upload failed');
  return data as Uploaded;
}

/** Public media URL. `size` swaps the WebP rendition (sm 320 / md 800 / lg 1600, spec 11.1). */
export function media(url?: string | null, size?: 'sm' | 'md' | 'lg') {
  if (!url) return null;
  const sized = size ? url.replace(/-(sm|md|lg)\.webp$/, `-${size}.webp`) : url;
  return sized.startsWith('/uploads/') ? `${API_URL}${sized}` : sized;
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong';
}

/** Fire-and-forget product events (spec 11.3). Never includes precise location. */
export function track(name: string, restaurantId?: string | null, props?: Record<string, unknown>) {
  api('/v1/events', { method: 'POST', body: { events: [{ name, ...(restaurantId ? { restaurantId } : {}), ...(props ? { props } : {}) }] } }).catch(() => {});
}
