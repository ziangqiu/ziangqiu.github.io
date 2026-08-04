// 全局配置：城市、评分模型、Strava 接入
export const CONFIG = {
  city: { name: 'Vancouver', lat: 49.2827, lng: -123.1207, zoom: 11 },

  // 评估未来多少个小时
  forecastHours: 6,

  // KOM 概率模型（见 js/score.js）
  model: {
    center: 8,            // 顺风分量(km/h) 在这一点时概率 P=0.5
    k: 7,                 // 曲线陡峭程度
    recommendComponent: 4,// 被推荐的最小顺风分量
    recommendAlignment: 0.2 // 最小 cos(夹角) 才视为顺风（>约78°）
  },

  // Strava 隐式 OAuth（可选增强）。
  // 不填 clientId 时，网站直接使用本地赛段数据集，无需任何账号即可运行。
  // 想接真实 Strava：去 https://developers.strava.com 注册应用，拿到 Client ID 填到这里，
  // 并在 data/vancouver-segments.json 里给赛段填 stravaId。
  strava: {
    clientId: '',
    redirectUri: (typeof window !== 'undefined') ? window.location.origin + window.location.pathname : '',
    scope: 'activity:read'
  }
};
