import { angleDiff, toRad, bearing } from './geo.js?v=20260810092927';

// 风的「吹向」= 来自方向 + 180°
export function windTo(dirFrom) {
  return (dirFrom + 180) % 360;
}

// 顺风分量(km/h)：>0 助力，<0 阻力
// 夹角越小（方向越吻合）且风速越大，分量越大
export function tailwindComponent(segBearing, dirFrom, speed) {
  const align = Math.cos(toRad(angleDiff(segBearing, windTo(dirFrom))));
  return align * speed;
}

// 逻辑回归：把顺风分量映射为 0..1 的 KOM 冲击概率
export function probability(component, model) {
  return 1 / (1 + Math.exp(-(component - model.center) / model.k));
}

export function labelFor(p) {
  if (p >= 0.7) return '极佳';
  if (p >= 0.5) return '良好';
  if (p >= 0.3) return '一般';
  return '不宜';
}

export function colorFor(p) {
  if (p >= 0.7) return '#16a34a'; // 绿：强顺风
  if (p >= 0.5) return '#65a30d'; // 黄绿
  if (p >= 0.3) return '#f59e0b'; // 橙：侧风
  return '#dc2626';               // 红：逆风/不利
}

// 对单个赛段在未来数小时逐时评分，并挑出最佳窗口
export function scoreSegment(seg, wind, model, hours) {
  const segB = bearing(seg.start, seg.end);
  const start = wind.startIdx;
  const hourly = [];
  let best = null;
  for (let i = start; i < start + hours && i < wind.series.length; i++) {
    const s = wind.series[i];
    const align = Math.cos(toRad(angleDiff(segB, windTo(s.dirFrom))));
    const comp = align * s.speed;
    const p = probability(comp, model);
    const rec = align > model.recommendAlignment && comp >= model.recommendComponent;
    const row = { time: s.time, speed: s.speed, dirFrom: s.dirFrom, align, comp, p, rec };
    hourly.push(row);
    if (!best || comp > best.comp) best = { ...row, idx: i };
  }
  return {
    seg,
    segBearing: segB,
    best,
    hourly,
    recommended: best ? best.rec : false,
    probability: best ? best.p : 0
  };
}

// 排序：被推荐且概率高的优先
export function rank(scored) {
  return [...scored].sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return b.probability - a.probability;
  });
}
