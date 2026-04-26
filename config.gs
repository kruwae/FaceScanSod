// ============================================================

function ensureSheetWithHeaders(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return { sheet, headerMap: buildHeaderMap(headers) };
  }

  const schema = headers.slice();
  const existingHeaders = sheet.getLastRow() > 0
    ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h || '').trim(); })
    : [];
  const existingMap = buildHeaderMap(existingHeaders);

  let updatedHeaders = existingHeaders.slice();
  let changed = false;

  schema.forEach(function(headerName) {
    if (!existingMap[headerName] && !existingMap[headerName.toLowerCase()]) {
      updatedHeaders.push(headerName);
      existingMap[headerName] = updatedHeaders.length;
      existingMap[headerName.toLowerCase()] = updatedHeaders.length;
      changed = true;
    }
  });

  if (changed) {
    sheet.getRange(1, 1, 1, updatedHeaders.length).setValues([updatedHeaders]);
  }

  return { sheet, headerMap: existingMap };
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

// maskSensitiveValue และ logAction อยู่ใน attendance.gs

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
    radius: parseFloat(loc.radius || 100),
    qrEnabled: loc.qrEnabled === true || String(loc.qrEnabled).toLowerCase() === 'true',
    qrType: loc.qrType || 'static',
    qrInterval: parseInt(loc.qrInterval) || 5,
    qrSecret: loc.qrSecret || '',
    qrRequireFace: loc.qrRequireFace === true || String(loc.qrRequireFace).toLowerCase() === 'true'
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

  const headers = values[0].map(h => String(h || '').trim());
  const hm = buildHeaderMap(headers);

  const locations = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const enabled = String(row[hm['Enabled'] - 1] || 'true').toLowerCase();
    if (enabled === 'false' || enabled === '0') continue;

    locations.push({
      id: row[hm['Id'] - 1] || ('loc-' + i),
      name: row[hm['Name'] - 1] || ('Location ' + i),
      lat: parseFloat(row[hm['Latitude'] - 1]),
      lng: parseFloat(row[hm['Longitude'] - 1]),
      radius: parseFloat(row[hm['Radius'] - 1] || 100),
      enabled: true,
      qrEnabled: hm['QR Enabled'] ? (String(row[hm['QR Enabled'] - 1] || '').toLowerCase() === 'true') : false,
      qrType: hm['QR Type'] ? String(row[hm['QR Type'] - 1] || 'static') : 'static',
      qrInterval: hm['QR Interval'] ? parseInt(row[hm['QR Interval'] - 1] || 5) : 5,
      qrSecret: hm['QR Secret'] ? String(row[hm['QR Secret'] - 1] || '') : '',
      qrRequireFace: hm['QR Require Face'] ? (String(row[hm['QR Require Face'] - 1] || 'true').toLowerCase() === 'true') : true
    });
  }
  return locations;
}

// ============================================================

//  Config — Save / Load
// ============================================================

function saveConfig(apiUrl, locations, workTimes, fallbackSettings, updatedBy, token, scanMode, faceMatchThreshold) {
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
  const schema = ['Id', 'Name', 'Latitude', 'Longitude', 'Radius', 'Enabled', 'Updated By', 'Updated At', 'Read Token', 'QR Enabled', 'QR Type', 'QR Interval', 'QR Secret', 'QR Require Face'];

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
        updatedBy || 'admin', now, tokenToSave,
        loc.qrEnabled, loc.qrType, loc.qrInterval, loc.qrSecret || Utilities.getUuid().substring(0, 8),
        loc.qrRequireFace !== false
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
  props.setProperty('FACE_MATCH_THRESHOLD', String(faceMatchThreshold || 0.45));

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

/**
 * บันทึกตำแหน่งเดียว (Insert or Update)
 */
function saveSingleLocation(data) {
  const auth = authorize('saveConfig', { token: data.token || '' });
  if (!auth.ok) return { status: 'error', message: 'Unauthorized' };

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Config');
  const schema = ['Id', 'Name', 'Latitude', 'Longitude', 'Radius', 'Enabled', 'Updated By', 'Updated At', 'Read Token', 'QR Enabled', 'QR Type', 'QR Interval', 'QR Secret', 'QR Require Face'];
  
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
  const finalQrSecret = loc.qrSecret || Utilities.getUuid().substring(0, 8);
  const rowData = [
    finalId, loc.name, loc.lat, loc.lng, loc.radius, true,
    data.updatedBy || 'admin', now, '',
    loc.qrEnabled, loc.qrType, loc.qrInterval, finalQrSecret,
    loc.qrRequireFace !== false
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
      // ข้ามถ้าไม่มีพิกัด lat, lng เพราะชื่อกับ id อาจจะว่างได้ในตอนแรก
      if (!row[headerMap['Latitude'] - 1] && !row[headerMap['Longitude'] - 1]) continue;
      locations.push({
        id: row[headerMap['Id'] - 1] || ('loc-' + i),
        name: row[headerMap['Name'] - 1] || ('Location ' + i),
        lat: parseFloat(row[headerMap['Latitude'] - 1]) || 0,
        lng: parseFloat(row[headerMap['Longitude'] - 1]) || 0,
        radius: parseFloat(row[headerMap['Radius'] - 1]) || 100,
        enabled: headerMap['Enabled'] ? row[headerMap['Enabled'] - 1] !== false : true,
        qrEnabled: headerMap['QR Enabled'] ? (String(row[headerMap['QR Enabled'] - 1] || '').toLowerCase() === 'true') : false,
        qrType: headerMap['QR Type'] ? String(row[headerMap['QR Type'] - 1] || 'static') : 'static',
        qrInterval: headerMap['QR Interval'] ? parseInt(row[headerMap['QR Interval'] - 1] || 5) : 5,
        qrSecret: headerMap['QR Secret'] ? String(row[headerMap['QR Secret'] - 1] || '') : '',
        qrRequireFace: headerMap['QR Require Face'] ? (String(row[headerMap['QR Require Face'] - 1] || 'true').toLowerCase() === 'true') : true
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

  var googleClientId = '';
  try { googleClientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_OAUTH_CLIENT_ID') || ''; } catch(e) {}

  return {
    status: 'ok',
    apiUrl: PropertiesService.getScriptProperties().getProperty('API_URL') || '',
    readToken: readToken,
    googleClientId: googleClientId,
    locations: locations,
    workTimes: workTimes,
    fallbackSettings: {
      enabled: fallbackSettings.enabled === true,
      contactText: fallbackSettings.contactText || 'กรุณาติดต่อผู้ดูแลระบบเพื่อขอเปิดใช้งานแผนสำรอง'
    },
    scanMode: PropertiesService.getScriptProperties().getProperty('SCAN_MODE') || 'login',
    faceMatchThreshold: parseFloat(PropertiesService.getScriptProperties().getProperty('FACE_MATCH_THRESHOLD') || '0.45')
  };
}
