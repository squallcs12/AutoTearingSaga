const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TIERS = ['S', 'A', 'B', 'C', 'D'];
const args = process.argv.slice(2);
const verbose = args.includes('-v');
const positional = args.filter(a => a !== '-v');
const tierOverride = TIERS.includes(positional[0]) ? positional[0] : null;
const N = parseInt(tierOverride ? (positional[1] || '4') : (positional[0] || '4'), 10);
const env = { ...process.env, ...(tierOverride ? { TIER_OVERRIDE: tierOverride } : {}) };

let logFd;
if (!verbose) {
  const logsDir = path.join(__dirname, '..', 'logs');
  const logFileName = process.env.__DEBUG__
    ? `run-${new Date().toISOString().replace(/[:.]/g, '-')}.log`
    : 'run.log';
  const logFile = path.join(logsDir, logFileName);
  logFd = fs.openSync(logFile, 'a');
}
const stdio = verbose ? 'inherit' : ['ignore', logFd, logFd];

for (let i = 0; i < N; i++) {
  try {
    execSync('node bluestack/levelup.js', { stdio, env });
    if (logFd) fs.closeSync(logFd);
    execSync('node scripts/notify.js success', { stdio: 'inherit' });
    process.exit(0);
  } catch {}
}

if (logFd) fs.closeSync(logFd);
execSync('node scripts/notify.js fail', { stdio: 'inherit' });
