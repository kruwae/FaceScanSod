// ============================================================
//  Shared auth badge helper
//  Reads admin session state and renders a small top-right badge
// ============================================================

(function () {
  function safeGetSession(key) {
    try {
      return sessionStorage.getItem(key) || '';
    } catch (e) {
      return '';
    }
  }

  function safeGetLocal(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (e) {
      return '';
    }
  }

  function ensureBadgeStyles() {
    if (document.getElementById('authBadgeStyles')) {
      return;
    }

    var style = document.createElement('style');
    style.id = 'authBadgeStyles';
    style.textContent = `
      .auth-badge {
        position: fixed;
        top: 14px;
        right: 14px;
        z-index: 9998;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.78);
        border: 1px solid rgba(99, 102, 241, 0.28);
        box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: #e2e8f0;
        font-family: inherit;
        font-size: 0.82rem;
        line-height: 1;
        max-width: calc(100vw - 28px);
        pointer-events: none;
      }

      .auth-badge__name {
        font-weight: 700;
        color: #f8fafc;
        white-space: nowrap;
      }

      .auth-badge__role {
        display: inline-flex;
        align-items: center;
        padding: 4px 8px;
        border-radius: 999px;
        background: rgba(99, 102, 241, 0.18);
        border: 1px solid rgba(99, 102, 241, 0.24);
        color: #c7d2fe;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        white-space: nowrap;
        text-transform: capitalize;
      }

      .auth-badge__divider {
        width: 1px;
        height: 14px;
        background: rgba(148, 163, 184, 0.35);
        flex: 0 0 auto;
      }

      .auth-badge[data-authed="0"] {
        opacity: 0.85;
        background: rgba(15, 23, 42, 0.62);
      }

      .auth-badge[data-authed="0"] .auth-badge__role {
        background: rgba(148, 163, 184, 0.12);
        border-color: rgba(148, 163, 184, 0.18);
        color: #cbd5e1;
      }

      @media (max-width: 480px) {
        .auth-badge {
          top: 10px;
          right: 10px;
          padding: 7px 10px;
          font-size: 0.78rem;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeRole(role) {
    var value = String(role || '').trim();
    if (!value) {
      return 'admin';
    }
    return value;
  }

  function getCurrentAuthUser() {
    var isAuthed = safeGetSession('adminAuth') === '1';
    var name = safeGetSession('adminName').trim() || 'Admin';
    var role = normalizeRole(safeGetSession('adminRole') || safeGetLocal('adminRole'));
    return {
      isAuthed: isAuthed,
      name: name,
      role: role
    };
  }

  function renderAuthBadge(container) {
    if (typeof document === 'undefined') {
      return null;
    }

    ensureBadgeStyles();

    var existing = document.getElementById('authBadge');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var user = getCurrentAuthUser();
    var badge = document.createElement('div');
    badge.id = 'authBadge';
    badge.className = 'auth-badge';
    badge.setAttribute('data-authed', user.isAuthed ? '1' : '0');
    badge.setAttribute('aria-label', 'Current admin session');

    var nameSpan = document.createElement('span');
    nameSpan.className = 'auth-badge__name';
    nameSpan.textContent = user.name || 'Admin';

    var divider = document.createElement('span');
    divider.className = 'auth-badge__divider';

    var roleSpan = document.createElement('span');
    roleSpan.className = 'auth-badge__role';
    roleSpan.textContent = user.role || 'admin';

    badge.appendChild(nameSpan);
    badge.appendChild(divider);
    badge.appendChild(roleSpan);

    var target = container && container.nodeType === 1 ? container : document.body;
    target.appendChild(badge);

    return badge;
  }

  if (typeof window !== 'undefined') {
    window.getCurrentAuthUser = getCurrentAuthUser;
    window.renderAuthBadge = renderAuthBadge;
  }
})();