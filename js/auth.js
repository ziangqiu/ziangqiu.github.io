// 轻量演示登录（纯前端门槛，非真实账号系统）
// 仅用于按需求把「风速数值 / KOM 推荐」做成登录后才可见的内容门槛。
const KEY = 'kom_logged_in';
const NAME = 'kom_user';

export function isLoggedIn() {
  return localStorage.getItem(KEY) === '1';
}

export function login(name) {
  localStorage.setItem(KEY, '1');
  if (name) localStorage.setItem(NAME, name);
}

export function logout() {
  localStorage.removeItem(KEY);
}

export function userName() {
  return localStorage.getItem(NAME) || '';
}
