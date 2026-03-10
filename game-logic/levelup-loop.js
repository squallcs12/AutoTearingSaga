const fs = require('fs');
const { detectMovableGrid } = require('../scene-detection/check-movement');
const { sleep, statOrder } = require('../utils');
const { buildFallbackCondition, createNearMissTracker, detectCharacter, statLogLine, performSteps } = require('./shared');
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
  for (const name of statOrder) {
    if (!!a[name] !== !!b[name]) return true;
  }
  return false;
}

async function saveGoodResult(PlayingPage) {
  await PlayingPage.perform('save');
  await PlayingPage.perform('save1');
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

async function detectMoveableGrid(PlayingPage, saveScreenshot) {
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
  return grid;
}

async function detectRandomTriggerSteps(PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss, grid, initStat, goodCondition, detectedName) {
  const { charRow, charCol, byDist, maxDist } = parseGridTiles(grid);
  const allTiles = [];
  for (let dist = 1; dist <= maxDist; dist++) {
    if (byDist[dist]) allTiles.push(...byDist[dist]);
  }

  const MAX_MULTI_COMBOS = 50;
  for (let numMoves = 1; numMoves <= 3; numMoves++) {
    console.log(`[levelup] trying ${numMoves}-move combinations...`);
    let combos;
    if (numMoves === 1) {
      // Try single tiles, shuffled within each distance
      combos = [];
      for (let dist = 1; dist <= maxDist; dist++) {
        const tiles = byDist[dist];
        if (!tiles || tiles.length === 0) continue;
        const shuffled = [...tiles].sort(() => Math.random() - 0.5);
        combos.push(...shuffled.map(t => [t]));
      }
    } else {
      // Random sampling for multi-move combinations
      combos = [];
      for (let i = 0; i < MAX_MULTI_COMBOS; i++) {
        const combo = [];
        for (let j = 0; j < numMoves; j++) {
          combo.push(allTiles[Math.floor(Math.random() * allTiles.length)]);
        }
        combos.push(combo);
      }
    }

    for (const combo of combos) {
      const steps = combo.flatMap(tile => buildStepsToTile(charRow, charCol, tile));
      const label = combo.map(t => `(${t.r},${t.c})`).join('→');
      console.log(`[levelup] ${numMoves}-move ${label}:`, steps.join(', '));

      await PlayingPage.perform('reload');
      await performSteps(PlayingPage, steps);

      await performFight(PlayingPage, battle, isBoss);
      const { statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);

      if (statsDiffer(statIncreased, initStat)) {
        console.log(`[levelup] found working ${numMoves}-move combination`);
        return steps;
      }
      console.log(`[levelup] no change, trying next...`);
    }
  }

  console.log('[levelup] exhausted all combinations, using fallback...');
  const fallbackTiles = byDist[1] || Object.values(byDist)[0];
  return buildStepsToTile(charRow, charCol, fallbackTiles[0]);
}

async function levelupLoop(PlayingPage, saveScreenshot, checkLevelUpgrade, fight, isBoss) {
  const sessionTime = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const logFile = `logs/levelup-${sessionTime}.log`;
  fs.writeFileSync(logFile, '');
  const battle = parse(fight);
  await PlayingPage.perform('load-game');
  await performSteps(PlayingPage, ['X', 'X', 'X', 'X']);

  await PlayingPage.perform('O'); // select character
  const { detectedName, goodCondition } = await detectCharacter(saveScreenshot);
  console.log(`[levelup] detected character: ${detectedName}${process.env.CHAR_NAME ? ' (override)' : ''}`);
  console.log('[levelup] goodCondition:', JSON.stringify(goodCondition));
  await PlayingPage.perform('save');

  const grid = await detectMoveableGrid(PlayingPage, saveScreenshot);

  // Baseline: fight with no random steps to record init stat
  await performFight(PlayingPage, battle, isBoss);
  const { isGood: initGood, statIncreased: initStat } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);
  console.log('[levelup] initStat:', JSON.stringify(initStat));
  if (initGood) {
    console.log('[levelup] baseline fight already has good stats, no need to farm!');
    await saveGoodResult(PlayingPage);
    return;
  }

  const workingRandomSteps = await detectRandomTriggerSteps(
    PlayingPage, saveScreenshot, checkLevelUpgrade, battle, isBoss, grid, initStat, goodCondition, detectedName
  );

  // Phase 2: farm good condition using the working random steps
  let skipCount = parseInt(process.env.SKIP_COUNT || '0', 10);
  await PlayingPage.perform('reload');
  await PlayingPage.perform('save2');
  let turn = 0;
  let lastChangeTurn = skipCount;
  let prevStat = null;
  const STALE_LIMIT = 10;
  const fallbackCondition = buildFallbackCondition(goodCondition);
  const nearMiss = createNearMissTracker(goodCondition, fallbackCondition);
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

    const { isGood, statIncreased } = await checkLevelUpgrade(nearMiss.getEffectiveCondition(), saveScreenshot, detectedName);
    const logLine = `turn=${turn} stats=${statLogLine(statIncreased).join(',')}\n`;
    fs.appendFileSync(logFile, logLine);
    console.error(logLine.trim());

    const nearMissMsg = nearMiss.track(isGood, statIncreased);
    if (nearMissMsg) console.log(`[levelup] ${nearMissMsg}`);

    if (isGood) {
      await saveGoodResult(PlayingPage);
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
