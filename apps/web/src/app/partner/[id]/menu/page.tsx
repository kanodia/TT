'use client';

import { useState } from 'react';
import { UploadButton } from '@/components/forms';
import { NoAccess, usePartner } from '@/components/partner/context';
import { DietMark, Empty, ErrorNote, Field, Loading, Modal, Toggle, useFlash } from '@/components/ui';
import type { MessageKey } from '@/i18n';
import { api, errorMessage, media } from '@/lib/api';
import { rupees } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { MenuItem, MenuSection, MenuVariant } from '@/lib/types';
import { useApi } from '@/lib/useApi';

type ItemDraft = Omit<MenuItem, 'id' | 'sortOrder'> & { id?: string };
const TAGS = ['bestseller', 'chef_special', 'new'] as const;
const COMMON_ALLERGENS = ['milk', 'nuts', 'gluten', 'soy', 'egg', 'sesame'];

function ItemModal({ draft, sections, onClose, onSave }: { draft: ItemDraft; sections: MenuSection[]; onClose: () => void; onSave: (d: ItemDraft) => Promise<void> }) {
  const { t } = useSession();
  const [d, setD] = useState<ItemDraft>(draft);
  const [allergen, setAllergen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<ItemDraft>) => setD({ ...d, ...p });
  const setVariant = (i: number, p: Partial<MenuVariant>) => set({ variants: d.variants.map((v, j) => (j === i ? { ...v, ...p } : v)) });
  const toggleAllergen = (a: string) => set({ allergens: d.allergens.includes(a) ? d.allergens.filter((x) => x !== a) : [...d.allergens, a].slice(0, 10) });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (d.variants.some((v) => !v.name.trim())) return setError(t('menuEd.variantName'));
    setBusy(true);
    setError(null);
    try {
      // With variants, the listed price is the first (smallest) variant.
      await onSave({ ...d, price: d.variants.length ? Math.min(...d.variants.map((v) => v.price)) : d.price });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={d.id ? t('menuEd.editDish') : t('menuEd.addDish')}>
      <form onSubmit={submit} className="space-y-3">
        <ErrorNote message={error} />
        <Field label={t('menuEd.section')}>
          <select className="input" value={d.sectionId} onChange={(e) => set({ sectionId: e.target.value })}>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label={`${t('menuEd.name')} *`}>
            <input className="input" value={d.name} maxLength={100} onChange={(e) => set({ name: e.target.value })} required autoFocus />
          </Field>
          <Field label={`${t('menuEd.price')} *`}>
            <input className="input" type="number" min={0} max={100000} value={d.price || ''} disabled={d.variants.length > 0} onChange={(e) => set({ price: Math.max(0, Math.round(Number(e.target.value) || 0)) })} required={!d.variants.length} />
          </Field>
        </div>
        <div>
          <span className="label">{t('menuEd.variants')}</span>
          <div className="space-y-1.5">
            {d.variants.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className="input" placeholder={t('menuEd.variantPlaceholder')} maxLength={30} value={v.name} onChange={(e) => setVariant(i, { name: e.target.value })} />
                <input className="input w-28" type="number" min={0} placeholder="₹" value={v.price || ''} onChange={(e) => setVariant(i, { price: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                <button type="button" className="px-1 text-muted hover:text-red-600" onClick={() => set({ variants: d.variants.filter((_, j) => j !== i) })} aria-label={t('action.remove')}>
                  ✕
                </button>
              </div>
            ))}
            {d.variants.length < 6 && (
              <button
                type="button"
                className="chip py-1 text-xs"
                onClick={() => set({ variants: d.variants.length ? [...d.variants, { name: '', price: 0 }] : [{ name: t('menuEd.half'), price: Math.round(d.price * 0.6) }, { name: t('menuEd.full'), price: d.price }] })}
              >
                + {d.variants.length ? t('menuEd.addVariant') : t('menuEd.halfFull')}
              </button>
            )}
          </div>
        </div>
        <Field label={t('menuEd.description')}>
          <textarea className="input" maxLength={300} value={d.description ?? ''} onChange={(e) => set({ description: e.target.value || null })} />
        </Field>
        <div>
          <span className="label">{t('menuEd.foodType')}</span>
          <div className="flex flex-wrap gap-2">
            {(['veg', 'non_veg', 'egg', 'vegan'] as const).map((k) => (
              <button type="button" key={k} className={`chip ${d.diet === k ? 'chip-on' : ''}`} onClick={() => set({ diet: k })}>
                <DietMark diet={k} /> {t(`diet.${k}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">{t('menuEd.spice')}</span>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((n) => (
              <button type="button" key={n} className={`chip ${d.spiceLevel === n ? 'chip-on' : ''}`} onClick={() => set({ spiceLevel: n })}>
                {n === 0 ? t('menuEd.noSpice') : '🌶️'.repeat(n)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">{t('menuEd.tags')}</span>
          <div className="flex gap-2">
            {TAGS.map((tag) => (
              <button type="button" key={tag} className={`chip ${d.tags.includes(tag) ? 'chip-on' : ''}`} onClick={() => set({ tags: d.tags.includes(tag) ? d.tags.filter((x) => x !== tag) : [...d.tags, tag] })}>
                {t(`tag.${tag}`)}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="label">{t('menuEd.allergens')}</span>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...COMMON_ALLERGENS, ...d.allergens])].map((a) => (
              <button type="button" key={a} className={`chip py-1 text-xs ${d.allergens.includes(a) ? 'chip-on' : ''}`} onClick={() => toggleAllergen(a)}>
                {a}
              </button>
            ))}
            <input
              className="input w-32 py-1 text-xs"
              placeholder={t('menuEd.otherAllergen')}
              maxLength={30}
              value={allergen}
              onChange={(e) => setAllergen(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && allergen.trim()) {
                  e.preventDefault();
                  toggleAllergen(allergen.trim().toLowerCase());
                  setAllergen('');
                }
              }}
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {d.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media(d.photoUrl, 'sm')!} alt="" className="h-16 w-16 rounded-lg object-cover" />
          )}
          <UploadButton label={d.photoUrl ? t('menuEd.changePhoto') : t('menuEd.addPhoto')} onUploaded={(u) => set({ photoUrl: u.url })} />
          {d.photoUrl && (
            <button type="button" className="text-sm text-muted" onClick={() => set({ photoUrl: null })}>
              {t('action.remove')}
            </button>
          )}
        </div>
        <Toggle checked={d.isAvailable} onChange={(v) => set({ isAvailable: v })} label={t('menuEd.available')} />
        <button className="btn-primary w-full" disabled={busy || !d.name.trim()}>
          {busy ? t('action.saving') : t('menuEd.saveDish')}
        </button>
      </form>
    </Modal>
  );
}

function ImportModal({ open, onClose, onDone, restaurantId }: { open: boolean; onClose: () => void; onDone: () => void; restaurantId: string }) {
  const { t } = useSession();
  const [csv, setCsv] = useState('');
  const [xlsx, setXlsx] = useState<{ name: string; base64: string } | null>(null);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    if (/\.xlsx$/i.test(file.name)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      setXlsx({ name: file.name, base64: btoa(bin) });
      setCsv('');
    } else {
      setCsv(await file.text());
      setXlsx(null);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api(`/v1/partner/restaurants/${restaurantId}/menu/import`, { method: 'POST', body: xlsx ? { xlsxBase64: xlsx.base64 } : { csv } }));
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setResult(null);
        setCsv('');
        setXlsx(null);
        onClose();
      }}
      title={t('menuEd.importTitle')}
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted">{t('menuEd.importHelp')}</p>
        <pre className="overflow-x-auto rounded-lg bg-surface p-2 text-xs">{`section,name,price,diet,description,variants,allergens,tags\nThali,Rajasthani Thali,180,veg,"Unlimited, with dessert",,,bestseller\nMains,Paneer Butter Masala,240,veg,,Half:150|Full:240,milk|nuts,`}</pre>
        <ErrorNote message={error} />
        {result ? (
          <div className="space-y-2">
            <p className="font-medium text-good">{t('menuEd.imported', { n: result.created })}</p>
            {result.errors.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-red-700">
                {result.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <input type="file" accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
            {xlsx ? (
              <p className="rounded-lg bg-surface px-3 py-2">📗 {xlsx.name}</p>
            ) : (
              <textarea className="input min-h-40 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={t('menuEd.pasteCsv')} />
            )}
            <button className="btn-primary w-full" disabled={busy || (!csv.trim() && !xlsx)} onClick={run}>
              {busy ? t('menuEd.importing') : t('menuEd.import')}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

type Drag = { kind: 'section'; id: string } | { kind: 'item'; id: string; from: string } | null;

export default function MenuEditor() {
  const { restaurant: r, can } = usePartner();
  const { t, tp } = useSession();
  const menu = useApi<{ sections: MenuSection[] }>(can('menu') ? `/v1/partner/restaurants/${r.id}/menu` : null);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [newSection, setNewSection] = useState('');
  const [importing, setImporting] = useState(false);
  const [drag, setDrag] = useState<Drag>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const base = `/v1/partner/restaurants/${r.id}/menu`;

  if (!can('menu')) return <NoAccess area={t('ptab.menu')} />;
  if (menu.loading) return <Loading />;
  if (menu.error) return <ErrorNote message={menu.error} onRetry={menu.reload} />;
  const sections = menu.data!.sections;

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setError(null);
    try {
      await fn();
      if (msg) setFlash(msg);
      menu.reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /** Sends the whole new order, so gaps left by deletions never cause ties (spec 5.2 "drag to reorder"). */
  function saveOrder(next: MenuSection[]) {
    menu.setData({ sections: next });
    return run(() => api(`${base}/order`, { method: 'PUT', body: { sections: next.map((s) => ({ id: s.id, itemIds: s.items.map((i) => i.id) })) } }));
  }
  const moveSection = (from: number, to: number) => {
    if (to < 0 || to >= sections.length || from === to) return;
    const next = [...sections];
    const [s] = next.splice(from, 1);
    next.splice(to, 0, s);
    void saveOrder(next);
  };
  const moveItem = (itemId: string, fromSection: string, toSection: string, toIndex: number) => {
    const next = sections.map((s) => ({ ...s, items: [...s.items] }));
    const src = next.find((s) => s.id === fromSection)!;
    const idx = src.items.findIndex((i) => i.id === itemId);
    if (idx < 0) return;
    const [item] = src.items.splice(idx, 1);
    const dst = next.find((s) => s.id === toSection)!;
    dst.items.splice(Math.max(0, Math.min(toIndex, dst.items.length)), 0, { ...item, sectionId: toSection });
    void saveOrder(next);
  };

  async function saveItem(d: ItemDraft) {
    const { id, ...body } = d;
    if (id) await api(`${base}/items/${id}`, { method: 'PATCH', body });
    else await api(`${base}/items`, { method: 'POST', body });
    setFlash(t('menuEd.saved'));
    menu.reload();
  }

  const blank = (sectionId: string): ItemDraft => ({ sectionId, name: '', description: null, price: 0, diet: 'veg', spiceLevel: 0, tags: [], allergens: [], variants: [], photoUrl: null, isAvailable: true });
  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('menuEd.summary', { sections: sections.length, dishes: tp('menuEd.dishes', itemCount) })}</p>
        <button className="btn-outline" onClick={() => setImporting(true)}>
          ⬆ {t('menuEd.importButton')}
        </button>
      </div>
      <p className="text-xs text-muted">{t('menuEd.dragHint')}</p>
      <ErrorNote message={error} />

      <form
        className="card flex gap-2 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newSection.trim()) return;
          run(() => api(`${base}/sections`, { method: 'POST', body: { name: newSection.trim() } }), t('menuEd.sectionAdded')).then(() => setNewSection(''));
        }}
      >
        <input className="input" placeholder={t('menuEd.newSection')} maxLength={60} value={newSection} onChange={(e) => setNewSection(e.target.value)} />
        <button className="btn-primary shrink-0" disabled={!newSection.trim()}>
          + {t('menuEd.section')}
        </button>
      </form>

      {sections.length === 0 && (
        <div className="card">
          <Empty title={t('menuEd.emptyTitle')} icon="📋">
            {t('menuEd.emptyBody')}
          </Empty>
        </div>
      )}

      {sections.map((s, si) => (
        <section
          key={s.id}
          className={`card ${drag?.kind === 'section' && drag.id === s.id ? 'opacity-50' : ''}`}
          onDragOver={(e) => drag && e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (drag?.kind === 'section') moveSection(sections.findIndex((x) => x.id === drag.id), si);
            else if (drag?.kind === 'item') moveItem(drag.id, drag.from, s.id, s.items.length);
            setDrag(null);
          }}
        >
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <span draggable onDragStart={() => setDrag({ kind: 'section', id: s.id })} onDragEnd={() => setDrag(null)} className="cursor-grab text-muted select-none" title={t('menuEd.drag')} aria-hidden>
              ⠿
            </span>
            <h3 className="flex-1 font-semibold">
              {s.name} <span className="text-sm font-normal text-muted">({s.items.length})</span>
            </h3>
            <button className="btn-ghost px-2" disabled={si === 0} onClick={() => moveSection(si, si - 1)} aria-label={t('menuEd.up')}>
              ↑
            </button>
            <button className="btn-ghost px-2" disabled={si === sections.length - 1} onClick={() => moveSection(si, si + 1)} aria-label={t('menuEd.down')}>
              ↓
            </button>
            <button
              className="btn-ghost px-2 text-sm"
              onClick={() => {
                const name = prompt(t('menuEd.rename'), s.name)?.trim();
                if (name && name !== s.name) run(() => api(`${base}/sections/${s.id}`, { method: 'PATCH', body: { name } }));
              }}
            >
              {t('menuEd.renameButton')}
            </button>
            <button className="btn-ghost px-2 text-sm text-red-600" onClick={() => confirm(t('menuEd.confirmDeleteSection', { name: s.name, n: s.items.length })) && run(() => api(`${base}/sections/${s.id}`, { method: 'DELETE' }), t('menuEd.sectionDeleted'))}>
              {t('action.delete')}
            </button>
            <button className="btn-primary px-3 py-1.5" onClick={() => setDraft(blank(s.id))}>
              + {t('menuEd.dish')}
            </button>
          </div>
          <ul className="divide-y divide-border">
            {s.items.map((i, ii) => (
              <li
                key={i.id}
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  setDrag({ kind: 'item', id: i.id, from: s.id });
                }}
                onDragEnd={() => setDrag(null)}
                onDragOver={(e) => drag?.kind === 'item' && e.preventDefault()}
                onDrop={(e) => {
                  if (drag?.kind !== 'item') return;
                  e.preventDefault();
                  e.stopPropagation();
                  moveItem(drag.id, drag.from, s.id, ii);
                  setDrag(null);
                }}
                className={`flex items-center gap-3 px-4 py-2.5 ${i.isAvailable ? '' : 'bg-surface'} ${drag?.kind === 'item' && drag.id === i.id ? 'opacity-40' : ''}`}
              >
                <span className="cursor-grab text-muted select-none" aria-hidden>
                  ⠿
                </span>
                <DietMark diet={i.diet} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setDraft({ ...i })}>
                  <span className={`block truncate text-sm font-medium ${i.isAvailable ? '' : 'text-muted line-through'}`}>{i.name}</span>
                  <span className="block text-xs text-muted">
                    {i.variants.length ? i.variants.map((v) => `${v.name} ${rupees(v.price)}`).join(' · ') : rupees(i.price)}
                    {i.tags.length > 0 && ` · ${i.tags.map((tag) => t(`tag.${tag}` as MessageKey)).join(', ')}`}
                    {i.allergens.length > 0 && ` · ⚠️ ${i.allergens.join(', ')}`}
                  </span>
                </button>
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={i.isAvailable} onChange={(e) => run(() => api(`${base}/items/${i.id}`, { method: 'PATCH', body: { isAvailable: e.target.checked } }))} className="accent-[var(--brand)]" />
                  {t('menuEd.inStock')}
                </label>
                <button className="px-1 text-muted disabled:opacity-30" disabled={ii === 0} onClick={() => moveItem(i.id, s.id, s.id, ii - 1)} aria-label={t('menuEd.up')}>
                  ↑
                </button>
                <button className="px-1 text-muted disabled:opacity-30" disabled={ii === s.items.length - 1} onClick={() => moveItem(i.id, s.id, s.id, ii + 1)} aria-label={t('menuEd.down')}>
                  ↓
                </button>
                <button className="px-1 text-muted hover:text-red-600" onClick={() => confirm(t('menuEd.confirmDeleteDish', { name: i.name })) && run(() => api(`${base}/items/${i.id}`, { method: 'DELETE' }), t('menuEd.dishDeleted'))} aria-label={t('action.delete')}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {draft && <ItemModal key={draft.id ?? 'new'} draft={draft} sections={sections} onClose={() => setDraft(null)} onSave={saveItem} />}
      <ImportModal open={importing} onClose={() => setImporting(false)} onDone={menu.reload} restaurantId={r.id} />
      {flash}
    </div>
  );
}
