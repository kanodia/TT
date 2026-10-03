import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Map, type Pin } from '@/components/Map';
import { C, Note, Row, Txt } from '@/components/ui';
import { api } from '@/lib/api';
import { cached } from '@/lib/fieldQueue';
import { useFieldSync } from '@/lib/fieldSync';
import { useBrand, useSession } from '@/lib/session';

type Areas = {
  data: { id: string; name: string; city: { name: string; lat: number; lng: number }; boundary: { type: 'Polygon'; coordinates: [number, number][][] } | null }[];
  leads: { id: string; name: string; lat: number | null; lng: number | null }[];
  places: { id: string; name: string; lat: number; lng: number; status: string }[];
};

/** "My area" (spec 7.3): assigned beat outlines, leads to visit and places already listed (to avoid repeats). */
export default function FieldArea() {
  const { t } = useSession();
  const brand = useBrand();
  const insets = useSafeAreaInsets();
  const { online } = useFieldSync();
  const [areas, setAreas] = useState<{ data: Areas; offline: boolean } | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);

  useFocusEffect(
    useCallback(() => {
      cached('areas', () => api<Areas>('/v1/field/me/areas'))
        .then(setAreas)
        .catch(() => {});
      Location.getForegroundPermissionsAsync()
        .then((p) => (p.granted ? Location.getLastKnownPositionAsync() : null))
        .then((pos) => pos && setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }))
        .catch(() => {});
    }, []),
  );

  const a = areas?.data;
  const area = a?.data[0];
  const pins: Pin[] = [
    ...(a?.places ?? []).map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, label: `${p.name} · ${t('fhome.alreadyListed')}`, tone: 'listed' as const })),
    ...(a?.leads ?? []).filter((l) => l.lat != null && l.lng != null).map((l) => ({ id: `lead-${l.id}`, lat: l.lat!, lng: l.lng!, label: `${l.name} · ${t('fhome.toVisit')}`, tone: 'lead' as const })),
    ...(me ? [{ id: 'me', lat: me.lat, lng: me.lng, label: t('list.you'), tone: 'me' as const }] : []),
  ];
  const polygons = (a?.data ?? []).flatMap((x) => (x.boundary ? [x.boundary.coordinates[0].map(([lng, lat]) => ({ lat, lng }))] : []));

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={{ padding: 16, gap: 4 }}>
        <Txt v="h2">
          {t('fhome.myArea')}
          {area ? <Txt muted> · {area.name}</Txt> : null}
        </Txt>
        <Row gap={14}>
          <Txt v="tiny" color="#d97706">
            ● {t('fhome.toVisit')}
          </Txt>
          <Txt v="tiny" muted>
            ● {t('fhome.alreadyListed')}
          </Txt>
          <Txt v="tiny" color="#2563eb">
            ● {t('list.you')}
          </Txt>
        </Row>
      </View>
      {!online ? <Note style={{ marginHorizontal: 16, marginBottom: 8 }}>{t('farea.offlineMap')}</Note> : null}
      {a ? (
        <Map style={{ flex: 1 }} center={area?.city ?? me ?? { lat: 27.735, lng: 75.78 }} zoom={14} fit={pins.length > 1 || polygons.length > 0} pins={pins} polygons={polygons} brand={brand} />
      ) : null}
      {a && !a.data.length && !a.leads.length ? <Note style={{ margin: 16 }}>{t('farea.noBeat')}</Note> : null}
    </View>
  );
}
