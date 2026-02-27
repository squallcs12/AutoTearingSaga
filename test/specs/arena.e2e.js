const { isArenaConfirm, isArenaWin } = require('../../check-arena');
const { checkLevelUpgrade } = require('../../check-level');
const { checkHp } = require('../../check-hp');
const PlayingPage = require('../pageobjects/playing.page');
const { sleep } = require('./common');
const { goodCondition, levelsToGain } = require('./levelup');


describe('Run auto', () => {
  it('arena level up', async () => {
    console.log('[arena] reload');
    await PlayingPage.reload();
    await sleep(2000);
    await PlayingPage.perform('save2');

    let levelCount = 0;
    let skipNav = false;
    let changeOpponent = false;
    let consecutiveLosses = 0;
    let levelAttempts = 0;

    while (levelCount < levelsToGain) {
      // this is new turn
      console.log(`[arena] loop start, levelCount=${levelCount}`);
      changeOpponent = false;

      if (!skipNav) {
        await PlayingPage.perform('X');  // reset
        await PlayingPage.perform('left');
        await PlayingPage.perform('up');  // move to character
      }
      skipNav = false;

      await driver.saveScreenshot('current.png');
      const hp = await checkHp('current.png');
      console.log(`[arena] hp=${hp}`);

      if (hp < 0.3 || consecutiveLosses >= 10) {
        console.log(`[arena] heal first (hp=${hp}, consecutiveLosses=${consecutiveLosses})`);
        await PlayingPage.perform('left'); // move to heal unit
        await PlayingPage.perform('2O'); // open menu
        await PlayingPage.perform('down'); // select staff
        await PlayingPage.perform('O'); // select health staff
        await PlayingPage.perform('O'); // select character
        await PlayingPage.perform('O'); // confirm healing

        console.log('[arena] waiting for healing');
        await sleep(15000);

        await PlayingPage.perform('right'); // move back to character
      }

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

      await PlayingPage.perform('save'); // quick save at arena confirm screen

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

      levelAttempts++;
      console.log(`[arena] levelAttempts=${levelAttempts}`);

      if (didLevelUp) {
        const effectiveCondition = levelAttempts >= 1000
          ? goodCondition.map(c => ({ ...c, count: Math.max(1, c.count - 1) }))
          : goodCondition;
        if (levelAttempts >= 1000) console.log('[arena] over 1000 attempts, reducing goodCondition count by 1');

        const isGood = await checkLevelUpgrade(effectiveCondition);
        console.log(`[arena] isGood=${isGood}`);
        if (isGood) {
          await PlayingPage.perform('save1');
          levelCount++;
          levelAttempts = 0;
          consecutiveLosses = 0;
        } else {
          console.log('[arena] bad stats, change opponent');
          changeOpponent = true;
        }
        await sleep(2000);
      } else {
        console.log('[arena] no level up, ending turn');

        await driver.saveScreenshot('current.png');
        const won = await isArenaWin('current.png');
        console.log(`[arena] won=${won}`);
        if (!won) {
          consecutiveLosses++;
          console.log(`[arena] character lost, consecutiveLosses=${consecutiveLosses}, change opponent`);
          changeOpponent = true;
        } else {
          consecutiveLosses = 0;
        }
      }

      if (changeOpponent) {
        await PlayingPage.reload(); // back to arena confirm screen
        await PlayingPage.perform('O'); // choose No
        await PlayingPage.perform('X'); // skip dialog
        await PlayingPage.perform('X'); // skip dialog
        await PlayingPage.perform('X'); // skip dialog
        await PlayingPage.perform('X'); // skip dialog
        skipNav = true;
        continue;
      }

      if (!didLevelUp && !changeOpponent) {
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