function extractStaffMemberText(data) {
  if (!data || typeof data !== 'object') return '';
  return [
    data.name,
    data.username,
    data.displayName,
    data.fullName,
    data.email,
    data.role,
    data.userRole,
    data.position,
    data.positionName,
    data.title,
    data.department
  ].filter(Boolean).join(' | ');
}

function inspectEmployeeAccessFile(path) {
  const fs = require('fs');
  const text = fs.readFileSync(path, 'utf8');
  const keywords = ['super_admin', 'admin', 'staff', 'getMyAccess', 'whoAmI', 'getStaffMember', 'permission', 'role'];
  const matches = keywords.filter(k => text.includes(k));
  console.log(JSON.stringify({ path, matches, length: text.length }, null, 2));
}
