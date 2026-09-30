import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/db.js';
import { distanceMeters } from '../lib/geo.js';
import { parse } from '../lib/http.js';
import { visibleWhere } from '../lib/restaurants.js';
import { getBrand, getFlags } from '../lib/settings.js';

const LIVE_CITY_RADIUS_M = 40_000;

type Place = { type: 'city' | 'locality' | 'address'; id: string; name: string; nameHi: string | null; label: string; lat: number; lng: number; cityId: string | null };

/** Optional external geocoder (Mapbox) for full addresses, landmarks and pincodes (spec 2.1). */
async function mapboxSuggest(q: string, near?: { lat: number; lng: number }): Promise<Place[]> {
  const token = process.env.MAPBOX_TOKEN;
  if (!token || q.trim().length < 3) return [];
  const url = new URL(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('country', 'in');
  url.searchParams.set('limit', '5');
  url.searchParams.set('types', 'address,poi,postcode,locality,neighborhood,place');
  if (near) url.searchParams.set('proximity', `${near.lng},${near.lat}`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return [];
    const data = (await res.json()) as { features: { id: string; text: string; place_name: string; center: [number, number] }[] };
    return data.features.map((f) => ({ type: 'address', id: f.id, name: f.text, nameHi: null, label: f.place_name, lat: f.center[1], lng: f.center[0], cityId: null }));
  } catch {
    return [];
  }
}

async function nearestLiveCity(lat: number, lng: number) {
  const cities = await prisma.city.findMany({ where: { isLive: true }, include: { localities: true } });
  const nearest = cities.map((c) => ({ c, d: distanceMeters(lat, lng, c.lat, c.lng) })).sort((a, b) => a.d - b.d)[0];
  if (!nearest || nearest.d > LIVE_CITY_RADIUS_M) return null;
  return nearest.c;
}

export async function configRoutes(app: FastifyInstance) {
  // Start-up config for every app: brand + feature flags (spec 11.6). Pass city_id for per-city flags.
  app.get('/v1/config', async (req) => {
    const { city_id } = parse(z.object({ city_id: z.string().optional() }), req.query);
    const [brand, flags] = await Promise.all([getBrand(), getFlags(city_id)]);
    return {
      brand,
      features: {
        unclaimedListings: flags.unclaimed_listings_enabled,
        sponsored: flags.sponsored_enabled,
        socialLogin: { google: !!process.env.GOOGLE_CLIENT_ID, apple: !!process.env.APPLE_CLIENT_ID },
        addressSearch: !!process.env.MAPBOX_TOKEN,
      },
      reviewRules: { minChars: flags.review_rules.minChars, maxPhotos: 10 },
    };
  });

  // Filter vocabulary with counts of visible places in the city (spec 10.2).
  app.get('/v1/filters', async (req) => {
    const { city_id } = parse(z.object({ city_id: z.string().optional() }), req.query);
    const where = await visibleWhere(city_id ? { cityId: city_id } : {});
    const [cuisines, types, attributes, cities, cuisineCounts, typeCounts, attrCounts] = await Promise.all([
      prisma.cuisine.findMany({ orderBy: { name: 'asc' } }),
      prisma.establishmentType.findMany({ orderBy: { name: 'asc' } }),
      prisma.attribute.findMany({ orderBy: { name: 'asc' } }),
      prisma.city.findMany({ where: { isLive: true }, include: { localities: { orderBy: { name: 'asc' } } }, orderBy: { name: 'asc' } }),
      prisma.restaurantCuisine.groupBy({ by: ['cuisineId'], where: { restaurant: where }, _count: true }),
      prisma.restaurant.groupBy({ by: ['typeId'], where, _count: true }),
      prisma.restaurantAttribute.groupBy({ by: ['attributeId'], where: { restaurant: where }, _count: true }),
    ]);
    const count = <T extends { _count: number }>(rows: T[], key: keyof T) => new Map(rows.map((r) => [r[key] as string, r._count]));
    const cc = count(cuisineCounts, 'cuisineId');
    const tc = count(typeCounts, 'typeId');
    const ac = count(attrCounts, 'attributeId');
    return {
      cuisines: cuisines.map((c) => ({ ...c, count: cc.get(c.id) ?? 0 })),
      types: types.map((t) => ({ ...t, count: tc.get(t.id) ?? 0 })),
      attributes: attributes.map((a) => ({ ...a, count: ac.get(a.id) ?? 0 })),
      cities,
    };
  });

  // Autocomplete: our towns and localities first, then street-level results from the geocoder.
  const autocomplete = async (req: { query: unknown }) => {
    const { q, lat, lng } = parse(z.object({ q: z.string().default(''), lat: z.coerce.number().optional(), lng: z.coerce.number().optional() }), req.query);
    const needle = q.trim().toLowerCase();
    const cities = await prisma.city.findMany({ where: { isLive: true }, include: { localities: true } });
    const ours: Place[] = cities.flatMap((c) => [
      { type: 'city' as const, id: c.id, name: c.name, nameHi: c.nameHi, label: `${c.name}, ${c.state}`, lat: c.lat, lng: c.lng, cityId: c.id },
      ...c.localities.map((l) => ({
        type: 'locality' as const,
        id: l.id,
        name: l.name,
        nameHi: l.nameHi,
        label: `${l.name}, ${c.name}`,
        lat: l.lat,
        lng: l.lng,
        cityId: c.id,
      })),
    ]);
    const matches = ours.filter((p) => !needle || `${p.label} ${p.nameHi ?? ''}`.toLowerCase().includes(needle)).slice(0, 8);
    const external = await mapboxSuggest(q, lat != null && lng != null ? { lat, lng } : undefined);
    return { data: [...matches, ...external].slice(0, 12) };
  };
  app.get('/v1/geo/autocomplete', autocomplete);
  app.get('/v1/geo/places', autocomplete);

  app.get('/v1/geo/reverse', async (req) => {
    const { lat, lng } = parse(z.object({ lat: z.coerce.number(), lng: z.coerce.number() }), req.query);
    const city = await nearestLiveCity(lat, lng);
    if (!city) return { isLive: false, city: null, locality: null };
    const locality = city.localities
      .map((l) => ({ l, d: distanceMeters(lat, lng, l.lat, l.lng) }))
      .sort((a, b) => a.d - b.d)[0];
    return {
      isLive: true,
      city: { id: city.id, slug: city.slug, name: city.name, nameHi: city.nameHi },
      locality: locality && locality.d < 3000 ? { id: locality.l.id, name: locality.l.name, nameHi: locality.l.nameHi } : null,
    };
  });

  // "We're not here yet — notify me" (spec 2.1).
  app.post('/v1/geo/waitlist', async (req, reply) => {
    const body = parse(z.object({ phone: z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number'), lat: z.number(), lng: z.number() }), req.body);
    const already = await prisma.cityWaitlist.findFirst({ where: { phone: body.phone, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } } });
    if (!already) await prisma.cityWaitlist.create({ data: { ...body } });
    reply.code(201);
    return { ok: true };
  });

  // Collections (spec 3.4): editorial ones curated per city, plus published auto collections.
  app.get('/v1/collections', async (req) => {
    const { city_id } = parse(z.object({ city_id: z.string().optional() }), req.query);
    const now = new Date();
    const rows = await prisma.collection.findMany({
      where: {
        isPublished: true,
        OR: [{ cityId: null }, ...(city_id ? [{ cityId: city_id }] : [])],
        AND: [{ OR: [{ startsOn: null }, { startsOn: { lte: now } }] }, { OR: [{ endsOn: null }, { endsOn: { gte: now } }] }],
      },
      include: { _count: { select: { restaurants: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    return { data: rows.map(({ _count, ...c }) => ({ ...c, restaurantCount: _count.restaurants })) };
  });
}
