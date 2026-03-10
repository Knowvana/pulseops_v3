// Temporary script to disable/re-enable the servicenow module
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logFile = path.join(__dirname, 'reload-output.txt');
const log = [];
function L(msg) { log.push(msg); fs.writeFileSync(logFile, log.join('\n'), 'utf8'); }

function req(method, reqPath, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 1001, path: reqPath, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    r.setTimeout(10000, () => { r.destroy(new Error('timeout')); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

try {
  L('Step 1: Logging in...');
  const login = await req('POST', '/api/auth/superadmin/login', {
    usernameOrEmail: 'superadmin@pulseops.io',
    password: 'superadmin',
  });
  L('Login status: ' + login.status);
  const data = JSON.parse(login.body);
  const token = data.data?.accessToken;
  if (!token) { L('Login FAILED: ' + login.body); process.exit(1); }
  L('Token obtained OK');

  L('Step 2: Disabling servicenow...');
  const dis = await req('POST', '/api/modules/servicenow/disable', null, token);
  L('Disable: ' + dis.status + ' ' + dis.body);

  await new Promise((r) => setTimeout(r, 1500));

  L('Step 3: Re-enabling servicenow...');
  const en = await req('POST', '/api/modules/servicenow/enable', null, token);
  L('Enable: ' + en.status + ' ' + en.body);

  await new Promise((r) => setTimeout(r, 1000));

  L('Step 4: Testing GET /api/servicenow/schema/info...');
  const test = await req('GET', '/api/servicenow/schema/info', null, token);
  L('Schema info: ' + test.status + ' ' + test.body.substring(0, 500));

  L('Step 5: Testing GET /api/servicenow/sla/config...');
  const sla = await req('GET', '/api/servicenow/sla/config', null, token);
  L('SLA config: ' + sla.status + ' ' + sla.body.substring(0, 300));

  L('DONE - All steps completed.');
} catch (err) {
  L('ERROR: ' + err.message);
  process.exit(1);
}
