// Shared arena automation loop used by both android and desktop arena scripts.
// Accepts a deps object with platform-specific functions:
//   - PlayingPage: { perform, reload, waitLevelUp }
//   - sleep(ms)
//   - saveScreenshot(filename)  — filename only, tmp/ is added automatically
//   - checkLevelUpgrade(condition)

const fs = require('fs');
const { isArenaConfirm, isArenaWin } = require('../scene-detection/check-arena');
const { checkHp } = require('../scene-detection/check-hp');
const { getGoodCondition } = require('./characters/good-condition');
const { identifyCharacter } = require('./identify-character');

async function arenaLoop(PlayingPage, sleep, saveScreenshot, checkLevelUpgrade, levelsToGain) {
  console.log('[arena] reload');
  await PlayingPage.perform('load-game');
  await sleep(2000);

  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');

  await PlayingPage.perform('O'); // select character
  await saveScreenshot('current-char-raw.png');
  const detectedName = await identifyCharacter('tmp/current-char-raw.png');
  console.log(`[arena] detected character: ${detectedName}`);
  const goodCondition = getGoodCondition(detectedName);
  console.error('[arena] goodCondition:', JSON.stringify(goodCondition));

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

    await PlayingPage.perform('wait');
    await PlayingPage.perform('wait');

    await PlayingPage.perform('save3');

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
      const effectiveCondition = levelAttempts >= 1000
        ? goodCondition.map(c => ({ ...c, count: Math.max(1, c.count - 1) }))
        : goodCondition;
      if (levelAttempts >= 1000) console.log('[arena] over 1000 attempts, reducing goodCondition count by 1');

      const { isGood, statIncreased } = await checkLevelUpgrade(effectiveCondition, saveScreenshot, detectedName);
      const stats = [statIncreased.count, ...Object.keys(statIncreased).filter(k => k !== 'count' && statIncreased[k])];
      const logLine = `turn=${levelAttempts} isGood=${isGood} stats=${stats.join(',')}\n`;
      fs.appendFileSync('logs/arena.log', logLine);
      console.error(logLine.trim());
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

module.exports = { arenaLoop };
