'use client';

import { useState } from 'react';
import type { MessageKey } from '@/i18n';
import { media } from '@/lib/api';
import { ago, rupees } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { MenuSection } from '@/lib/types';
import { useApi } from '@/lib/useApi';
import { DietMark, Empty, ErrorNote, Loading, Toggle } from '../ui';

type MenuResponse = { sections: MenuSection[]; menuPhotos: string[]; updatedAt: string | null };

const TAG_STYLE: Record<string, string> = {
  bestseller: 'bg-amber-100 text-amber-800',
  chef_special: 'bg-purple-100 text-purple-800',
  new: 'bg-blue-100 text-blue-800',
};

export function Menu({ restaurantId, onPhoto }: { restaurantId: string; onPhoto: (url: string) => void }) {
  const { t } = useSession();
  const menu = useApi<MenuResponse>(`/v1/restaurants/${restaurantId}/menu`);
  const [vegOnly, setVegOnly] = useState(false);
  const [q, setQ] = useState('');

  if (menu.loading) return <Loading />;
  if (menu.error) return <ErrorNote message={menu.error} onRetry={menu.reload} />;
  const data = menu.data!;
  const needle = q.trim().toLowerCase();
  const sections = data.sections
    .map((s) => ({
      ...s,
      items: s.items.filter(
        (i) => (!vegOnly || i.diet === 'veg' || i.diet === 'vegan') && (!needle || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(needle)),
      ),
    }))
    .filter((s) => s.items.length);

  if (!data.sections.length && !data.menuPhotos.length) {
    return (
      <Empty title={t('menu.emptyTitle')} icon="📋">
        {t('menu.emptyBody')}
      </Empty>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-[180px_1fr]">
      <nav className="hidden md:block">
        <ul className="sticky top-32 space-y-1 text-sm">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#menu-${s.id}`} className="block rounded px-2 py-1 text-muted hover:bg-surface hover:text-foreground">
                {s.name} <span className="text-xs">({s.items.length})</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        {data.menuPhotos.length > 0 && (
          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold">{t('menu.photos')}</h3>
            <div className="scrollbar-none flex gap-3 overflow-x-auto">
              {data.menuPhotos.map((u) => (
                <button key={u} onClick={() => onPhoto(u)} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={media(u, 'sm')!} alt={t('menu.photos')} className="h-40 w-32 rounded-lg border border-border object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}
        {data.sections.length > 0 && (
          <div className="sticky top-[110px] z-10 mb-4 flex flex-wrap items-center gap-4 bg-white py-2 md:static">
            <input className="input max-w-xs" placeholder={t('menu.search')} value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="w-40">
              <Toggle checked={vegOnly} onChange={setVegOnly} label={t('menu.vegOnly')} />
            </div>
          </div>
        )}
        {data.sections.length > 0 && !sections.length && <p className="py-8 text-center text-sm text-muted">{t('menu.noMatch')}</p>}
        <div className="space-y-8">
          {sections.map((s) => (
            <section key={s.id} id={`menu-${s.id}`} className="scroll-mt-32">
              <h3 className="mb-3 text-lg font-semibold">{s.name}</h3>
              <ul className="divide-y divide-border">
                {s.items.map((i) => (
                  <li key={i.id} className={`flex gap-4 py-4 ${i.isAvailable ? '' : 'opacity-50'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <DietMark diet={i.diet} />
                        {i.tags.map((tag) => (
                          <span key={tag} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${TAG_STYLE[tag] ?? 'bg-gray-100'}`}>
                            {t(`tag.${tag}` as MessageKey)}
                          </span>
                        ))}
                        {i.spiceLevel > 0 && <span title={t('menu.spice', { n: i.spiceLevel })}>{'🌶️'.repeat(i.spiceLevel)}</span>}
                      </div>
                      <p className="mt-1 font-medium">{i.name}</p>
                      {i.variants.length > 0 ? (
                        <p className="text-sm">{i.variants.map((v) => `${v.name} ${rupees(v.price)}`).join(' · ')}</p>
                      ) : (
                        <p className="text-sm">{rupees(i.price)}</p>
                      )}
                      {i.description && <p className="mt-1 text-sm text-muted">{i.description}</p>}
                      {i.allergens.length > 0 && <p className="mt-1 text-xs text-amber-800">⚠️ {t('menu.contains', { list: i.allergens.join(', ') })}</p>}
                      {!i.isAvailable && <p className="mt-1 text-xs font-medium text-red-600">{t('menu.unavailable')}</p>}
                    </div>
                    {i.photoUrl && (
                      <button onClick={() => onPhoto(i.photoUrl!)} className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={media(i.photoUrl, 'sm')!} alt={i.name} className="h-24 w-24 rounded-lg object-cover" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        {data.updatedAt && <p className="mt-6 text-xs text-muted">{t('menu.updated', { when: ago(data.updatedAt, t) })}</p>}
      </div>
    </div>
  );
}
