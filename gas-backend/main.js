// ============================================================

//  GOOGLE APPS SCRIPT — REST API Backend
//  วิธีใช้: Deploy > New deployment > Web App
//           Execute as: Me | Who has access: Anyone
// ============================================================

function dispatchAction(action, params, method) {
  var result;
  if (action === 'login') result = login(params);
  else if (action === 'getConfig') result = getConfig(params);
  else if (action === 'getKnownFaces') result = getKnownFaces(params);
  else if (action === 'getLocations') result = getLocations(params);
  else if (action === 'getAttendanceLogs') result = getAttendanceLogs(params);
  else if (action === 'logout') result = logout(params);
  else if (action === 'initSetup') result = initSetup();
  else if (action === 'registerUser') result = registerUser(params.name, params.faceDescriptor, params.registeredBy, params.status, params.position, params.roles, params.role, params.employeeId);
  else if (action === 'logAttendance' || action === 'logCheckout') result = logAttendance(params, action);
  else if (action === 'saveConfig') result = saveConfig(params.apiUrl, params.locations, params.workTimes, params.fallbackSettings, params.updatedBy, params.token, params.scanMode);
  else if (action === 'saveLocation') result = saveSingleLocation(params);
  else if (action === 'deleteLocation') result = deleteSingleLocation(params);
  else if (action === 'verifyAdmin') result = verifyAdmin(params.code);
  else if (action === 'changeAdminCode') result = changeAdminCode(params.currentCode, params.newCode);
  else if (action === 'getStaffList') result = getStaffList(params);
  else if (action === 'getStaffMember') result = getStaffMember(params);
  else if (action === 'createStaffMember') result = createStaffMember(params);
  else if (action === 'updateStaffMember') result = updateStaffMember(params);
  else if (action === 'deleteStaffMember') result = deleteStaffMember(params);
  else if (action === 'toggleStaffPermission') result = toggleStaffPermission(params);
  else if (action === 'updateStaffScope') result = updateStaffScope(params);
  else if (action === 'seedStaffOsDemoData') result = seedStaffOsDemoData(params);
  else if (action === 'getMyAccess') result = getMyAccess(params);
  else if (action === 'whoAmI') result = whoAmI(params);
  else result = { status: 'error', message: 'Unknown action: ' + action };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

//  doGet — read-only actions
// ============================================================

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : '';
  if (!action) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action: undefined' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return dispatchAction(action, e.parameter, 'GET');
}

// ============================================================
// doPost — write / verify actions
// ============================================================

function doPost(e) {
  var data;
  try {
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

  return dispatchAction(action, data, 'POST');
}

function denyAction(action, params) {
  return authorize(action, params);
}
