'use client';

import { useState } from 'react';
import { OfferModal, blankOffer, offerBody } from '@/components/partner/OfferModal';
import { PageTitle } from '@/components/Shell';
import { ErrorNote, Loading, Notice } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { PartnerSummary } from '@/lib/types';
import { useApi } from '@/lib/useApi';

/** Chains: apply an offer or a menu to several outlets at once (spec 5.2 Multi-outlet). */
export default function BulkTools() {
  const { t } = useSession();
  const outlets = useApi<{ data: PartnerSummary[] }>('/v1/partner/restaurants');
  const [selected, setSelected] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [offering, setOffering] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (outlets.loading) return <Loading />;
  const list = (outlets.data?.data ?? []).filter((o) => o.permissions.includes('offers') || o.permissions.includes('menu'));
  const toggle = (id: string) => setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  async function copyMenu() {
    if (mode === 'replace' && !confirm(t('bulk.confirmReplace', { n: selected.length }))) return;
    setError(null);
    try {
      const r = await api<{ copied: number }>('/v1/partner/bulk/menu/copy', { method: 'POST', body: { fromRestaurantId: from, toRestaurantIds: selected.filter((id) => id !== from), mode } });
      setResult(t('bulk.menuCopied', { n: r.copied }));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageTitle title={t('partner.bulk')} sub={t('bulk.sub')} />
      <ErrorNote message={error ?? outlets.error} />
      {result && <Notice tone="good">{result}</Notice>}
      <div className="card p-4">
        <h2 className="mb-2 font-semibold">{t('bulk.pick')}</h2>
        <ul className="divide-y divide-border">
          {list.map((o) => (
            <li key={o.id}>
              <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 accent-[var(--brand)]" />
                <span className="flex-1 font-medium">{o.name}</span>
                <span className="text-xs text-muted">{o.city}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">🏷️ {t('bulk.offerTitle')}</h2>
          <p className="text-sm text-muted">{t('bulk.offerBody')}</p>
          <button className="btn-primary" disabled={!selected.length} onClick={() => setOffering(true)}>
            {t('bulk.offerButton', { n: selected.length })}
          </button>
        </div>
        <div className="card space-y-3 p-4">
          <h2 className="font-semibold">📋 {t('bulk.menuTitle')}</h2>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">{t('bulk.copyFrom')}</option>
            {list.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2 text-sm">
            {(['append', 'replace'] as const).map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="radio" checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--brand)]" />
                {t(`bulk.mode.${m}`)}
              </label>
            ))}
          </div>
          <button className="btn-primary" disabled={!from || !selected.filter((id) => id !== from).length} onClick={copyMenu}>
            {t('bulk.menuButton', { n: selected.filter((id) => id !== from).length })}
          </button>
        </div>
      </div>
      {offering && (
        <OfferModal
          draft={blankOffer}
          onClose={() => setOffering(false)}
          onSave={async (d) => {
            const r = await api<{ created: number }>('/v1/partner/bulk/offers', { method: 'POST', body: { restaurantIds: selected, offer: offerBody(d) } });
            setResult(t('bulk.offerCreated', { n: r.created }));
          }}
        />
      )}
    </div>
  );
}
