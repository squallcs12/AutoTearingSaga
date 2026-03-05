const { execSync } = require('child_process');
const { exportSave } = require('./transfer-save');

describe('Pull emulator', () => {
  it('pulls save from emulator', async () => {
    await exportSave();
    execSync(
      'adb -s emulator-5554 pull /sdcard/Download/duckstation/savestates/SLPS-03177_0.sav SLPS-03177_0.sav',
      { stdio: 'inherit' }
    );
    console.log('Pulled SLPS-03177_0.sav from emulator');
  });
});
