import { Image } from 'expo-image';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { ago, DIET_COLOR, rupees } from '@shared/format';
import type { MenuSection } from '@shared/types';
import { media } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';
import { Badge, C, Divider, Empty, ErrorNote, Field, Loading, Row, Txt } from '../ui';

type MenuResponse = { sections: MenuSection[]; menuPhotos: string[]; updatedAt: string | null };

function DietMark({ diet }: { diet: string }) {
  const color = DIET_COLOR[diet] ?? C.muted;
  return (
    <View style={{ width: 14, height: 14, borderWidth: 1.5, borderColor: color, alignItems: 'center', justifyContent: 'center', borderRadius: 2 }} accessibilityLabel={diet}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

/** Digital menu with search and a veg-only switch, plus photos of the printed menu (spec 4.3). */
export function Menu({ restaurantId, onPhoto }: { restaurantId: string; onPhoto: (urls: string[], i: number) => void }) {
  const { t } = useSession();
  const menu = useApi<MenuResponse>(`/v1/restaurants/${restaurantId}/menu`);
  const [q, setQ] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  if (menu.loading) return <Loading />;
  if (menu.error) return <ErrorNote message={menu.error} onRetry={menu.reload} />;
  const data = menu.data!;
  if (!data.sections.length && !data.menuPhotos.length) return <Empty icon="📋" title={t('menu.emptyTitle')}>{t('menu.emptyBody')}</Empty>;
  const needle = q.trim().toLowerCase();
  const sections = data.sections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => (!vegOnly || i.diet === 'veg' || i.diet === 'vegan') && (!needle || `${i.name} ${i.description ?? ''}`.toLowerCase().includes(needle))),
    }))
    .filter((s) => s.items.length);

  return (
    <View style={{ gap: 16 }}>
      {data.updatedAt ? (
        <Txt v="tiny" muted>
          {t('menu.updated', { when: ago(data.updatedAt, t) })}
        </Txt>
      ) : null}
      {data.menuPhotos.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Txt v="small" bold>
            {t('menu.photos')}
          </Txt>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {data.menuPhotos.map((u, i) => (
              <Pressable key={u} onPress={() => onPhoto(data.menuPhotos, i)}>
                <Image source={media(u, 'sm')} style={{ width: 110, height: 140, borderRadius: 8, borderWidth: 1, borderColor: C.border }} contentFit="cover" />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
      {data.sections.length > 0 ? (
        <Row>
          <View style={{ flex: 1 }}>
            <Field placeholder={t('menu.search')} value={q} onChangeText={setQ} />
          </View>
          <Txt v="small">{t('menu.vegOnly')}</Txt>
          <Switch value={vegOnly} onValueChange={setVegOnly} trackColor={{ true: C.good }} />
        </Row>
      ) : null}
      {data.sections.length > 0 && !sections.length ? (
        <Txt muted style={{ textAlign: 'center', paddingVertical: 24 }}>
          {t('menu.noMatch')}
        </Txt>
      ) : null}
      {sections.map((s) => (
        <View key={s.id}>
          <Txt v="h3" style={{ marginBottom: 4 }}>
            {s.name}
          </Txt>
          {s.items.map((i, k) => (
            <View key={i.id}>
              {k > 0 ? <Divider /> : null}
              <Row style={{ paddingVertical: 12, alignItems: 'flex-start', opacity: i.isAvailable ? 1 : 0.5 }} gap={12}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <DietMark diet={i.diet} />
                    {i.tags.map((tag) => (
                      <Badge key={tag} label={t(`tag.${tag}` as MessageKey)} color={tag === 'bestseller' ? '#9a3412' : C.muted} bg={tag === 'bestseller' ? '#ffedd5' : C.surface} />
                    ))}
                    {i.spiceLevel > 0 ? <Txt v="tiny">{'🌶️'.repeat(i.spiceLevel)}</Txt> : null}
                  </Row>
                  <Txt bold>{i.name}</Txt>
                  <Txt v="small">{i.variants.length ? i.variants.map((v) => `${v.name} ${rupees(v.price)}`).join(' · ') : rupees(i.price)}</Txt>
                  {i.description ? (
                    <Txt v="small" muted>
                      {i.description}
                    </Txt>
                  ) : null}
                  {i.allergens.length ? (
                    <Txt v="tiny" color="#92400e">
                      ⚠️ {t('menu.contains', { list: i.allergens.join(', ') })}
                    </Txt>
                  ) : null}
                  {!i.isAvailable ? (
                    <Txt v="tiny" bold color={C.bad}>
                      {t('menu.unavailable')}
                    </Txt>
                  ) : null}
                </View>
                {i.photoUrl ? (
                  <Pressable onPress={() => onPhoto([i.photoUrl!], 0)}>
                    <Image source={media(i.photoUrl, 'sm')} style={{ width: 84, height: 84, borderRadius: 10 }} contentFit="cover" />
                  </Pressable>
                ) : null}
              </Row>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
