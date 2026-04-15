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

  const action = (data && data.action) ? data.action : '';
  if (!action) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action: undefined' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  let result;

  if (action === 'registerUser')         result = registerUser(data.name, data.faceDescriptor, data.registeredBy, data.status, data.position, data.roles, data.role, data.employeeId);
  else if (action === 'logAttendance' || action === 'logCheckout')   result = logAttendance(data, action);
  else if (action === 'saveConfig')      result = saveConfig(data.apiUrl, data.locations, data.workTimes, data.fallbackSettings, data.updatedBy, data.token);
  else if (action === 'login')           result = login(data);
  else if (action === 'verifyAdmin')     result = verifyAdmin(data.code);
  else if (action === 'changeAdminCode') result = changeAdminCode(data.currentCode, data.newCode);
  else result = { status: 'error', message: 'Unknown action: ' + action };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

