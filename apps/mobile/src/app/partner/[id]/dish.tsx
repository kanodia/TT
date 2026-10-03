import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import type { MenuItem, MenuSection, MenuVariant } from '@shared/types';
import { usePartner } from '@/components/partner/context';
import { Button, C, Chip, ErrorNote, Field, Loading, Row, Txt } from '@/components/ui';
import { api, errorMessage, media, uploadPhoto } from '@/lib/api';
import { menuChanged } from '@/lib/events';
import { pickPhotos } from '@/lib/photos';
import { useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

type ItemDraft = Omit<MenuItem, 'id' | 'sortOrder'> & { id?: string };
const TAGS = ['bestseller', 'chef_special', 'new'] as const;
const COMMON_ALLERGENS = ['milk', 'nuts', 'gluten', 'soy', 'egg', 'sesame'];
const money = (v: string) => Math.min(100000, Math.max(0, Math.round(Number(v.replace(/\D/g, '')) || 0)));

function Editor({ initial, sections }: { initial: ItemDraft; sections: MenuSection[] }) {
  const { restaurant: r } = usePartner();
  const { t } = useSession();
  const [d, setD] = useState<ItemDraft>(initial);
  const [allergen, setAllergen] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/v1/partner/restaurants/${r.id}/menu`;
  const set = (p: Partial<ItemDraft>) => setD((cur) => ({ ...cur, ...p }));
  const setVariant = (i: number, p: Partial<MenuVariant>) => set({ variants: d.variants.map((v, j) => (j === i ? { ...v, ...p } : v)) });
  const toggleAllergen = (a: string) => set({ allergens: d.allergens.includes(a) ? d.allergens.filter((x) => x !== a) : [...d.allergens, a].slice(0, 10) });

  async function save() {
    if (d.variants.some((v) => !v.name.trim())) return setError(t('menuEd.variantName'));
    setBusy(true);
    setError(null);
    try {
      // With variants, the listed price is the first (smallest) variant.
      const { id, ...body } = { ...d, price: d.variants.length ? Math.min(...d.variants.map((v) => v.price)) : d.price };
      if (id) await api(`${base}/items/${id}`, { method: 'PATCH', body });
      else await api(`${base}/items`, { method: 'POST', body });
      menuChanged.emit({ restaurantId: r.id });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(source: 'camera' | 'library') {
    try {
      const [p] = await pickPhotos({ source, max: 1, deniedMessage: t('photo.cameraDenied') });
      if (!p) return;
      setUploading(true);
      set({ photoUrl: (await uploadPhoto(p.uri)).url });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: d.id ? t('menuEd.editDish') : t('menuEd.addDish') }} />
      <ErrorNote message={error} />
      <Field label={`${t('menuEd.name')} *`} value={d.name} maxLength={100} onChangeText={(name) => set({ name })} autoFocus={!d.id} />
      {d.variants.length === 0 ? <Field label={`${t('menuEd.price')} (₹) *`} keyboardType="number-pad" value={d.price ? String(d.price) : ''} onChangeText={(v) => set({ price: money(v) })} /> : null}
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('menuEd.variants')}
        </Txt>
        {d.variants.map((v, i) => (
          <Row key={i}>
            <View style={{ flex: 1 }}>
              <Field placeholder={t('menuEd.variantPlaceholder')} maxLength={30} value={v.name} onChangeText={(name) => setVariant(i, { name })} />
            </View>
            <View style={{ width: 100 }}>
              <Field placeholder="₹" keyboardType="number-pad" value={v.price ? String(v.price) : ''} onChangeText={(p) => setVariant(i, { price: money(p) })} />
            </View>
            <Button small kind="ghost" title="✕" onPress={() => set({ variants: d.variants.filter((_, j) => j !== i) })} accessibilityLabel={t('action.remove')} />
          </Row>
        ))}
        {d.variants.length < 6 ? (
          <Chip
            style={{ alignSelf: 'flex-start' }}
            label={`+ ${d.variants.length ? t('menuEd.addVariant') : t('menuEd.halfFull')}`}
            onPress={() => set({ variants: d.variants.length ? [...d.variants, { name: '', price: 0 }] : [{ name: t('menuEd.half'), price: Math.round(d.price * 0.6) }, { name: t('menuEd.full'), price: d.price }] })}
          />
        ) : null}
      </View>
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('menuEd.section')}
        </Txt>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {sections.map((s) => (
            <Chip key={s.id} label={s.name} on={d.sectionId === s.id} onPress={() => set({ sectionId: s.id })} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('menuEd.foodType')}
        </Txt>
        <Row style={{ flexWrap: 'wrap' }} gap={6}>
          {(['veg', 'non_veg', 'egg', 'vegan'] as const).map((k) => (
            <Chip key={k} label={t(`diet.${k}`)} on={d.diet === k} onPress={() => set({ diet: k })} />
          ))}
        </Row>
      </View>
      <Field label={t('menuEd.description')} multiline maxLength={300} value={d.description ?? ''} onChangeText={(v) => set({ description: v || null })} />
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('menuEd.spice')}
        </Txt>
        <Row gap={6}>
          {[0, 1, 2, 3].map((n) => (
            <Chip key={n} label={n === 0 ? t('menuEd.noSpice') : '🌶️'.repeat(n)} on={d.spiceLevel === n} onPress={() => set({ spiceLevel: n })} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('menuEd.tags')}
        </Txt>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {TAGS.map((tag) => (
            <Chip key={tag} label={t(`tag.${tag}`)} on={d.tags.includes(tag)} onPress={() => set({ tags: d.tags.includes(tag) ? d.tags.filter((x) => x !== tag) : [...d.tags, tag] })} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('menuEd.allergens')}
        </Txt>
        <Row gap={6} style={{ flexWrap: 'wrap' }}>
          {[...new Set([...COMMON_ALLERGENS, ...d.allergens])].map((a) => (
            <Chip key={a} label={a} on={d.allergens.includes(a)} onPress={() => toggleAllergen(a)} />
          ))}
        </Row>
        <Field
          placeholder={t('menuEd.otherAllergen')}
          maxLength={30}
          value={allergen}
          onChangeText={setAllergen}
          returnKeyType="done"
          onSubmitEditing={() => {
            if (allergen.trim()) toggleAllergen(allergen.trim().toLowerCase());
            setAllergen('');
          }}
        />
      </View>
      <View style={{ gap: 6 }}>
        <Txt v="small" bold>
          {t('menuEd.addPhoto')}
        </Txt>
        <Row>
          {d.photoUrl ? <Image source={media(d.photoUrl, 'sm')} style={{ width: 64, height: 64, borderRadius: 8 }} /> : null}
          <Button small kind="outline" icon="📷" title={t('photo.camera')} onPress={() => addPhoto('camera')} busy={uploading} />
          <Button small kind="outline" icon="🖼️" title={t('photo.gallery')} onPress={() => addPhoto('library')} disabled={uploading} />
          {d.photoUrl ? <Button small kind="ghost" title={t('action.remove')} onPress={() => set({ photoUrl: null })} /> : null}
        </Row>
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt>{t('menuEd.available')}</Txt>
        <Switch value={d.isAvailable} onValueChange={(v) => set({ isAvailable: v })} trackColor={{ true: C.good }} />
      </Row>
      <Button title={busy ? t('action.saving') : t('menuEd.saveDish')} onPress={save} busy={busy} disabled={!d.name.trim() || uploading} />
      {d.id ? (
        <Button
          kind="ghost"
          title={t('action.delete')}
          onPress={() =>
            Alert.alert(t('menuEd.confirmDeleteDish', { name: d.name }), '', [
              { text: t('action.cancel'), style: 'cancel' },
              {
                text: t('action.delete'),
                style: 'destructive',
                onPress: async () => {
                  try {
                    await api(`${base}/items/${d.id}`, { method: 'DELETE' });
                    menuChanged.emit({ restaurantId: r.id });
                    router.back();
                  } catch (e) {
                    setError(errorMessage(e));
                  }
                },
              },
            ])
          }
        />
      ) : null}
    </ScrollView>
  );
}

/** Add or edit one dish: price or half/full variants, veg mark, spice, tags, allergens, photo (spec 5.2). */
export default function DishScreen() {
  const { restaurant: r } = usePartner();
  const { itemId, sectionId } = useLocalSearchParams<{ itemId?: string; sectionId?: string }>();
  const menu = useApi<{ sections: MenuSection[] }>(`/v1/partner/restaurants/${r.id}/menu`);
  if (!menu.data) return menu.error ? <ErrorNote message={menu.error} onRetry={menu.reload} style={{ margin: 16 }} /> : <Loading />;
  const sections = menu.data.sections;
  const item = itemId ? sections.flatMap((s) => s.items).find((i) => i.id === itemId) : undefined;
  const initial: ItemDraft = item
    ? (({ sortOrder: _sortOrder, ...rest }) => rest)(item)
    : { sectionId: sectionId ?? sections[0]?.id ?? '', name: '', description: null, price: 0, diet: 'veg', spiceLevel: 0, tags: [], allergens: [], variants: [], photoUrl: null, isAvailable: true };
  return <Editor initial={initial} sections={sections} />;
}
