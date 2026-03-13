const fs = require('fs');
const { waitLevelUp } = require('../scene-detection/check-level');
const { sleep, sendKey, takeScreenshot } = require('./common');
const { addPerform } = require('../shared/perform');
const { extractGameArea } = require('../game-logic/identify-character');

// Keyboard mappings — update these to match your DuckStation bindings
const KEYS = {
  circle:    'c',       // PS1 Circle (O)
  cross:     'x',       // PS1 Cross (X)
  square:    'z',       // PS1 Square  — UPDATE if needed
  triangle:  's',       // PS1 Triangle — UPDATE if needed
  up:        'up',
  down:      'down',
  left:      'left',
  right:     'right',
  quickSave: 'f4',        // user: F4 = quick save
  quickLoad: 'shift+f4',  // user: Shift+F4 = quick load
  // Save slots: F1/F2/F3 = save, Shift+F1/F2/F3 = load
  saveSlot1: 'f1', loadSlot1: 'shift+f1',
  saveSlot2: 'f2', loadSlot2: 'shift+f2',
  saveSlot3: 'f3', loadSlot3: 'shift+f3',
};

class PlayingDesktop {
  async moveUp()        { sendKey(KEYS.up);   await sleep(1000); }
  async moveDown()      { sendKey(KEYS.down); await sleep(1000); }
  async moveLeft()      { sendKey(KEYS.left); await sleep(1000); }
  async moveRight()     { sendKey(KEYS.right); await sleep(1000); }
  async moveUpLeft()    { sendKey(KEYS.up);   await sleep(1000); }  // approximate diagonal
  async moveUpRight()   { sendKey(KEYS.up);   await sleep(1000); }
  async moveDownLeft()  { sendKey(KEYS.down); await sleep(1000); }
  async moveDownRight() { sendKey(KEYS.down); await sleep(1000); }

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
    for (let i = 0; i < 8; i++) {
      sendKey(KEYS.circle);
    }
  }

  async finish()     { await sleep(6000); }
  async finishBoss() { await sleep(12000); }

  async saveScreenshot(filename) {
    const destPath = await takeScreenshot(filename);
    const buf = await (await extractGameArea(destPath)).png().toBuffer();
    fs.writeFileSync(destPath, buf);
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

addPerform(PlayingDesktop);

module.exports = new PlayingDesktop();
