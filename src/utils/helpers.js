export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return fallback;
  }
}

export function formatDateTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime()) ? '' : d.toISOString();
}

export function formatTimeHms(value) {
  if (value == null || value === '') return '';
  const str = String(value).trim();
  if (!str) return '';

  const directMatch = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (directMatch) {
    const h = Number(directMatch[1]);
    const m = Number(directMatch[2]);
    const s = Number(directMatch[3] || 0);
    if (
      Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s) &&
      h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60
    ) {
      return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
    }
  }

  const timeOnlyMatch = str.match(/^T?(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/i);
  if (timeOnlyMatch) {
    const h = Number(timeOnlyMatch[1]);
    const m = Number(timeOnlyMatch[2]);
    const s = Number(timeOnlyMatch[3] || 0);
    if (
      Number.isFinite(h) && Number.isFinite(m) && Number.isFinite(s) &&
      h >= 0 && h < 24 && m >= 0 && m < 60 && s >= 0 && s < 60
    ) {
      return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
    }
  }

  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    return [date.getHours(), date.getMinutes(), date.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
  }

  return '';
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}