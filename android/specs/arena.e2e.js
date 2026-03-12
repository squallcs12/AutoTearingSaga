const { arenaLoop } = require('../../game-logic/arena-loop');
const { checkLevelUpgrade } = require('../../scene-detection/check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { levelsToGain } = require('../../config');


describe('Run auto', () => {
  it('arena level up', async () => {
    await arenaLoop(PlayingPage, (filename) => PlayingPage.saveScreenshot(filename), checkLevelUpgrade, levelsToGain);
  }, 9999999);
});