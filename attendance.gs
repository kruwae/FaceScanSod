// ============================================================

var STAFFOS_SHEET   = 'staffOS';
var STAFFOS_HEADERS = ['Username', 'Code', 'Role', 'Status', 'Note', 'Created At', 'Updated At', 'Email', 'Hash Version', 'Hash Salt'];
var DEFAULT_ADMIN_CODE = '2569';
var ADMIN_PASSWORD_SALT = 'staffOS-v1';
var HASH_PREFIX = 'sha256:';
var HASH_VERSION_SHA256 = 'sha256';
var HASH_VERSION_BCRYPT = 'bcrypt';
var HASH_VERSION_LEGACY = 'legacy';
var HASH_VERSION_V1 = HASH_VERSION_SHA256;
var HASH_VERSION_V2 = HASH_VERSION_BCRYPT;
var DEFAULT_HASH_VERSION = HASH_VERSION_BCRYPT;
var DEFAULT_USER_SALT_LENGTH = 16;
var PASSWORD_ALGORITHM = 'sha256';
var GOOGLE_OAUTH_CLIENT_ID = '';
var GOOGLE_ID_TOKEN_AUDIENCE = '';

var ROLE_SUPER_ADMIN = 'super_admin';
var ROLE_ADMIN = 'admin';
var ROLE_HEAD_UNIT = 'head_unit';
var ROLE_STAFF = 'staff';
var ROLE_ALIASES = {
  'superadmin': ROLE_SUPER_ADMIN,
  'super-admin': ROLE_SUPER_ADMIN,
  'root': ROLE_SUPER_ADMIN,
  'administrator': ROLE_ADMIN,
  'manager': ROLE_HEAD_UNIT,
  'headunit': ROLE_HEAD_UNIT
};
var ROLE_HIERARCHY = {
  'staff': 1,
  'head_unit': 2,
  'admin': 3,
  'super_admin': 4
};
var DEFAULT_ROLE = ROLE_STAFF;
var DEFAULT_STAFF_STATUS = 'active';
var STAFFOS_SCOPE_HEADER = 'Scope';
var STAFFOS_UNIT_HEADER = 'Unit';
var STAFFOS_PERMISSION_HEADERS = ['Can Register Face', 'Can View Report', 'Can Manage Staff', 'Can Manage Config'];

function normalizePasswordInput(password) {
  return String(password || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\u200B/g, '')
    .replace(/\u200C/g, '')
    .replace(/\u200D/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
}

function createUserSalt(seed) {
  var raw = [String(seed || ''), new Date().getTime(), Math.random(), Math.random()].join('|');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return bytesToHex(digest).substring(0, DEFAULT_USER_SALT_LENGTH);
}

function normalizeHash(hash) {
  return String(hash || '')
    .replace(/^sha256[:$]/, '')
    .replace(/^bcrypt[:$]/, '')
    .replace(/^v[12][:$]/, '')
    .trim();
}

function detectHashVersion(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (!raw) return HASH_VERSION_LEGACY;
  if (raw.indexOf('bcrypt:') === 0) return HASH_VERSION_BCRYPT;
  if (raw.indexOf('sha256:') === 0) return HASH_VERSION_SHA256;
  if (raw.indexOf('v2:') === 0) return HASH_VERSION_BCRYPT;
  if (raw.indexOf('v1:') === 0) return HASH_VERSION_SHA256;
  return HASH_VERSION_LEGACY;
}

function buildPasswordRecord(password, userSalt, version) {
  var input = normalizePasswordInput(password);
  var salt = String(ADMIN_PASSWORD_SALT || '').trim();
  var resolvedVersion = String(version || DEFAULT_HASH_VERSION).toLowerCase();

  if (resolvedVersion === HASH_VERSION_SHA256) {
    var legacyBase = salt ? (salt + '|' + input) : input;
    var legacyBytes = Utilities.newBlob(legacyBase).getBytes();
    var legacyDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, legacyBytes);
    return {
      version: HASH_VERSION_SHA256,
      salt: '',
      hash: HASH_PREFIX + bytesToHex(legacyDigest)
    };
  }

  if (resolvedVersion === HASH_VERSION_BCRYPT) {
    var bcryptSalt = String(userSalt || '').trim();
    if (!bcryptSalt) bcryptSalt = createUserSalt(input);
    var bcryptBase = ['bcrypt', salt, bcryptSalt, input].join('|');
    var bcryptBytes = Utilities.newBlob(bcryptBase).getBytes();
    var bcryptDigest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bcryptBytes);
    return {
      version: HASH_VERSION_BCRYPT,
      salt: bcryptSalt,
      hash: HASH_VERSION_BCRYPT + ':' + HASH_PREFIX + bytesToHex(bcryptDigest)
    };
  }

  return buildPasswordRecord(input, userSalt, HASH_VERSION_BCRYPT);
}

function hashPassword(password) {
  return buildPasswordRecord(password, '', HASH_VERSION_SHA256).hash;
}

function hashPasswordV2(password, userSalt) {
  return buildPasswordRecord(password, userSalt, HASH_VERSION_BCRYPT).hash;
}

function bytesToHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var value = bytes[i];
    if (value < 0) value += 256;
    var h = value.toString(16);
    if (h.length === 1) h = '0' + h;
    hex += h;
  }
  return hex;
}

function parsePasswordRecord(value) {
  var raw = String(value || '').trim();
  if (!raw) return { version: HASH_VERSION_LEGACY, salt: '', hash: '' };

  var version = HASH_VERSION_LEGACY;
  var body = raw;

  var versionMatch = raw.match(/^(v[12])[:$](.*)$/i);
  if (versionMatch) {
    version = String(versionMatch[1]).toLowerCase();
    body = versionMatch[2];
  }

  var hash = normalizeHash(body);
  var salt = '';

  if (version === HASH_VERSION_V2) {
    var parts = body.split('|');
    if (parts.length >= 4) {
      salt = parts[2] || '';
      hash = normalizeHash(parts[parts.length - 1]);
    }
  }

  return { version: version, salt: salt, hash: hash, raw: raw };
}

function isHashedPassword(value) {
  return parsePasswordRecord(value).hash.length >= 64;
}

function safeStringEquals(a, b) {
  var left = String(a || '');
  var right = String(b || '');
  if (left.length !== right.length) return false;
  var diff = 0;
  for (var i = 0; i < left.length; i++) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

function safeHashEquals(input, storedHash) {
  var normalizedInput = normalizePasswordInput(input);
  var computedHash = hashPassword(normalizedInput);
  return safeStringEquals(normalizeHash(computedHash), normalizeHash(storedHash));
}

function safeHashEqualsV2(input, storedRecord) {
  var record = parsePasswordRecord(storedRecord);
  var computed = buildPasswordRecord(input, record.salt || createUserSalt(input), HASH_VERSION_V2);
  return safeStringEquals(normalizeHash(computed.hash), record.hash);
}

var TOKEN_CACHE_PREFIX = 'auth_token_';
var TOKEN_TTL_SECONDS = 8 * 60 * 60;
var LEGACY_MIGRATION_MODE = false;
var REQUIRE_AUTH_FOR_ALL_API = false;
var ENDPOINT_ROLE_RULES = {
  'getKnownFaces': ['staff', 'head_unit', 'admin', 'super_admin'],
  'logAttendance': ['staff', 'head_unit', 'admin', 'super_admin'],
  'logCheckout': ['staff', 'head_unit', 'admin', 'super_admin'],
  'getConfig': ['admin', 'super_admin'],
  'saveConfig': ['admin', 'super_admin'],
  'getAttendanceLogs': ['staff', 'head_unit', 'admin', 'super_admin'],
  'getLocations': ['staff', 'head_unit', 'admin', 'super_admin'],
  'registerUser': ['head_unit', 'admin', 'super_admin'],
  'verifyAdmin': ['admin', 'super_admin'],
  'changeAdminCode': ['admin', 'super_admin'],
  'getStaffList': ['admin', 'super_admin'],
  'getStaffMember': ['admin', 'super_admin'],
  'createStaffMember': ['admin', 'super_admin'],
  'updateStaffMember': ['admin', 'super_admin'],
  'deleteStaffMember': ['super_admin'],
  'toggleStaffPermission': ['admin', 'super_admin'],
  'updateStaffScope': ['admin', 'super_admin'],
  'getMyAccess': ['staff', 'head_unit', 'admin', 'super_admin'],
  'whoAmI': ['staff', 'head_unit', 'admin', 'super_admin']
};

function generateToken(username, role) {
  var raw = [String(username || '').trim(), String(role || DEFAULT_ROLE), new Date().getTime(), Math.random(), Math.random()].join('|');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytesToHex(bytes) + '|' + raw).replace(/=+$/g, '');
}

function storeToken(token, username, role) {
  var cache = CacheService.getScriptCache();
  cache.put(TOKEN_CACHE_PREFIX + token, JSON.stringify({
    username: String(username || ''),
    role: normalizeRole(role),
    expiresAt: Date.now() + (TOKEN_TTL_SECONDS * 1000)
  }), TOKEN_TTL_SECONDS);
  return token;
}

function normalizeRole(role) {
  var value = String(role || '').trim().toLowerCase();
  if (!value) return DEFAULT_ROLE;
  if (ROLE_ALIASES[value]) value = ROLE_ALIASES[value];
  if (!ROLE_HIERARCHY[value]) return DEFAULT_ROLE;
  return value;
}

function isRoleAtLeast(role, minimumRole) {
  return (ROLE_HIERARCHY[normalizeRole(role)] || 0) >= (ROLE_HIERARCHY[normalizeRole(minimumRole)] || 0);
}

function normalizeScopeValue(value) {
  return String(value || '').trim();
}

function normalizeScopeList(scope) {
  var raw = String(scope || '').trim();
  if (!raw) return [];
  return raw.split(/[,\n;]/).map(function(item) {
    return normalizeScopeValue(item);
  }).filter(function(item) {
    return !!item;
  });
}

function scopeMatchesAccess(scope, unit) {
  var list = normalizeScopeList(scope);
  if (!list.length) return true;
  if (!unit) return false;

  var normalizedUnit = normalizeScopeValue(unit).toLowerCase();
  for (var i = 0; i < list.length; i++) {
    var entry = normalizeScopeValue(list[i]).toLowerCase();
    if (entry === '*' || entry === 'all' || entry === 'global') return true;
    if (entry === normalizedUnit) return true;
  }
  return false;
}

function derivePermissionSetFromRole(role) {
  var normalized = normalizeRole(role);
  var permissions = {
    canRegisterFace: false,
    canViewReport: false,
    canManageStaff: false,
    canManageConfig: false
  };

  if (normalized === ROLE_SUPER_ADMIN) {
    permissions.canRegisterFace = true;
    permissions.canViewReport = true;
    permissions.canManageStaff = true;
    permissions.canManageConfig = true;
    return permissions;
  }

  if (normalized === ROLE_ADMIN) {
    permissions.canRegisterFace = true;
    permissions.canViewReport = true;
    permissions.canManageStaff = true;
    permissions.canManageConfig = true;
    return permissions;
  }

  if (normalized === ROLE_HEAD_UNIT) {
    permissions.canRegisterFace = true;
    permissions.canViewReport = true;
    return permissions;
  }

  return permissions;
}

function parseBooleanValue(value) {
  if (value === true || value === 1) return true;
  var raw = String(value || '').trim().toLowerCase();
  return raw === 'true' || raw === 'yes' || raw === '1' || raw === 'y' || raw === 'on';
}

function ensureSheetWithHeaders(ss, sheetName, schema) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  var headers = schema.slice();
  var existingHeaders = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0] : [];
  var existingMap = buildHeaderMap(existingHeaders.map(function(h) { return String(h || '').trim(); }));

  var changed = false;
  for (var i = 0; i < headers.length; i++) {
    if (!existingMap[headers[i]]) {
      existingHeaders[i] = headers[i];
      changed = true;
    }
  }

  if (!existingHeaders.length) {
    existingHeaders = headers.slice();
    changed = true;
  }

  if (changed) {
    sheet.getRange(1, 1, 1, existingHeaders.length).setValues([existingHeaders]);
  }

  var headerMap = buildHeaderMap(existingHeaders.map(function(h) { return String(h || '').trim(); }));
  return { sheet: sheet, headerMap: headerMap };
}

function buildHeaderMap(headers) {
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i] || '').trim();
    if (!key) continue;
    map[key] = i + 1;
    map[key.toLowerCase()] = i + 1;
  }
  return map;
}

function setRowByHeaders(sheet, rowNumber, headerMap, data) {
  for (var key in data) {
    if (!data.hasOwnProperty(key)) continue;
    var col = headerMap[key] || headerMap[String(key).toLowerCase()];
    if (col) sheet.getRange(rowNumber, col).setValue(data[key]);
  }
}

function ensureStaffHeaders(sheet, existingMap) {
  var result = { headers: STAFFOS_HEADERS.slice(), map: {} };
  for (var i = 0; i < STAFFOS_HEADERS.length; i++) {
    result.map[STAFFOS_HEADERS[i]] = i + 1;
    result.map[STAFFOS_HEADERS[i].toLowerCase()] = i + 1;
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, result.headers.length).setValues([result.headers]);
    return result;
  }

  var current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), result.headers.length)).getValues()[0];
  var normalized = [];
  for (var j = 0; j < result.headers.length; j++) {
    normalized[j] = current[j] || result.headers[j];
  }

  var added = false;
  for (var k = 0; k < result.headers.length; k++) {
    if (!normalized[k]) {
      normalized[k] = result.headers[k];
      added = true;
    }
  }

  if (sheet.getLastColumn() < result.headers.length) {
    sheet.getRange(1, 1, 1, result.headers.length).setValues([normalized]);
  } else if (added) {
    sheet.getRange(1, 1, 1, normalized.length).setValues([normalized]);
  }

  var finalMap = buildHeaderMap(normalized);
  result.map = finalMap;
  return result;
}

function ensureStaffSheetWithContract(ss) {
  var result = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var sheet = result.sheet;
  var headerMap = result.headerMap;

  var existing = sheet.getDataRange().getValues();
  if (existing.length > 0) {
    var headerRow = existing[0].map(function(h) { return String(h || '').trim(); });
    var extendedHeaders = headerRow.slice();
    var required = [STAFFOS_SCOPE_HEADER, STAFFOS_UNIT_HEADER]
      .concat(STAFFOS_PERMISSION_HEADERS);
    var changed = false;
    required.forEach(function(header) {
      if (extendedHeaders.indexOf(header) === -1) {
        extendedHeaders.push(header);
        changed = true;
      }
    });
    if (changed) {
      sheet.getRange(1, 1, 1, extendedHeaders.length).setValues([extendedHeaders]);
      headerMap = buildHeaderMap(extendedHeaders);
    }
  }

  return { sheet: sheet, headerMap: headerMap };
}

function normalizeStaffRow(row, headerMap) {
  var map = headerMap || {};
  var role = normalizeRole(row[(map['Role'] || map['role']) - 1]);
  var status = String(row[(map['Status'] || map['status']) - 1] || DEFAULT_STAFF_STATUS).trim().toLowerCase() || DEFAULT_STAFF_STATUS;
  var scope = normalizeScopeValue(row[(map[STAFFOS_SCOPE_HEADER] || map[STAFFOS_SCOPE_HEADER.toLowerCase()]) - 1] || '');
  var unit = normalizeScopeValue(row[(map[STAFFOS_UNIT_HEADER] || map[STAFFOS_UNIT_HEADER.toLowerCase()]) - 1] || '');
  var permissions = derivePermissionSetFromRole(role);

  for (var i = 0; i < STAFFOS_PERMISSION_HEADERS.length; i++) {
    var header = STAFFOS_PERMISSION_HEADERS[i];
    var key = headerToPermissionKey(header);
    var idx = map[header] || map[header.toLowerCase()];
    if (idx) permissions[key] = parseBooleanValue(row[idx - 1]);
  }

  return {
    username: String(row[(map['Username'] || map['username']) - 1] || '').trim(),
    code: String(row[(map['Code'] || map['code']) - 1] || ''),
    role: role,
    status: status,
    note: String(row[(map['Note'] || map['note']) - 1] || '').trim(),
    createdAt: row[(map['Created At'] || map['created at']) - 1] || '',
    updatedAt: row[(map['Updated At'] || map['updated at']) - 1] || '',
    email: normalizeEmail(row[(map['Email'] || map['email']) - 1] || ''),
    hashVersion: String(row[(map['Hash Version'] || map['hash version']) - 1] || '').trim().toLowerCase(),
    hashSalt: String(row[(map['Hash Salt'] || map['hash salt']) - 1] || '').trim(),
    scope: scope,
    unit: unit,
    permissions: permissions
  };
}

function headerToPermissionKey(header) {
  var raw = String(header || '').trim();
  if (raw === 'Can Register Face') return 'canRegisterFace';
  if (raw === 'Can View Report') return 'canViewReport';
  if (raw === 'Can Manage Staff') return 'canManageStaff';
  if (raw === 'Can Manage Config') return 'canManageConfig';
  return raw;
}

function upsertStaffPermissionColumns(sheet, headerMap) {
  var currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), STAFFOS_HEADERS.length + 4)).getValues()[0];
  var headers = currentHeaders.slice();
  var changed = false;

  if (headers.indexOf(STAFFOS_SCOPE_HEADER) === -1) { headers.push(STAFFOS_SCOPE_HEADER); changed = true; }
  if (headers.indexOf(STAFFOS_UNIT_HEADER) === -1) { headers.push(STAFFOS_UNIT_HEADER); changed = true; }
  for (var i = 0; i < STAFFOS_PERMISSION_HEADERS.length; i++) {
    if (headers.indexOf(STAFFOS_PERMISSION_HEADERS[i]) === -1) {
      headers.push(STAFFOS_PERMISSION_HEADERS[i]);
      changed = true;
    }
  }

  if (changed) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return buildHeaderMap(headers);
}

function findStaffRowByUsername(sheet, headerMap, username) {
  var data = sheet.getDataRange().getValues();
  var target = String(username || '').trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    var rowUsername = String(data[i][(headerMap['Username'] || headerMap['username']) - 1] || '').trim().toLowerCase();
    if (rowUsername === target) return i + 1;
  }
  return 0;
}

function normalizeStaffMemberInput(input) {
  var data = input || {};
  var role = normalizeRole(data.role);
  var permissions = derivePermissionSetFromRole(role);

  for (var i = 0; i < STAFFOS_PERMISSION_HEADERS.length; i++) {
    var header = STAFFOS_PERMISSION_HEADERS[i];
    var key = headerToPermissionKey(header);
    if (data.hasOwnProperty(key)) permissions[key] = parseBooleanValue(data[key]);
  }

  return {
    username: String(data.username || '').trim(),
    code: normalizePasswordInput(data.code || data.password || data.newCode || ''),
    role: role,
    status: String(data.status || DEFAULT_STAFF_STATUS).trim().toLowerCase() || DEFAULT_STAFF_STATUS,
    note: String(data.note || '').trim(),
    email: normalizeEmail(data.email || ''),
    scope: normalizeScopeValue(data.scope || data.unit || data.unitScope || ''),
    unit: normalizeScopeValue(data.unit || data.scopeUnit || data.unitScope || ''),
    permissions: permissions
  };
}

function applyStaffPermissionRow(sheet, rowNumber, headerMap, input, existingRow) {
  var permissions = input.permissions || derivePermissionSetFromRole(input.role);
  var updatedAt = new Date();
  var codeRecord = null;

  if (input.code) {
    var salt = createUserSalt(input.username + '|' + input.code);
    codeRecord = buildPasswordRecord(input.code, salt, HASH_VERSION_V2);
  }

  setRowByHeaders(sheet, rowNumber, headerMap, {
    'Username': input.username,
    'Role': input.role,
    'Status': input.status,
    'Note': input.note,
    'Updated At': updatedAt,
    'Email': input.email,
    'Scope': input.scope,
    'Unit': input.unit,
    'Can Register Face': permissions.canRegisterFace ? 'TRUE' : 'FALSE',
    'Can View Report': permissions.canViewReport ? 'TRUE' : 'FALSE',
    'Can Manage Staff': permissions.canManageStaff ? 'TRUE' : 'FALSE',
    'Can Manage Config': permissions.canManageConfig ? 'TRUE' : 'FALSE'
  });

  if (codeRecord) {
    setRowByHeaders(sheet, rowNumber, headerMap, {
      'Code': codeRecord.hash,
      'Hash Version': codeRecord.version,
      'Hash Salt': codeRecord.salt
    });
  } else if (existingRow) {
    setRowByHeaders(sheet, rowNumber, headerMap, {
      'Code': existingRow.code,
      'Hash Version': existingRow.hashVersion || detectHashVersion(existingRow.code),
      'Hash Salt': existingRow.hashSalt || ''
    });
  }

  if (!existingRow || !existingRow.createdAt) {
    setRowByHeaders(sheet, rowNumber, headerMap, {
      'Created At': existingRow && existingRow.createdAt ? existingRow.createdAt : new Date()
    });
  }
}

function staffMemberToPublicObject(row, rowNumber) {
  return {
    rowNumber: rowNumber,
    username: row.username,
    role: row.role,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    email: row.email,
    scope: row.scope,
    unit: row.unit,
    permissions: row.permissions
  };
}

function getStaffList(params) {
  var auth = requireRole(['admin', 'super_admin'], params);
  if (!auth.ok) return auth;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var data = sheet.getDataRange().getValues();
  var items = [];

  for (var i = 1; i < data.length; i++) {
    var row = normalizeStaffRow(data[i], headerMap);
    if (!row.username) continue;
    items.push(staffMemberToPublicObject(row, i + 1));
  }

  return { status: 'ok', data: items, role: auth.user.role };
}

function getStaffMember(params) {
  var auth = requireRole(['admin', 'super_admin'], params);
  if (!auth.ok) return auth;

  var username = String((params && params.username) || '').trim();
  if (!username) return { status: 'error', message: 'Missing username', code: 400 };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var rowNumber = findStaffRowByUsername(sheet, headerMap, username);
  if (!rowNumber) return { status: 'error', message: 'Not found', code: 404 };

  var rowValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  var row = normalizeStaffRow(rowValues, headerMap);
  return { status: 'ok', data: staffMemberToPublicObject(row, rowNumber) };
}

function createStaffMember(params) {
  var auth = requireRole(['admin', 'super_admin'], params);
  if (!auth.ok) return auth;

  var input = normalizeStaffMemberInput(params || {});
  if (!input.username) return { status: 'error', message: 'Missing username', code: 400 };
  if (!input.code) return { status: 'error', message: 'Missing code', code: 400 };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  if (findStaffRowByUsername(sheet, headerMap, input.username)) {
    return { status: 'error', message: 'Username already exists', code: 409 };
  }

  var rowNumber = sheet.getLastRow() + 1;
  applyStaffPermissionRow(sheet, rowNumber, headerMap, input, null);
  return { status: 'ok', message: 'Staff member created', data: getStaffMember({ token: params.token, username: input.username }).data };
}

function updateStaffMember(params) {
  var auth = requireRole(['admin', 'super_admin'], params);
  if (!auth.ok) return auth;

  var input = normalizeStaffMemberInput(params || {});
  var targetUsername = String((params && params.username) || '').trim();
  if (!targetUsername) return { status: 'error', message: 'Missing username', code: 400 };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var rowNumber = findStaffRowByUsername(sheet, headerMap, targetUsername);
  if (!rowNumber) return { status: 'error', message: 'Not found', code: 404 };

  var currentValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  var existingRow = normalizeStaffRow(currentValues, headerMap);
  if (input.username && input.username !== targetUsername) {
    var conflict = findStaffRowByUsername(sheet, headerMap, input.username);
    if (conflict && conflict !== rowNumber) return { status: 'error', message: 'Username already exists', code: 409 };
  }
  input.username = input.username || targetUsername;
  if (!input.code) input.code = '';
  applyStaffPermissionRow(sheet, rowNumber, headerMap, input, existingRow);
  return { status: 'ok', message: 'Staff member updated', data: getStaffMember({ token: params.token, username: input.username }).data };
}

function deleteStaffMember(params) {
  var auth = requireRole(['super_admin'], params);
  if (!auth.ok) return auth;

  var username = String((params && params.username) || '').trim();
  if (!username) return { status: 'error', message: 'Missing username', code: 400 };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var rowNumber = findStaffRowByUsername(sheet, headerMap, username);
  if (!rowNumber) return { status: 'error', message: 'Not found', code: 404 };

  sheet.deleteRow(rowNumber);
  return { status: 'ok', message: 'Staff member deleted' };
}

function toggleStaffPermission(params) {
  var auth = requireRole(['admin', 'super_admin'], params);
  if (!auth.ok) return auth;

  var username = String((params && params.username) || '').trim();
  var permission = String((params && params.permission) || '').trim();
  var value = parseBooleanValue(params && params.value);
  var permissionKey = headerToPermissionKey(permission);
  if (!username || !permissionKey) return { status: 'error', message: 'Missing parameters', code: 400 };

  var allowedKeys = ['canRegisterFace', 'canViewReport', 'canManageStaff', 'canManageConfig'];
  if (allowedKeys.indexOf(permissionKey) === -1) {
    return { status: 'error', message: 'Invalid permission', code: 400 };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var rowNumber = findStaffRowByUsername(sheet, headerMap, username);
  if (!rowNumber) return { status: 'error', message: 'Not found', code: 404 };

  var header = {
    canRegisterFace: 'Can Register Face',
    canViewReport: 'Can View Report',
    canManageStaff: 'Can Manage Staff',
    canManageConfig: 'Can Manage Config'
  }[permissionKey];

  sheet.getRange(rowNumber, headerMap[header]).setValue(value ? 'TRUE' : 'FALSE');
  sheet.getRange(rowNumber, headerMap['Updated At']).setValue(new Date());
  return { status: 'ok', message: 'Permission updated', permission: permissionKey, value: value };
}

function updateStaffScope(params) {
  var auth = requireRole(['admin', 'super_admin'], params);
  if (!auth.ok) return auth;

  var username = String((params && params.username) || '').trim();
  if (!username) return { status: 'error', message: 'Missing username', code: 400 };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var rowNumber = findStaffRowByUsername(sheet, headerMap, username);
  if (!rowNumber) return { status: 'error', message: 'Not found', code: 404 };

  var scope = normalizeScopeValue((params && params.scope) || '');
  var unit = normalizeScopeValue((params && params.unit) || '');
  sheet.getRange(rowNumber, headerMap[STAFFOS_SCOPE_HEADER]).setValue(scope);
  sheet.getRange(rowNumber, headerMap[STAFFOS_UNIT_HEADER]).setValue(unit);
  sheet.getRange(rowNumber, headerMap['Updated At']).setValue(new Date());
  return { status: 'ok', message: 'Scope updated', scope: scope, unit: unit };
}

function getStaffMemberByEmail(email) {
  var normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var row = normalizeStaffRow(data[i], headerMap);
    if (row.email === normalizedEmail) {
      return staffMemberToPublicObject(row, i + 1);
    }
  }
  return null;
}

function getAdminByEmail(email) {
  var member = getStaffMemberByEmail(email);
  if (!member) return null;
  if (member.role !== ROLE_ADMIN && member.role !== ROLE_SUPER_ADMIN) return null;
  if (member.status !== 'active') return null;
  return member;
}

function verifyAdminByEmail(email) {
  var admin = getAdminByEmail(email);
  if (!admin) {
    return { success: false, error: 'ไม่พบอีเมลแอดมินหรือบัญชีถูกระงับ' };
  }
  return { success: true, username: admin.username, email: admin.email, hashVersion: 'email', role: admin.role };
}

function verifyGoogleIdToken(idToken) {
  var token = String(idToken || '').trim();
  if (!token) return { success: false, error: 'Missing Google token' };

  try {
    var parts = token.split('.');
    if (parts.length !== 3) return { success: false, error: 'Invalid Google token format' };

    var b64Segment = parts[1];
    while (b64Segment.length % 4 !== 0) b64Segment += '=';
    var payloadText = Utilities.newBlob(Utilities.base64DecodeWebSafe(b64Segment)).getDataAsString();

    var payload = JSON.parse(payloadText);
    var email = normalizeEmail(payload.email || '');
    var aud = String(payload.aud || '');
    var iss = String(payload.iss || '').toLowerCase();

    if (!email) return { success: false, error: 'Missing email in token' };
    if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
      return { success: false, error: 'Invalid token issuer' };
    }

    var configuredAudiences = [
      String(GOOGLE_ID_TOKEN_AUDIENCE || '').trim(),
      String(GOOGLE_OAUTH_CLIENT_ID || '').trim()
    ].filter(function(value) { return !!String(value || '').trim(); });

    if (configuredAudiences.length && configuredAudiences.indexOf(aud) === -1) {
      return {
        success: false,
        error: 'Invalid token audience',
        debug: {
          expected: configuredAudiences.join(','),
          actual: aud
        }
      };
    }

    if (payload.email_verified !== true && String(payload.email_verified) !== 'true') {
      return { success: false, error: 'Google email not verified' };
    }

    return { success: true, email: email, payload: payload };
  } catch (e) {
    return { success: false, error: 'Unable to verify Google token' };
  }
}

function getGoogleAdminByEmail(email) {
  return getAdminByEmail(email);
}

function getGoogleAdminEmails() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var data = sheet.getDataRange().getValues();
  var emails = [];

  for (var i = 1; i < data.length; i++) {
    var row = normalizeStaffRow(data[i], headerMap);
    if ((row.role === ROLE_ADMIN || row.role === ROLE_SUPER_ADMIN) && row.status === 'active' && row.email) emails.push(row.email);
  }

  return emails;
}

function login(params) {
  var username = String((params && params.username) || 'admin').trim();
  var authMethod = String((params && params.authMethod) || 'code').trim().toLowerCase();
  var role = DEFAULT_ROLE;
  var token;

  if (authMethod === 'google') {
    var googleResult = verifyGoogleIdToken((params && params.idToken) || '');
    if (!googleResult.success) {
      logAction({
        username: '',
        role: DEFAULT_ROLE,
        action: 'login',
        endpoint: 'login',
        status: 'fail',
        details: {
          reason: 'invalid_google_token',
          error: googleResult.error,
          debug: googleResult.debug || {}
        }
      });
      return { status: 'error', message: googleResult.error || 'Unauthorized', debug: googleResult.debug || {} };
    }

    var allowedGoogleEmails = getGoogleAdminEmails();
    var normalizedGoogleEmail = normalizeEmail(googleResult.email);
    var googleAdmin = getGoogleAdminByEmail(normalizedGoogleEmail);

    Logger.log('[login/google] checking email: "%s" | whitelist count: %s | whitelist: [%s]',
      normalizedGoogleEmail, allowedGoogleEmails.length, allowedGoogleEmails.join(', '));

    if (!googleAdmin && allowedGoogleEmails.indexOf(normalizedGoogleEmail) === -1) {
      logAction({
        username: maskSensitiveValue(googleResult.email),
        role: DEFAULT_ROLE,
        action: 'login',
        endpoint: 'login',
        status: 'fail',
        details: { reason: 'google_email_not_whitelisted', email: maskSensitiveValue(googleResult.email) }
      });
      return {
        status: 'error',
        message: 'อีเมลนี้ไม่ได้รับอนุญาตให้เข้าใช้งาน',
        debug: {
          receivedEmail: maskSensitiveValue(normalizedGoogleEmail),
          hint: 'Ensure this email is in the staffOS sheet with role=admin/super_admin and status=active'
        }
      };
    }

    if (googleAdmin) {
      username = googleAdmin.username || username;
      role = normalizeRole(googleAdmin.role);
    } else {
      role = ROLE_ADMIN;
    }

    token = storeToken(generateToken(username, role), username, role);

    logAction({
      username: username,
      role: role,
      action: 'login',
      endpoint: 'login',
      status: 'success',
      details: { tokenIssued: true, authMethod: 'google', email: maskSensitiveValue(googleResult.email) }
    });

    return { status: 'ok', token: token, username: username, role: role, expiresIn: TOKEN_TTL_SECONDS, authMethod: 'google' };
  }

  if (authMethod === 'email') {
    var email = String((params && params.email) || '').trim();
    var verifiedEmail = verifyAdminByEmail(email);
    if (!verifiedEmail || !verifiedEmail.success) {
      logAction({
        username: maskSensitiveValue(email),
        role: DEFAULT_ROLE,
        action: 'login',
        endpoint: 'login',
        status: 'fail',
        details: { reason: 'invalid_email_admin', email: maskSensitiveValue(email) }
      });
      return { status: 'error', message: (verifiedEmail && verifiedEmail.error) || 'Unauthorized' };
    }

    username = verifiedEmail.username || username;
    role = normalizeRole(verifiedEmail.role || ROLE_ADMIN);
    token = storeToken(generateToken(username, role), username, role);

    logAction({
      username: username,
      role: role,
      action: 'login',
      endpoint: 'login',
      status: 'success',
      details: { tokenIssued: true, authMethod: 'email' }
    });

    return { status: 'ok', token: token, username: username, role: role, expiresIn: TOKEN_TTL_SECONDS, authMethod: 'email' };
  }

  var code = String((params && params.code) || '').trim();
  var verified = verifyAdmin(code);
  if (!verified || !verified.success) {
    logAction({
      username: maskSensitiveValue(username),
      role: DEFAULT_ROLE,
      action: 'login',
      endpoint: 'login',
      status: 'fail',
      details: { reason: 'invalid_credentials', username: maskSensitiveValue(username), authMethod: 'code' }
    });
    return { status: 'error', message: (verified && verified.error) || 'Unauthorized' };
  }

  role = normalizeRole(verified.role || ROLE_ADMIN);
  token = storeToken(generateToken(username, role), username, role);
  logAction({
    username: username,
    role: role,
    action: 'login',
    endpoint: 'login',
    status: 'success',
    details: { tokenIssued: true, authMethod: 'code' }
  });
  return { status: 'ok', token: token, username: username, role: role, expiresIn: TOKEN_TTL_SECONDS, authMethod: 'code' };
}

function migrateAdminPasswordIfNeeded(sheet, rowNumber, hm, plainCode) {
  var hashed = hashPassword(plainCode);
  sheet.getRange(rowNumber, hm['Code']).setValue(hashed);
  sheet.getRange(rowNumber, hm['Updated At']).setValue(new Date());
  return hashed;
}

function getStaffMemberByUsername(username) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var headerMap = upsertStaffPermissionColumns(sheet, result.headerMap);
  var rowNumber = findStaffRowByUsername(sheet, headerMap, username);
  if (!rowNumber) return null;
  var rowValues = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  return normalizeStaffRow(rowValues, headerMap);
}

function canAccessScope(user, scope, unit) {
  if (!user) return false;
  var role = normalizeRole(user.role);
  if (role === ROLE_SUPER_ADMIN || role === ROLE_ADMIN) return true;
  if (role === ROLE_HEAD_UNIT) return scopeMatchesAccess(scope || user.scope, unit || user.unit);
  return scopeMatchesAccess(scope || user.scope, unit || user.unit);
}

function getMyAccess(params) {
  var auth = validateToken(params && params.token);
  if (!auth.ok) return auth;

  var member = getStaffMemberByUsername(auth.user.username);
  if (!member) {
    return { status: 'error', message: 'Not found', code: 404 };
  }

  return {
    status: 'ok',
    data: {
      username: member.username,
      role: member.role,
      status: member.status,
      scope: member.scope,
      unit: member.unit,
      permissions: member.permissions
    }
  };
}

function whoAmI(params) {
  return getMyAccess(params);
}

/**
 * initSetup — เรียก 1 ครั้งหลัง deploy เพื่อสร้าง staffOS sheet
 * URL: ?action=initSetup
 */
function initSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = upsertStaffPermissionColumns(sheet, result.headerMap);

  var data = sheet.getDataRange().getValues();
  var hasAdmin = false;
  for (var i = 1; i < data.length; i++) {
    var role = normalizeRole(data[i][(hm['Role'] || hm['role']) - 1]);
    if (role === ROLE_ADMIN || role === ROLE_SUPER_ADMIN) {
      hasAdmin = true;
      break;
    }
  }

  if (!hasAdmin) {
    var row = sheet.getLastRow() + 1;
    var now = new Date();
    var adminSalt = createUserSalt('admin');
    var adminRecord = buildPasswordRecord(DEFAULT_ADMIN_CODE, adminSalt, HASH_VERSION_V2);
    setRowByHeaders(sheet, row, hm, {
      'Username'    : 'admin',
      'Code'        : adminRecord.hash,
      'Role'        : ROLE_ADMIN,
      'Status'      : 'active',
      'Note'        : 'Default admin — เปลี่ยนรหัสหลัง deploy',
      'Created At'  : now,
      'Updated At'  : now,
      'Email'       : '',
      'Hash Version': adminRecord.version,
      'Hash Salt'   : adminRecord.salt,
      'Scope'       : '',
      'Unit'        : '',
      'Can Register Face': 'TRUE',
      'Can View Report'  : 'TRUE',
      'Can Manage Staff'  : 'TRUE',
      'Can Manage Config' : 'TRUE'
    });
    return { success: true, created: true, message: 'สร้าง staffOS sheet และ admin เริ่มต้นเรียบร้อย (รหัสเริ่มต้นถูกเก็บแบบเข้ารหัสแล้ว)' };
  }

  return { success: true, created: false, message: 'staffOS sheet พร้อมใช้งาน แอดมินมีอยู่แล้ว' };
}

function verifyAdmin(code) {
  var input = normalizePasswordInput(code);
  if (!input) {
    return { success: false, error: 'กรุณากรอกรหัส' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = upsertStaffPermissionColumns(sheet, result.headerMap);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var role = normalizeRole(row[(hm['Role'] || hm['role']) - 1]);
    var status = String(row[(hm['Status'] || hm['status']) - 1] || '').toLowerCase();
    var stored = String(row[(hm['Code'] || hm['code']) - 1] || '');
    var version = String(row[(hm['Hash Version'] || hm['hash version']) - 1] || '').trim().toLowerCase();
    var salt = String(row[(hm['Hash Salt'] || hm['hash salt']) - 1] || '').trim();
    var parsed = parsePasswordRecord(stored);

    if (role !== ROLE_ADMIN && role !== ROLE_SUPER_ADMIN) continue;
    if (status !== 'active') continue;

    if (version === HASH_VERSION_V2 || parsed.version === HASH_VERSION_V2) {
      var v2Salt = salt || parsed.salt || createUserSalt(row[(hm['Username'] || hm['username']) - 1] || 'admin');
      var v2Record = buildPasswordRecord(input, v2Salt, HASH_VERSION_V2);

      if (safeStringEquals(normalizeHash(stored), normalizeHash(v2Record.hash))) {
        if (!version || version !== HASH_VERSION_V2 || !salt || !parsed.salt) {
          sheet.getRange(i + 1, hm['Code']).setValue(v2Record.hash);
          if (hm['Hash Version']) sheet.getRange(i + 1, hm['Hash Version']).setValue(HASH_VERSION_V2);
          if (hm['Hash Salt']) sheet.getRange(i + 1, hm['Hash Salt']).setValue(v2Salt);
          sheet.getRange(i + 1, hm['Updated At']).setValue(new Date());
          return { success: true, migrated: true, hashVersion: HASH_VERSION_V2, role: role };
        }
        return { success: true, hashVersion: HASH_VERSION_V2, role: role };
      }
    }

    if (version === HASH_VERSION_V1 || parsed.version === HASH_VERSION_V1 || !version) {
      var v1Record = buildPasswordRecord(input, '', HASH_VERSION_V1);
      if (safeStringEquals(normalizeHash(stored), normalizeHash(v1Record.hash)) || safeStringEquals(stored, input)) {
        return { success: true, hashVersion: HASH_VERSION_V1, role: role };
      }
    }

    if (stored === input) {
      return { success: true, hashVersion: HASH_VERSION_V1, role: role };
    }
  }

  return { success: false, error: 'รหัสแอดมินไม่ถูกต้องหรือบัญชีถูกระงับ' };
}

function changeAdminCode(currentCode, newCode) {
  if (!currentCode || !newCode) return { success: false, error: 'ข้อมูลไม่ครบ' };
  if (String(newCode).trim().length < 4) return { success: false, error: 'รหัสใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' };

  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var result  = ensureStaffSheetWithContract(ss);
  var sheet   = result.sheet;
  var hm      = upsertStaffPermissionColumns(sheet, result.headerMap);
  var data    = sheet.getDataRange().getValues();
  var current = normalizePasswordInput(currentCode);

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var role   = normalizeRole(row[(hm['Role'] || hm['role']) - 1]);
    var status = String(row[(hm['Status'] || hm['status']) - 1] || '').toLowerCase();
    var stored = String(row[(hm['Code'] || hm['code']) - 1] || '');
    var version = String(row[(hm['Hash Version'] || hm['hash version']) - 1] || '').trim().toLowerCase();
    var salt = String(row[(hm['Hash Salt'] || hm['hash salt']) - 1] || '').trim();
    var parsed = parsePasswordRecord(stored);

    if (role !== ROLE_ADMIN && role !== ROLE_SUPER_ADMIN) continue;
    if (status !== 'active') continue;

    var matched = false;
    if (version === HASH_VERSION_V2 || parsed.version === HASH_VERSION_V2) {
      var currentV2Salt = salt || parsed.salt || createUserSalt(row[(hm['Username'] || hm['username']) - 1] || 'admin');
      matched = safeStringEquals(normalizeHash(buildPasswordRecord(current, currentV2Salt, HASH_VERSION_V2).hash), normalizeHash(stored));
    } else {
      matched = safeStringEquals(normalizeHash(buildPasswordRecord(current, '', HASH_VERSION_V1).hash), normalizeHash(stored)) || safeStringEquals(stored, current);
    }

    if (matched) {
      var updatedSalt = createUserSalt((row[(hm['Username'] || hm['username']) - 1] || 'admin') + '|' + newCode);
      var newRecord = buildPasswordRecord(newCode, updatedSalt, HASH_VERSION_V2);
      sheet.getRange(i + 1, hm['Code']).setValue(newRecord.hash);
      if (hm['Hash Version']) sheet.getRange(i + 1, hm['Hash Version']).setValue(HASH_VERSION_V2);
      if (hm['Hash Salt']) sheet.getRange(i + 1, hm['Hash Salt']).setValue(newRecord.salt);
      if (hm['Email']) sheet.getRange(i + 1, hm['Email']).setValue(String(row[(hm['Email'] || hm['email']) - 1] || '').trim());
      sheet.getRange(i + 1, hm['Updated At']).setValue(new Date());
      return { success: true, message: 'เปลี่ยนรหัสแอดมินเรียบร้อย', hashVersion: HASH_VERSION_V2 };
    }
  }
  return { success: false, error: 'รหัสปัจจุบันไม่ถูกต้อง' };
}

// ============================================================

//  Users
// ============================================================

function ensureUsersSheetWithContract(ss) {
  const schema = ['Employee ID', 'Name', 'Position', 'Face Descriptor', 'Registered At', 'Registered By', 'Status'];
  return ensureSheetWithHeaders(ss, 'Users', schema);
}

function normalizeEmployeeId(value, name, rowIndex) {
  const raw = String(value || '').trim();
  if (raw) return raw;
  const baseName = String(name || '').trim().replace(/\s+/g, '_') || 'EMP';
  return 'EMP-' + baseName + '-' + String(rowIndex || 0);
}

function registerUser(name, faceDescriptor, registeredBy, status, position, roles, role, employeeId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = ensureUsersSheetWithContract(ss);
  const sheet = result.sheet;
  const headerMap = result.headerMap;

  const rowNumber = sheet.getLastRow() + 1;
  const resolvedEmployeeId = normalizeEmployeeId(employeeId, name, rowNumber);

  sheet.getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), 7)).setValues([
    new Array(Math.max(sheet.getLastColumn(), 7)).fill('')
  ]);

  setRowByHeaders(sheet, rowNumber, headerMap, {
    'Employee ID': resolvedEmployeeId,
    'Name': String(name || '').trim(),
    'Position': String(position || '').trim(),
    'Face Descriptor': JSON.stringify(faceDescriptor || []),
    'Registered At': new Date(),
    'Registered By': String(registeredBy || '').trim(),
    'Status': String(status || 'active').trim() || 'active'
  });

  return {
    success: true,
    message: 'บันทึกข้อมูลใบหน้าเรียบร้อย',
    employeeId: resolvedEmployeeId,
    name: String(name || '').trim(),
    position: String(position || '').trim()
  };
}

function getKnownFaces(params) {
  var auth = authorize('getKnownFaces', params);
  if (!auth.ok) {
    logAction({
      username: '',
      role: DEFAULT_ROLE,
      action: 'access_denied',
      endpoint: 'getKnownFaces',
      status: 'fail',
      details: { reason: auth.error || 'Unauthorized' }
    });
    return { status: 'error', message: auth.error || 'Unauthorized', code: auth.code || 401 };
  }

  var token = String((params && params.token) || '').trim();
  var config = getConfig(params) || {};
  var requiredToken = String(config.readToken || '').trim();
  if (requiredToken && token !== requiredToken) {
    logAction({
      username: auth.user && auth.user.username ? auth.user.username : '',
      role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
      action: 'access_denied',
      endpoint: 'getKnownFaces',
      status: 'fail',
      details: { reason: 'invalid_read_token' }
    });
    return { status: 'error', message: 'Unauthorized', code: 401 };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureUsersSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var employeeIdCol = hm['Employee ID'];
  var nameCol = hm['Name'];
  var positionCol = hm['Position'];
  var descriptorCol = hm['Face Descriptor'];
  var statusCol = hm['Status'];

  var users = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var employeeId = employeeIdCol ? String(row[employeeIdCol - 1] || '').trim() : '';
    var name = nameCol ? String(row[nameCol - 1] || '').trim() : '';
    var position = positionCol ? String(row[positionCol - 1] || '').trim() : '';
    var jsonStr = descriptorCol ? String(row[descriptorCol - 1] || '').trim() : '';
    var status = statusCol ? String(row[statusCol - 1] || 'active').toLowerCase() : 'active';

    if (!jsonStr || status === 'inactive') continue;

    try {
      var descriptor = JSON.parse(jsonStr);
      users.push({
        employeeId: employeeId || normalizeEmployeeId('', name, i + 1),
        label: name || employeeId || ('User ' + (i + 1)),
        name: name || '',
        position: position || '',
        descriptor: descriptor,
        status: status || 'active'
      });
    } catch (e) {}
  }

  logAction({
    username: auth.user && auth.user.username ? auth.user.username : '',
    role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
    action: 'getKnownFaces',
    endpoint: 'getKnownFaces',
    status: 'success',
    details: { count: users.length }
  });

  return users;
}

// ============================================================

//  Attendance Log
// ============================================================

function normalizeAttendanceEmployeeId(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    var direct = String(payload.employeeId || payload.Employee_ID || payload.employeeID || '').trim();
    if (direct) return direct;
    return String(payload.name || payload.Name || '').trim();
  }
  return String(payload || '').trim();
}

function getAttendanceDateKey(dateObj) {
  return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function buildAttendanceIdempotencyKey(employeeId, actionType, dateKey) {
  return [String(employeeId || '').trim(), String(actionType || '').trim(), String(dateKey || '').trim()].join('|');
}

function logAttendance(payload, actionParam) {
  var actionType = actionParam || 'logAttendance';
  var auth = authorize(actionType, payload);
  if (!auth.ok) {
    logAction({
      username: '',
      role: DEFAULT_ROLE,
      action: actionType,
      endpoint: actionType,
      status: 'fail',
      details: { reason: auth.error || 'Unauthorized' }
    });
    return { status: 'error', message: auth.error || 'Unauthorized', code: auth.code || 401 };
  }

  var employeeId, name, lat, lng, locationName, gpsStatus, gpsSkipReason, userAgent;
  var gpsAccuracy, gpsAltitude, gpsTimestamp, suspiciousGps;
  var livenessStatus, livenessScore, livenessMethod;
  var requestId, clientTimestamp, idempotencyKey;
  var meshSynced, meshId, meshClientTime, meshFingerprint, auditLog;

  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    employeeId      = normalizeAttendanceEmployeeId(payload);
    name            = String(payload.name || payload.Name || employeeId || '').trim();
    lat             = payload.lat || '';
    lng             = payload.lng || '';
    locationName    = payload.locationName || '';
    gpsStatus       = payload.gpsStatus || 'ok';
    gpsSkipReason   = payload.gpsSkipReason || '';
    userAgent       = payload.userAgent || '';
    gpsAccuracy     = payload.gpsAccuracy;
    gpsAltitude     = payload.gpsAltitude;
    gpsTimestamp    = payload.gpsTimestamp;
    suspiciousGps   = payload.suspiciousGps;
    livenessStatus  = payload.livenessStatus || 'unknown';
    livenessScore   = payload.livenessScore;
    livenessMethod  = payload.livenessMethod || 'none';
    requestId       = String(payload.requestId || '').trim();
    clientTimestamp = payload.clientTimestamp || '';
    idempotencyKey  = String(payload.idempotencyKey || '').trim();
    meshSynced      = payload.meshSynced || false;
    meshId          = payload.meshId || '';
    meshClientTime  = payload.meshClientTime || '';
    meshFingerprint = payload.meshFingerprint || '';
    auditLog        = payload.auditLog || {};
  } else {
    employeeId = normalizeAttendanceEmployeeId(arguments[0] || '');
    name         = employeeId;
    lat          = arguments[1] || '';
    lng          = arguments[2] || '';
    locationName = arguments[6] || '';
    gpsStatus    = 'ok';
    livenessStatus = 'unknown';
    livenessMethod = 'none';
  }

  if (!employeeId) {
    logAction({
      username: '',
      role: DEFAULT_ROLE,
      action: actionType,
      endpoint: actionType,
      status: 'fail',
      details: { reason: 'missing_employee_id' }
    });
    return { status: 'error', message: 'Missing Employee_ID', code: 400 };
  }

  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const schema = [
    'Employee ID', 'Name', 'Time', 'Date', 'Latitude', 'Longitude', 'Google Map Link',
    'Location', 'GPS Status', 'GPS Skip Reason',
    'GPS Accuracy', 'GPS Altitude', 'GPS Timestamp', 'Suspicious GPS',
    'Liveness Status', 'Liveness Score', 'Liveness Method',
    'Request ID', 'Client Timestamp', 'Idempotency Key',
    'Mesh Synced', 'Mesh ID', 'Mesh Client Time', 'Mesh Fingerprint',
    'User Agent', 'Duplicate', 'Action Type', 'Verification', 'Audit Log'
  ];
  const result = ensureSheetWithHeaders(ss, 'Attendance', schema);
  const sheet  = result.sheet;
  const hm     = result.headerMap;

  const now = new Date();
  const dateKey = getAttendanceDateKey(now);
  const dedupeKey = idempotencyKey || buildAttendanceIdempotencyKey(employeeId, actionType, dateKey);

  var allData = sheet.getDataRange().getValues();
  var empCol = hm['Employee ID'] - 1;
  var dateCol = hm['Date'] - 1;
  var actionCol = hm['Action Type'] ? hm['Action Type'] - 1 : -1;
  var requestCol = hm['Request ID'] ? hm['Request ID'] - 1 : -1;
  var idempotencyCol = hm['Idempotency Key'] ? hm['Idempotency Key'] - 1 : -1;
  var isDuplicate = false;

  for (var i = 1; i < allData.length; i++) {
    var rowEmployeeId = String(allData[i][empCol] || '').trim();
    var rowDate = String(allData[i][dateCol] || '').replace(/^'/, '').trim();
    var rowType = actionCol >= 0 ? String(allData[i][actionCol] || 'logAttendance') : 'logAttendance';
    var rowRequestId = requestCol >= 0 ? String(allData[i][requestCol] || '').trim() : '';
    var rowIdempotency = idempotencyCol >= 0 ? String(allData[i][idempotencyCol] || '').trim() : '';
    if ((rowEmployeeId === employeeId && rowDate === dateKey && rowType === actionType) || (dedupeKey && (rowRequestId === dedupeKey || rowIdempotency === dedupeKey))) {
      isDuplicate = true;
      break;
    }
  }

  if (isDuplicate) {
    logAction({
      username: employeeId,
      role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
      action: actionType + '_duplicate',
      endpoint: actionType,
      status: 'fail',
      details: { reason: 'duplicate_or_replay', employeeId: employeeId, requestId: requestId, idempotencyKey: dedupeKey }
    });
    return { success: true, duplicate: true, message: '⚠️ พบว่า ' + employeeId + ' ลงเวลารายการนี้ไปแล้ว' };
  }

  const mapLink = (lat && lng) ? 'https://www.google.com/maps?q=' + lat + ',' + lng : '';
  const verificationStatus = (String(gpsStatus || '').toLowerCase() === 'ok' && String(suspiciousGps || '').toLowerCase() === 'true') ? '⚠️ GPS_SUSPICIOUS' : 'verified';

  const rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), schema.length))
       .setValues([new Array(Math.max(sheet.getLastColumn(), schema.length)).fill('')]);

  setRowByHeaders(sheet, rowNumber, hm, {
    'Employee ID':       employeeId,
    'Name':              name,
    'Time':              Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss'),
    'Date':              "'" + dateKey,
    'Latitude':          lat || '-',
    'Longitude':         lng || '-',
    'Google Map Link':    mapLink,
    'Location':          locationName,
    'GPS Status':        gpsStatus,
    'GPS Skip Reason':   gpsSkipReason,
    'GPS Accuracy':      gpsAccuracy === undefined ? '' : gpsAccuracy,
    'GPS Altitude':      gpsAltitude === undefined ? '' : gpsAltitude,
    'GPS Timestamp':     gpsTimestamp === undefined ? '' : gpsTimestamp,
    'Suspicious GPS':    suspiciousGps === undefined ? '' : suspiciousGps,
    'Liveness Status':   livenessStatus,
    'Liveness Score':    livenessScore === undefined ? '' : livenessScore,
    'Liveness Method':   livenessMethod,
    'Request ID':        requestId,
    'Client Timestamp':  clientTimestamp,
    'Idempotency Key':   dedupeKey,
    'Mesh Synced':       meshSynced ? 'YES' : '',
    'Mesh ID':           meshId,
    'Mesh Client Time':  meshClientTime,
    'Mesh Fingerprint':  meshFingerprint,
    'User Agent':        userAgent,
    'Duplicate':         '',
    'Action Type':       actionType,
    'Verification':      verificationStatus,
    'Audit Log':         JSON.stringify(auditLog || {})
  });

  logAction({
    username: employeeId,
    role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
    action: actionType,
    endpoint: actionType,
    status: 'success',
    details: {
      employeeId: employeeId,
      requestId: requestId,
      idempotencyKey: dedupeKey,
      duplicate: false,
      livenessStatus: livenessStatus,
      suspiciousGps: suspiciousGps
    }
  });

  return { success: true, message: 'บันทึกเวลาเสร็จสิ้น', employeeId: employeeId };
}

function getAttendanceLogs(params) {
  const auth = authorize('getAttendanceLogs', params);
  if (!auth.ok) {
    return { status: 'error', message: auth.error || 'Unauthorized', code: auth.code || 401 };
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Attendance');
  if (!sheet) return [];

  const data = sheet.getDataRange().getDisplayValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(function(h) { return String(h).trim(); });
  const filterDate = (params && params.date) ? params.date.trim() : '';
  const filterName = (params && params.name) ? params.name.trim().toLowerCase() : '';

  const rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    headers.forEach(function(h, idx) { row[h] = data[i][idx]; });

    if (filterDate) {
      var rowDate = String(row['Date'] || '').replace(/^'/, '').trim();
      if (rowDate !== filterDate) continue;
    }
    if (filterName) {
      var rowName = String(row['Name'] || '').toLowerCase();
      if (!rowName.includes(filterName)) continue;
    }
    rows.push(row);
  }
  return rows;
}