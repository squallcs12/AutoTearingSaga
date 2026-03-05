const { execSync } = require('child_process');

describe('Push emulator', () => {
  it('pushes save to emulator', async () => {
    execSync('adb -s emulator-5554 shell mkdir -p /sdcard/Download/duckstation/savestates', { stdio: 'inherit' });
    execSync(
      'adb -s emulator-5554 push SLPS-03177_0.sav /sdcard/Download/duckstation/savestates/SLPS-03177_0.sav',
      { stdio: 'inherit' }
    );
    await $('~Navigate up').click();
    await $('android=new UiSelector().text("Transfer Data")').click();
    await $('android=new UiSelector().text("Folder")').click();
    await $('android=new UiSelector().text("Import")').click();
    await $('android=new UiSelector().text("USE THIS FOLDER")').click();
    await $('android=new UiSelector().text("ALLOW")').click();
    await $('android=new UiSelector().text("Import")').click();
    await $('id=com.github.stenzek.duckstation:id/checkBox').click();
    await $('android=new UiSelector().text("Overwrite")').click();
    await browser.pause(10000);
    console.log('Pushed SLPS-03177_0.sav to emulator');
  });
});