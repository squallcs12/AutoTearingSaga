const { execSync } = require('child_process');

const target = process.argv[2];

if (target === 'bluestack') {
  require('./push-bluestack');
} else {
  const env = { ...process.env };
  if (target) env.TARGET_DEVICE = target;
  execSync('npx wdio --spec android/specs/push-emulator.e2e.js', { stdio: 'inherit', env });
}
