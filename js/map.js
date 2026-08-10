// 地图渲染（依赖全局 Leaflet，由 index.html 的 CDN 引入）
import { colorFor, labelFor } from './score.js?v=20260810092927';
import { WindParticleLayer } from './wind-particles.js?v=20260810092927';

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
    // A segment may opt into a fixed route colour (the test route is red); otherwise
    // use its wind-score colour.
    const color = s.seg.mapColor || colorFor(s.probability);
    const latlngs = s.seg.geometry && s.seg.geometry.length >= 2
      ? s.seg.geometry
      : [s.seg.start, s.seg.end];

    // 细路线贴合道路宽度；点击则交给下方不可见的宽命中区域。
    const base = L.polyline(latlngs, {
      color,
      weight: s.seg.id === selectedId ? 3 : 2.2,
      opacity: s.seg.id === selectedId ? 0.96 : 0.82,
      lineCap: 'round',
      lineJoin: 'round',
      className: 'segment-route'
    }).addTo(segmentLayer);

    // 看不见但足够宽，手机上无需精确点中细线也能选择赛段。
    const hitArea = L.polyline(latlngs, {
      color: 'transparent', weight: 18, opacity: 0, lineCap: 'round', lineJoin: 'round'
    }).addTo(segmentLayer);

    base.bindPopup(
      `<b>${s.seg.name}</b><br>骑行方向 ${Math.round(s.segBearing)}°` +
      `<br>KOM 概率 ${Math.round(s.probability * 100)}% · ${labelFor(s.probability)}`
    );
    const select = () => onSelect && onSelect(s.seg.id);
    base.on('click', select);
    hitArea.on('click', select);
    const startIcon = L.divIcon({ className: 'segment-endpoint start', html: 'S', iconSize: [16, 16], iconAnchor: [8, 8] });
    const endIcon = L.divIcon({ className: 'segment-endpoint end', html: 'F', iconSize: [16, 16], iconAnchor: [8, 8] });
    L.marker(latlngs[0], { icon: startIcon, interactive: false }).addTo(segmentLayer);
    L.marker(latlngs[latlngs.length - 1], { icon: endIcon, interactive: false }).addTo(segmentLayer);
    const middle = latlngs[Math.floor(latlngs.length / 2)];
    const arrowIcon = L.divIcon({
      className: 'segment-direction',
      html: `<span style="transform:rotate(${s.segBearing}deg)">↑</span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
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
  Object.values(lineMap).forEach(l => l.setStyle({ weight: 2.2, opacity: 0.82 }));
  target.setStyle({ weight: 3, opacity: 0.96 });
  map.fitBounds(target.getBounds(), { padding: [60, 60], maxZoom: 14 });
}
