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

  if (action === 'getConfig') {
    result = getConfig();
  } else if (action === 'getKnownFaces') {
    result = getKnownFaces();
  } else if (action === 'getLocations') {
    result = getLocations();
  } else if (action === 'initSetup') {
    result = initSetup();
  } else {
    result = { error: 'Unknown action: ' + action };
  }

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

  if (action === 'registerUser') {
    result = registerUser(data.name, data.faceDescriptor, data.registeredBy, data.status);
  } else if (action === 'logAttendance') {
    result = logAttendance(data.name, data.lat, data.lng, data.matchScore, data.distance, data.device, data.locationName);
  } else if (action === 'saveConfig') {
    result = saveConfig(data.apiUrl, data.locations, data.workTimes, data.fallbackSettings, data.updatedBy);
  } else if (action === 'verifyAdmin') {
    result = verifyAdmin(data.code);
  } else if (action === 'changeAdminCode') {
    result = changeAdminCode(data.currentCode, data.newCode);
  } else {
    result = { error: 'Unknown action: ' + action };
  }

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
      'Code'       : DEFAULT_ADMIN_CODE,
      'Role'       : 'admin',
      'Status'     : 'active',
      'Note'       : 'Default admin — เปลี่ยนรหัสหลัง deploy',
      'Created At' : now,
      'Updated At' : now
    });
    return { success: true, created: true, message: 'สร้าง staffOS sheet และ admin เริ่มต้นเรียบร้อย (รหัส: ' + DEFAULT_ADMIN_CODE + ')' };
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

  // ถ้ายังไม่มี sheet → สร้างและตรวจกับ default code
  if (!sheet) {
    initSetup();
    sheet = ss.getSheetByName(STAFFOS_SHEET);
  }

  var result = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var hm     = result.headerMap;
  var data   = result.sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var role   = String(row[hm['Role']   - 1] || '').toLowerCase();
    var status = String(row[hm['Status'] - 1] || '').toLowerCase();
    var stored = String(row[hm['Code']   - 1] || '');

    if (role === 'admin' && status === 'active' && stored === String(code).trim()) {
      return { success: true };
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

  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
  var sheet  = result.sheet;
  var hm     = result.headerMap;
  var data   = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var role   = String(row[hm['Role']   - 1] || '').toLowerCase();
    var status = String(row[hm['Status'] - 1] || '').toLowerCase();
    var stored = String(row[hm['Code']   - 1] || '');

    if (role === 'admin' && status === 'active' && stored === String(currentCode).trim()) {
      sheet.getRange(i + 1, hm['Code']).setValue(String(newCode).trim());
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
function logAttendance(name, lat, lng, matchScore, distance, device, locationName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schema = ['Name', 'Time', 'Date', 'Latitude', 'Longitude', 'Google Map Link', 'Match Score', 'Distance', 'Device', 'Location'];
  const result = ensureSheetWithHeaders(ss, 'Attendance', schema);
  const sheet = result.sheet;

  const now = new Date();
  const mapLink = (lat && lng) ? `https://www.google.com/maps?q=${lat},${lng}` : '';
  const dateStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'd/M/yyyy');
  const timeStr = Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm:ss');

  const rowNumber = sheet.getLastRow() + 1;
  sheet.getRange(rowNumber, 1, 1, Math.max(sheet.getLastColumn(), schema.length)).setValues([new Array(Math.max(sheet.getLastColumn(), schema.length)).fill('')]);

  setRowByHeaders(sheet, rowNumber, result.headerMap, {
    'Name': name,
    'Time': timeStr,
    'Date': "'" + dateStr,
    'Latitude': lat || '-',
    'Longitude': lng || '-',
    'Google Map Link': mapLink,
    'Match Score': matchScore != null ? matchScore : '',
    'Distance': distance != null ? distance : '',
    'Device': device || '',
    'Location': locationName || ''
  });

  return { success: true, message: 'บันทึกเวลาเสร็จสิ้น' };
}

// ============================================================
//  Config — Save / Load
// ============================================================
function saveConfig(apiUrl, locations, workTimes, fallbackSettings, updatedBy) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');
  const schema = ['Id', 'Name', 'Latitude', 'Longitude', 'Radius', 'Enabled'];

  if (!sheet) {
    sheet = ss.insertSheet('Config');
  }

  sheet.clearContents();
  sheet.getRange(1, 1, 1, schema.length).setValues([schema]);

  const parsedLocations = parseLocations(locations).map(normalizeLocation);
  parsedLocations.forEach((loc, index) => {
    sheet.getRange(index + 2, 1, 1, schema.length).setValues([[
      loc.id,
      loc.name,
      loc.lat,
      loc.lng,
      loc.radius,
      true
    ]]);
  });

  PropertiesService.getScriptProperties().setProperty('API_URL', apiUrl || '');
  PropertiesService.getScriptProperties().setProperty('CONFIG_UPDATED_BY', updatedBy || '');
  PropertiesService.getScriptProperties().setProperty('WORK_TIMES', JSON.stringify(workTimes || {}));
  PropertiesService.getScriptProperties().setProperty('FALLBACK_SETTINGS', JSON.stringify(fallbackSettings || {}));

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
