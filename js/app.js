// 主逻辑：全城风向网格采样 + 地图风场渲染 + 始终可见的风速/推荐面板
// 说明：登录门槛已移除，所有内容无需登录即可访问。预设赛段已清空，
// 由用户自行在 data/vancouver-segments.json 中添加赛段。
import { CONFIG } from './config.js';
import { fetchWind, currentWind } from './wind.js';
import { initMap, drawSegments, drawWindFlow } from './map.js';

const state = {
  windPoints: [],   // 全城网格风场采样点 {lat, lng, speed, dirFrom}
  cityWind: null
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

function windPoints() {
  return state.windPoints;
}

function fmtTime(d) {
  return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', weekday: 'short' });
}

function renderWindCard() {
  const c = state.cityWind;
  if (!c) {
    $('wind-card').innerHTML = '<h3>当前温哥华风向</h3><p class="muted small">正在获取实时风向…</p>';
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
  box.innerHTML = '<p class="muted small">地图上还没有赛段。在 <code>data/vancouver-segments.json</code> 中添加赛段后，这里会显示未来几小时最适合冲击 KOM 的推荐区域。</p>';
}

function renderBrowser() {
  const box = $('seg-list');
  box.innerHTML = '<p class="muted small">暂无赛段。你可在 <code>data/vancouver-segments.json</code> 中添加赛段（名称、起终点经纬度、距离、爬升、坡度、难度），刷新页面即可在地图上显示并在此处检索。</p>';
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
  const results = await Promise.all(
    grid.map(([lat, lng]) =>
      fetchWind(lat, lng).then(currentWind).catch(() => null)
    )
  );
  state.windPoints = grid
    .map(([lat, lng], i) => results[i]
      ? { lat, lng, speed: results[i].speed, dirFrom: results[i].dirFrom }
      : null)
    .filter(Boolean);

  const cw = await fetchWind(CONFIG.city.lat, CONFIG.city.lng).catch(() => null);
  state.cityWind = cw ? currentWind(cw) : null;

  // 3. 渲染（地图不可用时跳过地图相关绘制）
  if (mapReady) {
    drawSegments([], null);
    drawWindFlow(state.windPoints);
  }
  renderWindCard();
  renderRecommendations();
  renderBrowser();
  setStatus('');
}

window.addEventListener('DOMContentLoaded', () => {
  main().catch(e => setStatus('出错了：' + e.message));
});
