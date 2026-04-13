// ============================================================
//  GOOGLE APPS SCRIPT — REST API Backend
//  วิธีใช้: Deploy > New deployment > Web App
//           Execute as: Me | Who has access: Anyone
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
  } else {
    result = { error: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

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
    result = saveConfig(data.apiUrl, data.locations, data.updatedBy);
  } else {
    result = { error: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

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
    radius: parseFloat(loc.radius || 0.5)
  };
}

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

  return { success: true, message: 'บันทึกข้อมูลหน้ารายเรียบร้อย' };
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

function getLocations() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');
  if (!sheet) return [];

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];

  const locations = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const enabled = String(row[4] || 'TRUE').toLowerCase();
    if (enabled === 'false' || enabled === '0') continue;

    locations.push({
      id: row[0] || ('loc-' + i),
      name: row[1] || ('Location ' + i),
      lat: parseFloat(row[2]),
      lng: parseFloat(row[3]),
      radius: parseFloat(row[4] || 0.5)
    });
  }

  return locations;
}

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

function saveConfig(apiUrl, locations, updatedBy) {
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
        radius: parseFloat(row[4]) || 0.5,
        enabled: row[5] !== false
      });
    }
  }

  return {
    apiUrl: PropertiesService.getScriptProperties().getProperty('API_URL') || '',
    locations: locations
  };
}
