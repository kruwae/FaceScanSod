/**
 * Mesh Network Mode — ES Module refactor
 * Preserves the legacy global API while enabling import/export usage.
 */

const STORAGE_KEY_ENABLED = 'meshMode_enabled';
const STORAGE_KEY_QUEUE = 'meshMode_queue';
const STORAGE_KEY_LOCATIONS = 'meshMode_locations_cache';
const BANNER_ID = 'meshModeBanner';

let enabled = false;

function loadState() {
  try {
    enabled = localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
  } catch (_) {
    enabled = false;
  }
}

loadState();

function saveEnabledState() {
  try {
    localStorage.setItem(STORAGE_KEY_ENABLED, enabled ? 'true' : 'false');
  } catch (_) {}
}

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUE) || '[]');
  } catch (_) {
    return [];
  }
}

function setQueue(queue) {
  try {
    localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
  } catch (_) {}
}

function buildFingerprint() {
  return [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    navigator.language,
    new Date().getTimezoneOffset()
  ].join('|');
}

function updateButtonStyle(btn, isOn) {
  if (isOn) {
    btn.style.background = 'rgba(245,158,11,0.15)';
    btn.style.color = '#fcd34d';
    btn.innerHTML = '📡 โหมดออฟไลน์ (Mesh Network) — <span style="color:#34d399">เปิดอยู่</span>';
  } else {
    btn.style.background = 'rgba(10,10,28,0.5)';
    btn.style.color = '#64748b';
    btn.innerHTML = '📡 โหมดออฟไลน์ (Mesh Network) — <span style="color:#64748b">ปิดอยู่</span>';
  }
}

function updateBannerVisibility() {
  const banner = document.getElementById(BANNER_ID);
  if (banner) banner.style.display = enabled ? 'block' : 'none';
}

function updateToggleButton() {
  const btn = document.getElementById('meshToggleBtn');
  if (btn) updateButtonStyle(btn, enabled);
}

export function isEnabled() {
  return enabled;
}

export function enable() {
  enabled = true;
  saveEnabledState();
  updateBannerVisibility();
  updateToggleButton();
  return enabled;
}

export function disable() {
  enabled = false;
  saveEnabledState();
  updateBannerVisibility();
  updateToggleButton();
  return enabled;
}

export function toggle() {
  return enabled ? disable() : enable();
}

export function store(data) {
  const queue = getQueue();
  const record = {
    id: Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    clientTimestamp: new Date().toISOString(),
    deviceFingerprint: buildFingerprint(),
    synced: false,
    data: data
  };
  queue.push(record);
  setQueue(queue);
  return { success: true, id: record.id, message: 'บันทึกในเครื่องสำเร็จ (จะ sync เมื่อมีสัญญาณ)' };
}

export function receiveMeshData() {
  return getQueue();
}

export function getPendingCount() {
  return getQueue().filter(r => !r.synced).length;
}

export async function sync(apiUrl) {
  const queue = getQueue().filter(r => !r.synced);
  if (queue.length === 0) return { synced: 0, total: 0 };

  let synced = 0;
  const updated = getQueue();

  for (const record of queue) {
    try {
      const res = await fetch(apiUrl, {
        method: 'POST',
        body: JSON.stringify({
          ...record.data,
          meshSynced: true,
          meshId: record.id,
          meshClientTime: record.clientTimestamp,
          meshFingerprint: record.deviceFingerprint || ''
        })
      });
      const d = await res.json();
      if (d.success !== false) {
        const idx = updated.findIndex(r => r.id === record.id);
        if (idx !== -1) updated[idx].synced = true;
        synced++;
      }
    } catch (_) {
      // leave queued for later
    }
  }

  setQueue(updated);
  return { synced, total: queue.length };
}

export function cacheLocations(locations) {
  try {
    localStorage.setItem(STORAGE_KEY_LOCATIONS, JSON.stringify(locations || []));
  } catch (_) {}
}

export function getCachedLocations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY_LOCATIONS) || '[]');
  } catch (_) {
    return [];
  }
}

export function showBanner() {
  let banner = document.getElementById(BANNER_ID);
  if (banner) {
    banner.style.display = 'block';
    return;
  }

  banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.style.cssText = [
    'display:block',
    'width:100%',
    'background:rgba(245,158,11,0.12)',
    'border:1px solid rgba(245,158,11,0.35)',
    'border-radius:12px',
    'padding:12px 16px',
    'margin-bottom:10px',
    'font-size:0.84em',
    'color:#fcd34d',
    'text-align:center',
    'font-weight:600',
    'line-height:1.5',
    'position:relative',
    'z-index:10'
  ].join(';');
  banner.innerHTML = '📡 โหมดออฟไลน์ถูกเปิดใช้งาน<br>' +
    '<span style="font-weight:400;color:#fbbf24">เหมาะสำหรับกรณีฉุกเฉิน เช่น น้ำท่วม หรือไม่มีสัญญาณอินเทอร์เน็ต</span>';

  const root = document.getElementById('statusAreaRoot') || document.body.firstChild;
  if (root && root.parentNode) {
    root.parentNode.insertBefore(banner, root);
  } else {
    document.body.insertBefore(banner, document.body.firstChild);
  }
}

export function injectToggleButton(container) {
  if (document.getElementById('meshToggleBtn')) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.style.cssText = [
    'display:' + (enabled ? 'block' : 'none'),
    'width:100%',
    'background:rgba(245,158,11,0.12)',
    'border:1px solid rgba(245,158,11,0.35)',
    'border-radius:12px',
    'padding:12px 16px',
    'margin-bottom:10px',
    'font-size:0.84em',
    'color:#fcd34d',
    'text-align:center',
    'font-weight:600',
    'line-height:1.5'
  ].join(';');
  banner.innerHTML = '📡 โหมดออฟไลน์ถูกเปิดใช้งาน<br>' +
    '<span style="font-weight:400;color:#fbbf24">เหมาะสำหรับกรณีฉุกเฉิน เช่น น้ำท่วม หรือไม่มีสัญญาณอินเทอร์เน็ต</span>';

  const btn = document.createElement('button');
  btn.id = 'meshToggleBtn';
  btn.type = 'button';
  btn.style.cssText = [
    'width:100%',
    'padding:11px 16px',
    'border-radius:12px',
    'font-family:Sarabun,sans-serif',
    'font-size:13px',
    'font-weight:700',
    'cursor:pointer',
    'margin-bottom:10px',
    'border:1px dashed rgba(245,158,11,0.4)',
    'transition:all 0.2s',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'gap:8px'
  ].join(';');
  updateButtonStyle(btn, enabled);

  btn.addEventListener('click', () => {
    const nowOn = toggle();
    if (nowOn) {
      if (confirm('📡 เปิดโหมดออฟไลน์แล้ว\nระบบจะรีโหลดเพื่อเข้าสู่โหมดออฟไลน์')) {
        window.location.reload();
      }
    } else {
      alert('✅ ปิดโหมดออฟไลน์แล้ว\nระบบกลับใช้ API ปกติ');
      window.location.reload();
    }
  });

  if (container) {
    container.insertBefore(banner, container.firstChild);
    container.insertBefore(btn, banner);
  }
}

const meshApi = {
  isEnabled,
  enable,
  disable,
  toggle,
  store,
  receiveMeshData,
  getPendingCount,
  sync,
  cacheLocations,
  getCachedLocations,
  showBanner,
  injectToggleButton
};

export default meshApi;

if (typeof window !== 'undefined') {
  window.MeshService = meshApi;
}
