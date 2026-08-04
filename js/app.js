import { CONFIG } from './config.js';
import { bearing, midpoint } from './geo.js';
import { fetchWind, currentWind } from './wind.js';
import { scoreSegment, rank, labelFor, colorFor, windTo } from './score.js';
import { initMap, drawSegments, drawWindFlow, highlightSegment } from './map.js';
import * as auth from './auth.js';

const state = {
  segments: [],
  windPairs: [],   // { seg, mid, wind }
  scored: [],
  cityWind: null,
  selectedId: null,
  diffFilter: 'all'
};

const $ = id => document.getElementById(id);

const DIFF_LABEL = { easy: '轻松', moderate: '中等', hard: '困难', expert: '专家' };
const diffLabel = d => DIFF_LABEL[d] || d;

async function loadSegments() {
  const res = await fetch('data/vancouver-segments.json');
  const data = await res.json();
  return data.segments.map(s => ({ ...s, bearing: bearing(s.start, s.end) }));
}

async function buildWind(segments) {
  const pairs = [];
  for (const s of segments) {
    const mid = midpoint(s.start, s.end);
    const wind = await fetchWind(mid[0], mid[1]);
    pairs.push({ seg: s, mid, wind });
  }
  return pairs;
}

function computeScores() {
  state.scored = state.windPairs.map(({ seg, wind }) =>
    scoreSegment(seg, wind, CONFIG.model, CONFIG.forecastHours)
  );
}

function windPoints() {
  return state.windPairs.map(p => {
    const c = currentWind(p.wind);
    return { lat: p.mid[0], lng: p.mid[1], speed: c.speed, dirFrom: c.dirFrom };
  });
}

// ---------- 地图 ----------
function renderMap() {
  drawSegments(state.scored, onSelectSegment);
  drawWindFlow(windPoints()); // 风场粒子流默认铺满地图（Apple Weather 风格）
}

function onSelectSegment(s) {
  state.selectedId = s.seg.id;
  highlightSegment(state.scored, s.seg.id);
  const card = $('detail-card');
  card.style.display = '';
  card.innerHTML = detailHtml(s);
}

function fmtTime(d) {
  return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', weekday: 'short' });
}

// 详情卡：静态信息始终展示；风速/概率分析登录后展示
function detailHtml(s) {
  const d = s.seg;
  let html = `
    <h3>${d.name}</h3>
    <span class="diff-tag diff-${d.difficulty}">${diffLabel(d.difficulty)}</span>
    <div class="kv"><span>距离</span><b>${d.distance} km</b></div>
    <div class="kv"><span>累计爬升</span><b>${d.elevationGain} m</b></div>
    <div class="kv"><span>平均坡度</span><b>${d.avgGrade}%</b></div>
    <div class="kv"><span>骑行方向</span><b>${Math.round(s.segBearing)}°</b></div>
    <p class="muted small">${d.description || ''}</p>`;

  if (auth.isLoggedIn() && s.best) {
    const b = s.best;
    html += `
    <hr class="sep">
    <div class="kv"><span>当前 KOM 概率</span><b style="color:${colorFor(s.probability)}">${Math.round(s.probability * 100)}% · ${labelFor(s.probability)}</b></div>
    <div class="kv"><span>最佳窗口</span><b>${fmtTime(b.time)}</b></div>
    <div class="kv"><span>该窗口风速</span><b>${Math.round(b.speed)} km/h</b></div>
    <div class="kv"><span>风向吻合度</span><b>${Math.round(b.align * 100)}%</b></div>
    <div class="kv"><span>顺风分量</span><b>${b.comp.toFixed(1)} km/h</b></div>`;
  } else {
    html += `<hr class="sep"><p class="muted small">登录后可查看该赛段的实时风速分析与最佳冲刺窗口。</p>`;
  }
  return html;
}

// ---------- 赛段浏览 / 查询（公开） ----------
function renderBrowser() {
  const q = ($('seg-search').value || '').trim().toLowerCase();
  const diff = state.diffFilter;
  const list = state.scored.filter(s => {
    const okQ = !q || s.seg.name.toLowerCase().includes(q);
    const okD = diff === 'all' || s.seg.difficulty === diff;
    return okQ && okD;
  });
  const box = $('seg-list');
  if (!list.length) {
    box.innerHTML = '<p class="muted small">没有匹配的赛段。</p>';
    return;
  }
  box.innerHTML = list.map(s => `
    <div class="rec-item" data-id="${s.seg.id}">
      <span class="rec-dot" style="background:${colorFor(s.probability)}"></span>
      <div class="rec-main">
        <div class="rec-name">${s.seg.name} <span class="diff-tag diff-${s.seg.difficulty}">${diffLabel(s.seg.difficulty)}</span></div>
        <div class="rec-sub">${s.seg.distance} km · 爬升 ${s.seg.elevationGain} m · ${s.seg.avgGrade}%</div>
      </div>
    </div>`).join('');
  box.querySelectorAll('.rec-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const s = state.scored.find(x => x.seg.id === id);
      if (s) onSelectSegment(s);
    });
  });
}

// ---------- 登录门槛（仅风速数值 + KOM 推荐） ----------
function updateAuthUI() {
  const gate = $('sidebar-gate');
  const content = $('sidebar-content');
  const btn = $('login-btn');
  if (auth.isLoggedIn()) {
    gate.style.display = 'none';
    content.style.display = '';
    renderWindCard();
    renderRecommendations();
    btn.textContent = auth.userName() ? '退出 (' + auth.userName() + ')' : '退出';
  } else {
    gate.style.display = '';
    content.style.display = 'none';
    btn.textContent = '登录';
  }
  // 登录状态变化后，若已选中赛段，刷新详情卡（风速分析显隐）
  if (state.selectedId) {
    const s = state.scored.find(x => x.seg.id === state.selectedId);
    if (s) { const c = $('detail-card'); c.innerHTML = detailHtml(s); }
  }
}

function renderWindCard() {
  const c = state.cityWind;
  if (!c) return;
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
  const ranked = rank(state.scored).filter(s => s.recommended).slice(0, 8);
  const box = $('rec-list');
  if (!ranked.length) {
    box.innerHTML = '<p class="muted small">未来数小时暂无明显顺风赛段，建议等风向转好再冲 KOM。</p>';
    return;
  }
  box.innerHTML = ranked.map(s => {
    const b = s.best;
    return `
      <div class="rec-item" data-id="${s.seg.id}">
        <span class="rec-dot" style="background:${colorFor(s.probability)}"></span>
        <div class="rec-main">
          <div class="rec-name">${s.seg.name}</div>
          <div class="rec-sub">最佳 ${b ? fmtTime(b.time) : '-'} · ${b ? Math.round(b.speed) : 0} km/h · 吻合 ${b ? Math.round(b.align * 100) : 0}%</div>
        </div>
        <div class="rec-prob" style="color:${colorFor(s.probability)}">${Math.round(s.probability * 100)}%<br><span>${labelFor(s.probability)}</span></div>
      </div>`;
  }).join('');
  box.querySelectorAll('.rec-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-id');
      const s = state.scored.find(x => x.seg.id === id);
      if (s) onSelectSegment(s);
    });
  });
}

function openLoginModal() { $('login-modal').style.display = 'flex'; $('login-name').focus(); }
function closeLoginModal() { $('login-modal').style.display = 'none'; }

function setStatus(msg) {
  const el = $('status');
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

async function main() {
  initMap(CONFIG.city, CONFIG.city.zoom);
  setStatus('正在加载温哥华赛段…');
  state.segments = await loadSegments();

  setStatus('正在获取温哥华实时风向（未来 ' + CONFIG.forecastHours + ' 小时）…');
  state.windPairs = await buildWind(state.segments);
  const cw = await fetchWind(CONFIG.city.lat, CONFIG.city.lng);
  state.cityWind = currentWind(cw);

  computeScores();
  renderMap();
  renderBrowser();
  updateAuthUI();
  setStatus('');

  // 登录/登出时重绘赛段与侧边栏（风场粒子流保持默认显示）
  auth.subscribeAuth(() => {
    renderMap();
    updateAuthUI();
  });
}

// 绑定 UI 事件
window.addEventListener('DOMContentLoaded', () => {
  $('login-btn').addEventListener('click', () => {
    if (auth.isLoggedIn()) auth.logout();
    else openLoginModal();
  });
  $('login-submit').addEventListener('click', () => {
    auth.login($('login-name').value.trim());
    closeLoginModal();
  });
  $('login-cancel').addEventListener('click', closeLoginModal);

  $('seg-search').addEventListener('input', renderBrowser);
  document.querySelectorAll('#seg-filters button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#seg-filters button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.diffFilter = btn.getAttribute('data-diff');
      renderBrowser();
    });
  });

  main().catch(e => setStatus('出错了：' + e.message));
});
