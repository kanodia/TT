'use client';

import { useEffect, useState } from 'react';
import type { MessageKey } from '@/i18n';
import { api, errorMessage, media, track, uploadFile } from '@/lib/api';
import { ago, ratingColor } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Detail, MenuSection, Review } from '@/lib/types';
import { LoginForm } from '../auth';
import { Empty, ErrorNote, Modal, RatingBadge, Spinner, Stars } from '../ui';

type Page = { data: Review[]; total: number; nextCursor: string | null; summary: string | null };

const RATING_WORDS: MessageKey[] = ['review.word.1', 'review.word.1', 'review.word.2', 'review.word.3', 'review.word.4', 'review.word.5'];
const ASPECTS = ['food', 'service', 'ambience', 'value'] as const;

export function WriteReview({ restaurant, open, onClose, onPosted }: { restaurant: Detail; open: boolean; onClose: () => void; onPosted: (held: boolean) => void }) {
  const { me, t, config } = useSession();
  const [rating, setRating] = useState(0);
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [text, setText] = useState('');
  const [visitType, setVisitType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [visitedOn, setVisitedOn] = useState('');
  const [photos, setPhotos] = useState<{ url: string; width?: number; height?: number }[]>([]);
  const [dishIds, setDishIds] = useState<string[]>([]);
  const [dishes, setDishes] = useState<{ id: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const min = config.reviewRules.minChars;
  const maxPhotos = config.reviewRules.maxPhotos;

  useEffect(() => {
    if (!open || dishes.length) return;
    api<{ sections: MenuSection[] }>(`/v1/restaurants/${restaurant.id}/menu`)
      .then((m) => setDishes(m.sections.flatMap((s) => s.items.map((i) => ({ id: i.id, name: i.name })))))
      .catch(() => {});
  }, [open, restaurant.id, dishes.length]);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setError(null);
    try {
      const added = [];
      for (const f of Array.from(files).slice(0, maxPhotos - photos.length)) added.push(await uploadFile(f));
      setPhotos([...photos, ...added]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ held: boolean }>(`/v1/restaurants/${restaurant.id}/reviews`, {
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
      setRating(0);
      setAspects({});
      setText('');
      setPhotos([]);
      setDishIds([]);
      onPosted(r.held);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const short = text.trim().length < min;
  return (
    <Modal open={open} onClose={onClose} title={t('review.writeTitle', { name: restaurant.name })}>
      {!me ? (
        <LoginForm intro={t('review.signIn')} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <ErrorNote message={error} />
          <div className="text-center">
            <Stars value={rating} onChange={setRating} size={36} />
            <p className="h-5 text-sm font-medium" style={{ color: ratingColor(rating) }}>
              {rating ? t(RATING_WORDS[rating]) : ''}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-surface p-3">
            {ASPECTS.map((a) => (
              <div key={a} className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">{t(`review.aspect.${a}`)}</span>
                <Stars value={aspects[a] ?? 0} onChange={(v) => setAspects({ ...aspects, [a]: v })} size={16} />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(['dine_in', 'takeaway'] as const).map((v) => (
              <button type="button" key={v} className={`chip ${visitType === v ? 'chip-on' : ''}`} onClick={() => setVisitType(v)}>
                {v === 'dine_in' ? `🍽️ ${t('review.dinedIn')}` : `🥡 ${t('review.takeaway')}`}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-xs text-muted">
              {t('review.visitedOn')}
              <input type="date" className="input w-auto py-1" max={new Date().toISOString().slice(0, 10)} value={visitedOn} onChange={(e) => setVisitedOn(e.target.value)} />
            </label>
          </div>
          <label className="block">
            <span className="label">{t('review.yourReview')}</span>
            <textarea className="input min-h-32" placeholder={t('review.placeholder')} value={text} maxLength={3000} onChange={(e) => setText(e.target.value)} />
            <span className={`mt-1 block text-xs ${short ? 'text-muted' : 'text-good'}`}>{short ? t('review.moreChars', { n: min - text.trim().length }) : `${text.length}/3000`}</span>
          </label>
          {dishes.length > 0 && (
            <div>
              <span className="label">{t('review.dishesTried')}</span>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {dishes.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    className={`chip py-1 text-xs ${dishIds.includes(d.id) ? 'chip-on' : ''}`}
                    onClick={() => setDishIds(dishIds.includes(d.id) ? dishIds.filter((x) => x !== d.id) : dishIds.length < 10 ? [...dishIds, d.id] : dishIds)}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <span className="label">{t('review.photos', { max: maxPhotos })}</span>
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                <div key={p.url} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={media(p.url, 'sm')!} alt="" className="h-16 w-16 rounded-lg object-cover" />
                  <button type="button" className="absolute -top-1.5 -right-1.5 rounded-full bg-black/70 px-1.5 text-xs text-white" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} aria-label={t('action.remove')}>
                    ✕
                  </button>
                </div>
              ))}
              {photos.length < maxPhotos && (
                <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-border text-xl text-muted hover:border-brand">
                  {uploading ? <Spinner className="h-4 w-4" /> : '📷'}
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
                </label>
              )}
            </div>
            <p className="mt-1 text-xs text-muted">{t('review.photosNote')}</p>
          </div>
          <button className="btn-primary w-full" disabled={busy || uploading || !rating || short}>
            {busy ? t('review.posting') : t('review.post')}
          </button>
          <p className="text-center text-xs text-muted">{t('review.honesty')}</p>
        </form>
      )}
    </Modal>
  );
}

function ReviewItem({ review, onReport, onPhoto }: { review: Review; onReport: () => void; onPhoto: (urls: string[], i: number) => void }) {
  const { me, t } = useSession();
  const [helpful, setHelpful] = useState({ on: !!review.votedHelpful, count: review.helpfulCount });
  const [expanded, setExpanded] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);

  async function vote() {
    if (!me) return setNeedLogin(true);
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
  return (
    <li className="py-5">
      <div className="flex items-center gap-3">
        {review.user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media(review.user.avatarUrl, 'sm')!} alt="" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/10 font-semibold text-brand">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {name}
            {review.user.level ? <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-[10px] font-normal text-muted">{t('review.level', { n: review.user.level, count: review.user.reviewCount ?? 0 })}</span> : null}
          </p>
          <p className="text-xs text-muted">
            {ago(review.createdAt, t)} · {review.visitType === 'takeaway' ? t('review.takeaway') : t('review.dinedIn')}
          </p>
        </div>
        <RatingBadge rating={review.rating} />
      </div>
      {(review.foodRating || review.serviceRating || review.ambienceRating || review.valueRating) && (
        <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-muted">
          {review.foodRating && <span>{t('review.aspect.food')} {review.foodRating}★</span>}
          {review.serviceRating && <span>{t('review.aspect.service')} {review.serviceRating}★</span>}
          {review.ambienceRating && <span>{t('review.aspect.ambience')} {review.ambienceRating}★</span>}
          {review.valueRating && <span>{t('review.aspect.value')} {review.valueRating}★</span>}
        </p>
      )}
      <p className="mt-2 text-sm whitespace-pre-line">
        {long && !expanded ? `${review.text.slice(0, 320)}…` : review.text}
        {long && (
          <button className="ml-1 text-brand" onClick={() => setExpanded(!expanded)}>
            {expanded ? t('review.less') : t('review.more')}
          </button>
        )}
      </p>
      {photos.length > 0 && (
        <div className="mt-2 flex gap-2">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => onPhoto(photos.map((x) => x.url), i)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media(p.url, 'sm')!} alt="" className="h-20 w-20 rounded-lg object-cover" />
            </button>
          ))}
        </div>
      )}
      {review.dishes && review.dishes.length > 0 && <p className="mt-2 text-xs text-muted">🍴 {t('review.tried', { list: review.dishes.map((d) => d.name).join(', ') })}</p>}
      {review.reply && (
        <div className="mt-3 rounded-lg border-l-4 border-brand/40 bg-surface px-3 py-2">
          <p className="text-xs font-semibold">{t('review.ownerReply', { when: ago(review.reply.createdAt, t) })}</p>
          <p className="mt-1 text-sm whitespace-pre-line">{review.reply.text}</p>
        </div>
      )}
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <button onClick={vote} className={`hover:text-foreground ${helpful.on ? 'font-semibold text-brand' : ''}`} aria-pressed={helpful.on}>
          👍 {t('review.helpful')}
          {helpful.count ? ` (${helpful.count})` : ''}
        </button>
        <button onClick={onReport} className="hover:text-foreground">
          {t('review.report')}
        </button>
      </div>
      <Modal open={needLogin} onClose={() => setNeedLogin(false)} title={t('auth.signIn')}>
        <LoginForm onDone={() => setNeedLogin(false)} />
      </Modal>
    </li>
  );
}

export function Reviews({
  restaurant,
  onReport,
  onWrite,
  onPhoto,
  version,
}: {
  restaurant: Detail;
  onReport: (id: string) => void;
  onWrite: () => void;
  onPhoto: (urls: string[], i: number) => void;
  version: number;
}) {
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

  useEffect(() => {
    let live = true;
    api<Page>(`/v1/restaurants/${restaurant.id}/reviews`, { query: { sort, rating: star, with_photos: withPhotos ? 1 : undefined, q: q || undefined, limit: 10 } })
      .then((r) => live && setPages({ key, items: r.data, next: r.nextCursor, total: r.total }))
      .catch((e) => live && setError({ key, message: errorMessage(e) }));
    return () => {
      live = false;
    };
  }, [key, restaurant.id, sort, star, withPhotos, q]);

  const firstLoading = pages?.key !== key && error?.key !== key;

  async function more() {
    if (!pages?.next) return;
    setBusy(true);
    try {
      const r = await api<Page>(`/v1/restaurants/${restaurant.id}/reviews`, { query: { sort, rating: star, with_photos: withPhotos ? 1 : undefined, q: q || undefined, limit: 10, cursor: pages.next } });
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
    <div className="grid gap-8 md:grid-cols-[280px_1fr]">
      <aside className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-4xl font-bold">{restaurant.rating > 0 ? restaurant.rating.toFixed(1) : '–'}</div>
            <Stars value={Math.round(restaurant.rating)} size={14} />
            <div className="text-xs text-muted">{tp('reviews', restaurant.reviewCount)}</div>
          </div>
          <div className="flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((n) => (
              <button key={n} onClick={() => setStar(star === n ? null : n)} className={`flex w-full items-center gap-2 text-xs ${star === n ? 'font-semibold' : ''}`} aria-label={t('review.onlyStars', { n })}>
                <span className="w-3">{n}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                  <span className="block h-full rounded-full" style={{ width: `${(bd[n - 1] / max) * 100}%`, background: ratingColor(n) }} />
                </span>
                <span className="w-6 text-right text-muted">{bd[n - 1]}</span>
              </button>
            ))}
          </div>
        </div>
        {aspects.length > 0 && (
          <div className="space-y-1.5 rounded-lg bg-surface p-3 text-sm">
            {aspects.map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-muted">{t(`review.aspect.${k}`)}</span>
                <span className="font-medium">{v.toFixed(1)} ★</span>
              </div>
            ))}
          </div>
        )}
        <button
          className="btn-primary w-full"
          onClick={() => {
            track('detail_tab_view', restaurant.id, { tab: 'write_review' });
            onWrite();
          }}
        >
          ✍️ {t('review.write')}
        </button>
      </aside>
      <div className="min-w-0">
        {restaurant.reviewSummary && (
          <div className="mb-4 rounded-xl border border-border bg-gradient-to-br from-amber-50 to-white p-4">
            <p className="text-xs font-semibold tracking-wide text-amber-800 uppercase">✨ {t('review.summaryTitle')}</p>
            <p className="mt-1 text-sm">{restaurant.reviewSummary}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {[
            ['relevant', 'review.sort.relevant'],
            ['newest', 'review.sort.newest'],
            ['highest', 'review.sort.highest'],
            ['lowest', 'review.sort.lowest'],
          ].map(([k, label]) => (
            <button key={k} className={`chip ${sort === k ? 'chip-on' : ''}`} onClick={() => setSort(k)}>
              {t(label as MessageKey)}
            </button>
          ))}
          <button className={`chip ${withPhotos ? 'chip-on' : ''}`} onClick={() => setWithPhotos(!withPhotos)}>
            📷 {t('review.withPhotos')}
          </button>
          {star && (
            <button className="chip chip-on" onClick={() => setStar(null)}>
              {t('review.onlyStars', { n: star })} ×
            </button>
          )}
          <form
            className="ml-auto"
            onSubmit={(e) => {
              e.preventDefault();
              setQ(keyword.trim());
            }}
          >
            <input className="input w-40 py-1.5 text-xs" placeholder={t('review.keyword')} value={keyword} onChange={(e) => setKeyword(e.target.value)} onBlur={() => setQ(keyword.trim())} />
          </form>
        </div>
        <ErrorNote message={error?.key === key ? error.message : null} onRetry={() => setRetry((n) => n + 1)} />
        {pages && pages.key === key && pages.items.length === 0 && (
          <Empty title={star || withPhotos || q ? t('review.noneMatch') : t('review.noneYet')} icon="💬">
            {t('review.beFirst')}
          </Empty>
        )}
        <ul className="divide-y divide-border">
          {pages?.items.map((r) => (
            <ReviewItem key={r.id} review={r} onReport={() => onReport(r.id)} onPhoto={onPhoto} />
          ))}
        </ul>
        {(busy || firstLoading) && (
          <div className="py-4 text-center">
            <Spinner />
          </div>
        )}
        {pages?.key === key && pages.next && !busy && (
          <button className="btn-outline w-full" onClick={more}>
            {t('review.showMore')}
          </button>
        )}
      </div>
    </div>
  );
}
