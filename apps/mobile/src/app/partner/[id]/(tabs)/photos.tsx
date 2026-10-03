import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { humanize } from '@shared/format';
import type { Photo } from '@shared/types';
import { usePartner } from '@/components/partner/context';
import { Button, C, Chip, Cover, Empty, ErrorNote, Field, Loading, Row, Sheet, Txt, useFlash } from '@/components/ui';
import { api, errorMessage, uploadPhoto } from '@/lib/api';
import { pickPhotos } from '@/lib/photos';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

const CATEGORIES = ['food', 'ambience', 'exterior', 'menu'] as const;

/** Photos straight from the camera; set the cover, recategorise, delete; flag bad diner photos (spec 5.2). */
export default function PartnerPhotos() {
  const { restaurant: r } = usePartner();
  const { t } = useSession();
  const brand = useBrand();
  const { width } = useWindowDimensions();
  const size = (width - 32 - 10) / 2;
  const photos = useApi<{ data: Photo[] }>(`/v1/partner/restaurants/${r.id}/photos`);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('food');
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<Photo | null>(null);
  const [flagNote, setFlagNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const base = `/v1/partner/restaurants/${r.id}/photos`;

  async function run(fn: () => Promise<unknown>, msg: string) {
    setError(null);
    try {
      await fn();
      setFlash(msg);
      photos.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function add(source: 'camera' | 'library') {
    setError(null);
    try {
      const picked = await pickPhotos({ source, max: 10, deniedMessage: t('photo.cameraDenied') });
      if (!picked.length) return;
      setUploading(true);
      for (const p of picked) {
        const u = await uploadPhoto(p.uri);
        await api(base, { method: 'POST', body: { url: u.url, width: p.width, height: p.height, category } });
      }
      setFlash(t('photosEd.added'));
      photos.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  const list = (photos.data ?? photos.stale)?.data;
  if (!list) return photos.error ? <ErrorNote message={photos.error} onRetry={photos.reload} style={{ margin: 16 }} /> : <Loading />;
  const own = list.filter((p) => p.source !== 'diner');
  const diner = list.filter((p) => p.source === 'diner');
  const tile = (p: Photo) => (
    <Pressable key={p.id} onPress={() => setEditing(p)} accessibilityRole="button">
      <Cover url={p.url} seed={p.id} size="sm" style={{ width: size, height: size }} rounded={10} />
      {p.isCover ? (
        <View style={{ position: 'absolute', top: 6, left: 6, backgroundColor: brand, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}>
          <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>{t('photosEd.cover')}</Text>
        </View>
      ) : null}
      <View style={{ position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 5 }}>
        <Text style={{ color: '#fff', fontSize: 10 }}>
          {t(`photos.cat.${p.category}` as MessageKey)}
          {p.status !== 'approved' ? ` · ${humanize(p.status)}` : ''}
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} refreshControl={<RefreshControl refreshing={photos.refreshing} onRefresh={photos.refresh} tintColor={brand} colors={[brand]} />}>
        <View style={{ gap: 8 }}>
          <Txt v="small" bold>
            {t('photosEd.addOf')}
          </Txt>
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            {CATEGORIES.map((c) => (
              <Chip key={c} label={t(`photos.cat.${c}` as MessageKey)} on={category === c} onPress={() => setCategory(c)} />
            ))}
          </Row>
          <Row>
            <Button style={{ flex: 1 }} icon="📷" title={t('photo.camera')} onPress={() => add('camera')} busy={uploading} />
            <Button style={{ flex: 1 }} kind="outline" icon="🖼️" title={t('photo.gallery')} onPress={() => add('library')} disabled={uploading} />
          </Row>
          <Txt v="tiny" muted>
            {t('photosEd.tip')}
          </Txt>
        </View>
        <ErrorNote message={error} />
        {own.length === 0 ? (
          <Empty title={t('photos.emptyTitle')} icon="📷">
            {t('photosEd.emptyBody')}
          </Empty>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{own.map(tile)}</View>
        )}
        {diner.length ? (
          <View style={{ gap: 8 }}>
            <Txt v="h3">{t('photosEd.fromDiners')}</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{diner.map(tile)}</View>
          </View>
        ) : null}
      </ScrollView>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? t(`photos.cat.${editing.category}` as MessageKey) : ''}>
        {editing ? (
          <>
            <Cover url={editing.url} seed={editing.id} size="md" style={{ height: 200 }} />
            {editing.source === 'diner' ? (
              <>
                <Txt v="small" muted>
                  {t('photosEd.byDiner')}
                </Txt>
                <Field placeholder={t('photosEd.flagWhy')} value={flagNote} onChangeText={setFlagNote} maxLength={300} />
                <Button
                  kind="outline"
                  title={`🚩 ${t('photosEd.flag')}`}
                  onPress={async () => {
                    await run(() => api(`${base}/${editing.id}/flag`, { method: 'POST', body: flagNote.trim() ? { details: flagNote.trim() } : {} }), t('photosEd.flagged'));
                    setFlagNote('');
                    setEditing(null);
                  }}
                />
              </>
            ) : (
              <>
                <Txt v="small" bold>
                  {t('photosEd.category')}
                </Txt>
                <Row style={{ flexWrap: 'wrap' }} gap={6}>
                  {CATEGORIES.map((c) => (
                    <Chip
                      key={c}
                      label={t(`photos.cat.${c}` as MessageKey)}
                      on={editing.category === c}
                      onPress={async () => {
                        await run(() => api(`${base}/${editing.id}`, { method: 'PATCH', body: { category: c } }), t('photosEd.updated'));
                        setEditing({ ...editing, category: c });
                      }}
                    />
                  ))}
                </Row>
                {!editing.isCover && editing.status === 'approved' ? (
                  <Button
                    kind="outline"
                    title={t('photosEd.makeCover')}
                    onPress={async () => {
                      await run(() => api(`${base}/${editing.id}`, { method: 'PATCH', body: { isCover: true } }), t('photosEd.coverSet'));
                      setEditing(null);
                    }}
                  />
                ) : null}
                <Button
                  kind="ghost"
                  title={t('action.delete')}
                  onPress={() =>
                    Alert.alert(t('photosEd.confirmDelete'), '', [
                      { text: t('action.cancel'), style: 'cancel' },
                      {
                        text: t('action.delete'),
                        style: 'destructive',
                        onPress: async () => {
                          await run(() => api(`${base}/${editing.id}`, { method: 'DELETE' }), t('photosEd.deleted'));
                          setEditing(null);
                        },
                      },
                    ])
                  }
                />
              </>
            )}
          </>
        ) : null}
      </Sheet>
      {flash}
    </View>
  );
}
