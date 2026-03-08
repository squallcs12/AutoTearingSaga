const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const verbose = args.includes('-v');
const noFallback = args.includes('--fixed-tier');
const skipIdx = args.indexOf('--skip');
const skipCount = skipIdx !== -1 ? args[skipIdx + 1] : '0';
const nameIdx = args.indexOf('-name');
const nameOverride = nameIdx !== -1 ? args[nameIdx + 1] : null;
const positional = args.filter((a, i) => a !== '-v' && a !== '--skip' && a !== '-name' && a !== '--fixed-tier' && (skipIdx === -1 || i !== skipIdx + 1) && (nameIdx === -1 || i !== nameIdx + 1));
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
    execSync('npx wdio --spec android/specs/arena.e2e.js', { stdio, env: { ...process.env, SKIP_COUNT: skipCount, ...(nameOverride ? { CHAR_NAME: nameOverride } : {}), ...(noFallback ? { NO_FALLBACK: '1' } : {}) } });
    if (logFd) fs.closeSync(logFd);
    execSync('node scripts/notify.js success', { stdio: 'inherit' });
    process.exit(0);
  } catch {}
}

if (logFd) fs.closeSync(logFd);
execSync('node scripts/notify.js fail', { stdio: 'inherit' });
