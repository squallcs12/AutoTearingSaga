// Shared perform() DSL parser for all playing pages (desktop, bluestack, android).
// Subclasses must implement: moveUp/Down/Left/Right, moveUpLeft/UpRight/DownLeft/DownRight,
// pressO/X/Square/Triangle, press2O, reload(index), quicksave(index), spamO(), finish(),
// finishBoss(), takePic(), waitLevelUp(), loadGameAndLoadQuickSave()
// Each method should include its own delay (sleep) as needed.

const { sleep } = require('../utils');
const { isAttackMenu } = require('../scene-detection/check-attack');

class AttackMenuNotFound extends Error {
  constructor() { super('Attack menu not detected after pressing O'); this.name = 'AttackMenuNotFound'; }
}

function addPerform(cls) {
  cls.prototype.perform = async function (step) {
    console.log(`[perform] ${step}`);
    const parts = step.split(' ');
    const count = parts[1] ? parseInt(parts[1], 10) : 1;

    for (let i = 0; i < count; i++) {
      switch (parts[0]) {
        case 'left':       await this.moveLeft();      break;
        case 'right':      await this.moveRight();     break;
        case 'up':         await this.moveUp();        break;
        case 'down':       await this.moveDown();      break;
        case 'up-left':    await this.moveUpLeft();    break;
        case 'up-right':   await this.moveUpRight();   break;
        case 'down-left':  await this.moveDownLeft();  break;
        case 'down-right': await this.moveDownRight(); break;
        case 'X':          await this.pressX();        break;
        case 'O':          await this.pressO();        break;
        case '2O':         await this.press2O();       break;
        case 'square':     await this.pressSquare();   break;
        case 'triangle':   await this.pressTriangle(); break;
        case 'save':       await this.quicksave(0);    break;
        case 'save1':      await this.quicksave(1);    break;
        case 'save2':      await this.quicksave(2);    break;
        case 'save3':      await this.quicksave(3);    break;
        case 'confirm':       await this.spamO();      break;
        case 'boss':          await this.finishBoss(); break;
        case 'finish':        await this.finish();     break;
        case 'wait':          await sleep(1000);       break;
        case 'pic':           await this.takePic();    break;
        case 'wait-level-up': await this.waitLevelUp(); break;
        case 'attack':
          await this.pressO();
          const screenshotPath = await this.saveScreenshot('current.png');
          if (!await isAttackMenu(screenshotPath)) {
            throw new AttackMenuNotFound();
          }
          await this.pressO();
          break;
        case 'reload':  await this.reload(0); break;
        case 'reload1': await this.reload(1); break;
        case 'reload2': await this.reload(2); break;
        case 'reload3': await this.reload(3); break;
        case 'load-game': await this.loadGameAndLoadQuickSave(); break;
        default: break;
      }
    }
  };
}

module.exports = { addPerform, AttackMenuNotFound };
