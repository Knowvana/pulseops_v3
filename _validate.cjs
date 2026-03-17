const fs = require('fs');
const files = [
  'src/modules/servicenow/database/Schema.json',
  'src/modules/servicenow/api/config/urls.json',
  'src/modules/servicenow/api/config/APIErrors.json',
  'src/modules/servicenow/api/config/APIMessages.json',
  'src/modules/servicenow/ui/config/uiText.json',
];
let ok = true;
for (const f of files) {
  try {
    JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log('OK:', f);
  } catch (e) {
    console.error('FAIL:', f, e.message);
    ok = false;
  }
}
process.exit(ok ? 0 : 1);
