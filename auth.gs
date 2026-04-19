// ============================================================
//  staffOS Sheet — Authentication helpers and compatibility shims
// ============================================================

function maskSensitiveValue(value) {
  var raw = String(value || '');
  if (!raw) return '';
  if (raw.length <= 4) return '****';
  return raw.substring(0, 2) + '****' + raw.substring(raw.length - 2);
}

function logAction(entry) {
  try {
    Logger.log(JSON.stringify(entry || {}));
  } catch (e) {}
}

function ensureAuthBootstrap() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  upsertStaffPermissionColumns(result.sheet, result.headerMap);
  return result;
}