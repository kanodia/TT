import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import type { CapturePayload, CapturePhoto } from '@shared/field';
import type { MessageKey } from '@shared/i18n';
import type { Filters } from '@shared/types';
import { HoursEditor, TaxonomyFields } from '@/components/forms';
import type { Lead } from '@/components/field';
import { Map } from '@/components/Map';
import { Button, C, Card, Chip, ErrorNote, Field, Loading, Note, Row, Txt } from '@/components/ui';
import { api, media } from '@/lib/api';
import { cached, getQueued, newId, putQueued } from '@/lib/fieldQueue';
import { useFieldSync } from '@/lib/fieldSync';
import { pickPhotos } from '@/lib/photos';
import { useBrand, useSession } from '@/lib/session';

type Nearby = {
  restaurants: { id: string; name: string; addressLine: string; distanceM: number; status: string; likelyDuplicate: boolean }[];
  pendingCaptures: { id: string; name: string; distanceM: number; likelyDuplicate: boolean }[];
  leads: { id: string; name: string; distanceM: number }[];
};

const MIN_ACCURACY_M = 30;
const MAX_PHOTOS = 24;
const PHOTO_KINDS: CapturePhoto['category'][] = ['exterior', 'food', 'menu', 'ambience'];

const blank = (lat: number, lng: number, cityId: string): CapturePayload => ({
  name: '',
  nameHi: null,
  cityId,
  localityId: null,
  addressLine: '',
  landmark: null,
  pincode: null,
  lat,
  lng,
  phone: null,
  whatsapp: null,
  typeSlug: null,
  cuisineSlugs: [],
  attributeKeys: [],
  costForTwo: 0,
  knownFor: [],
  hours: [],
  ownerName: null,
  ownerPhone: null,
  ownerConsent: false,
  wantsToManage: false,
  notes: null,
  photos: [],
});

const orNull = (s: string) => (s.trim() ? s.trim() : null);
const digits = (s: string) => s.replace(/\D/g, '');

/** Town whose centre is closest to a point. */
function nearestCityId(cities: Filters['cities'], lat: number, lng: number) {
  let best: { id: string; d: number } | null = null;
  for (const c of cities) {
    const d = (c.lat - lat) ** 2 + ((c.lng - lng) * Math.cos((lat * Math.PI) / 180)) ** 2;
    if (!best || d < best.d) best = { id: c.id, d };
  }
  return best?.id ?? '';
}

function validate(p: CapturePayload, accuracy: number | null): MessageKey | null {
  if (p.name.trim().length < 2) return 'fcap.err.name';
  if (!p.cityId) return 'fcap.err.town';
  if (p.addressLine.trim().length < 3) return 'fcap.err.address';
  if (!p.lat || !p.lng) return 'fcap.err.gps';
  if (!p.photos.some((ph) => ph.category === 'exterior')) return 'fcap.err.storefront';
  for (const v of [p.phone, p.whatsapp, p.ownerPhone]) if (v && !/^[6-9]\d{9}$/.test(v)) return 'fcap.err.phone';
  if (p.pincode && !/^\d{6}$/.test(p.pincode)) return 'fcap.err.pincode';
  if (!p.ownerConsent) return 'fcap.err.consent';
  if (p.wantsToManage && !p.ownerPhone) return 'fcap.err.ownerPhone';
  if (accuracy != null && accuracy > MIN_ACCURACY_M * 3) return 'fcap.err.accuracy';
  return null;
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 12 }}>
      <Txt v="h3">
        {n}. {title}
      </Txt>
      {children}
    </Card>
  );
}

/** New listing capture (spec 7.3), saved on the phone first and uploaded when there is signal. */
export default function Capture() {
  const params = useLocalSearchParams<{ lead?: string; draft?: string; resubmit?: string }>();
  const { place, t, lang } = useSession();
  const brand = useBrand();
  const { online, sync } = useFieldSync();
  const scroll = useRef<ScrollView>(null);

  const [filters, setFilters] = useState<Filters | null>(null);
  const [p, setP] = useState<CapturePayload | null>(null);
  const [meta, setMeta] = useState<{ clientUuid: string; leadId: string | null; capturedAt: string | null }>({ clientUuid: '', leadId: params.lead ?? null, capturedAt: null });
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locating, setLocating] = useState(false);
  const [pinMoved, setPinMoved] = useState(0);
  const [knowHours, setKnowHours] = useState(true);
  const [dish, setDish] = useState('');
  const [nearby, setNearby] = useState<Nearby | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoKind, setPhotoKind] = useState<CapturePhoto['category']>('exterior');
  const [photoBusy, setPhotoBusy] = useState(false);
  // Until the agent picks a town, it follows the GPS fix.
  const townPicked = useRef(false);
  const watch = useRef<Location.LocationSubscription | null>(null);
  const set = (patch: Partial<CapturePayload>) => setP((cur) => (cur ? { ...cur, ...patch } : cur));

  /** Watches GPS until the fix is good enough (or the agent drags the pin), showing accuracy as it improves. */
  async function grabGps(cities?: Filters['cities']) {
    watch.current?.remove();
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return setError(t('form.gpsDenied'));
    setLocating(true);
    try {
      watch.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 }, (pos) => {
        const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
        setP((cur) => (cur ? { ...cur, lat, lng, ...(cities && !townPicked.current ? { cityId: nearestCityId(cities, lat, lng) } : {}) } : cur));
        setAccuracy(acc ?? null);
        setPinMoved((n) => n + 1);
        if (acc != null && acc <= 10) {
          watch.current?.remove();
          watch.current = null;
          setLocating(false);
        }
      });
    } catch {
      setLocating(false);
      setError(t('form.gpsFailed'));
    }
  }
  useEffect(() => () => watch.current?.remove(), []);

  // Load reference data (cached for offline) and the draft / lead / sent-back capture to start from.
  useEffect(() => {
    (async () => {
      try {
        const f = await cached('filters', () => api<Filters>('/v1/filters'));
        setFilters(f.data);
        if (params.draft) {
          const d = await getQueued(params.draft);
          if (d) {
            setP({ ...blank(d.payload.lat, d.payload.lng, d.payload.cityId), ...d.payload });
            setAccuracy(d.gpsAccuracyM);
            setKnowHours(d.payload.hours.length > 0);
            setMeta({ clientUuid: d.clientUuid, leadId: d.leadId, capturedAt: d.capturedAt });
            townPicked.current = true;
            if (d.error) setError(t('fcap.serverSaid', { error: d.error }));
            return;
          }
        }
        if (params.resubmit) {
          // A capture the reviewer sent back: reopen it as a new capture with the fixes (photos already uploaded).
          const subs = await api<{ data: { id: string; payload?: CapturePayload; reviewNote: string | null }[] }>('/v1/field/me/submissions');
          const s = subs.data.find((x) => x.id === params.resubmit);
          if (s?.payload) {
            setP({ ...blank(s.payload.lat, s.payload.lng, s.payload.cityId), ...s.payload });
            setKnowHours((s.payload.hours ?? []).length > 0);
            setMeta({ clientUuid: newId(), leadId: null, capturedAt: null });
            townPicked.current = true;
            if (s.reviewNote) setError(t('fcap.reviewerSaid', { note: s.reviewNote }));
            return;
          }
        }
        let start = blank(place.lat, place.lng, place.cityId ?? nearestCityId(f.data.cities, place.lat, place.lng));
        if (params.lead) {
          const leads = await cached('leads', () => api<{ data: Lead[] }>('/v1/field/leads').then((r) => r.data)).catch(() => null);
          const lead = leads?.data.find((l) => l.id === params.lead);
          if (lead) {
            start = { ...start, name: lead.name, addressLine: lead.address ?? '', phone: lead.phone, cityId: lead.cityId, ...(lead.lat && lead.lng ? { lat: lead.lat, lng: lead.lng } : {}) };
            townPicked.current = true;
          }
        }
        setP(start);
        setMeta({ clientUuid: newId(), leadId: params.lead ?? null, capturedAt: null });
        void grabGps(f.data.cities);
      } catch {
        setError(t('fcap.loadFailed'));
      }
    })();
    // Runs once per draft/lead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.draft, params.lead, params.resubmit]);

  // Duplicate check whenever the pin or name settles (online only, spec 7.3).
  const lat = p?.lat;
  const lng = p?.lng;
  const name = p?.name ?? '';
  useEffect(() => {
    if (!online || !lat || !lng) return;
    const timer = setTimeout(() => {
      api<Nearby>('/v1/field/places/nearby', { query: { lat, lng, name: name.trim() || undefined } })
        .then(setNearby)
        .catch(() => setNearby(null));
    }, 700);
    return () => clearTimeout(timer);
  }, [lat, lng, name, online]);

  if (!p || !filters) return error ? <ErrorNote message={error} style={{ margin: 16 }} /> : <Loading />;
  const city = filters.cities.find((c) => c.id === p.cityId);
  const all = [...(nearby?.restaurants ?? []), ...(nearby?.pendingCaptures ?? [])];
  const likely = all.filter((d) => d.likelyDuplicate);
  const others = all.filter((d) => !d.likelyDuplicate);

  async function addPhotos(source: 'camera' | 'library') {
    setPhotoBusy(true);
    try {
      const picked = await pickPhotos({ source, max: Math.min(10, MAX_PHOTOS - p!.photos.length), maxSide: 1280, base64: true, exif: true, deniedMessage: t('photo.cameraDenied') });
      const added: CapturePhoto[] = picked.map((ph) => ({ dataUrl: `data:image/jpeg;base64,${ph.base64}`, width: ph.width, height: ph.height, category: photoKind, ...(ph.exif ? { exif: ph.exif } : {}) }));
      if (added.length) setP((cur) => (cur ? { ...cur, photos: [...cur.photos, ...added] } : cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('fcap.photoFailed'));
    } finally {
      setPhotoBusy(false);
    }
  }

  async function save() {
    const payload: CapturePayload = { ...p!, hours: knowHours ? p!.hours : [], name: p!.name.trim(), addressLine: p!.addressLine.trim() };
    const problem = validate(payload, accuracy);
    if (problem) {
      setError(t(problem, { m: accuracy != null ? Math.round(accuracy) : '' }));
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setSaving(true);
    watch.current?.remove();
    await putQueued({ clientUuid: meta.clientUuid, leadId: meta.leadId, capturedAt: meta.capturedAt ?? new Date().toISOString(), gpsAccuracyM: accuracy, payload });
    void sync();
    router.back();
  }

  const addDish = () => {
    const v = dish.trim();
    if (v && !p.knownFor.includes(v) && p.knownFor.length < 6) set({ knownFor: [...p.knownFor, v] });
    setDish('');
  };
  const accTone = accuracy == null ? C.muted : accuracy <= MIN_ACCURACY_M ? C.good : C.warn;

  return (
    <View style={{ flex: 1, backgroundColor: C.surface }}>
      <Stack.Screen options={{ title: params.draft ? t('fcap.editTitle') : params.resubmit ? t('fcap.fixTitle') : t('fcap.title') }} />
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 12, gap: 12, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        {!online ? <Note>{t('fcap.offline')}</Note> : null}
        <ErrorNote message={error} />

        <Section n={1} title={t('fcap.location')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <View>
              <Txt v="small" bold color={accTone}>
                {accuracy == null ? t('fcap.gpsWaiting') : t('fcap.gpsAccuracy', { m: Math.round(accuracy) })}
              </Txt>
              <Txt v="tiny" muted>
                {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
              </Txt>
            </View>
            <Button small kind="outline" icon="📍" title={t('form.useGps')} onPress={() => grabGps(townPicked.current ? undefined : filters.cities)} busy={locating} />
          </Row>
          {online ? (
            <>
              <Map
                style={{ height: 220, borderRadius: 10 }}
                center={p}
                zoom={18}
                brand={brand}
                recenterKey={pinMoved}
                pins={[{ id: 'drag', lat: p.lat, lng: p.lng, tone: 'drag' }]}
                onDragEnd={(pt) => {
                  watch.current?.remove();
                  setLocating(false);
                  set(pt);
                }}
                onTap={(pt) => {
                  watch.current?.remove();
                  setLocating(false);
                  set(pt);
                }}
              />
              <Txt v="tiny" muted>
                {t('form.dragPin')}
              </Txt>
            </>
          ) : null}
          {accuracy != null && accuracy > MIN_ACCURACY_M ? (
            <Txt v="tiny" color={C.warn}>
              {t('fcap.accuracyWarn', { m: Math.round(accuracy), min: MIN_ACCURACY_M })}
            </Txt>
          ) : null}
          {likely.length > 0 ? (
            <Note>
              <Txt v="small" bold color="#92400e">
                ⚠️ {t('fcap.likelyDup')}
              </Txt>
              {likely.map((d) => (
                <Txt key={d.id} v="small" color="#92400e">
                  • {d.name} ({d.distanceM} m{'status' in d ? `, ${d.status}` : `, ${t('fcap.pendingCapture')}`})
                </Txt>
              ))}
              <Txt v="tiny" color="#92400e" style={{ marginTop: 4 }}>
                {t('fcap.likelyDupHint')}
              </Txt>
            </Note>
          ) : null}
          {others.length > 0 ? (
            <Txt v="tiny" muted>
              {t('fcap.nearby')}: {others.map((d) => `${d.name} (${d.distanceM} m)`).join(', ')}
            </Txt>
          ) : null}
        </Section>

        <Section n={2} title={t('fcap.nameAddress')}>
          <Field label={`${t('fcap.boardName')} *`} value={p.name} maxLength={100} onChangeText={(v) => set({ name: v })} />
          <Field label={t('pform.nameHi')} value={p.nameHi ?? ''} maxLength={100} onChangeText={(v) => set({ nameHi: orNull(v) })} />
          <View style={{ gap: 6 }}>
            <Txt v="small" bold>
              {t('pform.town')} *
            </Txt>
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              {filters.cities.map((c) => (
                <Chip
                  key={c.id}
                  label={lang === 'hi' && c.nameHi ? c.nameHi : c.name}
                  on={p.cityId === c.id}
                  onPress={() => {
                    townPicked.current = true;
                    set({ cityId: c.id, localityId: null });
                  }}
                />
              ))}
            </Row>
          </View>
          {city?.localities.length ? (
            <View style={{ gap: 6 }}>
              <Txt v="small" bold>
                {t('pform.locality')}
              </Txt>
              <Row style={{ flexWrap: 'wrap' }} gap={6}>
                {city.localities.map((l) => (
                  <Chip key={l.id} label={lang === 'hi' && l.nameHi ? l.nameHi : l.name} on={p.localityId === l.id} onPress={() => set({ localityId: p.localityId === l.id ? null : l.id })} />
                ))}
              </Row>
            </View>
          ) : null}
          <Field label={`${t('pform.address')} *`} value={p.addressLine} maxLength={200} onChangeText={(v) => set({ addressLine: v })} />
          <Row>
            <View style={{ flex: 1 }}>
              <Field label={t('pform.landmark')} value={p.landmark ?? ''} maxLength={120} onChangeText={(v) => set({ landmark: orNull(v) })} />
            </View>
            <View style={{ width: 110 }}>
              <Field label={t('pform.pincode')} keyboardType="number-pad" maxLength={6} value={p.pincode ?? ''} onChangeText={(v) => set({ pincode: orNull(digits(v)) })} />
            </View>
          </Row>
        </Section>

        <Section n={3} title={t('fcap.photos')}>
          <Row style={{ flexWrap: 'wrap' }} gap={6}>
            {PHOTO_KINDS.map((k) => {
              const n = p.photos.filter((ph) => ph.category === k).length;
              return <Chip key={k} label={`${t(`fcap.photo.${k}` as MessageKey)}${n ? ` (${n})` : ''}${k === 'exterior' ? ' *' : ''}`} on={photoKind === k} onPress={() => setPhotoKind(k)} />;
            })}
          </Row>
          <Row>
            <Button style={{ flex: 1 }} icon="📷" title={t('photo.camera')} onPress={() => addPhotos('camera')} busy={photoBusy} disabled={p.photos.length >= MAX_PHOTOS} />
            <Button style={{ flex: 1 }} kind="outline" icon="🖼️" title={t('photo.gallery')} onPress={() => addPhotos('library')} disabled={photoBusy || p.photos.length >= MAX_PHOTOS} />
          </Row>
          {p.photos.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {p.photos.map((ph, i) => (
                <View key={i}>
                  <Image source={ph.dataUrl ?? media(ph.url, 'sm')} style={{ width: 96, height: 96, borderRadius: 8 }} />
                  <View style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 4, paddingHorizontal: 4 }}>
                    <Text style={{ color: '#fff', fontSize: 10 }}>
                      {t(`fcap.photo.${ph.category}` as MessageKey)}
                      {ph.exif?.lat != null ? ' 📍' : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => set({ photos: p.photos.filter((_, j) => j !== i) })}
                    hitSlop={8}
                    accessibilityLabel={t('action.remove')}
                    style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11 }}>✕</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
          <Txt v="tiny" muted>
            {t('fcap.photoHelp')}
          </Txt>
        </Section>

        <Section n={4} title={t('fcap.details')}>
          <Field label={t('pform.cost')} keyboardType="number-pad" value={p.costForTwo ? String(p.costForTwo) : ''} onChangeText={(v) => set({ costForTwo: Math.min(100000, Number(digits(v)) || 0) })} />
          <View style={{ gap: 6 }}>
            <Txt v="small" bold>
              {t('pform.knownFor')}
            </Txt>
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              {p.knownFor.map((k) => (
                <Chip key={k} on label={`${k} ×`} onPress={() => set({ knownFor: p.knownFor.filter((x) => x !== k) })} />
              ))}
            </Row>
            <Field value={dish} placeholder={t('pform.knownForPlaceholder')} onChangeText={setDish} onSubmitEditing={addDish} onBlur={addDish} returnKeyType="done" />
          </View>
          <TaxonomyFields filters={filters} typeSlug={p.typeSlug} cuisineSlugs={p.cuisineSlugs} attributeKeys={p.attributeKeys} onChange={set} />
        </Section>

        <Section n={5} title={t('detail.hours')}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="small" style={{ flex: 1 }}>
              {t('fcap.ownerToldHours')}
            </Txt>
            <Switch value={knowHours} onValueChange={setKnowHours} trackColor={{ true: brand }} />
          </Row>
          {knowHours ? <HoursEditor value={p.hours} onChange={(hours) => set({ hours })} /> : null}
        </Section>

        <Section n={6} title={t('fcap.consent')}>
          <Row>
            <View style={{ flex: 1 }}>
              <Field label={t('fcap.restaurantPhone')} keyboardType="number-pad" maxLength={10} value={p.phone ?? ''} onChangeText={(v) => set({ phone: orNull(digits(v)) })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="WhatsApp" keyboardType="number-pad" maxLength={10} value={p.whatsapp ?? ''} onChangeText={(v) => set({ whatsapp: orNull(digits(v)) })} />
            </View>
          </Row>
          <Row>
            <View style={{ flex: 1 }}>
              <Field label={t('fcap.ownerName')} maxLength={80} value={p.ownerName ?? ''} onChangeText={(v) => set({ ownerName: orNull(v) })} />
            </View>
            <View style={{ flex: 1 }}>
              <Field label={t('fcap.ownerMobile')} keyboardType="number-pad" maxLength={10} value={p.ownerPhone ?? ''} onChangeText={(v) => set({ ownerPhone: orNull(digits(v)) })} />
            </View>
          </Row>
          <Pressable onPress={() => set({ ownerConsent: !p.ownerConsent })} accessibilityRole="checkbox" accessibilityState={{ checked: p.ownerConsent }}>
            <Row style={{ backgroundColor: C.surface, borderRadius: 10, padding: 12, alignItems: 'flex-start' }} gap={10}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: p.ownerConsent ? brand : C.border, backgroundColor: p.ownerConsent ? brand : C.bg, alignItems: 'center', justifyContent: 'center' }}>
                {p.ownerConsent ? <Text style={{ color: '#fff', fontWeight: '700' }}>✓</Text> : null}
              </View>
              <Txt v="small" style={{ flex: 1 }}>
                <Txt v="small" bold>
                  {t('fcap.consentLabel')}
                </Txt>{' '}
                <Txt v="small" muted>
                  {t('fcap.required')}
                </Txt>
              </Txt>
            </Row>
          </Pressable>
          <Row style={{ justifyContent: 'space-between' }}>
            <Txt v="small" style={{ flex: 1 }}>
              {t('fcap.wantsToManage')}
            </Txt>
            <Switch value={p.wantsToManage} onValueChange={(v) => set({ wantsToManage: v })} trackColor={{ true: brand }} />
          </Row>
          <Field label={t('fcap.notes')} multiline maxLength={1000} value={p.notes ?? ''} onChangeText={(v) => set({ notes: orNull(v) })} placeholder={t('fcap.notesPlaceholder')} />
        </Section>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, paddingBottom: 24, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border }}>
        <Button title={saving ? t('action.saving') : online ? t('fcap.saveUpload') : t('fcap.saveOnPhone')} onPress={save} busy={saving} style={{ minHeight: 52 }} />
      </View>
    </View>
  );
}
