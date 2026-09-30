import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { REVIEWER_ROLES, requireRole } from '../lib/auth.js';
import { applyTaxonomy, priceBandFor, typeIdFor, uniqueSlug } from '../lib/catalog.js';
import { parseCsv, withoutHeader } from '../lib/csv.js';
import { audit, json, prisma } from '../lib/db.js';
import { capturePayload, type CapturePayload } from '../lib/field.js';
import { distanceMeters } from '../lib/geo.js';
import { badRequest, conflict, notFound, parse, slugify } from '../lib/http.js';
import { localDate } from '../lib/hours.js';
import { toPaise, toRupees } from '../lib/money.js';
import { notify, notifyTeam } from '../lib/notify.js';
import { recalcRating } from '../lib/restaurants.js';
import { invalidateSynonyms } from '../lib/search.js';
import { DEFAULT_BRAND, DEFAULT_FLAGS, FLAG_KEYS, getBrand, getFlags, setBrand, setFlag, type FlagKey } from '../lib/settings.js';

const admin = (req: Parameters<typeof requireRole>[0]) => requireRole(req, ['admin']);
const reviewer = (req: Parameters<typeof requireRole>[0]) => requireRole(req, REVIEWER_ROLES);
const WEB = () => process.env.WEB_PUBLIC_URL ?? 'http://localhost:3000';

export async function adminRoutes(app: FastifyInstance) {
  app.get('/v1/admin/overview', async (req) => {
    await reviewer(req);
    const [verifications, captures, reports, leads, heldReviews, pendingPhotos, live, unclaimed, users] = await Promise.all([
      prisma.verificationRequest.count({ where: { status: 'pending' } }),
      prisma.fieldSubmission.count({ where: { status: 'submitted' } }),
      prisma.report.count({ where: { status: 'open' } }),
      prisma.lead.count({ where: { status: { in: ['new', 'assigned'] } } }),
      prisma.review.count({ where: { status: 'pending', deletedAt: null } }),
      prisma.photo.count({ where: { status: 'pending', deletedAt: null } }),
      prisma.restaurant.count({ where: { status: 'live', deletedAt: null } }),
      prisma.restaurant.count({ where: { status: 'live', isClaimed: false, deletedAt: null } }),
      prisma.user.count({ where: { status: { not: 'deleted' } } }),
    ]);
    // Oldest pending verification, to watch the 48-hour review target (spec 5.1).
    const oldest = await prisma.verificationRequest.findFirst({ where: { status: 'pending' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    return {
      pending: { verifications, captures, reports, leads, heldReviews, pendingPhotos },
      oldestVerificationHours: oldest ? Math.round((Date.now() - oldest.createdAt.getTime()) / 3600_000) : null,
      restaurants: { live, unclaimed },
      users,
    };
  });

  // ---- Verification queue (spec 6) ----
  app.get('/v1/admin/verifications', async (req) => {
    await admin(req);
    const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending') }), req.query);
    const rows = await prisma.verificationRequest.findMany({
      where: { status },
      include: { restaurant: { include: { city: true, type: true, cuisines: { include: { cuisine: true } } } } },
      orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
      take: 100,
    });
    const submitters = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.submittedById) } },
      select: { id: true, name: true, phone: true },
    });
    return {
      data: rows.map(({ restaurant, payload, ...r }) => ({
        ...r,
        changes: r.type === 'core_change' ? payload : null,
        restaurant: { ...restaurant, costForTwo: toRupees(restaurant.costForTwoPaise) },
        submitter: submitters.find((u) => u.id === r.submittedById) ?? null,
      })),
    };
  });

  app.post('/v1/admin/verifications/:id/:decision', async (req) => {
    const user = await admin(req);
    const { id, decision } = req.params as { id: string; decision: string };
    if (!['approve', 'reject'].includes(decision)) throw notFound('Action');
    const { note } = parse(z.object({ note: z.string().max(500).optional() }), req.body ?? {});
    const request = await prisma.verificationRequest.findUnique({ where: { id }, include: { restaurant: true } });
    if (!request) throw notFound('Verification request');
    if (request.status !== 'pending') throw conflict('Already decided');
    if (decision === 'reject' && !note) throw badRequest('Give the partner a reason');
    const r = request.restaurant;

    if (decision === 'approve') {
      if (request.type === 'new') {
        await prisma.restaurant.update({ where: { id: r.id }, data: { status: 'live', isVerified: true, isClaimed: true } });
      } else if (request.type === 'claim') {
        if (r.isClaimed) throw conflict('Listing was claimed by someone else meanwhile');
        await prisma.$transaction([
          prisma.restaurantMember.upsert({
            where: { restaurantId_userId: { restaurantId: r.id, userId: request.submittedById } },
            create: { restaurantId: r.id, userId: request.submittedById, role: 'owner' },
            update: { role: 'owner', status: 'active' },
          }),
          prisma.restaurant.update({ where: { id: r.id }, data: { isClaimed: true, isVerified: true } }),
          prisma.verificationRequest.updateMany({
            where: { restaurantId: r.id, type: 'claim', status: 'pending', id: { not: id } },
            data: { status: 'rejected', decisionNote: 'Another claim was approved' },
          }),
        ]);
      } else if (request.type === 'core_change') {
        const changes = (request.payload ?? {}) as Record<string, unknown>;
        const allowed = ['name', 'addressLine', 'lat', 'lng', 'cityId'];
        await prisma.restaurant.update({ where: { id: r.id }, data: Object.fromEntries(Object.entries(changes).filter(([k]) => allowed.includes(k))) });
      }
    } else if (request.type === 'new') {
      await prisma.restaurant.update({ where: { id: r.id }, data: { status: 'rejected' } });
    }

    const updated = await prisma.verificationRequest.update({
      where: { id },
      data: { status: decision === 'approve' ? 'approved' : 'rejected', reviewerId: user.id, decisionNote: note },
    });
    // Tell the partner (spec 5.4).
    const template = ({ new: ['listing_approved', 'listing_rejected'], claim: ['claim_approved', 'claim_rejected'], core_change: ['change_approved', 'change_rejected'] } as const)[
      request.type as 'new' | 'claim' | 'core_change'
    ][decision === 'approve' ? 0 : 1];
    const submitter = await prisma.user.findUnique({ where: { id: request.submittedById } });
    if (submitter) {
      const payload = { restaurant: r.name, reason: note ?? '', restaurantId: r.id };
      await notify({ userId: submitter.id, channel: 'in_app', template, payload });
      await notify({ userId: submitter.id, to: submitter.phone, channel: 'sms', template, payload });
    }
    await audit(user.id, `verification.${decision}`, 'restaurant', r.id, { status: r.status }, { type: request.type, note });
    return updated;
  });

  // ---- Field capture review (spec 7.4) ----
  app.get('/v1/admin/field/submissions', async (req) => {
    await reviewer(req);
    const { status } = parse(z.object({ status: z.enum(['submitted', 'approved', 'sent_back']).default('submitted') }), req.query);
    const rows = await prisma.fieldSubmission.findMany({
      where: { status },
      include: { agent: { select: { id: true, name: true, phone: true } } },
      orderBy: { syncedAt: status === 'submitted' ? 'asc' : 'desc' },
      take: 100,
    });
    return { data: rows };
  });

  app.post('/v1/admin/field/submissions/:id/approve', async (req) => {
    const user = await reviewer(req);
    const { id } = req.params as { id: string };
    const { edits } = parse(z.object({ edits: z.record(z.string(), z.unknown()).optional() }), req.body ?? {});
    const submission = await prisma.fieldSubmission.findUnique({ where: { id } });
    if (!submission) throw notFound('Submission');
    if (submission.status === 'approved') throw conflict('Already approved');

    const p = parse(capturePayload, { ...(submission.payload as object), ...edits });
    const restaurant = await prisma.restaurant.create({
      data: {
        slug: await uniqueSlug(p.name),
        name: p.name,
        nameHi: p.nameHi,
        cityId: p.cityId,
        localityId: p.localityId,
        addressLine: p.addressLine,
        landmark: p.landmark,
        pincode: p.pincode,
        lat: p.lat,
        lng: p.lng,
        phone: p.phone,
        whatsapp: p.whatsapp,
        typeId: await typeIdFor(p.typeSlug),
        costForTwoPaise: toPaise(p.costForTwo),
        priceBand: priceBandFor(p.costForTwo),
        knownFor: p.knownFor,
        // Visible straight away where unclaimed listings are on; elsewhere visibility hides it until claimed (spec 7.4).
        status: 'live',
        isClaimed: false,
        isVerified: false,
        source: 'field',
        sourceRef: submission.id,
        capturedById: submission.agentId,
        ownerConsent: p.ownerConsent,
        hoursConfirmedAt: p.hours.length ? submission.capturedAt : null,
        hours: { create: p.hours.map((h, i, arr) => ({ ...h, shiftNo: arr.slice(0, i).filter((x) => x.dayOfWeek === h.dayOfWeek).length + 1 })) },
        photos: {
          create: p.photos
            .filter((ph) => ph.url)
            .map((ph, i) => ({ url: ph.url!, width: ph.width, height: ph.height, category: ph.category, source: 'field', uploadedById: submission.agentId, sortOrder: i })),
        },
      },
    });
    // Food photo as cover, else the storefront.
    const cover = await prisma.photo.findFirst({ where: { restaurantId: restaurant.id, category: { in: ['food', 'exterior'] } }, orderBy: { category: 'desc' } });
    if (cover) await prisma.photo.update({ where: { id: cover.id }, data: { isCover: true } });
    await applyTaxonomy(restaurant.id, p.cuisineSlugs, p.attributeKeys);

    await prisma.fieldSubmission.update({
      where: { id },
      data: { status: 'approved', reviewerId: user.id, restaurantId: restaurant.id, payload: json(p) as object },
    });
    if (submission.leadId) {
      await prisma.lead.update({ where: { id: submission.leadId }, data: { status: 'verified', restaurantId: restaurant.id } });
    }
    // Owner said yes to managing it: SMS a claim link (spec 7.3, 7.4).
    if (p.wantsToManage && p.ownerPhone) {
      await notify({
        to: p.ownerPhone,
        channel: 'sms',
        template: 'owner_invite',
        payload: { restaurant: p.name, link: `${WEB()}/partner/claim?id=${restaurant.id}&name=${encodeURIComponent(p.name)}` },
      });
    }
    await audit(user.id, 'field.approve', 'restaurant', restaurant.id, undefined, { submissionId: id, edits });
    return { restaurant: { id: restaurant.id, slug: restaurant.slug } };
  });

  app.post('/v1/admin/field/submissions/:id/send-back', async (req) => {
    const user = await reviewer(req);
    const { id } = req.params as { id: string };
    const { note } = parse(z.object({ note: z.string().trim().min(3).max(500) }), req.body);
    const s = await prisma.fieldSubmission.findFirst({ where: { id, status: 'submitted' } });
    if (!s) throw notFound('Pending submission');
    await prisma.fieldSubmission.update({ where: { id }, data: { status: 'sent_back', reviewerId: user.id, reviewNote: note } });
    await notify({ userId: s.agentId, channel: 'in_app', template: 'capture_sent_back', payload: { name: (s.payload as Partial<CapturePayload>).name ?? 'A capture', note } });
    return { ok: true };
  });

  // ---- Field operations (spec 6, 7): agents, beats, daily captures per agent and per town ----
  app.get('/v1/admin/field/agents', async (req) => {
    await reviewer(req);
    const agents = await prisma.user.findMany({
      where: { role: { in: ['field_agent', 'field_supervisor'] }, status: 'active' },
      select: { id: true, name: true, phone: true, role: true },
      orderBy: { name: 'asc' },
    });
    const startOfDay = new Date(`${localDate(new Date())}T00:00:00+05:30`);
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const [today, week, decided, leads, assignments] = await Promise.all([
      prisma.fieldSubmission.groupBy({ by: ['agentId'], where: { capturedAt: { gte: startOfDay } }, _count: true }),
      prisma.fieldSubmission.groupBy({ by: ['agentId'], where: { capturedAt: { gte: weekAgo } }, _count: true }),
      prisma.fieldSubmission.groupBy({ by: ['agentId', 'status'], where: { status: { in: ['approved', 'sent_back'] } }, _count: true }),
      prisma.lead.groupBy({ by: ['assignedToId'], where: { status: 'assigned' }, _count: true }),
      prisma.fieldAssignment.findMany({ where: { OR: [{ endsOn: null }, { endsOn: { gte: new Date() } }] }, include: { area: { select: { id: true, name: true } } } }),
    ]);
    const get = (rows: { agentId: string; _count: number }[], id: string) => rows.find((r) => r.agentId === id)?._count ?? 0;
    return {
      data: agents.map((a) => {
        const approved = decided.find((d) => d.agentId === a.id && d.status === 'approved')?._count ?? 0;
        const sentBack = decided.find((d) => d.agentId === a.id && d.status === 'sent_back')?._count ?? 0;
        return {
          ...a,
          today: get(today, a.id),
          week: get(week, a.id),
          approvalRate: approved + sentBack ? Math.round((approved / (approved + sentBack)) * 100) : null,
          openLeads: leads.find((l) => l.assignedToId === a.id)?._count ?? 0,
          areas: assignments.filter((x) => x.agentId === a.id).map((x) => ({ assignmentId: x.id, ...x.area })),
        };
      }),
    };
  });

  app.get('/v1/admin/field/report', async (req) => {
    await reviewer(req);
    const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(90).default(14) }), req.query);
    const since = new Date(Date.now() - days * 864e5);
    const rows = await prisma.$queryRaw<{ day: string; agent: string | null; town: string | null; n: bigint }[]>`
      SELECT to_char(s."capturedAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, u.name AS agent, c.name AS town, count(*) AS n
      FROM "FieldSubmission" s JOIN "User" u ON u.id = s."agentId" LEFT JOIN "City" c ON c.id = s.payload->>'cityId'
      WHERE s."capturedAt" >= ${since}
      GROUP BY 1, 2, 3 ORDER BY 1 DESC, 4 DESC`;
    return { data: rows.map((r) => ({ ...r, count: Number(r.n) })) };
  });

  const areaSchema = z.object({
    cityId: z.string(),
    name: z.string().trim().min(2).max(80),
    boundary: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.tuple([z.number(), z.number()])).min(1)) }).nullable().optional(),
  });

  app.get('/v1/admin/field/areas', async (req) => {
    await reviewer(req);
    return {
      data: await prisma.fieldArea.findMany({
        include: {
          city: { select: { name: true } },
          assignments: { where: { OR: [{ endsOn: null }, { endsOn: { gte: new Date() } }] }, include: { agent: { select: { id: true, name: true, phone: true } } } },
          _count: { select: { leads: true } },
        },
        orderBy: { name: 'asc' },
      }),
    };
  });

  app.post('/v1/admin/field/areas', async (req, reply) => {
    const user = await reviewer(req);
    const body = parse(areaSchema, req.body);
    const { boundary, ...rest } = body;
    const area = await prisma.fieldArea.create({ data: { ...rest, boundary: json(boundary) as never } });
    await audit(user.id, 'area.create', 'field_area', area.id, undefined, body);
    reply.code(201);
    return area;
  });

  app.patch('/v1/admin/field/areas/:id', async (req) => {
    const user = await reviewer(req);
    const body = parse(areaSchema.partial(), req.body);
    const { boundary, ...rest } = body;
    const area = await prisma.fieldArea.update({
      where: { id: (req.params as { id: string }).id },
      data: { ...rest, ...(boundary !== undefined ? { boundary: json(boundary) as never } : {}) },
    });
    await audit(user.id, 'area.update', 'field_area', area.id, undefined, body);
    return area;
  });

  app.delete('/v1/admin/field/areas/:id', async (req) => {
    await reviewer(req);
    const { id } = req.params as { id: string };
    await prisma.lead.updateMany({ where: { areaId: id }, data: { areaId: null } });
    await prisma.fieldArea.delete({ where: { id } });
    return { ok: true };
  });

  app.post('/v1/admin/field/assignments', async (req, reply) => {
    const user = await reviewer(req);
    const body = parse(z.object({ areaId: z.string(), agentId: z.string(), startsOn: z.iso.date(), endsOn: z.iso.date().nullable().optional() }), req.body);
    const agent = await prisma.user.findUnique({ where: { id: body.agentId } });
    if (!agent || !['field_agent', 'field_supervisor'].includes(agent.role)) throw badRequest('Pick a field agent');
    const a = await prisma.fieldAssignment.create({
      data: { areaId: body.areaId, agentId: body.agentId, startsOn: new Date(`${body.startsOn}T00:00:00Z`), endsOn: body.endsOn ? new Date(`${body.endsOn}T00:00:00Z`) : null },
    });
    await audit(user.id, 'area.assign', 'field_area', body.areaId, undefined, body);
    reply.code(201);
    return a;
  });

  app.delete('/v1/admin/field/assignments/:id', async (req) => {
    await reviewer(req);
    // Ending an assignment keeps its history.
    await prisma.fieldAssignment.update({ where: { id: (req.params as { id: string }).id }, data: { endsOn: new Date(`${localDate(new Date(Date.now() - 864e5))}T00:00:00Z`) } });
    return { ok: true };
  });

  // ---- Moderation (spec 6) ----
  app.get('/v1/admin/reports', async (req) => {
    await admin(req);
    const { status } = parse(z.object({ status: z.enum(['open', 'resolved', 'dismissed']).default('open') }), req.query);
    const reports = await prisma.report.findMany({ where: { status }, orderBy: { createdAt: status === 'open' ? 'asc' : 'desc' }, take: 100 });
    const withTargets = await Promise.all(
      reports.map(async (r) => {
        let target: unknown = null;
        if (r.targetType === 'review') {
          target = await prisma.review.findUnique({
            where: { id: r.targetId },
            include: { restaurant: { select: { name: true, slug: true } }, user: { select: { id: true, name: true, phone: true, status: true } } },
          });
        } else if (r.targetType === 'photo') {
          target = await prisma.photo.findUnique({ where: { id: r.targetId }, include: { restaurant: { select: { name: true, slug: true } } } });
        } else {
          const rest = await prisma.restaurant.findUnique({
            where: { id: r.targetId },
            select: { id: true, name: true, slug: true, phone: true, addressLine: true, status: true, hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } } },
          });
          target = rest;
        }
        return { ...r, target };
      }),
    );
    return { data: withTargets };
  });

  app.post('/v1/admin/reports/:id/resolve', async (req) => {
    const user = await admin(req);
    const { id } = req.params as { id: string };
    const { action } = parse(
      z.object({ action: z.enum(['hide', 'remove', 'keep', 'dismiss', 'warn', 'ban', 'close_restaurant', 'fixed', 'apply_correction']) }),
      req.body,
    );
    const report = await prisma.report.findUnique({ where: { id } });
    if (!report) throw notFound('Report');
    if (report.status !== 'open') throw conflict('Already resolved');

    let authorId: string | null = null;
    if (report.targetType === 'review') {
      const review = await prisma.review.findUnique({ where: { id: report.targetId } });
      authorId = review?.userId ?? null;
      if (review && (action === 'hide' || action === 'remove' || action === 'ban')) {
        await prisma.review.update({
          where: { id: review.id },
          data: action === 'remove' ? { status: 'removed', deletedAt: new Date() } : { status: 'hidden' },
        });
        await recalcRating(review.restaurantId);
      }
    } else if (report.targetType === 'photo') {
      const photo = await prisma.photo.findUnique({ where: { id: report.targetId } });
      authorId = photo?.uploadedById ?? null;
      if (photo && (action === 'hide' || action === 'remove' || action === 'ban')) {
        await prisma.photo.update({ where: { id: photo.id }, data: { status: 'rejected', isCover: false, ...(action === 'remove' ? { deletedAt: new Date() } : {}) } });
      }
    } else if (report.targetType === 'restaurant') {
      if (action === 'close_restaurant') await prisma.restaurant.update({ where: { id: report.targetId }, data: { status: 'closed' } });
      // One-click apply of the diner's suggested correction (spec 6 "Info corrections").
      if (action === 'apply_correction') {
        const proposed = (report.proposed ?? {}) as { phone?: string; addressLine?: string; hours?: { dayOfWeek: number; opensAt: string; closesAt: string }[] };
        if (!Object.keys(proposed).length) throw badRequest('This report has no suggested correction');
        const before = await prisma.restaurant.findUnique({ where: { id: report.targetId }, include: { hours: true } });
        await prisma.restaurant.update({
          where: { id: report.targetId },
          data: { ...(proposed.phone ? { phone: proposed.phone } : {}), ...(proposed.addressLine ? { addressLine: proposed.addressLine } : {}) },
        });
        if (proposed.hours) {
          await prisma.$transaction([
            prisma.openingHour.deleteMany({ where: { restaurantId: report.targetId } }),
            prisma.openingHour.createMany({ data: proposed.hours.map((h) => ({ ...h, restaurantId: report.targetId })) }),
          ]);
        }
        await audit(user.id, 'restaurant.correction', 'restaurant', report.targetId, before, proposed);
      }
    }
    if (authorId && (action === 'warn' || action === 'ban')) {
      if (action === 'ban') {
        await prisma.user.update({ where: { id: authorId }, data: { status: 'suspended' } });
        await prisma.refreshToken.updateMany({ where: { userId: authorId, revokedAt: null }, data: { revokedAt: new Date() } });
      } else {
        await notify({ userId: authorId, channel: 'in_app', template: 'moderation_warning', payload: { reason: report.reason.replace(/_/g, ' ') } });
      }
    }
    await prisma.report.update({
      where: { id },
      data: { status: action === 'dismiss' || action === 'keep' ? 'dismissed' : 'resolved', resolvedById: user.id },
    });
    await audit(user.id, `report.${action}`, report.targetType, report.targetId);
    return { ok: true };
  });

  // Auto-flagged reviews held for a moderator (profanity, spam, velocity, shared device).
  app.get('/v1/admin/reviews', async (req) => {
    await admin(req);
    const q = parse(
      z.object({ status: z.enum(['pending', 'published', 'hidden', 'removed']).default('pending'), user_id: z.string().optional(), device_id: z.string().optional(), restaurant_id: z.string().optional() }),
      req.query,
    );
    return {
      data: await prisma.review.findMany({
        where: {
          status: q.status,
          ...(q.status !== 'removed' ? { deletedAt: null } : {}),
          ...(q.user_id ? { userId: q.user_id } : {}),
          ...(q.device_id ? { deviceId: q.device_id } : {}),
          ...(q.restaurant_id ? { restaurantId: q.restaurant_id } : {}),
        },
        include: {
          restaurant: { select: { name: true, slug: true } },
          user: { select: { id: true, name: true, phone: true, status: true, createdAt: true } },
          photos: { include: { photo: { select: { id: true, url: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    };
  });

  // Suspected fake-review clusters: one device across several accounts, and 5★ bursts (spec 6).
  app.get('/v1/admin/reviews/clusters', async (req) => {
    await admin(req);
    const devices = await prisma.$queryRaw<{ deviceId: string; accounts: bigint; reviews: bigint; restaurants: string[] }[]>`
      SELECT "deviceId", count(DISTINCT "userId") AS accounts, count(*) AS reviews, array_agg(DISTINCT "restaurantId") AS restaurants
      FROM "Review" WHERE "deviceId" IS NOT NULL AND "deletedAt" IS NULL AND status IN ('published', 'pending')
        AND "createdAt" > now() - interval '60 days'
      GROUP BY 1 HAVING count(DISTINCT "userId") > 1 ORDER BY 2 DESC LIMIT 50`;
    const bursts = await prisma.$queryRaw<{ restaurantId: string; name: string; day: string; n: bigint }[]>`
      SELECT r."restaurantId", x.name, to_char(r."createdAt" AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day, count(*) AS n
      FROM "Review" r JOIN "Restaurant" x ON x.id = r."restaurantId"
      WHERE r.rating = 5 AND r."deletedAt" IS NULL AND r."createdAt" > now() - interval '30 days'
      GROUP BY 1, 2, 3 HAVING count(*) >= 5 ORDER BY 4 DESC LIMIT 50`;
    return {
      devices: devices.map((d) => ({ ...d, accounts: Number(d.accounts), reviews: Number(d.reviews) })),
      bursts: bursts.map((b) => ({ ...b, count: Number(b.n) })),
    };
  });

  app.post('/v1/admin/reviews/:id/:decision', async (req) => {
    const user = await admin(req);
    const { id, decision } = req.params as { id: string; decision: string };
    if (!['publish', 'hide', 'remove', 'restore'].includes(decision)) throw notFound('Action');
    const review = await prisma.review.findUnique({ where: { id }, include: { restaurant: { select: { id: true, name: true } } } });
    if (!review) throw notFound('Review');
    const data =
      decision === 'publish' || decision === 'restore'
        ? { status: 'published', deletedAt: null }
        : decision === 'hide'
          ? { status: 'hidden' }
          : { status: 'removed', deletedAt: new Date() };
    await prisma.review.update({ where: { id }, data });
    if (decision === 'publish') {
      await prisma.photo.updateMany({ where: { reviews: { some: { reviewId: id } }, status: 'pending' }, data: { status: 'approved' } });
      await notify({ userId: review.userId, channel: 'in_app', template: 'review_published', payload: { restaurant: review.restaurant.name } });
      if (review.rating <= 2) await notifyTeam(review.restaurantId, 'review_new', { restaurant: review.restaurant.name, rating: review.rating, excerpt: review.text.slice(0, 140) }, { sms: true });
    }
    await recalcRating(review.restaurantId);
    await audit(user.id, `review.${decision}`, 'review', id, { status: review.status }, data);
    return { ok: true };
  });

  // Bulk-hide a flagged cluster (spec 6): by ids, author, device or a restaurant's recent burst.
  app.post('/v1/admin/reviews/bulk-hide', async (req) => {
    const user = await admin(req);
    const body = parse(
      z
        .object({
          reviewIds: z.array(z.string()).max(500).optional(),
          userId: z.string().optional(),
          deviceId: z.string().optional(),
          restaurantId: z.string().optional(),
          since: z.iso.datetime().optional(),
        })
        .refine((b) => b.reviewIds?.length || b.userId || b.deviceId || b.restaurantId, 'Say which reviews to hide'),
      req.body,
    );
    const where = {
      deletedAt: null,
      status: { in: ['published', 'pending'] },
      ...(body.reviewIds ? { id: { in: body.reviewIds } } : {}),
      ...(body.userId ? { userId: body.userId } : {}),
      ...(body.deviceId ? { deviceId: body.deviceId } : {}),
      ...(body.restaurantId ? { restaurantId: body.restaurantId, rating: 5 } : {}),
      ...(body.since ? { createdAt: { gte: new Date(body.since) } } : {}),
    };
    const affected = await prisma.review.findMany({ where, select: { id: true, restaurantId: true } });
    await prisma.review.updateMany({ where: { id: { in: affected.map((a) => a.id) } }, data: { status: 'hidden' } });
    for (const rid of new Set(affected.map((a) => a.restaurantId))) await recalcRating(rid);
    await audit(user.id, 'review.bulk_hide', 'review', 'bulk', undefined, { ...body, count: affected.length });
    return { hidden: affected.length };
  });

  // Diner photos wait here before appearing (spec 4.4).
  app.get('/v1/admin/photos', async (req) => {
    await admin(req);
    const { status } = parse(z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending') }), req.query);
    return {
      data: await prisma.photo.findMany({
        where: { status, source: 'diner', deletedAt: null },
        include: { restaurant: { select: { name: true, slug: true } }, reviews: { include: { review: { select: { id: true, rating: true, text: true, status: true } } } } },
        orderBy: { createdAt: 'asc' },
        take: 200,
      }),
    };
  });

  app.post('/v1/admin/photos/:id/:decision', async (req) => {
    const user = await admin(req);
    const { id, decision } = req.params as { id: string; decision: string };
    if (!['approve', 'reject'].includes(decision)) throw notFound('Action');
    const photo = await prisma.photo.findUnique({ where: { id }, include: { restaurant: { select: { name: true } } } });
    if (!photo) throw notFound('Photo');
    await prisma.photo.update({ where: { id }, data: { status: decision === 'approve' ? 'approved' : 'rejected' } });
    if (decision === 'reject' && photo.uploadedById) {
      await notify({ userId: photo.uploadedById, channel: 'in_app', template: 'photo_rejected', payload: { restaurant: photo.restaurant.name } });
    }
    await audit(user.id, `photo.${decision}`, 'photo', id);
    return { ok: true };
  });

  // ---- Leads (internet-sourced, spec 7.2) ----
  app.get('/v1/admin/leads', async (req) => {
    await reviewer(req);
    const q = parse(z.object({ status: z.string().optional(), city_id: z.string().optional(), area_id: z.string().optional() }), req.query);
    return {
      data: await prisma.lead.findMany({
        where: { ...(q.status ? { status: q.status } : {}), ...(q.city_id ? { cityId: q.city_id } : {}), ...(q.area_id ? { areaId: q.area_id } : {}) },
        include: {
          city: { select: { name: true } },
          area: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true, phone: true } },
          visits: { orderBy: { createdAt: 'desc' }, take: 1, select: { outcome: true, createdAt: true, revisitOn: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    };
  });

  // CSV columns: name,phone,address,lat,lng,source,source_url,place_id. De-duplicated by name
  // against existing leads and restaurants in the city, and by location (within 30 m, similar name).
  app.post('/v1/admin/leads/import', async (req) => {
    const user = await reviewer(req);
    const { csv, cityId, areaId } = parse(z.object({ csv: z.string().min(1).max(1_000_000), cityId: z.string(), areaId: z.string().optional() }), req.body);
    if (!(await prisma.city.findUnique({ where: { id: cityId } }))) throw notFound('City');
    const rows = withoutHeader(parseCsv(csv), 'name');
    const [existing, restaurants] = await Promise.all([
      prisma.lead.findMany({ where: { cityId }, select: { name: true, lat: true, lng: true, placeId: true } }),
      prisma.restaurant.findMany({ where: { cityId, deletedAt: null }, select: { name: true, lat: true, lng: true } }),
    ]);
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const known = [...existing, ...restaurants].map((x) => ({ key: norm(x.name), lat: x.lat, lng: x.lng }));
    const placeIds = new Set(existing.flatMap((e) => (e.placeId ? [e.placeId] : [])));
    let created = 0;
    let duplicates = 0;
    const errors: string[] = [];
    const sources = ['google_maps', 'justdial', 'social', 'directory', 'other'];
    for (const [i, cols] of rows.entries()) {
      const [name, phone, address, lat, lng, source, sourceUrl, placeId] = cols.map((c) => c || undefined);
      if (!name) {
        errors.push(`Row ${i + 1}: name is required`);
        continue;
      }
      const la = lat ? Number(lat) : null;
      const ln = lng ? Number(lng) : null;
      if ((la != null && !Number.isFinite(la)) || (ln != null && !Number.isFinite(ln))) {
        errors.push(`Row ${i + 1}: lat/lng must be numbers`);
        continue;
      }
      const key = norm(name);
      const dup =
        (placeId && placeIds.has(placeId)) ||
        known.some((k) => k.key === key || (la != null && ln != null && k.lat != null && k.lng != null && distanceMeters(la, ln, k.lat, k.lng) < 30 && (k.key.includes(key) || key.includes(k.key))));
      if (dup) {
        duplicates++;
        continue;
      }
      known.push({ key, lat: la, lng: ln });
      if (placeId) placeIds.add(placeId);
      await prisma.lead.create({
        data: {
          cityId,
          areaId: areaId ?? null,
          name,
          phone: phone?.replace(/\D/g, '').slice(-10),
          address,
          lat: la,
          lng: ln,
          source: source && sources.includes(source) ? source : 'other',
          sourceUrl,
          placeId,
        },
      });
      created++;
    }
    await audit(user.id, 'leads.import', 'city', cityId, undefined, { created, duplicates });
    return { created, duplicates, errors };
  });

  app.post('/v1/admin/leads/assign', async (req) => {
    await reviewer(req);
    const { leadIds, agentId, areaId } = parse(z.object({ leadIds: z.array(z.string()).min(1), agentId: z.string(), areaId: z.string().optional() }), req.body);
    const agent = await prisma.user.findUnique({ where: { id: agentId } });
    if (!agent || !['field_agent', 'field_supervisor'].includes(agent.role)) throw badRequest('Pick a field agent');
    const { count } = await prisma.lead.updateMany({
      where: { id: { in: leadIds }, status: { in: ['new', 'assigned'] } },
      data: { assignedToId: agentId, status: 'assigned', ...(areaId ? { areaId } : {}) },
    });
    return { assigned: count };
  });

  // ---- Users and partners ----
  app.get('/v1/admin/users', async (req) => {
    const actor = await reviewer(req);
    const { q, role } = parse(z.object({ q: z.string().optional(), role: z.string().optional() }), req.query);
    // Supervisors may only look up field staff (for assigning leads).
    const roleFilter = actor.role === 'admin' ? (role ? { role } : {}) : { role: { in: ['field_agent', 'field_supervisor'] } };
    return {
      data: await prisma.user.findMany({
        where: {
          ...roleFilter,
          status: { not: 'deleted' },
          ...(q ? { OR: [{ phone: { contains: q } }, { name: { contains: q, mode: 'insensitive' as const } }, { email: { contains: q, mode: 'insensitive' as const } }] } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { _count: { select: { reviews: true, memberships: true, submissions: true } } },
      }),
    };
  });

  app.get('/v1/admin/users/:id', async (req) => {
    await admin(req);
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        memberships: { include: { restaurant: { select: { id: true, name: true, status: true } } } },
        reviews: { orderBy: { createdAt: 'desc' }, take: 50, include: { restaurant: { select: { name: true, slug: true } } } },
      },
    });
    if (!user) throw notFound('User');
    const [reportsAgainst, reportsFiled, history] = await Promise.all([
      prisma.report.count({ where: { targetType: 'review', targetId: { in: user.reviews.map((r) => r.id) } } }),
      prisma.report.count({ where: { reporterId: id } }),
      prisma.auditLog.findMany({ where: { OR: [{ entityId: id }, { actorId: id }] }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return { ...user, reportsAgainst, reportsFiled, history };
  });

  app.post('/v1/admin/users', async (req, reply) => {
    const user = await admin(req);
    const body = parse(
      z.object({ phone: z.string().regex(/^[6-9]\d{9}$/), name: z.string().max(80).optional(), role: z.enum(['user', 'field_agent', 'field_supervisor', 'admin']) }),
      req.body,
    );
    const created = await prisma.user.upsert({
      where: { phone: body.phone },
      create: body,
      update: { role: body.role, ...(body.name ? { name: body.name } : {}) },
    });
    await audit(user.id, 'user.upsert', 'user', created.id, undefined, body);
    reply.code(201);
    return created;
  });

  app.patch('/v1/admin/users/:id', async (req) => {
    const actor = await admin(req);
    const { id } = req.params as { id: string };
    const data = parse(z.object({ role: z.enum(['user', 'field_agent', 'field_supervisor', 'admin']).optional(), status: z.enum(['active', 'suspended']).optional() }), req.body);
    if (id === actor.id) throw badRequest('You cannot change your own account here');
    const before = await prisma.user.findUnique({ where: { id }, select: { role: true, status: true } });
    const updated = await prisma.user.update({ where: { id }, data });
    if (data.status === 'suspended') await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(actor.id, 'user.update', 'user', id, before, data);
    return updated;
  });

  // ---- Restaurants ----
  app.get('/v1/admin/restaurants', async (req) => {
    await admin(req);
    const { q, status, city_id, deleted } = parse(z.object({ q: z.string().optional(), status: z.string().optional(), city_id: z.string().optional(), deleted: z.string().optional() }), req.query);
    const rows = await prisma.restaurant.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(city_id ? { cityId: city_id } : {}),
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
        deletedAt: deleted === '1' ? { not: null } : null,
      },
      include: { city: { select: { name: true, slug: true } }, sponsored: true, _count: { select: { members: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 300,
    });
    const now = new Date();
    return {
      data: rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        citySlug: r.city.slug,
        name: r.name,
        city: r.city.name,
        cityId: r.cityId,
        status: r.status,
        source: r.source,
        isClaimed: r.isClaimed,
        isVerified: r.isVerified,
        rating: r.avgRating,
        reviewCount: r.reviewCount,
        members: r._count.members,
        deletedAt: r.deletedAt,
        sponsored: r.sponsored.filter((s) => s.endsOn >= now).map((s) => ({ id: s.id, startsOn: s.startsOn, endsOn: s.endsOn, slot: s.slot })),
      })),
    };
  });

  app.patch('/v1/admin/restaurants/:id', async (req) => {
    const user = await admin(req);
    const { id } = req.params as { id: string };
    const data = parse(
      z.object({
        status: z.enum(['draft', 'pending', 'live', 'rejected', 'suspended', 'closed']).optional(),
        isVerified: z.boolean().optional(),
        lastInspectionOn: z.iso.date().nullable().optional(),
        deleted: z.boolean().optional(),
      }),
      req.body,
    );
    const before = await prisma.restaurant.findUnique({ where: { id } });
    if (!before) throw notFound('Restaurant');
    const { deleted, lastInspectionOn, ...rest } = data;
    const updated = await prisma.restaurant.update({
      where: { id },
      data: {
        ...rest,
        ...(lastInspectionOn !== undefined ? { lastInspectionOn: lastInspectionOn ? new Date(`${lastInspectionOn}T00:00:00Z`) : null } : {}),
        // Soft delete, reversible (spec 9.2).
        ...(deleted !== undefined ? { deletedAt: deleted ? new Date() : null } : {}),
      },
    });
    await audit(user.id, 'restaurant.admin_update', 'restaurant', id, { status: before.status, isVerified: before.isVerified, deletedAt: before.deletedAt }, data);
    return { id: updated.id, status: updated.status };
  });

  // Promotions (spec 6): a city and date range; hidden until the sponsored flag is on for that city.
  app.post('/v1/admin/sponsored', async (req, reply) => {
    const user = await admin(req);
    const body = parse(z.object({ restaurantId: z.string(), startsOn: z.iso.date(), endsOn: z.iso.date(), slot: z.number().int().min(1).max(5).default(1) }), req.body);
    if (body.endsOn < body.startsOn) throw badRequest('End date is before start date');
    const r = await prisma.restaurant.findUnique({ where: { id: body.restaurantId } });
    if (!r) throw notFound('Restaurant');
    const s = await prisma.sponsoredPlacement.create({
      data: { restaurantId: r.id, cityId: r.cityId, slot: body.slot, startsOn: new Date(`${body.startsOn}T00:00:00+05:30`), endsOn: new Date(`${body.endsOn}T23:59:59+05:30`) },
    });
    await audit(user.id, 'restaurant.sponsor', 'restaurant', r.id, undefined, body);
    reply.code(201);
    return s;
  });

  app.delete('/v1/admin/sponsored/:id', async (req) => {
    const user = await admin(req);
    const { id } = req.params as { id: string };
    const s = await prisma.sponsoredPlacement.delete({ where: { id } });
    await audit(user.id, 'restaurant.unsponsor', 'restaurant', s.restaurantId, s, undefined);
    return { ok: true };
  });

  // ---- Settings, flags and brand (spec 6, 9.3, 11.6) ----
  app.get('/v1/admin/settings', async (req) => {
    await admin(req);
    const [global, overrides, brand] = await Promise.all([
      getFlags(null),
      prisma.appSetting.findMany({ where: { cityId: { not: null }, key: { in: FLAG_KEYS } }, include: { city: { select: { name: true } } } }),
      getBrand(),
    ]);
    return {
      ...global,
      brand,
      cityOverrides: overrides.map((o) => ({ cityId: o.cityId, city: o.city?.name, key: o.key, value: o.value })),
      defaults: { ...DEFAULT_FLAGS, brand: DEFAULT_BRAND },
    };
  });

  app.put('/v1/admin/settings', async (req) => {
    const user = await admin(req);
    const body = parse(
      z.object({
        cityId: z.string().nullable().default(null),
        unclaimed_listings_enabled: z.boolean().nullable().optional(),
        sponsored_enabled: z.boolean().nullable().optional(),
        review_rules: z
          .object({ minChars: z.number().int().min(0).max(500), perDayLimit: z.number().int().min(1).max(100), cooldownDays: z.number().int().min(0).max(365), burstThreshold: z.number().int().min(2).max(100) })
          .nullable()
          .optional(),
        brand: z
          .object({
            appName: z.string().min(2).max(40),
            shortName: z.string().min(1).max(6),
            tagline: z.string().max(80),
            taglineHi: z.string().max(80),
            primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
            logoUrl: z.string().nullable(),
            iconUrl: z.string().nullable().default(null),
            supportEmail: z.string().max(120),
            supportPhone: z.string().max(40),
            webDomain: z.string().max(120).nullable().default(null),
          })
          .optional(),
      }),
      req.body,
    );
    const before = { flags: await getFlags(body.cityId), brand: await getBrand() };
    for (const key of FLAG_KEYS) {
      const value = body[key as FlagKey];
      if (value === undefined) continue;
      if (value === null && !body.cityId) throw badRequest('Global settings need a value');
      await setFlag(key, value as never, body.cityId, user.id);
    }
    if (body.brand) {
      if (body.cityId) throw badRequest('Brand is global');
      await setBrand(body.brand);
    }
    await audit(user.id, 'settings.update', 'settings', body.cityId ?? 'global', before, body);
    return { ...(await getFlags(body.cityId)), brand: await getBrand() };
  });

  // ---- Catalogue (spec 6): cities, localities, cuisines, establishment types, attributes, synonyms ----
  app.get('/v1/admin/catalog', async (req) => {
    await reviewer(req);
    const [cities, cuisines, types, attributes, synonyms, waitlist] = await Promise.all([
      prisma.city.findMany({ include: { localities: { orderBy: { name: 'asc' } }, _count: { select: { restaurants: true, waitlist: true } } }, orderBy: { name: 'asc' } }),
      prisma.cuisine.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { restaurants: true } } } }),
      prisma.establishmentType.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { restaurants: true } } } }),
      prisma.attribute.findMany({ orderBy: [{ group: 'asc' }, { name: 'asc' }], include: { _count: { select: { restaurants: true } } } }),
      prisma.searchSynonym.findMany({ orderBy: { term: 'asc' } }),
      prisma.cityWaitlist.count({ where: { cityId: null } }),
    ]);
    return { cities, cuisines, types, attributes, synonyms, waitlistOutsideCities: waitlist };
  });

  const citySchema = z.object({
    name: z.string().trim().min(2).max(60),
    nameHi: z.string().trim().max(60).nullable().optional(),
    state: z.string().trim().min(2).max(60),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    timezone: z.string().default('Asia/Kolkata'),
    isLive: z.boolean().default(false),
  });

  app.post('/v1/admin/catalog/cities', async (req, reply) => {
    const user = await admin(req);
    const body = parse(citySchema, req.body);
    const slug = slugify(body.name);
    if (await prisma.city.findUnique({ where: { slug } })) throw conflict('A town with this name exists');
    const city = await prisma.city.create({ data: { ...body, slug } });
    await audit(user.id, 'city.create', 'city', city.id, undefined, body);
    reply.code(201);
    return city;
  });

  app.patch('/v1/admin/catalog/cities/:id', async (req) => {
    const user = await admin(req);
    const { id } = req.params as { id: string };
    const body = parse(citySchema.partial(), req.body);
    const before = await prisma.city.findUnique({ where: { id } });
    if (!before) throw notFound('City');
    const city = await prisma.city.update({ where: { id }, data: body });
    // Launching a town tells everyone who asked to be notified nearby (spec 2.1).
    if (body.isLive && !before.isLive) {
      const waiting = await prisma.cityWaitlist.findMany({ where: { OR: [{ cityId: id }, { cityId: null }] } });
      for (const w of waiting.filter((w) => w.cityId === id || distanceMeters(w.lat, w.lng, city.lat, city.lng) < 40_000)) {
        await notify({ to: w.phone, channel: 'sms', template: 'city_live', payload: { city: city.name } });
        await prisma.cityWaitlist.delete({ where: { id: w.id } });
      }
    }
    await audit(user.id, 'city.update', 'city', id, before, body);
    return city;
  });

  const localitySchema = z.object({ cityId: z.string(), name: z.string().trim().min(2).max(80), nameHi: z.string().trim().max(80).nullable().optional(), lat: z.number(), lng: z.number() });
  app.post('/v1/admin/catalog/localities', async (req, reply) => {
    const user = await admin(req);
    const body = parse(localitySchema, req.body);
    const l = await prisma.locality.create({ data: body });
    await audit(user.id, 'locality.create', 'locality', l.id, undefined, body);
    reply.code(201);
    return l;
  });
  app.patch('/v1/admin/catalog/localities/:id', async (req) => {
    const user = await admin(req);
    const body = parse(localitySchema.partial(), req.body);
    const l = await prisma.locality.update({ where: { id: (req.params as { id: string }).id }, data: body });
    await audit(user.id, 'locality.update', 'locality', l.id, undefined, body);
    return l;
  });
  app.delete('/v1/admin/catalog/localities/:id', async (req) => {
    await admin(req);
    const { id } = req.params as { id: string };
    if (await prisma.restaurant.count({ where: { localityId: id } })) throw conflict('Restaurants use this locality; move them first');
    await prisma.locality.delete({ where: { id } });
    return { ok: true };
  });

  // Cuisines, types and attributes share one shape.
  const vocab = {
    cuisines: { model: prisma.cuisine, key: 'slug', schema: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2).max(40), nameHi: z.string().max(40).nullable().optional(), icon: z.string().max(8).nullable().optional() }) },
    'establishment-types': { model: prisma.establishmentType, key: 'slug', schema: z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string().min(2).max(40), nameHi: z.string().max(40).nullable().optional() }) },
    attributes: {
      model: prisma.attribute,
      key: 'key',
      schema: z.object({
        key: z.string().regex(/^[a-z0-9_]+$/),
        name: z.string().min(2).max(40),
        nameHi: z.string().max(40).nullable().optional(),
        group: z.enum(['feature', 'dietary', 'service', 'payment', 'occasion']),
        icon: z.string().max(8).nullable().optional(),
      }),
    },
  } as const;
  type VocabModel = { create: (a: { data: unknown }) => Promise<{ id: string }>; update: (a: { where: { id: string }; data: unknown }) => Promise<{ id: string }>; delete: (a: { where: { id: string } }) => Promise<unknown> };

  for (const [path, v] of Object.entries(vocab)) {
    const model = v.model as unknown as VocabModel;
    app.post(`/v1/admin/catalog/${path}`, async (req, reply) => {
      const user = await admin(req);
      const body = parse(v.schema as z.ZodTypeAny, req.body);
      const row = await model.create({ data: body }).catch((e: { code?: string }) => {
        throw e.code === 'P2002' ? conflict(`That ${v.key} is already used`) : e;
      });
      await audit(user.id, `${path}.create`, path, row.id, undefined, body);
      reply.code(201);
      return row;
    });
    app.patch(`/v1/admin/catalog/${path}/:id`, async (req) => {
      const user = await admin(req);
      const body = parse((v.schema as z.ZodObject<z.ZodRawShape>).partial().omit({ [v.key]: true } as never), req.body);
      const row = await model.update({ where: { id: (req.params as { id: string }).id }, data: body });
      await audit(user.id, `${path}.update`, path, row.id, undefined, body);
      return row;
    });
    app.delete(`/v1/admin/catalog/${path}/:id`, async (req) => {
      const user = await admin(req);
      const { id } = req.params as { id: string };
      await model.delete({ where: { id } }).catch(() => {
        throw conflict('Still used by restaurants. Remove it from them first.');
      });
      await audit(user.id, `${path}.delete`, path, id);
      return { ok: true };
    });
  }

  app.put('/v1/admin/catalog/synonyms', async (req) => {
    const user = await admin(req);
    const { synonyms } = parse(z.object({ synonyms: z.array(z.object({ term: z.string().trim().toLowerCase().min(2).max(40), canonical: z.string().trim().toLowerCase().min(2).max(40) })).max(1000) }), req.body);
    await prisma.$transaction([prisma.searchSynonym.deleteMany(), prisma.searchSynonym.createMany({ data: synonyms, skipDuplicates: true })]);
    invalidateSynonyms();
    await audit(user.id, 'synonyms.replace', 'search', 'synonyms', undefined, { count: synonyms.length });
    return { count: synonyms.length };
  });

  // ---- Collections (spec 3.4, 6) ----
  const collectionSchema = z.object({
    title: z.string().trim().min(3).max(80),
    titleHi: z.string().trim().max(80).nullable().optional(),
    description: z.string().trim().max(300).nullable().optional(),
    coverUrl: z.string().nullable().optional(),
    cityId: z.string().nullable().optional(),
    type: z.enum(['editorial', 'auto']).default('editorial'),
    rules: z
      .object({
        attributes: z.array(z.string()).optional(),
        cuisines: z.array(z.string()).optional(),
        types: z.array(z.string()).optional(),
        ratingMin: z.number().optional(),
        costMax: z.number().optional(),
        sort: z.enum(['relevance', 'distance', 'rating', 'cost_asc', 'cost_desc', 'popularity']).optional(),
        isNew: z.boolean().optional(),
        hasOffers: z.boolean().optional(),
      })
      .nullable()
      .optional(),
    startsOn: z.iso.date().nullable().optional(),
    endsOn: z.iso.date().nullable().optional(),
    isPublished: z.boolean().default(false),
    sortOrder: z.number().int().default(0),
    restaurantIds: z.array(z.string()).max(100).optional(),
  });
  const collectionData = (c: Partial<z.infer<typeof collectionSchema>>) => {
    const { restaurantIds: _r, startsOn, endsOn, rules, ...rest } = c;
    return {
      ...rest,
      ...(rules !== undefined ? { rules: json(rules) as object } : {}),
      ...(startsOn !== undefined ? { startsOn: startsOn ? new Date(`${startsOn}T00:00:00+05:30`) : null } : {}),
      ...(endsOn !== undefined ? { endsOn: endsOn ? new Date(`${endsOn}T23:59:59+05:30`) : null } : {}),
    };
  };

  app.get('/v1/admin/collections', async (req) => {
    await admin(req);
    return {
      data: await prisma.collection.findMany({
        include: { city: { select: { name: true } }, restaurants: { orderBy: { sortOrder: 'asc' }, include: { restaurant: { select: { id: true, name: true, status: true } } } } },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      }),
    };
  });

  app.post('/v1/admin/collections', async (req, reply) => {
    const user = await admin(req);
    const body = parse(collectionSchema, req.body);
    let slug = slugify(body.title) || 'collection';
    if (await prisma.collection.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;
    const c = await prisma.collection.create({
      data: { ...(collectionData(body) as object as { title: string }), slug, restaurants: { create: (body.restaurantIds ?? []).map((restaurantId, i) => ({ restaurantId, sortOrder: i })) } },
    });
    await audit(user.id, 'collection.create', 'collection', c.id, undefined, body);
    reply.code(201);
    return c;
  });

  app.patch('/v1/admin/collections/:id', async (req) => {
    const user = await admin(req);
    const { id } = req.params as { id: string };
    const body = parse(collectionSchema.partial(), req.body);
    await prisma.collection.update({ where: { id }, data: collectionData(body) });
    if (body.restaurantIds) {
      await prisma.$transaction([
        prisma.collectionRestaurant.deleteMany({ where: { collectionId: id } }),
        prisma.collectionRestaurant.createMany({ data: body.restaurantIds.map((restaurantId, i) => ({ collectionId: id, restaurantId, sortOrder: i })) }),
      ]);
    }
    await audit(user.id, 'collection.update', 'collection', id, undefined, body);
    return { ok: true };
  });

  app.delete('/v1/admin/collections/:id', async (req) => {
    const user = await admin(req);
    const { id } = req.params as { id: string };
    await prisma.collection.delete({ where: { id } });
    await audit(user.id, 'collection.delete', 'collection', id);
    return { ok: true };
  });

  // Restaurant picker for collections and promotions.
  app.get('/v1/admin/restaurants/search', async (req) => {
    await admin(req);
    const { q } = parse(z.object({ q: z.string().trim().min(2) }), req.query);
    return {
      data: await prisma.restaurant.findMany({
        where: { name: { contains: q, mode: 'insensitive' }, deletedAt: null },
        select: { id: true, name: true, status: true, city: { select: { name: true } } },
        take: 15,
      }),
    };
  });

  app.get('/v1/admin/audit-log', async (req) => {
    await admin(req);
    const q = parse(z.object({ entity_type: z.string().optional(), entity_id: z.string().optional(), actor_id: z.string().optional(), action: z.string().optional() }), req.query);
    const rows = await prisma.auditLog.findMany({
      where: {
        ...(q.entity_type ? { entityType: q.entity_type } : {}),
        ...(q.entity_id ? { entityId: q.entity_id } : {}),
        ...(q.actor_id ? { actorId: q.actor_id } : {}),
        ...(q.action ? { action: { startsWith: q.action } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    const actors = await prisma.user.findMany({ where: { id: { in: rows.flatMap((r) => (r.actorId ? [r.actorId] : [])) } }, select: { id: true, name: true, phone: true } });
    return { data: rows.map((r) => ({ ...r, actor: actors.find((a) => a.id === r.actorId) ?? null })) };
  });

}
