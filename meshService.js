/**
 * =================================================================
 * NEW FILE: meshService.js
 * Mesh Network Mode — Offline/Disaster Mode Module
 * =================================================================
 * PURPOSE: Allow attendance scanning without internet connectivity.
 *          Designed for disaster scenarios (flood, no internet).
 *
 * RULES:
 *  - DO NOT MODIFY EXISTING API logic
 *  - This module is 100% isolated and optional
 *  - All changes are additive only
 *  - Safe fallback to normal API when online
 * =================================================================
 */

const MeshService = (function () {
  'use strict';

  // ===== Constants =====
  const STORAGE_KEY_ENABLED  = 'meshMode_enabled';
  const STORAGE_KEY_QUEUE    = 'meshMode_queue';
  const STORAGE_KEY_LOCATIONS = 'meshMode_locations_cache';
  const BANNER_ID            = 'meshModeBanner';

  // ===== State =====
  let _enabled = localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';

  // ===== Public API =====

  /**
   * Check if Mesh Mode is ON
   */
  function isEnabled() {
    return _enabled;
  }

  /**
   * Toggle Mesh Mode ON/OFF
   * Returns new state (true = ON)
   */
  function toggle() {
    _enabled = !_enabled;
    localStorage.setItem(STORAGE_KEY_ENABLED, _enabled ? 'true' : 'false');
    console.log('[Mesh Mode]', _enabled ? 'ON' : 'OFF');
    _updateBannerVisibility();
    _updateToggleButton();
    return _enabled;
  }

  /**
   * sendMeshData — store attendance record locally
   * Prepared for future: Bluetooth / WebRTC / WebSocket fallback
   */
  function sendMeshData(data) {
    console.log('[Mesh] Sending locally...');

    // ADD: device fingerprint for post-hoc audit (ยากต่อการปลอมแปลง)
    const fingerprint = [
      navigator.userAgent,
      screen.width + 'x' + screen.height,
      navigator.language,
      new Date().getTimezoneOffset()
    ].join('|');

    const queue  = _getQueue();
    const record = {
      id:                Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      clientTimestamp:   new Date().toISOString(),   // เวลาบนอุปกรณ์
      deviceFingerprint: fingerprint,                // audit trail
      synced:            false,
      data:              data
    };
    queue.push(record);
    localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(queue));
    console.log('[Mesh] Stored locally. Queue size:', queue.length);

    try {
      const channel = new BroadcastChannel('mesh_sync');
      channel.postMessage({ type: 'NEW_RECORD', data: record.data });
    } catch (_) {}

    return { success: true, id: record.id, message: 'บันทึกในเครื่องสำเร็จ (จะ sync เมื่อมีสัญญาณ)' };
  }

  /**
   * receiveMeshData — get all pending local records
   */
  function receiveMeshData() {
    return _getQueue();
  }

  /**
   * getPendingCount — how many records waiting to sync
   */
  function getPendingCount() {
    return _getQueue().filter(r => !r.synced).length;
  }

  /**
   * syncToServer — attempt to flush local queue to real API
   * Falls back gracefully if still offline
   */
  async function syncToServer(apiUrl) {
    const queue = _getQueue().filter(r => !r.synced);
    if (queue.length === 0) return { synced: 0 };

    let synced = 0;
    const updated = _getQueue();

    for (const record of queue) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          body:   JSON.stringify({
            ...record.data,
            meshSynced:        true,
            meshId:            record.id,
            meshClientTime:    record.clientTimestamp,
            meshFingerprint:   record.deviceFingerprint || ''
          })
        });
        const d = await res.json();
        if (d.success !== false) {
          const idx = updated.findIndex(r => r.id === record.id);
          if (idx !== -1) updated[idx].synced = true;
          synced++;
        }
      } catch (_) {
        // Still offline — leave for next attempt
      }
    }

    localStorage.setItem(STORAGE_KEY_QUEUE, JSON.stringify(updated));
    console.log('[Mesh] Synced', synced, 'of', queue.length, 'records');
    return { synced, total: queue.length };
  }

  /**
   * cacheLocations — save locations list for offline use
   * Call this when online so locations are available offline
   */
  function cacheLocations(locations) {
    localStorage.setItem(STORAGE_KEY_LOCATIONS, JSON.stringify(locations));
    console.log('[Mesh] Cached', locations.length, 'locations');
  }

  /**
   * getCachedLocations — retrieve cached locations
   */
  function getCachedLocations() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_LOCATIONS) || '[]');
    } catch (_) { return []; }
  }

  /**
   * showBanner — display offline mode warning banner
   */
  function showBanner() {
    let banner = document.getElementById(BANNER_ID);
    if (banner) {
      banner.style.display = 'block';
      return;
    }
    // สร้าง banner DOM ใหม่ถ้ายังไม่มี (กรณีเรียกก่อน injectToggleButton)
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
    // แทรกที่ต้นของ body ถ้าไม่มี container
    const root = document.getElementById('statusAreaRoot') || document.body.firstChild;
    if (root && root.parentNode) {
      root.parentNode.insertBefore(banner, root);
    } else {
      document.body.insertBefore(banner, document.body.firstChild);
    }
  }

  // ===== UI Components =====

  /**
   * injectToggleButton — add Mesh Mode toggle button to page
   * Safe to call multiple times (idempotent)
   */
  function injectToggleButton(container) {
    if (document.getElementById('meshToggleBtn')) return;

    // Banner
    const banner = document.createElement('div');
    banner.id = BANNER_ID;
    banner.style.cssText = [
      'display:' + (_enabled ? 'block' : 'none'),
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

    // Toggle button
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
    _setButtonStyle(btn, _enabled);

    btn.addEventListener('click', () => {
      const nowOn = toggle();
      if (nowOn) {
        // Auto-trigger page reload to enter mesh mode cleanly
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

  // ===== Private Helpers =====

  function _getQueue() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY_QUEUE) || '[]');
    } catch (_) { return []; }
  }

  function _setButtonStyle(btn, isOn) {
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

  function _updateBannerVisibility() {
    const banner = document.getElementById(BANNER_ID);
    if (banner) banner.style.display = _enabled ? 'block' : 'none';
  }

  function _updateToggleButton() {
    const btn = document.getElementById('meshToggleBtn');
    if (btn) _setButtonStyle(btn, _enabled);
  }

  // ===== Expose Public API =====
  return {
    isEnabled,
    toggle,
    sendMeshData,
    receiveMeshData,
    getPendingCount,
    syncToServer,
    cacheLocations,
    getCachedLocations,
    showBanner,
    injectToggleButton,
  };

})();
