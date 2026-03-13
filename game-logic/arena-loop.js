const fs = require('fs');
const { isArenaConfirm, isArenaWin } = require('../scene-detection/check-arena');
const { checkHp } = require('../scene-detection/check-hp');
const { statLogLine, performSteps, initGame } = require('./shared');
const { sleep } = require('../utils');

async function setupRun(PlayingPage, saveScreenshot) {
  console.log('[arena] reload');
  const { detectedName, goodCondition } = await initGame(PlayingPage, saveScreenshot);
  console.error('[arena] goodCondition:', JSON.stringify(goodCondition));

  await PlayingPage.perform('save2');

  return { detectedName, goodCondition };
}

async function healIfNeeded(PlayingPage, hp, consecutiveLosses) {
  if (hp >= 0.3 && consecutiveLosses < 10) return;

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

// Navigate into the arena and spam until the confirm screen appears.
// Returns true if the confirm screen was reached.
async function enterArenaAndConfirm(PlayingPage, saveScreenshot) {
  console.log('[arena] enter arena');
  await performSteps(PlayingPage, ['O', 'O', 'O', 'O']);

  console.log('[arena] waiting for loading');
  await performSteps(PlayingPage, ['wait', 'wait', 'wait', 'wait']);

  console.log('[arena] waiting for confirm');
  await PlayingPage.perform('O');
  await performSteps(PlayingPage, ['wait', 'wait']);
  await performSteps(PlayingPage, ['2O', '2O', '2O']);

  console.log('[arena] checking for arena confirm');
  for (let i = 0; i < 30; i++) {
    await PlayingPage.perform('O');
    const screenshotPath = await saveScreenshot('current.png');
    const confirmed = await isArenaConfirm(screenshotPath);
    console.log(`[arena] arenaConfirm attempt ${i}: ${confirmed}`);
    if (confirmed) return true;
  }
  return false;
}

// Select opponent, fight, and wait for level-up screen.
// Returns didLevelUp boolean.
async function fightAndWaitLevelUp(PlayingPage) {
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
  return didLevelUp;
}

// Evaluate level-up stats and log result.
// Returns { isGood }.
async function handleLevelUpResult(PlayingPage, saveScreenshot, checkLevelUpgrade, goodCondition, detectedName, levelAttempts) {
  const { isGood, statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName, PlayingPage.lastLevelUpResult);
  const logLine = `turn=${levelAttempts} isGood=${isGood} stats=${statLogLine(statIncreased).join(',')}\n`;
  fs.appendFileSync('logs/arena.log', logLine);
  console.error(logLine.trim());

  if (isGood) {
    await PlayingPage.perform('save1');
    return { isGood: true };
  }

  console.log('[arena] bad stats, change opponent');
  await sleep(2000);
  return { isGood: false };
}

// Check win/loss after a fight with no level-up.
// Returns true if the character won.
async function checkWinLoss(saveScreenshot) {
  console.log('[arena] no level up, ending turn');
  const screenshotPath = await saveScreenshot('current.png');
  const won = await isArenaWin(screenshotPath);
  console.log(`[arena] won=${won}`);
  return won;
}

// End the arena turn: leave arena, advance to next turn, save.
async function endTurn(PlayingPage) {
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

async function arenaLoop(PlayingPage, saveScreenshot, checkLevelUpgrade, levelsToGain) {
  const { detectedName, goodCondition } = await setupRun(PlayingPage, saveScreenshot);

  const skipCount = parseInt(process.env.SKIP_COUNT || '0', 10);
  let levelCount = 0;
  let skipNav = false;
  let consecutiveLosses = 0;
  let levelAttempts = 0;

  while (levelCount < levelsToGain) {
    console.log(`[arena] loop start, levelCount=${levelCount}`);

    if (!skipNav) {
      await PlayingPage.perform('X');
      await PlayingPage.perform('left');
      await PlayingPage.perform('up');
    }
    skipNav = false;

    const screenshotPath = await saveScreenshot('current.png');
    const hp = await checkHp(screenshotPath);
    console.log(`[arena] hp=${hp}`);

    await healIfNeeded(PlayingPage, hp, consecutiveLosses);

    const isAtArenaConfirm = await enterArenaAndConfirm(PlayingPage, saveScreenshot);
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

    const didLevelUp = await fightAndWaitLevelUp(PlayingPage);
    levelAttempts++;
    console.log(`[arena] levelAttempts=${levelAttempts}`);

    let changeOpponent = false;
    if (didLevelUp) {
      const { isGood } = await handleLevelUpResult(PlayingPage, saveScreenshot, checkLevelUpgrade, goodCondition, detectedName, levelAttempts);
      if (isGood) {
        levelCount++;
        levelAttempts = 0;
        consecutiveLosses = 0;
      } else {
        changeOpponent = true;
      }
    } else {
      const won = await checkWinLoss(saveScreenshot);
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

    if (!didLevelUp) {
      await endTurn(PlayingPage);
    }
  }

  console.log(`[arena] Done! Gained ${levelsToGain} levels.`);
}

module.exports = { arenaLoop };
