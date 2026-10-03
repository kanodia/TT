import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { ago, ratingColor } from '@shared/format';
import type { Detail, Review } from '@shared/types';
import { api, errorMessage, media, track } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';
import { Button, C, Chip, Divider, Empty, ErrorNote, Field, Loading, Note, RatingBadge, Row, Txt } from '../ui';

type Page = { data: Review[]; total: number; nextCursor: string | null; summary: string | null };
const ASPECTS = ['food', 'service', 'ambience', 'value'] as const;

export function Stars({ value, onChange, size = 28 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <Row gap={size > 20 ? 6 : 2}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange?.(n)} disabled={!onChange} hitSlop={4} accessibilityRole={onChange ? 'button' : undefined} accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`}>
          <Text style={{ fontSize: size, color: n <= value ? ratingColor(value) : '#d1d5db' }}>★</Text>
        </Pressable>
      ))}
    </Row>
  );
}

function ReviewItem({ review, onReport, onPhoto }: { review: Review; onReport: () => void; onPhoto: (urls: string[], i: number) => void }) {
  const { me, t } = useSession();
  const brand = useBrand();
  const [helpful, setHelpful] = useState({ on: !!review.votedHelpful, count: review.helpfulCount });
  const [expanded, setExpanded] = useState(false);

  async function vote() {
    if (!me) return router.push('/login');
    try {
      const r = await api<{ helpful: boolean; helpfulCount: number }>(`/v1/reviews/${review.id}/helpful`, { method: 'POST' });
      setHelpful({ on: r.helpful, count: r.helpfulCount });
    } catch {
      /* ignore */
    }
  }

  const long = review.text.length > 320;
  const name = review.user.name ?? t('review.anon');
  const photos = review.photos ?? [];
  const aspects = ASPECTS.map((a) => [a, review[`${a}Rating`]] as const).filter(([, v]) => v);
  return (
    <View style={{ paddingVertical: 16, gap: 8 }}>
      <Row gap={10}>
        {review.user.avatarUrl ? (
          <Image source={media(review.user.avatarUrl, 'sm')} style={{ width: 36, height: 36, borderRadius: 18 }} />
        ) : (
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: `${brand}1a`, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: brand, fontWeight: '700' }}>{name.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Txt v="small" bold>
            {name}
            {review.user.level ? <Text style={{ color: C.muted, fontWeight: '400' }}>  · {t('review.level', { n: review.user.level, count: review.user.reviewCount ?? 0 })}</Text> : null}
          </Txt>
          <Txt v="tiny" muted>
            {ago(review.createdAt, t)} · {review.visitType === 'takeaway' ? t('review.takeaway') : t('review.dinedIn')}
          </Txt>
        </View>
        <RatingBadge rating={review.rating} />
      </Row>
      {aspects.length ? (
        <Txt v="tiny" muted>
          {aspects.map(([a, v]) => `${t(`review.aspect.${a}` as MessageKey)} ${v}★`).join('   ')}
        </Txt>
      ) : null}
      <Txt v="small">
        {long && !expanded ? `${review.text.slice(0, 320)}… ` : `${review.text} `}
        {long ? (
          <Text style={{ color: brand }} onPress={() => setExpanded(!expanded)}>
            {expanded ? t('review.less') : t('review.more')}
          </Text>
        ) : null}
      </Txt>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {photos.map((p, i) => (
            <Pressable key={p.id} onPress={() => onPhoto(photos.map((x) => x.url), i)}>
              <Image source={media(p.url, 'sm')} style={{ width: 76, height: 76, borderRadius: 8 }} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {review.dishes?.length ? (
        <Txt v="tiny" muted>
          🍴 {t('review.tried', { list: review.dishes.map((d) => d.name).join(', ') })}
        </Txt>
      ) : null}
      {review.reply ? (
        <View style={{ backgroundColor: C.surface, borderLeftWidth: 3, borderLeftColor: `${brand}66`, borderRadius: 8, padding: 10, gap: 2 }}>
          <Txt v="tiny" bold>
            {t('review.ownerReply', { when: ago(review.reply.createdAt, t) })}
          </Txt>
          <Txt v="small">{review.reply.text}</Txt>
        </View>
      ) : null}
      <Row gap={20}>
        <Pressable onPress={vote} hitSlop={8} accessibilityRole="button" accessibilityState={{ selected: helpful.on }}>
          <Txt v="tiny" bold={helpful.on} color={helpful.on ? brand : C.muted}>
            👍 {t('review.helpful')}
            {helpful.count ? ` (${helpful.count})` : ''}
          </Txt>
        </Pressable>
        <Pressable onPress={onReport} hitSlop={8}>
          <Txt v="tiny" muted>
            {t('review.report')}
          </Txt>
        </Pressable>
      </Row>
    </View>
  );
}

/** Rating breakdown, AI summary, sort/filter and the review list (spec 4.5). */
export function Reviews({ restaurant, onReport, onWrite, onPhoto, version }: { restaurant: Detail; onReport: (id: string) => void; onWrite: () => void; onPhoto: (urls: string[], i: number) => void; version: number }) {
  const { t, tp } = useSession();
  const [sort, setSort] = useState('relevant');
  const [star, setStar] = useState<number | null>(null);
  const [withPhotos, setWithPhotos] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [q, setQ] = useState('');
  const [pages, setPages] = useState<{ key: string; items: Review[]; next: string | null; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const key = `${sort}|${star}|${withPhotos}|${q}|${version}|${retry}`;
  const query = { sort, rating: star, with_photos: withPhotos ? 1 : undefined, q: q || undefined, limit: 10 };

  useEffect(() => {
    let live = true;
    api<Page>(`/v1/restaurants/${restaurant.id}/reviews`, { query })
      .then((r) => live && setPages({ key, items: r.data, next: r.nextCursor, total: r.total }))
      .catch((e) => live && setError({ key, message: errorMessage(e) }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, restaurant.id]);

  const firstLoading = pages?.key !== key && error?.key !== key;

  async function more() {
    if (!pages?.next) return;
    setBusy(true);
    try {
      const r = await api<Page>(`/v1/restaurants/${restaurant.id}/reviews`, { query: { ...query, cursor: pages.next } });
      setPages({ ...pages, items: [...pages.items, ...r.data], next: r.nextCursor });
    } catch (e) {
      setError({ key, message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const bd = restaurant.ratingBreakdown;
  const max = Math.max(1, ...bd);
  const aspects = Object.entries(restaurant.aspectRatings).filter(([, v]) => v != null) as [(typeof ASPECTS)[number], number][];

  return (
    <View style={{ gap: 16 }}>
      <Row gap={16}>
        <View style={{ alignItems: 'center' }}>
          <Txt style={{ fontSize: 34, fontWeight: '700', lineHeight: 40 }}>{restaurant.rating > 0 ? restaurant.rating.toFixed(1) : '–'}</Txt>
          <Stars value={Math.round(restaurant.rating)} size={13} />
          <Txt v="tiny" muted>
            {tp('reviews', restaurant.reviewCount)}
          </Txt>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          {[5, 4, 3, 2, 1].map((n) => (
            <Pressable key={n} onPress={() => setStar(star === n ? null : n)} accessibilityLabel={t('review.onlyStars', { n })}>
              <Row gap={6}>
                <Txt v="tiny" bold={star === n} style={{ width: 10 }}>
                  {n}
                </Txt>
                <View style={{ flex: 1, height: 7, borderRadius: 4, backgroundColor: C.surface, overflow: 'hidden' }}>
                  <View style={{ width: `${(bd[n - 1] / max) * 100}%`, height: '100%', borderRadius: 4, backgroundColor: ratingColor(n) }} />
                </View>
                <Txt v="tiny" muted style={{ width: 24, textAlign: 'right' }}>
                  {bd[n - 1]}
                </Txt>
              </Row>
            </Pressable>
          ))}
        </View>
      </Row>
      {aspects.length ? (
        <Row style={{ flexWrap: 'wrap', backgroundColor: C.surface, borderRadius: 10, padding: 10 }} gap={14}>
          {aspects.map(([k, v]) => (
            <Txt key={k} v="small">
              <Text style={{ color: C.muted }}>{t(`review.aspect.${k}`)} </Text>
              <Text style={{ fontWeight: '600' }}>{v.toFixed(1)} ★</Text>
            </Txt>
          ))}
        </Row>
      ) : null}
      <Button
        icon="✍️"
        title={t('review.write')}
        onPress={() => {
          track('detail_tab_view', restaurant.id, { tab: 'write_review' });
          onWrite();
        }}
      />
      {restaurant.reviewSummary ? (
        <Note tone="warn">
          <Txt v="tiny" bold color="#92400e">
            ✨ {t('review.summaryTitle').toUpperCase()}
          </Txt>
          <Txt v="small" style={{ marginTop: 4 }}>
            {restaurant.reviewSummary}
          </Txt>
        </Note>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(['relevant', 'newest', 'highest', 'lowest'] as const).map((k) => (
          <Chip key={k} label={t(`review.sort.${k}`)} on={sort === k} onPress={() => setSort(k)} />
        ))}
        <Chip label={`📷 ${t('review.withPhotos')}`} on={withPhotos} onPress={() => setWithPhotos(!withPhotos)} />
        {star ? <Chip on label={`${t('review.onlyStars', { n: star })} ×`} onPress={() => setStar(null)} /> : null}
      </ScrollView>
      <Field placeholder={t('review.keyword')} value={keyword} onChangeText={setKeyword} onSubmitEditing={() => setQ(keyword.trim())} onBlur={() => setQ(keyword.trim())} returnKeyType="search" />
      <ErrorNote message={error?.key === key ? error.message : null} onRetry={() => setRetry((n) => n + 1)} />
      {pages && pages.key === key && pages.items.length === 0 ? (
        <Empty title={star || withPhotos || q ? t('review.noneMatch') : t('review.noneYet')} icon="💬">
          {t('review.beFirst')}
        </Empty>
      ) : null}
      <View>
        {pages?.items.map((r, i) => (
          <View key={r.id}>
            {i > 0 ? <Divider /> : null}
            <ReviewItem review={r} onReport={() => onReport(r.id)} onPhoto={onPhoto} />
          </View>
        ))}
      </View>
      {busy || firstLoading ? <Loading /> : null}
      {pages?.key === key && pages.next && !busy ? <Button kind="outline" title={t('review.showMore')} onPress={more} /> : null}
    </View>
  );
}
