import { apiGet, apiPost } from './core/api.js';
import { isAuthed, saveLoginSession, logoutLocal } from './core/auth.js';
import { setApiUrl, getPublicConfig } from './core/config.js';
import { logAttendance, buildAttendancePayload } from './features/attendance.js';
import { loadKnownFaces, toFaceDescriptors, findBestMatch } from './features/faceRecognition.js';
import { detectPlatform, haversineKm, checkCamera, checkGeolocationPermission } from './features/gps.js';
import meshService, { isEnabled as isMeshEnabled, injectToggleButton, showBanner } from './mesh/meshService.js';
import { showModal, hideModal } from './ui/modal.js';
import { showAlert } from './ui/alert.js';
import { clamp, safeJsonParse, uid } from './utils/helpers.js';
import { hasToken, maskValue, canAccessSensitiveData } from './utils/security.js';

function exposeLegacyGlobals() {
  if (typeof window === 'undefined') return;

  window.AppModules = {
    apiGet,
    apiPost,
    isAuthed,
    saveLoginSession,
    logoutLocal,
    setApiUrl,
    getPublicConfig,
    logAttendance,
    buildAttendancePayload,
    loadKnownFaces,
    toFaceDescriptors,
    findBestMatch,
    detectPlatform,
    haversineKm,
    checkCamera,
    checkGeolocationPermission,
    meshService,
    isMeshEnabled,
    injectToggleButton,
    showBanner,
    showModal,
    hideModal,
    showAlert,
    clamp,
    safeJsonParse,
    uid,
    hasToken,
    maskValue,
    canAccessSensitiveData
  };

  window.apiGet = apiGet;
  window.apiPost = apiPost;
  window.loadKnownFaces = loadKnownFaces;
  window.logAttendance = logAttendance;
  window.MeshService = meshService;
  window.showModal = showModal;
  window.hideModal = hideModal;
  window.showAlert = showAlert;
}

exposeLegacyGlobals();
