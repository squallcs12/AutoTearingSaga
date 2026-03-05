const { execSync } = require('child_process');

describe('Pull emulator', () => {
  it('pulls save from emulator', async () => {
    await $('~Navigate up').click();
    await $('android=new UiSelector().text("Transfer Data")').click();
    await $('android=new UiSelector().text("Folder")').click();
    await $('android=new UiSelector().text("Export")').click();
    await $('android=new UiSelector().text("USE THIS FOLDER")').click();
    await $('android=new UiSelector().text("ALLOW")').click();
    await $('android=new UiSelector().text("Export")').click();
    await $('id=com.github.stenzek.duckstation:id/checkBox').click();
    await $('android=new UiSelector().text("Overwrite")').click();
    await browser.pause(10000);
    execSync(
      'adb -s emulator-5554 pull /sdcard/Download/duckstation/savestates/SLPS-03177_0.sav SLPS-03177_0.sav',
      { stdio: 'inherit' }
    );
    console.log('Pulled SLPS-03177_0.sav from emulator');
  });
});
