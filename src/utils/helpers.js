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

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
