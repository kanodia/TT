import 'server-only';
import { API_URL } from './api';

/**
 * Server-side fetch to the API (metadata, redirects, manifest). Sends the internal key so all
 * visitors' page loads aren't counted as one anonymous IP by the API's rate limiter.
 */
export function serverFetch(path: string, init: RequestInit & { next?: { revalidate?: number } } = {}) {
  const key = process.env.INTERNAL_API_KEY;
  return fetch(`${API_URL}${path}`, { ...init, headers: { ...init.headers, ...(key ? { 'x-internal-key': key } : {}) } });
}
