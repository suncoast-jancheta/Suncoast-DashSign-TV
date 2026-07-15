// Prepares local development before `npm start`:
// - creates .dev.vars from the example on first run
// - detects this machine's LAN IP and stores it as LAN_ORIGIN so the admin UI
//   can show player links / QR codes that TVs and phones on the same network
//   can open (localhost links only work on this computer)
import fs from 'node:fs';
import os from 'node:os';

const PORT = 8787;

if (!fs.existsSync('.dev.vars')) {
  fs.copyFileSync('.dev.vars.example', '.dev.vars');
}

let vars = fs.readFileSync('.dev.vars', 'utf8');

const lanIp = Object.values(os.networkInterfaces())
  .flat()
  .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;

if (lanIp) {
  const lanOrigin = `http://${lanIp}:${PORT}`;
  if (/^LAN_ORIGIN=.*$/m.test(vars)) {
    vars = vars.replace(/^LAN_ORIGIN=.*$/m, `LAN_ORIGIN="${lanOrigin}"`);
  } else {
    vars = vars.trimEnd() + `\nLAN_ORIGIN="${lanOrigin}"\n`;
  }
}
fs.writeFileSync('.dev.vars', vars);

console.log('');
console.log('──────────────────────────────────────────────────────');
console.log('  Suncoast Signages — local server');
console.log('');
console.log(`  Admin (this computer):  http://localhost:${PORT}`);
if (lanIp) {
  console.log(`  TVs / phones on Wi-Fi:  http://${lanIp}:${PORT}/play/<screen-id>`);
}
console.log('──────────────────────────────────────────────────────');
console.log('');
