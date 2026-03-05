const { execSync } = require('child_process');

const TIERS = ['good', 'avg', 'bad'];
const arg = process.argv[2];
const tierOverride = TIERS.includes(arg) ? arg : null;
const N = parseInt(tierOverride ? (process.argv[3] || '4') : (arg || '4'), 10);
const env = tierOverride ? { ...process.env, TIER_OVERRIDE: tierOverride } : process.env;

for (let i = 0; i < N; i++) {
  try {
    execSync('npx wdio --spec android/specs/levelup.e2e.js', { stdio: ['ignore', 'ignore', 'inherit'], env });
    execSync('node scripts/notify.js success', { stdio: 'inherit' });
    process.exit(0);
  } catch {}
}

execSync('node scripts/notify.js fail', { stdio: 'inherit' });
