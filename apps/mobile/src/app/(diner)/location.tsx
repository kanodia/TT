import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Map } from '@/components/Map';
import { Button, C, Chip, Divider, ErrorNote, Field, Note, Row, Txt } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { reverseGeocode, useBrand, useSession, type Place } from '@/lib/session';

type GeoPlace = { type: string; id: string; name: string; nameHi: string | null; label: string; lat: number; lng: number; cityId: string | null };
type Address = { id: string; label: 'home' | 'work' | 'other'; addressText: string; lat: number; lng: number; isDefault: boolean };
const LABEL_ICON = { home: '🏠', work: '💼', other: '📌' };

/** "We're not here yet" with an SMS waitlist (spec 2.1). */
function NotLive({ lat, lng }: { lat: number; lng: number }) {
  const { t } = useSession();
  const [phone, setPhone] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) return <Note tone="good">{t('place.notifyDone')}</Note>;
  return (
    <Note>
      <View style={{ gap: 8 }}>
        <Txt bold>{t('place.notLiveTitle')}</Txt>
        <Txt v="small" color="#92400e">
          {t('place.notLiveBody')}
        </Txt>
        <ErrorNote message={error} />
        <Row>
          <View style={{ flex: 1 }}>
            <Field keyboardType="number-pad" maxLength={10} placeholder="98xxxxxxxx" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, ''))} />
          </View>
          <Button
            title={t('place.notifyMe')}
            disabled={phone.length !== 10}
            onPress={async () => {
              try {
                await api('/v1/geo/waitlist', { method: 'POST', body: { phone, lat, lng } });
                setDone(true);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          />
        </Row>
      </View>
    </Note>
  );
}

/** Choose location: GPS, search, saved places, or drag a pin (spec 2.1). */
export default function LocationScreen() {
  const { setPlace, locate, place, me, t, lang } = useSession();
  const brand = useBrand();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [mode, setMode] = useState<'list' | 'map'>('list');
  const [pin, setPin] = useState({ lat: place.lat, lng: place.lng });
  const [locating, setLocating] = useState(false);
  const [notLive, setNotLive] = useState<{ lat: number; lng: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      api<{ data: GeoPlace[] }>('/v1/geo/autocomplete', { query: { q, lat: place.lat, lng: place.lng } })
        .then((r) => setResults(r.data))
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [q, place.lat, place.lng]);

  useEffect(() => {
    if (!me) return;
    api<{ data: Address[] }>('/v1/me/addresses')
      .then((r) => setAddresses(r.data))
      .catch(() => {});
  }, [me]);

  function finish(p: Place) {
    setPlace(p);
    if (p.isLive === false) return setNotLive({ lat: p.lat, lng: p.lng });
    router.back();
  }

  async function useMine() {
    setLocating(true);
    setError(null);
    try {
      const p = await locate();
      if (p.isLive === false) setNotLive({ lat: p.lat, lng: p.lng });
      else router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLocating(false);
    }
  }

  async function pickAt(lat: number, lng: number, label?: string) {
    const r = await reverseGeocode(lat, lng);
    finish({ lat, lng, label: label ?? r.label ?? t('place.pickOnMap'), cityId: r.cityId, precise: true, isLive: r.isLive });
  }

  async function saveCurrent(label: Address['label']) {
    try {
      const a = await api<Address>('/v1/me/addresses', { method: 'POST', body: { label, addressText: place.label, lat: place.lat, lng: place.lng, isDefault: label === 'home' } });
      setAddresses([...addresses, a]);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const top = (
    <View style={{ gap: 12, paddingBottom: 8 }}>
      {notLive ? <NotLive lat={notLive.lat} lng={notLive.lng} /> : null}
      <Row>
        <Button style={{ flex: 1 }} kind="outline" icon="📍" title={t('place.useCurrent')} onPress={useMine} busy={locating} />
        <Button
          style={{ flex: 1 }}
          kind="outline"
          active={mode === 'map'}
          icon="🗺️"
          title={t('place.pickOnMap')}
          onPress={() => {
            setPin({ lat: place.lat, lng: place.lng });
            setMode(mode === 'map' ? 'list' : 'map');
          }}
        />
      </Row>
      <ErrorNote message={error} />
      {mode === 'list' ? (
        <>
          {me && addresses.length > 0 ? (
            <View style={{ gap: 4 }}>
              <Txt v="small" bold muted>
                {t('place.saved')}
              </Txt>
              {addresses.map((a) => (
                <Row key={a.id}>
                  <Pressable style={{ flex: 1, paddingVertical: 8 }} onPress={() => pickAt(a.lat, a.lng, a.addressText)}>
                    <Txt bold>
                      {LABEL_ICON[a.label]} {t(`place.label.${a.label}`)}
                    </Txt>
                    <Txt v="tiny" muted>
                      {a.addressText}
                    </Txt>
                  </Pressable>
                  <Pressable
                    hitSlop={10}
                    onPress={async () => {
                      await api(`/v1/me/addresses/${a.id}`, { method: 'DELETE' }).catch(() => {});
                      setAddresses(addresses.filter((x) => x.id !== a.id));
                    }}
                    accessibilityLabel={t('action.remove')}
                  >
                    <Txt muted>✕</Txt>
                  </Pressable>
                </Row>
              ))}
            </View>
          ) : null}
          {me ? (
            <Row style={{ flexWrap: 'wrap' }} gap={6}>
              <Txt v="tiny" muted>
                {t('place.saveThis')}:
              </Txt>
              {(['home', 'work', 'other'] as const).map((l) => (
                <Chip key={l} label={`${LABEL_ICON[l]} ${t(`place.label.${l}`)}`} onPress={() => saveCurrent(l)} />
              ))}
            </Row>
          ) : null}
          <Field placeholder={t('place.search')} value={q} onChangeText={setQ} />
        </>
      ) : null}
    </View>
  );

  if (mode === 'map') {
    return (
      <View style={{ flex: 1, padding: 16, gap: 8 }}>
        {top}
        <Txt v="tiny" muted>
          {t('place.pickOnMapHint')}
        </Txt>
        <Map style={{ flex: 1, borderRadius: 12 }} center={pin} zoom={15} brand={brand} onDragEnd={setPin} onTap={setPin} pins={[{ id: 'drag', lat: pin.lat, lng: pin.lng, tone: 'drag' }]} />
        <Button title={t('place.confirmPin')} onPress={() => pickAt(pin.lat, pin.lng)} />
      </View>
    );
  }

  return (
    <FlatList
      data={results}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ padding: 16 }}
      keyExtractor={(p) => `${p.type}-${p.id}`}
      ListHeaderComponent={top}
      ItemSeparatorComponent={Divider}
      renderItem={({ item: p }) => (
        <Pressable
          style={{ paddingVertical: 10, flexDirection: 'row', gap: 12, alignItems: 'center' }}
          onPress={() => (p.cityId ? finish({ lat: p.lat, lng: p.lng, label: p.label, cityId: p.cityId, isLive: true }) : pickAt(p.lat, p.lng, p.label))}
        >
          <Txt>{p.type === 'city' ? '🏙️' : p.type === 'address' ? '🏠' : '📌'}</Txt>
          <View style={{ flex: 1 }}>
            <Txt bold>{lang === 'hi' && p.nameHi ? p.nameHi : p.name}</Txt>
            <Txt v="tiny" muted>
              {p.label}
            </Txt>
          </View>
        </Pressable>
      )}
      ListFooterComponent={
        <Txt v="tiny" muted style={{ paddingTop: 12 }}>
          {t('place.liveNote')}
        </Txt>
      }
      style={{ backgroundColor: C.bg }}
    />
  );
}
