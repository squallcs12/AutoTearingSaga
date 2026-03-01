const { checkLevelUpgrade } = require('../../check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { sleep } = require('./common');
const { forceRandom, fight, isBoss, goodCondition } = require('./levelup');


describe('Run auto', () => {
  beforeAll(async () => {
  })

  it('level up', async () => {
    let steps = `
    ${forceRandom}
    O
    X
    save
    ${fight}
    confirm
    ${isBoss ? 'boss' : 'finish'}
  `;
    steps = steps.split('\n').map((x) => {
      x = x.trim();
      if (!x.length) {
        return null;
      }
      return x;
    }).filter((x) => x);
    
    while (true) {
      await PlayingPage.reload();
      await sleep(2000);
      for (let i = 0; i < steps.length; i++) {
        console.log({ step: steps[i] })
        await PlayingPage.perform(steps[i]);
      }
      
      await PlayingPage.perform('wait-level-up');
      await PlayingPage.perform('save1');
      
      const isGood = await checkLevelUpgrade(goodCondition);

      if (isGood) {
        break;
      }
    }
  }, 9999999);
});

