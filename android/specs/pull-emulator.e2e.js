const { execSync } = require('child_process');
const { exportSave } = require('./transfer-save');
const { getTargetDevice } = require('../adb-device');

const device = getTargetDevice();

describe('Pull emulator', () => {
  it('pulls save from emulator', async () => {
    await exportSave();
    execSync(
      `adb -s ${device} pull /sdcard/Download/duckstation/savestates/SLPS-03177_0.sav SLPS-03177_0.sav`,
      { stdio: 'inherit' }
    );
    console.log(`Pulled SLPS-03177_0.sav from ${device}`);
  });
});
