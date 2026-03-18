const fs = require('fs');
const { waitLevelUp } = require('../scene-detection/check-level');
const { sleep, sendKey, takeScreenshot } = require('./common');
const { addPerform } = require('../shared/perform');
const { extractGameArea } = require('../game-logic/identify-character');

const KEYS = {
  circle:    'c',
  cross:     'x',
  square:    'z',
  triangle:  's',
  up:        'up',
  down:      'down',
  left:      'left',
  right:     'right',
  quickSave: 'f12',
  quickLoad: 'shift+f12',
  saveSlot1: 'f1', loadSlot1: 'shift+f1',
  saveSlot2: 'f2', loadSlot2: 'shift+f2',
  saveSlot3: 'f3', loadSlot3: 'shift+f3',
  saveSlot4: 'f4', loadSlot4: 'shift+f4',
  saveSlot5: 'f5', loadSlot5: 'shift+f5',
  saveSlot6: 'f6', loadSlot6: 'shift+f6',
  saveSlot7: 'f7', loadSlot7: 'shift+f7',
  saveSlot8: 'f8', loadSlot8: 'shift+f8',
  saveSlot9: 'f9', loadSlot9: 'shift+f9',
  saveSlot10: 'f10', loadSlot10: 'shift+f10',
};

class PlayingBluestack {
  async moveUp()        { sendKey(KEYS.up);    await sleep(1000); }
  async moveDown()      { sendKey(KEYS.down);  await sleep(1000); }
  async moveLeft()      { sendKey(KEYS.left);  await sleep(1000); }
  async moveRight()     { sendKey(KEYS.right); await sleep(1000); }
  async moveUpLeft()    { sendKey(KEYS.up);    await sleep(1000); }
  async moveUpRight()   { sendKey(KEYS.up);    await sleep(1000); }
  async moveDownLeft()  { sendKey(KEYS.down);  await sleep(1000); }
  async moveDownRight() { sendKey(KEYS.down);  await sleep(1000); }

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

  async finish()     { }
  async finishBoss() {  }

  async saveScreenshot(filename) {
    await takeScreenshot(filename);
    const destPath = require('path').join('tmp', filename);
    const buf = await (await extractGameArea(destPath)).png().toBuffer();
    fs.writeFileSync(destPath, buf);
    return destPath;
  }

  async takePic() {
    await this.saveScreenshot('current.png');
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
