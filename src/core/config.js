import { API_URL_STORAGE_KEY, getApiUrl as getCoreApiUrl, setApiUrl as setCoreApiUrl } from './api.js';

export function getApiUrl() {
  return getCoreApiUrl();
}

export function setApiUrl(url) {
  return setCoreApiUrl(url);
}

export function getPublicConfig() {
  return {
    apiUrl: getApiUrl()
  };
}