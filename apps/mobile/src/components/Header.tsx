import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBrand, useSession } from '@/lib/session';
import { C, Txt } from './ui';

/** Location (tap to change), language switch and notifications — the diner app's top bar (spec 2.2). */
export function Header() {
  const { place, t, lang, setLang, me } = useSession();
  const brand = useBrand();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <Pressable style={{ flex: 1 }} onPress={() => router.push('/location')} accessibilityRole="button" accessibilityLabel={t('nav.changeLocation')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="location" size={18} color={brand} />
          <Txt v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
            {place.label}
          </Txt>
          <Ionicons name="chevron-down" size={16} color={C.text} />
        </View>
      </Pressable>
      <Pressable onPress={() => setLang(lang === 'en' ? 'hi' : 'en')} hitSlop={8} style={styles.icon} accessibilityRole="button" accessibilityLabel={t('lang.switchTo')}>
        <Text style={{ fontSize: 15, fontWeight: '600' }}>{lang === 'en' ? 'हि' : 'EN'}</Text>
      </Pressable>
      {me ? (
        <Pressable onPress={() => router.push('/notifications')} hitSlop={8} style={styles.icon} accessibilityRole="button" accessibilityLabel={t('nav.notifications')}>
          <Ionicons name="notifications-outline" size={22} color={C.text} />
          {me.unreadNotifications > 0 ? <View style={[styles.dot, { backgroundColor: brand }]} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** Looks like a search field; opens the Search tab. */
export function SearchButton() {
  const { t } = useSession();
  return (
    <Pressable onPress={() => router.navigate('/search')} style={styles.search} accessibilityRole="search">
      <Ionicons name="search" size={18} color={C.muted} />
      <Txt muted numberOfLines={1}>
        {t('nav.search')}
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8, backgroundColor: C.bg },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: 4 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 12, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
});
