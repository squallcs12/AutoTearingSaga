const speed = parseFloat(process.env.EMULATOR_SPEED || 1);
const sleep = (ms) => new Promise(r => setTimeout(r, ms / speed));

function debugCopyScreenshot(destPath) {
  if (!process.env.__DEBUG__) return;
  const fs = require('fs');
  const path = require('path');
  const now = new Date();
  const pad = (n, d = 2) => String(n).padStart(d, '0');
  const prefix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}_`;
  const debugDir = path.join(path.dirname(destPath), 'debug');
  fs.mkdirSync(debugDir, { recursive: true });
  fs.copyFileSync(destPath, path.join(debugDir, prefix + path.basename(destPath)));
}

module.exports = { sleep, debugCopyScreenshot };