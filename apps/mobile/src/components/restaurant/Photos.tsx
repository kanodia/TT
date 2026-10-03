import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Chip, Cover, Empty, Loading } from '../ui';

type PhotoPage = { data: { id: string; url: string; category: string; source: string }[]; total: number; counts: Record<string, number>; nextCursor: string | null };

/** Photos tab: category filter, restaurant + diner photos, paginated (spec 4.4). */
export function PhotosTab({ restaurantId, onOpen, onReport }: { restaurantId: string; onOpen: (urls: string[], i: number) => void; onReport: (id: string) => void }) {
  const { t } = useSession();
  const { width } = useWindowDimensions();
  const size = (width - 32 - 16) / 3;
  const [category, setCategory] = useState('');
  const [pages, setPages] = useState<{ key: string; items: PhotoPage['data']; next: string | null; counts: Record<string, number> } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api<PhotoPage>(`/v1/restaurants/${restaurantId}/photos`, { query: { category: category || undefined } })
      .then((r) => live && setPages({ key: category, items: r.data, next: r.nextCursor, counts: r.counts }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [restaurantId, category]);

  if (!pages) return <Loading />;
  const urls = pages.items.map((p) => p.url);
  const total = Object.values(pages.counts).reduce((a, b) => a + b, 0);
  if (!total) return <Empty title={t('photos.emptyTitle')} icon="📷">{t('photos.emptyBody')}</Empty>;
  return (
    <View style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {['', 'food', 'ambience', 'menu', 'exterior'].map((c) => (
          <Chip key={c} label={`${t(`photos.cat.${c || 'all'}` as MessageKey)} (${c ? (pages.counts[c] ?? 0) : total})`} on={category === c} disabled={!!c && !pages.counts[c]} onPress={() => setCategory(c)} />
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {pages.items.map((p, i) => (
          <Pressable key={p.id} onPress={() => onOpen(urls, i)} onLongPress={() => onReport(p.id)} accessibilityHint={t('review.report')}>
            <Cover url={p.url} seed={p.id} size="sm" style={{ width: size, height: size }} rounded={8} />
            {p.source === 'diner' ? (
              <View style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 4 }}>
                <Text style={{ color: '#fff', fontSize: 10 }}>{t('photos.byDiner')}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
      </View>
      {pages.next ? (
        <Button
          kind="outline"
          title={t('action.showMore')}
          busy={busy}
          onPress={async () => {
            setBusy(true);
            const r = await api<PhotoPage>(`/v1/restaurants/${restaurantId}/photos`, { query: { category: category || undefined, cursor: pages.next } }).catch(() => null);
            if (r) setPages({ ...pages, items: [...pages.items, ...r.data], next: r.nextCursor });
            setBusy(false);
          }}
        />
      ) : null}
    </View>
  );
}
