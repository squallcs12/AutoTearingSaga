// Standalone desktop arena automation (no WebdriverIO/Appium required).
// Run from project root: node desktop/arena.js
//
// Prerequisites:
//   - DuckStation running on this PC with the game loaded
//   - android/specs/levelup.js exists locally (gitignored config file)
//
// Note: isArenaConfirm / isArenaWin / checkHp use pixel coordinates calibrated
// for Android screenshots. If your PC DuckStation runs at a different resolution,
// you may need to recalibrate the reference images in example/arena/.

const { isArenaConfirm, isArenaWin } = require('../check-arena');
const { checkLevelUpgrade } = require('./check-level');
const { checkHp } = require('../check-hp');
const PlayingPage = require('./playing');
const { sleep, takeScreenshot } = require('./common');
const { goodCondition, levelsToGain } = require('../android/specs/levelup');

async function main() {
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
    console.log(`[arena] loop start, levelCount=${levelCount}`);
    changeOpponent = false;

    if (!skipNav) {
      await PlayingPage.perform('X');
      await PlayingPage.perform('left');
      await PlayingPage.perform('up');
    }
    skipNav = false;

    await sleep(1000);
    await takeScreenshot('current.png');
    const hp = await checkHp('current.png');
    console.log(`[arena] hp=${hp}`);

    if (hp < 0.3 || consecutiveLosses >= 10) {
      console.log(`[arena] heal first (hp=${hp}, consecutiveLosses=${consecutiveLosses})`);
      await PlayingPage.perform('left');
      await PlayingPage.perform('2O');
      await PlayingPage.perform('down');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');
      await PlayingPage.perform('O');

      console.log('[arena] waiting for healing');
      await sleep(15000);

      await PlayingPage.perform('right');
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
      await takeScreenshot('current.png');
      const confirmed = await isArenaConfirm('current.png');
      console.log(`[arena] arenaConfirm attempt ${i}: ${confirmed}`);
      if (confirmed) {
        isAtArenaConfirm = true;
        break;
      }
    }

    console.log(`[arena] isAtArenaConfirm=${isAtArenaConfirm}`);
    if (!isAtArenaConfirm) continue;

    await sleep(4000);

    await PlayingPage.perform('save3');

    await PlayingPage.perform('left');
    await PlayingPage.perform('O');

    console.log('[arena] fight');
    for (let i = 0; i < 9; i++) {
      await PlayingPage.perform('O');
    }

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

      await takeScreenshot('current.png');
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
      await PlayingPage.reload(3);
      await PlayingPage.perform('O');
      await PlayingPage.perform('X');
      await PlayingPage.perform('X');
      await PlayingPage.perform('X');
      await PlayingPage.perform('X');
      skipNav = true;
      continue;
    }

    if (!didLevelUp && !changeOpponent) {
      console.log('[arena] leave arena');
      for (let i = 0; i < 5; i++) {
        await PlayingPage.perform('O');
      }

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

  console.log(`[arena] Done! Gained ${levelsToGain} levels.`);
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
