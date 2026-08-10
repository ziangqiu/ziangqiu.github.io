// 主逻辑：全城风向网格采样 + 地图风场渲染 + 始终可见的风速/推荐面板
// 说明：登录门槛已移除，所有内容无需登录即可访问。预设赛段已清空，
// 由用户自行在 data/vancouver-segments.json 中添加赛段。
import { CONFIG } from './config.js?v=20260810092927';
import { fetchWinds, currentWind } from './wind.js?v=20260810092927';
import { initMap, drawSegments, drawWindFlow } from './map.js?v=20260810092927';
import { colorFor, labelFor, rank, scoreSegment } from './score.js?v=20260810092927';

const state = {
  windPoints: [],   // 全城网格风场采样点 {lat, lng, speed, dirFrom}
  cityWind: null,
  wind: null,
  segments: [],
  scored: [],
  selectedId: null,
  filter: 'all',
  query: ''
};

const $ = id => document.getElementById(id);

const windTo = deg => (deg + 180) % 360;

// 在温哥华都会区范围内生成覆盖全城的采样网格（不再依赖赛段）
function buildWindGrid() {
  const c = CONFIG.city;
  const span = 0.18;          // 约 ±20km，覆盖大温
  const cols = 4, rows = 4;   // 4×4 = 16 个采样点
  const pts = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const lat = c.lat - span + (2 * span) * i / (cols - 1);
      const lng = c.lng - span + (2 * span) * j / (rows - 1);
      pts.push([lat, lng]);
    }
  }
  return pts;
}

function fmtTime(d) {
  return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', weekday: 'short' });
}

function renderWindCard() {
  const c = state.cityWind;
  if (!c) {
    $('wind-card').innerHTML = '<h3>当前温哥华风向</h3><p class="muted small">实时风向数据暂不可用（可能受网络限制，请稍后刷新重试）。</p>';
    return;
  }
  $('wind-card').innerHTML = `
    <h3>当前温哥华风向</h3>
    <div class="big-wind">
      <div class="wind-num">${Math.round(c.speed)}<span>km/h</span></div>
      <div class="wind-dir">风从 <b>${Math.round(c.dirFrom)}°</b> 吹来<br>
        吹向 <b>${Math.round(windTo(c.dirFrom))}°</b></div>
    </div>
    <p class="muted small">数据来源：Open-Meteo 实时预报（${fmtTime(c.time)}）</p>`;
}

function renderRecommendations() {
  const box = $('rec-list');
  if (!state.scored.length) {
    box.innerHTML = '<p class="muted small">正在准备赛段推荐…</p>';
    return;
  }
  box.innerHTML = rank(state.scored).map(item => `
    <button class="rec-item ${item.seg.id === state.selectedId ? 'selected' : ''}" data-segment-id="${item.seg.id}">
      <i class="rec-dot" style="background:${colorFor(item.probability)}"></i>
      <span class="rec-main"><span class="rec-name">${item.seg.name}</span>
      <span class="rec-sub">最佳 ${fmtTime(item.best.time)} · 顺风 ${formatComponent(item.best.comp)}</span></span>
      <span class="rec-prob">${Math.round(item.probability * 100)}%<span>${labelFor(item.probability)}</span></span>
    </button>`).join('');
  bindSegmentButtons(box);
}

function renderBrowser() {
  const box = $('seg-list');
  const visible = state.scored.filter(item =>
    (state.filter === 'all' || item.seg.difficulty === state.filter) &&
    item.seg.name.toLowerCase().includes(state.query.toLowerCase())
  );
  if (!visible.length) {
    box.innerHTML = '<p class="muted small">没有符合条件的赛段。</p>';
    return;
  }
  box.innerHTML = visible.map(item => `
    <button class="rec-item ${item.seg.id === state.selectedId ? 'selected' : ''}" data-segment-id="${item.seg.id}">
      <i class="rec-dot" style="background:${colorFor(item.probability)}"></i>
      <span class="rec-main"><span class="rec-name">${item.seg.name}<em class="diff-tag diff-${item.seg.difficulty}">${difficultyName(item.seg.difficulty)}</em></span>
      <span class="rec-sub">${item.seg.distance} km · ${item.seg.elevationGain} m 爬升 · ${Math.round(item.segBearing)}° 骑行方向</span></span>
      <span class="rec-prob">›</span>
    </button>`).join('');
  bindSegmentButtons(box);
}

function formatComponent(value) {
  return `${value >= 0 ? '+' : ''}${Math.round(value)} km/h`;
}

function difficultyName(value) {
  return ({ easy: '轻松', moderate: '中等', hard: '困难', expert: '专家' })[value] || '未知';
}

function bindSegmentButtons(container) {
  container.querySelectorAll('[data-segment-id]').forEach(button => {
    button.addEventListener('click', () => selectSegment(button.dataset.segmentId));
  });
}

function renderDetail(item) {
  const card = $('detail-card');
  if (!item || !state.cityWind) {
    card.style.display = 'none';
    return;
  }
  const now = item.hourly[0] || item.best;
  const direction = Math.round(item.segBearing);
  card.style.display = '';
  card.innerHTML = `
    <h3>已选择赛段</h3>
    <div class="segment-title">${item.seg.name}</div>
    <p class="muted small">${item.seg.description || ''}</p>
    <div class="wind-fit ${now.comp > 0 ? 'favorable' : 'unfavorable'}">
      <strong>${now.comp > 0 ? '顺风适配' : '逆风 / 侧风'}</strong>
      <span>${Math.round(now.p * 100)}% KOM 条件</span>
    </div>
    <div class="kv"><span>骑行走向</span><span>${direction}°</span></div>
    <div class="kv"><span>当前风向</span><span>从 ${Math.round(now.dirFrom)}° 吹向 ${Math.round(windTo(now.dirFrom))}°</span></div>
    <div class="kv"><span>当前风速</span><span>${Math.round(now.speed)} km/h</span></div>
    <div class="kv"><span>顺风分量</span><span>${formatComponent(now.comp)}</span></div>
    <div class="kv"><span>最佳时段</span><span>${fmtTime(item.best.time)} · ${formatComponent(item.best.comp)}</span></div>`;
}

function selectSegment(id) {
  const item = state.scored.find(s => s.seg.id === id);
  if (!item) return;
  state.selectedId = id;
  if (mapReady) drawSegments(state.scored, selectSegment, id);
  renderBrowser();
  renderRecommendations();
  renderDetail(item);
}

async function loadSegments() {
  // Keep segment data on the same release version as the JavaScript. Without this,
  // a browser can run new map code with an old cached JSON file and show stale colours.
  const res = await fetch('data/vancouver-segments.json?v=20260810092927');
  if (!res.ok) throw new Error('赛段数据加载失败');
  const data = await res.json();
  return Array.isArray(data.segments) ? data.segments : [];
}

function bindBrowserControls() {
  $('seg-search').addEventListener('input', event => {
    state.query = event.target.value.trim();
    renderBrowser();
  });
  $('seg-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-diff]');
    if (!button) return;
    state.filter = button.dataset.diff;
    $('seg-filters').querySelectorAll('button').forEach(el => el.classList.toggle('active', el === button));
    renderBrowser();
  });
}

function setStatus(msg) {
  const el = $('status');
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

// 地图覆盖层：加载中提示 / 出错时给出明确信息（避免白屏）
function hideMapOverlay() {
  const el = $('map-overlay');
  if (el) el.classList.add('hidden');
}

function showMapError(msg) {
  const el = $('map-overlay');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('error');
  el.classList.remove('hidden');
}

let mapReady = false;

async function main() {
  // Render useful, stable UI immediately; slow network requests must not leave empty cards behind.
  renderWindCard();
  renderRecommendations();
  renderBrowser();
  bindBrowserControls();
  // 1. 初始化地图（失败也不影响风速数据展示，避免整页白屏）
  try {
    if (typeof L === 'undefined') {
      throw new Error('地图组件 (Leaflet) 未能加载');
    }
    initMap(CONFIG.city, CONFIG.city.zoom);
    mapReady = true;
    hideMapOverlay();
  } catch (e) {
    showMapError('地图加载失败：' + e.message + '。可能是当前网络无法访问地图资源，请刷新或稍后重试。下方风速数据仍可正常显示。');
  }

  setStatus('正在获取温哥华实时风向（覆盖全城）…');

  // 全城网格采样风向（独立于点，赛段为空也能显示风场）
  const grid = buildWindGrid();
  let results = [];
  let windRows = [];
  try {
    const [winds, segments] = await Promise.all([
      fetchWinds([...grid, [CONFIG.city.lat, CONFIG.city.lng]]),
      loadSegments()
    ]);
    windRows = winds;
    results = winds.map(currentWind);
    state.segments = segments;
  } catch (_) {
    setStatus('暂时无法取得风向数据；地图仍可使用，请稍后刷新重试。');
    try { state.segments = await loadSegments(); } catch (_) {}
  }
  state.windPoints = grid
    .map(([lat, lng], i) => results[i]
      ? { lat, lng, speed: results[i].speed, dirFrom: results[i].dirFrom }
      : null)
    .filter(Boolean);

  // scoreSegment needs the complete hourly series, not just its current point.
  state.wind = windRows[grid.length] || null;
  state.cityWind = state.wind ? currentWind(state.wind) : null;
  state.scored = state.wind ? state.segments.map(seg => scoreSegment(seg, state.wind, CONFIG.model, CONFIG.forecastHours)) : [];

  // 3. 渲染（地图不可用时跳过地图相关绘制；无真实风数据时也不画虚假风场）
  if (mapReady) {
    drawSegments(state.scored, selectSegment, state.selectedId);
    if (state.windPoints.length) {
      drawWindFlow(state.windPoints);
    }
  }
  renderWindCard();
  renderRecommendations();
  renderBrowser();
  if (state.scored.length) selectSegment(state.scored[0].seg.id);
  if (state.cityWind) setStatus('');
}

window.addEventListener('DOMContentLoaded', () => {
  main().catch(e => setStatus('出错了：' + e.message));
});
