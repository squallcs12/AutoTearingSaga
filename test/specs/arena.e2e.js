const { isArenaConfirm } = require('../../check-arena');
const { checkLevelUpgrade } = require('../../check-level');
const PlayingPage = require('../pageobjects/playing.page');
const { sleep } = require('./common');
const { goodCondition, levelsToGain } = require('./levelup');


describe('Run auto', () => {
  it('arena level up', async () => {
    console.log('[arena] reload');
    await PlayingPage.reload();
    await sleep(2000);

    let levelCount = 0;

    while (levelCount < levelsToGain) {
      console.log(`[arena] loop start, levelCount=${levelCount}`);
      await PlayingPage.perform('X');  // reset
      await PlayingPage.perform('left');
      await PlayingPage.perform('up');  // move to character

      console.log('[arena] enter arena');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');

      console.log('[arena] waiting for loading');
      await PlayingPage.perform('wait');
      await PlayingPage.perform('wait');
      await PlayingPage.perform('wait');
      await PlayingPage.perform('wait');

      console.log('[arena] waiting for confirm');
      await PlayingPage.perform('O');
      await PlayingPage.perform('wait');
      await PlayingPage.perform('wait');
      await PlayingPage.perform('2O');
      await PlayingPage.perform('2O');
      await PlayingPage.perform('2O');

      console.log('[arena] checking for arena confirm');
      let isAtArenaConfirm = false;
      for (let i = 0; i < 30; i++) {
        await PlayingPage.perform('O');
        await driver.saveScreenshot('current.png');
        const confirmed = await isArenaConfirm('current.png');
        console.log(`[arena] arenaConfirm attempt ${i}: ${confirmed}`);
        if (confirmed) {
          isAtArenaConfirm = true;
          break;
        }
      }

      console.log(`[arena] isAtArenaConfirm=${isAtArenaConfirm}`);
      if (!isAtArenaConfirm) continue;

      await PlayingPage.perform('wait'); // wait for fully show
      await PlayingPage.perform('wait'); // wait for fully show
      await PlayingPage.perform('left');  // select yes
      await PlayingPage.perform('O'); // confirm

      console.log('[arena] fight');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');

      console.log('[arena] waiting for level up');
      const didLevelUp = await PlayingPage.waitLevelUp();
      console.log(`[arena] didLevelUp=${didLevelUp}`);

      if (didLevelUp) {
        await PlayingPage.perform('save1');
        const isGood = await checkLevelUpgrade(goodCondition);
        console.log(`[arena] isGood=${isGood}`);
        if (isGood) {
          levelCount++;
        } else {
          console.log('[arena] bad stats, reloading');
          await PlayingPage.reload();
        }
        await sleep(2000);
      } else {
        console.log('[arena] no level up, ending turn');
        // leave arena
        console.log('[arena] leave arena');
        await PlayingPage.perform('O');
        await PlayingPage.perform('O');
        await PlayingPage.perform('O');
        await PlayingPage.perform('O');
        await PlayingPage.perform('O');

        console.log('[arena] wait for map show');
        await PlayingPage.perform('wait');
        await PlayingPage.perform('wait');

        console.log('[arena] end turn');
        await PlayingPage.perform('down');
        await PlayingPage.perform('O');
        await PlayingPage.perform('up');
        await PlayingPage.perform('O');

        console.log('[arena] waiting for new turn');
        await sleep(15000);

        await PlayingPage.perform('save');
      }
    }
  }, 9999999);
});