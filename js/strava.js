import { CONFIG } from './config.js';

// 隐式授权（Implicit Grant）URL：授权后 access_token 会出现在回调地址的 #hash 里
export function stravaAuthUrl() {
  const { clientId, redirectUri, scope } = CONFIG.strava;
  return 'https://www.strava.com/oauth/mobile/authorize?client_id=' + clientId +
    '&response_type=token&redirect_uri=' + encodeURIComponent(redirectUri) +
    '&scope=' + scope;
}

// 从回调后的 URL hash 中解析 token
export function getStravaTokenFromHash() {
  const m = window.location.hash.match(/access_token=([^&]+)/);
  return m ? m[1] : null;
}

// 用 token 拉取真实赛段几何/名称（公开接口，无需特殊权限）
export async function fetchStravaSegment(id, token) {
  const res = await fetch('https://www.strava.com/api/v3/segments/' + id, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!res.ok) throw new Error('Strava 赛段 ' + id + ' 获取失败: ' + res.status);
  return res.json(); // 含 start_latlng, end_latlng, name, distance 等
}

// 用一个 token 刷新数据集中所有带 stravaId 的赛段
export async function refreshFromStrava(segments, token) {
  const updated = [];
  for (const s of segments) {
    if (s.stravaId) {
      try {
        const d = await fetchStravaSegment(s.stravaId, token);
        updated.push({
          ...s,
          name: d.name || s.name,
          start: d.start_latlng,
          end: d.end_latlng,
          distance: d.distance
        });
      } catch (e) {
        console.warn(e.message);
        updated.push(s);
      }
    } else {
      updated.push(s);
    }
  }
  return updated;
}
