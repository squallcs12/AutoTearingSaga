const fs = require('fs');
const path = require('path');
const { detectMovableGrid } = require('../scene-detection/check-movement');
const { sleep, statOrder } = require('../utils');
const { statLogLine, performSteps, initGame } = require('./shared');
const { AttackMenuNotFound } = require('../shared/perform');
const parse = (str) => str.split(',').map(x => x.trim()).filter(x => x.length > 0);

// Parse grid into tiles grouped by distance from C
function parseGridTiles(grid) {
  const cells = grid.map(row => row.split(' '));
  let charRow = -1, charCol = -1;
  for (let r = 0; r < cells.length; r++) {
    const c = cells[r].indexOf('C');
    if (c !== -1) { charRow = r; charCol = c; break; }
  }

  const byDist = {};
  let maxDist = 0;
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (cells[r][c] !== '.' && cells[r][c] !== 'C') {
        const dist = parseInt(cells[r][c], 10);
        if (!byDist[dist]) byDist[dist] = [];
        byDist[dist].push({ r, c });
        if (dist > maxDist) maxDist = dist;
      }
    }
  }

  return { charRow, charCol, byDist, maxDist };
}

// Build movement steps from C to a specific tile + confirm/cancel
function buildStepsToTile(charRow, charCol, target) {
  const dy = target.r - charRow;
  const dx = target.c - charCol;
  const steps = [];
  for (let i = 0; i < Math.abs(dy); i++) steps.push(dy > 0 ? 'down' : 'up');
  for (let i = 0; i < Math.abs(dx); i++) steps.push(dx > 0 ? 'right' : 'left');
  const moveCount = Math.abs(dy) + Math.abs(dx);
  if (moveCount >= 3) {
    steps.push('O', 'wait', 'X', 'wait');
  } else {
    steps.push('O', 'X');
  }
  return steps;
}

function statsDiffer(a, b) {
  if (a.count !== b.count) return true;
  for (const name of statOrder) {
    if (!!a[name] !== !!b[name]) return true;
  }
  return false;
}

function statToKey(statIncreased) {
  const parts = [statIncreased.count];
  for (const name of statOrder) {
    if (statIncreased[name]) parts.push(name);
  }
  return parts.join(',');
}

// Detect if stat history is cycling (same sequence repeating)
// Returns cycle length if found, null otherwise
function detectCycle(history, minWindow = 10) {
  if (history.length < minWindow * 2) return null;
  // Try cycle lengths from minWindow up to half the history
  for (let cycleLen = minWindow; cycleLen <= Math.floor(history.length / 2); cycleLen++) {
    let matched = true;
    for (let i = 0; i < minWindow; i++) {
      if (history[history.length - 1 - i] !== history[history.length - 1 - i - cycleLen]) {
        matched = false;
        break;
      }
    }
    if (matched) return cycleLen;
  }
  return null;
}

// Detect fake random trigger by high repeat rate (adjacent turns with same stats)
// Returns true if repeat rate exceeds threshold over the last windowSize turns
function detectHighRepeatRate(history, windowSize = 30, threshold = 0.6) {
  if (history.length < windowSize) return false;
  const window = history.slice(-windowSize);
  let repeats = 0;
  for (let i = 1; i < window.length; i++) {
    if (window[i] === window[i - 1]) repeats++;
  }
  const rate = repeats / (window.length - 1);
  if (rate >= threshold) {
    console.log(`[levelup] high repeat rate: ${(rate * 100).toFixed(0)}% (${repeats}/${window.length - 1}) in last ${windowSize} turns`);
    return true;
  }
  return false;
}

async function saveGoodResult(PlayingPage) {
  await PlayingPage.perform('save1');
}

async function performFight(PlayingPage, battle, isBoss, selectSteps) {
  if (selectSteps.length) await performSteps(PlayingPage, selectSteps);
  await performSteps(PlayingPage, battle);

  await PlayingPage.perform('confirm');
  if (isBoss) {
    await PlayingPage.perform('boss');
  } else {
    await PlayingPage.perform('finish');
  }
  await PlayingPage.perform('wait-level-up');
}

async function performFightWithRetry(PlayingPage, battle, isBoss, { maxRetries = 3, beforeRetry, selectSteps = [] } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      await performFight(PlayingPage, battle, isBoss, selectSteps);
      return;
    } catch (e) {
      if (e instanceof AttackMenuNotFound && attempt < maxRetries) {
        console.log(`[performFight] AttackMenuNotFound, retrying (${attempt}/${maxRetries})...`);
        await PlayingPage.perform('reload');
        if (beforeRetry) await beforeRetry();
        continue;
      }
      throw e;
    }
  }
}

async function detectMoveableGrid(PlayingPage, saveScreenshot) {
  let grid = [];
  for (let attempt = 1; attempt <= 100; attempt++) {
    await PlayingPage.perform('left');            // move cursor left (tiles still visible)
    await sleep(1000);
    const fgPath = await saveScreenshot('movement-fg.png');  // fg: with movement tiles
    await PlayingPage.perform('X');                           // cancel → tiles disappear
    await sleep(1000);
    const bgPath = await saveScreenshot('movement-bg.png');  // bg: without movement tiles
    const result = await detectMovableGrid(bgPath, fgPath);
    grid = result.grid;
    const hasC = grid.some(row => row.includes('C'));
    const hasReachable = grid.some(row => row.split(' ').some(v => v !== '.' && v !== 'C'));
    if (grid.length > 0 && hasC && hasReachable) {
      console.log(`[levelup] movement grid (attempt ${attempt}):\n` + grid.join('\n'));
      await PlayingPage.perform('right');         // move cursor back
      await PlayingPage.perform('O');             // reselect character
      break;
    }
    console.log(`[levelup] invalid grid (empty=${grid.length === 0} C=${hasC} reachable=${hasReachable}), retrying (${attempt}/10)...`);
    await PlayingPage.perform('right');           // move cursor back
    await sleep(1000);
    await PlayingPage.perform('O');               // reselect character
    await sleep(1000);
  }
  if (grid.length === 0) {
    throw new Error('[levelup] Failed to detect movement grid after 10 attempts');
  }
  return grid;
}

async function detectRandomTriggerSteps(PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss, grid, initStat, goodCondition, detectedName, failedStepsSet = [], selectSteps = []) {
  const { charRow, charCol, byDist, maxDist } = parseGridTiles(grid);
  // Try single tiles, shuffled within each distance
  const tiles = [];
  for (let dist = 1; dist <= maxDist; dist++) {
    if (byDist[dist]) {
      const shuffled = [...byDist[dist]].sort(() => Math.random() - 0.5);
      tiles.push(...shuffled);
    }
  }

  for (const tile of tiles) {
    const steps = buildStepsToTile(charRow, charCol, tile);
    if (failedStepsSet.includes(steps.join(','))) {
      continue;
    }
    console.log(`[levelup] tile (${tile.r},${tile.c}):`, steps.join(', '));

    // First attempt: check if steps produce different stat from baseline
    await PlayingPage.perform('reload');
    await performSteps(PlayingPage, steps);
    await performFightWithRetry(PlayingPage, battle, isBoss, {
      selectSteps,
      beforeRetry: async () => { await performSteps(PlayingPage, steps); },
    });
    const { statIncreased: stat1 } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName, PlayingPage.lastLevelUpResult, PlayingPage);

    if (!statsDiffer(stat1, initStat)) {
      console.log(`[levelup] no change, trying next...`);
      continue;
    }

    // Verify: run steps 2x and 3x, need at least 3 distinct results (including baseline)
    const allStats = [initStat, stat1];
    for (let repeat = 2; repeat <= 3; repeat++) {
      await PlayingPage.perform('reload');
      for (let r = 0; r < repeat; r++) {
        await performSteps(PlayingPage, steps);
      }
      await performFightWithRetry(PlayingPage, battle, isBoss, {
        selectSteps,
        beforeRetry: async () => { for (let r = 0; r < repeat; r++) await performSteps(PlayingPage, steps); },
      });
      const { statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName, PlayingPage.lastLevelUpResult, PlayingPage);
      allStats.push(statIncreased);
    }
    const uniqueCount = new Set([initStat, ...allStats].map(statToKey)).size;
    if (uniqueCount >= 3) {
      console.log(`[levelup] verified: tile (${tile.r},${tile.c}) has ${uniqueCount} unique results across baseline+3`);
      return steps;
    }
    console.log(`[levelup] fake trigger: only ${uniqueCount}/4 unique results, trying next...`);
  }

  // No verified random trigger found — pick best fake trigger by testing multipliers
  console.log('[levelup] no verified random trigger found, testing fake triggers with multipliers...');
  const fallbackTiles = byDist[1] || Object.values(byDist)[0];
  const baseSteps = buildStepsToTile(charRow, charCol, fallbackTiles[0]);
  const EVAL_TURNS = 10;
  let bestMultiplier = 1;
  let bestUniqueRate = 0;

  for (let multiplier = 1; multiplier <= 5; multiplier++) {
    const multiSteps = [];
    for (let m = 0; m < multiplier; m++) multiSteps.push(...baseSteps);

    const seen = new Set();
    for (let t = 1; t <= EVAL_TURNS; t++) {
      await PlayingPage.perform('reload');
      for (let r = 0; r < t; r++) {
        await performSteps(PlayingPage, multiSteps);
      }
      await performFightWithRetry(PlayingPage, battle, isBoss, {
        selectSteps,
        beforeRetry: async () => { for (let r = 0; r < t; r++) await performSteps(PlayingPage, multiSteps); },
      });
      const { statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName, PlayingPage.lastLevelUpResult, PlayingPage);
      seen.add(statToKey(statIncreased));
    }
    const uniqueRate = seen.size / EVAL_TURNS;
    console.log(`[levelup] fallback ${multiplier}x: ${seen.size}/${EVAL_TURNS} unique results (${(uniqueRate * 100).toFixed(0)}%)`);
    if (uniqueRate > bestUniqueRate) {
      bestUniqueRate = uniqueRate;
      bestMultiplier = multiplier;
    }
  }

  const result = [];
  for (let m = 0; m < bestMultiplier; m++) result.push(...baseSteps);
  console.log(`[levelup] using ${bestMultiplier}x fallback steps (${(bestUniqueRate * 100).toFixed(0)}% unique rate)`);
  return result;
}

async function setupRun(PlayingPage, saveScreenshot, fight) {
  const logFileName = process.env.__DEBUG__
    ? `levelup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`
    : 'levelup.log';
  const logFile = `logs/${logFileName}`;
  fs.writeFileSync(logFile, '');
  const battle = parse(fight);
  const oppDir = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const rawSelect = process.env.SELECT_STEPS ? parse(process.env.SELECT_STEPS) : [];
  const selectSteps = rawSelect.length ? ['X', ...rawSelect, 'O'] : [];
  const revertSelectSteps = rawSelect.length ? ['X', ...[...rawSelect].reverse().map(s => oppDir[s] || s), 'O'] : [];

  const { detectedName, goodCondition, tier } = await initGame(PlayingPage, saveScreenshot);
  console.log(`[levelup] tier: ${tier}`);
  console.log('[levelup] goodCondition:', JSON.stringify(goodCondition));
  if (selectSteps.length) console.log('[levelup] selectSteps:', selectSteps.join(', '));
  await PlayingPage.perform('save');

  return { battle, selectSteps, revertSelectSteps, logFile, detectedName, goodCondition };
}

// Phase 1: resolve which random steps to use.
// Returns { workingRandomSteps, initStat } or null if baseline is already good.
async function takeBeforeFightPicture(PlayingPage, saveScreenshot, selectSteps, revertSelectSteps) {
  if (selectSteps.length) await performSteps(PlayingPage, selectSteps);
  await PlayingPage.pressTriangle();
  console.log('[levelup] taking baseline screenshot before fight...');
  const beforeFightPath = await saveScreenshot('before-fight.png');
  await PlayingPage.pressX();
  if (revertSelectSteps.length) await performSteps(PlayingPage, revertSelectSteps);
  return beforeFightPath;
}

async function phase1FindRandomSteps(PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss, goodCondition, detectedName, selectSteps = [], revertSelectSteps = []) {
  if (process.env.RANDOM_OVERRIDE) {
    const workingRandomSteps = process.env.RANDOM_OVERRIDE.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (workingRandomSteps.length >= 3) {
      workingRandomSteps.push('O', 'wait', 'X', 'wait');
    } else {
      workingRandomSteps.push('O', 'X');
    }
    console.log('[levelup] using --random override:', workingRandomSteps.join(', '));
    if (process.env.STAT_DETECT !== 'panel') {
      await takeBeforeFightPicture(PlayingPage, saveScreenshot, selectSteps, revertSelectSteps);
    }
    return { workingRandomSteps, initStat: null };
  }

  const grid = await detectMoveableGrid(PlayingPage, saveScreenshot);

  // Baseline fight: record init stat before any RNG manipulation
  const beforeFightPath = process.env.STAT_DETECT === 'panel' ? null : await takeBeforeFightPicture(PlayingPage, saveScreenshot, selectSteps, revertSelectSteps);
  await performFightWithRetry(PlayingPage, battle, isBoss, { selectSteps });
  const { isGood: initGood, statIncreased: initStat } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName, PlayingPage.lastLevelUpResult, PlayingPage, beforeFightPath);
  console.log('[levelup] initStat:', JSON.stringify(initStat));
  if (initGood) {
    console.log('[levelup] baseline fight already has good stats, no need to farm!');
    await saveGoodResult(PlayingPage);
    return null;
  }

  const workingRandomSteps = await detectRandomTriggerSteps(
    PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss, grid, initStat, goodCondition, detectedName, [], selectSteps
  );
  const randomSuggestion = workingRandomSteps.slice(0, -4).join(',');
  fs.writeFileSync(path.join(__dirname, '..', 'app', '.last-random.json'), JSON.stringify({ value: randomSuggestion }));
  return { workingRandomSteps, initStat };
}

// Phase 2: repeatedly apply random steps + fight until good stats roll.
async function phase2FarmLoop(PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss, workingRandomSteps, initStat, goodCondition, detectedName, logFile, selectSteps = []) {
  const STALE_LIMIT = 10;
  const failedStepsSet = [];

  let skipCount = parseInt(process.env.SKIP_COUNT || '0', 10);
  let turn = 0;
  let lastChangeTurn = skipCount;
  let prevStat = null;
  const statHistory = [];
  let savedSlot4 = false;
  let savedSlot4Turn = 0;
  let savedSlot4Count = 0;


  await PlayingPage.perform('reload');
  await PlayingPage.perform('save2');

  while (true) {
    turn++;
    if (turn > skipCount) {
      await PlayingPage.perform('reload');
    }
    await performSteps(PlayingPage, workingRandomSteps);

    if (turn <= skipCount) {
      if (turn === skipCount) {
        PlayingPage.perform('save2');
      }
      console.log(`[levelup] skipping turn ${turn}/${skipCount}`);
      continue;
    } else {
      await PlayingPage.perform('save');
    }

    await performFightWithRetry(PlayingPage, battle, isBoss, {
      selectSteps,
      beforeRetry: async () => { await performSteps(PlayingPage, workingRandomSteps); },
    });

    const { isGood, statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName, PlayingPage.lastLevelUpResult, PlayingPage);
    const logLine = `turn=${turn} stats=${statLogLine(statIncreased).join(',')}\n`;
    fs.appendFileSync(logFile, logLine);
    console.error(logLine.trim());

    if (isGood) {
      if (!savedSlot4) {
        await PlayingPage.perform('save4');
        savedSlot4 = true;
        savedSlot4Turn = turn;
        savedSlot4Count = statIncreased.count;
        console.log(`[levelup] good result at turn ${turn} (count=${statIncreased.count}), saving to slot 4 and trying for 20 more turns...`);
      } else if (statIncreased.count > savedSlot4Count) {
        const prevCount = savedSlot4Count;
        await PlayingPage.perform('save4');
        savedSlot4Count = statIncreased.count;
        console.log(`[levelup] better result at turn ${turn} (count=${statIncreased.count} > ${prevCount}), updating slot 4...`);
      }
    }

    if (statIncreased.count >= 6 && statIncreased.count <= 8) {
      console.log(`[levelup] exceptional result (count=${statIncreased.count}), saving to slot ${statIncreased.count}...`);
      await PlayingPage.perform(`save${statIncreased.count}`);
    }

    if (savedSlot4 && turn >= savedSlot4Turn + 20) {
      console.log(`[levelup] tried 20 turns after good result, accepting slot 4`);
      break;
    }

    statHistory.push(statToKey(statIncreased));

    if (prevStat && statIncreased.count > 0 && statsDiffer(statIncreased, prevStat)) {
      lastChangeTurn = turn;
    }
    prevStat = statIncreased;

    // Detect fake random trigger: cycle or high repeat rate → find new steps
    const cycleLen = detectCycle(statHistory);
    const highRepeat = detectHighRepeatRate(statHistory);
    if (cycleLen || highRepeat) {
      if (cycleLen) console.log(`[levelup] FAKE RANDOM detected: stat sequence repeats every ${cycleLen} turns`);
      console.log('[levelup] current random steps are not effective, finding new ones...');
      failedStepsSet.push(workingRandomSteps.join(','));

      await PlayingPage.perform('reload');
      const newGrid = await detectMoveableGrid(PlayingPage, saveScreenshot);
      workingRandomSteps = await detectRandomTriggerSteps(
        PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss, newGrid, initStat, goodCondition, detectedName,
        failedStepsSet, selectSteps
      );
      console.log('[levelup] new random steps:', workingRandomSteps.join(', '));

      await PlayingPage.perform('reload');
      await PlayingPage.perform('save2');
      skipCount = 0;
      turn = 0;
      lastChangeTurn = 0;
      prevStat = null;
      statHistory.length = 0;
      continue;
    }

    if (turn - lastChangeTurn >= STALE_LIMIT) {
      console.log(`[levelup] no stat change in ${STALE_LIMIT} turns, reloading from save2 and skipping to turn ${lastChangeTurn}`);
      await PlayingPage.perform('reload2');
      await PlayingPage.perform('save');
      skipCount = lastChangeTurn;
      turn = 0;
      lastChangeTurn = skipCount;
      prevStat = null;
    }
  }
}

async function levelupLoop(PlayingPage, saveScreenshot, checkLevelUpgrade_) {
  const usePanel = process.env.STAT_DETECT === 'panel';
  if (usePanel) {
    const { checkLevelUpgradePanel } = require('../scene-detection/check-level');
    checkLevelUpgrade_ = checkLevelUpgradePanel;
    console.log('[levelup] using panel-based stat detection');
  }
  const checkLevelUpgrade = checkLevelUpgrade_;
  const { fight: configFight, isBoss: configIsBoss } = require('../config');
  const fight = process.env.FIGHT_OVERRIDE || configFight;
  const isBoss = process.env.IS_BOSS ? process.env.IS_BOSS === '1' : configIsBoss;
  const { battle, selectSteps, revertSelectSteps, logFile, detectedName, goodCondition } = await setupRun(PlayingPage, saveScreenshot, fight);

  const phase1Result = await phase1FindRandomSteps(
    PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss, goodCondition, detectedName, selectSteps, revertSelectSteps
  );
  if (!phase1Result) return; // baseline was already good

  const { workingRandomSteps, initStat } = phase1Result;
  await phase2FarmLoop(
    PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss,
    workingRandomSteps, initStat, goodCondition, detectedName, logFile, selectSteps
  );

  console.log('Done! Good level-up stats found.');
}

module.exports = { levelupLoop };
