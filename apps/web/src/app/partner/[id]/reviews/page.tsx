'use client';

import { useState } from 'react';
import { NoAccess, usePartner } from '@/components/partner/context';
import { Empty, ErrorNote, Loading, Modal, RatingBadge, useFlash } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, errorMessage, media } from '@/lib/api';
import { ago } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Review } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type ReviewLike = Omit<Review, 'photos' | 'dishes'>;
type PartnerReview = ReviewLike & { photos: { photo: { id: string; url: string } }[]; dishes: { menuItem: { name: string } }[] };

function ReplyBox({ review, onSaved }: { review: ReviewLike; onSaved: () => void }) {
  const { t } = useSession();
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
      <div className="mt-3 rounded-lg border-l-4 border-brand/40 bg-surface px-3 py-2 text-sm">
        <p className="text-xs font-semibold">{t('preview.yourReply', { when: ago(review.reply.createdAt, t) })}</p>
        <p className="mt-1 whitespace-pre-line">{review.reply.text}</p>
        <button className="mt-1 text-xs text-brand" onClick={() => setOpen(true)}>
          {t('preview.editReply')}
        </button>
      </div>
    ) : (
      <button className="btn-outline mt-3 py-1.5" onClick={() => setOpen(true)}>
        ↩ {t('preview.reply')}
      </button>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <ErrorNote message={error} />
      <textarea className="input min-h-24" maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={review.rating <= 2 ? t('preview.placeholderLow') : t('preview.placeholderHigh')} autoFocus />
      <div className="flex gap-2">
        <button className="btn-primary py-1.5" disabled={busy || text.trim().length < 2} onClick={save}>
          {busy ? t('review.posting') : t('preview.post')}
        </button>
        <button className="btn-ghost py-1.5" onClick={() => setOpen(false)}>
          {t('action.cancel')}
        </button>
      </div>
      <p className="text-xs text-muted">{t('preview.public')}</p>
    </div>
  );
}

function ReportReview({ review, onClose, onDone }: { review: ReviewLike | null; onClose: () => void; onDone: () => void }) {
  const { t } = useSession();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={!!review} onClose={onClose} title={t('report.title.review')}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api(`/v1/partner/reviews/${review!.id}/report`, { method: 'POST', body: { reason, ...(details.trim() ? { details: details.trim() } : {}) } });
            onDone();
            onClose();
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <ErrorNote message={error} />
        <p className="text-sm text-muted">{t('preview.reportNote')}</p>
        {['fake', 'offensive', 'spam', 'other'].map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface">
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--brand)]" />
            <span className="text-sm">{t(`report.reason.review.${r}` as MessageKey)}</span>
          </label>
        ))}
        <textarea className="input" maxLength={1000} placeholder={t('report.detailsPlaceholder')} value={details} onChange={(e) => setDetails(e.target.value)} />
        <button className="btn-primary w-full" disabled={!reason}>
          {t('report.send')}
        </button>
      </form>
    </Modal>
  );
}

export default function PartnerReviews() {
  const { restaurant: r, can } = usePartner();
  const { t, tp } = useSession();
  const [rating, setRating] = useState<number | null>(null);
  const [unreplied, setUnreplied] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reporting, setReporting] = useState<ReviewLike | null>(null);
  const reviews = useApi<{ data: PartnerReview[] }>(can('reviews') ? `/v1/partner/restaurants/${r.id}/reviews` : null, { rating, unreplied: unreplied ? '1' : undefined, from: from || undefined, to: to || undefined });
  const [flash, setFlash] = useFlash();
  if (!can('reviews')) return <NoAccess area={t('ptab.reviews')} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className={`chip ${unreplied ? 'chip-on' : ''}`} onClick={() => setUnreplied(!unreplied)}>
          {t('preview.needsReply')}
        </button>
        {[5, 4, 3, 2, 1].map((n) => (
          <button key={n} className={`chip ${rating === n ? 'chip-on' : ''}`} onClick={() => setRating(rating === n ? null : n)}>
            {n}★
          </button>
        ))}
        <label className="flex items-center gap-1 text-xs text-muted">
          {t('preview.from')}
          <input type="date" className="input w-auto py-1" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          {t('preview.to')}
          <input type="date" className="input w-auto py-1" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <span className="ml-auto text-sm text-muted">
          {r.avgRating > 0 ? t('preview.average', { r: r.avgRating.toFixed(1) }) : t('preview.noRating')} · {tp('reviews', r.reviewCount)}
        </span>
      </div>
      <p className="text-xs text-muted">{t('preview.cantEdit')}</p>
      <ErrorNote message={reviews.error} onRetry={reviews.reload} />
      {reviews.loading && <Loading />}
      {reviews.data?.data.length === 0 && (
        <div className="card">
          <Empty title={unreplied ? t('preview.caughtUp') : t('review.noneYet')} icon="💬">
            {unreplied ? t('preview.caughtUpBody') : t('preview.askForReviews')}
          </Empty>
        </div>
      )}
      <ul className="space-y-3">
        {reviews.data?.data.map((rv) => (
          <li key={rv.id} className="card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {rv.user.name ?? t('review.anon')} <span className="font-normal text-muted">· {ago(rv.createdAt, t)}</span>
              </p>
              <RatingBadge rating={rv.rating} />
            </div>
            <p className="mt-2 text-sm whitespace-pre-line">{rv.text}</p>
            {rv.photos.length > 0 && (
              <div className="mt-2 flex gap-2">
                {rv.photos.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.photo.id} src={media(p.photo.url, 'sm')!} alt="" className="h-16 w-16 rounded-lg object-cover" />
                ))}
              </div>
            )}
            {rv.dishes.length > 0 && <p className="mt-1 text-xs text-muted">🍴 {t('review.tried', { list: rv.dishes.map((d) => d.menuItem.name).join(', ') })}</p>}
            <ReplyBox
              review={rv}
              onSaved={() => {
                setFlash(t('preview.replied'));
                reviews.reload();
              }}
            />
            <button className="mt-2 text-xs text-muted underline" onClick={() => setReporting(rv)}>
              🚩 {t('preview.reportAbuse')}
            </button>
          </li>
        ))}
      </ul>
      <ReportReview review={reporting} onClose={() => setReporting(null)} onDone={() => setFlash(t('report.thanks'))} />
      {flash}
    </div>
  );
}
