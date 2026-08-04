// 全局配置：城市、评分模型
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
  }
  // 注：赛段为内置静态数据集（data/vancouver-segments.json），无需 Strava API / OAuth。
};
