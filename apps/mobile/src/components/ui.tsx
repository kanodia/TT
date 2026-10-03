import { Image } from 'expo-image';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openLabel, placeholderFor, ratingColor } from '@shared/format';
import type { OpenStatus } from '@shared/types';
import { media } from '@/lib/api';
import { useBrand, useSession } from '@/lib/session';

export const C = {
  text: '#1c1c1c',
  muted: '#6b7280',
  faint: '#9ca3af',
  border: '#e5e7eb',
  surface: '#f4f4f5',
  bg: '#ffffff',
  good: '#15803d',
  warn: '#b45309',
  bad: '#dc2626',
  info: '#1d4ed8',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

type TxtProps = TextProps & { v?: 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'tiny'; muted?: boolean; bold?: boolean; color?: string };

export function Txt({ v = 'body', muted, bold, color, style, ...rest }: TxtProps) {
  return <Text {...rest} style={[s[v], muted && { color: C.muted }, bold && { fontWeight: '600' }, color ? { color } : null, style]} />;
}

type BtnProps = Omit<PressableProps, 'style'> & {
  title: string;
  kind?: 'primary' | 'outline' | 'ghost' | 'danger';
  icon?: string;
  busy?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
};

export function Button({ title, kind = 'primary', icon, busy, small, style, disabled, active, ...rest }: BtnProps) {
  const brand = useBrand();
  const bg = kind === 'primary' ? brand : kind === 'danger' ? C.bad : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? '#fff' : active ? brand : C.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || busy, busy }}
      disabled={disabled || busy}
      {...rest}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        { backgroundColor: bg, borderColor: kind === 'outline' ? (active ? brand : C.border) : bg },
        kind === 'ghost' && { borderColor: 'transparent' },
        (disabled || busy) && { opacity: 0.5 },
        pressed && { opacity: 0.8 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <Text style={[s.btnText, small && { fontSize: 13 }, { color: fg }]} numberOfLines={1}>
          {icon ? `${icon} ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, on, onPress, style, disabled }: { label: string; on?: boolean; onPress?: () => void; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  const brand = useBrand();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!on, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[s.chip, on && { borderColor: brand, backgroundColor: `${brand}14` }, disabled && { opacity: 0.4 }, style]}
    >
      <Text style={[s.chipText, on && { color: brand, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

export function RatingBadge({ rating, size = 'md' }: { rating: number; size?: 'md' | 'lg' }) {
  const { t } = useSession();
  const lg = size === 'lg';
  if (!rating) {
    return (
      <View style={[s.rating, { backgroundColor: C.surface }, lg && s.ratingLg]}>
        <Text style={[s.ratingText, { color: C.muted }, lg && { fontSize: 14 }]}>{t('rating.new')}</Text>
      </View>
    );
  }
  return (
    <View style={[s.rating, { backgroundColor: ratingColor(rating) }, lg && s.ratingLg]} accessibilityLabel={`${rating.toFixed(1)} stars`}>
      <Text style={[s.ratingText, lg && { fontSize: 16 }]}>{rating.toFixed(1)} ★</Text>
    </View>
  );
}

const TONE: Record<string, string> = { good: C.good, warn: C.warn, bad: C.bad, muted: C.muted };

export function OpenBadge({ status, style }: { status: OpenStatus; style?: StyleProp<TextStyle> }) {
  const { t } = useSession();
  const { text, tone } = openLabel(status, t);
  return (
    <Text style={[s.small, { color: TONE[tone], fontWeight: '500' }, style]} numberOfLines={1}>
      {text}
    </Text>
  );
}

/** Restaurant photo with a stable coloured placeholder for photo-less listings. */
export function Cover({ url, seed, cuisine, size = 'md', style, rounded = 12 }: { url?: string | null; seed: string; cuisine?: string; size?: 'sm' | 'md' | 'lg'; style?: StyleProp<ViewStyle>; rounded?: number }) {
  const src = media(url, size);
  const ph = placeholderFor(seed, cuisine);
  return (
    <View style={[{ borderRadius: rounded, overflow: 'hidden', backgroundColor: `hsl(${ph.hue}, 70%, 90%)` }, style]}>
      {src ? (
        <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} recyclingKey={src} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: 40 }}>{ph.emoji}</Text>
        </View>
      )}
    </View>
  );
}

export function Loading({ label }: { label?: string }) {
  const brand = useBrand();
  return (
    <View style={s.center}>
      <ActivityIndicator color={brand} />
      {label ? <Txt muted style={{ marginTop: 8 }}>{label}</Txt> : null}
    </View>
  );
}

export function Empty({ icon = '🍽️', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <View style={[s.center, { paddingVertical: 48 }]}>
      <Text style={{ fontSize: 40 }}>{icon}</Text>
      <Txt v="h3" style={{ marginTop: 8, textAlign: 'center' }}>
        {title}
      </Txt>
      {children ? (
        <Txt muted style={{ marginTop: 4, textAlign: 'center' }}>
          {children}
        </Txt>
      ) : null}
      {action ? <View style={{ marginTop: 16 }}>{action}</View> : null}
    </View>
  );
}

export function ErrorNote({ message, onRetry, style }: { message?: string | null; onRetry?: () => void; style?: StyleProp<ViewStyle> }) {
  const { t } = useSession();
  if (!message) return null;
  return (
    <View style={[s.error, style]} accessibilityRole="alert">
      <Txt v="small" color="#991b1b" style={{ flex: 1 }}>
        {message}
      </Txt>
      {onRetry ? (
        <Pressable onPress={onRetry} hitSlop={8}>
          <Txt v="small" bold color="#991b1b">
            {t('action.retry')}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Note({ children, tone = 'warn', style }: { children: ReactNode; tone?: 'warn' | 'info' | 'good'; style?: StyleProp<ViewStyle> }) {
  const bg = { warn: '#fffbeb', info: '#eff6ff', good: '#f0fdf4' }[tone];
  const fg = { warn: '#92400e', info: '#1e40af', good: '#166534' }[tone];
  return (
    <View style={[{ backgroundColor: bg, borderRadius: 10, padding: 12 }, style]}>
      {typeof children === 'string' ? <Txt v="small" color={fg}>{children}</Txt> : children}
    </View>
  );
}

export function Field({ label, hint, error, style, ...rest }: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ gap: 4 }}>
      {label ? <Txt v="small" bold>{label}</Txt> : null}
      <TextInput placeholderTextColor={C.faint} {...rest} style={[s.input, rest.multiline && { minHeight: 96, textAlignVertical: 'top' }, error ? { borderColor: C.bad } : null, style]} />
      {error ? <Txt v="tiny" color={C.bad}>{error}</Txt> : hint ? <Txt v="tiny" muted>{hint}</Txt> : null}
    </View>
  );
}

/** Bottom sheet built on Modal: keyboard-aware, scrolls, and closes on backdrop tap or back button. */
export function Sheet({ open, onClose, title, children, scroll = true }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const { t } = useSession();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('action.close')}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} />
        </Pressable>
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.sheetHead}>
            <Txt v="h3" style={{ flex: 1 }} numberOfLines={1}>
              {title}
            </Txt>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('action.close')}>
              <Text style={{ fontSize: 22, color: C.muted }}>✕</Text>
            </Pressable>
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12 }}>
              {children}
            </ScrollView>
          ) : (
            <View style={{ padding: 16, gap: 12, flexShrink: 1 }}>{children}</View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Short confirmation message at the bottom of the screen. */
export function useFlash(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const show = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2500);
  };
  const node = msg ? (
    <View pointerEvents="none" style={s.flash} accessibilityLiveRegion="polite">
      <Text style={{ color: '#fff', fontWeight: '500' }}>{msg}</Text>
    </View>
  ) : null;
  return [node, show];
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: C.border }, style]} />;
}

export function Row({ children, style, gap = 8 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style]}>{children}</View>;
}

export function Badge({ label, color = C.muted, bg = C.surface }: { label: string; color?: string; bg?: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, color, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  h1: { fontSize: 26, fontWeight: '700', color: C.text },
  h2: { fontSize: 20, fontWeight: '700', color: C.text },
  h3: { fontSize: 17, fontWeight: '600', color: C.text },
  body: { fontSize: 15, color: C.text, lineHeight: 21 },
  small: { fontSize: 13, color: C.text, lineHeight: 18 },
  tiny: { fontSize: 11, color: C.text, lineHeight: 15 },
  btn: { minHeight: 46, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  btnSmall: { minHeight: 36, paddingHorizontal: 12 },
  btnText: { fontSize: 15, fontWeight: '600' },
  chip: { borderWidth: 1, borderColor: C.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.bg },
  chipText: { fontSize: 13, color: C.text },
  rating: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  ratingLg: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  ratingText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 10, padding: 12 },
  input: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 9, fontSize: 15, color: C.text, backgroundColor: C.bg },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '90%' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4, gap: 12 },
  flash: { position: 'absolute', bottom: 32, alignSelf: 'center', backgroundColor: 'rgba(28,28,28,0.92)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  card: { backgroundColor: C.bg, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14 },
});
