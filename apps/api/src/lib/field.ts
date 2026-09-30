import { z } from 'zod';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const mobile = z.string().regex(/^[6-9]\d{9}$/);

/** One place captured by a field agent (spec 7.3). Photos arrive as data URLs and are stored as URLs. Cost is in rupees. */
export const capturePayload = z.object({
  name: z.string().trim().min(2).max(100),
  nameHi: z.string().trim().max(100).optional().nullable(),
  cityId: z.string(),
  localityId: z.string().optional().nullable(),
  addressLine: z.string().trim().min(3).max(200),
  landmark: z.string().trim().max(120).optional().nullable(),
  pincode: z.string().regex(/^\d{6}$/).optional().nullable(),
  lat: z.number(),
  lng: z.number(),
  phone: mobile.optional().nullable(),
  whatsapp: mobile.optional().nullable(),
  typeSlug: z.string().optional().nullable(),
  cuisineSlugs: z.array(z.string()).max(8).default([]),
  attributeKeys: z.array(z.string()).default([]),
  costForTwo: z.number().int().min(0).max(100000).default(0),
  hours: z
    .array(z.object({ dayOfWeek: z.number().int().min(0).max(6), opensAt: hhmm, closesAt: hhmm }))
    .max(28)
    .default([]),
  ownerName: z.string().trim().max(80).optional().nullable(),
  ownerPhone: mobile.optional().nullable(),
  ownerConsent: z.boolean(),
  wantsToManage: z.boolean().default(false),
  notes: z.string().max(1000).optional().nullable(),
  knownFor: z.array(z.string().trim().min(1).max(40)).max(6).default([]),
  photos: z
    .array(
      z.object({
        url: z.string().optional(),
        dataUrl: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        category: z.enum(['food', 'ambience', 'menu', 'exterior']),
        // Where the camera was, read from EXIF on the phone. Kept for QA only, never published (spec 7.3).
        exif: z.object({ lat: z.number().optional(), lng: z.number().optional(), takenAt: z.string().optional() }).optional(),
      }),
    )
    .max(24)
    .default([]),
});

export type CapturePayload = z.infer<typeof capturePayload>;
