const { exec } = require('child_process');
const { getPhoneDevice } = require('./adb-device');

const device = getPhoneDevice();
console.log(`Using device: ${device}`);
exec(`adb -s emulator-5554 pull storage/self/primary/duckstation/savestates/SLPS-03177_1.sav /tmp/`, (err1) => {
  exec(`adb -s ${device} push /tmp/SLPS-03177_1.sav storage/self/primary/duckstation/savestates/SLPS-03177_0.sav`, (err2) => {
    if (err1 || err2) console.log(err1, err2);
    else console.log('Sync from emulator to phone');
  });
});
