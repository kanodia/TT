import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { ratingColor } from '@shared/format';
import type { MenuSection } from '@shared/types';
import { LoginForm } from '@/components/auth';
import { Stars } from '@/components/restaurant/Reviews';
import { Button, C, Chip, ErrorNote, Field, Row, Txt } from '@/components/ui';
import { api, errorMessage, uploadPhoto } from '@/lib/api';
import { reviewPosted } from '@/lib/events';
import { pickPhotos } from '@/lib/photos';
import { useSession } from '@/lib/session';

const RATING_WORDS: MessageKey[] = ['review.word.1', 'review.word.1', 'review.word.2', 'review.word.3', 'review.word.4', 'review.word.5'];
const ASPECTS = ['food', 'service', 'ambience', 'value'] as const;

function isoDaysAgo(n: number) {
  const d = new Date(Date.now() - n * 864e5);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Write a review: stars, aspects, text, dishes tried, photos (spec 4.5). */
export default function WriteReviewScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { me, t, config } = useSession();
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const [visitType, setVisitType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [visitedOn, setVisitedOn] = useState('');
  const [photos, setPhotos] = useState<{ url: string }[]>([]);
  const [dishIds, setDishIds] = useState<string[]>([]);
  const [dishes, setDishes] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const min = config.reviewRules.minChars;
  const maxPhotos = config.reviewRules.maxPhotos;

  useEffect(() => {
    api<{ sections: MenuSection[] }>(`/v1/restaurants/${id}/menu`)
      .then((m) => setDishes(m.sections.flatMap((s) => s.items.map((i) => ({ id: i.id, name: i.name })))))
      .catch(() => {});
  }, [id]);

  async function addPhotos(source: 'camera' | 'library') {
    setError(null);
    try {
      const picked = await pickPhotos({ source, max: maxPhotos - photos.length, deniedMessage: t('photo.cameraDenied') });
      if (!picked.length) return;
      setUploading(true);
      const added: { url: string }[] = [];
      for (const p of picked) added.push(await uploadPhoto(p.uri));
      setPhotos((cur) => [...cur, ...added]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ held: boolean }>(`/v1/restaurants/${id}/reviews`, {
        method: 'POST',
        body: {
          rating,
          text: text.trim(),
          visitType,
          ...(visitedOn ? { visitedOn } : {}),
          photos,
          dishIds,
          ...Object.fromEntries(ASPECTS.filter((a) => aspects[a]).map((a) => [`${a}Rating`, aspects[a]])),
        },
      });
      reviewPosted.emit({ restaurantId: id, held: r.held });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const short = text.trim().length < min;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: name ? t('review.writeTitle', { name }) : t('review.write') }} />
      {!me ? (
        <LoginForm intro={t('review.signIn')} />
      ) : (
        <>
          <ErrorNote message={error} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <Stars value={rating} onChange={setRating} size={40} />
            <Txt v="small" bold color={ratingColor(rating)} style={{ height: 20 }}>
              {rating ? t(RATING_WORDS[rating]) : ''}
            </Txt>
          </View>
          <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 12, gap: 8 }}>
            {ASPECTS.map((a) => (
              <Row key={a} style={{ justifyContent: 'space-between' }}>
                <Txt v="small" muted>
                  {t(`review.aspect.${a}`)}
                </Txt>
                <Stars value={aspects[a] ?? 0} onChange={(v) => setAspects({ ...aspects, [a]: v })} size={22} />
              </Row>
            ))}
          </View>
          <Row style={{ flexWrap: 'wrap' }}>
            {(['dine_in', 'takeaway'] as const).map((v) => (
              <Chip key={v} label={v === 'dine_in' ? `🍽️ ${t('review.dinedIn')}` : `🥡 ${t('review.takeaway')}`} on={visitType === v} onPress={() => setVisitType(v)} />
            ))}
          </Row>
          <View style={{ gap: 6 }}>
            <Txt v="small" bold>
              {t('review.visitedOn')}
            </Txt>
            <Row style={{ flexWrap: 'wrap' }}>
              {[
                ['', t('review.visited.skip')],
                [isoDaysAgo(0), t('review.visited.today')],
                [isoDaysAgo(1), t('review.visited.yesterday')],
                [isoDaysAgo(7), t('review.visited.lastWeek')],
              ].map(([v, label]) => (
                <Chip key={label} label={label} on={visitedOn === v} onPress={() => setVisitedOn(v)} />
              ))}
            </Row>
          </View>
          <View>
            <Field label={t('review.yourReview')} placeholder={t('review.placeholder')} value={text} onChangeText={setText} multiline maxLength={3000} style={{ minHeight: 140 }} />
            <Txt v="tiny" color={short ? C.muted : C.good} style={{ marginTop: 4 }}>
              {short ? t('review.moreChars', { n: min - text.trim().length }) : `${text.length}/3000`}
            </Txt>
          </View>
          {dishes.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Txt v="small" bold>
                {t('review.dishesTried')}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {dishes.slice(0, 40).map((d) => (
                  <Chip
                    key={d.id}
                    label={d.name}
                    on={dishIds.includes(d.id)}
                    onPress={() => setDishIds(dishIds.includes(d.id) ? dishIds.filter((x) => x !== d.id) : dishIds.length < 10 ? [...dishIds, d.id] : dishIds)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <View style={{ gap: 6 }}>
            <Txt v="small" bold>
              {t('review.photos', { max: maxPhotos })}
            </Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {photos.map((p, i) => (
                <View key={p.url}>
                  <Image source={p.url} style={{ width: 72, height: 72, borderRadius: 8 }} />
                  <Pressable
                    onPress={() => setPhotos(photos.filter((_, j) => j !== i))}
                    hitSlop={8}
                    style={{ position: 'absolute', top: -6, right: -6, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                    accessibilityLabel={t('action.remove')}
                  >
                    <Text style={{ color: '#fff', fontSize: 11 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
            {photos.length < maxPhotos ? (
              <Row>
                <Button small kind="outline" icon="📷" title={t('photo.camera')} onPress={() => addPhotos('camera')} busy={uploading} />
                <Button small kind="outline" icon="🖼️" title={t('photo.gallery')} onPress={() => addPhotos('library')} disabled={uploading} />
              </Row>
            ) : null}
            <Txt v="tiny" muted>
              {t('review.photosNote')}
            </Txt>
          </View>
          <Button title={busy ? t('review.posting') : t('review.post')} onPress={submit} busy={busy} disabled={uploading || !rating || short} />
          <Txt v="tiny" muted style={{ textAlign: 'center' }}>
            {t('review.honesty')}
          </Txt>
        </>
      )}
    </ScrollView>
  );
}
