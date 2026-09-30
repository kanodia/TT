'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Map } from '@/components/Map';
import { CardGridSkeleton, RestaurantCard } from '@/components/RestaurantCard';
import { Empty, ErrorNote, Loading, Modal, Spinner } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, errorMessage, track } from '@/lib/api';
import { nm, restaurantHref, rupees } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Card, Filters, Listing } from '@/lib/types';
import { useApi } from '@/lib/useApi';

const SORTS = ['relevance', 'distance', 'rating', 'popularity', 'cost_asc', 'cost_desc'] as const;
const COST_BANDS = [
  { key: 'u300', min: '', max: '300' },
  { key: '300_600', min: '300', max: '600' },
  { key: '600_1200', min: '600', max: '1200' },
  { key: '1200p', min: '1200', max: '' },
];
const DISTANCES = ['1', '3', '5', '10'];
const LIST_KEYS = ['cuisines', 'types', 'attributes'] as const;
const FLAGS = ['open_now', 'open_late', 'open_24h', 'has_offers', 'is_new'] as const;
const FILTER_KEYS = [...FLAGS, 'rating_min', 'cost_min', 'cost_max', 'radius_km', ...LIST_KEYS] as const;
const GROUPS = ['dietary', 'occasion', 'feature', 'service', 'payment'] as const;

function useParamsState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const get = (k: string) => params.get(k) ?? '';
  const list = (k: string) => (params.get(k) ?? '').split(',').filter(Boolean);
  function set(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    const applied = Object.keys(changes).filter((k) => k !== 'view');
    if (applied.length) track('filter_apply', null, { filters: applied });
  }
  function toggleIn(k: string, value: string) {
    const cur = list(k);
    set({ [k]: (cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]).join(',') || null });
  }
  return { get, list, set, toggleIn };
}

/** Mounted only while open, so the draft always starts from the current URL. */
function FilterSheet({ onClose, filters, base }: { onClose: () => void; filters: Filters | undefined; base: Record<string, string | number> }) {
  const { get, set } = useParamsState();
  const { lang, t, tp } = useSession();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, get(k)])));
  const [count, setCount] = useState<number | null>(null);

  // Live result count while the diner edits (spec 3.2 "Show 142 places").
  useEffect(() => {
    const timer = setTimeout(() => {
      const query: Record<string, string | number> = { ...base, count_only: 1 };
      for (const k of FILTER_KEYS) if (draft[k]) query[k] = draft[k];
      api<Listing>('/v1/restaurants', { query })
        .then((r) => setCount(r.total))
        .catch(() => setCount(null));
    }, 250);
    return () => clearTimeout(timer);
    // `base` is rebuilt by the parent each render; its JSON is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, JSON.stringify(base)]);

  const dl = (k: string) => (draft[k] ?? '').split(',').filter(Boolean);
  const toggle = (k: string, v: string) => {
    const cur = dl(k);
    setDraft({ ...draft, [k]: (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]).join(',') });
  };
  const flag = (k: string) => setDraft({ ...draft, [k]: draft[k] ? '' : '1' });
  const [cuisineQ, setCuisineQ] = useState('');
  const withCount = (label: string, n?: number) => (n != null ? `${label} (${n})` : label);

  return (
    <Modal open onClose={onClose} title={t('filters.title')} wide>
      {!filters ? (
        <Loading />
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('filters.availability')}</h3>
            <div className="flex flex-wrap gap-2">
              {FLAGS.map((k) => (
                <button key={k} className={`chip ${draft[k] ? 'chip-on' : ''}`} onClick={() => flag(k)}>
                  {t(`filters.${k}` as MessageKey)}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('filters.distance')}</h3>
            <div className="flex flex-wrap gap-2">
              {['', ...DISTANCES].map((d) => (
                <button key={d} className={`chip ${(draft.radius_km ?? '') === d ? 'chip-on' : ''}`} onClick={() => setDraft({ ...draft, radius_km: d })}>
                  {d ? t('filters.within', { km: d }) : t('filters.any')}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('filters.rating')}</h3>
            <div className="flex flex-wrap gap-2">
              {['', '3.5', '4', '4.5'].map((r) => (
                <button key={r} className={`chip ${(draft.rating_min ?? '') === r ? 'chip-on' : ''}`} onClick={() => setDraft({ ...draft, rating_min: r })}>
                  {r ? `${r}+ ★` : t('filters.any')}
                </button>
              ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('filters.cost')}</h3>
            <div className="flex flex-wrap gap-2">
              {COST_BANDS.map((b) => {
                const on = (draft.cost_min ?? '') === b.min && (draft.cost_max ?? '') === b.max;
                return (
                  <button key={b.key} className={`chip ${on ? 'chip-on' : ''}`} onClick={() => setDraft({ ...draft, cost_min: on ? '' : b.min, cost_max: on ? '' : b.max })}>
                    {t(`filters.cost.${b.key}` as MessageKey)}
                  </button>
                );
              })}
            </div>
          </section>
          <section>
            <div className="mb-2 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">{t('filters.cuisines')}</h3>
              <input className="input max-w-48 py-1 text-xs" placeholder={t('filters.findCuisine')} value={cuisineQ} onChange={(e) => setCuisineQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              {filters.cuisines
                .filter((c) => !cuisineQ || `${c.name} ${c.nameHi ?? ''}`.toLowerCase().includes(cuisineQ.toLowerCase()))
                .map((c) => (
                  <button key={c.slug} className={`chip ${dl('cuisines').includes(c.slug) ? 'chip-on' : ''}`} onClick={() => toggle('cuisines', c.slug)}>
                    {c.icon} {withCount(nm(c, lang), c.count)}
                  </button>
                ))}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('filters.types')}</h3>
            <div className="flex flex-wrap gap-2">
              {filters.types.map((ty) => (
                <button key={ty.slug} className={`chip ${dl('types').includes(ty.slug) ? 'chip-on' : ''}`} onClick={() => toggle('types', ty.slug)}>
                  {withCount(nm(ty, lang), ty.count)}
                </button>
              ))}
            </div>
          </section>
          {GROUPS.map((g) => {
            const attrs = filters.attributes.filter((a) => a.group === g);
            if (!attrs.length) return null;
            return (
              <section key={g}>
                <h3 className="mb-2 text-sm font-semibold">{t(`filters.group.${g}` as MessageKey)}</h3>
                <div className="flex flex-wrap gap-2">
                  {attrs.map((a) => (
                    <button key={a.key} className={`chip ${dl('attributes').includes(a.key) ? 'chip-on' : ''}`} onClick={() => toggle('attributes', a.key)}>
                      {a.icon} {withCount(nm(a, lang), a.count)}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
          <div className="sticky bottom-0 -mx-5 -mb-4 flex justify-between gap-3 border-t border-border bg-white px-5 py-3">
            <button className="btn-ghost" onClick={() => setDraft(Object.fromEntries(FILTER_KEYS.map((k) => [k, ''])))}>
              {t('filters.clearAll')}
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                set(Object.fromEntries(FILTER_KEYS.map((k) => [k, draft[k] || null])));
                onClose();
              }}
            >
              {count == null ? t('filters.apply') : count === 0 ? t('filters.noneMatch') : tp('filters.show', count)}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Results() {
  const { place, lang, t, tp } = useSession();
  const { get, list, set, toggleIn } = useParamsState();
  const filters = useApi<Filters>('/v1/filters', { city_id: place.cityId });
  const [sheet, setSheet] = useState(false);
  const view = get('view') === 'map' ? 'map' : 'list';

  // Spec 3.2: a distance filter keeps its radius; otherwise search 40 km around the chosen place.
  const base: Record<string, string | number> = { lat: place.lat, lng: place.lng, radius_km: get('radius_km') || 40 };
  const query: Record<string, string | number> = { ...base, limit: view === 'map' ? 100 : 20 };
  for (const k of ['q', 'sort', ...FILTER_KEYS]) if (get(k) && k !== 'radius_km') query[k] = get(k);
  const first = useApi<Listing>('/v1/restaurants', query);
  const queryKey = JSON.stringify(query);
  const [more, setMore] = useState<{ key: string; items: Card[]; next: string | null }>({ key: '', items: [], next: null });
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const extra = more.key === queryKey ? more : null;
  const next = extra ? extra.next : first.data?.nextCursor;
  const items = [...(first.data?.data ?? first.stale?.data ?? []), ...(extra?.items ?? [])];

  async function loadMore() {
    if (!next) return;
    setBusy(true);
    try {
      const r = await api<Listing>('/v1/restaurants', { query: { ...query, cursor: next } });
      setMore({ key: queryKey, items: [...(extra?.items ?? []), ...r.data], next: r.nextCursor });
    } catch (e) {
      setMoreError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const activeCount = FILTER_KEYS.reduce((n, k) => n + (LIST_KEYS.includes(k as never) ? list(k).length : get(k) ? 1 : 0), 0);
  const label = (arr: { slug?: string; key?: string; name: string; nameHi?: string | null }[] | undefined, id: string) => nm(arr?.find((x) => (x.slug ?? x.key) === id), lang) || id;

  const title = get('q')
    ? t('list.resultsFor', { q: get('q') })
    : list('cuisines').length === 1
      ? t('list.cuisineNear', { cuisine: label(filters.data?.cuisines, list('cuisines')[0]), place: place.label })
      : t('list.placesNear', { place: place.label });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold">{title}</h1>

      <div className="sticky top-[57px] z-20 -mx-4 mt-3 bg-white/95 px-4 py-3 backdrop-blur md:top-[65px]">
        <div className="scrollbar-none flex items-center gap-2 overflow-x-auto">
          <button className={`chip ${activeCount ? 'chip-on' : ''}`} onClick={() => setSheet(true)}>
            ⚙️ {t('filters.title')}
            {activeCount ? ` (${activeCount})` : ''}
          </button>
          <select className="chip appearance-none pr-6" value={get('sort') || 'relevance'} onChange={(e) => set({ sort: e.target.value === 'relevance' ? null : e.target.value })} aria-label={t('list.sort')}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                ↕ {t(`sort.${s}` as MessageKey)}
              </option>
            ))}
          </select>
          <button className={`chip ${get('open_now') ? 'chip-on' : ''}`} onClick={() => set({ open_now: get('open_now') ? null : '1' })}>
            {t('filters.open_now')}
          </button>
          <button className={`chip ${list('attributes').includes('pure_veg') ? 'chip-on' : ''}`} onClick={() => toggleIn('attributes', 'pure_veg')}>
            🟢 {t('list.pureVeg')}
          </button>
          <button className={`chip ${get('rating_min') === '4' ? 'chip-on' : ''}`} onClick={() => set({ rating_min: get('rating_min') === '4' ? null : '4' })}>
            {t('list.rating4')}
          </button>
          <button className={`chip ${get('radius_km') === '3' ? 'chip-on' : ''}`} onClick={() => set({ radius_km: get('radius_km') === '3' ? null : '3' })}>
            📍 {t('filters.within', { km: 3 })}
          </button>
          <button className={`chip ${get('has_offers') ? 'chip-on' : ''}`} onClick={() => set({ has_offers: get('has_offers') ? null : '1' })}>
            {t('filters.has_offers')}
          </button>
          <div className="ml-auto flex shrink-0 rounded-full border border-border p-0.5 text-sm">
            {(['list', 'map'] as const).map((v) => (
              <button key={v} onClick={() => set({ view: v === 'map' ? 'map' : null })} className={`rounded-full px-3 py-1 ${view === v ? 'bg-foreground text-white' : ''}`}>
                {v === 'list' ? `☰ ${t('list.list')}` : `🗺️ ${t('list.map')}`}
              </button>
            ))}
          </div>
        </div>
        {activeCount > 0 && (
          <div className="scrollbar-none mt-2 flex gap-2 overflow-x-auto text-xs">
            {LIST_KEYS.flatMap((k) =>
              list(k).map((id) => (
                <button key={`${k}-${id}`} className="chip chip-on py-0.5 text-xs" onClick={() => toggleIn(k, id)}>
                  {label(k === 'cuisines' ? filters.data?.cuisines : k === 'types' ? filters.data?.types : filters.data?.attributes, id)} ×
                </button>
              )),
            )}
            {FLAGS.filter((k) => get(k)).map((k) => (
              <button key={k} className="chip chip-on py-0.5 text-xs" onClick={() => set({ [k]: null })}>
                {t(`filters.${k}` as MessageKey)} ×
              </button>
            ))}
            {get('radius_km') && (
              <button className="chip chip-on py-0.5 text-xs" onClick={() => set({ radius_km: null })}>
                {t('filters.within', { km: get('radius_km') })} ×
              </button>
            )}
            {get('rating_min') && (
              <button className="chip chip-on py-0.5 text-xs" onClick={() => set({ rating_min: null })}>
                {get('rating_min')}+ ★ ×
              </button>
            )}
            {(get('cost_min') || get('cost_max')) && (
              <button className="chip chip-on py-0.5 text-xs" onClick={() => set({ cost_min: null, cost_max: null })}>
                {get('cost_min') ? rupees(+get('cost_min')) : '₹0'} – {get('cost_max') ? rupees(+get('cost_max')) : '∞'} ×
              </button>
            )}
            <button className="px-2 text-brand underline" onClick={() => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])))}>
              {t('filters.clearAll')}
            </button>
          </div>
        )}
      </div>

      {first.error && <ErrorNote message={first.error} onRetry={first.reload} />}
      {first.loading && !items.length && <CardGridSkeleton />}
      {first.data && (
        <p className="mb-4 text-sm text-muted">
          {tp('places', first.data.total)} {first.loading && <Spinner className="ml-2 h-3 w-3" />}
        </p>
      )}

      {first.data && !items.length && (
        <Empty title={t('list.emptyTitle')} icon="🔍">
          {t('list.emptyBody')}
          <div className="mt-3">
            <button className="btn-outline" onClick={() => set(Object.fromEntries(['q', ...FILTER_KEYS].map((k) => [k, null])))}>
              {t('list.clearAll')}
            </button>
          </div>
        </Empty>
      )}

      {view === 'map' && items.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Map
            className="h-[70vh]"
            center={[place.lat, place.lng]}
            showLabels
            pins={[
              ...(place.precise ? [{ id: 'me', lat: place.lat, lng: place.lng, label: t('list.you'), tone: 'me' as const }] : []),
              ...items.map((r) => ({
                id: r.id,
                lat: r.lat,
                lng: r.lng,
                label: nm(r, lang),
                rating: r.rating,
                sub: r.cuisines.map((c) => nm(c, lang)).join(', '),
                href: restaurantHref(r),
              })),
            ]}
          />
          <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
            {items.map((r, i) => (
              <RestaurantCard key={r.id} r={r} position={i} />
            ))}
          </div>
        </div>
      )}

      {view === 'list' && items.length > 0 && (
        <>
          <div className={`grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 ${first.loading ? 'opacity-60' : ''}`}>
            {items.map((r, i) => (
              <RestaurantCard key={r.id} r={r} position={i} />
            ))}
          </div>
          <ErrorNote message={moreError} />
          {next && !first.loading && (
            <div className="mt-8 text-center">
              <button className="btn-outline" onClick={loadMore} disabled={busy}>
                {busy ? <Spinner className="h-4 w-4" /> : t('action.showMore')}
              </button>
            </div>
          )}
        </>
      )}
      {sheet && <FilterSheet onClose={() => setSheet(false)} filters={filters.data} base={{ lat: place.lat, lng: place.lng, radius_km: 40, ...(get('q') ? { q: get('q') } : {}) }} />}
    </div>
  );
}

export default function RestaurantsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Results />
    </Suspense>
  );
}
