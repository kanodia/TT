import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SavedList } from '@shared/types';
import { RequireAuth } from '@/components/RequireAuth';
import { listName } from '@/components/restaurant/SaveToList';
import { Button, C, Card, Cover, Empty, ErrorNote, Field, Loading, Row, Txt } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

function Lists() {
  const { t, tp } = useSession();
  const brand = useBrand();
  const lists = useApi<{ data: SavedList[] }>('/v1/me/lists');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (lists.loading && !lists.stale) return <Loading />;
  const data = (lists.data ?? lists.stale)?.data ?? [];
  const total = data.reduce((n, l) => n + (l.count ?? 0), 0);
  return (
    <FlatList
      data={data}
      keyExtractor={(l) => l.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={lists.refreshing} onRefresh={lists.refresh} tintColor={brand} colors={[brand]} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Txt v="h1">{t('lists.title')}</Txt>
          <ErrorNote message={error ?? lists.error} onRetry={lists.reload} />
          {total === 0 ? (
            <Empty title={t('lists.emptyTitle')} icon="♡" action={<Button title={t('lists.explore')} onPress={() => router.navigate('/')} />}>
              {t('lists.emptyBody')}
            </Empty>
          ) : null}
        </View>
      }
      renderItem={({ item: l }) => (
        <Card style={{ flex: 1, padding: 0, overflow: 'hidden' }} onPress={() => router.push({ pathname: '/lists/[id]', params: { id: l.id } })}>
          <Cover url={l.cover} seed={l.id} style={{ height: 100 }} rounded={0} />
          <View style={{ padding: 10 }}>
            <Txt bold numberOfLines={1}>
              {listName(l, t)}
            </Txt>
            <Txt v="tiny" muted>
              {tp('places', l.count ?? 0)}
              {l.isPublic ? ` · ${t('lists.public')}` : ''}
            </Txt>
          </View>
        </Card>
      )}
      ListFooterComponent={
        <Row style={{ marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Field placeholder={t('lists.newPlaceholder')} maxLength={60} value={name} onChangeText={setName} />
          </View>
          <Button
            title={`+ ${t('lists.new')}`}
            disabled={!name.trim()}
            onPress={async () => {
              try {
                await api('/v1/me/lists', { method: 'POST', body: { name: name.trim() } });
                setName('');
                lists.reload();
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          />
        </Row>
      }
    />
  );
}

export default function SavedScreen() {
  const { t } = useSession();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: C.bg }}>
      <RequireAuth intro={t('lists.signIn')}>{() => <Lists />}</RequireAuth>
    </View>
  );
}
