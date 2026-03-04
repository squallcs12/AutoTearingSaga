const { execSync } = require('child_process');

execSync(
  'adb -s emulator-5554 pull /storage/emulated/0/Download/Duckstation/savestates/SLPS-03177_0.sav SLPS-03177_0.sav',
  { stdio: 'inherit' }
);
console.log('Pulled SLPS-03177_0.sav from emulator');