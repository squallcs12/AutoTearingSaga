const { arenaLoop } = require('../../game-logic/arena-loop');
const { checkLevelUpgrade } = require('../../scene-detection/check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { sleep } = require('./common');
const { characterName, levelsToGain } = require('../../config');


describe('Run auto', () => {
  it('arena level up', async () => {
    await arenaLoop(PlayingPage, sleep, (filename) => PlayingPage.saveScreenshot(filename), checkLevelUpgrade, characterName, levelsToGain);
  }, 9999999);
});