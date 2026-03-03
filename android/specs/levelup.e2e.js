const { levelupLoop } = require('../../game-logic/levelup-loop');
const { checkLevelUpgrade } = require('../../check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { fight, isBoss, goodCondition } = require('./levelup');

describe('Run auto', () => {
  it('level up', async () => {
    await levelupLoop(PlayingPage, checkLevelUpgrade, fight, isBoss, goodCondition);
  }, 9999999);
});
