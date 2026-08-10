// 地图渲染（依赖全局 Leaflet，由 index.html 的 CDN 引入）
import { colorFor, labelFor } from './score.js';
import { WindParticleLayer } from './wind-particles.js';

let map = null;
let segmentLayer = null;
let windLayer = null; // WindParticleLayer canvas overlay
const lineMap = {}; // id -> polyline

export function initMap(center, zoom) {
  // 强制使用 SVG renderer，确保 CSS SVG filter（手绘涂鸦效果）生效
  const svgRenderer = L.svg({ padding: 0.5 });
  map = L.map('map', { renderer: svgRenderer }).setView([center.lat, center.lng], zoom);
  const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);
  // 底图瓦片加载失败时给出温和提示（避免灰白底图让人误以为网站坏了）
  tiles.on('tileerror', () => {
    map.getContainer().classList.add('map-tiles-failed');
  });
  segmentLayer = L.layerGroup().addTo(map);

  // 密集风场粒子层（默认显示，海军蓝加粗加长拖尾）
  windLayer = new WindParticleLayer({
    maxParticles: 900,
    trailLength: 180,
    baseSpeed: 0.30,
    sampleInterval: 3,
    maxFps: 30
  }).addTo(map);

  return map;
}

export function drawSegments(scored, onSelect, selectedId = null) {
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
      weight: s.seg.id === selectedId ? 9 : 6,
      opacity: s.seg.id === selectedId ? 1 : 0.9,
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
    base.on('click', () => onSelect && onSelect(s.seg.id));
    const startIcon = L.divIcon({ className: 'segment-endpoint start', html: '起', iconSize: [24, 24], iconAnchor: [12, 12] });
    const endIcon = L.divIcon({ className: 'segment-endpoint end', html: '终', iconSize: [24, 24], iconAnchor: [12, 12] });
    L.marker(latlngs[0], { icon: startIcon, interactive: false }).addTo(segmentLayer);
    L.marker(latlngs[latlngs.length - 1], { icon: endIcon, interactive: false }).addTo(segmentLayer);
    const middle = latlngs[Math.floor(latlngs.length / 2)];
    const arrowIcon = L.divIcon({
      className: 'segment-direction',
      html: `<span style="transform:rotate(${s.segBearing}deg)">↑</span>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });
    L.marker(middle, { icon: arrowIcon, interactive: false }).addTo(segmentLayer);
    lineMap[s.seg.id] = base;
    bounds.push(...latlngs);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
}

export function drawWindFlow(points) {
  if (!windLayer) return;
  const avg = points.length
    ? points.reduce((a, p) => a + p.speed, 0) / points.length
    : 10;
  const fallback = points.length
    ? { dirFrom: points[0].dirFrom, speed: avg }
    : { dirFrom: 270, speed: 10 };
  windLayer.setWind(points, fallback);
  windLayer.setVisible(true);
}

export function highlightSegment(scored, id) {
  const target = lineMap[id];
  if (!target) return;
  Object.values(lineMap).forEach(l => l.setStyle({ weight: 6, opacity: 0.9 }));
  target.setStyle({ weight: 9, opacity: 1 });
  map.fitBounds(target.getBounds(), { padding: [60, 60], maxZoom: 14 });
}
