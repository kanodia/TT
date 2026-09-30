import { prisma } from './db.js';

let synonyms: { at: number; map: Map<string, string> } | null = null;

async function synonymMap() {
  if (!synonyms || Date.now() - synonyms.at > 5 * 60_000) {
    const rows = await prisma.searchSynonym.findMany();
    synonyms = { at: Date.now(), map: new Map(rows.map((r) => [r.term, r.canonical])) };
  }
  return synonyms.map;
}

export function invalidateSynonyms() {
  synonyms = null;
}

/** Lower-case, strip accents ("café" → "cafe") and map known misspellings to their canonical word. */
export async function normaliseQuery(raw: string) {
  const base = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, (m) => (/[ऀ-ॿ]/.test(m) ? m : '')) // keep Devanagari matras
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  const map = await synonymMap();
  if (map.has(base)) return map.get(base)!;
  return base
    .split(' ')
    .map((w) => map.get(w) ?? w)
    .join(' ');
}

/** Most searched terms in the last week, for the empty search box (spec 3.1). */
export async function trendingSearches(limit = 8) {
  const rows = await prisma.$queryRaw<{ q: string; n: bigint }[]>`
    SELECT lower(props->>'q') AS q, count(*) AS n FROM "Event"
    WHERE name = 'search' AND "createdAt" > now() - interval '7 days' AND length(props->>'q') >= 3
    GROUP BY 1 ORDER BY n DESC LIMIT ${limit}`;
  return rows.map((r) => r.q);
}
