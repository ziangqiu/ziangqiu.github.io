// 地图渲染（依赖全局 Leaflet，由 index.html 的 CDN 引入）
import { colorFor, labelFor } from './score.js';
import { destination } from './geo.js';

let map = null;
let segmentLayer = null;
let windLayer = null;
const lineMap = {}; // id -> polyline

export function initMap(center, zoom) {
  map = L.map('map').setView([center.lat, center.lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);
  segmentLayer = L.layerGroup().addTo(map);
  windLayer = L.layerGroup().addTo(map);
  return map;
}

export function drawSegments(scored, onSelect) {
  segmentLayer.clearLayers();
  for (const k in lineMap) delete lineMap[k];
  const bounds = [];
  scored.forEach(s => {
    const color = colorFor(s.probability);
    const line = L.polyline([s.seg.start, s.seg.end], {
      color, weight: 5, opacity: 0.85
    }).addTo(segmentLayer);
    line.bindPopup(
      `<b>${s.seg.name}</b><br>骑行方向 ${Math.round(s.segBearing)}°` +
      `<br>KOM 概率 ${Math.round(s.probability * 100)}% · ${labelFor(s.probability)}`
    );
    line.on('click', () => onSelect && onSelect(s));
    lineMap[s.seg.id] = line;
    bounds.push(s.seg.start, s.seg.end);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
}

export function drawWindArrows(points) {
  windLayer.clearLayers();
  points.forEach(p => {
    const to = (p.dirFrom + 180) % 360;
    const len = 0.02 + Math.min(p.speed, 40) / 40 * 0.03;
    const head = destination([p.lat, p.lng], to, len);
    L.polyline([[p.lat, p.lng], head], {
      color: '#2563eb', weight: 3, opacity: 0.9, dashArray: '4 4'
    }).addTo(windLayer);
    L.circleMarker([p.lat, p.lng], {
      radius: 3, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1
    }).addTo(windLayer)
      .bindTooltip(`${Math.round(p.speed)} km/h · 风从 ${Math.round(p.dirFrom)}°`);
  });
}

export function highlightSegment(scored, id) {
  const target = lineMap[id];
  if (!target) return;
  Object.values(lineMap).forEach(l => l.setStyle({ weight: 5, opacity: 0.85 }));
  target.setStyle({ weight: 8, opacity: 1 });
  map.fitBounds(target.getBounds(), { padding: [60, 60], maxZoom: 14 });
}
