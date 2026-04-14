import { getStoredToken } from '../core/api.js';

export function hasToken() {
  return Boolean(getStoredToken());
}

export function maskValue(value) {
  const text = String(value || '');
  if (!text) return '';
  if (text.length <= 4) return '****';
  return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

export function canAccessSensitiveData(role = 'viewer') {
  return ['staff', 'admin'].includes(String(role).toLowerCase());
}
