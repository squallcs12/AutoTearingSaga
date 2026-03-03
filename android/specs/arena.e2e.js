const { arenaLoop } = require('../../game-logic/arena-loop');
const { checkLevelUpgrade } = require('../../check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { sleep } = require('./common');
const { goodCondition, levelsToGain } = require('./levelup');

describe('Run auto', () => {
  it('arena level up', async () => {
    await arenaLoop(PlayingPage, sleep, (path) => driver.saveScreenshot(path), checkLevelUpgrade, goodCondition, levelsToGain);
  }, 9999999);
});
