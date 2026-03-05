const sharp = require('sharp');
const fs = require('fs');
const { getScale } = require('../scene-detection/calib');
const { getGoodCondition } = require('./characters/good-condition');
const parse = (str) => str.split('\n').map(x => x.trim()).filter(x => x.length > 0);

const CHAR_NAME_BOX = { left: 35, top: 95, width: 245, height: 50 };

async function extractCharName(imagePath) {
  const image = sharp(imagePath);
  const { width } = await image.metadata();
  const s = getScale(width);
  return image.extract({
    left:   Math.round(CHAR_NAME_BOX.left   * s),
    top:    Math.round(CHAR_NAME_BOX.top    * s),
    width:  Math.round(CHAR_NAME_BOX.width  * s),
    height: Math.round(CHAR_NAME_BOX.height * s),
  }).resize(CHAR_NAME_BOX.width, CHAR_NAME_BOX.height);
}

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
}

async function levelupLoop(PlayingPage, saveScreenshot, checkLevelUpgrade, fight, isBoss, characterName) {
  const goodCondition = getGoodCondition(characterName);
  console.error('[levelup] goodCondition:', JSON.stringify(goodCondition));
  const battle = parse(fight);
  await PlayingPage.loadGameAndLoadQuickSave();
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  await PlayingPage.perform('X');
  
  await PlayingPage.perform('O');
  await PlayingPage.perform('save');
  await PlayingPage.perform('save2');

  await PlayingPage.waitNotificationHide();
  await saveScreenshot('current-char-raw.png');
  await (await extractCharName('tmp/current-char-raw.png')).toFile('tmp/current-char-name.png');

  let turn = 0;
  while (true) {
    turn++;
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

    await PlayingPage.waitNotificationHide();
    await saveScreenshot('current-char-raw.png');
    const [refBuf, curBuf] = await Promise.all([
      sharp('tmp/current-char-name.png').raw().toBuffer(),
      (await extractCharName('tmp/current-char-raw.png')).raw().toBuffer(),
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

    const { isGood, statIncreased } = await checkLevelUpgrade(goodCondition, saveScreenshot);
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
