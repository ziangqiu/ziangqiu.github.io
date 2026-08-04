import { CONFIG } from './config.js';
import { bearing, midpoint } from './geo.js';
import { fetchWind, currentWind } from './wind.js';
import { scoreSegment, rank, labelFor, colorFor, windTo } from './score.js';
import { initMap, drawSegments, drawWindArrows, highlightSegment } from './map.js';
import * as auth from './auth.js';
import * as strava from './strava.js';

const state = {
  segments: [],
  windPairs: [],   // { seg, mid, wind }
  scored: [],
  cityWind: null
};

const $ = id => document.getElementById(id);

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

// ---------- 渲染 ----------
function renderMap() {
  drawSegments(state.scored, onSelectSegment);
  drawWindArrows(windPoints());
}

function onSelectSegment(s) {
  highlightSegment(state.scored, s.seg.id);
  const card = $('detail-card');
  card.style.display = '';
  card.innerHTML = detailHtml(s);
}

function fmtTime(d) {
  return d.toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', weekday: 'short' });
}

function detailHtml(s) {
  const b = s.best;
  return `
    <h3>${s.seg.name}</h3>
    <p class="muted">${s.seg.category} · 骑行方向 ${Math.round(s.segBearing)}°</p>
    <div class="kv"><span>当前 KOM 概率</span><b style="color:${colorFor(s.probability)}">${Math.round(s.probability*100)}% · ${labelFor(s.probability)}</b></div>
    ${b ? `
    <div class="kv"><span>最佳窗口</span><b>${fmtTime(b.time)}</b></div>
    <div class="kv"><span>该窗口风速</span><b>${Math.round(b.speed)} km/h</b></div>
    <div class="kv"><span>风向吻合度</span><b>${Math.round(b.align*100)}%</b></div>
    <div class="kv"><span>顺风分量</span><b>${b.comp.toFixed(1)} km/h</b></div>` : ''}
    <p class="muted small">${s.seg.note || ''}</p>`;
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
    box.innerHTML = '<p class="muted">未来数小时暂无明显顺风赛段，建议等风向转好再冲 KOM。</p>';
    return;
  }
  box.innerHTML = ranked.map(s => {
    const b = s.best;
    return `
      <div class="rec-item" data-id="${s.seg.id}">
        <span class="rec-dot" style="background:${colorFor(s.probability)}"></span>
        <div class="rec-main">
          <div class="rec-name">${s.seg.name}</div>
          <div class="rec-sub">最佳 ${b ? fmtTime(b.time) : '-'} · ${b ? Math.round(b.speed) : 0} km/h · 吻合 ${b ? Math.round(b.align*100) : 0}%</div>
        </div>
        <div class="rec-prob" style="color:${colorFor(s.probability)}">${Math.round(s.probability*100)}%<br><span>${labelFor(s.probability)}</span></div>
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

// ---------- 登录门槛 ----------
function updateAuthUI() {
  const gate = $('sidebar-gate');
  const content = $('sidebar-content');
  const btn = $('login-btn');
  if (auth.isLoggedIn()) {
    gate.style.display = 'none';
    content.style.display = '';
    renderWindCard();
    renderRecommendations();
    const name = auth.userName();
    btn.textContent = name ? '退出 (' + name + ')' : '退出';
  } else {
    gate.style.display = '';
    content.style.display = 'none';
    btn.textContent = '登录';
  }
}

function openLoginModal() {
  $('login-modal').style.display = 'flex';
  $('login-name').focus();
}

function closeLoginModal() {
  $('login-modal').style.display = 'none';
}

// ---------- Strava ----------
function setupStrava() {
  const btn = $('strava-btn');
  if (!CONFIG.strava.clientId) {
    btn.title = '需在 js/config.js 填入 Strava Client ID 后方可连接';
    btn.classList.add('disabled');
    return;
  }
  btn.addEventListener('click', () => {
    window.location.href = strava.stravaAuthUrl();
  });
}

async function handleStravaCallback() {
  const token = strava.getStravaTokenFromHash();
  if (!token) return;
  // 清掉 hash，避免刷新重复触发
  history.replaceState(null, '', window.location.pathname + window.location.search);
  setStatus('已连接 Strava，正在拉取真实赛段几何…');
  try {
    state.segments = await strava.refreshFromStrava(state.segments, token);
    state.segments.forEach(s => { s.bearing = bearing(s.start, s.end); });
    computeScores();
    renderMap();
    updateAuthUI();
    setStatus('');
  } catch (e) {
    setStatus('Strava 数据拉取失败：' + e.message);
  }
}

// ---------- 通用 ----------
function setStatus(msg) {
  const el = $('status');
  el.textContent = msg;
  el.style.display = msg ? '' : 'none';
}

async function main() {
  initMap(CONFIG.city, CONFIG.city.zoom);
  setupStrava();
  await handleStravaCallback();

  setStatus('正在加载温哥华赛段…');
  state.segments = await loadSegments();

  setStatus('正在获取温哥华实时风向（未来 ' + CONFIG.forecastHours + ' 小时）…');
  state.windPairs = await buildWind(state.segments);
  const cw = await fetchWind(CONFIG.city.lat, CONFIG.city.lng);
  state.cityWind = currentWind(cw);

  computeScores();
  renderMap();
  updateAuthUI();
  setStatus('');
}

// 绑定 UI 事件
window.addEventListener('DOMContentLoaded', () => {
  $('login-btn').addEventListener('click', () => {
    if (auth.isLoggedIn()) { auth.logout(); updateAuthUI(); }
    else openLoginModal();
  });
  $('login-submit').addEventListener('click', () => {
    const name = $('login-name').value.trim();
    auth.login(name);
    closeLoginModal();
    updateAuthUI();
  });
  $('login-cancel').addEventListener('click', closeLoginModal);
  main().catch(e => setStatus('出错了：' + e.message));
});
