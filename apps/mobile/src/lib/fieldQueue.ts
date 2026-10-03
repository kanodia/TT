import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { CapturePayload, QueuedCapture, QueuedVisit } from '@shared/field';
import { api, errorMessage, isNetworkError } from './api';

// Everything the field agent captures lives in SQLite on the phone until the server accepts it
// (spec 7.3 "Offline mode"). Photos are kept inside the payload as JPEG data URLs, so nothing
// depends on cache folders the OS may clear.
const db = SQLite.openDatabaseSync('field.db');
db.execSync(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS captures (client_uuid TEXT PRIMARY KEY NOT NULL, captured_at TEXT NOT NULL, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS visits (client_uuid TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, saved_at TEXT NOT NULL);
`);

type Listener = () => void;
const listeners = new Set<Listener>();
/** Re-render screens when the queue changes (save, sync, delete). */
export function onQueueChange(cb: Listener) {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}
const changed = () => listeners.forEach((cb) => cb());

export const newId = () => Crypto.randomUUID();

export async function listQueue() {
  const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM captures ORDER BY captured_at');
  return rows.map((r) => JSON.parse(r.json) as QueuedCapture);
}
export async function getQueued(id: string) {
  const row = await db.getFirstAsync<{ json: string }>('SELECT json FROM captures WHERE client_uuid = ?', id);
  return row ? (JSON.parse(row.json) as QueuedCapture) : null;
}
export async function putQueued(c: QueuedCapture) {
  await db.runAsync('INSERT OR REPLACE INTO captures (client_uuid, captured_at, json) VALUES (?, ?, ?)', c.clientUuid, c.capturedAt, JSON.stringify(c));
  changed();
}
export async function removeQueued(id: string) {
  await db.runAsync('DELETE FROM captures WHERE client_uuid = ?', id);
  changed();
}

export async function listVisits() {
  const rows = await db.getAllAsync<{ json: string }>('SELECT json FROM visits ORDER BY created_at');
  return rows.map((r) => JSON.parse(r.json) as QueuedVisit);
}
export async function putVisit(v: QueuedVisit) {
  await db.runAsync('INSERT OR REPLACE INTO visits (client_uuid, created_at, json) VALUES (?, ?, ?)', v.clientUuid, v.createdAt, JSON.stringify(v));
  changed();
}
async function removeVisit(id: string) {
  await db.runAsync('DELETE FROM visits WHERE client_uuid = ?', id);
}

/** Last good copy of reference data (filters, leads, areas) for use without signal. */
export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<{ data: T; offline: boolean; savedAt?: string }> {
  try {
    const data = await fetcher();
    await db.runAsync('INSERT OR REPLACE INTO cache (key, json, saved_at) VALUES (?, ?, ?)', key, JSON.stringify(data), new Date().toISOString());
    return { data, offline: false };
  } catch (e) {
    const row = await db.getFirstAsync<{ json: string; saved_at: string }>('SELECT json, saved_at FROM cache WHERE key = ?', key);
    if (row) return { data: JSON.parse(row.json) as T, offline: true, savedAt: row.saved_at };
    throw e;
  }
}

/** Wipes the agent's local data on sign-out so the next person on a shared phone starts clean. */
export async function clearFieldData() {
  await db.execAsync('DELETE FROM captures; DELETE FROM visits; DELETE FROM cache;');
  changed();
}

type SyncResult = { clientUuid?: string; id?: string; status?: string; duplicate?: boolean; error?: string };

let syncing: Promise<{ sent: number; failed: number }> | null = null;

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
    // Up to 3 captures or ~12 MB per request (the API accepts 25 MB), so photo-heavy captures go alone.
    const batches: QueuedCapture[][] = [[]];
    let size = 0;
    for (const c of pending) {
      const n = JSON.stringify(c.payload).length;
      const cur = batches[batches.length - 1];
      if (cur.length && (cur.length >= 3 || size + n > 12_000_000)) {
        batches.push([c]);
        size = n;
      } else {
        cur.push(c);
        size += n;
      }
    }
    for (const [bi, batch] of batches.entries()) {
      const visitBatch = bi === 0 ? visits : [];
      if (!batch.length && !visitBatch.length) continue;
      let r: { results: SyncResult[]; visits: SyncResult[] };
      try {
        r = await api('/v1/field/submissions/sync', {
          method: 'POST',
          timeoutMs: 120_000,
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
        else await removeVisit(v.clientUuid);
      }
    }
    changed();
    return { sent, failed };
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

export type { CapturePayload, QueuedCapture, QueuedVisit };
