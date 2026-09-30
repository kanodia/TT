import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { permissionsFor, requireMember, requireUser, type PartnerArea } from '../lib/auth.js';
import { applyTaxonomy, priceBandFor, typeIdFor, uniqueSlug } from '../lib/catalog.js';
import { parseCsv, parseXlsx, withoutHeader } from '../lib/csv.js';
import { audit, json, prisma } from '../lib/db.js';
import { badRequest, conflict, forbidden, notFound, parse } from '../lib/http.js';
import { localDate } from '../lib/hours.js';
import { toPaise, toRupees } from '../lib/money.js';
import { notify } from '../lib/notify.js';
import { visibleWhere } from '../lib/restaurants.js';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const phone = z.string().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');
const opt = <T extends z.ZodTypeAny>(s: T) => s.optional().nullable();

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  nameHi: opt(z.string().trim().max(100)),
  description: opt(z.string().trim().max(500)),
  cityId: z.string(),
  localityId: opt(z.string()),
  addressLine: z.string().trim().min(3).max(200),
  landmark: opt(z.string().trim().max(120)),
  pincode: opt(z.string().regex(/^\d{6}$/)),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  phone: opt(phone),
  whatsapp: opt(phone),
  website: opt(z.url()),
  bookingUrl: opt(z.url()),
  socialLinks: z.object({ instagram: z.url().optional(), facebook: z.url().optional(), youtube: z.url().optional() }).default({}),
  typeSlug: opt(z.string()),
  cuisineSlugs: z.array(z.string()).max(8).default([]),
  attributeKeys: z.array(z.string()).default([]),
  costForTwo: z.number().int().min(0).max(100000),
  fssaiNumber: opt(z.string().regex(/^\d{14}$/, 'FSSAI licence numbers have 14 digits')),
  knownFor: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
  parkingInfo: opt(z.string().trim().max(120)),
  allergenNotes: opt(z.string().trim().max(300)),
  dressCode: opt(z.string().trim().max(120)),
  agePolicy: opt(z.string().trim().max(120)),
  alcoholPolicy: opt(z.string().trim().max(120)),
  avgWaitMins: opt(z.number().int().min(0).max(180)),
  bestTimeToVisit: opt(z.string().trim().max(120)),
});
type Profile = z.infer<typeof profileSchema>;

// Name and location on a live listing need admin approval (spec 5).
const CORE_FIELDS = ['name', 'addressLine', 'lat', 'lng', 'cityId'] as const;

/** API profile (rupees) → DB columns (paise). */
function profileData(p: Partial<Profile>) {
  const { cuisineSlugs: _c, attributeKeys: _a, typeSlug: _t, costForTwo, socialLinks, ...rest } = p;
  return {
    ...rest,
    ...(socialLinks !== undefined ? { socialLinks } : {}),
    ...(costForTwo !== undefined ? { costForTwoPaise: toPaise(costForTwo), priceBand: priceBandFor(costForTwo) } : {}),
  };
}

async function touchMenu(restaurantId: string) {
  await prisma.restaurant.update({ where: { id: restaurantId }, data: { menuUpdatedAt: new Date() } });
}

const variantSchema = z.object({ name: z.string().trim().min(1).max(30), price: z.number().int().min(0).max(100000) });
const itemSchema = z.object({
  sectionId: z.string(),
  name: z.string().trim().min(1).max(100),
  description: opt(z.string().trim().max(300)),
  price: z.number().int().min(0).max(100000),
  diet: z.enum(['veg', 'non_veg', 'egg', 'vegan']).default('veg'),
  spiceLevel: z.number().int().min(0).max(3).default(0),
  tags: z.array(z.enum(['bestseller', 'chef_special', 'new'])).default([]),
  allergens: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  variants: z.array(variantSchema).max(6).default([]),
  photoUrl: opt(z.string()),
  isAvailable: z.boolean().default(true),
});

function itemOut(i: { pricePaise: number; variants?: { id: string; name: string; pricePaise: number }[] } & Record<string, unknown>) {
  const { pricePaise, variants, ...rest } = i;
  return { ...rest, price: toRupees(pricePaise), variants: (variants ?? []).map((v) => ({ id: v.id, name: v.name, price: toRupees(v.pricePaise) })) };
}

const offerSchema = z.object({
  title: z.string().trim().min(3).max(80),
  terms: opt(z.string().trim().max(300)),
  discountType: z.enum(['percent', 'flat', 'bogo', 'other']).default('percent'),
  value: opt(z.number().int().min(0)),
  validDays: z.array(z.number().int().min(0).max(6)).min(1).default([0, 1, 2, 3, 4, 5, 6]),
  validFromTime: opt(hhmm),
  validToTime: opt(hhmm),
  startsOn: opt(z.iso.datetime()),
  endsOn: opt(z.iso.datetime()),
  status: z.enum(['active', 'paused', 'ended']).default('active'),
});
type OfferInput = z.infer<typeof offerSchema>;

/** API offer → DB: flat discounts are stored in paise; dates as Date. */
function offerData(o: Partial<OfferInput>) {
  if ((o.validFromTime && !o.validToTime) || (!o.validFromTime && o.validToTime)) throw badRequest('Give both start and end time, or neither');
  if (o.validFromTime && o.validToTime && o.validFromTime >= o.validToTime) throw badRequest('Offer end time must be after start time');
  if (o.discountType === 'percent' && o.value != null && o.value > 100) throw badRequest('Percent must be 100 or less');
  return {
    ...o,
    value: o.value == null ? o.value : o.discountType === 'flat' ? toPaise(o.value) : o.value,
    startsOn: o.startsOn ? new Date(o.startsOn) : o.startsOn === null ? null : undefined,
    endsOn: o.endsOn ? new Date(o.endsOn) : o.endsOn === null ? null : undefined,
  };
}

const offerOut = <T extends { discountType: string; value: number | null }>(o: T) => ({
  ...o,
  value: o.value != null && o.discountType === 'flat' ? toRupees(o.value) : o.value,
});

/** Menu rows: section,name,price,diet,description,variants("Half:120|Full:200"),allergens("milk|nuts"),tags */
async function importMenu(restaurantId: string, rows: string[][]) {
  const errors: string[] = [];
  let created = 0;
  const sections = new Map(
    (await prisma.menuSection.findMany({ where: { restaurantId } })).map((s) => [s.name.toLowerCase(), s]),
  );
  const TAGS = ['bestseller', 'chef_special', 'new'];
  for (const [i, cols] of rows.entries()) {
    const [sectionName, name, price, diet = 'veg', description = '', variants = '', allergens = '', tags = ''] = cols;
    const priceNum = Number(String(price).replace(/[₹,\s]/g, ''));
    if (!sectionName || !name || !Number.isFinite(priceNum) || priceNum < 0) {
      errors.push(`Row ${i + 1}: needs section, name and a numeric price`);
      continue;
    }
    const parsedVariants = variants
      .split('|')
      .map((v) => v.split(':').map((x) => x.trim()))
      .filter(([n, p]) => n && p && Number.isFinite(Number(p)));
    let section = sections.get(sectionName.toLowerCase());
    if (!section) {
      section = await prisma.menuSection.create({ data: { restaurantId, name: sectionName.slice(0, 60), sortOrder: sections.size } });
      sections.set(sectionName.toLowerCase(), section);
    }
    const count = await prisma.menuItem.count({ where: { sectionId: section.id } });
    await prisma.menuItem.create({
      data: {
        restaurantId,
        sectionId: section.id,
        name: name.slice(0, 100),
        pricePaise: toPaise(priceNum),
        diet: ['veg', 'non_veg', 'egg', 'vegan'].includes(diet) ? diet : 'veg',
        description: description.slice(0, 300) || null,
        allergens: allergens.split('|').map((a) => a.trim()).filter(Boolean).slice(0, 10),
        tags: tags.split('|').map((t) => t.trim()).filter((t) => TAGS.includes(t)),
        sortOrder: count,
        variants: { create: parsedVariants.map(([n, p], k) => ({ name: n.slice(0, 30), pricePaise: toPaise(Number(p)), sortOrder: k })) },
      },
    });
    created++;
  }
  return { created, errors };
}

async function copyMenu(fromId: string, toId: string, mode: 'replace' | 'append') {
  if (mode === 'replace') await prisma.menuSection.deleteMany({ where: { restaurantId: toId } });
  const sections = await prisma.menuSection.findMany({
    where: { restaurantId: fromId },
    orderBy: { sortOrder: 'asc' },
    include: { items: { include: { variants: true } } },
  });
  const existing = await prisma.menuSection.count({ where: { restaurantId: toId } });
  for (const [si, s] of sections.entries()) {
    await prisma.menuSection.create({
      data: {
        restaurantId: toId,
        name: s.name,
        sortOrder: existing + si,
        items: {
          create: s.items.map(({ id: _id, sectionId: _s, restaurantId: _r, createdAt: _c, updatedAt: _u, variants, ...it }) => ({
            ...it,
            restaurantId: toId,
            variants: { create: variants.map((v) => ({ name: v.name, pricePaise: v.pricePaise, sortOrder: v.sortOrder })) },
          })),
        },
      },
    });
  }
  await touchMenu(toId);
}

export async function partnerRoutes(app: FastifyInstance) {
  const base = '/v1/partner/restaurants/:id';
  const rid = (req: { params: unknown }) => (req.params as { id: string }).id;

  app.get('/v1/partner/restaurants', async (req) => {
    const user = await requireUser(req);
    const memberships = await prisma.restaurantMember.findMany({
      where: { userId: user.id, status: 'active', restaurant: { deletedAt: null } },
      include: {
        restaurant: {
          include: {
            verification: { orderBy: { createdAt: 'desc' }, take: 1 },
            city: true,
            photos: { where: { isCover: true, deletedAt: null }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const claims = await prisma.verificationRequest.findMany({
      where: { submittedById: user.id, type: 'claim', status: { in: ['pending', 'rejected'] } },
      include: { restaurant: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return {
      data: memberships.map((m) => ({
        role: m.role,
        permissions: permissionsFor(m.role),
        id: m.restaurant.id,
        slug: m.restaurant.slug,
        citySlug: m.restaurant.city.slug,
        name: m.restaurant.name,
        city: m.restaurant.city.name,
        status: m.restaurant.status,
        isVerified: m.restaurant.isVerified,
        rating: m.restaurant.avgRating,
        reviewCount: m.restaurant.reviewCount,
        cover: m.restaurant.photos[0]?.url ?? null,
        latestVerification: m.restaurant.verification[0] ?? null,
      })),
      claims,
    };
  });

  app.post('/v1/partner/restaurants', async (req, reply) => {
    const user = await requireUser(req);
    const body = parse(profileSchema, req.body);
    const restaurant = await prisma.restaurant.create({
      data: {
        ...profileData(body),
        slug: await uniqueSlug(body.name),
        typeId: await typeIdFor(body.typeSlug),
        status: 'draft',
        source: 'partner',
        isClaimed: true,
        members: { create: { userId: user.id, role: 'owner' } },
      } as never,
    });
    await applyTaxonomy(restaurant.id, body.cuisineSlugs, body.attributeKeys);
    await audit(user.id, 'restaurant.create', 'restaurant', restaurant.id, undefined, body);
    reply.code(201);
    return { id: restaurant.id, slug: restaurant.slug };
  });

  // Listings a partner can claim: live, unclaimed (e.g. seeded by the field team).
  app.get('/v1/partner/claimable', async (req) => {
    await requireUser(req);
    const { q } = parse(z.object({ q: z.string().trim().min(2) }), req.query);
    const needle = q.toLowerCase();
    const rows = await prisma.$queryRaw<{ id: string; name: string; address: string; city: string; locality: string | null }[]>`
      SELECT r.id, r.name, r."addressLine" AS address, c.name AS city, l.name AS locality
      FROM "Restaurant" r JOIN "City" c ON c.id = r."cityId" LEFT JOIN "Locality" l ON l.id = r."localityId"
      WHERE r.status = 'live' AND NOT r."isClaimed" AND r."deletedAt" IS NULL
        AND (lower(r.name) LIKE ${`%${needle}%`} OR lower(r."addressLine") LIKE ${`%${needle}%`}
             OR lower(coalesce(r."nameHi", '')) LIKE ${`%${needle}%`} OR word_similarity(${needle}, lower(r.name)) > 0.5)
      ORDER BY word_similarity(${needle}, lower(r.name)) DESC LIMIT 10`;
    return { data: rows };
  });

  app.post('/v1/partner/restaurants/:id/claim', async (req, reply) => {
    const user = await requireUser(req);
    const body = parse(
      z.object({ note: z.string().max(500).optional(), documents: z.array(z.string()).min(1, 'Upload at least one document').max(5) }),
      req.body,
    );
    const r = await prisma.restaurant.findFirst({ where: { id: rid(req), deletedAt: null } });
    if (!r || r.status !== 'live') throw notFound('Restaurant');
    if (r.isClaimed) throw conflict('This listing is already managed by its owner');
    const pending = await prisma.verificationRequest.findFirst({
      where: { restaurantId: r.id, submittedById: user.id, type: 'claim', status: 'pending' },
    });
    if (pending) throw conflict('Your claim is already under review');
    const request = await prisma.verificationRequest.create({
      data: { restaurantId: r.id, submittedById: user.id, type: 'claim', note: body.note, documents: body.documents },
    });
    reply.code(201);
    return request;
  });

  app.get(base, async (req) => {
    // Every role has menu access, so this admits any member to read the profile.
    const { restaurant, memberRole } = await requireMember(req, rid(req), 'menu');
    const full = await prisma.restaurant.findUniqueOrThrow({
      where: { id: restaurant.id },
      include: {
        cuisines: { include: { cuisine: true }, orderBy: { isPrimary: 'desc' } },
        attributes: { include: { attribute: true } },
        hours: { orderBy: [{ dayOfWeek: 'asc' }, { opensAt: 'asc' }] },
        specialHours: { where: { date: { gte: new Date(`${localDate(new Date())}T00:00:00Z`) } }, orderBy: { date: 'asc' } },
        type: true,
        city: true,
        locality: true,
        verification: { orderBy: { createdAt: 'desc' } },
      },
    });
    const { costForTwoPaise, cuisines, attributes, type, specialHours, verification, ...rest } = full;
    return {
      ...rest,
      costForTwo: toRupees(costForTwoPaise),
      specialHours: specialHours.map((s) => ({ ...s, date: s.date.toISOString().slice(0, 10) })),
      verification: verification.map(({ documents: _d, ...v }) => v),
      typeSlug: type?.slug ?? null,
      cuisineSlugs: cuisines.map((c) => c.cuisine.slug),
      attributeKeys: attributes.map((a) => a.attribute.key),
      myRole: memberRole,
      permissions: permissionsFor(memberRole),
    };
  });

  app.patch(base, async (req) => {
    const { user, restaurant, memberRole } = await requireMember(req, rid(req), 'profile');
    const body = parse(profileSchema.partial(), req.body);
    const fields = { ...body };

    const coreChanges: Record<string, unknown> = {};
    if (restaurant.status === 'live') {
      for (const key of CORE_FIELDS) {
        if (fields[key] !== undefined && fields[key] !== restaurant[key]) {
          coreChanges[key] = fields[key];
          delete fields[key];
        }
      }
    }
    if (Object.keys(coreChanges).length) {
      if (memberRole !== 'owner') throw badRequest('Only the owner can change the name or address');
      await prisma.verificationRequest.create({
        data: { restaurantId: restaurant.id, submittedById: user.id, type: 'core_change', payload: json(coreChanges) as object },
      });
    }

    const updated = await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        ...profileData(fields),
        ...(body.typeSlug !== undefined ? { typeId: await typeIdFor(body.typeSlug) } : {}),
      } as never,
    });
    await applyTaxonomy(restaurant.id, body.cuisineSlugs, body.attributeKeys);
    await audit(user.id, 'restaurant.update', 'restaurant', restaurant.id, restaurant, body);
    return { restaurant: { id: updated.id }, pendingCoreChange: Object.keys(coreChanges).length ? coreChanges : null };
  });

  app.post(`${base}/submit`, async (req) => {
    const { user, restaurant } = await requireMember(req, rid(req), 'core');
    const body = parse(
      z.object({
        documents: z.array(z.string()).min(1, 'Upload your FSSAI licence or registration').max(5),
        note: z.string().max(500).optional(),
      }),
      req.body,
    );
    if (!['draft', 'rejected'].includes(restaurant.status)) throw conflict('This listing is already submitted');
    const [hours, storefront] = await Promise.all([
      prisma.openingHour.count({ where: { restaurantId: restaurant.id } }),
      prisma.photo.count({ where: { restaurantId: restaurant.id, category: 'exterior', deletedAt: null } }),
    ]);
    if (!hours) throw badRequest('Add opening hours before submitting');
    // Spec 5.1: one storefront photo is part of verification.
    if (!storefront) throw badRequest('Upload a storefront photo (category: Storefront) before submitting');
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { status: 'pending' } });
    await prisma.verificationRequest.create({
      data: { restaurantId: restaurant.id, submittedById: user.id, type: 'new', note: body.note, documents: body.documents },
    });
    return { status: 'pending' };
  });

  // Owner-only: documents on file (spec 5.2 Settings).
  app.get(`${base}/documents`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'core');
    const rows = await prisma.verificationRequest.findMany({
      where: { restaurantId: restaurant.id, documents: { isEmpty: false } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, status: true, createdAt: true, documents: true },
    });
    return { data: rows.map((r) => ({ ...r, documents: r.documents.map((d) => d.split('/').pop()) })) };
  });

  app.put(`${base}/hours`, async (req) => {
    const { user, restaurant } = await requireMember(req, rid(req), 'profile');
    const { shifts } = parse(
      z.object({ shifts: z.array(z.object({ dayOfWeek: z.number().int().min(0).max(6), opensAt: hhmm, closesAt: hhmm })).max(28) }),
      req.body,
    );
    const numbered = shifts
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt))
      .map((s, i, arr) => ({ ...s, shiftNo: arr.slice(0, i).filter((x) => x.dayOfWeek === s.dayOfWeek).length + 1 }));
    const before = await prisma.openingHour.findMany({ where: { restaurantId: restaurant.id } });
    await prisma.$transaction([
      prisma.openingHour.deleteMany({ where: { restaurantId: restaurant.id } }),
      prisma.openingHour.createMany({ data: numbered.map((s) => ({ ...s, restaurantId: restaurant.id })) }),
      prisma.restaurant.update({ where: { id: restaurant.id }, data: { hoursConfirmedAt: new Date() } }),
    ]);
    await audit(user.id, 'hours.replace', 'restaurant', restaurant.id, before, shifts);
    return { shifts };
  });

  // Holidays and one-off hours (spec 5.2). Replaces all future entries.
  app.put(`${base}/special-hours`, async (req) => {
    const { user, restaurant } = await requireMember(req, rid(req), 'profile');
    const { days } = parse(
      z.object({
        days: z
          .array(
            z.object({
              date: z.iso.date(),
              isClosed: z.boolean(),
              opensAt: opt(hhmm),
              closesAt: opt(hhmm),
              note: opt(z.string().trim().max(80)),
            }),
          )
          .max(60),
      }),
      req.body,
    );
    const today = localDate(new Date());
    for (const d of days) {
      if (d.date < today) throw badRequest(`${d.date} is in the past`);
      if (!d.isClosed && (!d.opensAt || !d.closesAt)) throw badRequest(`Give opening and closing time for ${d.date}, or mark it closed`);
    }
    await prisma.$transaction([
      prisma.specialHour.deleteMany({ where: { restaurantId: restaurant.id, date: { gte: new Date(`${today}T00:00:00Z`) } } }),
      prisma.specialHour.createMany({
        data: days.map((d) => ({
          restaurantId: restaurant.id,
          date: new Date(`${d.date}T00:00:00Z`),
          isClosed: d.isClosed,
          opensAt: d.isClosed ? null : d.opensAt,
          closesAt: d.isClosed ? null : d.closesAt,
          note: d.note,
        })),
      }),
    ]);
    await audit(user.id, 'special_hours.replace', 'restaurant', restaurant.id, undefined, days);
    return { days };
  });

  app.post(`${base}/hours/confirm`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'profile');
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { hoursConfirmedAt: new Date() } });
    return { confirmed: true };
  });

  app.put(`${base}/temporarily-closed`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'profile');
    const { until } = parse(z.object({ until: z.iso.datetime().nullable() }), req.body);
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { temporarilyClosedUntil: until ? new Date(until) : null } });
    return { until };
  });

  // ---- Menu ----
  app.get(`${base}/menu`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    const sections = await prisma.menuSection.findMany({
      where: { restaurantId: restaurant.id },
      orderBy: { sortOrder: 'asc' },
      include: { items: { orderBy: { sortOrder: 'asc' }, include: { variants: { orderBy: { sortOrder: 'asc' } } } } },
    });
    return { sections: sections.map((s) => ({ ...s, items: s.items.map(itemOut) })) };
  });

  app.post(`${base}/menu/sections`, async (req, reply) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(60) }), req.body);
    const count = await prisma.menuSection.count({ where: { restaurantId: restaurant.id } });
    reply.code(201);
    return prisma.menuSection.create({ data: { restaurantId: restaurant.id, name, sortOrder: count } });
  });

  app.patch(`${base}/menu/sections/:sid`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    const { sid } = req.params as { sid: string };
    const data = parse(z.object({ name: z.string().trim().min(1).max(60).optional(), sortOrder: z.number().int().optional() }), req.body);
    const { count } = await prisma.menuSection.updateMany({ where: { id: sid, restaurantId: restaurant.id }, data });
    if (!count) throw notFound('Section');
    return { ok: true };
  });

  app.delete(`${base}/menu/sections/:sid`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    await prisma.menuSection.deleteMany({ where: { id: (req.params as { sid: string }).sid, restaurantId: restaurant.id } });
    await touchMenu(restaurant.id);
    return { ok: true };
  });

  // Drag-to-reorder (spec 5.2): the client sends the full new order.
  app.put(`${base}/menu/order`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    const body = parse(z.object({ sections: z.array(z.object({ id: z.string(), itemIds: z.array(z.string()) })) }), req.body);
    const ownSections = new Set((await prisma.menuSection.findMany({ where: { restaurantId: restaurant.id }, select: { id: true } })).map((s) => s.id));
    const ops = [];
    for (const [si, s] of body.sections.entries()) {
      if (!ownSections.has(s.id)) throw badRequest('Unknown section');
      ops.push(prisma.menuSection.update({ where: { id: s.id }, data: { sortOrder: si } }));
      // Items can move between sections too.
      s.itemIds.forEach((iid, ii) => ops.push(prisma.menuItem.updateMany({ where: { id: iid, restaurantId: restaurant.id }, data: { sectionId: s.id, sortOrder: ii } })));
    }
    await prisma.$transaction(ops);
    await touchMenu(restaurant.id);
    return { ok: true };
  });

  app.post(`${base}/menu/items`, async (req, reply) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    const { price, variants, ...body } = parse(itemSchema, req.body);
    const section = await prisma.menuSection.findFirst({ where: { id: body.sectionId, restaurantId: restaurant.id } });
    if (!section) throw notFound('Section');
    const count = await prisma.menuItem.count({ where: { sectionId: section.id } });
    const item = await prisma.menuItem.create({
      data: {
        ...body,
        pricePaise: toPaise(price),
        restaurantId: restaurant.id,
        sortOrder: count,
        variants: { create: variants.map((v, i) => ({ name: v.name, pricePaise: toPaise(v.price), sortOrder: i })) },
      },
      include: { variants: true },
    });
    await touchMenu(restaurant.id);
    reply.code(201);
    return itemOut(item);
  });

  app.patch(`${base}/menu/items/:iid`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    const { iid } = req.params as { iid: string };
    const { price, variants, ...rest } = parse(itemSchema.partial().extend({ sortOrder: z.number().int().optional() }), req.body);
    if (rest.sectionId && !(await prisma.menuSection.findFirst({ where: { id: rest.sectionId, restaurantId: restaurant.id } }))) throw notFound('Section');
    const { count } = await prisma.menuItem.updateMany({
      where: { id: iid, restaurantId: restaurant.id },
      data: { ...rest, ...(price !== undefined ? { pricePaise: toPaise(price) } : {}) },
    });
    if (!count) throw notFound('Menu item');
    if (variants) {
      await prisma.$transaction([
        prisma.menuItemVariant.deleteMany({ where: { itemId: iid } }),
        prisma.menuItemVariant.createMany({ data: variants.map((v, i) => ({ itemId: iid, name: v.name, pricePaise: toPaise(v.price), sortOrder: i })) }),
      ]);
    }
    await touchMenu(restaurant.id);
    return { ok: true };
  });

  app.delete(`${base}/menu/items/:iid`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    await prisma.menuItem.deleteMany({ where: { id: (req.params as { iid: string }).iid, restaurantId: restaurant.id } });
    await touchMenu(restaurant.id);
    return { ok: true };
  });

  // CSV (text) or Excel (base64 .xlsx). Runs inline — a menu is at most a few hundred rows.
  app.post(`${base}/menu/import`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'menu');
    const body = parse(z.object({ csv: z.string().max(500_000).optional(), xlsxBase64: z.string().max(7_000_000).optional() }), req.body);
    let rows: string[][];
    if (body.xlsxBase64) {
      try {
        rows = await parseXlsx(Buffer.from(body.xlsxBase64, 'base64'));
      } catch {
        throw badRequest('Could not read that Excel file. Save it as .xlsx and try again.');
      }
    } else if (body.csv) rows = parseCsv(body.csv);
    else throw badRequest('Attach a CSV or Excel file');
    const result = await importMenu(restaurant.id, withoutHeader(rows, 'section'));
    await touchMenu(restaurant.id);
    return result;
  });

  // ---- Photos ----
  app.get(`${base}/photos`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'photos');
    return {
      data: await prisma.photo.findMany({
        where: { restaurantId: restaurant.id, deletedAt: null, status: { not: 'rejected' } },
        orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    };
  });

  app.post(`${base}/photos`, async (req, reply) => {
    const { user, restaurant } = await requireMember(req, rid(req), 'photos');
    const body = parse(
      z.object({ url: z.string().min(1), category: z.enum(['food', 'ambience', 'menu', 'exterior']), width: z.number().optional(), height: z.number().optional() }),
      req.body,
    );
    const count = await prisma.photo.count({ where: { restaurantId: restaurant.id, deletedAt: null } });
    reply.code(201);
    return prisma.photo.create({
      data: { ...body, restaurantId: restaurant.id, uploadedById: user.id, source: 'partner', sortOrder: count, isCover: count === 0 },
    });
  });

  app.put(`${base}/photos/order`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'photos');
    const { ids } = parse(z.object({ ids: z.array(z.string()).max(500) }), req.body);
    await prisma.$transaction(ids.map((id, i) => prisma.photo.updateMany({ where: { id, restaurantId: restaurant.id }, data: { sortOrder: i } })));
    return { ok: true };
  });

  app.patch(`${base}/photos/:pid`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'photos');
    const { pid } = req.params as { pid: string };
    const body = parse(z.object({ category: z.enum(['food', 'ambience', 'menu', 'exterior']).optional(), isCover: z.literal(true).optional() }), req.body);
    if (body.isCover) await prisma.photo.updateMany({ where: { restaurantId: restaurant.id }, data: { isCover: false } });
    const { count } = await prisma.photo.updateMany({ where: { id: pid, restaurantId: restaurant.id, deletedAt: null }, data: body });
    if (!count) throw notFound('Photo');
    return { ok: true };
  });

  // Soft delete (spec 9.2), so moderation can be reversed. Diner photos can only be flagged.
  app.delete(`${base}/photos/:pid`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'photos');
    await prisma.photo.updateMany({
      where: { id: (req.params as { pid: string }).pid, restaurantId: restaurant.id, source: { not: 'diner' } },
      data: { deletedAt: new Date(), isCover: false },
    });
    return { ok: true };
  });

  app.post(`${base}/photos/:pid/flag`, async (req, reply) => {
    const { user, restaurant } = await requireMember(req, rid(req), 'photos');
    const { pid } = req.params as { pid: string };
    const { details } = parse(z.object({ details: z.string().max(500).optional() }), req.body ?? {});
    const photo = await prisma.photo.findFirst({ where: { id: pid, restaurantId: restaurant.id, source: 'diner' } });
    if (!photo) throw notFound('Diner photo');
    await prisma.report.create({ data: { reporterId: user.id, targetType: 'photo', targetId: pid, reason: 'offensive', details: details ?? 'Flagged by the restaurant' } });
    reply.code(201);
    return { ok: true };
  });

  // ---- Reviews ----
  app.get(`${base}/reviews`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'reviews');
    const q = parse(
      z.object({
        rating: z.coerce.number().int().min(1).max(5).optional(),
        unreplied: z.string().optional(),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      }),
      req.query,
    );
    return {
      data: await prisma.review.findMany({
        where: {
          restaurantId: restaurant.id,
          status: 'published',
          deletedAt: null,
          ...(q.rating ? { rating: q.rating } : {}),
          ...(q.unreplied === '1' ? { reply: null } : {}),
          ...(q.from || q.to
            ? { createdAt: { ...(q.from ? { gte: new Date(`${q.from}T00:00:00+05:30`) } : {}), ...(q.to ? { lte: new Date(`${q.to}T23:59:59+05:30`) } : {}) } }
            : {}),
        },
        include: {
          user: { select: { name: true } },
          reply: true,
          photos: { where: { photo: { status: 'approved' } }, include: { photo: { select: { id: true, url: true } } } },
          dishes: { include: { menuItem: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    };
  });

  app.put('/v1/partner/reviews/:reviewId/reply', async (req) => {
    const { reviewId } = req.params as { reviewId: string };
    const review = await prisma.review.findFirst({ where: { id: reviewId, deletedAt: null } });
    if (!review) throw notFound('Review');
    const { user } = await requireMember(req, review.restaurantId, 'reviews');
    const { text } = parse(z.object({ text: z.string().trim().min(2).max(1000) }), req.body);
    return prisma.reviewReply.upsert({
      where: { reviewId },
      create: { reviewId, userId: user.id, text },
      update: { text, userId: user.id },
    });
  });

  // Partners report abusive or fake reviews; they can't edit or delete them (spec 5.2).
  app.post('/v1/partner/reviews/:reviewId/report', async (req, reply) => {
    const { reviewId } = req.params as { reviewId: string };
    const review = await prisma.review.findFirst({ where: { id: reviewId, deletedAt: null } });
    if (!review) throw notFound('Review');
    const { user } = await requireMember(req, review.restaurantId, 'reviews');
    const body = parse(z.object({ reason: z.enum(['spam', 'offensive', 'fake', 'other']), details: z.string().max(1000).optional() }), req.body);
    if (await prisma.report.findFirst({ where: { targetId: reviewId, reporterId: user.id, status: 'open' } })) throw conflict('Already reported');
    await prisma.report.create({ data: { ...body, reporterId: user.id, targetType: 'review', targetId: reviewId } });
    reply.code(201);
    return { ok: true };
  });

  // ---- Offers ----
  app.get(`${base}/offers`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'offers');
    const offers = await prisma.offer.findMany({ where: { restaurantId: restaurant.id }, orderBy: { createdAt: 'desc' } });
    return { data: offers.map(offerOut) };
  });

  app.post(`${base}/offers`, async (req, reply) => {
    const { restaurant } = await requireMember(req, rid(req), 'offers');
    const body = parse(offerSchema, req.body);
    reply.code(201);
    return offerOut(await prisma.offer.create({ data: { ...offerData(body), title: body.title, restaurantId: restaurant.id } as never }));
  });

  app.patch(`${base}/offers/:oid`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'offers');
    const { oid } = req.params as { oid: string };
    const body = parse(offerSchema.partial(), req.body);
    if (body.value !== undefined && body.discountType === undefined) {
      const current = await prisma.offer.findFirst({ where: { id: oid, restaurantId: restaurant.id } });
      if (current) body.discountType = current.discountType as OfferInput['discountType'];
    }
    const { count } = await prisma.offer.updateMany({ where: { id: oid, restaurantId: restaurant.id }, data: offerData(body) as never });
    if (!count) throw notFound('Offer');
    return { ok: true };
  });

  app.delete(`${base}/offers/:oid`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'offers');
    await prisma.offer.deleteMany({ where: { id: (req.params as { oid: string }).oid, restaurantId: restaurant.id } });
    return { ok: true };
  });

  // ---- Multi-outlet (spec 5.2): apply an offer or a menu to several outlets at once ----
  async function requireAll(req: Parameters<typeof requireMember>[0], ids: string[], area: PartnerArea) {
    for (const id of ids) await requireMember(req, id, area);
  }

  app.post('/v1/partner/bulk/offers', async (req, reply) => {
    const body = parse(z.object({ restaurantIds: z.array(z.string()).min(1).max(50), offer: offerSchema }), req.body);
    await requireAll(req, body.restaurantIds, 'offers');
    await prisma.offer.createMany({ data: body.restaurantIds.map((restaurantId) => ({ ...offerData(body.offer), title: body.offer.title, restaurantId })) as never });
    reply.code(201);
    return { created: body.restaurantIds.length };
  });

  app.post('/v1/partner/bulk/menu/copy', async (req) => {
    const body = parse(
      z.object({ fromRestaurantId: z.string(), toRestaurantIds: z.array(z.string()).min(1).max(50), mode: z.enum(['replace', 'append']).default('append') }),
      req.body,
    );
    await requireAll(req, [body.fromRestaurantId, ...body.toRestaurantIds], 'menu');
    for (const to of body.toRestaurantIds.filter((id) => id !== body.fromRestaurantId)) await copyMenu(body.fromRestaurantId, to, body.mode);
    return { copied: body.toRestaurantIds.length };
  });

  // ---- Team ----
  app.get(`${base}/members`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'team');
    return {
      data: await prisma.restaurantMember.findMany({
        where: { restaurantId: restaurant.id },
        include: { user: { select: { id: true, name: true, phone: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    };
  });

  // Invite by phone (creates the account if needed) or by the email of an existing account (spec 5.2).
  app.post(`${base}/members`, async (req, reply) => {
    const { user, restaurant } = await requireMember(req, rid(req), 'team');
    const body = parse(
      z.object({ phone: phone.optional(), email: z.email().optional(), role: z.enum(['manager', 'staff']), name: z.string().max(80).optional() }).refine((b) => b.phone || b.email, 'Enter a phone number or email'),
      req.body,
    );
    let invitee;
    if (body.phone) {
      invitee = await prisma.user.upsert({ where: { phone: body.phone }, create: { phone: body.phone, name: body.name, email: body.email }, update: {} });
    } else {
      invitee = await prisma.user.findFirst({ where: { email: body.email!.toLowerCase() } });
      if (!invitee) throw badRequest('No account uses this email yet. Invite them by phone number instead.');
    }
    const existing = await prisma.restaurantMember.findUnique({ where: { restaurantId_userId: { restaurantId: restaurant.id, userId: invitee.id } } });
    if (existing) throw conflict('This person is already on the team');
    await prisma.restaurantMember.create({ data: { restaurantId: restaurant.id, userId: invitee.id, role: body.role, invitedById: user.id } });
    const link = `${process.env.WEB_PUBLIC_URL ?? 'http://localhost:3000'}/partner/${restaurant.id}`;
    await notify({ userId: invitee.id, to: invitee.phone, channel: 'sms', template: 'team_invite', payload: { restaurant: restaurant.name, role: body.role, link } });
    if (invitee.email) await notify({ userId: invitee.id, to: invitee.email, channel: 'email', template: 'team_invite', payload: { restaurant: restaurant.name, role: body.role, link } });
    await audit(user.id, 'member.add', 'restaurant', restaurant.id, undefined, { userId: invitee.id, role: body.role });
    reply.code(201);
    return { ok: true };
  });

  app.patch(`${base}/members/:userId`, async (req) => {
    const { user, restaurant } = await requireMember(req, rid(req), 'team');
    const { userId } = req.params as { userId: string };
    const { role } = parse(z.object({ role: z.enum(['manager', 'staff']) }), req.body);
    const target = await prisma.restaurantMember.findUnique({ where: { restaurantId_userId: { restaurantId: restaurant.id, userId } } });
    if (!target) throw notFound('Member');
    if (target.role === 'owner') throw forbidden('Owners keep the owner role');
    await prisma.restaurantMember.update({ where: { restaurantId_userId: { restaurantId: restaurant.id, userId } }, data: { role } });
    await audit(user.id, 'member.role', 'restaurant', restaurant.id, { role: target.role }, { userId, role });
    return { ok: true };
  });

  app.delete(`${base}/members/:userId`, async (req) => {
    const { user, restaurant } = await requireMember(req, rid(req), 'team');
    const { userId } = req.params as { userId: string };
    if (userId === user.id) throw badRequest('You cannot remove yourself');
    const target = await prisma.restaurantMember.findUnique({ where: { restaurantId_userId: { restaurantId: restaurant.id, userId } } });
    if (target?.role === 'owner') throw badRequest('Owners cannot be removed here');
    await prisma.restaurantMember.deleteMany({ where: { restaurantId: restaurant.id, userId } });
    await audit(user.id, 'member.remove', 'restaurant', restaurant.id, target, undefined);
    return { ok: true };
  });

  // ---- Analytics (spec 5.2 Dashboard) ----
  app.get(`${base}/analytics`, async (req) => {
    const { restaurant } = await requireMember(req, rid(req), 'analytics');
    const q = parse(z.object({ days: z.coerce.number().int().min(7).max(365).default(30), from: z.iso.date().optional(), to: z.iso.date().optional() }), req.query);
    const to = q.to ?? localDate(new Date());
    const from = q.from ?? localDate(new Date(new Date(`${to}T12:00:00+05:30`).getTime() - (q.days - 1) * 864e5));
    if (from > to) throw badRequest('`from` must be before `to`');
    const days = Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 864e5) + 1;
    if (days > 366) throw badRequest('Pick a range of a year or less');
    const rows = await prisma.analyticsDaily.findMany({ where: { restaurantId: restaurant.id, date: { gte: from, lte: to } } });
    const series = Array.from({ length: days }, (_, i) => {
      const date = new Date(new Date(`${from}T00:00:00Z`).getTime() + i * 864e5).toISOString().slice(0, 10);
      const row = rows.find((r) => r.date === date);
      return {
        date,
        views: row?.views ?? 0,
        searchImpressions: row?.searchImpressions ?? 0,
        calls: row?.calls ?? 0,
        directions: row?.directions ?? 0,
        saves: row?.saves ?? 0,
        shares: row?.shares ?? 0,
      };
    });
    const totals = series.reduce(
      (t, d) => ({
        views: t.views + d.views,
        searchImpressions: t.searchImpressions + d.searchImpressions,
        calls: t.calls + d.calls,
        directions: t.directions + d.directions,
        saves: t.saves + d.saves,
        shares: t.shares + d.shares,
      }),
      { views: 0, searchImpressions: 0, calls: 0, directions: 0, saves: 0, shares: 0 },
    );
    const start = new Date(`${from}T00:00:00+05:30`);
    const end = new Date(`${to}T23:59:59+05:30`);
    // Rating trend: average of reviews posted each week in the range.
    const trend = await prisma.$queryRaw<{ week: Date; avg: number; n: bigint }[]>`
      SELECT date_trunc('week', "createdAt" AT TIME ZONE 'Asia/Kolkata') AS week, avg(rating)::float8 AS avg, count(*) AS n
      FROM "Review" WHERE "restaurantId" = ${restaurant.id} AND status = 'published' AND "deletedAt" IS NULL
        AND "createdAt" BETWEEN ${start} AND ${end}
      GROUP BY 1 ORDER BY 1`;
    const newReviews = await prisma.review.count({ where: { restaurantId: restaurant.id, status: 'published', createdAt: { gte: start, lte: end } } });
    const visible = !!(await prisma.restaurant.findFirst({ where: await visibleWhere({ id: restaurant.id }) }));
    return {
      from,
      to,
      days,
      totals,
      series,
      ratingTrend: trend.map((t) => ({ week: t.week.toISOString().slice(0, 10), average: Math.round(t.avg * 10) / 10, reviews: Number(t.n) })),
      rating: restaurant.avgRating,
      reviewCount: restaurant.reviewCount,
      newReviews,
      isVisibleToDiners: visible,
    };
  });
}
