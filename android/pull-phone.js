const { exec } = require('child_process');
const { getPhoneDevice } = require('./adb-device');

const device = getPhoneDevice();
console.log(`Using device: ${device}`);
exec(`adb -s ${device} pull storage/self/primary/duckstation/savestates/SLPS-03177_0.sav /home/bang/.local/share/duckstation/savestates/SLPS-03177_1.sav`, (err) => {
  if (err) console.log(err);
  else console.log('Sync from phone to laptop');
});
