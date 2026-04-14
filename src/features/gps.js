export function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  if (/macintosh|mac os/.test(ua)) return 'mac';
  return 'windows';
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function deg2rad(deg) {
  return deg * Math.PI / 180;
}

export async function checkCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    stream.getTracks().forEach((t) => t.stop());
    return true;
  } catch (e) {
    console.warn('[Camera]', e.message);
    return false;
  }
}

export async function checkGeolocationPermission() {
  if (!navigator.geolocation) return 'unsupported';
  if (!navigator.permissions) return 'unknown';
  try {
    const perm = await navigator.permissions.query({ name: 'geolocation' });
    return perm.state;
  } catch (_) {
    return 'unknown';
  }
}
