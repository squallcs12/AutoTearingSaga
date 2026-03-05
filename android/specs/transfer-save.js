const navigateToTransferFolder = async () => {
  await $('~Navigate up').click();
  await $('android=new UiSelector().text("Transfer Data")').click();
  await $('android=new UiSelector().text("Folder")').click();
};

const confirmFolderAccess = async () => {
  await $('android=new UiSelector().text("USE THIS FOLDER")').click();
  await $('android=new UiSelector().text("ALLOW")').click();
};

const exportSave = async () => {
  await navigateToTransferFolder();
  await $('android=new UiSelector().text("Export")').click();
  await confirmFolderAccess();
  await $('android=new UiSelector().text("Export")').click();
  await $('id=com.github.stenzek.duckstation:id/checkBox').click();
  await $('android=new UiSelector().text("Overwrite")').click();
  await browser.pause(10000);
};

const importSave = async () => {
  await navigateToTransferFolder();
  await $('android=new UiSelector().text("Import")').click();
  await confirmFolderAccess();
  await $('android=new UiSelector().text("Import")').click();
  await $('id=com.github.stenzek.duckstation:id/checkBox').click();
  await $('android=new UiSelector().text("Overwrite")').click();
  await browser.pause(10000);
};

module.exports = { exportSave, importSave };