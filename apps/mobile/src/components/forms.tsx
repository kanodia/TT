import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import type { MessageKey } from '@shared/i18n';
import { DAY_KEYS, nm } from '@shared/format';
import type { Filters, Shift } from '@shared/types';
import { useSession } from '@/lib/session';
import { C, Chip, Row, Txt } from './ui';

/** "HH:MM" text box: digits only, colon added automatically; reports only complete valid times. */
export function TimeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [draft, setDraft] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setDraft(value);
  }
  return (
    <TextInput
      value={draft}
      accessibilityLabel={label}
      keyboardType="number-pad"
      maxLength={5}
      placeholder="10:00"
      placeholderTextColor={C.faint}
      onChangeText={(v) => {
        const digits = v.replace(/\D/g, '').slice(0, 4);
        const next = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
        setDraft(next);
        const m = next.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        if (m) onChange(next);
      }}
      onBlur={() => setDraft(value)}
      style={{ borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, width: 68, textAlign: 'center', fontSize: 15, color: C.text }}
    />
  );
}

/** Weekly hours: split shifts, 24h, closed, copy to all days (same rules as the partner portal). */
export function HoursEditor({ value, onChange }: { value: Shift[]; onChange: (v: Shift[]) => void }) {
  const { t } = useSession();
  const byDay = [0, 1, 2, 3, 4, 5, 6].map((d) => value.filter((s) => s.dayOfWeek === d));
  const setDay = (d: number, shifts: Omit<Shift, 'dayOfWeek'>[]) =>
    onChange([...value.filter((s) => s.dayOfWeek !== d), ...shifts.map((s) => ({ ...s, dayOfWeek: d }))].sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.opensAt.localeCompare(b.opensAt)));
  const copyToAll = (from: number) => onChange([0, 1, 2, 3, 4, 5, 6].flatMap((d) => byDay[from].map((s) => ({ ...s, dayOfWeek: d }))));

  return (
    <View style={{ gap: 8 }}>
      {byDay.map((shifts, d) => {
        const closed = shifts.length === 0;
        const allDay = shifts.length === 1 && shifts[0].opensAt === shifts[0].closesAt;
        return (
          <View key={d} style={{ borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 10, gap: 8 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Txt bold>{t(DAY_KEYS[d])}</Txt>
              {closed ? <Txt v="small" color={C.bad}>{t('open.closed')}</Txt> : allDay ? <Txt v="small" color={C.good}>{t('open.allDay')}</Txt> : null}
            </Row>
            {!closed && !allDay
              ? shifts.map((s, i) => (
                  <Row key={i}>
                    <TimeInput label={`${t(DAY_KEYS[d])} ${t('hours.opens')}`} value={s.opensAt} onChange={(v) => setDay(d, shifts.map((x, j) => (j === i ? { ...x, opensAt: v } : x)))} />
                    <Txt muted>–</Txt>
                    <TimeInput label={`${t(DAY_KEYS[d])} ${t('hours.closes')}`} value={s.closesAt} onChange={(v) => setDay(d, shifts.map((x, j) => (j === i ? { ...x, closesAt: v } : x)))} />
                    {s.closesAt < s.opensAt ? <Txt v="tiny" muted>({t('hours.nextDay')})</Txt> : null}
                    <Pressable onPress={() => setDay(d, shifts.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel={t('action.remove')} style={{ marginLeft: 'auto' }}>
                      <Txt muted>✕</Txt>
                    </Pressable>
                  </Row>
                ))
              : null}
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              {!allDay && shifts.length < 4 ? (
                <Chip label={`+ ${closed ? t('hours.open') : t('hours.shift')}`} onPress={() => setDay(d, [...shifts, { opensAt: shifts.length ? '19:00' : '10:00', closesAt: shifts.length ? '23:00' : '22:00' }])} />
              ) : null}
              {!allDay ? <Chip label="24h" onPress={() => setDay(d, [{ opensAt: '00:00', closesAt: '00:00' }])} /> : null}
              {!closed ? <Chip label={t('open.closed')} onPress={() => setDay(d, [])} /> : null}
              {!closed ? <Chip label={t('hours.copyAll')} onPress={() => copyToAll(d)} /> : null}
            </Row>
          </View>
        );
      })}
    </View>
  );
}

/** Establishment type, cuisines (first = main, max 8) and attributes. */
export function TaxonomyFields({
  filters,
  typeSlug,
  cuisineSlugs,
  attributeKeys,
  onChange,
}: {
  filters: Filters;
  typeSlug: string | null;
  cuisineSlugs: string[];
  attributeKeys: string[];
  onChange: (v: { typeSlug?: string | null; cuisineSlugs?: string[]; attributeKeys?: string[] }) => void;
}) {
  const { t, lang } = useSession();
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const group = (title: string, children: React.ReactNode) => (
    <View style={{ gap: 6 }}>
      <Txt v="small" bold>
        {title}
      </Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{children}</View>
    </View>
  );
  return (
    <View style={{ gap: 16 }}>
      {group(
        t('filters.types'),
        filters.types.map((ty) => <Chip key={ty.slug} label={nm(ty, lang)} on={typeSlug === ty.slug} onPress={() => onChange({ typeSlug: typeSlug === ty.slug ? null : ty.slug })} />),
      )}
      {group(
        t('form.cuisinesHint'),
        filters.cuisines.map((c) => {
          const idx = cuisineSlugs.indexOf(c.slug);
          return (
            <Chip
              key={c.slug}
              label={`${c.icon ?? ''} ${nm(c, lang)}${idx === 0 ? ` (${t('form.main')})` : ''}`.trim()}
              on={idx >= 0}
              disabled={idx < 0 && cuisineSlugs.length >= 8}
              onPress={() => onChange({ cuisineSlugs: toggle(cuisineSlugs, c.slug) })}
            />
          );
        }),
      )}
      {(['dietary', 'occasion', 'feature', 'service', 'payment'] as const).map((g) => (
        <View key={g}>
          {group(
            t(`filters.group.${g}` as MessageKey),
            filters.attributes
              .filter((a) => a.group === g)
              .map((a) => <Chip key={a.key} label={`${a.icon ?? ''} ${nm(a, lang)}`.trim()} on={attributeKeys.includes(a.key)} onPress={() => onChange({ attributeKeys: toggle(attributeKeys, a.key) })} />),
          )}
        </View>
      ))}
    </View>
  );
}
