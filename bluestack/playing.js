const { waitLevelUp } = require('../scene-detection/check-level');
const { sleep, sendKey, takeScreenshot, adbMove } = require('./common');
const { addPerform } = require('../shared/perform');

const KEYS = {
  circle:    'c',
  cross:     'x',
  square:    'z',
  triangle:  's',
  quickSave: 'f4',
  quickLoad: 'shift+f4',
  saveSlot1: 'f1', loadSlot1: 'shift+f1',
  saveSlot2: 'f2', loadSlot2: 'shift+f2',
  saveSlot3: 'f3', loadSlot3: 'shift+f3',
};

class PlayingBluestack {
  async moveUp()        { adbMove('up');         await sleep(1000); }
  async moveDown()      { adbMove('down');       await sleep(1000); }
  async moveLeft()      { adbMove('left');       await sleep(1000); }
  async moveRight()     { adbMove('right');      await sleep(1000); }
  async moveUpLeft()    { adbMove('up-left');    await sleep(1000); }
  async moveUpRight()   { adbMove('up-right');   await sleep(1000); }
  async moveDownLeft()  { adbMove('down-left');  await sleep(1000); }
  async moveDownRight() { adbMove('down-right'); await sleep(1000); }

  async pressO()        { sendKey(KEYS.circle);   await sleep(1000); }
  async pressX()        { sendKey(KEYS.cross);    await sleep(1000); }
  async pressSquare()   { sendKey(KEYS.square);   await sleep(500); }
  async pressTriangle() { sendKey(KEYS.triangle); await sleep(500); }

  async loadGameAndLoadQuickSave() {
    await this.reload();
  }

  async reload(index = 0) {
    sendKey(index === 0 ? KEYS.quickLoad : KEYS[`loadSlot${index}`]);
    await sleep(500);
  }

  async quicksave(index = 0) {
    sendKey(index === 0 ? KEYS.quickSave : KEYS[`saveSlot${index}`]);
    await sleep(1500);
  }

  async press2O() {
    sendKey(KEYS.circle); await sleep(200);
    sendKey(KEYS.circle); await sleep(500);
  }

  async spamO() {
    for (let i = 0; i < 4; i++) {
      sendKey(KEYS.circle);
      await sleep(1000);
    }
  }

  async finish()     { await sleep(6000); }
  async finishBoss() { await sleep(12000); }

  async saveScreenshot(filename) {
    await takeScreenshot(filename);
  }

  async takePic() {
    await takeScreenshot('current.png');
    await sleep(400);
  }

  async waitLevelUp() {
    this.lastLevelUpResult = await waitLevelUp(this, { sleepMs: 1000 });
    return this.lastLevelUpResult;
  }

  async waitNotificationHide() {
  }

}

addPerform(PlayingBluestack);

module.exports = new PlayingBluestack();
