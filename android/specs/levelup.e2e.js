const { levelupLoop } = require('../../game-logic/levelup-loop');
const { checkLevelUpgrade } = require('../../scene-detection/check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { fight, isBoss } = require('../../config');

describe('Run auto', () => {
  it('level up', async () => {
    await levelupLoop(PlayingPage, (filename) => PlayingPage.saveScreenshot(filename), checkLevelUpgrade, fight, isBoss);
  }, 9999999);
});
