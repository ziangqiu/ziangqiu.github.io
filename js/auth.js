// 轻量演示登录（纯前端门槛，非真实账号系统）
// 仅用于按需求把「风速数值 / KOM 推荐 / 地图风向箭头样式」做成登录后才变化的内容门槛。
const KEY = 'kom_logged_in';
const NAME = 'kom_user';

const listeners = new Set();

export function isLoggedIn() {
  return localStorage.getItem(KEY) === '1';
}

export function login(name) {
  localStorage.setItem(KEY, '1');
  if (name) localStorage.setItem(NAME, name);
  notifyAuthChange();
}

export function logout() {
  localStorage.removeItem(KEY);
  notifyAuthChange();
}

export function userName() {
  return localStorage.getItem(NAME) || '';
}

export function subscribeAuth(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function notifyAuthChange() {
  listeners.forEach(cb => {
    try { cb(isLoggedIn()); } catch (e) { console.error(e); }
  });
}
