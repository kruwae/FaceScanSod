// ============================================================
//  staffOS Sheet — Authentication helpers and compatibility shims
// ============================================================

function maskSensitiveValue(value) {
  var raw = String(value || '');
  if (!raw) return '';
  if (raw.length <= 4) return '****';
  return raw.substring(0, 2) + '****' + raw.substring(raw.length - 2);
}

function logAction(entry) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var schema = ['timestamp', 'username', 'role', 'action', 'endpoint', 'status', 'ip', 'details'];
    var result = ensureSheetWithHeaders(ss, 'AuditLog', schema);
    var sheet = result.sheet;
    var row = sheet.getLastRow() + 1;
    var timestamp = new Date();
    var payload = entry || {};
    var details = payload.details;
    if (typeof details !== 'string') {
      try { details = JSON.stringify(details || {}); } catch (err) { details = '{}'; }
    }
    sheet.getRange(row, 1, 1, schema.length).setValues([[
      timestamp,
      String(payload.username || ''),
      normalizeRole(payload.role),
      String(payload.action || ''),
      String(payload.endpoint || ''),
      String(payload.status || 'success'),
      String(payload.ip || ''),
      details
    ]]);
  } catch (e) {
    // Fail-safe: never block main logic
  }
}

function ensureAuthBootstrap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  upsertStaffPermissionColumns(result.sheet, result.headerMap);
  return result;
}

function validateToken(token) {
  var rawToken = String(token || '').trim();
  if (!rawToken) {
    return { ok: false, error: 'Unauthorized', code: 401 };
  }

  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get(TOKEN_CACHE_PREFIX + rawToken);
    if (!cached) {
      return { ok: false, error: 'Unauthorized', code: 401 };
    }

    var session = JSON.parse(cached);
    if (!session || !session.username) {
      return { ok: false, error: 'Unauthorized', code: 401 };
    }

    if (session.expiresAt && Number(session.expiresAt) < Date.now()) {
      cache.remove(TOKEN_CACHE_PREFIX + rawToken);
      return { ok: false, error: 'Session expired', code: 401 };
    }

    return {
      ok: true,
      user: {
        username: String(session.username || '').trim(),
        role: normalizeRole(session.role)
      },
      token: rawToken
    };
  } catch (e) {
    return { ok: false, error: 'Unauthorized', code: 401 };
  }
}

function requireRole(allowedRoles, params) {
  var auth = validateToken(params && params.token);
  if (!auth.ok) return auth;

  var roles = Array.isArray(allowedRoles) ? allowedRoles.map(function(role) {
    return normalizeRole(role);
  }) : [];
  var userRole = normalizeRole(auth.user && auth.user.role);

  if (roles.length && roles.indexOf(userRole) === -1) {
    return { ok: false, error: 'Forbidden', code: 403, user: auth.user };
  }

  return auth;
}

function authorize(action, params) {
  var actionName = String(action || '').trim();
  var requiredRoles = ENDPOINT_ROLE_RULES[actionName];

  if (!requiredRoles || !requiredRoles.length) {
    if (!REQUIRE_AUTH_FOR_ALL_API) {
      return { ok: true, user: { username: '', role: DEFAULT_ROLE } };
    }
    return validateToken(params && params.token);
  }

  return requireRole(requiredRoles, params);
}

function logout(params) {
  var token = String((params && params.token) || '').trim();
  if (!token) {
    return { status: 'ok', message: 'Logged out' };
  }

  try {
    CacheService.getScriptCache().remove(TOKEN_CACHE_PREFIX + token);
  } catch (e) {}

  return { status: 'ok', message: 'Logged out' };
}
