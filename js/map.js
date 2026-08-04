import { colorFor } from './score.js';
import { destination, windTo } from './geo.js';

let map;
let segmentLayer;
let windLayer;

// 初始化 Leaflet 地图（L 来自 CDN 全局变量）
export function initMap(center, zoom) {
  map = L.map('map').setView([center.lat, center.lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  segmentLayer = L.layerGroup().addTo(map);
  windLayer = L.layerGroup().addTo(map);
  return map;
}

// 画出所有赛段折线，按 KOM 概率着色；点击联动侧栏
export function drawSegments(scored, onSelect) {
  segmentLayer.clearLayers();
  const bounds = [];
  scored.forEach(s => {
    const color = colorFor(s.probability);
    const line = L.polyline([s.seg.start, s.seg.end], {
      color, weight: 5, opacity: 0.85
    }).addTo(segmentLayer);
    line.bindPopup(
      '<b>' + s.seg.name + '</b><br>' +
      '骑行方向 ' + Math.round(s.segBearing) + '°<br>' +
      'KOM 概率 ' + Math.round(s.probability * 100) + '% (' +
      (s.recommended ? '推荐冲击' : '暂不推荐') + ')'
    );
    line.on('click', () => onSelect && onSelect(s));
    bounds.push(s.seg.start, s.seg.end);
  });
  if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
}

// 在每个赛段中点画风向箭头（箭头指向风的「吹向」）
export function drawWindArrows(points) {
  windLayer.clearLayers();
  points.forEach(p => {
    const to = windTo(p.dirFrom);
    const len = 0.018 + Math.min(p.speed, 45) / 45 * 0.03;
    const head = destination([p.lat, p.lng], to, len);
    L.polyline([[p.lat, p.lng], head], {
      color: '#2563eb', weight: 3, opacity: 0.9, dashArray: '4 4'
    }).addTo(windLayer);
    L.circleMarker([p.lat, p.lng], {
      radius: 3, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 1
    }).addTo(windLayer).bindTooltip(
      Math.round(p.speed) + ' km/h · 风从 ' + Math.round(p.dirFrom) + '° 吹来'
    );
  });
}

// 高亮某个赛段（点击列表时）
export function highlightSegment(scored, segId) {
  segmentLayer.eachLayer(layer => {
    const s = scored.find(x => x.seg.id === segId);
    if (!s) return;
    // 简单处理：放大线宽提示
    if (s.seg.id === segId) layer.setStyle({ weight: 8 });
    else layer.setStyle({ weight: 5 });
  });
}
