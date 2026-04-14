import { apiPost } from '../core/api.js';

export async function logAttendance(payload) {
  return apiPost('logAttendance', payload);
}

export function buildAttendancePayload({
  name,
  lat,
  lng,
  locationName,
  gpsStatus = 'ok',
  gpsSkipReason = '',
  userAgent = navigator.userAgent,
  meshSynced = false,
  meshId = '',
  meshClientTime = '',
  meshFingerprint = ''
} = {}) {
  return {
    action: 'logAttendance',
    name,
    lat,
    lng,
    locationName,
    gpsStatus,
    gpsSkipReason,
    userAgent,
    meshSynced,
    meshId,
    meshClientTime,
    meshFingerprint
  };
}
