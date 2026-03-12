const { levelupLoop } = require('../../game-logic/levelup-loop');
const { checkLevelUpgrade } = require('../../scene-detection/check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { fight: configFight, isBoss: configIsBoss } = require('../../config');
const fight = process.env.FIGHT_OVERRIDE || configFight;
const isBoss = process.env.IS_BOSS ? process.env.IS_BOSS === '1' : configIsBoss;

describe('Run auto', () => {
  it('level up', async () => {
    await levelupLoop(PlayingPage, (filename) => PlayingPage.saveScreenshot(filename), checkLevelUpgrade, fight, isBoss);
  }, 9999999);
});
