const { execSync } = require('child_process');

const local = 'SLPS-03177_0.sav';
const remote = '/sdcard/Android/data/com.github.stenzek.duckstation/files/savestates/SLPS-03177_0.sav';
const device = '127.0.0.1:5555';

execSync(`adb -s ${device} push ${local} ${remote}`, {
  stdio: 'inherit',
  env: { ...process.env, MSYS_NO_PATHCONV: '1' },
});
console.log(`Pushed ${local} -> ${remote}`);
