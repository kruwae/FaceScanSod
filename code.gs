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
    result = logAttendance(data.name, data.lat, data.lng, data.matchScore, data.distance, data.device);
  } else if (action === 'saveConfig') {
    result = saveConfig(data.lat, data.lng, data.radius, data.updatedBy);
  } else {
    result = { error: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

# --- helpers ---
function ensureSheetWithHeaders(ss, sheetName, headers) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

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

function getCellByHeader(sheet, rowNumber, headerMap, headerName) {
  const col = headerMap[headerName];
  return col ? sheet.getRange(rowNumber, col).getValue() : '';
}

// --- ส่วนจัดการใบหน้า (Users) ---
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

  let users = [];
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

# --- ส่วนบันทึกเวลา (Attendance) ---
function logAttendance(name, lat, lng, matchScore, distance, device) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schema = ['Name', 'Time', 'Date', 'Latitude', 'Longitude', 'Google Map Link', 'Match Score', 'Distance', 'Device'];
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
    'Device': device || ''
  });

  return { success: true, message: 'บันทึกเวลาเสร็จสิ้น' };
}

# --- ส่วนจัดการ Config (GPS) ---
function saveConfig(lat, lng, radius, updatedBy) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const schema = ['Parameter', 'Value', 'Updated At', 'Updated By'];
  let sheet = ss.getSheetByName('Config');

  if (!sheet) {
    sheet = ss.insertSheet('Config');
    sheet.getRange('A1:D1').setValues([schema]);
    sheet.getRange('A2').setValue('Target Latitude');
    sheet.getRange('A3').setValue('Target Longitude');
    sheet.getRange('A4').setValue('Allowed Radius (KM)');
    sheet.setColumnWidth(1, 150);
  } else {
    const headerRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), schema.length)).getValues()[0];
    if (headerRow.length < 4 || headerRow[0] !== 'Parameter') {
      sheet.getRange('A1:D1').setValues([schema]);
      sheet.getRange('A2').setValue('Target Latitude');
      sheet.getRange('A3').setValue('Target Longitude');
      sheet.getRange('A4').setValue('Allowed Radius (KM)');
      sheet.setColumnWidth(1, 150);
    }
  }

  const now = new Date();
  sheet.getRange('B2').setValue(lat);
  sheet.getRange('B3').setValue(lng);
  sheet.getRange('B4').setValue(radius);
  sheet.getRange('B2').setNote('Updated: ' + now + (updatedBy ? ' | By: ' + updatedBy : ''));

  return { success: true, message: 'บันทึกการตั้งค่าลง Google Sheets เรียบร้อย' };
}

function getConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Config');

  let config = { lat: 0, lng: 0, radius: 0.5 };

  if (sheet) {
    const latVal = sheet.getRange('B2').getValue();
    const lngVal = sheet.getRange('B3').getValue();
    const radiusVal = sheet.getRange('B4').getValue();

    if (latVal !== '') config.lat = parseFloat(latVal);
    if (lngVal !== '') config.lng = parseFloat(lngVal);
    if (radiusVal !== '') config.radius = parseFloat(radiusVal);
  }

  return config;
}
