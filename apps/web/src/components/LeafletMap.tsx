'use client';

import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, Polygon, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';

export type Pin = { id: string; lat: number; lng: number; label: string; sub?: string; href?: string; tone?: 'brand' | 'me' | 'muted' | 'lead'; rating?: number };

// Default marker images don't survive bundling, so pins are plain CSS dots.
function ratingColor(r: number) {
  return r >= 4 ? '#267e3e' : r >= 3 ? '#db7c38' : r > 0 ? '#cb202d' : '#6b7280';
}

function icon(tone: Pin['tone'], label?: string, rating?: number) {
  // Map pins carry a rating badge (spec 2.2).
  if (rating !== undefined) {
    const text = label ? `<span style="position:absolute;left:36px;top:2px;white-space:nowrap;font:600 11px system-ui;color:#111;text-shadow:0 0 3px #fff,0 0 3px #fff">${label.replace(/</g, '&lt;')}</span>` : '';
    return L.divIcon({
      className: '',
      html: `<span style="position:relative;display:inline-block;padding:1px 5px;border-radius:6px;background:${ratingColor(rating)};color:#fff;font:700 11px system-ui;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${rating > 0 ? rating.toFixed(1) + '★' : 'New'}${text}</span>`,
      iconSize: [34, 20],
      iconAnchor: [17, 10],
    });
  }
  const color = tone === 'me' ? '#2563eb' : tone === 'muted' ? '#6b7280' : tone === 'lead' ? '#d97706' : 'var(--brand)';
  const text = label ? `<span style="position:absolute;left:18px;top:-2px;white-space:nowrap;font:600 11px system-ui;color:#111;text-shadow:0 0 3px #fff,0 0 3px #fff">${label.replace(/</g, '&lt;')}</span>` : '';
  return L.divIcon({
    className: '',
    html: `<span style="position:relative;display:block;width:16px;height:16px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)">${text}</span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function FitBounds({ pins, center }: { pins: Pin[]; center: [number, number] }) {
  const map = useMap();
  const key = pins.map((p) => p.id).join(',');
  useEffect(() => {
    if (pins.length > 1) map.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng])), { padding: [30, 30], maxZoom: 16 });
    else map.setView(pins[0] ? [pins[0].lat, pins[0].lng] : center, 15);
    // Refit only when the set of pins changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function ClickToPick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export default function LeafletMap({
  pins,
  center,
  className = 'h-80',
  onPick,
  showLabels,
  areas = [],
}: {
  pins: Pin[];
  /** Beat boundaries as rings of [lat, lng] (spec 7.3 "My area"). */
  areas?: { id: string; ring: [number, number][] }[];
  center: [number, number];
  className?: string;
  /** Makes the map a location picker: clicking moves the pin. */
  onPick?: (lat: number, lng: number) => void;
  showLabels?: boolean;
}) {
  return (
    <MapContainer center={center} zoom={15} scrollWheelZoom={false} className={`z-0 w-full rounded-xl ${className}`}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {areas.map((a) => (
        <Polygon key={a.id} positions={a.ring} pathOptions={{ color: '#2563eb', weight: 2, fillOpacity: 0.06 }} />
      ))}
      {!onPick && <FitBounds pins={pins} center={center} />}
      {onPick && <ClickToPick onPick={onPick} />}
      {pins.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={icon(p.tone, showLabels ? p.label : undefined, p.rating)}
          draggable={!!onPick}
          eventHandlers={onPick ? { dragend: (e) => { const ll = (e.target as L.Marker).getLatLng(); onPick(ll.lat, ll.lng); } } : undefined}
        >
          {!onPick && (
            <Popup>
              {p.href ? (
                <a href={p.href} className="font-semibold">
                  {p.label}
                </a>
              ) : (
                <b>{p.label}</b>
              )}
              {p.sub && <div className="text-xs">{p.sub}</div>}
            </Popup>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}
