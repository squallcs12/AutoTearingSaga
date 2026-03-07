const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TIERS = ['good', 'avg', 'bad'];
const args = process.argv.slice(2);
const verbose = args.includes('-v');
const positional = args.filter(a => a !== '-v');
const tierOverride = TIERS.includes(positional[0]) ? positional[0] : null;
const N = parseInt(tierOverride ? (positional[1] || '4') : (positional[0] || '4'), 10);
const env = tierOverride ? { ...process.env, TIER_OVERRIDE: tierOverride } : process.env;

let logFd;
if (!verbose) {
  const logsDir = path.join(__dirname, '..', 'logs');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(logsDir, `run-${timestamp}.log`);
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
