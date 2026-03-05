const { execSync } = require('child_process');
const { importSave } = require('./transfer-save');

describe('Push emulator', () => {
  it('pushes save to emulator', async () => {
    execSync('adb -s emulator-5554 shell mkdir -p /sdcard/Download/duckstation/savestates', { stdio: 'inherit' });
    execSync(
      'adb -s emulator-5554 push SLPS-03177_0.sav /sdcard/Download/duckstation/savestates/SLPS-03177_0.sav',
      { stdio: 'inherit' }
    );
    await importSave();
    console.log('Pushed SLPS-03177_0.sav to emulator');
  });
});