// 地理与方向计算工具
export const toRad = d => d * Math.PI / 180;
export const toDeg = r => r * 180 / Math.PI;

// 起终点之间的初始方位角（度，0=正北，顺时针）
export function bearing(start, end) {
  const φ1 = toRad(start[0]), φ2 = toRad(end[0]);
  const Δλ = toRad(end[1] - start[1]);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// 两个航向之间的最小夹角，范围 0..180
export function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  if (d > 180) d = 360 - d;
  return d;
}

// 两点中点
export function midpoint(start, end) {
  return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
}

// 从某点沿给定方位角、移动约 distDeg（纬度度数，近似）得到的新点
export function destination(point, bearingDeg, distDeg) {
  const br = toRad(bearingDeg);
  const lat = point[0] + distDeg * Math.cos(br);
  const lng = point[1] + (distDeg * Math.sin(br)) / Math.cos(toRad(point[0]));
  return [lat, lng];
}
