'use client';

import { useState } from 'react';
import { UploadButton } from '@/components/forms';
import { NoAccess, usePartner } from '@/components/partner/context';
import { Cover, Empty, ErrorNote, Loading, StatusPill, useFlash } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Photo } from '@/lib/types';
import { useApi } from '@/lib/useApi';

const CATEGORIES = ['food', 'ambience', 'exterior', 'menu'] as const;

export default function PhotosPage() {
  const { restaurant: r, can } = usePartner();
  const { t } = useSession();
  const photos = useApi<{ data: Photo[] }>(can('photos') ? `/v1/partner/restaurants/${r.id}/photos` : null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('food');
  const [dragId, setDragId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const base = `/v1/partner/restaurants/${r.id}/photos`;

  if (!can('photos')) return <NoAccess area={t('ptab.photos')} />;
  if (photos.loading) return <Loading />;

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

  const list = photos.data?.data ?? [];
  const own = list.filter((p) => p.source !== 'diner');
  const diner = list.filter((p) => p.source === 'diner');

  function drop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = own.map((p) => p.id);
    const from = ids.indexOf(dragId);
    ids.splice(from, 1);
    ids.splice(ids.indexOf(targetId) + (from <= ids.indexOf(targetId) ? 1 : 0), 0, dragId);
    photos.setData({ data: [...ids.map((id) => own.find((p) => p.id === id)!), ...diner] });
    void run(() => api(`${base}/order`, { method: 'PUT', body: { ids } }), t('photosEd.reordered'));
  }

  const card = (p: Photo, draggable: boolean) => (
    <div
      key={p.id}
      draggable={draggable}
      onDragStart={() => setDragId(p.id)}
      onDragEnd={() => setDragId(null)}
      onDragOver={(e) => draggable && dragId && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        drop(p.id);
      }}
      className={`card overflow-hidden ${draggable ? 'cursor-grab' : ''} ${dragId === p.id ? 'opacity-40' : ''}`}
    >
      <div className="relative">
        <Cover url={p.url} seed={p.id} size="sm" className="aspect-square w-full" />
        {p.isCover && <span className="absolute top-2 left-2 rounded bg-brand px-1.5 py-0.5 text-xs font-medium text-white">{t('photosEd.cover')}</span>}
        {p.source !== 'partner' && (
          <span className="absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{p.source === 'field' ? t('photosEd.byTeam') : t('photosEd.byDiner')}</span>
        )}
      </div>
      <div className="space-y-2 p-2">
        <div className="flex items-center justify-between gap-2">
          <select className="input py-1 text-xs" value={p.category} onChange={(e) => run(() => api(`${base}/${p.id}`, { method: 'PATCH', body: { category: e.target.value } }), t('photosEd.updated'))} aria-label={t('photosEd.category')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`photos.cat.${c}` as MessageKey)}
              </option>
            ))}
          </select>
          {p.status !== 'approved' && <StatusPill status={p.status} />}
        </div>
        <div className="flex justify-between text-xs">
          {!p.isCover && p.status === 'approved' ? (
            <button className="text-brand" onClick={() => run(() => api(`${base}/${p.id}`, { method: 'PATCH', body: { isCover: true } }), t('photosEd.coverSet'))}>
              {t('photosEd.makeCover')}
            </button>
          ) : (
            <span />
          )}
          {p.source === 'diner' ? (
            <button
              className="text-muted hover:text-red-600"
              onClick={() => {
                const details = prompt(t('photosEd.flagWhy')) ?? undefined;
                run(() => api(`${base}/${p.id}/flag`, { method: 'POST', body: details ? { details } : {} }), t('photosEd.flagged'));
              }}
            >
              🚩 {t('photosEd.flag')}
            </button>
          ) : (
            <button className="text-muted hover:text-red-600" onClick={() => confirm(t('photosEd.confirmDelete')) && run(() => api(`${base}/${p.id}`, { method: 'DELETE' }), t('photosEd.deleted'))}>
              {t('action.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="text-sm font-medium">{t('photosEd.addOf')}</span>
        {CATEGORIES.map((c) => (
          <button key={c} className={`chip ${category === c ? 'chip-on' : ''}`} onClick={() => setCategory(c)}>
            {t(`photos.cat.${c}` as MessageKey)}
          </button>
        ))}
        <UploadButton className="btn-primary" onUploaded={(u) => run(() => api(base, { method: 'POST', body: { ...u, category } }), t('photosEd.added'))} />
      </div>
      <p className="text-xs text-muted">{t('photosEd.tip')}</p>
      <ErrorNote message={error ?? photos.error} />
      {own.length === 0 ? (
        <div className="card">
          <Empty title={t('photos.emptyTitle')} icon="📷">
            {t('photosEd.emptyBody')}
          </Empty>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">{t('photosEd.dragHint')}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{own.map((p) => card(p, true))}</div>
        </>
      )}
      {diner.length > 0 && (
        <section className="space-y-3 pt-4">
          <h2 className="font-semibold">{t('photosEd.fromDiners')}</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{diner.map((p) => card(p, false))}</div>
        </section>
      )}
      {flash}
    </div>
  );
}
