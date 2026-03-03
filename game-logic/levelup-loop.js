const sharp = require('sharp');
const parse = (str) => str.split('\n').map(x => x.trim()).filter(x => x.length > 0);

function buildForceRandom(attempt) {
  const steps = [];
  for (let i = 0; i < attempt; i++) {
    steps.push(i % 2 === 0 ? 'up' : 'down');
  }
  return steps;
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
  await PlayingPage.perform('save1');
}

async function levelupLoop(PlayingPage, saveScreenshot, checkLevelUpgrade, fight, isBoss, goodCondition) {
  const battle = parse(fight);
  await PlayingPage.reload();
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  
  await PlayingPage.perform('O');
  await PlayingPage.perform('save');
  await PlayingPage.perform('save2');

  await saveScreenshot('current-char-raw.png');
  await sharp('current-char-raw.png')
    .extract({ left: 35, top: 95, width: 245, height: 50 })
    .toFile('current-char-name.png');

  while (true) {
    await PlayingPage.reload();
    await PlayingPage.perform('save2');

    await performSteps(PlayingPage, [
      'left',
      'left',
      'left',
      'O',
      'wait',
      'X',
      'wait',
    ]);

    await saveScreenshot('current-char-raw.png');
    const [refBuf, curBuf] = await Promise.all([
      sharp('current-char-name.png').raw().toBuffer(),
      sharp('current-char-raw.png').extract({ left: 35, top: 95, width: 245, height: 50 }).resize(245, 50).raw().toBuffer(),
    ]);
    let same = 0;
    for (let i = 0; i < refBuf.length; i++) {
      if (Math.abs(refBuf[i] - curBuf[i]) < 10) same++;
    }
    const match = same / refBuf.length;
    console.log(`[levelup] char name match: ${(match * 100).toFixed(1)}%`);
    if (match <= 0.9) {
      console.log('[levelup] wrong character, reloading');
      await PlayingPage.reload(2);
      PlayingPage.perform('save');
      continue;
    }

    await PlayingPage.perform('save');

    await performFight(PlayingPage, battle, isBoss);

    const { isGood, statIncreased } = await checkLevelUpgrade(goodCondition);
    console.log('[levelup] stats:', statIncreased);
    if (isGood) break;
  }

  console.log('Done! Good level-up stats found.');
}

module.exports = { levelupLoop };
