import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { SavedList } from '@shared/types';
import { api, errorMessage } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';
import { Button, C, ErrorNote, Field, Loading, Row, Sheet, Txt } from '../ui';

export function listName(l: Pick<SavedList, 'kind' | 'name'>, t: (key: 'lists.favourites' | 'lists.wantToGo') => string) {
  return l.kind === 'favourites' ? t('lists.favourites') : l.kind === 'want_to_go' ? t('lists.wantToGo') : l.name;
}

/** Choose which lists a restaurant is in; create a new list inline (spec 3.4). Mount it only while open. */
export function SaveToList({ open, onClose, restaurantId, initial, onChange }: { open: boolean; onClose: () => void; restaurantId: string; initial: string[]; onChange: (ids: string[]) => void }) {
  const { t, refreshMe } = useSession();
  const brand = useBrand();
  const [lists, setLists] = useState<SavedList[] | null>(null);
  const [inLists, setIn] = useState<string[]>(initial);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ data: SavedList[] }>('/v1/me/lists')
      .then((r) => setLists(r.data))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function toggle(listId: string) {
    const on = inLists.includes(listId);
    const next = on ? inLists.filter((x) => x !== listId) : [...inLists, listId];
    setIn(next);
    try {
      if (on) await api(`/v1/me/lists/${listId}/items/${restaurantId}`, { method: 'DELETE' });
      else await api(`/v1/me/lists/${listId}/items`, { method: 'POST', body: { restaurantId } });
      onChange(next);
      void refreshMe();
    } catch (e) {
      setIn(inLists);
      setError(errorMessage(e));
    }
  }

  async function create() {
    try {
      const l = await api<SavedList>('/v1/me/lists', { method: 'POST', body: { name: name.trim() } });
      setLists([...(lists ?? []), l]);
      setName('');
      await toggle(l.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('lists.saveTo')}>
      <ErrorNote message={error} />
      {!lists ? (
        <Loading />
      ) : (
        lists.map((l) => {
          const on = inLists.includes(l.id);
          return (
            <Pressable key={l.id} onPress={() => toggle(l.id)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <Row gap={10} style={{ paddingVertical: 6 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? brand : C.border, backgroundColor: on ? brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {on ? <Txt v="tiny" color="#fff" bold>✓</Txt> : null}
                </View>
                <Txt style={{ flex: 1 }}>{listName(l, t)}</Txt>
                {l.count != null ? <Txt v="tiny" muted>{l.count}</Txt> : null}
              </Row>
            </Pressable>
          );
        })
      )}
      <Row>
        <View style={{ flex: 1 }}>
          <Field placeholder={t('lists.newPlaceholder')} value={name} onChangeText={setName} maxLength={60} onSubmitEditing={() => name.trim() && create()} />
        </View>
        <Button small kind="outline" title={t('lists.new')} onPress={create} disabled={!name.trim()} />
      </Row>
    </Sheet>
  );
}
