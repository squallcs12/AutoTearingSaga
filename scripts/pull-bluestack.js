const { execSync } = require('child_process');

const remote = '/sdcard/Android/data/com.github.stenzek.duckstation/files/savestates/SLPS-03177_0.sav';
const local = 'SLPS-03177_0.sav';
const device = 'localhost:5555';

execSync(`adb -s ${device} pull ${remote} ${local}`, {
  stdio: 'inherit',
  env: { ...process.env, MSYS_NO_PATHCONV: '1' },
});
console.log(`Pulled ${remote} -> ${local}`);
