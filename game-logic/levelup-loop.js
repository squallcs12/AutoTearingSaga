const fs = require('fs');
const { getGoodCondition } = require('./characters/good-condition');
const { identifyCharacter } = require('./identify-character');
const { detectMovableGrid, getAvailableDirections } = require('../scene-detection/check-movement');
const parse = (str) => str.split('\n').map(x => x.trim()).filter(x => x.length > 0);

function buildForceRandom(directions) {
  const count = Math.floor(Math.random() * 5) + 1;
  const steps = [];
  for (let i = 0; i < count; i++) {
    steps.push(directions[Math.floor(Math.random() * directions.length)]);
  }
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
  await PlayingPage.loadGameAndLoadQuickSave();
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  
  await PlayingPage.perform('O'); // select character
  await saveScreenshot('current-char-raw.png');
  const detectedName = await identifyCharacter('tmp/current-char-raw.png');
  console.log(`[levelup] detected character: ${detectedName}`);
  const goodCondition = getGoodCondition(detectedName);
  console.error('[levelup] goodCondition:', JSON.stringify(goodCondition));
  await PlayingPage.perform('save');
  await PlayingPage.perform('save2');

  // Baseline: fight with no random steps to record init stat
  await performFight(PlayingPage, battle, isBoss);
  const { statIncreased: initStat } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);
  console.error('[levelup] initStat:', JSON.stringify(initStat));

  // Detect available movement directions
  await PlayingPage.perform('left');            // move cursor left (tiles still visible)
  await saveScreenshot('movement-fg.png');      // fg: with movement tiles
  await PlayingPage.perform('X');               // cancel → tiles disappear
  await saveScreenshot('movement-bg.png');      // bg: without movement tiles
  const { grid } = await detectMovableGrid('tmp/movement-fg.png', 'tmp/movement-bg.png');
  console.error('[levelup] movement grid:\n' + grid.join('\n'));
  const directions = getAvailableDirections(grid);
  console.error('[levelup] available directions:', directions);
  await PlayingPage.perform('right');           // move cursor back
  await PlayingPage.perform('O');               // reselect character

  // Phase 1: find random steps that change the stat outcome
  let workingRandomSteps;
  while (true) {
    await PlayingPage.reload();
    await PlayingPage.perform('save2');

    const randomSteps = buildForceRandom(directions);
    console.error('[levelup] trying random steps:', randomSteps.join(', '));
    await performSteps(PlayingPage, randomSteps);
    await PlayingPage.perform('save');

    await performFight(PlayingPage, battle, isBoss);
    const { statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot, detectedName);

    if (statsDiffer(statIncreased, initStat)) {
      console.error('[levelup] found working random steps:', randomSteps.join(', '));
      workingRandomSteps = randomSteps;
      break;
    }
    console.error('[levelup] no change, retrying...');
  }

  // Phase 2: farm good condition using the working random steps
  let turn = 0;
  while (true) {
    turn++;
    await PlayingPage.reload();
    await PlayingPage.perform('save2');

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
