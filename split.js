const fs = require('fs');
const content = fs.readFileSync('code.gs', 'utf-8');

// VERY simple split logic based on headers:
// // ============================================================
// //  Sheet Helpers
// // ============================================================

let parts = content.split('// ============================================================');
let files = {
  'main.gs': [],
  'lib/helpers.gs': [],
  'auth.gs': [],
  'attendance.gs': [],
  'config.gs': []
};

let currentFile = 'main.gs';

// Manually mapping sections to files for simplicity
for (let i = 0; i < parts.length; i++) {
  let section = parts[i];
  if (!section.trim()) continue;
  
  if (section.includes('Sheet Helpers') || section.includes('Crypto / Password Helpers')) {
    currentFile = 'lib/helpers.gs';
  } else if (section.includes('doPost') || section.includes('doGet')) {
    currentFile = 'main.gs';
  } else if (section.includes('Auth Helpers') || section.includes('Login Logic') || section.includes('Admin Password Management')) {
    currentFile = 'auth.gs';
  } else if (section.includes('Users Sheet Helper') || section.includes('User Management') || section.includes('Attendance Log')) {
    currentFile = 'attendance.gs';
  } else if (section.includes('System Config')) {
    currentFile = 'config.gs';
  }

  files[currentFile].push('// ============================================================' + section);
}

if (!fs.existsSync('lib')) fs.mkdirSync('lib');

for (let key in files) {
  if (files[key].length > 0) {
    fs.writeFileSync(key, files[key].join(''));
    console.log(`Created ${key}`);
  }
}
