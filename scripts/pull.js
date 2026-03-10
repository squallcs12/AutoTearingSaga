const { execSync } = require('child_process');

const target = process.argv[2];

if (target === 'desktop') {
  require('./pull-desktop');
} else {
  const env = { ...process.env };
  if (target) env.TARGET_DEVICE = target;
  execSync('npx wdio --spec android/specs/pull-emulator.e2e.js', { stdio: 'inherit', env });
}
