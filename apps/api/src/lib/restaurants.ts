import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { distanceMeters } from './geo.js';
import { addDays, DEFAULT_TZ, isOpen24hOn, isOpenLateOn, localDate, localHHMM, localTime, openStatus, type OpenStatus, type Special } from './hours.js';
import { toRupees } from './money.js';
import { normaliseQuery } from './search.js';
import { citiesWhereFlag } from './settings.js';

/** Includes needed to render a card. Special hours cover yesterday..next week for open-now maths. */
export function cardInclude(now = new Date()) {
  const from = new Date(`${addDays(localDate(now), -1)}T00:00:00Z`);
  const to = new Date(`${addDays(localDate(now), 7)}T00:00:00Z`);
  return {
    cuisines: { include: { cuisine: true }, orderBy: { isPrimary: 'desc' } },
    attributes: { include: { attribute: true } },
    hours: true,
    specialHours: { where: { date: { gte: from, lte: to } } },
    photos: { where: { status: 'approved', deletedAt: null }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 3 },
    offers: { where: { status: 'active' } },
    locality: true,
    type: true,
    city: { select: { slug: true, name: true, nameHi: true, timezone: true } },
  } satisfies Prisma.RestaurantInclude;
}

export type CardRestaurant = Prisma.RestaurantGetPayload<{ include: ReturnType<typeof cardInclude> }>;

/** Diner-visible: live, not deleted, and claimed unless unclaimed listings are on for that city. */
export async function visibleWhere(extra: Prisma.RestaurantWhereInput = {}): Promise<Prisma.RestaurantWhereInput> {
  const hiddenUnclaimed = await citiesWhereFlag('unclaimed_listings_enabled', false);
  return {
    status: 'live',
    deletedAt: null,
    ...(hiddenUnclaimed.length ? { NOT: { isClaimed: false, cityId: { in: hiddenUnclaimed } } } : {}),
    ...extra,
  };
}

export const toSpecials = (rows: { date: Date; isClosed: boolean; opensAt: string | null; closesAt: string | null; note: string | null }[]): Special[] =>
  rows.map((s) => ({ date: s.date.toISOString().slice(0, 10), isClosed: s.isClosed, opensAt: s.opensAt, closesAt: s.closesAt, note: s.note }));

type OfferLike = { startsOn: Date | null; endsOn: Date | null; validDays: number[]; validFromTime: string | null; validToTime: string | null };

export function isOfferActive(o: OfferLike, now = new Date(), tz = DEFAULT_TZ) {
  const { day } = localTime(now, tz);
  const t = localHHMM(now, tz);
  return (
    (!o.startsOn || o.startsOn <= now) &&
    (!o.endsOn || o.endsOn >= now) &&
    o.validDays.includes(day) &&
    (!o.validFromTime || !o.validToTime || (t >= o.validFromTime && t < o.validToTime))
  );
}

export function activeOffers<T extends OfferLike>(r: { offers: T[] }, now = new Date(), tz = DEFAULT_TZ) {
  return r.offers.filter((o) => isOfferActive(o, now, tz));
}

export type Origin = { lat: number; lng: number } | null;

// Card tags: the two most decision-relevant attributes a place has (spec 2.3).
const TAG_PRIORITY = ['pure_veg', 'rooftop', 'outdoor_seating', 'live_music', 'serves_alcohol', 'pet_friendly', 'family_friendly', 'jain', 'ac', 'wifi', 'parking'];

export function toCard(r: CardRestaurant, origin: Origin, now = new Date(), opts: { promoted?: boolean; distanceM?: number | null } = {}) {
  const tz = r.city.timezone;
  const offer = activeOffers(r, now, tz)[0];
  const distance = opts.distanceM ?? (origin ? distanceMeters(origin.lat, origin.lng, r.lat, r.lng) : null);
  return {
    id: r.id,
    slug: r.slug,
    citySlug: r.city.slug,
    name: r.name,
    nameHi: r.nameHi,
    photos: r.photos.map((p) => p.url),
    rating: r.avgRating,
    reviewCount: r.reviewCount,
    cuisines: r.cuisines.map((c) => ({ slug: c.cuisine.slug, name: c.cuisine.name, nameHi: c.cuisine.nameHi })),
    type: r.type ? { slug: r.type.slug, name: r.type.name, nameHi: r.type.nameHi } : null,
    currency: r.currency,
    costForTwo: toRupees(r.costForTwoPaise),
    priceBand: r.priceBand,
    distanceM: distance == null ? null : Math.round(distance),
    openStatus: openStatus(r.hours, now, r.temporarilyClosedUntil, tz, toSpecials(r.specialHours)),
    locality: r.locality ? { name: r.locality.name, nameHi: r.locality.nameHi } : null,
    offer: offer ? { title: offer.title } : null,
    tags: r.attributes
      .filter((a) => TAG_PRIORITY.includes(a.attribute.key))
      .sort((a, b) => TAG_PRIORITY.indexOf(a.attribute.key) - TAG_PRIORITY.indexOf(b.attribute.key))
      .slice(0, 2)
      .map((a) => ({ key: a.attribute.key, name: a.attribute.name, nameHi: a.attribute.nameHi })),
    isVerified: r.isVerified,
    isClaimed: r.isClaimed,
    isPromoted: !!opts.promoted,
    lat: r.lat,
    lng: r.lng,
  };
}

export type Card = ReturnType<typeof toCard>;

/** Loads cards for ids, preserving order. */
export async function cardsFor(ids: string[], origin: Origin, now = new Date(), distances?: Map<string, number | null>) {
  if (!ids.length) return [];
  const rows = await prisma.restaurant.findMany({ where: { id: { in: ids } }, include: cardInclude(now) });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [toCard(r, origin, now, { distanceM: distances?.get(id) })] : [];
  });
}

export type ListingQuery = {
  lat?: number;
  lng?: number;
  cityId?: string;
  sort?: 'relevance' | 'distance' | 'rating' | 'cost_asc' | 'cost_desc' | 'popularity';
  openNow?: boolean;
  openLate?: boolean;
  open24h?: boolean;
  ratingMin?: number;
  /** Rupees. */
  costMin?: number;
  costMax?: number;
  radiusKm?: number;
  cuisines?: string[];
  types?: string[];
  attributes?: string[];
  hasOffers?: boolean;
  isNew?: boolean;
  q?: string;
  ids?: string[];
  offset?: number;
  limit?: number;
  /** Count only (for the live "Show 142 places" in the filter sheet). */
  countOnly?: boolean;
};

const MIN_REVIEWS_FOR_RATING_SORT = 3;

type Candidate = {
  id: string;
  avgRating: number;
  reviewCount: number;
  costForTwoPaise: number;
  isVerified: boolean;
  cityId: string;
  temporarilyClosedUntil: Date | null;
  timezone: string;
  dist: number | null;
  textScore: number | null;
};

/** Attribute keys grouped by their filter group: OR within a group, AND across groups (spec 3). */
async function attributeGroups(keys: string[]) {
  const attrs = await prisma.attribute.findMany({ where: { key: { in: keys } }, select: { key: true, group: true } });
  const groups = new Map<string, string[]>();
  for (const a of attrs) groups.set(a.group, [...(groups.get(a.group) ?? []), a.key]);
  // Unknown keys still have to match, so they can't silently widen results.
  const unknown = keys.filter((k) => !attrs.some((a) => a.key === k));
  return [...groups.values(), ...unknown.map((k) => [k])];
}

/**
 * Filtering, radius and text search run in Postgres (PostGIS + pg_trgm); open-now and relevance
 * need each place's hours in its own timezone, so they're computed on the matching rows.
 * The search index described in spec 8.2 can replace the SQL stage without changing callers.
 */
export async function listRestaurants(query: ListingQuery) {
  const now = new Date();
  const origin: Origin = query.lat != null && query.lng != null ? { lat: query.lat, lng: query.lng } : null;
  const point = origin ? Prisma.sql`ST_SetSRID(ST_MakePoint(${origin.lng}, ${origin.lat}), 4326)::geography` : null;
  const hiddenUnclaimed = await citiesWhereFlag('unclaimed_listings_enabled', false);
  const q = query.q?.trim() ? await normaliseQuery(query.q) : null;

  const where: Prisma.Sql[] = [Prisma.sql`r.status = 'live'`, Prisma.sql`r."deletedAt" IS NULL`];
  if (hiddenUnclaimed.length) where.push(Prisma.sql`(r."isClaimed" OR r."cityId" <> ALL(${hiddenUnclaimed}::text[]))`);
  if (point && query.radiusKm) where.push(Prisma.sql`ST_DWithin(r.location, ${point}, ${query.radiusKm * 1000})`);
  if (query.cityId) where.push(Prisma.sql`r."cityId" = ${query.cityId}`);
  if (query.ids) where.push(Prisma.sql`r.id = ANY(${query.ids}::text[])`);
  if (query.ratingMin) where.push(Prisma.sql`r."avgRating" >= ${query.ratingMin} AND r."reviewCount" > 0`);
  if (query.costMin != null) where.push(Prisma.sql`r."costForTwoPaise" >= ${query.costMin * 100}`);
  if (query.costMax != null) where.push(Prisma.sql`r."costForTwoPaise" <= ${query.costMax * 100}`);
  if (query.isNew) where.push(Prisma.sql`r."createdAt" >= ${new Date(now.getTime() - 90 * 864e5)}`);
  if (query.cuisines?.length) {
    where.push(Prisma.sql`EXISTS (SELECT 1 FROM "RestaurantCuisine" rc JOIN "Cuisine" c ON c.id = rc."cuisineId"
      WHERE rc."restaurantId" = r.id AND c.slug = ANY(${query.cuisines}::text[]))`);
  }
  if (query.types?.length) {
    where.push(Prisma.sql`EXISTS (SELECT 1 FROM "EstablishmentType" t WHERE t.id = r."typeId" AND t.slug = ANY(${query.types}::text[]))`);
  }
  if (query.attributes?.length) {
    for (const group of await attributeGroups(query.attributes)) {
      where.push(Prisma.sql`EXISTS (SELECT 1 FROM "RestaurantAttribute" ra JOIN "Attribute" a ON a.id = ra."attributeId"
        WHERE ra."restaurantId" = r.id AND a.key = ANY(${group}::text[]))`);
    }
  }
  if (query.hasOffers) {
    const { day } = localTime(now);
    const t = localHHMM(now);
    where.push(Prisma.sql`EXISTS (SELECT 1 FROM "Offer" o WHERE o."restaurantId" = r.id AND o.status = 'active'
      AND (o."startsOn" IS NULL OR o."startsOn" <= ${now}) AND (o."endsOn" IS NULL OR o."endsOn" >= ${now})
      AND ${day} = ANY(o."validDays")
      AND (o."validFromTime" IS NULL OR o."validToTime" IS NULL OR (o."validFromTime" <= ${t} AND o."validToTime" > ${t})))`);
  }
  if (q) {
    const like = `%${q}%`;
    where.push(Prisma.sql`(
      lower(unaccent(r.name)) LIKE ${like}
      OR word_similarity(${q}, lower(unaccent(r.name))) > 0.45
      OR lower(coalesce(r."nameHi", '')) LIKE ${like}
      OR lower(unaccent(array_to_string(r."knownFor", ' '))) LIKE ${like}
      OR EXISTS (SELECT 1 FROM "RestaurantCuisine" rc JOIN "Cuisine" c ON c.id = rc."cuisineId"
        WHERE rc."restaurantId" = r.id AND (lower(unaccent(c.name)) LIKE ${like} OR c.slug LIKE ${like}
          OR lower(coalesce(c."nameHi", '')) LIKE ${like} OR word_similarity(${q}, lower(unaccent(c.name))) > 0.5))
      OR EXISTS (SELECT 1 FROM "MenuItem" mi WHERE mi."restaurantId" = r.id
        AND (lower(unaccent(mi.name)) LIKE ${like} OR word_similarity(${q}, lower(unaccent(mi.name))) > 0.5))
    )`);
  }

  const distSql = point ? Prisma.sql`ST_Distance(r.location, ${point})` : Prisma.sql`NULL::float8`;
  const textSql = q ? Prisma.sql`GREATEST(similarity(lower(unaccent(r.name)), ${q}), word_similarity(${q}, lower(unaccent(r.name))))` : Prisma.sql`NULL::float8`;
  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT r.id, r."avgRating", r."reviewCount", r."costForTwoPaise", r."isVerified", r."cityId",
           r."temporarilyClosedUntil", c.timezone, ${distSql} AS dist, ${textSql} AS "textScore"
    FROM "Restaurant" r JOIN "City" c ON c.id = r."cityId"
    WHERE ${Prisma.join(where, ' AND ')}`;

  // Hours are only loaded when open-now, open-late or relevance needs them.
  const sort = query.sort ?? 'relevance';
  const needHours = query.openNow || query.openLate || query.open24h || sort === 'relevance';
  const status = new Map<string, OpenStatus>();
  const lateOk = new Set<string>();
  const allDayOk = new Set<string>();
  if (needHours && candidates.length) {
    const ids = candidates.map((c) => c.id);
    const [hours, specials] = await Promise.all([
      prisma.openingHour.findMany({ where: { restaurantId: { in: ids } } }),
      prisma.specialHour.findMany({
        where: {
          restaurantId: { in: ids },
          date: { gte: new Date(`${addDays(localDate(now), -1)}T00:00:00Z`), lte: new Date(`${addDays(localDate(now), 7)}T00:00:00Z`) },
        },
      }),
    ]);
    const { day } = localTime(now);
    for (const c of candidates) {
      const h = hours.filter((x) => x.restaurantId === c.id);
      const s = toSpecials(specials.filter((x) => x.restaurantId === c.id));
      status.set(c.id, openStatus(h, now, c.temporarilyClosedUntil, c.timezone, s));
      if (isOpenLateOn(h, day)) lateOk.add(c.id);
      if (isOpen24hOn(h, day)) allDayOk.add(c.id);
    }
  }

  let items = candidates.filter(
    (c) => (!query.openNow || status.get(c.id)?.state === 'open') && (!query.openLate || lateOk.has(c.id)) && (!query.open24h || allDayOk.has(c.id)),
  );
  const total = items.length;
  if (query.countOnly) return { data: [] as Card[], total, nextCursor: null };

  let popularity = new Map<string, number>();
  if ((sort === 'relevance' || sort === 'popularity') && items.length) {
    const since = localDate(new Date(now.getTime() - 30 * 864e5));
    const stats = await prisma.analyticsDaily.groupBy({
      by: ['restaurantId'],
      where: { date: { gte: since }, restaurantId: { in: items.map((i) => i.id) } },
      _sum: { views: true, saves: true },
    });
    popularity = new Map(stats.map((s) => [s.restaurantId, (s._sum.views ?? 0) + 3 * (s._sum.saves ?? 0)]));
  }

  // Relevance blends rating, review volume, distance, open status, freshness of engagement and text match (spec 3.3).
  const relevance = (c: Candidate) =>
    (c.reviewCount ? c.avgRating : 3) * 0.6 +
    Math.log10(1 + c.reviewCount) * 0.8 +
    Math.log10(1 + (popularity.get(c.id) ?? 0)) * 0.3 +
    (status.get(c.id)?.state === 'open' ? 0.8 : 0) +
    (c.isVerified ? 0.2 : 0) +
    (c.textScore ?? 0) * 2 -
    ((c.dist ?? 3000) / 1000) * 0.15;
  const byDistance = (a: Candidate, b: Candidate) => (a.dist ?? 0) - (b.dist ?? 0);
  const ratingKey = (c: Candidate) => (c.reviewCount >= MIN_REVIEWS_FOR_RATING_SORT ? c.avgRating : 0);
  items = [...items].sort((a, b) => {
    switch (sort) {
      case 'distance':
        return byDistance(a, b);
      case 'rating':
        return ratingKey(b) - ratingKey(a) || byDistance(a, b);
      case 'cost_asc':
        return a.costForTwoPaise - b.costForTwoPaise || byDistance(a, b);
      case 'cost_desc':
        return b.costForTwoPaise - a.costForTwoPaise || byDistance(a, b);
      case 'popularity':
        return (popularity.get(b.id) ?? 0) - (popularity.get(a.id) ?? 0) || byDistance(a, b);
      default:
        return relevance(b) - relevance(a);
    }
  });

  const offset = query.offset ?? 0;
  const limit = Math.min(query.limit ?? 20, 100);
  let pageIds = items.slice(offset, offset + limit).map((c) => c.id);

  // One promoted card tops the first relevance page, only in cities with sponsored listings on (spec 2.3, 6).
  let promotedId: string | null = null;
  if (sort === 'relevance' && offset === 0 && items.length) {
    const sponsoredCities = await citiesWhereFlag('sponsored_enabled', true);
    if (sponsoredCities.length) {
      const promo = await prisma.sponsoredPlacement.findFirst({
        where: {
          restaurantId: { in: items.map((i) => i.id) },
          startsOn: { lte: now },
          endsOn: { gte: now },
          restaurant: { cityId: { in: sponsoredCities } },
        },
        orderBy: { slot: 'asc' },
      });
      if (promo) {
        promotedId = promo.restaurantId;
        pageIds = [promo.restaurantId, ...pageIds.filter((id) => id !== promo.restaurantId)].slice(0, limit);
      }
    }
  }

  const distances = new Map(items.map((c) => [c.id, c.dist]));
  const data = (await cardsFor(pageIds, origin, now, distances)).map((c) => (c.id === promotedId ? { ...c, isPromoted: true } : c));
  recordImpressions(pageIds);

  return { data, total, nextCursor: offset + limit < total ? encodeCursor(offset + limit) : null };
}

export const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ offset })).toString('base64url');
export function decodeCursor(cursor?: string | null) {
  if (!cursor) return 0;
  try {
    const n = Number(JSON.parse(Buffer.from(cursor, 'base64url').toString()).offset);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** "Search appearances" for the partner dashboard; best effort, never blocks the response. */
function recordImpressions(ids: string[]) {
  if (!ids.length) return;
  const date = localDate(new Date());
  prisma
    .$executeRaw`INSERT INTO "AnalyticsDaily" ("restaurantId", date, "searchImpressions")
      SELECT id, ${date}, 1 FROM unnest(${ids}::text[]) AS id
      ON CONFLICT ("restaurantId", date) DO UPDATE SET "searchImpressions" = "AnalyticsDaily"."searchImpressions" + 1`
    .catch(() => {});
}

export async function bumpStat(restaurantId: string, field: 'views' | 'calls' | 'directions' | 'saves' | 'shares', by = 1) {
  const date = localDate(new Date());
  await prisma.analyticsDaily.upsert({
    where: { restaurantId_date: { restaurantId, date } },
    create: { restaurantId, date, [field]: by },
    update: { [field]: { increment: by } },
  });
}

export async function recalcRating(restaurantId: string) {
  const reviews = await prisma.review.findMany({
    where: { restaurantId, status: 'published', deletedAt: null },
    select: { rating: true },
  });
  const breakdown = [0, 0, 0, 0, 0];
  for (const r of reviews) breakdown[r.rating - 1]++;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  await prisma.restaurant.update({
    where: { id: restaurantId },
    data: { avgRating: Math.round(avg * 10) / 10, reviewCount: reviews.length, ratingBreakdown: breakdown },
  });
}

export type { OpenStatus };
