import { getStoredToken, setStoredToken, clearStoredToken } from './api.js';

export function isAuthed() {
  return Boolean(getStoredToken());
}

export function saveLoginSession(token) {
  if (token) setStoredToken(token);
}

export function logoutLocal() {
  clearStoredToken();
}

export function getAuthHeaders() {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
