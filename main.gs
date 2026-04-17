// ============================================================

//  GOOGLE APPS SCRIPT — REST API Backend
//  วิธีใช้: Deploy > New deployment > Web App
//           Execute as: Me | Who has access: Anyone
// ============================================================

//  doGet — read-only actions
// ============================================================

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  let result;

  if (!action) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action: undefined' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

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

function ensureUsersSheetWithContract(sheet) {
  const requiredHeaders = ['Employee ID', 'Name', 'Position', 'Role', 'Face Descriptor', 'Registered At', 'Registered By', 'Status'];
  const headerRange = sheet.getLastRow() > 0 ? sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), requiredHeaders.length)) : null;
  const existingHeaders = headerRange ? headerRange.getValues()[0].map(h => String(h || '').trim()) : [];
  if (!existingHeaders.length) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    return requiredHeaders;
  }

  const normalized = existingHeaders.slice();
  requiredHeaders.forEach((header, index) => {
    if (!normalized[index]) normalized[index] = header;
  });
  sheet.getRange(1, 1, 1, normalized.length).setValues([normalized]);
  return normalized;
}

function registerUser(name, faceDescriptor, registeredBy, status, position, roles, role, employeeId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Users') || ss.insertSheet('Users');
  ensureUsersSheetWithContract(sheet);

  const rows = sheet.getDataRange().getValues();
  const headers = rows.length ? rows[0].map(h => String(h || '').trim()) : [];
  const now = new Date();

  const normalizedEmployeeId = normalizeEmployeeId(employeeId, rows);
  const existingIndex = findUserRowIndexByEmployeeId(sheet, normalizedEmployeeId, headers);
  const normalizedRole = String(role || (Array.isArray(roles) && roles.length ? roles[0] : '') || '').trim();

  const record = {
    'Employee ID': normalizedEmployeeId,
    'Name': String(name || '').trim(),
    'Position': String(position || '').trim(),
    'Role': normalizedRole,
    'Face Descriptor': String(faceDescriptor || '').trim(),
    'Registered At': now,
    'Registered By': String(registeredBy || '').trim(),
    'Status': String(status || 'active').trim()
  };

  if (existingIndex > 0) {
    setRowByHeaders(sheet, existingIndex + 1, headers, record);
    return { status: 'success', message: 'User updated', employeeId: normalizedEmployeeId, role: normalizedRole };
  }

  const targetRow = Math.max(sheet.getLastRow() + 1, 2);
  setRowByHeaders(sheet, targetRow, headers, record);
  return { status: 'success', message: 'User registered', employeeId: normalizedEmployeeId, role: normalizedRole };
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid JSON body' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const action = (data && data.action) ? data.action : '';
  if (!action) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action: undefined' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  let result;

  if (action === 'registerUser') {
    result = registerUser(data.name, data.faceDescriptor, data.registeredBy, data.status, data.position, data.roles, data.role, data.employeeId);
  } else if (action === 'logAttendance' || action === 'logCheckout') {
    result = logAttendance(data, action);
  } else if (action === 'saveConfig') {
    result = saveConfig(data.apiUrl, data.locations, data.workTimes, data.fallbackSettings, data.updatedBy, data.token);
  } else if (action === 'saveLocation') {
    result = saveSingleLocation(data);
  } else if (action === 'deleteLocation') {
    result = deleteSingleLocation(data);
  } else if (action === 'login') {
    result = login(data);
  } else if (action === 'verifyAdmin') {
    result = verifyAdmin(data.code);
  } else if (action === 'changeAdminCode') {
    result = changeAdminCode(data.currentCode, data.newCode);
  } else {
    result = { status: 'error', message: 'Unknown action: ' + action };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
