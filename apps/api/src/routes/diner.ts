import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { optionalUser, requireUser } from '../lib/auth.js';
import { json, prisma } from '../lib/db.js';
import { badRequest, conflict, csvList, notFound, parse } from '../lib/http.js';
import { addDays, localDate, openStatus, todayWindows } from '../lib/hours.js';
import { toRupees } from '../lib/money.js';
import { textFlags } from '../lib/moderation.js';
import { notifyTeam } from '../lib/notify.js';
import {
  activeOffers,
  bumpStat,
  cardInclude,
  cardsFor,
  decodeCursor,
  listRestaurants,
  recalcRating,
  toCard,
  toSpecials,
  visibleWhere,
  type ListingQuery,
} from '../lib/restaurants.js';
import { normaliseQuery, trendingSearches } from '../lib/search.js';
import { citiesWhereFlag, getFlags } from '../lib/settings.js';

const bool = z
  .union([z.literal('1'), z.literal('true'), z.literal('0'), z.literal('false')])
  .transform((v) => v === '1' || v === 'true')
  .optional();

const listingSchema = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  city_id: z.string().optional(),
  sort: z.enum(['relevance', 'distance', 'rating', 'cost_asc', 'cost_desc', 'popularity']).optional(),
  open_now: bool,
  open_late: bool,
  open_24h: bool,
  rating_min: z.coerce.number().optional(),
  cost_min: z.coerce.number().optional(),
  cost_max: z.coerce.number().optional(),
  radius_km: z.coerce.number().positive().max(100).optional(),
  cuisines: z.string().optional(),
  types: z.string().optional(),
  attributes: z.string().optional(),
  has_offers: bool,
  is_new: bool,
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  count_only: bool,
});

function toListingQuery(raw: z.infer<typeof listingSchema>): ListingQuery {
  return {
    lat: raw.lat,
    lng: raw.lng,
    cityId: raw.city_id,
    sort: raw.sort,
    openNow: raw.open_now,
    openLate: raw.open_late,
    open24h: raw.open_24h,
    ratingMin: raw.rating_min,
    costMin: raw.cost_min,
    costMax: raw.cost_max,
    radiusKm: raw.radius_km,
    cuisines: csvList(raw.cuisines),
    types: csvList(raw.types),
    attributes: csvList(raw.attributes),
    hasOffers: raw.has_offers,
    isNew: raw.is_new,
    q: raw.q,
    offset: decodeCursor(raw.cursor),
    limit: raw.limit,
    countOnly: raw.count_only,
  };
}

async function findVisible(idOrSlug: string) {
  const r = await prisma.restaurant.findFirst({
    where: await visibleWhere({ OR: [{ id: idOrSlug }, { slug: idOrSlug }] }),
  });
  if (!r) throw notFound('Restaurant');
  return r;
}

const deviceId = (req: FastifyRequest) => {
  const v = req.headers['x-device-id'];
  return typeof v === 'string' && /^[\w-]{8,64}$/.test(v) ? v : null;
};

// Reviewer levels shown next to names (spec 4.5).
const LEVELS = [0, 3, 10, 25, 50];
const levelFor = (count: number) => LEVELS.filter((n) => count >= n).length;

/** Rough travel time in town: walking up to 1.5 km, otherwise a two-wheeler / car at ~24 km/h. */
function travel(distanceM: number | null) {
  if (distanceM == null) return null;
  return distanceM <= 1500
    ? { mode: 'walk' as const, minutes: Math.max(1, Math.round(distanceM / 80)) }
    : { mode: 'drive' as const, minutes: Math.round(distanceM / 400) + 3 };
}

// Default personal lists (spec 3.4). The heart on a card saves to "Want to go".
const DEFAULT_LISTS = [
  { kind: 'want_to_go', name: 'Want to go' },
  { kind: 'favourites', name: 'Favourites' },
];
const shareSlug = () => randomBytes(6).toString('base64url');

async function ensureLists(userId: string) {
  const lists = await prisma.savedList.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const missing = DEFAULT_LISTS.filter((d) => !lists.some((l) => l.kind === d.kind));
  for (const d of missing) lists.push(await prisma.savedList.create({ data: { userId, ...d, shareSlug: shareSlug() } }));
  return lists;
}

const EVENT_NAMES = [
  'app_open', 'location_set', 'search', 'filter_apply', 'card_impression', 'card_tap', 'detail_tab_view',
  'action_call', 'action_directions', 'action_share', 'action_book', 'save', 'review_submit',
  // Legacy names from v1 web clients.
  'view', 'call', 'directions', 'share',
] as const;
const STAT_FOR: Partial<Record<(typeof EVENT_NAMES)[number], 'views' | 'calls' | 'directions' | 'shares'>> = {
  view: 'views', call: 'calls', action_call: 'calls', directions: 'directions', action_directions: 'directions', share: 'shares', action_share: 'shares',
};

export async function dinerRoutes(app: FastifyInstance) {
  app.get('/v1/restaurants', async (req) => listRestaurants(toListingQuery(parse(listingSchema, req.query))));

  // Home feed (spec 2.2): quick chips, cuisines near you, collections and the nearby count.
  app.get('/v1/home', async (req) => {
    const { lat, lng } = parse(z.object({ lat: z.coerce.number(), lng: z.coerce.number() }), req.query);
    const base = { lat, lng, radiusKm: 25, limit: 10 };
    const nearbyIds = await prisma.$queryRaw<{ id: string; cityId: string }[]>`
      SELECT r.id, r."cityId" FROM "Restaurant" r
      WHERE r.status = 'live' AND r."deletedAt" IS NULL
        AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 25000)`;
    const cityId = nearbyIds[0]?.cityId ?? null;
    const [all, topRated, trending, newest, offers, pureVeg, rooftop, breakfast, cuisines, cuisineCounts, editorial] = await Promise.all([
      listRestaurants({ ...base, countOnly: true }),
      listRestaurants({ ...base, sort: 'rating', ratingMin: 4 }),
      listRestaurants({ ...base, sort: 'popularity' }),
      listRestaurants({ ...base, isNew: true, sort: 'distance' }),
      listRestaurants({ ...base, hasOffers: true }),
      listRestaurants({ ...base, attributes: ['pure_veg'] }),
      listRestaurants({ ...base, attributes: ['rooftop', 'outdoor_seating'] }),
      listRestaurants({ ...base, attributes: ['breakfast'] }),
      prisma.cuisine.findMany(),
      prisma.restaurantCuisine.groupBy({ by: ['cuisineId'], where: { restaurantId: { in: nearbyIds.map((n) => n.id) } }, _count: true }),
      prisma.collection.findMany({
        where: {
          isPublished: true,
          type: 'editorial',
          OR: [{ cityId: null }, ...(cityId ? [{ cityId }] : [])],
          AND: [{ OR: [{ startsOn: null }, { startsOn: { lte: new Date() } }] }, { OR: [{ endsOn: null }, { endsOn: { gte: new Date() } }] }],
        },
        include: { restaurants: { orderBy: { sortOrder: 'asc' }, take: 10 } },
        orderBy: { sortOrder: 'asc' },
        take: 4,
      }),
    ]);
    const countById = new Map(cuisineCounts.map((c) => [c.cuisineId, c._count]));
    const editorialCards = await Promise.all(
      editorial.map(async (c) => ({
        key: `c_${c.slug}`,
        slug: c.slug,
        title: c.title,
        titleHi: c.titleHi ?? c.title,
        description: c.description,
        filter: null as string | null,
        items: await cardsFor(c.restaurants.map((r) => r.restaurantId), { lat, lng }),
      })),
    );
    return {
      nearbyCount: all.total,
      cityId,
      chips: [
        { key: 'open_now', label: 'Open now', labelHi: 'अभी खुला', filter: 'open_now=1' },
        { key: 'rating_4', label: 'Rating 4.0+', labelHi: 'रेटिंग 4.0+', filter: 'rating_min=4' },
        { key: 'pure_veg', label: 'Pure veg', labelHi: 'शुद्ध शाकाहारी', filter: 'attributes=pure_veg' },
        { key: 'offers', label: 'Offers', labelHi: 'ऑफ़र', filter: 'has_offers=1' },
        { key: 'under_500', label: 'Under ₹500 for two', labelHi: 'दो के लिए ₹500 से कम', filter: 'cost_max=500' },
        { key: 'near_me', label: 'Near me', labelHi: 'मेरे पास', filter: 'sort=distance&radius_km=3' },
      ],
      cuisines: cuisines
        .map((c) => ({ slug: c.slug, name: c.name, nameHi: c.nameHi, icon: c.icon, count: countById.get(c.id) ?? 0 }))
        .filter((c) => c.count > 0)
        .sort((a, b) => b.count - a.count),
      collections: [
        ...editorialCards,
        { key: 'trending', title: 'Trending this week', titleHi: 'इस हफ़्ते ट्रेंडिंग', filter: 'sort=popularity', items: trending.data },
        { key: 'top_rated', title: 'Top rated near you', titleHi: 'आस-पास के टॉप रेटेड', filter: 'sort=rating&rating_min=4', items: topRated.data },
        { key: 'offers', title: 'Great offers', titleHi: 'बढ़िया ऑफ़र', filter: 'has_offers=1', items: offers.data },
        { key: 'breakfast', title: 'Great breakfasts', titleHi: 'बढ़िया नाश्ता', filter: 'attributes=breakfast', items: breakfast.data },
        { key: 'pure_veg', title: 'Pure veg favourites', titleHi: 'शुद्ध शाकाहारी', filter: 'attributes=pure_veg', items: pureVeg.data },
        { key: 'rooftop', title: 'Rooftop & open-air', titleHi: 'रूफ़टॉप और खुले में', filter: 'attributes=rooftop,outdoor_seating', items: rooftop.data },
        { key: 'new', title: 'New openings', titleHi: 'नई जगहें', filter: 'is_new=1', items: newest.data },
      ].filter((c) => c.items.length > 0),
    };
  });

  // Type-ahead (spec 3.1): restaurants, cuisines and dishes; typo tolerant; trending when empty.
  app.get('/v1/search', async (req) => {
    const { q, lat, lng } = parse(
      z.object({ q: z.string().default(''), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }),
      req.query,
    );
    if (q.trim().length < 2) return { restaurants: [], cuisines: [], dishes: [], trending: await trendingSearches() };
    const needle = await normaliseQuery(q);
    const like = `%${needle}%`;
    const hidden = await citiesWhereFlag('unclaimed_listings_enabled', false);
    const [restaurants, cuisines, dishRows] = await Promise.all([
      listRestaurants({ q, lat, lng, limit: 6, radiusKm: lat != null ? 40 : undefined }),
      prisma.$queryRaw<{ id: string; slug: string; name: string; nameHi: string | null; icon: string | null }[]>`
        SELECT id, slug, name, "nameHi", icon FROM "Cuisine"
        WHERE lower(unaccent(name)) LIKE ${like} OR slug LIKE ${like} OR lower(coalesce("nameHi", '')) LIKE ${like}
           OR word_similarity(${needle}, lower(unaccent(name))) > 0.5
        ORDER BY word_similarity(${needle}, lower(unaccent(name))) DESC LIMIT 5`,
      prisma.$queryRaw<{ name: string; restaurantId: string; slug: string; restaurant: string; score: number }[]>`
        SELECT mi.name, r.id AS "restaurantId", r.slug, r.name AS restaurant,
               word_similarity(${needle}, lower(unaccent(mi.name))) AS score
        FROM "MenuItem" mi JOIN "Restaurant" r ON r.id = mi."restaurantId"
        WHERE r.status = 'live' AND r."deletedAt" IS NULL AND (r."isClaimed" OR r."cityId" <> ALL(${hidden}::text[]))
          AND (lower(unaccent(mi.name)) LIKE ${like} OR word_similarity(${needle}, lower(unaccent(mi.name))) > 0.5)
        ORDER BY score DESC LIMIT 60`,
    ]);
    const dishes = new Map<string, { name: string; restaurants: { id: string; slug: string; name: string }[] }>();
    for (const d of dishRows) {
      const key = d.name.toLowerCase();
      const entry = dishes.get(key) ?? { name: d.name, restaurants: [] };
      if (!entry.restaurants.some((r) => r.id === d.restaurantId)) entry.restaurants.push({ id: d.restaurantId, slug: d.slug, name: d.restaurant });
      dishes.set(key, entry);
    }
    const user = await optionalUser(req);
    await prisma.event.create({ data: { name: 'search', userId: user?.id, anonId: deviceId(req), props: { q: q.trim().slice(0, 80) } } }).catch(() => {});
    return { restaurants: restaurants.data, cuisines, dishes: [...dishes.values()].slice(0, 6), corrected: needle !== q.trim().toLowerCase() ? needle : null };
  });

  app.get('/v1/search/trending', async () => ({ data: await trendingSearches() }));

  app.get('/v1/restaurants/:idOrSlug', async (req) => {
    const { idOrSlug } = req.params as { idOrSlug: string };
    const { lat, lng } = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.query);
    const found = await findVisible(idOrSlug);
    const now = new Date();
    const r = await prisma.restaurant.findUniqueOrThrow({
      where: { id: found.id },
      include: {
        ...cardInclude(now),
        photos: { where: { status: 'approved', deletedAt: null }, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }], take: 30 },
        specialHours: { where: { date: { gte: new Date(`${addDays(localDate(now), -1)}T00:00:00Z`) } }, orderBy: { date: 'asc' }, take: 40 },
        menuItems: { where: { tags: { hasSome: ['bestseller', 'chef_special'] } }, select: { name: true }, take: 5 },
        _count: { select: { menuItems: true, photos: { where: { status: 'approved', deletedAt: null } } } },
      },
    });
    const tz = r.city.timezone;
    const user = await optionalUser(req);
    const savedIn = user
      ? (await prisma.savedListItem.findMany({ where: { restaurantId: r.id, list: { userId: user.id } }, select: { listId: true } })).map((x) => x.listId)
      : [];
    const [aspects, topDishes, similar] = await Promise.all([
      prisma.review.aggregate({
        where: { restaurantId: r.id, status: 'published', deletedAt: null },
        _avg: { foodRating: true, serviceRating: true, ambienceRating: true, valueRating: true },
      }),
      prisma.reviewDish.groupBy({
        by: ['menuItemId'],
        where: { review: { restaurantId: r.id, status: 'published' } },
        _count: true,
        orderBy: { _count: { menuItemId: 'desc' } },
        take: 3,
      }),
      prisma.restaurant.findMany({
        where: await visibleWhere({ id: { not: r.id }, cityId: r.cityId, cuisines: { some: { cuisineId: { in: r.cuisines.map((c) => c.cuisineId) } } } }),
        include: cardInclude(now),
        orderBy: { avgRating: 'desc' },
        take: 6,
      }),
    ]);
    const dishNames = topDishes.length
      ? (await prisma.menuItem.findMany({ where: { id: { in: topDishes.map((d) => d.menuItemId) } }, select: { name: true } })).map((d) => d.name)
      : [];
    const origin = lat != null && lng != null ? { lat, lng } : null;
    const card = toCard(r, origin, now);
    const specials = toSpecials(r.specialHours);
    const today = todayWindows(r.hours, specials, now, tz);

    // Highlights (spec 4.2): known-for, must-try dishes (from tags and review mentions) and "great for".
    const occasions = r.attributes.filter((a) => a.attribute.group === 'occasion').map((a) => a.attribute.name);
    const greatFor = [...occasions];
    if (r.attributes.some((a) => a.attribute.key === 'family_friendly') && !greatFor.includes('Family')) greatFor.push('Family outings');
    if ((aspects._avg.valueRating ?? 0) >= 4.2) greatFor.push('Value for money');
    if ((aspects._avg.serviceRating ?? 0) >= 4.3) greatFor.push('Great service');

    return {
      ...card,
      photos: r.photos.map((p) => ({ id: p.id, url: p.url, category: p.category, source: p.source, width: p.width, height: p.height })),
      photoCount: r._count.photos,
      description: r.description,
      address: { line: r.addressLine, landmark: r.landmark, pincode: r.pincode, city: r.city.name },
      phone: r.phone,
      whatsapp: r.whatsapp,
      website: r.website,
      bookingUrl: r.bookingUrl,
      socialLinks: r.socialLinks,
      fssaiNumber: r.fssaiNumber,
      lastInspectionOn: r.lastInspectionOn,
      knownFor: r.knownFor,
      highlights: {
        knownFor: r.knownFor,
        mustTry: [...new Set([...dishNames, ...r.menuItems.map((m) => m.name)])].slice(0, 4),
        greatFor: greatFor.slice(0, 4),
      },
      policies: { dressCode: r.dressCode, agePolicy: r.agePolicy, alcoholPolicy: r.alcoholPolicy },
      parkingInfo: r.parkingInfo,
      allergenNotes: r.allergenNotes,
      avgWaitMins: r.avgWaitMins,
      bestTimeToVisit: r.bestTimeToVisit,
      travel: travel(card.distanceM),
      hours: r.hours
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt))
        .map((h) => ({ dayOfWeek: h.dayOfWeek, opensAt: h.opensAt, closesAt: h.closesAt })),
      todayHours: today,
      specialHours: specials.filter((s) => s.date >= localDate(now, tz)).slice(0, 10),
      openStatus: openStatus(r.hours, now, r.temporarilyClosedUntil, tz, specials),
      attributes: r.attributes.map((a) => ({ key: a.attribute.key, name: a.attribute.name, nameHi: a.attribute.nameHi, group: a.attribute.group, icon: a.attribute.icon })),
      offers: activeOffers(r, now, tz).map((o) => ({ id: o.id, title: o.title, terms: o.terms, validFromTime: o.validFromTime, validToTime: o.validToTime })),
      ratingBreakdown: r.ratingBreakdown as number[],
      aspectRatings: { food: aspects._avg.foodRating, service: aspects._avg.serviceRating, ambience: aspects._avg.ambienceRating, value: aspects._avg.valueRating },
      reviewSummary: r.reviewSummary,
      menuItemCount: r._count.menuItems,
      hoursConfirmedAt: r.hoursConfirmedAt,
      menuUpdatedAt: r.menuUpdatedAt,
      isSaved: savedIn.length > 0,
      savedInLists: savedIn,
      similar: similar.map((s) => toCard(s, origin, now)),
    };
  });

  app.get('/v1/restaurants/:id/menu', async (req) => {
    const r = await findVisible((req.params as { id: string }).id);
    const [sections, menuPhotos] = await Promise.all([
      prisma.menuSection.findMany({
        where: { restaurantId: r.id },
        orderBy: { sortOrder: 'asc' },
        include: { items: { orderBy: { sortOrder: 'asc' }, include: { variants: { orderBy: { sortOrder: 'asc' } } } } },
      }),
      prisma.photo.findMany({ where: { restaurantId: r.id, category: 'menu', status: 'approved', deletedAt: null }, orderBy: { sortOrder: 'asc' } }),
    ]);
    return {
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sortOrder,
        items: s.items.map(({ pricePaise, variants, ...i }) => ({
          ...i,
          price: toRupees(pricePaise),
          variants: variants.map((v) => ({ id: v.id, name: v.name, price: toRupees(v.pricePaise) })),
        })),
      })),
      menuPhotos: menuPhotos.map((p) => p.url),
      updatedAt: r.menuUpdatedAt,
    };
  });

  app.get('/v1/restaurants/:id/photos', async (req) => {
    const r = await findVisible((req.params as { id: string }).id);
    const q = parse(
      z.object({ category: z.enum(['food', 'ambience', 'menu', 'exterior']).optional(), source: z.enum(['partner', 'diner', 'field']).optional(), cursor: z.string().optional(), limit: z.coerce.number().max(60).default(30) }),
      req.query,
    );
    const offset = decodeCursor(q.cursor);
    const where = { restaurantId: r.id, status: 'approved', deletedAt: null, ...(q.category ? { category: q.category } : {}), ...(q.source ? { source: q.source } : {}) };
    const [rows, total, counts] = await Promise.all([
      prisma.photo.findMany({ where, orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }], skip: offset, take: q.limit }),
      prisma.photo.count({ where }),
      prisma.photo.groupBy({ by: ['category'], where: { restaurantId: r.id, status: 'approved', deletedAt: null }, _count: true }),
    ]);
    return {
      data: rows.map((p) => ({ id: p.id, url: p.url, category: p.category, source: p.source, width: p.width, height: p.height, createdAt: p.createdAt })),
      total,
      counts: Object.fromEntries(counts.map((c) => [c.category, c._count])),
      nextCursor: offset + q.limit < total ? Buffer.from(JSON.stringify({ offset: offset + q.limit })).toString('base64url') : null,
    };
  });

  const reviewInclude = {
    user: { select: { id: true, name: true, avatarUrl: true } },
    reply: true,
    photos: { include: { photo: true } },
    dishes: { include: { menuItem: { select: { id: true, name: true } } } },
  } as const;

  app.get('/v1/restaurants/:id/reviews', async (req) => {
    const r = await findVisible((req.params as { id: string }).id);
    const q = parse(
      z.object({
        sort: z.enum(['relevant', 'newest', 'highest', 'lowest']).default('relevant'),
        rating: z.coerce.number().int().min(1).max(5).optional(),
        with_photos: bool,
        q: z.string().trim().max(60).optional(),
        cursor: z.string().optional(),
        limit: z.coerce.number().max(50).default(10),
      }),
      req.query,
    );
    const offset = decodeCursor(q.cursor);
    const where = {
      restaurantId: r.id,
      status: 'published',
      deletedAt: null,
      ...(q.rating ? { rating: q.rating } : {}),
      ...(q.with_photos ? { photos: { some: { photo: { status: 'approved' } } } } : {}),
      ...(q.q ? { text: { contains: q.q, mode: 'insensitive' as const } } : {}),
    };
    const orderBy =
      q.sort === 'newest'
        ? [{ createdAt: 'desc' as const }]
        : q.sort === 'highest'
          ? [{ rating: 'desc' as const }, { createdAt: 'desc' as const }]
          : q.sort === 'lowest'
            ? [{ rating: 'asc' as const }, { createdAt: 'desc' as const }]
            : [{ helpfulCount: 'desc' as const }, { createdAt: 'desc' as const }];
    const [items, total] = await Promise.all([
      prisma.review.findMany({ where, orderBy, skip: offset, take: q.limit, include: reviewInclude }),
      prisma.review.count({ where }),
    ]);
    const counts = await prisma.review.groupBy({
      by: ['userId'],
      where: { userId: { in: items.map((i) => i.userId) }, status: 'published' },
      _count: true,
    });
    const countBy = new Map(counts.map((c) => [c.userId, c._count]));
    const me = await optionalUser(req);
    const voted = me ? new Set((await prisma.reviewVote.findMany({ where: { userId: me.id, reviewId: { in: items.map((i) => i.id) } } })).map((v) => v.reviewId)) : new Set<string>();
    return {
      data: items.map(({ photos, dishes, user, ...rv }) => ({
        ...rv,
        user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl, level: levelFor(countBy.get(user.id) ?? 0), reviewCount: countBy.get(user.id) ?? 0 },
        photos: photos.filter((p) => p.photo.status === 'approved' && !p.photo.deletedAt).map((p) => ({ id: p.photo.id, url: p.photo.url })),
        dishes: dishes.map((d) => d.menuItem),
        votedHelpful: voted.has(rv.id),
      })),
      total,
      summary: r.reviewSummary,
      nextCursor: offset + q.limit < total ? Buffer.from(JSON.stringify({ offset: offset + q.limit })).toString('base64url') : null,
    };
  });

  app.post('/v1/restaurants/:id/reviews', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (req, reply) => {
    const user = await requireUser(req);
    const r = await findVisible((req.params as { id: string }).id);
    const rules = (await getFlags(r.cityId)).review_rules;
    const aspect = z.number().int().min(1).max(5).optional();
    const body = parse(
      z.object({
        rating: z.number().int().min(1).max(5),
        foodRating: aspect,
        serviceRating: aspect,
        ambienceRating: aspect,
        valueRating: aspect,
        text: z.string().trim().min(rules.minChars, `Please write at least ${rules.minChars} characters`).max(3000),
        visitType: z.enum(['dine_in', 'takeaway']).default('dine_in'),
        visitedOn: z.iso.date().optional(),
        photos: z.array(z.object({ url: z.string().min(1), width: z.number().optional(), height: z.number().optional() })).max(10).default([]),
        dishIds: z.array(z.string()).max(10).default([]),
      }),
      req.body,
    );
    const account = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!account.phoneVerified) throw badRequest('Verify your phone number to write reviews');
    const isMember = await prisma.restaurantMember.findUnique({ where: { restaurantId_userId: { restaurantId: r.id, userId: user.id } } });
    if (isMember) throw badRequest('You cannot review a restaurant you manage');
    const cooldown = new Date(Date.now() - rules.cooldownDays * 864e5);
    const recent = await prisma.review.findFirst({ where: { restaurantId: r.id, userId: user.id, createdAt: { gte: cooldown } } });
    if (recent) throw conflict(`You can review this place once every ${rules.cooldownDays} days`);
    const today = await prisma.review.count({ where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 864e5) } } });
    if (today >= rules.perDayLimit) throw badRequest('Daily review limit reached');
    if (body.visitedOn && body.visitedOn > localDate(new Date())) throw badRequest('Visit date cannot be in the future');

    // Fake review defences (spec 6): content flags, 5★ velocity bursts and device reuse across accounts.
    const flags = textFlags(body.text);
    const device = deviceId(req);
    if (body.rating === 5) {
      const burst = await prisma.review.count({ where: { restaurantId: r.id, rating: 5, createdAt: { gte: new Date(Date.now() - 864e5) } } });
      if (burst + 1 >= rules.burstThreshold) flags.push('velocity');
    }
    if (device) {
      const other = await prisma.review.findFirst({ where: { restaurantId: r.id, deviceId: device, userId: { not: user.id }, createdAt: { gte: cooldown } } });
      if (other) flags.push('shared_device');
    }
    const dishes = body.dishIds.length
      ? await prisma.menuItem.findMany({ where: { id: { in: body.dishIds }, restaurantId: r.id }, select: { id: true } })
      : [];

    const { photos, dishIds: _d, visitedOn, ...fields } = body;
    const review = await prisma.review.create({
      data: {
        ...fields,
        visitedOn: visitedOn ? new Date(`${visitedOn}T00:00:00Z`) : null,
        restaurantId: r.id,
        userId: user.id,
        deviceId: device,
        status: flags.length ? 'pending' : 'published',
        flagReasons: flags,
        dishes: { create: dishes.map((d) => ({ menuItemId: d.id })) },
        // Diner photos wait for moderation before they appear (spec 4.4).
        photos: {
          create: photos.map((p) => ({
            photo: { create: { restaurantId: r.id, uploadedById: user.id, source: 'diner', category: 'food', url: p.url, width: p.width, height: p.height, status: 'pending' } },
          })),
        },
      },
      include: reviewInclude,
    });
    if (!flags.length) {
      await recalcRating(r.id);
      // Low ratings reach the owner instantly; others arrive in the daily digest (spec 5.4).
      if (body.rating <= 2) await notifyTeam(r.id, 'review_new', { restaurant: r.name, rating: body.rating, excerpt: body.text.slice(0, 140) }, { sms: true });
    }
    await prisma.event.create({ data: { name: 'review_submit', userId: user.id, restaurantId: r.id, props: { rating: body.rating, photos: photos.length } } });
    reply.code(201);
    return { ...review, held: flags.length > 0 };
  });

  app.post('/v1/reviews/:id/helpful', async (req) => {
    const user = await requireUser(req);
    const { id } = req.params as { id: string };
    const review = await prisma.review.findFirst({ where: { id, deletedAt: null } });
    if (!review) throw notFound('Review');
    const key = { reviewId_userId: { reviewId: id, userId: user.id } };
    const existing = await prisma.reviewVote.findUnique({ where: key });
    if (existing) await prisma.reviewVote.delete({ where: key });
    else await prisma.reviewVote.create({ data: { reviewId: id, userId: user.id } });
    const count = await prisma.reviewVote.count({ where: { reviewId: id } });
    await prisma.review.update({ where: { id }, data: { helpfulCount: count } });
    return { helpful: !existing, helpfulCount: count };
  });

  // Reports and info corrections (spec 4.6, 6). `proposed` carries the diner's suggested fix.
  app.post('/v1/reports', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const user = await requireUser(req);
    const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
    const body = parse(
      z.object({
        targetType: z.enum(['review', 'photo', 'restaurant']),
        targetId: z.string(),
        reason: z.enum(['spam', 'offensive', 'fake', 'wrong_info', 'closed_permanently', 'wrong_hours', 'wrong_phone', 'other']),
        details: z.string().max(1000).optional(),
        proposed: z
          .object({
            phone: z.string().regex(/^[6-9]\d{9}$/).optional(),
            addressLine: z.string().max(200).optional(),
            hours: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), opensAt: hhmm, closesAt: hhmm })).max(28).optional(),
          })
          .optional(),
      }),
      req.body,
    );
    const dup = await prisma.report.findFirst({ where: { reporterId: user.id, targetId: body.targetId, status: 'open' } });
    if (dup) throw conflict('You already reported this. Our team will check it.');
    const report = await prisma.report.create({ data: { ...body, proposed: json(body.proposed), reporterId: user.id } as never });
    if (body.targetType === 'restaurant') {
      const r = await prisma.restaurant.findUnique({ where: { id: body.targetId } });
      if (r) await notifyTeam(r.id, 'correction_reported', { restaurant: r.name, reason: body.reason.replace(/_/g, ' ') });
    }
    reply.code(201);
    return report;
  });

  // Batched analytics events (spec 10.2, 11.3). Precise coordinates are dropped (spec 11.2).
  app.post('/v1/events', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(
      z.object({
        events: z
          .array(
            z.object({
              name: z.enum(EVENT_NAMES).optional(),
              type: z.enum(['view', 'call', 'directions', 'share']).optional(),
              restaurantId: z.string().optional(),
              props: z.record(z.string(), z.unknown()).optional(),
            }),
          )
          .max(50),
      }),
      req.body,
    );
    const user = await optionalUser(req);
    const anonId = deviceId(req);
    const valid = new Set(body.events.filter((e) => e.restaurantId).length ? (await prisma.restaurant.findMany({ where: { id: { in: body.events.flatMap((e) => (e.restaurantId ? [e.restaurantId] : [])) } }, select: { id: true } })).map((r) => r.id) : []);
    const rows = [];
    for (const e of body.events) {
      const name = e.name ?? e.type;
      if (!name) continue;
      const restaurantId = e.restaurantId && valid.has(e.restaurantId) ? e.restaurantId : null;
      const { lat: _lat, lng: _lng, ...props } = (e.props ?? {}) as Record<string, unknown>;
      rows.push({ name, userId: user?.id ?? null, anonId, restaurantId, props: json(props) as object });
      const stat = STAT_FOR[name];
      if (restaurantId && stat) await bumpStat(restaurantId, stat);
    }
    if (rows.length) await prisma.event.createMany({ data: rows });
    return { ok: true, accepted: rows.length };
  });

  // ---- Personal lists (spec 3.4) ----
  app.get('/v1/me/lists', async (req) => {
    const user = await requireUser(req);
    const lists = await ensureLists(user.id);
    const counts = await prisma.savedListItem.groupBy({ by: ['listId'], where: { listId: { in: lists.map((l) => l.id) } }, _count: true });
    const covers = await prisma.savedListItem.findMany({
      where: { listId: { in: lists.map((l) => l.id) } },
      orderBy: { addedAt: 'desc' },
      include: { restaurant: { select: { photos: { where: { isCover: true, deletedAt: null }, take: 1, select: { url: true } } } } },
    });
    return {
      data: lists.map((l) => ({
        ...l,
        count: counts.find((c) => c.listId === l.id)?._count ?? 0,
        cover: covers.find((c) => c.listId === l.id)?.restaurant.photos[0]?.url ?? null,
      })),
    };
  });

  app.post('/v1/me/lists', async (req, reply) => {
    const user = await requireUser(req);
    const { name, isPublic } = parse(z.object({ name: z.string().trim().min(1).max(60), isPublic: z.boolean().default(false) }), req.body);
    if ((await prisma.savedList.count({ where: { userId: user.id } })) >= 30) throw badRequest('You can have up to 30 lists');
    reply.code(201);
    return prisma.savedList.create({ data: { userId: user.id, name, isPublic, kind: 'custom', shareSlug: shareSlug() } });
  });

  app.patch('/v1/me/lists/:id', async (req) => {
    const user = await requireUser(req);
    const data = parse(z.object({ name: z.string().trim().min(1).max(60).optional(), isPublic: z.boolean().optional() }), req.body);
    const { count } = await prisma.savedList.updateMany({ where: { id: (req.params as { id: string }).id, userId: user.id }, data });
    if (!count) throw notFound('List');
    return { ok: true };
  });

  app.delete('/v1/me/lists/:id', async (req) => {
    const user = await requireUser(req);
    const list = await prisma.savedList.findFirst({ where: { id: (req.params as { id: string }).id, userId: user.id } });
    if (!list) throw notFound('List');
    if (list.kind !== 'custom') throw badRequest('Built-in lists cannot be deleted');
    await prisma.savedList.delete({ where: { id: list.id } });
    return { ok: true };
  });

  async function listWithCards(listId: string, origin: { lat: number; lng: number } | null) {
    const items = await prisma.savedListItem.findMany({ where: { listId, restaurant: await visibleWhere() }, orderBy: { addedAt: 'desc' } });
    return cardsFor(items.map((i) => i.restaurantId), origin);
  }

  app.get('/v1/me/lists/:id', async (req) => {
    const user = await requireUser(req);
    const { lat, lng } = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.query);
    const list = await prisma.savedList.findFirst({ where: { id: (req.params as { id: string }).id, userId: user.id } });
    if (!list) throw notFound('List');
    return { ...list, items: await listWithCards(list.id, lat != null && lng != null ? { lat, lng } : null) };
  });

  app.post('/v1/me/lists/:id/items', async (req, reply) => {
    const user = await requireUser(req);
    const { restaurantId } = parse(z.object({ restaurantId: z.string() }), req.body);
    const list = await prisma.savedList.findFirst({ where: { id: (req.params as { id: string }).id, userId: user.id } });
    if (!list) throw notFound('List');
    const r = await findVisible(restaurantId);
    const key = { listId_restaurantId: { listId: list.id, restaurantId: r.id } };
    if (!(await prisma.savedListItem.findUnique({ where: key }))) {
      await prisma.savedListItem.create({ data: { listId: list.id, restaurantId: r.id } });
      await bumpStat(r.id, 'saves');
      await prisma.event.create({ data: { name: 'save', userId: user.id, restaurantId: r.id, props: { list: list.kind } } });
    }
    reply.code(201);
    return { saved: true };
  });

  app.delete('/v1/me/lists/:id/items/:restaurantId', async (req) => {
    const user = await requireUser(req);
    const { id, restaurantId } = req.params as { id: string; restaurantId: string };
    await prisma.savedListItem.deleteMany({ where: { listId: id, restaurantId, list: { userId: user.id } } });
    return { saved: false };
  });

  // Public share link for a list the owner made public.
  app.get('/v1/lists/:shareSlug', async (req) => {
    const list = await prisma.savedList.findUnique({ where: { shareSlug: (req.params as { shareSlug: string }).shareSlug }, include: { user: { select: { name: true } } } });
    if (!list || !list.isPublic) throw notFound('List');
    return { name: list.name, owner: list.user.name, items: await listWithCards(list.id, null) };
  });

  // Hearts on cards: every restaurant saved in any of the user's lists.
  app.get('/v1/me/saved/ids', async (req) => {
    const user = await requireUser(req);
    const rows = await prisma.savedListItem.findMany({ where: { list: { userId: user.id } }, select: { restaurantId: true }, distinct: ['restaurantId'] });
    return { data: rows.map((r) => r.restaurantId) };
  });

  app.get('/v1/me/saved', async (req) => {
    const user = await requireUser(req);
    const { lat, lng } = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.query);
    const rows = await prisma.savedListItem.findMany({
      where: { list: { userId: user.id }, restaurant: await visibleWhere() },
      orderBy: { addedAt: 'desc' },
      distinct: ['restaurantId'],
    });
    return { data: await cardsFor(rows.map((r) => r.restaurantId), lat != null && lng != null ? { lat, lng } : null) };
  });

  // Heart = add to "Want to go"; un-heart removes the place from every list.
  app.put('/v1/me/saved/:restaurantId', async (req) => {
    const user = await requireUser(req);
    const r = await findVisible((req.params as { restaurantId: string }).restaurantId);
    const list = (await ensureLists(user.id)).find((l) => l.kind === 'want_to_go')!;
    const key = { listId_restaurantId: { listId: list.id, restaurantId: r.id } };
    if (!(await prisma.savedListItem.findUnique({ where: key }))) {
      await prisma.savedListItem.create({ data: { listId: list.id, restaurantId: r.id } });
      await bumpStat(r.id, 'saves');
    }
    return { saved: true, listId: list.id };
  });

  app.delete('/v1/me/saved/:restaurantId', async (req) => {
    const user = await requireUser(req);
    const { restaurantId } = req.params as { restaurantId: string };
    await prisma.savedListItem.deleteMany({ where: { restaurantId, list: { userId: user.id } } });
    return { saved: false };
  });

  // ---- Collections (spec 3.4) ----
  app.get('/v1/collections/:idOrSlug', async (req) => {
    const { idOrSlug } = req.params as { idOrSlug: string };
    const { lat, lng } = parse(z.object({ lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.query);
    const c = await prisma.collection.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], isPublished: true },
      include: { restaurants: { orderBy: { sortOrder: 'asc' } }, city: { select: { name: true } } },
    });
    if (!c) throw notFound('Collection');
    const origin = lat != null && lng != null ? { lat, lng } : null;
    let items;
    if (c.type === 'auto' && c.rules) {
      const rules = c.rules as Partial<ListingQuery>;
      items = (await listRestaurants({ ...rules, cityId: c.cityId ?? undefined, lat, lng, limit: 50 })).data;
    } else {
      const visible = new Set((await prisma.restaurant.findMany({ where: await visibleWhere({ id: { in: c.restaurants.map((r) => r.restaurantId) } }), select: { id: true } })).map((r) => r.id));
      items = await cardsFor(c.restaurants.map((r) => r.restaurantId).filter((id) => visible.has(id)), origin);
    }
    const { restaurants: _r, ...meta } = c;
    return { ...meta, items };
  });

}
