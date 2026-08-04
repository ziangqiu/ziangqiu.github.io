// 地图渲染（依赖全局 Leaflet，由 index.html 的 CDN 引入）
import { colorFor, labelFor } from './score.js';
import { destination } from './geo.js';

let map = null;
let segmentLayer = null;
let windLayer = null;
const lineMap = {}; // id -> polyline

export function initMap(center, zoom) {
  // 强制使用 SVG renderer，确保 CSS SVG filter（手绘涂鸦效果）生效
  const svgRenderer = L.svg({ padding: 0.5 });
  map = L.map('map', { renderer: svgRenderer }).setView([center.lat, center.lng], zoom);
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
    const latlngs = s.seg.geometry && s.seg.geometry.length >= 2
      ? s.seg.geometry
      : [s.seg.start, s.seg.end];

    // 底层：概率色粗线 + rough 手绘滤镜
    const base = L.polyline(latlngs, {
      color,
      weight: 6,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'rough-seg'
    }).addTo(segmentLayer);

    // 上层：白色点状虚线，模拟小朋友描边
    L.polyline(latlngs, {
      color: 'rgba(255,255,255,0.7)',
      weight: 2.5,
      opacity: 0.9,
      dashArray: '2 8',
      lineCap: 'round',
      lineJoin: 'round',
      className: 'rough-seg-2'
    }).addTo(segmentLayer);

    base.bindPopup(
      `<b>${s.seg.name}</b><br>骑行方向 ${Math.round(s.segBearing)}°` +
      `<br>KOM 概率 ${Math.round(s.probability * 100)}% · ${labelFor(s.probability)}`
    );
    base.on('click', () => onSelect && onSelect(s));
    lineMap[s.seg.id] = base;
    bounds.push(...latlngs);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
}

function windArrowIcon(angleDeg, speed) {
  const size = 22 + Math.min(speed, 40) / 40 * 8; // 22..30
  const svg = `<svg class="wind-arrow-svg" viewBox="0 0 24 24" width="${size}" height="${size}">
    <defs>
      <linearGradient id="windGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%"  stop-color="#7fc8ff"/>
        <stop offset="100%" stop-color="#0a84ff"/>
      </linearGradient>
      <filter id="windShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#003366" flood-opacity="0.35"/>
      </filter>
    </defs>
    <path d="M12 2 L12 20 M12 20 L6 13 M12 20 L18 13"
          fill="none" stroke="url(#windGrad)" stroke-width="2.4"
          stroke-linecap="round" stroke-linejoin="round" filter="url(#windShadow)"/>
  </svg>`;
  return L.divIcon({
    className: 'wind-arrow-wrap',
    html: `<div class="wind-arrow pulse" style="transform: rotate(${angleDeg}deg); width:${size}px;height:${size}px">${svg}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2]
  });
}

export function drawWindArrows(points, loggedIn) {
  windLayer.clearLayers();
  points.forEach(p => {
    const to = (p.dirFrom + 180) % 360;
    if (!loggedIn) {
      // 未登录：保留原来的蓝色虚线段 + 圆点
      const len = 0.02 + Math.min(p.speed, 40) / 40 * 0.03;
      const head = destination([p.lat, p.lng], to, len);
      L.polyline([[p.lat, p.lng], head], {
        color: '#2563eb', weight: 3, opacity: 0.9, dashArray: '4 4'
      }).addTo(windLayer);
      L.circleMarker([p.lat, p.lng], {
        radius: 3, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1
      }).addTo(windLayer)
        .bindTooltip(`${Math.round(p.speed)} km/h · 风从 ${Math.round(p.dirFrom)}°`);
    } else {
      // 登录后：Apple 天气风格有质感箭头
      L.marker([p.lat, p.lng], { icon: windArrowIcon(to, p.speed) })
        .addTo(windLayer)
        .bindTooltip(`${Math.round(p.speed)} km/h · 风从 ${Math.round(p.dirFrom)}°`);
    }
  });
}

export function highlightSegment(scored, id) {
  const target = lineMap[id];
  if (!target) return;
  Object.values(lineMap).forEach(l => l.setStyle({ weight: 6, opacity: 0.9 }));
  target.setStyle({ weight: 9, opacity: 1 });
  map.fitBounds(target.getBounds(), { padding: [60, 60], maxZoom: 14 });
}
