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

function saveConfig(apiUrl, locations, workTimes, fallbackSettings, updatedBy, token) {
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
