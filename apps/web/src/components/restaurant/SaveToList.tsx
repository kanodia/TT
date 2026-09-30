'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { SavedList } from '@/lib/types';
import { ErrorNote, Loading, Modal } from '../ui';

export const listName = (l: Pick<SavedList, 'kind' | 'name'>, t: ReturnType<typeof useSession>['t']) =>
  l.kind === 'want_to_go' ? t('lists.wantToGo') : l.kind === 'favourites' ? t('lists.favourites') : l.name;

/** Pick which personal lists a restaurant belongs to (spec 3.4). */
export function SaveToList({ open, onClose, restaurantId, initial, onChange }: { open: boolean; onClose: () => void; restaurantId: string; initial: string[]; onChange: (ids: string[]) => void }) {
  const { t, refreshMe } = useSession();
  const [lists, setLists] = useState<SavedList[] | null>(null);
  const [inLists, setInLists] = useState<string[]>(initial);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<{ data: SavedList[] }>('/v1/me/lists')
      .then((r) => setLists(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, [open]);

  async function toggle(listId: string) {
    const on = inLists.includes(listId);
    const next = on ? inLists.filter((x) => x !== listId) : [...inLists, listId];
    setInLists(next);
    try {
      if (on) await api(`/v1/me/lists/${listId}/items/${restaurantId}`, { method: 'DELETE' });
      else await api(`/v1/me/lists/${listId}/items`, { method: 'POST', body: { restaurantId } });
      onChange(next);
      void refreshMe();
    } catch (e) {
      setInLists(inLists);
      setError(errorMessage(e));
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      const l = await api<SavedList>('/v1/me/lists', { method: 'POST', body: { name: name.trim() } });
      setLists([...(lists ?? []), l]);
      setName('');
      await toggle(l.id);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('lists.saveTo')}>
      <ErrorNote message={error} />
      {!lists ? (
        <Loading />
      ) : (
        <div className="space-y-3">
          <ul className="divide-y divide-border">
            {lists.map((l) => (
              <li key={l.id}>
                <label className="flex cursor-pointer items-center gap-3 py-2.5">
                  <input type="checkbox" checked={inLists.includes(l.id)} onChange={() => toggle(l.id)} className="h-4 w-4 accent-[var(--brand)]" />
                  <span className="flex-1 text-sm font-medium">{listName(l, t)}</span>
                  <span className="text-xs text-muted">{l.count}</span>
                </label>
              </li>
            ))}
          </ul>
          <form onSubmit={create} className="flex gap-2">
            <input className="input" placeholder={t('lists.newPlaceholder')} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn-outline shrink-0" disabled={!name.trim()}>
              + {t('lists.new')}
            </button>
          </form>
        </div>
      )}
    </Modal>
  );
}
