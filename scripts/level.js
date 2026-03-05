const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TIERS = ['good', 'avg', 'bad'];
const arg = process.argv[2];
const tierOverride = TIERS.includes(arg) ? arg : null;
const N = parseInt(tierOverride ? (process.argv[3] || '4') : (arg || '4'), 10);
const env = tierOverride ? { ...process.env, TIER_OVERRIDE: tierOverride } : process.env;

const logsDir = path.join(__dirname, '..', 'logs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logsDir, `run-${timestamp}.log`);
const logFd = fs.openSync(logFile, 'a');

for (let i = 0; i < N; i++) {
  try {
    execSync('npx wdio --spec android/specs/levelup.e2e.js', { stdio: ['ignore', logFd, logFd], env });
    fs.closeSync(logFd);
    execSync('node scripts/notify.js success', { stdio: 'inherit' });
    process.exit(0);
  } catch {}
}

fs.closeSync(logFd);
execSync('node scripts/notify.js fail', { stdio: 'inherit' });
