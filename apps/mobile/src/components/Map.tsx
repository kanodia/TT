import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { ratingColor } from '@shared/format';
import { C } from './ui';

export type Pin = { id: string; lat: number; lng: number; label?: string; rating?: number; tone?: 'me' | 'lead' | 'listed' | 'brand' | 'drag'; onPress?: () => void };
type LatLng = { lat: number; lng: number };

// Same OpenStreetMap tiles as the website, drawn with Leaflet in a WebView: works in Expo Go and store
// builds with no Google key. Before launch, point EXPO_PUBLIC_MAP_TILES at a paid tile provider
// (OSM's own servers are for light use only).
const TILES = process.env.EXPO_PUBLIC_MAP_TILES ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = process.env.EXPO_PUBLIC_MAP_ATTRIBUTION ?? '© OpenStreetMap';

const html = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
html,body,#m{margin:0;height:100%;background:#eef0f3}
.b{color:#fff;font:700 12px/1.2 sans-serif;padding:3px 6px;border-radius:8px;border:1.5px solid #fff;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.35);transform:translate(-50%,-100%);display:inline-block}
.leaflet-control-attribution{font-size:9px}
</style></head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
var map=L.map('m',{zoomControl:false}).setView([27.735,75.78],14);
L.tileLayer(${JSON.stringify(TILES)},{maxZoom:19,attribution:${JSON.stringify(ATTRIBUTION)}}).addTo(map);
var layer=L.layerGroup().addTo(map), first=true;
map.on('click',function(e){post({type:'tap',lat:e.latlng.lat,lng:e.latlng.lng})});
window.render=function(d){
  layer.clearLayers();
  var pts=[];
  (d.polygons||[]).forEach(function(r){var p=L.polygon(r.map(function(x){return[x.lat,x.lng]}),{color:d.brand,weight:2,fillOpacity:.12});layer.addLayer(p);r.forEach(function(x){pts.push([x.lat,x.lng])})});
  d.pins.forEach(function(p){
    var m;
    if(p.tone==='drag'){m=L.marker([p.lat,p.lng],{draggable:true});m.on('dragend',function(){var ll=m.getLatLng();post({type:'drag',lat:ll.lat,lng:ll.lng})})}
    else if(p.rating!==undefined){m=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:'<span class="b" style="background:'+p.color+'">'+p.text+'</span>',iconSize:[0,0]})})}
    else{m=L.circleMarker([p.lat,p.lng],{radius:p.tone==='me'?7:8,color:'#fff',weight:2,fillColor:p.color,fillOpacity:1})}
    if(p.label)m.bindTooltip(p.label,{direction:'top',offset:[0,-14]});
    m.on('click',function(){post({type:'press',id:p.id})});
    layer.addLayer(m);pts.push([p.lat,p.lng]);
  });
  if(first||d.recenter){
    if(d.fit&&pts.length>1)map.fitBounds(pts,{padding:[30,30],maxZoom:16});
    else map.setView([d.center.lat,d.center.lng],d.zoom);
    first=false;
  }
};
post({type:'ready'});
</script></body></html>`;

/**
 * Map with rating pins (spec 2.2), area outlines and an optional draggable pin.
 * `fit` zooms to show every pin; `recenterKey` changing moves the view to `center` again.
 */
export function Map({
  center,
  pins = [],
  zoom = 15,
  style,
  polygons = [],
  fit,
  recenterKey,
  onDragEnd,
  onTap,
  brand = '#e23744',
}: {
  center: LatLng;
  pins?: Pin[];
  zoom?: number;
  style?: StyleProp<ViewStyle>;
  polygons?: LatLng[][];
  fit?: boolean;
  recenterKey?: string | number;
  onDragEnd?: (p: LatLng) => void;
  onTap?: (p: LatLng) => void;
  brand?: string;
}) {
  const ref = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const lastKey = useRef(recenterKey);
  const handlers = useRef({ pins, onDragEnd, onTap });
  useEffect(() => {
    handlers.current = { pins, onDragEnd, onTap };
  });
  // Pins and polygons are rebuilt by parents each render; their JSON is the real dependency.
  const pinsKey = JSON.stringify(pins.map(({ onPress: _onPress, ...p }) => p));
  const polygonsKey = JSON.stringify(polygons);

  const data = useMemo(
    () => ({
      center,
      zoom,
      fit: !!fit,
      brand,
      polygons,
      pins: pins.map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        label: p.label,
        tone: p.tone,
        rating: p.rating,
        text: p.rating === undefined ? undefined : p.rating ? `${p.rating.toFixed(1)}★` : 'New',
        color: p.rating !== undefined ? (p.rating ? ratingColor(p.rating) : C.muted) : p.tone === 'me' ? '#2563eb' : p.tone === 'lead' ? '#d97706' : p.tone === 'listed' ? '#6b7280' : brand,
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinsKey, polygonsKey, center.lat, center.lng, zoom, fit, brand],
  );

  useEffect(() => {
    if (!ready) return;
    const recenter = lastKey.current !== recenterKey;
    lastKey.current = recenterKey;
    ref.current?.injectJavaScript(`window.render(${JSON.stringify({ ...data, recenter })});true;`);
  }, [ready, data, recenterKey]);

  function onMessage(e: WebViewMessageEvent) {
    const m = JSON.parse(e.nativeEvent.data) as { type: string; id?: string; lat?: number; lng?: number };
    const h = handlers.current;
    if (m.type === 'ready') setReady(true);
    else if (m.type === 'press') h.pins.find((p) => p.id === m.id)?.onPress?.();
    else if (m.type === 'drag') h.onDragEnd?.({ lat: m.lat!, lng: m.lng! });
    else if (m.type === 'tap') h.onTap?.({ lat: m.lat!, lng: m.lng! });
  }

  return (
    <View style={[{ minHeight: 160, overflow: 'hidden', backgroundColor: '#eef0f3' }, style]}>
      <WebView
        ref={ref}
        source={{ html, baseUrl: 'https://localhost/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        setSupportMultipleWindows={false}
        style={{ flex: 1, backgroundColor: 'transparent' }}
      />
      {!ready ? <ActivityIndicator style={StyleSheet.absoluteFill} color={brand} /> : null}
    </View>
  );
}
