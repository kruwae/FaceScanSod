// ============================================================
//  GOOGLE APPS SCRIPT — REST API Backend
//  วิธีใช้: Deploy > New deployment > Web App
//           Execute as: Me | Who has access: Anyone
// ============================================================

// ============================================================
//  doGet — read-only actions
// ============================================================
function doGet(e) {
  const action = e.parameter.action;
  let result;

  if (action === 'login')                    result = login(e.parameter);
  else if (action === 'getConfig')           result = getConfig(e.parameter);
  else if (action === 'getKnownFaces')       result = getKnownFaces(e.parameter);
  else if (action === 'getLocations')        result = getLocations(e.parameter);
  else if (action === 'getAttendanceLogs')   result = getAttendanceLogs(e.parameter);
  else if (action === 'logout')              result = logout(e.parameter);
  else if (action === 'initSetup')           result = initSetup();
  else result = { status: 'error', message: 'Unknown action: ' + action };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function denyAction(action, params) {
  return authorize(action, params);
}

// ============================================================
//  doPost — write / verify actions
// ============================================================
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid JSON body' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = data.action;
  let result;

  if (action === 'registerUser')         result = registerUser(data.name, data.faceDescriptor, data.registeredBy, data.status);
  else if (action === 'logAttendance')   result = logAttendance(data);
  else if (action === 'saveConfig')      result = saveConfig(data.apiUrl, data.locations, data.workTimes, data.fallbackSettings, data.updatedBy);
  else if (action === 'login')           result = login(data);
  else if (action === 'verifyAdmin')     result = verifyAdmin(data.code);
  else if (action === 'changeAdminCode') result = changeAdminCode(data.currentCode, data.newCode);
  else result = { status: 'error', message: 'Unknown action: ' + action };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  Sheet Helpers
// ============================================================
function ensureSheetWithHeaders(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const lastColumn = sheet.getLastColumn();
  const existingHeaders = lastColumn > 0 ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0] : [];
  const hasAnyHeader = existingHeaders.some(h => h !== '' && h != null);

  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return { sheet, headerMap: buildHeaderMap(headers) };
  }

  const mergedHeaders = existingHeaders.slice();
  headers.forEach(header => {
    if (!mergedHeaders.includes(header)) mergedHeaders.push(header);
  });

  if (mergedHeaders.length !== existingHeaders.length) {
    sheet.getRange(1, 1, 1, mergedHeaders.length).setValues([mergedHeaders]);
  }

  return { sheet, headerMap: buildHeaderMap(mergedHeaders) };
}

function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    if (header) map[String(header).trim()] = index + 1;
  });
  return map;
}

function setRowByHeaders(sheet, rowNumber, headerMap, valuesByHeader) {
  Object.keys(valuesByHeader).forEach(header => {
    const col = headerMap[header];
    if (col) sheet.getRange(rowNumber, col).setValue(valuesByHeader[header]);
  });
}

function maskSensitiveValue(value) {
  var text = String(value || '');
  if (!text) return '';
  if (text.length <= 4) return '****';
  return text.substring(0, 2) + '****' + text.substring(text.length - 2);
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
      try { details = JSON.stringify(details || {}); } catch (e) { details = '{}'; }
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

function parseLocations(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value);
  } catch (e) {
    return [];
  }
}

function normalizeLocation(loc, index) {
  return {
    id: loc.id || ('loc-' + (index + 1)),
    name: loc.name || ('Location ' + (index + 1)),
    lat: parseFloat(loc.lat),
    lng: parseFloat(loc.lng),
    radius: parseFloat(loc.radius || 100)  // radius หน่วยเมตร
  };
}

// ============================================================
//  staffOS Sheet — Admin Credentials
//  สร้าง / ตรวจสอบ sheet พร้อม admin เริ่มต้นถ้ายังไม่มี
// ============================================================
var STAFFOS_SHEET   = 'staffOS';
var STAFFOS_HEADERS = ['Username', 'Code', 'Role', 'Status', 'Note', 'Created At', 'Updated At', 'Email', 'Hash Version', 'Hash Salt'];
var DEFAULT_ADMIN_CODE = '2569';
var ADMIN_PASSWORD_SALT = 'staffOS-v1';
var HASH_PREFIX = 'sha256:';
var HASH_VERSION_SHA256 = 'sha256';
var HASH_VERSION_BCRYPT = 'bcrypt';
var HASH_VERSION_LEGACY = 'legacy';
var DEFAULT_HASH_VERSION = HASH_VERSION_BCRYPT;
var DEFAULT_USER_SALT_LENGTH = 16;
var PASSWORD_ALGORITHM = 'sha256';
var GOOGLE_OAUTH_CLIENT_ID = '';
var GOOGLE_ID_TOKEN_AUDIENCE = '';

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
  if (!raw) return { version: HASH_VERSION_V1, salt: '', hash: '' };

  var version = HASH_VERSION_V1;
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
var LEGACY_MIGRATION_MODE = true;
var REQUIRE_AUTH_FOR_ALL_API = false;
var DEFAULT_ROLE = 'staff';
var ROLE_HIERARCHY = {
  'viewer': 1,
  'staff': 2,
  'admin': 3
};
var ENDPOINT_ROLE_RULES = {
  'getKnownFaces': ['staff', 'admin'],
  'logAttendance': ['staff', 'admin'],
  'getConfig': ['admin'],
  'saveConfig': ['admin'],
  'getAttendanceLogs': ['viewer', 'staff', 'admin'],
  'getLocations': ['staff', 'admin'],
  'registerUser': ['admin'],
  'verifyAdmin': ['admin'],
  'changeAdminCode': ['admin']
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
  if (!ROLE_HIERARCHY[value]) return DEFAULT_ROLE;
  return value;
}

function getUserRole(username) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users');
  if (!sheet) return DEFAULT_ROLE;

  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return DEFAULT_ROLE;

  var headers = data[0].map(function(h) { return String(h).trim(); });
  var headerMap = buildHeaderMap(headers);
  var usernameCol = headerMap['username'] || headerMap['Username'];
  var roleCol = headerMap['role'] || headerMap['Role'];

  if (!usernameCol || !roleCol) return DEFAULT_ROLE;

  var target = String(username || '').trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    var rowUsername = String(data[i][usernameCol - 1] || '').trim().toLowerCase();
    if (rowUsername === target) {
      var role = normalizeRole(data[i][roleCol - 1]);
      return role;
    }
  }
  return DEFAULT_ROLE;
}

function validateToken(token) {
  var value = String(token || '').trim();
  if (!value) return { ok: false, error: 'Unauthorized' };

  var cache = CacheService.getScriptCache();
  var raw = cache.get(TOKEN_CACHE_PREFIX + value);
  if (!raw) return { ok: false, error: 'Unauthorized' };

  var data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'Unauthorized' };
  }

  if (!data || !data.expiresAt || Date.now() > Number(data.expiresAt)) {
    cache.remove(TOKEN_CACHE_PREFIX + value);
    return { ok: false, error: 'Unauthorized' };
  }

  data.role = normalizeRole(data.role);
  return { ok: true, user: { username: data.username, role: data.role } };
}

function requireRole(allowedRoles, params) {
  var auth = validateToken(params && params.token);
  if (!auth.ok) return auth;

  var role = normalizeRole(auth.user && auth.user.role);
  var allowed = (allowedRoles || []).map(normalizeRole);

  if (!allowed.length) return { ok: true, user: auth.user };

  if (role === 'admin') return { ok: true, user: auth.user };

  for (var i = 0; i < allowed.length; i++) {
    if (allowed[i] === role) return { ok: true, user: auth.user };
  }

  return { ok: false, error: 'Forbidden', code: 403, user: auth.user };
}

function authorize(action, params) {
  if (LEGACY_MIGRATION_MODE) return { ok: true, migrated: true, user: { role: DEFAULT_ROLE } };
  return requireRole(ENDPOINT_ROLE_RULES[action] || [], params);
}

function logout(params) {
  var token = String((params && params.token) || '').trim();
  if (token) CacheService.getScriptCache().remove(TOKEN_CACHE_PREFIX + token);
  return { status: 'ok', message: 'Logged out' };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getAdminByEmail(email) {
  var target = normalizeEmail(email);
  if (!target) return null;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var role = String(row[hm['Role'] - 1] || '').toLowerCase();
    var status = String(row[hm['Status'] - 1] || '').toLowerCase();
    var rowEmail = normalizeEmail(row[hm['Email'] - 1] || '');
    if (role === 'admin' && status === 'active' && rowEmail === target) {
      return {
        rowNumber: i + 1,
        username: String(row[hm['Username'] - 1] || 'admin').trim(),
        email: rowEmail,
        role: 'admin'
      };
    }
  }
  return null;
}

function verifyAdminByEmail(email) {
  var admin = getAdminByEmail(email);
  if (!admin) {
    return { success: false, error: 'ไม่พบอีเมลแอดมินหรือบัญชีถูกระงับ' };
  }
  return { success: true, username: admin.username, email: admin.email, hashVersion: 'email' };
}

function verifyGoogleIdToken(idToken) {
  var token = String(idToken || '').trim();
  if (!token) return { success: false, error: 'Missing Google token' };

  try {
    var parts = token.split('.');
    if (parts.length !== 3) return { success: false, error: 'Invalid Google token format' };

    var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1])).getDataAsString());
    var email = normalizeEmail(payload.email || '');
    var aud = String(payload.aud || '');
    var iss = String(payload.iss || '').toLowerCase();

    if (!email) return { success: false, error: 'Missing email in token' };
    if (iss !== 'https://accounts.google.com' && iss !== 'accounts.google.com') {
      return { success: false, error: 'Invalid token issuer' };
    }

    var expectedAud = String(GOOGLE_ID_TOKEN_AUDIENCE || GOOGLE_OAUTH_CLIENT_ID || '').trim();
    if (expectedAud && aud !== expectedAud) {
      return { success: false, error: 'Invalid token audience' };
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
  var admin = getAdminByEmail(email);
  if (!admin) return null;
  return admin;
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
        details: { reason: 'invalid_google_token', error: googleResult.error }
      });
      return { status: 'error', message: googleResult.error || 'Unauthorized' };
    }

    var googleAdmin = getGoogleAdminByEmail(googleResult.email);
    if (!googleAdmin) {
      logAction({
        username: maskSensitiveValue(googleResult.email),
        role: DEFAULT_ROLE,
        action: 'login',
        endpoint: 'login',
        status: 'fail',
        details: { reason: 'google_email_not_whitelisted', email: maskSensitiveValue(googleResult.email) }
      });
      return { status: 'error', message: 'อีเมลนี้ไม่ได้รับอนุญาตให้เข้าใช้งาน' };
    }

    username = googleAdmin.username || username;
    role = 'admin';
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
    role = 'admin';
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

  role = getUserRole(username);
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

/**
 * initSetup — เรียก 1 ครั้งหลัง deploy เพื่อสร้าง staffOS sheet
 * URL: ?action=initSetup
 */
function initSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var sheet = result.sheet;
  var hm    = result.headerMap;

  // ตรวจว่ามี admin แล้วหรือยัง
  var data = sheet.getDataRange().getValues();
  var hasAdmin = false;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][hm['Role'] - 1] || '').toLowerCase() === 'admin') {
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
      'Role'        : 'admin',
      'Status'      : 'active',
      'Note'        : 'Default admin — เปลี่ยนรหัสหลัง deploy',
      'Created At'  : now,
      'Updated At'  : now,
      'Email'       : '',
      'Hash Version': adminRecord.version,
      'Hash Salt'   : adminRecord.salt
    });
    return { success: true, created: true, message: 'สร้าง staffOS sheet และ admin เริ่มต้นเรียบร้อย (รหัสเริ่มต้นถูกเก็บแบบเข้ารหัสแล้ว)' };
  }

  return { success: true, created: false, message: 'staffOS sheet พร้อมใช้งาน แอดมินมีอยู่แล้ว' };
}

/**
 * verifyAdmin — ตรวจสอบรหัสฝั่ง server (ไม่ส่งรหัสกลับมาที่ client)
 * ส่ง: { action: 'verifyAdmin', code: '...' }
 * รับ: { success: true } หรือ { success: false, error: '...' }
 */
function verifyAdmin(code) {
  var input = normalizePasswordInput(code);
  if (!input) {
    return { success: false, error: 'กรุณากรอกรหัส' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var role = String(row[hm['Role'] - 1] || '').toLowerCase();
    var status = String(row[hm['Status'] - 1] || '').toLowerCase();
    var stored = String(row[hm['Code'] - 1] || '');
    var version = String(row[hm['Hash Version'] - 1] || '').trim().toLowerCase();
    var salt = String(row[hm['Hash Salt'] - 1] || '').trim();
    var parsed = parsePasswordRecord(stored);

    if (role !== 'admin' || status !== 'active') continue;

    if (version === HASH_VERSION_V2 || parsed.version === HASH_VERSION_V2) {
      var v2Salt = salt || parsed.salt || createUserSalt(row[hm['Username'] - 1] || 'admin');
      var v2Record = buildPasswordRecord(input, v2Salt, HASH_VERSION_V2);

      if (safeStringEquals(normalizeHash(stored), normalizeHash(v2Record.hash))) {
        if (!version || version !== HASH_VERSION_V2 || !salt || !parsed.salt) {
          sheet.getRange(i + 1, hm['Code']).setValue(v2Record.hash);
          if (hm['Hash Version']) sheet.getRange(i + 1, hm['Hash Version']).setValue(HASH_VERSION_V2);
          if (hm['Hash Salt']) sheet.getRange(i + 1, hm['Hash Salt']).setValue(v2Salt);
          sheet.getRange(i + 1, hm['Updated At']).setValue(new Date());
          return { success: true, migrated: true, hashVersion: HASH_VERSION_V2 };
        }
        return { success: true, hashVersion: HASH_VERSION_V2 };
      }
    }

    if (version === HASH_VERSION_V1 || parsed.version === HASH_VERSION_V1 || !version) {
      var v1Record = buildPasswordRecord(input, '', HASH_VERSION_V1);
      if (safeStringEquals(normalizeHash(stored), normalizeHash(v1Record.hash)) || safeStringEquals(stored, input)) {
        return { success: true, hashVersion: HASH_VERSION_V1 };
      }
    }

    if (stored === input) {
      return { success: true, hashVersion: HASH_VERSION_V1 };
    }
  }

  return { success: false, error: 'รหัสแอดมินไม่ถูกต้องหรือบัญชีถูกระงับ' };
}

/**
 * changeAdminCode — เปลี่ยนรหัสแอดมิน
 * ส่ง: { action: 'changeAdminCode', currentCode: '...', newCode: '...' }
 */
function changeAdminCode(currentCode, newCode) {
  if (!currentCode || !newCode) return { success: false, error: 'ข้อมูลไม่ครบ' };
  if (String(newCode).trim().length < 4) return { success: false, error: 'รหัสใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' };

  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var result  = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var sheet   = result.sheet;
  var hm      = result.headerMap;
  var data    = sheet.getDataRange().getValues();
  var current = normalizePasswordInput(currentCode);

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var role   = String(row[hm['Role']   - 1] || '').toLowerCase();
    var status = String(row[hm['Status'] - 1] || '').toLowerCase();
    var stored = String(row[hm['Code']   - 1] || '');
    var version = String(row[hm['Hash Version'] - 1] || '').trim().toLowerCase();
    var salt = String(row[hm['Hash Salt'] - 1] || '').trim();
    var parsed = parsePasswordRecord(stored);

    if (role !== 'admin' || status !== 'active') continue;

    var matched = false;
    if (version === HASH_VERSION_V2 || parsed.version === HASH_VERSION_V2) {
      var currentV2Salt = salt || parsed.salt || createUserSalt(row[hm['Username'] - 1] || 'admin');
      matched = safeStringEquals(normalizeHash(buildPasswordRecord(current, currentV2Salt, HASH_VERSION_V2).hash), normalizeHash(stored));
    } else {
      matched = safeStringEquals(normalizeHash(buildPasswordRecord(current, '', HASH_VERSION_V1).hash), normalizeHash(stored)) || safeStringEquals(stored, current);
    }

    if (matched) {
      var updatedSalt = createUserSalt((row[hm['Username'] - 1] || 'admin') + '|' + newCode);
      var newRecord = buildPasswordRecord(newCode, updatedSalt, HASH_VERSION_V2);
      sheet.getRange(i + 1, hm['Code']).setValue(newRecord.hash);
      if (hm['Hash Version']) sheet.getRange(i + 1, hm['Hash Version']).setValue(HASH_VERSION_V2);
      if (hm['Hash Salt']) sheet.getRange(i + 1, hm['Hash Salt']).setValue(newRecord.salt);
      if (hm['Email']) sheet.getRange(i + 1, hm['Email']).setValue(String(row[hm['Email'] - 1] || '').trim());
      sheet.getRange(i + 1, hm['Updated At']).setValue(new Date());
      return { success: true, message: 'เปลี่ยนรหัสแอดมินเรียบร้อย', hashVersion: HASH_VERSION_V2 };
    }
  }
  return { success: false, error: 'รหัสปัจจุบันไม่ถูกต้อง' };
}

// ============================================================
//  Users
// ============================================================
function registerUser(name, faceDescriptor, registeredBy, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schema = ['Name', 'Face Descriptor', 'Registered At', 'Registered By', 'Status'];
  const result = ensureSheetWithHeaders(ss, 'Users', schema);
  const sheet = result.sheet;

  const rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), schema.length)).setValues([new Array(Math.max(sheet.getLastColumn(), schema.length)).fill('')]);

  setRowByHeaders(sheet, rowNumber, result.headerMap, {
    'Name': name,
    'Face Descriptor': JSON.stringify(faceDescriptor),
    'Registered At': new Date(),
    'Registered By': registeredBy || '',
    'Status': status || 'active'
  });

  return { success: true, message: 'บันทึกข้อมูลใบหน้าเรียบร้อย' };
}

function getKnownFaces(params) {
  const auth = authorize('getKnownFaces', params);
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

  const token = String((params && params.token) || '').trim();
  const config = getConfig(params);
  const requiredToken = String(config.readToken || '').trim();
  if (!requiredToken || !token || token !== requiredToken) {
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

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetInfo = ensureSheetWithHeaders(ss, 'Users', ['Employee ID', 'Face Descriptor', 'Status']);
  const sheet = sheetInfo.sheet;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headerMap = sheetInfo.headerMap;
  const employeeIdCol = headerMap['Employee ID'] || 1;
  const descriptorCol = headerMap['Face Descriptor'] || 2;
  const statusCol = headerMap['Status'];

  const users = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const employeeId = row[employeeIdCol - 1];
    const jsonStr = row[descriptorCol - 1];
    const status = statusCol ? String(row[statusCol - 1] || '').toLowerCase() : 'active';

    if (employeeId && jsonStr && status !== 'inactive') {
      try {
        users.push({ employeeId: String(employeeId), descriptor: JSON.parse(jsonStr) });
      } catch (e) {}
    }
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
//  Locations (read)
// ============================================================
function getLocations(params) {
  const auth = authorize('getLocations', params);
  if (!auth.ok) {
    return { status: 'error', message: auth.error || 'Unauthorized', code: auth.code || 401 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const locations = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const enabled = String(row[5] || 'true').toLowerCase();
    if (enabled === 'false' || enabled === '0') continue;

    locations.push({
      id: row[0] || ('loc-' + i),
      name: row[1] || ('Location ' + i),
      lat: parseFloat(row[2]),
      lng: parseFloat(row[3]),
      radius: parseFloat(row[4] || 100),
      enabled: true
    });
  }
  return locations;
}

// ============================================================
//  Attendance Log
// ============================================================

/**
 * logAttendance — บันทึกเวลาเข้าออกงาน
 * payload: { name, lat, lng, locationName, gpsStatus, gpsSkipReason, userAgent,
 *            meshSynced, meshId, meshClientTime, meshFingerprint }
 * เพิ่ม duplicate check: ถ้ายังไม่ลงวันนี้ → append | ถ้าลงแล้ว → flag duplicate
 */
function logAttendance(payload) {
  var auth = authorize('logAttendance', payload);
  if (!auth.ok) {
    logAction({
      username: '',
      role: DEFAULT_ROLE,
      action: 'logAttendance',
      endpoint: 'logAttendance',
      status: 'fail',
      details: { reason: auth.error || 'Unauthorized' }
    });
    return { status: 'error', message: auth.error || 'Unauthorized', code: auth.code || 401 };
  }
  // รองรับ old-style call (positional args) และ new-style (payload object)
  var name, lat, lng, locationName, gpsStatus, gpsSkipReason, userAgent;
  var meshSynced, meshId, meshClientTime, meshFingerprint;

  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    name            = payload.name         || '';
    lat             = payload.lat          || '';
    lng             = payload.lng          || '';
    locationName    = payload.locationName || '';
    gpsStatus       = payload.gpsStatus    || 'ok';
    gpsSkipReason   = payload.gpsSkipReason || '';
    userAgent       = payload.userAgent    || '';
    meshSynced      = payload.meshSynced   || false;
    meshId          = payload.meshId       || '';
    meshClientTime  = payload.meshClientTime || '';
    meshFingerprint = payload.meshFingerprint || '';
  } else {
    // legacy positional: (name, lat, lng, matchScore, distance, device, locationName)
    name         = arguments[0] || '';
    lat          = arguments[1] || '';
    lng          = arguments[2] || '';
    locationName = arguments[6] || '';
    gpsStatus    = 'ok';
  }

  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const schema = [
    'Name', 'Time', 'Date', 'Latitude', 'Longitude', 'Google Map Link',
    'Location', 'GPS Status', 'GPS Skip Reason',
    'Mesh Synced', 'Mesh ID', 'Mesh Client Time', 'Mesh Fingerprint',
    'User Agent', 'Duplicate'
  ];
  const result = ensureSheetWithHeaders(ss, 'Attendance', schema);
  const sheet  = result.sheet;
  const hm     = result.headerMap;

  const now     = new Date();
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'd/M/yyyy');
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');
  const mapLink = (lat && lng) ? 'https://www.google.com/maps?q=' + lat + ',' + lng : '';

  // ===== Duplicate Check =====
  // ตรวจว่ามีชื่อ+วันที่เดียวกันในวันนี้แล้วหรือยัง
  var isDuplicate = false;
  var allData = sheet.getDataRange().getValues();
  var nameCol = hm['Name'] - 1;
  var dateCol = hm['Date'] - 1;
  for (var i = 1; i < allData.length; i++) {
    var rowName = String(allData[i][nameCol] || '').trim();
    var rowDate = String(allData[i][dateCol] || '').replace(/^'/, '').trim();
    if (rowName === String(name).trim() && rowDate === dateStr) {
      isDuplicate = true;
      break;
    }
  }

  const rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), schema.length))
       .setValues([new Array(Math.max(sheet.getLastColumn(), schema.length)).fill('')]);

  setRowByHeaders(sheet, rowNumber, hm, {
    'Name':              name,
    'Time':              timeStr,
    'Date':              "'" + dateStr,
    'Latitude':          lat || '-',
    'Longitude':         lng || '-',
    'Google Map Link':   mapLink,
    'Location':          locationName,
    'GPS Status':        gpsStatus,
    'GPS Skip Reason':   gpsSkipReason,
    'Mesh Synced':       meshSynced ? 'YES' : '',
    'Mesh ID':           meshId,
    'Mesh Client Time':  meshClientTime,
    'Mesh Fingerprint':  meshFingerprint,
    'User Agent':        userAgent,
    'Duplicate':         isDuplicate ? 'DUPLICATE' : ''
  });

  if (isDuplicate) {
    logAction({
      username: auth.user && auth.user.username ? auth.user.username : String(name || ''),
      role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
      action: 'logAttendance',
      endpoint: 'logAttendance',
      status: 'success',
      details: { duplicate: true, name: String(name || ''), locationName: String(locationName || '') }
    });
    return {
      success: true,
      duplicate: true,
      message: '⚠️ พบว่า ' + name + ' ลงชื่อเข้างานไปแล้วในวันนี้ (บันทึกเพิ่ม Flag: DUPLICATE)'
    };
  }

  logAction({
    username: auth.user && auth.user.username ? auth.user.username : String(name || ''),
    role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
    action: 'logAttendance',
    endpoint: 'logAttendance',
    status: 'success',
    details: { duplicate: false, name: String(name || ''), locationName: String(locationName || '') }
  });

  return { success: true, message: 'บันทึกเวลาเสร็จสิ้น' };
}

/**
 * getAttendanceLogs — สำหรับ report.html
 * params: { date, name } (optional filters)
 */
function getAttendanceLogs(params) {
  const auth = authorize('getAttendanceLogs', params);
  if (!auth.ok) {
    return { status: 'error', message: auth.error || 'Unauthorized', code: auth.code || 401 };
  }

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Attendance');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0].map(function(h) { return String(h).trim(); });
  const filterDate = (params && params.date) ? params.date.trim() : '';
  const filterName = (params && params.name) ? params.name.trim().toLowerCase() : '';

  const rows = [];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    headers.forEach(function(h, idx) { row[h] = data[i][idx]; });

    // filter by date
    if (filterDate) {
      var rowDate = String(row['Date'] || '').replace(/^'/, '').trim();
      if (rowDate !== filterDate) continue;
    }
    // filter by name
    if (filterName) {
      var rowName = String(row['Name'] || '').toLowerCase();
      if (!rowName.includes(filterName)) continue;
    }
    rows.push(row);
  }
  return rows;
}

// ============================================================
//  Config — Save / Load
// ============================================================
function saveConfig(apiUrl, locations, workTimes, fallbackSettings, updatedBy) {
  const auth = authorize('saveConfig', { token: (arguments[5] && arguments[5].token) || '' });
  if (!auth.ok) {
    logAction({
      username: '',
      role: DEFAULT_ROLE,
      action: 'updateConfig',
      endpoint: 'saveConfig',
      status: 'fail',
      details: { reason: auth.error || 'Unauthorized' }
    });
    return { status: 'error', message: auth.error || 'Unauthorized', code: auth.code || 401 };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');
  const schema = ['Id', 'Name', 'Latitude', 'Longitude', 'Radius', 'Enabled', 'Updated By', 'Updated At', 'Read Token'];

  if (!sheet) sheet = ss.insertSheet('Config');

  sheet.clearContents();
  sheet.getRange(1, 1, 1, schema.length).setValues([schema]);

  const now = new Date();
  const parsedLocations = parseLocations(locations).map(normalizeLocation);
  parsedLocations.forEach(function(loc, index) {
    sheet.getRange(index + 2, 1, 1, schema.length).setValues([[
      loc.id, loc.name, loc.lat, loc.lng, loc.radius, true,
      updatedBy || 'admin', now, ''
    ]]);
  });

  const props = PropertiesService.getScriptProperties();
  props.setProperty('API_URL',            apiUrl || '');
  props.setProperty('CONFIG_UPDATED_BY',  updatedBy || '');
  props.setProperty('CONFIG_UPDATED_AT',  now.toISOString());
  props.setProperty('WORK_TIMES',         JSON.stringify(workTimes || {}));
  props.setProperty('FALLBACK_SETTINGS',  JSON.stringify(fallbackSettings || {}));

  logAction({
    username: auth.user && auth.user.username ? auth.user.username : '',
    role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
    action: 'updateConfig',
    endpoint: 'saveConfig',
    status: 'success',
    details: { locationsCount: (parseLocations(locations) || []).length }
  });

  return { success: true, message: 'บันทึกการตั้งค่าลง Google Sheets เรียบร้อย' };
}

function getConfig(params) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  let locations = [];
  let readToken = '';

  if (sheet) {
    const values = sheet.getDataRange().getValues();
    const headers = values.length > 0 ? values[0].map(function(h) { return String(h).trim(); }) : [];
    const headerMap = buildHeaderMap(headers);
    const tokenCol = headerMap['Read Token'];

    if (tokenCol) {
      readToken = String(sheet.getRange(2, tokenCol).getValue() || '').trim();
    }

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[0] && !row[1]) continue;
      locations.push({
        id: row[0] || ('loc-' + i),
        name: row[1] || ('Location ' + i),
        lat: parseFloat(row[2]) || 0,
        lng: parseFloat(row[3]) || 0,
        radius: parseFloat(row[4]) || 100,
        enabled: row[5] !== false
      });
    }
  }

  let workTimes = {};
  let fallbackSettings = {};

  try {
    workTimes = JSON.parse(PropertiesService.getScriptProperties().getProperty('WORK_TIMES') || '{}');
  } catch (e) {
    workTimes = {};
  }

  try {
    fallbackSettings = JSON.parse(PropertiesService.getScriptProperties().getProperty('FALLBACK_SETTINGS') || '{}');
  } catch (e) {
    fallbackSettings = {};
  }

  return {
    status: 'ok',
    apiUrl: PropertiesService.getScriptProperties().getProperty('API_URL') || '',
    readToken: readToken,
    locations: locations,
    workTimes: workTimes,
    fallbackSettings: {
      enabled: fallbackSettings.enabled === true,
      contactText: fallbackSettings.contactText || 'กรุณาติดต่อผู้ดูแลระบบเพื่อขอเปิดใช้งานแผนสำรอง'
    }
  };
}
