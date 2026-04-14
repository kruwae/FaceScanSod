const getApiUrl = () => (localStorage.getItem('gasApiUrl') || (typeof GAS_API_URL !== 'undefined' ? GAS_API_URL : window.GAS_API_URL || '') || '').trim();

const getToken = () => {
  try {
    return (localStorage.getItem('token') || '').trim();
  } catch (_) {
    return '';
  }
};

const withToken = (url) => {
  const token = getToken();
  if (!token) return url;
  const join = url.includes('?') ? '&' : '?';
  return `${url}${join}token=${encodeURIComponent(token)}`;
};

export async function apiGet(action, params = {}) {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error('API URL is not configured');

  const search = new URLSearchParams();
  search.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && `${value}` !== '') search.set(key, String(value));
  });

  const url = withToken(`${apiUrl}?${search.toString()}`);
  const res = await fetch(url, { method: 'GET' });
  return res.json();
}

export async function apiPost(action, payload = {}) {
  const apiUrl = getApiUrl();
  if (!apiUrl) throw new Error('API URL is not configured');

  const body = { action, ...payload };
  const token = getToken();
  if (token && body.token == null) body.token = token;

  const res = await fetch(apiUrl, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  return res.json();
}

export function getStoredToken() {
  return getToken();
}

export function setStoredToken(token) {
  try {
    localStorage.setItem('token', token);
  } catch (_) {}
}

export function clearStoredToken() {
  try {
    localStorage.removeItem('token');
  } catch (_) {}
}
