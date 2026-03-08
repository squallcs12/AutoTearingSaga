const { waitLevelUp } = require('../scene-detection/check-level');
const { sleep, sendKey, takeScreenshot, adbMove } = require('./common');

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
  async moveUp()        { adbMove('up'); }
  async moveDown()      { adbMove('down'); }
  async moveLeft()      { adbMove('left'); }
  async moveRight()     { adbMove('right'); }
  async moveUpLeft()    { adbMove('up-left'); }
  async moveUpRight()   { adbMove('up-right'); }
  async moveDownLeft()  { adbMove('down-left'); }
  async moveDownRight() { adbMove('down-right'); }

  async pressO()        { sendKey(KEYS.circle); }
  async pressX()        { sendKey(KEYS.cross); }
  async pressSquare()   { sendKey(KEYS.square); }
  async pressTriangle() { sendKey(KEYS.triangle); }

  async loadGameAndLoadQuickSave() {
    await this.reload();
  }

  async reload(index = 0) {
    sendKey(index === 0 ? KEYS.quickLoad : KEYS[`loadSlot${index}`]);
    await sleep(500);
  }

  async quicksave(index = 0) {
    sendKey(index === 0 ? KEYS.quickSave : KEYS[`saveSlot${index}`]);
    await sleep(500);
  }

  async spamO() {
    for (let i = 0; i < 4; i++) {
      await this.pressO();
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
        case 'reload':  await this.reload(0); break;
        case 'reload1': await this.reload(1); break;
        case 'reload2': await this.reload(2); break;
        case 'reload3': await this.reload(3); break;
        case 'load-game': await this.loadGameAndLoadQuickSave(); break;
        default: break;
      }
    }
  }
}

module.exports = new PlayingBluestack();
