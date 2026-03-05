const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const N = parseInt(process.argv[2] || '4', 10);

const logsDir = path.join(__dirname, '..', 'logs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logsDir, `arena-${timestamp}.log`);
const logFd = fs.openSync(logFile, 'a');

for (let i = 0; i < N; i++) {
  try {
    execSync('npx wdio --spec android/specs/arena.e2e.js', { stdio: ['ignore', logFd, logFd] });
    fs.closeSync(logFd);
    execSync('node scripts/notify.js success', { stdio: 'inherit' });
    process.exit(0);
  } catch {}
}

fs.closeSync(logFd);
execSync('node scripts/notify.js fail', { stdio: 'inherit' });
