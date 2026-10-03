/** "open_now=1&rating_min=4" (home chips, collections) → route params for the listing screen. */
export function filterParams(filter: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (filter ?? '').split('&')) {
    const [k, v] = part.split('=');
    if (k && v) out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}
