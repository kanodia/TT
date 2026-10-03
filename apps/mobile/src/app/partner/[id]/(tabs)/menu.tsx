import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Switch, View } from 'react-native';
import { DIET_COLOR, rupees } from '@shared/format';
import type { MenuSection } from '@shared/types';
import { usePartner } from '@/components/partner/context';
import { Button, C, Card, Divider, Empty, ErrorNote, Field, Loading, Row, Sheet, Txt, useFlash } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { WEB_URL } from '@/lib/env';
import { menuChanged } from '@/lib/events';
import { useBrand, useSession } from '@/lib/session';
import { useApi } from '@/lib/useApi';

/** Menu on the phone: sold-out switch per dish, add/edit dishes, sections (spec 5.2). Bulk import stays on the website. */
export default function PartnerMenu() {
  const { restaurant: r } = usePartner();
  const { t, tp } = useSession();
  const brand = useBrand();
  const menu = useApi<{ sections: MenuSection[] }>(`/v1/partner/restaurants/${r.id}/menu`);
  const [newSection, setNewSection] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  const base = `/v1/partner/restaurants/${r.id}/menu`;
  const reload = menu.reload;

  useEffect(() => menuChanged.on(({ restaurantId }) => restaurantId === r.id && reload()), [r.id, reload]);

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

  const sections = (menu.data ?? menu.stale)?.sections;
  if (!sections) return menu.error ? <ErrorNote message={menu.error} onRetry={menu.reload} style={{ margin: 16 }} /> : <Loading />;
  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);
  const editDish = (params: { itemId?: string; sectionId?: string }) => router.push({ pathname: '/partner/[id]/dish', params: { id: r.id, ...params } });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={menu.refreshing} onRefresh={menu.refresh} tintColor={brand} colors={[brand]} />}
        keyboardShouldPersistTaps="handled"
      >
        <Txt v="small" muted>
          {t('menuEd.summary', { sections: sections.length, dishes: tp('menuEd.dishes', itemCount) })}
        </Txt>
        <ErrorNote message={error} />
        {sections.length > 0 ? <Button icon="＋" title={t('menuEd.addDish')} onPress={() => editDish({ sectionId: sections[0].id })} /> : null}

        {sections.length === 0 ? (
          <Empty icon="📋" title={t('menu.emptyTitle')}>
            {t('papp.menuStart')}
          </Empty>
        ) : null}

        {sections.map((s) => (
          <Card key={s.id} style={{ padding: 0 }}>
            <Row style={{ padding: 12, justifyContent: 'space-between' }}>
              <Txt v="h3" style={{ flex: 1 }}>
                {s.name}
              </Txt>
              <Pressable onPress={() => setRenaming({ id: s.id, name: s.name })} hitSlop={8}>
                <Txt v="small" color={brand}>
                  {t('action.edit')}
                </Txt>
              </Pressable>
            </Row>
            {s.items.map((i) => (
              <View key={i.id}>
                <Divider />
                <Row style={{ paddingHorizontal: 12, paddingVertical: 10 }} gap={10}>
                  <View style={{ width: 12, height: 12, borderRadius: 2, borderWidth: 1.5, borderColor: DIET_COLOR[i.diet] ?? C.muted, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: DIET_COLOR[i.diet] ?? C.muted }} />
                  </View>
                  <Pressable style={{ flex: 1 }} onPress={() => editDish({ itemId: i.id })}>
                    <Txt v="small" bold muted={!i.isAvailable} numberOfLines={1}>
                      {i.name}
                    </Txt>
                    <Txt v="tiny" muted>
                      {i.variants.length ? i.variants.map((v) => `${v.name} ${rupees(v.price)}`).join(' · ') : rupees(i.price)}
                      {!i.isAvailable ? ` · ${t('menu.unavailable')}` : ''}
                    </Txt>
                  </Pressable>
                  <Switch
                    value={i.isAvailable}
                    onValueChange={(v) => run(() => api(`${base}/items/${i.id}`, { method: 'PATCH', body: { isAvailable: v } }), v ? t('papp.backOn') : t('papp.soldOut'))}
                    trackColor={{ true: C.good }}
                    accessibilityLabel={t('menuEd.available')}
                  />
                </Row>
              </View>
            ))}
            <Divider />
            <Pressable onPress={() => editDish({ sectionId: s.id })} style={{ padding: 12 }}>
              <Txt v="small" color={brand}>
                ＋ {t('menuEd.addDish')}
              </Txt>
            </Pressable>
          </Card>
        ))}

        <Card style={{ gap: 8 }}>
          <Txt v="small" bold>
            + {t('menuEd.section')}
          </Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Field value={newSection} onChangeText={setNewSection} maxLength={60} placeholder={t('menuEd.newSection')} />
            </View>
            <Button
              title={t('action.add')}
              disabled={!newSection.trim()}
              onPress={() => run(() => api(`${base}/sections`, { method: 'POST', body: { name: newSection.trim() } }), t('menuEd.sectionAdded')).then(() => setNewSection(''))}
            />
          </Row>
        </Card>
        <Button kind="outline" icon="⬆" title={t('papp.importOnWeb')} onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/partner/${r.id}/menu`)} />
      </ScrollView>

      <Sheet open={!!renaming} onClose={() => setRenaming(null)} title={t('menuEd.section')}>
        <Field value={renaming?.name ?? ''} onChangeText={(name) => setRenaming((cur) => (cur ? { ...cur, name } : cur))} maxLength={60} />
        <Button
          title={t('action.save')}
          disabled={!renaming?.name.trim()}
          onPress={async () => {
            await run(() => api(`${base}/sections/${renaming!.id}`, { method: 'PATCH', body: { name: renaming!.name.trim() } }));
            setRenaming(null);
          }}
        />
        <Button
          kind="ghost"
          title={t('action.delete')}
          onPress={() => {
            const s = sections.find((x) => x.id === renaming?.id);
            if (!s) return;
            Alert.alert(t('menuEd.confirmDeleteSection', { name: s.name, n: s.items.length }), '', [
              { text: t('action.cancel'), style: 'cancel' },
              {
                text: t('action.delete'),
                style: 'destructive',
                onPress: async () => {
                  await run(() => api(`${base}/sections/${s.id}`, { method: 'DELETE' }), t('menuEd.sectionDeleted'));
                  setRenaming(null);
                },
              },
            ]);
          }}
        />
      </Sheet>
      {flash}
    </View>
  );
}
