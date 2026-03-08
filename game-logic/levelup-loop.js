const fs = require('fs');
const { getGoodCondition } = require('./characters/good-condition');
const { identifyCharacter } = require('./identify-character');
const { detectMovableGrid } = require('../scene-detection/check-movement');
const { sleep } = require('../utils');
const parse = (str) => str.split('\n').map(x => x.trim()).filter(x => x.length > 0);

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
  steps.push('O', 'wait', 'X', 'wait');
  return steps;
}



function statsDiffer(a, b) {
  if (a.count !== b.count) return true;
  for (let i = 1; i <= 9; i++) {
    if (!!a[i] !== !!b[i]) return true;
  }
  return false;
}

async function performSteps(PlayingPage, steps) {
  for (const step of steps) {
    await PlayingPage.perform(step);
  }
}

async function performFight(PlayingPage, battle, isBoss) {
  await performSteps(PlayingPage, battle);

  await PlayingPage.perform('confirm');
  if (isBoss) {
    await PlayingPage.perform('boss');
  } else {
    await PlayingPage.perform('finish');
  }
  await PlayingPage.perform('wait-level-up');
}

async function levelupLoop(PlayingPage, saveScreenshot, checkLevelUpgrade, fight, isBoss) {
  const sessionTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFile = `logs/levelup-${sessionTime}.log`;
  fs.writeFileSync(logFile, '');
  const battle = parse(fight);
  await PlayingPage.perform('load-game');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  
  await PlayingPage.perform('O'); // select character
  await saveScreenshot('current-char-raw.png');
  const detectedName = process.env.CHAR_NAME || await identifyCharacter('tmp/current-char-raw.png');
  console.log(`[levelup] detected character: ${detectedName}${process.env.CHAR_NAME ? ' (override)' : ''}`);
  if (!detectedName) throw new Error('Could not identify character face (no match above 95%). Add face image to game-logic/characters/faces/ or use -name <char>');
  const goodCondition = getGoodCondition(detectedName);
  console.log('[levelup] goodCondition:', JSON.stringify(goodCondition));
  await PlayingPage.perform('save');

  // Detect available movement directions (retry up to 10 times for non-empty grid)
  let grid = [];
  for (let attempt = 1; attempt <= 100; attempt++) {
    await PlayingPage.perform('left');            // move cursor left (tiles still visible)
    await sleep(1000);
    await saveScreenshot('movement-fg.png');      // fg: with movement tiles
    await PlayingPage.perform('X');               // cancel → tiles disappear
    await sleep(1000);
    await saveScreenshot('movement-bg.png');      // bg: without movement tiles
    const result = await detectMovableGrid('tmp/movement-bg.png', 'tmp/movement-fg.png');
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

  // Baseline: fight with no random steps to record init stat
  await performFight(PlayingPage, battle, isBoss);
  const { isGood: initGood, statIncreased: initStat } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);
  console.log('[levelup] initStat:', JSON.stringify(initStat));
  if (initGood) {
    console.log('[levelup] baseline fight already has good stats, no need to farm!');
    await PlayingPage.perform('save');
    await PlayingPage.perform('save1');
    return;
  }

  // Phase 1: try all tiles at distance 1, then 2, ..., up to maxDist
  // For each distance, shuffle tiles and try each one until stats change
  const { charRow, charCol, byDist, maxDist } = parseGridTiles(grid);
  let workingRandomSteps = [];
  let found = false;
  for (let dist = 1; dist <= maxDist && !found; dist++) {
    const tiles = byDist[dist];
    if (!tiles || tiles.length === 0) continue;
    // Shuffle tiles at this distance
    const shuffled = [...tiles].sort(() => Math.random() - 0.5);
    console.log(`[levelup] trying ${shuffled.length} tiles at distance ${dist}...`);
    for (const tile of shuffled) {
      workingRandomSteps = buildStepsToTile(charRow, charCol, tile);
      console.log(`[levelup] dist=${dist} tile=(${tile.r},${tile.c}):`, workingRandomSteps.join(', '));

      await PlayingPage.perform('reload');
      await performSteps(PlayingPage, workingRandomSteps);

      await performFight(PlayingPage, battle, isBoss);
      const { statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);

      if (statsDiffer(statIncreased, initStat)) {
        console.log(`[levelup] found working steps at distance ${dist}`);
        found = true;
        break;
      }
      console.log(`[levelup] no change, trying next tile...`);
    }
  }
  if (!found) {
    console.log('[levelup] exhausted all tiles, restarting from distance 1...');
    // Fallback: just use a 1-step move
    const fallbackTiles = byDist[1] || Object.values(byDist)[0];
    workingRandomSteps = buildStepsToTile(charRow, charCol, fallbackTiles[0]);
  }

  // Phase 2: farm good condition using the working random steps
  let skipCount = parseInt(process.env.SKIP_COUNT || '0', 10);
  // workingRandomSteps = ['left 5', 'down 2', 'O', 'wait', 'X', 'wait', ];
  await PlayingPage.perform('reload');
  await PlayingPage.perform('save2');
  let turn = 0;
  let lastChangeTurn = skipCount;
  let prevStat = null;
  const STALE_LIMIT = 10;
  const FALLBACK_THRESHOLD = 20;
  let nearMissCount = process.env.NO_FALLBACK ? Infinity : 0;
  const fallbackCondition = goodCondition.map(c => {
    const fc = { ...c, count: Math.max(1, c.count - 1), hp: 1 };
    return fc;
  });
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

    await performFight(PlayingPage, battle, isBoss);

    const effectiveCondition = nearMissCount >= FALLBACK_THRESHOLD ? fallbackCondition : goodCondition;
    const { isGood, statIncreased } = await checkLevelUpgrade(effectiveCondition, saveScreenshot, detectedName);
    const stats = [statIncreased.count, ...Object.keys(statIncreased).filter(k => k !== 'count' && statIncreased[k])];
    const logLine = `turn=${turn} stats=${stats.join(',')}\n`;
    fs.appendFileSync(logFile, logLine);
    console.error(logLine.trim());

    // Track near-misses: count is 1 less than required
    if (!isGood && statIncreased.count === goodCondition[0].count - 1) {
      nearMissCount++;
      if (nearMissCount === FALLBACK_THRESHOLD) {
        console.log(`[levelup] ${FALLBACK_THRESHOLD} near-misses (count=${statIncreased.count}), relaxing to count=${fallbackCondition[0].count} with hp required`);
      }
    }

    if (isGood) {
      await PlayingPage.perform('save');
      await PlayingPage.perform('save1');
      break;
    }

    if (prevStat && statIncreased.count > 0 && statsDiffer(statIncreased, prevStat)) {
      lastChangeTurn = turn;
    }
    prevStat = statIncreased;

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

  console.log('Done! Good level-up stats found.');
}

module.exports = { levelupLoop };
