// ============================================================
//  staff.gs — Staff Management (staffOS Sheet CRUD + Permissions)
//  รองรับ role: super_admin, admin, head_unit, staff
//  Columns: Username, Code, Role, Status, Note,
//           Created At, Updated At, Hash Version, Hash Salt, Email,
//           Scope, Unit, Permissions,
//           Can Register Face, Can View Report, Can Manage Staff, Can Manage Config
// ============================================================

var STAFF_PERMISSION_COLS = [
  'Can Register Face', 'Can View Report', 'Can Manage Staff', 'Can Manage Config'
];

var DEFAULT_PERMISSIONS = {
  canRegisterFace:  false,
  canViewReport:    false,
  canManageStaff:   false,
  canManageConfig:  false
};

var ROLE_DEFAULT_PERMISSIONS = {
  'super_admin': { canRegisterFace: true,  canViewReport: true,  canManageStaff: true,  canManageConfig: true  },
  'admin':       { canRegisterFace: true,  canViewReport: true,  canManageStaff: true,  canManageConfig: true  },
  'head_unit':   { canRegisterFace: true,  canViewReport: true,  canManageStaff: false, canManageConfig: false },
  'staff':       { canRegisterFace: false, canViewReport: false, canManageStaff: false, canManageConfig: false }
};

// ============================================================
//  Helpers
// ============================================================

function ensureStaffSheetWithContract(ss) {
  return ensureSheetWithHeaders(ss, STAFFOS_SHEET, STAFFOS_HEADERS);
}

function upsertStaffPermissionColumns(sheet, hm) {
  // ตรวจสอบว่ามี permission boolean columns ครบหรือไม่
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var changed = false;
  STAFF_PERMISSION_COLS.forEach(function(col) {
    if (!hm[col]) {
      var nextCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, nextCol).setValue(col);
      hm[col] = nextCol;
      hm[col.toLowerCase()] = nextCol;
      changed = true;
    }
  });
  return changed;
}

function buildPermissionsJson(row, hm) {
  var permCol = hm['Permissions'] || hm['permissions'];
  if (permCol) {
    try {
      var raw = String(row[permCol - 1] || '').trim();
      if (raw) return JSON.parse(raw);
    } catch(e) {}
  }
  // ถ้าไม่มี JSON column ให้ดูจาก boolean columns
  return {
    canRegisterFace:  getBoolCol(row, hm, 'Can Register Face'),
    canViewReport:    getBoolCol(row, hm, 'Can View Report'),
    canManageStaff:   getBoolCol(row, hm, 'Can Manage Staff'),
    canManageConfig:  getBoolCol(row, hm, 'Can Manage Config')
  };
}

function getBoolCol(row, hm, colName) {
  var col = hm[colName] || hm[colName.toLowerCase()];
  if (!col) return false;
  var val = row[col - 1];
  if (typeof val === 'boolean') return val;
  return String(val || '').trim().toUpperCase() === 'TRUE';
}

function rowToStaffObject(row, hm, includeHash) {
  var obj = {
    username:        String(row[hm['Username'] - 1]     || '').trim(),
    name:            hm['Name'] ? String(row[hm['Name'] - 1] || '').trim() : '',
    role:            String(row[hm['Role']     - 1]     || '').trim().toLowerCase(),
    status:          String(row[hm['Status']   - 1]     || '').trim().toLowerCase(),
    note:            String(row[hm['Note']     - 1]     || '').trim(),
    email:           String(row[hm['Email']    - 1]     || '').trim(),
    scope:           String(row[hm['Scope']    ? hm['Scope'] - 1   : 0] || '').trim(),
    unit:            String(row[hm['Unit']     ? hm['Unit']  - 1   : 0] || '').trim(),
    permissions:     buildPermissionsJson(row, hm),
    createdAt:       row[hm['Created At'] - 1] ? String(row[hm['Created At'] - 1]) : '',
    updatedAt:       row[hm['Updated At'] - 1] ? String(row[hm['Updated At'] - 1]) : '',
    hashVersion:     String(row[hm['Hash Version'] ? hm['Hash Version'] - 1 : 0] || '')
  };
  if (!obj.scope && hm['scope']) obj.scope = String(row[hm['scope'] - 1] || '').trim();
  if (!obj.unit  && hm['unit'])  obj.unit  = String(row[hm['unit']  - 1] || '').trim();
  if (includeHash) {
    obj.codeHash = String(row[hm['Code'] - 1] || '');
    obj.hashSalt = String(row[hm['Hash Salt'] ? hm['Hash Salt'] - 1 : 0] || '');
  }
  return obj;
}

function writePermissionCols(sheet, rowNum, hm, perms) {
  var map = {
    'Can Register Face': perms.canRegisterFace,
    'Can View Report':   perms.canViewReport,
    'Can Manage Staff':  perms.canManageStaff,
    'Can Manage Config': perms.canManageConfig
  };
  Object.keys(map).forEach(function(col) {
    var c = hm[col] || hm[col.toLowerCase()];
    if (c) sheet.getRange(rowNum, c).setValue(map[col] === true);
  });
}

// ============================================================
//  getStaffList — ดึงรายชื่อทั้งหมด (ไม่รวม hash)
// ============================================================

function getStaffList(params) {
  var auth = authorize('getStaffList', params);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized', code: auth.code || 401 };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'ok', staff: [] };

  var filterRole   = (params && params.role)   ? String(params.role).toLowerCase()   : '';
  var filterScope  = (params && params.scope)  ? String(params.scope).toLowerCase()  : '';
  var filterStatus = (params && params.status) ? String(params.status).toLowerCase() : '';

  var staff = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[hm['Username'] - 1]) continue;
    var obj = rowToStaffObject(row, hm, false);
    if (filterRole   && obj.role   !== filterRole)   continue;
    if (filterScope  && obj.scope  !== filterScope)  continue;
    if (filterStatus && obj.status !== filterStatus) continue;
    staff.push(obj);
  }

  return { status: 'ok', staff: staff, total: staff.length };
}

// ============================================================
//  getStaffMember — ดึง staff คนเดียว
// ============================================================

function getStaffMember(params) {
  var auth = authorize('getStaffList', params);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized' };

  var username = String((params && params.username) || '').trim().toLowerCase();
  if (!username) return { status: 'error', message: 'Missing username' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var hm = result.headerMap;
  var data = result.sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowUser = String(data[i][hm['Username'] - 1] || '').trim().toLowerCase();
    if (rowUser === username) {
      return { status: 'ok', member: rowToStaffObject(data[i], hm, false) };
    }
  }
  return { status: 'error', message: 'Staff not found' };
}

// ============================================================
//  createStaffMember — เพิ่ม staff ใหม่
// ============================================================

function createStaffMember(params) {
  var auth = authorize('createStaffMember', params);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized' };

  var username = String((params && params.username) || '').trim();
  var name     = String((params && params.name)     || '').trim();
  var code     = String((params && params.code)     || '').trim();
  var role     = String((params && params.role)     || 'staff').trim().toLowerCase();
  var email    = String((params && params.email)    || '').trim();
  var scope    = String((params && params.scope)    || '').trim();
  var unit     = String((params && params.unit)     || '').trim();
  var note     = String((params && params.note)     || '').trim();

  if (!username) return { status: 'error', message: 'Missing username' };
  if (!code)     return { status: 'error', message: 'Missing code (password)' };
  if (code.length < 4) return { status: 'error', message: 'รหัสต้องมีอย่างน้อย 4 ตัวอักษร' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();

  // ตรวจสอบ username ซ้ำ
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][hm['Username'] - 1] || '').trim().toLowerCase() === username.toLowerCase()) {
      return { status: 'error', message: 'Username นี้มีอยู่แล้ว' };
    }
  }

  var now = new Date();
  var userSalt = createUserSalt(username);
  var hashRecord = buildPasswordRecord(code, userSalt, HASH_VERSION_V2);
  var perms = Object.assign({}, DEFAULT_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS[role] || {});
  // Allow override from params
  if (params && params.permissions && typeof params.permissions === 'object') {
    perms = Object.assign(perms, params.permissions);
  }
  var permsJson = JSON.stringify(perms);

  var rowNum = sheet.getLastRow() + 1;
  setRowByHeaders(sheet, rowNum, hm, {
    'Username':         username,
    'Name':             name,
    'Code':             hashRecord.hash,
    'Role':             role,
    'Status':           'active',
    'Note':             note || ('สร้างโดย ' + (auth.user && auth.user.username ? auth.user.username : 'admin')),
    'Created At':       now,
    'Updated At':       now,
    'Hash Version':     hashRecord.version,
    'Hash Salt':        hashRecord.salt,
    'Email':            email,
    'Scope':            scope,
    'Unit':             unit,
    'Permissions':      permsJson
  });
  writePermissionCols(sheet, rowNum, hm, perms);

  logAction({
    username: auth.user && auth.user.username ? auth.user.username : '',
    role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
    action: 'createStaffMember',
    endpoint: 'createStaffMember',
    status: 'success',
    details: { target: username, role: role }
  });

  return { status: 'ok', message: 'สร้าง staff เรียบร้อย', username: username, role: role };
}

// ============================================================
//  updateStaffMember — แก้ไขข้อมูล staff
// ============================================================

function updateStaffMember(params) {
  var auth = authorize('createStaffMember', params);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized' };

  var username = String((params && params.username) || '').trim().toLowerCase();
  if (!username) return { status: 'error', message: 'Missing username' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowUser = String(data[i][hm['Username'] - 1] || '').trim().toLowerCase();
    if (rowUser !== username) continue;

    var rowNum = i + 1;
    var now = new Date();

    if (params.role   !== undefined) sheet.getRange(rowNum, hm['Role']  ).setValue(String(params.role).toLowerCase());
    if (params.name   !== undefined && hm['Name']) sheet.getRange(rowNum, hm['Name']).setValue(String(params.name).trim());
    if (params.status !== undefined) sheet.getRange(rowNum, hm['Status']).setValue(String(params.status).toLowerCase());
    if (params.email  !== undefined) sheet.getRange(rowNum, hm['Email'] ).setValue(String(params.email).trim());
    if (params.note   !== undefined) sheet.getRange(rowNum, hm['Note']  ).setValue(String(params.note).trim());
    if (params.scope  !== undefined && hm['Scope']) sheet.getRange(rowNum, hm['Scope']).setValue(String(params.scope).trim());
    if (params.unit   !== undefined && hm['Unit'])  sheet.getRange(rowNum, hm['Unit'] ).setValue(String(params.unit).trim());

    // อัปเดต password ถ้ามี
    if (params.newCode && String(params.newCode).trim().length >= 4) {
      var newSalt = createUserSalt(username + '|' + params.newCode);
      var newHash = buildPasswordRecord(params.newCode, newSalt, HASH_VERSION_V2);
      sheet.getRange(rowNum, hm['Code']).setValue(newHash.hash);
      if (hm['Hash Version']) sheet.getRange(rowNum, hm['Hash Version']).setValue(newHash.version);
      if (hm['Hash Salt'])    sheet.getRange(rowNum, hm['Hash Salt']   ).setValue(newHash.salt);
    }

    // อัปเดต permissions ถ้ามี
    if (params.permissions && typeof params.permissions === 'object') {
      var currentPerms = buildPermissionsJson(data[i], hm);
      var updatedPerms = Object.assign(currentPerms, params.permissions);
      if (hm['Permissions']) sheet.getRange(rowNum, hm['Permissions']).setValue(JSON.stringify(updatedPerms));
      writePermissionCols(sheet, rowNum, hm, updatedPerms);
    }

    sheet.getRange(rowNum, hm['Updated At']).setValue(now);

    logAction({
      username: auth.user && auth.user.username ? auth.user.username : '',
      role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
      action: 'updateStaffMember',
      endpoint: 'updateStaffMember',
      status: 'success',
      details: { target: username }
    });

    return { status: 'ok', message: 'อัปเดตข้อมูล staff เรียบร้อย', username: username };
  }

  return { status: 'error', message: 'ไม่พบ staff: ' + username };
}

// ============================================================
//  deleteStaffMember — soft delete (set status = inactive)
// ============================================================

function deleteStaffMember(params) {
  var auth = authorize('createStaffMember', params);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized' };

  var username = String((params && params.username) || '').trim().toLowerCase();
  if (!username) return { status: 'error', message: 'Missing username' };

  // ป้องกัน super_admin ลบตัวเอง
  if (auth.user && auth.user.username && auth.user.username.toLowerCase() === username) {
    return { status: 'error', message: 'ไม่สามารถลบตัวเองได้' };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowUser = String(data[i][hm['Username'] - 1] || '').trim().toLowerCase();
    if (rowUser !== username) continue;

    // ห้ามลบ super_admin
    var rowRole = String(data[i][hm['Role'] - 1] || '').toLowerCase();
    if (rowRole === 'super_admin') {
      return { status: 'error', message: 'ไม่สามารถลบ super_admin ได้' };
    }

    sheet.getRange(i + 1, hm['Status']).setValue('inactive');
    sheet.getRange(i + 1, hm['Updated At']).setValue(new Date());

    logAction({
      username: auth.user && auth.user.username ? auth.user.username : '',
      role: auth.user && auth.user.role ? auth.user.role : DEFAULT_ROLE,
      action: 'deleteStaffMember',
      endpoint: 'deleteStaffMember',
      status: 'success',
      details: { target: username }
    });

    return { status: 'ok', message: 'ระงับบัญชี staff เรียบร้อย', username: username };
  }
  return { status: 'error', message: 'ไม่พบ staff: ' + username };
}

// ============================================================
//  toggleStaffPermission — toggle permission เดียว
// ============================================================

function toggleStaffPermission(params) {
  var auth = authorize('createStaffMember', params);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized' };

  var username   = String((params && params.username)   || '').trim().toLowerCase();
  var permission = String((params && params.permission) || '').trim(); // เช่น 'canViewReport'
  if (!username || !permission) return { status: 'error', message: 'Missing username or permission' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowUser = String(data[i][hm['Username'] - 1] || '').trim().toLowerCase();
    if (rowUser !== username) continue;

    var perms = buildPermissionsJson(data[i], hm);
    perms[permission] = !perms[permission]; // toggle
    var permsJson = JSON.stringify(perms);
    if (hm['Permissions']) sheet.getRange(i + 1, hm['Permissions']).setValue(permsJson);
    writePermissionCols(sheet, i + 1, hm, perms);
    sheet.getRange(i + 1, hm['Updated At']).setValue(new Date());

    return { status: 'ok', message: 'Toggle permission เรียบร้อย', username: username, permission: permission, value: perms[permission] };
  }
  return { status: 'error', message: 'ไม่พบ staff: ' + username };
}

// ============================================================
//  updateStaffScope — อัปเดต Scope และ Unit
// ============================================================

function updateStaffScope(params) {
  var auth = authorize('createStaffMember', params);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized' };

  var username = String((params && params.username) || '').trim().toLowerCase();
  var scope    = String((params && params.scope)    || '').trim();
  var unit     = String((params && params.unit)     || '').trim();
  if (!username) return { status: 'error', message: 'Missing username' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = result.headerMap;
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowUser = String(data[i][hm['Username'] - 1] || '').trim().toLowerCase();
    if (rowUser !== username) continue;

    if (hm['Scope'] && scope) sheet.getRange(i + 1, hm['Scope']).setValue(scope);
    if (hm['Unit']  && unit)  sheet.getRange(i + 1, hm['Unit'] ).setValue(unit);
    sheet.getRange(i + 1, hm['Updated At']).setValue(new Date());

    return { status: 'ok', message: 'อัปเดต Scope/Unit เรียบร้อย', username: username, scope: scope, unit: unit };
  }
  return { status: 'error', message: 'ไม่พบ staff: ' + username };
}

// ============================================================
//  getMyAccess — ดึง permissions ของ token ปัจจุบัน
// ============================================================

function getMyAccess(params) {
  var auth = validateToken(params && params.token);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized' };

  var username = auth.user && auth.user.username ? auth.user.username.toLowerCase() : '';
  var role     = auth.user && auth.user.role     ? auth.user.role : DEFAULT_ROLE;

  // super_admin / admin มีสิทธิ์ทั้งหมด
  if (role === 'super_admin' || role === 'admin') {
    return {
      status: 'ok',
      username: username,
      role: role,
      permissions: { canRegisterFace: true, canViewReport: true, canManageStaff: true, canManageConfig: true },
      scope: 'school-wide',
      unit: 'hq'
    };
  }

  // ดึงจาก sheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var hm = result.headerMap;
  var data = result.sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var rowUser = String(data[i][hm['Username'] - 1] || '').trim().toLowerCase();
    if (rowUser !== username) continue;
    var obj = rowToStaffObject(data[i], hm, false);
    return {
      status: 'ok',
      username: obj.username,
      role: obj.role,
      permissions: obj.permissions,
      scope: obj.scope,
      unit: obj.unit
    };
  }

  return { status: 'ok', username: username, role: role, permissions: DEFAULT_PERMISSIONS, scope: '', unit: '' };
}

// ============================================================
//  whoAmI — ข้อมูล user ปัจจุบัน
// ============================================================

function whoAmI(params) {
  var auth = validateToken(params && params.token);
  if (!auth.ok) return { status: 'error', message: 'Unauthorized' };
  return {
    status: 'ok',
    username: auth.user.username,
    role: auth.user.role
  };
}

// ============================================================
//  seedStaffOsDemoData — สร้างข้อมูลตัวอย่าง
// ============================================================

function seedStaffOsDemoData(params) {
  var auth = authorize('createStaffMember', params);
  if (!auth.ok) return { status: 'error', message: auth.error || 'Unauthorized' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = ensureStaffSheetWithContract(ss);
  var sheet = result.sheet;
  var hm = result.headerMap;

  var demoUsers = [
    { username: 'head_unit1', name: 'หัวหน้า 1', code: 'head1234', role: 'head_unit', email: 'head1@example.com', scope: 'unit-a', unit: 'unit-a', note: 'Demo head unit-a' },
    { username: 'head_unit2', name: 'หัวหน้า 2', code: 'head1234', role: 'head_unit', email: 'head2@example.com', scope: 'unit-b', unit: 'unit-b', note: 'Demo head unit-b' },
    { username: 'staff1',     name: 'สตาฟ 1',    code: 'staff123', role: 'staff',     email: 'staff1@example.com', scope: 'unit-a', unit: 'unit-a', note: 'Demo staff' },
    { username: 'staff2',     name: 'สตาฟ 2',    code: 'staff123', role: 'staff',     email: 'staff2@example.com', scope: 'unit-a', unit: 'unit-a', note: 'Demo staff' }
  ];

  var now = new Date();
  var created = [];
  var data = sheet.getDataRange().getValues();

  demoUsers.forEach(function(u) {
    // ข้ามถ้ามีอยู่แล้ว
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][hm['Username'] - 1] || '').toLowerCase() === u.username) return;
    }
    var userSalt = createUserSalt(u.username);
    var hashRecord = buildPasswordRecord(u.code, userSalt, HASH_VERSION_V2);
    var perms = Object.assign({}, DEFAULT_PERMISSIONS, ROLE_DEFAULT_PERMISSIONS[u.role] || {});
    var rowNum = sheet.getLastRow() + 1;
    setRowByHeaders(sheet, rowNum, hm, {
      'Username':     u.username,
      'Name':         u.name,
      'Code':         hashRecord.hash,
      'Role':         u.role,
      'Status':       'active',
      'Note':         u.note,
      'Created At':   now,
      'Updated At':   now,
      'Hash Version': hashRecord.version,
      'Hash Salt':    hashRecord.salt,
      'Email':        u.email,
      'Scope':        u.scope,
      'Unit':         u.unit,
      'Permissions':  JSON.stringify(perms)
    });
    writePermissionCols(sheet, rowNum, hm, perms);
    created.push(u.username);
  });

  return { status: 'ok', message: 'Seed demo data เรียบร้อย', created: created };
}
