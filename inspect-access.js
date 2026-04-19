function parseRoleLines(text) {
  var lines = String(text || '').split('\n');
  return lines.filter(function(line) {
    return /super_admin|admin|head_unit|staff/i.test(line);
  });
}

function summarizeFile(path) {
  const fs = require('fs');
  const text = fs.readFileSync(path, 'utf8');
  const hits = parseRoleLines(text);
  console.log(JSON.stringify({ path, hitsCount: hits.length, sample: hits.slice(0, 20) }, null, 2));
}
