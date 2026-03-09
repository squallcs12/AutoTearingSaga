// Shared arena automation loop used by both android and desktop arena scripts.
// Accepts a deps object with platform-specific functions:
//   - PlayingPage: { perform, reload, waitLevelUp }
//   - sleep(ms)
//   - saveScreenshot(filename)  — filename only, tmp/ is added automatically
//   - checkLevelUpgrade(condition)

const fs = require('fs');
const { isArenaConfirm, isArenaWin } = require('../scene-detection/check-arena');
const { checkHp } = require('../scene-detection/check-hp');
const { buildFallbackCondition, createNearMissTracker, detectCharacter, statLogLine, performSteps } = require('./shared');

async function arenaLoop(PlayingPage, sleep, saveScreenshot, checkLevelUpgrade, levelsToGain) {
  console.log('[arena] reload');
  await PlayingPage.perform('load-game');
  await sleep(2000);

  await performSteps(PlayingPage, ['X', 'X', 'X', 'X']);

  await PlayingPage.perform('O'); // select character
  const { detectedName, goodCondition } = await detectCharacter(saveScreenshot);
  console.log(`[arena] detected character: ${detectedName}${process.env.CHAR_NAME ? ' (override)' : ''}`);
  console.error('[arena] goodCondition:', JSON.stringify(goodCondition));
  const fallbackCondition = buildFallbackCondition(goodCondition);
  const nearMiss = createNearMissTracker(goodCondition, fallbackCondition);

  await PlayingPage.perform('save2');

  const skipCount = parseInt(process.env.SKIP_COUNT || '0', 10);
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

    await saveScreenshot('current.png');
    const hp = await checkHp('tmp/current.png');
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
    await performSteps(PlayingPage, ['O', 'O', 'O', 'O']);

    console.log('[arena] waiting for loading');
    await performSteps(PlayingPage, ['wait', 'wait', 'wait', 'wait']);

    console.log('[arena] waiting for confirm');
    await PlayingPage.perform('O');
    await performSteps(PlayingPage, ['wait', 'wait']);
    await performSteps(PlayingPage, ['2O', '2O', '2O']);

    console.log('[arena] checking for arena confirm');
    let isAtArenaConfirm = false;
    for (let i = 0; i < 30; i++) {
      await PlayingPage.perform('O');
      await saveScreenshot('current.png');
      const confirmed = await isArenaConfirm('tmp/current.png');
      console.log(`[arena] arenaConfirm attempt ${i}: ${confirmed}`);
      if (confirmed) {
        isAtArenaConfirm = true;
        break;
      }
    }

    console.log(`[arena] isAtArenaConfirm=${isAtArenaConfirm}`);
    if (!isAtArenaConfirm) continue;

    await performSteps(PlayingPage, ['wait', 'wait']);

    await PlayingPage.perform('save3');

    if (levelAttempts + 1 <= skipCount) {
      levelAttempts++;
      console.log(`[arena] skipping attempt ${levelAttempts}/${skipCount}`);
      await PlayingPage.perform('reload3');
      await PlayingPage.perform('O');
      await performSteps(PlayingPage, ['X', 'X', 'X', 'X']);
      skipNav = true;
      continue;
    }

    await PlayingPage.perform('left');
    await PlayingPage.perform('O');

    console.log('[arena] fight');
    for (let i = 0; i < 9; i++) {
      await PlayingPage.perform('O');
    }

    console.log('[arena] waiting for level up');
    await PlayingPage.perform('wait-level-up');
    const didLevelUp = PlayingPage.lastLevelUpResult;
    console.log(`[arena] didLevelUp=${didLevelUp}`);

    levelAttempts++;
    console.log(`[arena] levelAttempts=${levelAttempts}`);

    if (didLevelUp) {
      const { isGood, statIncreased } = await checkLevelUpgrade(nearMiss.getEffectiveCondition(), saveScreenshot, detectedName);
      const logLine = `turn=${levelAttempts} isGood=${isGood} stats=${statLogLine(statIncreased).join(',')}\n`;
      fs.appendFileSync('logs/arena.log', logLine);
      console.error(logLine.trim());

      const nearMissMsg = nearMiss.track(isGood, statIncreased);
      if (nearMissMsg) console.log(`[arena] ${nearMissMsg}`);

      if (isGood) {
        await PlayingPage.perform('save1');
        levelCount++;
        levelAttempts = 0;
        nearMiss.reset();
        consecutiveLosses = 0;
      } else {
        console.log('[arena] bad stats, change opponent');
        changeOpponent = true;
      }
      await sleep(2000);
    } else {
      console.log('[arena] no level up, ending turn');

      await saveScreenshot('current.png');
      const won = await isArenaWin('tmp/current.png');
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
      await PlayingPage.perform('reload3');
      await PlayingPage.perform('O');
      await performSteps(PlayingPage, ['X', 'X', 'X', 'X']);
      skipNav = true;
      continue;
    }

    if (!didLevelUp && !changeOpponent) {
      console.log('[arena] leave arena');
      for (let i = 0; i < 5; i++) {
        await PlayingPage.perform('O');
      }

      console.log('[arena] wait for map show');
      await performSteps(PlayingPage, ['wait', 'wait']);

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

module.exports = { arenaLoop };
