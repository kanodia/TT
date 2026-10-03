import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, FlatList, Pressable, Share, Switch, View } from 'react-native';
import type { Card as CardT, SavedList } from '@shared/types';
import { RestaurantCard } from '@/components/RestaurantCard';
import { listName } from '@/components/restaurant/SaveToList';
import { Button, C, Empty, ErrorNote, Field, Loading, Row, Sheet, Txt } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/env';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

/** One saved list: share it, rename, delete, remove places (spec 3.4). */
export default function ListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { place, t, tp, config, refreshMe } = useSession();
  const brand = useBrand();
  const list = useApi<SavedList & { items: CardT[] }>(`/v1/me/lists/${id}`, { lat: place.lat, lng: place.lng });
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const l = list.data ?? list.stale;

  async function patch(body: Record<string, unknown>) {
    setError(null);
    try {
      await api(`/v1/me/lists/${id}`, { method: 'PATCH', body });
      list.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  if (list.loading && !l) return <Loading />;
  if (!l) return <ErrorNote message={list.error} onRetry={list.reload} style={{ margin: 16 }} />;
  const webBase = config.brand.webDomain ? `https://${config.brand.webDomain}` : WEB_URL;
  return (
    <>
      <Stack.Screen options={{ title: listName(l, t) }} />
      <FlatList
        data={l.items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 48 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <ErrorNote message={error} />
            <Txt muted>{tp('places', l.items.length)}</Txt>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt>{t('lists.shareable')}</Txt>
              <Switch value={l.isPublic} onValueChange={(v) => patch({ isPublic: v })} trackColor={{ true: brand }} />
            </Row>
            {l.isPublic ? (
              <Button kind="outline" icon="↗" title={t('detail.share')} onPress={() => Share.share({ message: `${listName(l, t)} — ${webBase}/lists/${l.shareSlug}` })} />
            ) : (
              <Txt v="tiny" muted>
                {t('lists.notShared')}
              </Txt>
            )}
            {l.kind === 'custom' ? (
              <Row>
                <Button small kind="outline" title={t('lists.rename')} onPress={() => setRenaming(l.name)} />
                <Button
                  small
                  kind="ghost"
                  title={t('action.delete')}
                  onPress={() =>
                    Alert.alert(t('lists.confirmDelete'), '', [
                      { text: t('action.cancel'), style: 'cancel' },
                      {
                        text: t('action.delete'),
                        style: 'destructive',
                        onPress: async () => {
                          await api(`/v1/me/lists/${id}`, { method: 'DELETE' }).catch((e) => setError(errorMessage(e)));
                          void refreshMe();
                          router.back();
                        },
                      },
                    ])
                  }
                />
              </Row>
            ) : null}
          </View>
        }
        ListEmptyComponent={<Empty icon="♡" title={t('lists.emptyList')} />}
        renderItem={({ item, index }) => (
          <View>
            <RestaurantCard r={item} position={index} from="list" />
            <Pressable
              hitSlop={8}
              style={{ marginTop: 6 }}
              onPress={async () => {
                await api(`/v1/me/lists/${id}/items/${item.id}`, { method: 'DELETE' }).catch(() => {});
                list.reload();
                void refreshMe();
              }}
            >
              <Txt v="small" color={C.muted} style={{ textDecorationLine: 'underline' }}>
                {t('lists.removeFrom')}
              </Txt>
            </Pressable>
          </View>
        )}
      />
      <Sheet open={renaming != null} onClose={() => setRenaming(null)} title={t('lists.rename')}>
        <Field value={renaming ?? ''} onChangeText={setRenaming} maxLength={60} autoFocus />
        <Button
          title={t('action.save')}
          disabled={!renaming?.trim()}
          onPress={async () => {
            await patch({ name: renaming!.trim() });
            setRenaming(null);
          }}
        />
      </Sheet>
    </>
  );
}
