const { execSync } = require('child_process');
const { importSave } = require('./transfer-save');
const { getTargetDevice } = require('../adb-device');

const device = getTargetDevice();

describe('Push emulator', () => {
  it('pushes save to emulator', async () => {
    execSync(`adb -s ${device} shell mkdir -p /sdcard/Download/duckstation/savestates`, { stdio: 'inherit' });
    execSync(
      `adb -s ${device} push SLPS-03177_0.sav /sdcard/Download/duckstation/savestates/SLPS-03177_0.sav`,
      { stdio: 'inherit' }
    );
    await importSave();
    console.log(`Pushed SLPS-03177_0.sav to ${device}`);
  });
});