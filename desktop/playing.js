const sharp = require('sharp');
const { checkIsLevelUp, extractLevelUpPanel } = require('../check-level');
const { getScale } = require('../calib');
const { sleep, sendKey, takeScreenshot } = require('./common');

sharp.cache(false);

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
  async moveUp()        { sendKey(KEYS.up); }
  async moveDown()      { sendKey(KEYS.down); }
  async moveLeft()      { sendKey(KEYS.left); }
  async moveRight()     { sendKey(KEYS.right); }
  async moveUpLeft()    { sendKey(KEYS.up); }    // approximate diagonal
  async moveUpRight()   { sendKey(KEYS.up); }
  async moveDownLeft()  { sendKey(KEYS.down); }
  async moveDownRight() { sendKey(KEYS.down); }

  async pressO()        { sendKey(KEYS.circle); }
  async pressX()        { sendKey(KEYS.cross); }
  async pressSquare()   { sendKey(KEYS.square); }
  async pressTriangle() { sendKey(KEYS.triangle); }

  async reload(index = 0) {
    sendKey(index === 0 ? KEYS.quickLoad : KEYS[`loadSlot${index}`]);
    await sleep(500);
  }

  async quicksave(index = 0) {
    sendKey(index === 0 ? KEYS.quickSave : KEYS[`saveSlot${index}`]);
    await sleep(500);
  }

  async spamO() {
    for (let i = 0; i < 8; i++) {
      await this.pressO();
    }
  }

  async finish()     { await sleep(6000); }
  async finishBoss() { await sleep(12000); await this.spamO(); await sleep(6000); }

  async takePic() {
    await takeScreenshot('current.png');
    await sleep(400);
  }

  async waitLevelUp() {
    for (let i = 0; i < 30; i++) {
      this.pressO();
      await takeScreenshot('current.png');
      const image = sharp('current.png');
      const { width } = await image.metadata();
      const s = getScale(width);
      const cropImage = await extractLevelUpPanel(image, s);
      if (await checkIsLevelUp(cropImage)) return true;
      await sleep(1000);
    }
    return false;
  }

  async perform(step) {
    console.log(`[perform] ${step}`);
    const parts = step.split(' ');
    const count = parts[1] ? parseInt(parts[1], 10) : 1;

    for (let i = 0; i < count; i++) {
      switch (parts[0]) {
        case 'left':       await this.moveLeft();  await sleep(1000); break;
        case 'right':      await this.moveRight(); await sleep(1000); break;
        case 'up':         await this.moveUp();    await sleep(1000); break;
        case 'down':       await this.moveDown();  await sleep(1000); break;
        case 'up-left':    await this.moveUpLeft();    await sleep(1000); break;
        case 'up-right':   await this.moveUpRight();   await sleep(1000); break;
        case 'down-left':  await this.moveDownLeft();  await sleep(1000); break;
        case 'down-right': await this.moveDownRight(); await sleep(1000); break;
        case 'X':          await this.pressX();    await sleep(1000); break;
        case 'O':          await this.pressO();    await sleep(1000); break;
        case '2O':
          await this.pressO(); await sleep(200);
          await this.pressO(); await sleep(500);
          break;
        case 'square':   await this.pressSquare();   await sleep(500); break;
        case 'triangle': await this.pressTriangle(); await sleep(500); break;
        case 'save':  await this.quicksave(0); await sleep(1000); break;
        case 'save1': await this.quicksave(1); await sleep(1000); break;
        case 'save2': await this.quicksave(2); await sleep(1000); break;
        case 'save3': await this.quicksave(3); await sleep(1000); break;
        case 'confirm':      await this.spamO();      break;
        case 'boss':         await this.finishBoss(); break;
        case 'finish':       await this.finish();     break;
        case 'wait':         await sleep(1000);       break;
        case 'pic':          await this.takePic();    break;
        case 'wait-level-up': await this.waitLevelUp(); break;
        default: break;
      }
    }
  }
}

module.exports = new PlayingDesktop();
