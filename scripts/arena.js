const { execSync } = require('child_process');

const N = parseInt(process.argv[2] || '4', 10);

for (let i = 0; i < N; i++) {
  try {
    execSync('npx wdio --spec android/specs/arena.e2e.js', { stdio: ['ignore', 'ignore', 'inherit'] });
    execSync('node scripts/notify.js success', { stdio: 'inherit' });
    process.exit(0);
  } catch {}
}

execSync('node scripts/notify.js fail', { stdio: 'inherit' });
