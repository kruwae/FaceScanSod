export function getApiUrl() {
  return (localStorage.getItem('gasApiUrl') || '').trim();
}

export function setApiUrl(url) {
  try {
    localStorage.setItem('gasApiUrl', String(url || '').trim());
  } catch (_) {}
}

export function getPublicConfig() {
  return {
    apiUrl: getApiUrl()
  };
}
