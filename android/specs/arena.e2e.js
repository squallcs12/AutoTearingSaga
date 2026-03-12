const { arenaLoop } = require('../../game-logic/arena-loop');
const { checkLevelUpgrade } = require('../../scene-detection/check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { levelsToGain: configLevelsToGain } = require('../../config');
const levelsToGain = process.env.LEVELS_TO_GAIN ? parseInt(process.env.LEVELS_TO_GAIN, 10) : configLevelsToGain;


describe('Run auto', () => {
  it('arena level up', async () => {
    await arenaLoop(PlayingPage, (filename) => PlayingPage.saveScreenshot(filename), checkLevelUpgrade, levelsToGain);
  }, 9999999);
});