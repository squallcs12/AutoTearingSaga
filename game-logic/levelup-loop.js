const fs = require('fs');
const { getGoodCondition } = require('./characters/good-condition');
const { identifyCharacter } = require('./identify-character');
const { detectMovableGrid } = require('../scene-detection/check-movement');
const { sleep } = require('../utils');
const parse = (str) => str.split('\n').map(x => x.trim()).filter(x => x.length > 0);

// Pick a random G tile from the grid, return steps from C to that tile + confirm/cancel
function buildForceRandom(grid) {
  const cells = grid.map(row => row.split(' '));
  let charRow = -1, charCol = -1;
  for (let r = 0; r < cells.length; r++) {
    const c = cells[r].indexOf('C');
    if (c !== -1) { charRow = r; charCol = c; break; }
  }

  const gTiles = [];
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (cells[r][c] === 'G') gTiles.push({ r, c });
    }
  }

  // Pick a random G tile
  const target = gTiles[Math.floor(Math.random() * gTiles.length)];
  const dy = target.r - charRow; // positive = down
  const dx = target.c - charCol; // positive = right

  // Build directional steps from C to target
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
  fs.writeFileSync('logs/levelup.log', '');
  const battle = parse(fight);
  await PlayingPage.perform('load-game');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  
  await PlayingPage.perform('O'); // select character
  await saveScreenshot('current-char-raw.png');
  const detectedName = await identifyCharacter('tmp/current-char-raw.png');
  console.log(`[levelup] detected character: ${detectedName}`);
  const goodCondition = getGoodCondition(detectedName);
  console.log('[levelup] goodCondition:', JSON.stringify(goodCondition));
  await PlayingPage.perform('save');

  // Detect available movement directions (retry up to 10 times for non-empty grid)
  let grid = [];
  for (let attempt = 1; attempt <= 10; attempt++) {
    await PlayingPage.perform('left');            // move cursor left (tiles still visible)
    await sleep(1000);
    await saveScreenshot('movement-fg.png');      // fg: with movement tiles
    await PlayingPage.perform('X');               // cancel → tiles disappear
    await sleep(1000);
    await saveScreenshot('movement-bg.png');      // bg: without movement tiles
    const result = await detectMovableGrid('tmp/movement-fg.png', 'tmp/movement-bg.png');
    grid = result.grid;
    const hasC = grid.some(row => row.includes('C'));
    const hasG = grid.some(row => row.includes('G'));
    if (grid.length > 0 && hasC && hasG) {
      console.log(`[levelup] movement grid (attempt ${attempt}):\n` + grid.join('\n'));
      await PlayingPage.perform('right');         // move cursor back
      await PlayingPage.perform('O');             // reselect character
      break;
    }
    console.log(`[levelup] invalid grid (empty=${grid.length === 0} C=${hasC} G=${hasG}), retrying (${attempt}/10)...`);
    await PlayingPage.perform('right');           // move cursor back
    await PlayingPage.perform('O');               // reselect character
  }
  if (grid.length === 0) {
    throw new Error('[levelup] Failed to detect movement grid after 10 attempts');
  }

  // Baseline: fight with no random steps to record init stat
  await performFight(PlayingPage, battle, isBoss);
  const { statIncreased: initStat } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);
  console.log('[levelup] initStat:', JSON.stringify(initStat));

  // Phase 1: accumulate random move-cancel cycles until stats change
  // Reset after 10 moves to avoid overly long sequences
  const MAX_MOVES = 10;
  let workingRandomSteps = [];
  let moveCount = 0;
  while (true) {
    if (moveCount >= MAX_MOVES) {
      console.log('[levelup] reached ' + MAX_MOVES + ' moves, resetting...');
      workingRandomSteps = [];
      moveCount = 0;
    }
    workingRandomSteps.push(...buildForceRandom(grid));
    moveCount++;
    console.log('[levelup] move ' + moveCount + ' (' + workingRandomSteps.length + ' steps):', workingRandomSteps.join(', '));

    await PlayingPage.perform('reload');
    await performSteps(PlayingPage, workingRandomSteps);

    await performFight(PlayingPage, battle, isBoss);
    const { statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);

    if (statsDiffer(statIncreased, initStat)) {
      console.log('[levelup] found working steps (move ' + moveCount + ', ' + workingRandomSteps.length + ' steps)');
      break;
    }
    console.log('[levelup] no change, adding more steps...');
  }

  // Phase 2: farm good condition using the working random steps
  let turn = 0;
  while (true) {
    turn++;
    await PlayingPage.perform('reload');

    await performSteps(PlayingPage, workingRandomSteps);
    await PlayingPage.perform('save');

    await performFight(PlayingPage, battle, isBoss);

    const { isGood, statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);
    const stats = [statIncreased.count, ...Object.keys(statIncreased).filter(k => k !== 'count' && statIncreased[k])];
    const logLine = `turn=${turn} isGood=${isGood} stats=${stats.join(',')}\n`;
    fs.appendFileSync('logs/levelup.log', logLine);
    console.error(logLine.trim());
    if (isGood) {
      await PlayingPage.perform('save');
      await PlayingPage.perform('save1');
      break;
    }
  }

  console.log('Done! Good level-up stats found.');
}

module.exports = { levelupLoop };
