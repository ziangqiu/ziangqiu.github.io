// 风向数据：Open-Meteo 免费接口（无需 API Key，支持浏览器跨域）
const BASE = 'https://api.open-meteo.com/v1/forecast';

// 返回某坐标点未来两天的逐小时风速/风向序列
export async function fetchWind(lat, lng) {
  const url = `${BASE}?latitude=${lat}&longitude=${lng}` +
    `&hourly=wind_speed_10m,wind_direction_10m&wind_speed_unit=kmh` +
    `&forecast_days=2&timezone=America%2FVancouver`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('风向获取失败: ' + res.status);
  const j = await res.json();
  const h = j.hourly;
  const now = Date.now();
  const series = h.time.map((t, i) => ({
    time: new Date(t),
    speed: h.wind_speed_10m[i],
    // 气象学风向：风「来自」的方向（度）
    dirFrom: h.wind_direction_10m[i]
  }));
  // 找到第一个 >= 当前时刻的小时索引
  let startIdx = series.findIndex(s => s.time.getTime() >= now);
  if (startIdx < 0) startIdx = 0;
  return { series, startIdx };
}

// 取当前时刻的风（series[startIdx]）
export function currentWind(wind) {
  return wind.series[wind.startIdx];
}
