import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { FIELD_ROLES, requireRole } from '../lib/auth.js';
import { prisma } from '../lib/db.js';
import { capturePayload, type CapturePayload } from '../lib/field.js';
import { distanceMeters } from '../lib/geo.js';
import { notFound, parse } from '../lib/http.js';
import { localDate } from '../lib/hours.js';
import { saveDataUrl } from '../lib/uploads.js';

const NEARBY_RADIUS_M = 200;
const DUPLICATE_RADIUS_M = 50;
const MIN_GPS_ACCURACY_M = 30;

const visitSchema = z.object({
  clientUuid: z.uuid().optional(),
  leadId: z.string().optional().nullable(),
  restaurantId: z.string().optional().nullable(),
  outcome: z.enum(['captured', 'closed', 'refused', 'revisit', 'duplicate', 'not_found']),
  revisitOn: z.iso.date().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
});

const LEAD_STATUS: Record<string, string | null> = {
  closed: 'rejected',
  refused: 'rejected',
  not_found: 'rejected',
  duplicate: 'duplicate',
  revisit: null,
  captured: null,
};

/** Idempotent on clientUuid, so the offline queue can resend safely. */
async function logVisit(agentId: string, v: z.infer<typeof visitSchema>) {
  if (v.clientUuid) {
    const existing = await prisma.fieldVisit.findUnique({ where: { clientUuid: v.clientUuid } });
    if (existing) return existing;
  }
  if (v.leadId && !(await prisma.lead.findFirst({ where: { id: v.leadId, assignedToId: agentId } }))) throw notFound('Lead');
  const visit = await prisma.fieldVisit.create({
    data: {
      agentId,
      clientUuid: v.clientUuid,
      leadId: v.leadId ?? null,
      restaurantId: v.restaurantId ?? null,
      outcome: v.outcome,
      revisitOn: v.outcome === 'revisit' && v.revisitOn ? new Date(`${v.revisitOn}T00:00:00Z`) : null,
      note: v.note,
      lat: v.lat,
      lng: v.lng,
    },
  });
  const status = LEAD_STATUS[v.outcome];
  if (v.leadId && status) await prisma.lead.update({ where: { id: v.leadId }, data: { status } });
  return visit;
}

export async function fieldRoutes(app: FastifyInstance) {
  // Assigned beats (spec 7.3 "My area"): boundaries, leads to visit and places already listed.
  app.get('/v1/field/me/areas', async (req) => {
    const user = await requireRole(req, FIELD_ROLES);
    const today = new Date(`${localDate(new Date())}T00:00:00Z`);
    const assignments = await prisma.fieldAssignment.findMany({
      where: { agentId: user.id, startsOn: { lte: today }, OR: [{ endsOn: null }, { endsOn: { gte: today } }] },
      include: { area: { include: { city: { select: { id: true, name: true, lat: true, lng: true } } } } },
    });
    const cityIds = [...new Set(assignments.map((a) => a.area.cityId))];
    const [leads, places] = await Promise.all([
      prisma.lead.findMany({ where: { assignedToId: user.id, status: 'assigned' }, select: { id: true, name: true, lat: true, lng: true, areaId: true, address: true } }),
      prisma.restaurant.findMany({
        where: { cityId: { in: cityIds }, deletedAt: null, status: { notIn: ['rejected'] } },
        select: { id: true, name: true, lat: true, lng: true, status: true, source: true },
      }),
    ]);
    return {
      data: assignments.map((a) => ({
        id: a.area.id,
        name: a.area.name,
        city: a.area.city,
        boundary: a.area.boundary,
        startsOn: a.startsOn,
        endsOn: a.endsOn,
      })),
      leads,
      places,
    };
  });

  app.get('/v1/field/leads', async (req) => {
    const user = await requireRole(req, FIELD_ROLES);
    const { area_id } = parse(z.object({ area_id: z.string().optional() }), req.query);
    const leads = await prisma.lead.findMany({
      where: { assignedToId: user.id, status: 'assigned', ...(area_id ? { areaId: area_id } : {}) },
      include: {
        city: { select: { name: true } },
        area: { select: { name: true } },
        visits: { orderBy: { createdAt: 'desc' }, take: 1, select: { outcome: true, revisitOn: true, note: true, createdAt: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { data: leads.map(({ visits, ...l }) => ({ ...l, lastVisit: visits[0] ?? null })) };
  });

  app.post('/v1/field/visits', async (req, reply) => {
    const user = await requireRole(req, FIELD_ROLES);
    const body = parse(visitSchema, req.body);
    reply.code(201);
    return logVisit(user.id, body);
  });

  // Legacy outcome endpoint used by earlier builds of the field app.
  app.post('/v1/field/leads/:id/outcome', async (req) => {
    const user = await requireRole(req, FIELD_ROLES);
    const { id } = req.params as { id: string };
    const { outcome } = parse(z.object({ outcome: z.enum(['closed', 'refused', 'duplicate', 'not_found']) }), req.body);
    await logVisit(user.id, { leadId: id, outcome });
    return { ok: true };
  });

  // Duplicate check (spec 7.3): places within 200 m; a similar name within 50 m is a likely duplicate.
  app.get('/v1/field/places/nearby', async (req) => {
    await requireRole(req, FIELD_ROLES);
    const { lat, lng, name } = parse(z.object({ lat: z.coerce.number(), lng: z.coerce.number(), name: z.string().optional() }), req.query);
    const n = (name ?? '').trim().toLowerCase();
    const point = { lat, lng };
    const restaurants = await prisma.$queryRaw<{ id: string; name: string; addressLine: string; status: string; distanceM: number; similarity: number }[]>`
      SELECT id, name, "addressLine", status,
             round(ST_Distance(location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography))::int AS "distanceM",
             CASE WHEN ${n} = '' THEN 0 ELSE similarity(lower(name), ${n}) END::float8 AS similarity
      FROM "Restaurant"
      WHERE "deletedAt" IS NULL AND status <> 'rejected'
        AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${NEARBY_RADIUS_M})
      ORDER BY "distanceM"`;
    const [pending, leads] = await Promise.all([
      prisma.fieldSubmission.findMany({ where: { status: 'submitted' }, select: { id: true, payload: true } }),
      prisma.lead.findMany({
        where: { lat: { gte: lat - 0.003, lte: lat + 0.003 }, lng: { gte: lng - 0.003, lte: lng + 0.003 }, status: { in: ['new', 'assigned'] } },
        select: { id: true, name: true, lat: true, lng: true },
      }),
    ]);
    const nameSim = (a: string) => {
      if (!n) return 0;
      const x = a.toLowerCase();
      return x.includes(n) || n.includes(x) ? 1 : 0;
    };
    const likely = (d: number, sim: number) => d <= 15 || (d <= DUPLICATE_RADIUS_M && sim >= 0.4);
    return {
      restaurants: restaurants.map((r) => ({ ...r, likelyDuplicate: likely(r.distanceM, Math.max(r.similarity, nameSim(r.name))) })),
      pendingCaptures: pending
        .map((s) => {
          const p = s.payload as Partial<CapturePayload>;
          const d = Math.round(distanceMeters(lat, lng, p.lat ?? 0, p.lng ?? 0));
          return { id: s.id, name: p.name ?? '', distanceM: d, likelyDuplicate: likely(d, nameSim(p.name ?? '')) };
        })
        .filter((s) => s.distanceM <= NEARBY_RADIUS_M),
      leads: leads
        .filter((l) => l.lat != null && l.lng != null)
        .map((l) => ({ id: l.id, name: l.name, distanceM: Math.round(distanceMeters(lat, lng, l.lat!, l.lng!)) }))
        .filter((l) => l.distanceM <= NEARBY_RADIUS_M),
      duplicateRadiusM: DUPLICATE_RADIUS_M,
    };
  });

  // Offline queue upload. Idempotent: re-sending the same clientUuid returns the existing record.
  app.post('/v1/field/submissions/sync', async (req) => {
    const user = await requireRole(req, FIELD_ROLES);
    const { items, visits } = parse(
      z.object({
        items: z
          .array(
            z.object({
              clientUuid: z.uuid(),
              leadId: z.string().optional().nullable(),
              capturedAt: z.iso.datetime(),
              gpsAccuracyM: z.number().optional().nullable(),
              payload: z.unknown(),
            }),
          )
          .max(20)
          .default([]),
        visits: z.array(visitSchema).max(50).default([]),
      }),
      req.body,
    );
    const results = [];
    for (const item of items) {
      const existing = await prisma.fieldSubmission.findUnique({ where: { clientUuid: item.clientUuid } });
      if (existing) {
        results.push({ clientUuid: item.clientUuid, id: existing.id, status: existing.status, duplicate: true });
        continue;
      }
      const checked = capturePayload.safeParse(item.payload);
      if (!checked.success) {
        results.push({ clientUuid: item.clientUuid, error: checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
        continue;
      }
      const payload = checked.data;
      if (!payload.photos.some((p) => p.category === 'exterior')) {
        results.push({ clientUuid: item.clientUuid, error: 'A storefront (exterior) photo is required' });
        continue;
      }
      try {
        const photos = [];
        for (const p of payload.photos) {
          const { dataUrl, ...rest } = p;
          if (dataUrl) photos.push({ ...rest, ...(await saveDataUrl(dataUrl)) });
          else if (p.url) photos.push(rest);
        }
        const saved = await prisma.fieldSubmission.create({
          data: {
            agentId: user.id,
            leadId: item.leadId ?? null,
            clientUuid: item.clientUuid,
            payload: { ...payload, photos },
            gpsAccuracyM: item.gpsAccuracyM ?? null,
            capturedAt: new Date(item.capturedAt),
          },
        });
        if (item.leadId) await logVisit(user.id, { leadId: item.leadId, outcome: 'captured', lat: payload.lat, lng: payload.lng }).catch(() => {});
        results.push({ clientUuid: item.clientUuid, id: saved.id, status: saved.status });
      } catch (e) {
        results.push({ clientUuid: item.clientUuid, error: e instanceof Error ? e.message : 'Could not save' });
      }
    }
    const visitResults = [];
    for (const v of visits) {
      try {
        const saved = await logVisit(user.id, v);
        visitResults.push({ clientUuid: v.clientUuid, id: saved.id });
      } catch (e) {
        visitResults.push({ clientUuid: v.clientUuid, error: e instanceof Error ? e.message : 'Could not save' });
      }
    }
    return { results, visits: visitResults };
  });

  app.get('/v1/field/me/submissions', async (req) => {
    const user = await requireRole(req, FIELD_ROLES);
    const rows = await prisma.fieldSubmission.findMany({ where: { agentId: user.id }, orderBy: { syncedAt: 'desc' }, take: 100 });
    return {
      data: rows.map((s) => {
        const p = s.payload as Partial<CapturePayload>;
        return {
          id: s.id,
          clientUuid: s.clientUuid,
          name: p.name,
          addressLine: p.addressLine,
          status: s.status,
          reviewNote: s.reviewNote,
          capturedAt: s.capturedAt,
          restaurantId: s.restaurantId,
          // Sent-back captures can be reopened in the capture form, minus the already-uploaded photos' data.
          payload: s.status === 'sent_back' ? p : undefined,
        };
      }),
    };
  });

  app.get('/v1/field/me/visits', async (req) => {
    const user = await requireRole(req, FIELD_ROLES);
    return {
      data: await prisma.fieldVisit.findMany({
        where: { agentId: user.id },
        include: { lead: { select: { name: true } }, restaurant: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    };
  });

  app.get('/v1/field/me/stats', async (req) => {
    const user = await requireRole(req, FIELD_ROLES);
    const startOfDay = new Date(`${localDate(new Date())}T00:00:00+05:30`);
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const today = new Date(`${localDate(new Date())}T00:00:00Z`);
    const [todayCount, week, approved, sentBack, pending, leads, visitsToday, revisitsDue] = await Promise.all([
      prisma.fieldSubmission.count({ where: { agentId: user.id, capturedAt: { gte: startOfDay } } }),
      prisma.fieldSubmission.count({ where: { agentId: user.id, capturedAt: { gte: weekAgo } } }),
      prisma.fieldSubmission.count({ where: { agentId: user.id, status: 'approved' } }),
      prisma.fieldSubmission.count({ where: { agentId: user.id, status: 'sent_back' } }),
      prisma.fieldSubmission.count({ where: { agentId: user.id, status: 'submitted' } }),
      prisma.lead.count({ where: { assignedToId: user.id, status: 'assigned' } }),
      prisma.fieldVisit.count({ where: { agentId: user.id, createdAt: { gte: startOfDay } } }),
      prisma.fieldVisit.findMany({
        where: { agentId: user.id, outcome: 'revisit', revisitOn: { lte: today } },
        include: { lead: { select: { id: true, name: true, status: true } } },
        orderBy: { revisitOn: 'asc' },
      }),
    ]);
    const decided = approved + sentBack;
    const latestByLead = new Map<string, Date>();
    for (const v of await prisma.fieldVisit.findMany({ where: { agentId: user.id, leadId: { in: revisitsDue.flatMap((r) => (r.leadId ? [r.leadId] : [])) } }, select: { leadId: true, createdAt: true } })) {
      if (v.leadId && (!latestByLead.has(v.leadId) || latestByLead.get(v.leadId)! < v.createdAt)) latestByLead.set(v.leadId, v.createdAt);
    }
    return {
      today: todayCount,
      week,
      approved,
      sentBack,
      pending,
      openLeads: leads,
      visitsToday,
      approvalRate: decided ? Math.round((approved / decided) * 100) : null,
      // A revisit is done once a later visit exists for the same lead.
      revisitsDue: revisitsDue
        .filter((v) => v.lead?.status === 'assigned' && v.leadId && latestByLead.get(v.leadId)?.getTime() === v.createdAt.getTime()).map((v) => ({ id: v.id, leadId: v.leadId, name: v.lead?.name, revisitOn: v.revisitOn, note: v.note })),
      minGpsAccuracyM: MIN_GPS_ACCURACY_M,
    };
  });
}
