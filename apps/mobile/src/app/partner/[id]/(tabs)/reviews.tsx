import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { ago } from '@shared/format';
import type { Review } from '@shared/types';
import { usePartner } from '@/components/partner/context';
import { Button, C, Card, Chip, Empty, ErrorNote, Field, Loading, RatingBadge, Row, Sheet, Txt, useFlash } from '@/components/ui';
import { api, errorMessage, media } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type ReviewLike = Omit<Review, 'photos' | 'dishes'>;
type PartnerReview = ReviewLike & { photos: { photo: { id: string; url: string } }[]; dishes: { menuItem: { name: string } }[] };

function ReplyBox({ review, onSaved }: { review: ReviewLike; onSaved: () => void }) {
  const { t } = useSession();
  const brand = useBrand();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(review.reply?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/partner/reviews/${review.id}/reply`, { method: 'PUT', body: { text: text.trim() } });
      setOpen(false);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return review.reply ? (
      <View style={{ backgroundColor: C.surface, borderLeftWidth: 3, borderLeftColor: `${brand}66`, borderRadius: 8, padding: 10, gap: 2 }}>
        <Txt v="tiny" bold>
          {t('preview.yourReply', { when: ago(review.reply.createdAt, t) })}
        </Txt>
        <Txt v="small">{review.reply.text}</Txt>
        <Pressable onPress={() => setOpen(true)} hitSlop={8}>
          <Txt v="tiny" color={brand}>
            {t('preview.editReply')}
          </Txt>
        </Pressable>
      </View>
    ) : (
      <Button small kind="outline" icon="↩" title={t('preview.reply')} onPress={() => setOpen(true)} style={{ alignSelf: 'flex-start' }} />
    );
  }
  return (
    <View style={{ gap: 8 }}>
      <ErrorNote message={error} />
      <Field multiline value={text} onChangeText={setText} maxLength={1000} autoFocus placeholder={review.rating <= 2 ? t('preview.placeholderLow') : t('preview.placeholderHigh')} />
      <Row>
        <Button small title={busy ? t('review.posting') : t('preview.post')} onPress={save} busy={busy} disabled={text.trim().length < 2} />
        <Button small kind="ghost" title={t('action.cancel')} onPress={() => setOpen(false)} />
      </Row>
      <Txt v="tiny" muted>
        {t('preview.public')}
      </Txt>
    </View>
  );
}

function ReportSheet({ review, onClose, onDone }: { review: ReviewLike | null; onClose: () => void; onDone: () => void }) {
  const { t } = useSession();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open={!!review} onClose={onClose} title={t('report.title.review')}>
      <ErrorNote message={error} />
      <Txt v="small" muted>
        {t('preview.reportNote')}
      </Txt>
      <Row style={{ flexWrap: 'wrap' }}>
        {['fake', 'offensive', 'spam', 'other'].map((r) => (
          <Chip key={r} label={t(`report.reason.review.${r}` as MessageKey)} on={reason === r} onPress={() => setReason(r)} />
        ))}
      </Row>
      <Field multiline maxLength={1000} placeholder={t('report.detailsPlaceholder')} value={details} onChangeText={setDetails} />
      <Button
        title={t('report.send')}
        disabled={!reason}
        onPress={async () => {
          try {
            await api(`/v1/partner/reviews/${review!.id}/report`, { method: 'POST', body: { reason, ...(details.trim() ? { details: details.trim() } : {}) } });
            setReason('');
            setDetails('');
            onDone();
            onClose();
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </Sheet>
  );
}

/** Reviews: reply publicly, filter to what needs a reply, report fakes (spec 5.2). Diners' text can't be edited. */
export default function PartnerReviews() {
  const { restaurant: r, can } = usePartner();
  const { t, tp } = useSession();
  const brand = useBrand();
  const [rating, setRating] = useState<number | null>(null);
  const [unreplied, setUnreplied] = useState(false);
  const [reporting, setReporting] = useState<ReviewLike | null>(null);
  const reviews = useApi<{ data: PartnerReview[] }>(can('reviews') ? `/v1/partner/restaurants/${r.id}/reviews` : null, { rating, unreplied: unreplied ? '1' : undefined });
  const [flash, setFlash] = useFlash();
  const list = (reviews.data ?? reviews.stale)?.data;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <FlatList
        data={list ?? []}
        keyExtractor={(rv) => rv.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={reviews.refreshing} onRefresh={reviews.refresh} tintColor={brand} colors={[brand]} />}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Txt v="small" muted>
              {r.avgRating > 0 ? t('preview.average', { r: r.avgRating.toFixed(1) }) : t('preview.noRating')} · {tp('reviews', r.reviewCount)}
            </Txt>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip label={t('preview.needsReply')} on={unreplied} onPress={() => setUnreplied(!unreplied)} />
              {[5, 4, 3, 2, 1].map((n) => (
                <Chip key={n} label={`${n}★`} on={rating === n} onPress={() => setRating(rating === n ? null : n)} />
              ))}
            </ScrollView>
            <Txt v="tiny" muted>
              {t('preview.cantEdit')}
            </Txt>
            <ErrorNote message={reviews.error} onRetry={reviews.reload} />
            {reviews.loading && !list ? <Loading /> : null}
          </View>
        }
        ListEmptyComponent={
          list ? (
            <Empty title={unreplied ? t('preview.caughtUp') : t('review.noneYet')} icon="💬">
              {unreplied ? t('preview.caughtUpBody') : t('preview.askForReviews')}
            </Empty>
          ) : null
        }
        renderItem={({ item: rv }) => (
          <Card style={{ gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt v="small" bold style={{ flex: 1 }}>
                {rv.user.name ?? t('review.anon')} <Txt v="small" muted>· {ago(rv.createdAt, t)}</Txt>
              </Txt>
              <RatingBadge rating={rv.rating} />
            </Row>
            <Txt v="small">{rv.text}</Txt>
            {rv.photos.length ? (
              <Row>
                {rv.photos.map((p) => (
                  <Image key={p.photo.id} source={media(p.photo.url, 'sm')} style={{ width: 60, height: 60, borderRadius: 8 }} />
                ))}
              </Row>
            ) : null}
            {rv.dishes.length ? (
              <Txt v="tiny" muted>
                🍴 {t('review.tried', { list: rv.dishes.map((d) => d.menuItem.name).join(', ') })}
              </Txt>
            ) : null}
            <ReplyBox
              review={rv}
              onSaved={() => {
                setFlash(t('preview.replied'));
                reviews.reload();
              }}
            />
            <Pressable onPress={() => setReporting(rv)} hitSlop={8}>
              <Txt v="tiny" muted style={{ textDecorationLine: 'underline' }}>
                🚩 {t('preview.reportAbuse')}
              </Txt>
            </Pressable>
          </Card>
        )}
      />
      <ReportSheet review={reporting} onClose={() => setReporting(null)} onDone={() => setFlash(t('report.thanks'))} />
      {flash}
    </View>
  );
}
