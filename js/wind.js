// 风向数据：Open-Meteo 免费接口（无需 API Key，支持浏览器跨域）
const BASE = 'https://api.open-meteo.com/v1/forecast';
const CACHE_KEY = 'vancouver-kom-wind-v1';
const REQUEST_TIMEOUT_MS = 12000;

function toWind(data) {
  const h = data.hourly;
  if (!h || !Array.isArray(h.time)) throw new Error('风向数据格式异常');
  const now = Date.now();
  const series = h.time.map((t, i) => ({
    time: new Date(t),
    speed: h.wind_speed_10m[i],
    dirFrom: h.wind_direction_10m[i]
  }));
  let startIdx = series.findIndex(s => s.time.getTime() >= now);
  if (startIdx < 0) startIdx = 0;
  return { series, startIdx };
}

function loadCached(url) {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
    // A cached forecast is only a fallback: keep it short-lived and tied to this exact request.
    if (cached?.url === url && Date.now() - cached.savedAt < 6 * 60 * 60 * 1000) return cached.data;
  } catch (_) { /* Private browsing/storage restrictions: simply continue without cache. */ }
  return null;
}

function saveCached(url, data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ url, savedAt: Date.now(), data })); } catch (_) {}
}

// Open-Meteo accepts comma-separated coordinates, so all map samples can be fetched in one request.
export async function fetchWinds(points) {
  const lats = points.map(([lat]) => lat).join(',');
  const lngs = points.map(([, lng]) => lng).join(',');
  const url = `${BASE}?latitude=${lats}&longitude=${lngs}` +
    `&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh` +
    `&forecast_days=2&timezone=America%2FVancouver`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('风向获取失败: ' + res.status);
    const data = await res.json();
    const rows = Array.isArray(data) ? data : [data];
    if (rows.length !== points.length) throw new Error('风向数据不完整');
    saveCached(url, data);
    return rows.map(toWind);
  } catch (error) {
    const cached = loadCached(url);
    if (cached) return (Array.isArray(cached) ? cached : [cached]).map(toWind);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// 返回某坐标点未来两天的逐小时风速/风向序列
export async function fetchWind(lat, lng) {
  return (await fetchWinds([[lat, lng]]))[0];
}

// 取当前时刻的风（series[startIdx]）
export function currentWind(wind) {
  return wind.series[wind.startIdx];
}
