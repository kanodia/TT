import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { QueuedCapture, QueuedVisit } from '@shared/field';
import { errorMessage } from './api';
import { listQueue, listVisits, onQueueChange, syncQueue } from './fieldQueue';
import { useOnline } from './useOnline';

type FieldSync = {
  online: boolean;
  queue: QueuedCapture[];
  visits: QueuedVisit[];
  syncing: boolean;
  /** Last sync outcome for the banner: sent / failed counts or an error message. */
  last: { sent: number; failed: number; error?: string; at: number } | null;
  sync: () => Promise<void>;
};

const Ctx = createContext<FieldSync | null>(null);

/** Shares the phone's pending captures across the field tabs and uploads them whenever there is signal. */
export function FieldSyncProvider({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const [queue, setQueue] = useState<QueuedCapture[]>([]);
  const [visits, setVisits] = useState<QueuedVisit[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [last, setLast] = useState<FieldSync['last']>(null);
  const onlineRef = useRef(online);
  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  const load = useCallback(async () => {
    setQueue(await listQueue());
    setVisits(await listVisits());
  }, []);

  const sync = useCallback(async () => {
    if (!onlineRef.current) return;
    setSyncing(true);
    try {
      const r = await syncQueue();
      if (r.sent || r.failed) setLast({ ...r, at: Date.now() });
    } catch (e) {
      setLast({ sent: 0, failed: 0, error: errorMessage(e), at: Date.now() });
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the queue from SQLite
    void load();
    return onQueueChange(() => void load());
  }, [load]);

  // Upload whenever signal comes back, and when the agent returns to the app.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- uploading to the server is what this effect is for
    if (online) void sync();
  }, [online, sync]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void sync());
    return () => sub.remove();
  }, [sync]);

  const value = useMemo(() => ({ online, queue, visits, syncing, last, sync }), [online, queue, visits, syncing, last, sync]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFieldSync() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFieldSync must be used inside FieldSyncProvider');
  return ctx;
}
