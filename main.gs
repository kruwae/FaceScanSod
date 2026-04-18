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
  else if (action === 'registerUser')        result = registerUser(e.parameter.name, e.parameter.faceDescriptor, e.parameter.registeredBy, e.parameter.status, e.parameter.position, e.parameter.roles, e.parameter.role, e.parameter.employeeId);
  else if (action === 'logAttendance' || action === 'logCheckout') result = logAttendance(e.parameter, action);
  else if (action === 'saveConfig')          result = saveConfig(e.parameter.apiUrl, e.parameter.locations, e.parameter.workTimes, e.parameter.fallbackSettings, e.parameter.updatedBy, e.parameter.token);
  else if (action === 'saveLocation')         result = saveSingleLocation(e.parameter);
  else if (action === 'deleteLocation')       result = deleteSingleLocation(e.parameter);
  else if (action === 'verifyAdmin')         result = verifyAdmin(e.parameter.code);
  else if (action === 'changeAdminCode')     result = changeAdminCode(e.parameter.currentCode, e.parameter.newCode);
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
    // Null-safe: Chrome may deliver e.postData as null if body is dropped
    var rawBody = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
    data = rawBody ? JSON.parse(rawBody) : {};
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
  else if (action === 'saveLocation')    result = saveSingleLocation(data);
  else if (action === 'deleteLocation')  result = deleteSingleLocation(data);
  else if (action === 'login')           result = login(data);
  else if (action === 'verifyAdmin')     result = verifyAdmin(data.code);
  else if (action === 'changeAdminCode') result = changeAdminCode(data.currentCode, data.newCode);
  else if (action === 'getConfig')       result = getConfig(data);
  else if (action === 'getKnownFaces')   result = getKnownFaces(data);
  else if (action === 'getLocations')    result = getLocations(data);
  else if (action === 'getAttendanceLogs') result = getAttendanceLogs(data);
  else if (action === 'registerUser')    result = registerUser(data.name, data.faceDescriptor, data.registeredBy, data.status, data.position, data.roles, data.role, data.employeeId);
  else if (action === 'saveConfig')      result = saveConfig(data.apiUrl, data.locations, data.workTimes, data.fallbackSettings, data.updatedBy, data.token);
  else if (action === 'saveLocation')    result = saveSingleLocation(data);
  else if (action === 'deleteLocation')  result = deleteSingleLocation(data);
  else result = { status: 'error', message: 'Unknown action: ' + action };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
