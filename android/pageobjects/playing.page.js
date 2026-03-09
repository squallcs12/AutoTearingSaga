const { waitLevelUp } = require('../../scene-detection/check-level');
const { sleep } = require('../specs/common');
const { debugCopyScreenshot } = require('../../utils');
const path = require('path');
const Page = require('./page');
const { addPerform } = require('../../shared/perform');



/**
 * sub page containing specific selectors and methods for a specific page
 */
class PlayingPage extends Page {
  /**
   * define selectors using getter methods
   */
  get buttonX() {
    return $('id=com.github.stenzek.duckstation:id/controller_button_cross');
  }

  get buttonO() {
    return $('id=com.github.stenzek.duckstation:id/controller_button_circle');
  }

  get buttonSquare() {
    return $('id=com.github.stenzek.duckstation:id/controller_button_square');
  }

  get buttonTriangle() {
    return $('id=com.github.stenzek.duckstation:id/controller_button_triangle');
  }

  get pad() {
    return $('id=com.github.stenzek.duckstation:id/controller_axis_left')
  }

  get buttonPause () {
    return $('id=com.github.stenzek.duckstation:id/controller_button_pause')
  }

  get gameTitle() {
    return $('android=new UiSelector().textContains("TearRingSaga")');
  }

  get buttonLoadStateFromList() {
    return $('android=new UiSelector().text("Load State")');
  }

  get buttonLoadState () {
    return $('/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/androidx.recyclerview.widget.RecyclerView/android.widget.LinearLayout[1]/android.widget.RelativeLayout')
  }

  get buttonSaveState () {
    return $('/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/androidx.recyclerview.widget.RecyclerView/android.widget.LinearLayout[2]/android.widget.RelativeLayout')
  }

  get buttonQuickSave () {
    return $('/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/androidx.appcompat.widget.LinearLayoutCompat/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.ListView/android.widget.RelativeLayout[1]')
  }

  get buttonSaveSlot1 () {
    return $('/hierarchy/android.widget.FrameLayout/android.widget.LinearLayout/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.FrameLayout/androidx.appcompat.widget.LinearLayoutCompat/android.widget.FrameLayout/android.widget.FrameLayout/android.widget.ListView/android.widget.RelativeLayout[2]')
  }

  async moveUp() {
    await this.pad.touchAction({action: 'tap', x: 168, y:30});
    await sleep(300);
  }

  async moveUpLeft() {
    await this.pad.touchAction({action: 'tap', x: 30, y:30});
    await sleep(300);
  }

  async moveUpRight() {
    await this.pad.touchAction({action: 'tap', x: 306, y:30});
    await sleep(300);
  }

  async moveDown() {
    await this.pad.touchAction({action: 'tap', x: 168, y:280});
    await sleep(300);
  }

  async moveDownLeft() {
    await this.pad.touchAction({action: 'tap', x: 30, y:280});
    await sleep(300);
  }
  async moveDownRight() {
    await this.pad.touchAction({action: 'tap', x: 328, y:280});
    await sleep(300);
  }

  async moveLeft() {
    await this.pad.touchAction({action: 'tap', x: 30, y:168});
    await sleep(300);
  }

  async moveRight() {
    await this.pad.touchAction({action: 'tap', x: 328, y:168});
    await sleep(300);
  }

  async pressO() {
    await this.buttonO.touchAction({action: 'tap', x: 10, y:10});
    await sleep(1000);
  }

  async pressX() {
    await this.buttonX.touchAction({action: 'tap', x: 10, y:10});
    await sleep(1000);
  }

  async pressSquare() {
    await sleep(500);
  }

  async pressTriangle() {
    await sleep(500);
  }


  async loadGameAndLoadQuickSave() {
    await this.gameTitle.click();
    await $('android=new UiSelector().text("Clean Boot")').click();
    await sleep(5000);
    await this.reload();
  }

  async reload(index = 0) {
    await this.buttonPause.touchAction({action: 'tap', x: 10, y: 10});
    await sleep(500);
    await this.buttonLoadState.touchAction({action: 'tap', x: 10, y: 10});
    await sleep(500);
    if (index === 0) {
      await $('android=new UiSelector().text("Quick Save")').touchAction({action: 'tap', x: 10, y: 10});
    } else {
      await $(`android=new UiSelector().text("Save Slot ${index}")`).touchAction({action: 'tap', x: 10, y: 10});
    }
    await sleep(500);
  }

  async quicksave(index = 0) {
    await this.buttonPause.touchAction({action: 'tap', x: 10, y: 10});
    await sleep(500);
    await this.buttonSaveState.touchAction({action: 'tap', x: 10, y: 10});
    await sleep(500);
    if (index === 0) {
      await $('android=new UiSelector().text("Quick Save")').touchAction({action: 'tap', x: 10, y: 10});
    } else{
      await $(`android=new UiSelector().text("Save Slot ${index}")`).touchAction({action: 'tap', x: 10, y: 10});
    }
    await sleep(1500);
  }

  async press2O() {
    await this.buttonO.touchAction({action: 'tap', x: 10, y:10});
    await sleep(200);
    await this.buttonO.touchAction({action: 'tap', x: 10, y:10});
    await sleep(500);
  }

  async waitNotificationHide() {
    await sleep(2000);
  }

  async spamO () {
    for (let i = 0; i < 8; i++) {
      await this.buttonO.touchAction({action: 'tap', x: 10, y:10});
    }
  }
  async finish() {
  }
  async finishBoss () {
  }

  async saveScreenshot(filename) {
    const destPath = path.join('tmp', filename);
    await driver.saveScreenshot(destPath);
    debugCopyScreenshot(destPath);
  }

  async takePic() {
    await this.saveScreenshot('current.png');
    await sleep(400);
  }

  async waitLevelUp() {
    this.lastLevelUpResult = await waitLevelUp(this, { sleepMs: 500 });
    return this.lastLevelUpResult;
  }

}

addPerform(PlayingPage);

module.exports = new PlayingPage();
