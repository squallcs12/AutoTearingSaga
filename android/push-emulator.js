const { execSync } = require('child_process');

execSync(
  'adb -s emulator-5554 push SLPS-03177_0.sav /storage/emulated/0/Download/Duckstation/savestates/SLPS-03177_0.sav',
  { stdio: 'inherit' }
);
console.log('Pushed SLPS-03177_0.sav to emulator');