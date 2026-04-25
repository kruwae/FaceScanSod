const fs = require('fs');
const vm = require('vm');
const files = ['main.gs', 'attendance.gs', 'config.gs', 'staff.gs', 'auth.gs'];
files.forEach(f => {
  try {
    const code = fs.readFileSync(f, 'utf8');
    new vm.Script(code);
    console.log(f + ': OK');
  } catch (e) {
    console.log(f + ': ERROR - ' + e.message);
  }
});
