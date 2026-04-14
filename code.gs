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

  if      (action === 'getConfig')          result = getConfig();
  else if (action === 'getKnownFaces')      result = getKnownFaces();
  else if (action === 'getLocations')       result = getLocations();
  else if (action === 'getAttendanceLogs')  result = getAttendanceLogs(e.parameter);
  else if (action === 'initSetup')          result = initSetup();
  else result = { error: 'Unknown action: ' + action };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
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
      .createTextOutput(JSON.stringify({ error: 'Invalid JSON body' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = data.action;
  let result;

  if      (action === 'registerUser')   result = registerUser(data.name, data.faceDescriptor, data.registeredBy, data.status);
  else if (action === 'logAttendance')  result = logAttendance(data);
  else if (action === 'saveConfig')     result = saveConfig(data.apiUrl, data.locations, data.workTimes, data.fallbackSettings, data.updatedBy);
  else if (action === 'verifyAdmin')    result = verifyAdmin(data.code);
  else if (action === 'changeAdminCode') result = changeAdminCode(data.currentCode, data.newCode);
  else result = { error: 'Unknown action: ' + action };

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
var STAFFOS_HEADERS = ['Username', 'Code', 'Role', 'Status', 'Note', 'Created At', 'Updated At'];
var DEFAULT_ADMIN_CODE = '2569';
var ADMIN_PASSWORD_SALT = 'staffOS-v1';
var HASH_PREFIX = 'sha256:';

function hashPassword(password) {
  var input = String(password || '').trim();
  var combined = ADMIN_PASSWORD_SALT ? (ADMIN_PASSWORD_SALT + '|' + input) : input;
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined, Utilities.Charset.UTF_8);
  return HASH_PREFIX + bytesToHex(bytes);
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

function isHashedPassword(value) {
  return typeof value === 'string' && value.indexOf(HASH_PREFIX) === 0 && value.length > HASH_PREFIX.length + 32;
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
    setRowByHeaders(sheet, row, hm, {
      'Username'   : 'admin',
      'Code'       : hashPassword(DEFAULT_ADMIN_CODE),
      'Role'       : 'admin',
      'Status'     : 'active',
      'Note'       : 'Default admin — เปลี่ยนรหัสหลัง deploy',
      'Created At' : now,
      'Updated At' : now
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
  if (!code) return { success: false, error: 'กรุณากรอกรหัส' };

  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(STAFFOS_SHEET);

  if (!sheet) {
    initSetup();
    sheet = ss.getSheetByName(STAFFOS_SHEET);
  }

  var result = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var hm     = result.headerMap;
  var data   = result.sheet.getDataRange().getValues();
  var input  = String(code).trim();

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var role   = String(row[hm['Role']   - 1] || '').toLowerCase();
    var status = String(row[hm['Status'] - 1] || '').toLowerCase();
    var stored = String(row[hm['Code']   - 1] || '');

    if (role !== 'admin' || status !== 'active') continue;

    if (isHashedPassword(stored)) {
      if (safeStringEquals(stored, hashPassword(input))) {
        return { success: true, migrated: true };
      }
    } else {
      if (safeStringEquals(stored, input)) {
        migrateAdminPasswordIfNeeded(result.sheet, i + 1, hm, input);
        return { success: true, migrated: true };
      }
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
  var current = String(currentCode).trim();
  var nextHash = hashPassword(newCode);

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var role   = String(row[hm['Role']   - 1] || '').toLowerCase();
    var status = String(row[hm['Status'] - 1] || '').toLowerCase();
    var stored = String(row[hm['Code']   - 1] || '');

    if (role !== 'admin' || status !== 'active') continue;

    var matched = false;
    if (isHashedPassword(stored)) {
      matched = safeStringEquals(hashPassword(current), stored);
    } else {
      matched = safeStringEquals(stored, current);
    }

    if (matched) {
      sheet.getRange(i + 1, hm['Code']).setValue(nextHash);
      sheet.getRange(i + 1, hm['Updated At']).setValue(new Date());
      return { success: true, message: 'เปลี่ยนรหัสแอดมินเรียบร้อย' };
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

function getKnownFaces() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetInfo = ensureSheetWithHeaders(ss, 'Users', ['Name', 'Face Descriptor', 'Registered At', 'Registered By', 'Status']);
  const sheet = sheetInfo.sheet;

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headerMap = sheetInfo.headerMap;
  const nameCol = headerMap['Name'] || 1;
  const descriptorCol = headerMap['Face Descriptor'] || 2;
  const statusCol = headerMap['Status'];

  const users = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const name = row[nameCol - 1];
    const jsonStr = row[descriptorCol - 1];
    const status = statusCol ? String(row[statusCol - 1] || '').toLowerCase() : 'active';

    if (name && jsonStr && status !== 'inactive') {
      try {
        users.push({ label: name, descriptor: JSON.parse(jsonStr) });
      } catch (e) {}
    }
  }
  return users;
}

// ============================================================
//  Locations (read)
// ============================================================
function getLocations() {
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
      radius: parseFloat(row[4] || 100),   // หน่วยเมตร
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
    return {
      success: true,
      duplicate: true,
      message: '⚠️ พบว่า ' + name + ' ลงชื่อเข้างานไปแล้วในวันนี้ (บันทึกเพิ่ม Flag: DUPLICATE)'
    };
  }
  return { success: true, message: 'บันทึกเวลาเสร็จสิ้น' };
}

/**
 * getAttendanceLogs — สำหรับ report.html
 * params: { date, name } (optional filters)
 */
function getAttendanceLogs(params) {
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
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');
  // ADD: audit trail columns
  const schema = ['Id', 'Name', 'Latitude', 'Longitude', 'Radius', 'Enabled', 'Updated By', 'Updated At'];

  if (!sheet) sheet = ss.insertSheet('Config');

  sheet.clearContents();
  sheet.getRange(1, 1, 1, schema.length).setValues([schema]);

  const now = new Date();
  const parsedLocations = parseLocations(locations).map(normalizeLocation);
  parsedLocations.forEach(function(loc, index) {
    sheet.getRange(index + 2, 1, 1, schema.length).setValues([[
      loc.id, loc.name, loc.lat, loc.lng, loc.radius, true,
      updatedBy || 'admin', now          // audit trail
    ]]);
  });

  const props = PropertiesService.getScriptProperties();
  props.setProperty('API_URL',            apiUrl || '');
  props.setProperty('CONFIG_UPDATED_BY',  updatedBy || '');
  props.setProperty('CONFIG_UPDATED_AT',  now.toISOString());
  props.setProperty('WORK_TIMES',         JSON.stringify(workTimes || {}));
  props.setProperty('FALLBACK_SETTINGS',  JSON.stringify(fallbackSettings || {}));

  return { success: true, message: 'บันทึกการตั้งค่าลง Google Sheets เรียบร้อย' };
}

function getConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  let locations = [];

  if (sheet) {
    const values = sheet.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[0] && !row[1]) continue;
      locations.push({
        id: row[0] || ('loc-' + i),
        name: row[1] || ('Location ' + i),
        lat: parseFloat(row[2]) || 0,
        lng: parseFloat(row[3]) || 0,
        radius: parseFloat(row[4]) || 100,  // หน่วยเมตร
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
    apiUrl: PropertiesService.getScriptProperties().getProperty('API_URL') || '',
    locations: locations,
    workTimes: workTimes,
    fallbackSettings: {
      enabled: fallbackSettings.enabled === true,
      contactText: fallbackSettings.contactText || 'กรุณาติดต่อผู้ดูแลระบบเพื่อขอเปิดใช้งานแผนสำรอง'
    }
  };
}
