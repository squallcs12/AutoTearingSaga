const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const positional = args.filter(a => a !== '-v');
const N = parseInt(positional[0] || '4', 10);

let logFd;
if (!verbose) {
  const logsDir = path.join(__dirname, '..', 'logs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logsDir, `arena-${timestamp}.log`);
  logFd = fs.openSync(logFile, 'a');
}
const stdio = verbose ? 'inherit' : ['ignore', logFd, logFd];

for (let i = 0; i < N; i++) {
  try {
    execSync('npx wdio --spec android/specs/arena.e2e.js', { stdio });
    if (logFd) fs.closeSync(logFd);
    execSync('node scripts/notify.js success', { stdio: 'inherit' });
    process.exit(0);
  } catch {}
}

if (logFd) fs.closeSync(logFd);
execSync('node scripts/notify.js fail', { stdio: 'inherit' });
