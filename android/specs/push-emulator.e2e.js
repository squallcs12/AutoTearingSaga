const { execSync } = require('child_process');

describe('Push emulator', () => {
  it('pushes save to emulator', () => {
    execSync('adb -s emulator-5554 shell mkdir -p /sdcard/Download/duckstation/savestates', { stdio: 'inherit' });
    execSync(
      'adb -s emulator-5554 push SLPS-03177_0.sav /sdcard/Download/duckstation/savestates/SLPS-03177_0.sav',
      { stdio: 'inherit' }
    );
    console.log('Pushed SLPS-03177_0.sav to emulator');
  });
});
