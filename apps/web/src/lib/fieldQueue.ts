'use client';

import { createStore, del, get, set, values } from 'idb-keyval';
import { api, errorMessage } from './api';

/** A place captured on the ground, kept on the device until the server accepts it (spec 7.3). */
export type CapturePhoto = {
  dataUrl?: string;
  url?: string;
  width?: number;
  height?: number;
  category: 'food' | 'ambience' | 'menu' | 'exterior';
  /** Camera position from EXIF, for reviewer QA only (spec 7.3). */
  exif?: { lat?: number; lng?: number; takenAt?: string };
};
export type CapturePayload = {
  name: string;
  nameHi: string | null;
  cityId: string;
  localityId: string | null;
  addressLine: string;
  landmark: string | null;
  pincode: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  whatsapp: string | null;
  typeSlug: string | null;
  cuisineSlugs: string[];
  attributeKeys: string[];
  /** Rupees. */
  costForTwo: number;
  knownFor: string[];
  hours: { dayOfWeek: number; opensAt: string; closesAt: string }[];
  ownerName: string | null;
  ownerPhone: string | null;
  ownerConsent: boolean;
  wantsToManage: boolean;
  notes: string | null;
  photos: CapturePhoto[];
};
export type QueuedCapture = {
  clientUuid: string;
  leadId: string | null;
  capturedAt: string;
  gpsAccuracyM: number | null;
  payload: CapturePayload;
  /** Set when the server rejected it; the agent must fix and resave. */
  error?: string;
};
export type VisitOutcome = 'captured' | 'closed' | 'refused' | 'revisit' | 'duplicate' | 'not_found';
export type QueuedVisit = {
  clientUuid: string;
  leadId: string | null;
  restaurantId?: string | null;
  outcome: VisitOutcome;
  revisitOn?: string | null;
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
  createdAt: string;
  error?: string;
};

const queueStore = typeof indexedDB !== 'undefined' ? createStore('tt-field', 'queue') : undefined;
const visitStore = typeof indexedDB !== 'undefined' ? createStore('tt-field-visits', 'visits') : undefined;
const cacheStore = typeof indexedDB !== 'undefined' ? createStore('tt-field-cache', 'cache') : undefined;

export const listQueue = async () => ((await values<QueuedCapture>(queueStore)) ?? []).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
export const getQueued = (id: string) => get<QueuedCapture>(id, queueStore);
export const putQueued = (c: QueuedCapture) => set(c.clientUuid, c, queueStore);
export const removeQueued = (id: string) => del(id, queueStore);

export const listVisits = async () => ((await values<QueuedVisit>(visitStore)) ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const putVisit = (v: QueuedVisit) => set(v.clientUuid, v, visitStore);

/** Last good copy of reference data (filters, leads) for use without signal. */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T; offline: boolean }> {
  try {
    const data = await fetcher();
    await set(key, data, cacheStore);
    return { data, offline: false };
  } catch (e) {
    const data = await get<T>(key, cacheStore);
    if (data !== undefined) return { data, offline: true };
    throw e;
  }
}

type SyncResult = { clientUuid?: string; id?: string; status?: string; duplicate?: boolean; error?: string };

let syncing: Promise<{ sent: number; failed: number }> | null = null;
const isNetworkError = (e: unknown) => e instanceof Error && /Failed to fetch|NetworkError|Load failed/i.test(e.message);

/**
 * Upload queued captures (a few at a time — photos make requests large) and visit outcomes.
 * Safe to call repeatedly: the server dedupes on clientUuid, and concurrent calls share one run.
 */
export function syncQueue(): Promise<{ sent: number; failed: number }> {
  if (syncing) return syncing;
  syncing = (async () => {
    let sent = 0;
    let failed = 0;
    const visits = (await listVisits()).filter((v) => !v.error);
    const pending = (await listQueue()).filter((c) => !c.error);
    const batches = pending.length ? Array.from({ length: Math.ceil(pending.length / 3) }, (_, i) => pending.slice(i * 3, i * 3 + 3)) : [[]];
    for (const [bi, batch] of batches.entries()) {
      const visitBatch = bi === 0 ? visits : [];
      if (!batch.length && !visitBatch.length) continue;
      let r: { results: SyncResult[]; visits: SyncResult[] };
      try {
        r = await api('/v1/field/submissions/sync', {
          method: 'POST',
          body: {
            items: batch.map(({ clientUuid, leadId, capturedAt, gpsAccuracyM, payload }) => ({ clientUuid, leadId, capturedAt, gpsAccuracyM, payload })),
            visits: visitBatch.map(({ clientUuid, leadId, restaurantId, outcome, revisitOn, note, lat, lng }) => ({ clientUuid, leadId, restaurantId, outcome, revisitOn, note, lat, lng })),
          },
        });
      } catch (e) {
        // Network or auth problem: stop and keep everything queued.
        if (isNetworkError(e)) break;
        throw new Error(errorMessage(e));
      }
      for (const res of r.results) {
        const item = batch.find((b) => b.clientUuid === res.clientUuid);
        if (res.error) {
          if (item) await putQueued({ ...item, error: res.error });
          failed++;
        } else {
          await removeQueued(res.clientUuid!);
          sent++;
        }
      }
      for (const res of r.visits ?? []) {
        const v = visitBatch.find((x) => x.clientUuid === res.clientUuid);
        if (!v) continue;
        if (res.error) await putVisit({ ...v, error: res.error });
        else await del(v.clientUuid, visitStore);
      }
    }
    return { sent, failed };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Reads the camera's GPS and time from EXIF before compression strips it (kept for QA only). */
export async function readExif(file: File): Promise<CapturePhoto['exif'] | undefined> {
  try {
    const exifr = (await import('exifr')).default;
    const [gps, meta] = await Promise.all([exifr.gps(file).catch(() => null), exifr.parse(file, ['DateTimeOriginal']).catch(() => null)]);
    const takenAt = meta?.DateTimeOriginal instanceof Date ? meta.DateTimeOriginal.toISOString() : undefined;
    if (!gps && !takenAt) return undefined;
    return { ...(gps ? { lat: gps.latitude, lng: gps.longitude } : {}), ...(takenAt ? { takenAt } : {}) };
  } catch {
    return undefined;
  }
}

/** Shrinks a camera photo to ~1280px JPEG so a day's captures fit on the phone and upload on 3G. */
export async function compressPhoto(file: File, maxSide = 1280, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
