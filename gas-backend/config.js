// ============================================================
//  Helper Functions
// ============================================================

function ensureSheetWithHeaders(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);

  const schema = headers.slice();
  const existingHeaders = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), schema.length)).getValues()[0]
    : [];
  const existingMap = buildHeaderMap(existingHeaders.map(function(h) { return String(h || '').trim(); }));

  let changed = false;
  for (let i = 0; i < schema.length; i++) {
    if (!existingMap[schema[i]]) {
      existingHeaders[i] = schema[i];
      changed = true;
    }
  }

  if (!existingHeaders.length) {
    changed = true;
  }

  const finalHeaders = existingHeaders.length ? existingHeaders : schema.slice();
  if (changed) {
    sheet.getRange(1, 1, 1, finalHeaders.length).setValues([finalHeaders]);
  }

  return { sheet, headerMap: buildHeaderMap(finalHeaders.map(function(h) { return String(h || '').trim(); })) };
}

function buildHeaderMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    const key = String(header || '').trim();
    if (!key) return;
    map[key] = index + 1;
    map[key.toLowerCase()] = index + 1;
  });
  return map;
}

function setRowByHeaders(sheet, rowNumber, headerMap, valuesByHeader) {
  Object.keys(valuesByHeader).forEach(header => {
    const col = headerMap[header] || headerMap[String(header).toLowerCase()];
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
    radius: parseFloat(loc.radius || 100)
  };
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
//  Config — Save / Load
// ============================================================

function saveConfig(apiUrl, locations, workTimes, fallbackSettings, updatedBy, token, scanMode) {
  const auth = authorize('saveConfig', { token: token || '' });
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

  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange(1, 1, 1, schema.length).setValues([schema]);
  }

  // Preserve existing Read Token from row 2, column 9
  let existingReadToken = '';
  if (sheet.getLastRow() >= 2) {
    existingReadToken = String(sheet.getRange(2, 9).getValue() || '').trim();
  }

  // Clear data but keep headers if possible, or just clear and re-write
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, schema.length).clearContent();
  }
  sheet.getRange(1, 1, 1, schema.length).setValues([schema]); // Ensure headers are correct

  const now = new Date();
  const rawLocs = parseLocations(locations);
  const parsedLocations = (Array.isArray(rawLocs) ? rawLocs : []).map(normalizeLocation);

  if (parsedLocations.length > 0) {
    const rows = parsedLocations.map(function(loc, index) {
      // Only the first row of locations gets the Read Token preserved
      const tokenToSave = (index === 0) ? existingReadToken : '';
      return [
        loc.id, loc.name, loc.lat, loc.lng, loc.radius, true,
        updatedBy || 'admin', now, tokenToSave
      ];
    });
    sheet.getRange(2, 1, rows.length, schema.length).setValues(rows);
  }

  const props = PropertiesService.getScriptProperties();
  props.setProperty('API_URL',            apiUrl || '');
  props.setProperty('CONFIG_UPDATED_BY',  updatedBy || '');
  props.setProperty('CONFIG_UPDATED_AT',  now.toISOString());
  props.setProperty('WORK_TIMES',         JSON.stringify(workTimes || {}));
  props.setProperty('FALLBACK_SETTINGS',  JSON.stringify(fallbackSettings || {}));
  props.setProperty('SCAN_MODE',          scanMode || 'login');

  logAction({
    username: auth.user && auth.user.username ? auth.user.username : '',
    role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
    action: 'updateConfig',
    endpoint: 'saveConfig',
    status: 'success',
    details: { locationsCount: (parseLocations(locations) || []).length, scanMode: scanMode }
  });

  return { success: true, message: 'บันทึกการตั้งค่าลง Google Sheets เรียบร้อย' };
}

/**
 * บันทึกตำแหน่งเดียว (Insert or Update)
 */
function saveSingleLocation(data) {
  const auth = authorize('saveConfig', { token: data.token || '' });
  if (!auth.ok) return { status: 'error', message: 'Unauthorized' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');
  const schema = ['Id', 'Name', 'Latitude', 'Longitude', 'Radius', 'Enabled', 'Updated By', 'Updated At', 'Read Token'];
  
  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange(1, 1, 1, schema.length).setValues([schema]);
  }

  const now = new Date();
  const id = String(data.id || '').trim();
  const loc = normalizeLocation(data, 0);
  const values = sheet.getDataRange().getValues();
  let targetRow = -1;

  if (id) {
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][0]).trim() === id) {
        targetRow = i + 1;
        break;
      }
    }
  }

  const finalId = id || ('loc-' + Utilities.getUuid().substring(0, 8));
  const rowData = [
    finalId, loc.name, loc.lat, loc.lng, loc.radius, true,
    data.updatedBy || 'admin', now, ''
  ];

  if (targetRow > 0) {
    sheet.getRange(targetRow, 1, 1, schema.length).setValues([rowData]);
  } else {
    sheet.appendRow(rowData);
  }

  return { success: true, message: 'บันทึกตำแหน่งเรียบร้อย', id: finalId };
}

/**
 * ลบตำแหน่งเดียวออกจาก Sheet
 */
function deleteSingleLocation(data) {
  const auth = authorize('saveConfig', { token: data.token || '' });
  if (!auth.ok) return { status: 'error', message: 'Unauthorized' };

  const id = String(data.id || '').trim();
  if (!id) return { status: 'error', message: 'Missing ID' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  if (!sheet) return { status: 'ok', message: 'Sheet not found' };

  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === id) {
      sheet.deleteRow(i + 1);
      return { success: true, message: 'ลบตำแหน่งเรียบร้อย' };
    }
  }

  return { success: true, message: 'ไม่พบตำแหน่งที่ต้องการลบ (อาจถูกลบไปแล้ว)' };
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
        id: String(row[0] || ('loc-' + i)),
        name: String(row[1] || ('Location ' + i)),
        lat: parseFloat(row[2]) || 0,
        lng: parseFloat(row[3]) || 0,
        radius: parseFloat(row[4]) || 100,
        enabled: row[5] !== false && row[5] !== 'false' && row[5] !== 0
      });
    }
  }

  let workTimes = {};
  let fallbackSettings = {};
  const props = PropertiesService.getScriptProperties();

  try {
    workTimes = JSON.parse(props.getProperty('WORK_TIMES') || '{}');
  } catch (e) {
    workTimes = {};
  }

  try {
    fallbackSettings = JSON.parse(props.getProperty('FALLBACK_SETTINGS') || '{}');
  } catch (e) {
    fallbackSettings = {};
  }

  // สร้าง Response พื้นฐาน
  var response = {
    status: 'ok',
    scanMode: props.getProperty('SCAN_MODE') || 'login', // สำคัญ: ส่ง scanMode กลับไปให้ Frontend ทำงานได้ถูกต้อง
    locations: locations, // สำคัญ: ส่ง locations กลับไปเพื่อให้ config.html นำไปแสดงผลและ scan.html ไปเลือกได้
    workTimes: workTimes,
    fallbackSettings: {
      enabled: fallbackSettings.enabled === true,
      contactText: fallbackSettings.contactText || 'กรุณาติดต่อผู้ดูแลระบบเพื่อขอเปิดใช้งานแผนสำรอง'
    }
  };

  // ตรวจสอบสิทธิ์ (Token) สำหรับข้อมูลที่สำคัญ
  var auth = { ok: false };
  if (typeof validateToken === 'function') {
    auth = validateToken(params && params.token);
  } else if (typeof authorize === 'function') {
    auth = authorize('getConfig', params);
  }

  // ส่งข้อมูลสำคัญให้เฉพาะหน้าต่างที่ได้รับสิทธิ์เท่านั้น (Security Phase 1)
  if (auth.ok || (params && params.token && params.token === readToken)) {
    response.readToken = readToken;
    response.apiUrl = props.getProperty('API_URL') || '';
  }

  return response;
}
