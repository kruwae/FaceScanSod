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

    // Pad to multiple-of-4 — base64DecodeWebSafe requires padding in some GAS runtime versions
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
  var admin = getAdminByEmail(email);
  if (!admin) return null;
  return admin;
}

function getGoogleAdminEmails() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();
  var emails = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var role = String(row[hm['Role'] - 1] || '').toLowerCase();
    var status = String(row[hm['Status'] - 1] || '').toLowerCase();
    var email = normalizeEmail(row[hm['Email'] - 1] || '');
    if (role === 'admin' && status === 'active' && email) emails.push(email);
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

    // DEBUG: log whitelist check — remove after confirming Chrome email matches sheet
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
          hint: 'Ensure this email is in the staffOS sheet with role=admin and status=active'
        }
      };
    }

    if (googleAdmin) {
      username = googleAdmin.username || username;
    }
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

  role = 'admin';
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

  const data = sheet.getDataRange().getDisplayValues(); // ใช้ getDisplayValues() เพื่อเอาข้อความแบบเดียวกับที่เห็นบนชีต (ป้องกันปัญหาเวลาได้ค่าเป็น 1899:xx)
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
