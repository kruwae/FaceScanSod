export const API_URL_STORAGE_KEY = 'GAS_API_URL';
const LEGACY_API_URL_STORAGE_KEY = 'gasApiUrl';

let resolvedApiUrl = '';

function normalizeApiUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
}

function readStoredApiUrl() {
  try {
    if (typeof localStorage === 'undefined') {
      return '';
    }

    return normalizeApiUrl(
      localStorage.getItem(API_URL_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_API_URL_STORAGE_KEY) ||
      ''
    );
  } catch (error) {
    return '';
  }
}

function readGlobalApiUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  return normalizeApiUrl(window.GAS_API_URL || window.API_URL || '');
}

function writeStoredApiUrl(value) {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }

    if (value) {
      localStorage.setItem(API_URL_STORAGE_KEY, value);
      localStorage.setItem(LEGACY_API_URL_STORAGE_KEY, value);
    } else {
      localStorage.removeItem(API_URL_STORAGE_KEY);
      localStorage.removeItem(LEGACY_API_URL_STORAGE_KEY);
    }
  } catch (error) {
    // Ignore storage failures and keep the in-memory value.
  }
}

export function getApiUrl() {
  if (resolvedApiUrl) {
    return resolvedApiUrl;
  }

  const storedApiUrl = readStoredApiUrl();
  if (storedApiUrl) {
    resolvedApiUrl = storedApiUrl;
    return resolvedApiUrl;
  }

  const globalApiUrl = readGlobalApiUrl();
  if (globalApiUrl) {
    resolvedApiUrl = globalApiUrl;
    return resolvedApiUrl;
  }

  return '';
}

export function setApiUrl(url) {
  const normalizedUrl = normalizeApiUrl(url);
  resolvedApiUrl = normalizedUrl;
  writeStoredApiUrl(normalizedUrl);

  if (typeof window !== 'undefined') {
    window.GAS_API_URL = normalizedUrl;
  }

  return resolvedApiUrl;
}

export function getStoredApiUrl() {
  return readStoredApiUrl();
}

export function hasApiUrl() {
  return Boolean(getApiUrl());
}

export function buildApiUrl(path) {
  const baseUrl = getApiUrl();
  const normalizedPath = typeof path === 'string' ? path.replace(/^\/+/, '') : '';

  if (!baseUrl) {
    return normalizedPath ? `/${normalizedPath}` : '';
  }

  if (!normalizedPath) {
    return baseUrl;
  }

  return `${baseUrl}/${normalizedPath}`;
}