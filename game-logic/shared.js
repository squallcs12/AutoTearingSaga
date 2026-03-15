const fs = require('fs');
const path = require('path');
const { getGoodCondition } = require('./characters/good-condition');
const { identifyCharacter, saveFaceFromScreenshot } = require('./identify-character');

const FACES_DIR = path.join(__dirname, 'characters', 'faces');

async function detectCharacter(saveScreenshot) {
  await saveScreenshot('current-char-raw.png');
  const detectedName = process.env.CHAR_NAME || await identifyCharacter('tmp/current-char-raw.png');
  if (!detectedName) throw new Error('Could not identify character face (no match above 95%). Add face image to game-logic/characters/faces/ or use -name <char>');

  // Save face image if name was manually specified and no face file exists
  const facePath = path.join(FACES_DIR, `${detectedName}.png`);
  if (process.env.CHAR_NAME && !fs.existsSync(facePath)) {
    console.log(`[levelup] saving face image for ${detectedName}`);
    await saveFaceFromScreenshot('tmp/current-char-raw.png', facePath);
  }

  const goodCondition = getGoodCondition(detectedName);
  const charData = require(`./characters/growth/${detectedName}.json`);
  const tier = process.env.TIER_OVERRIDE || charData.tier;
  return { detectedName, goodCondition, tier };
}

function statLogLine(statIncreased) {
  return [statIncreased.count, ...Object.keys(statIncreased).filter(k => k !== 'count' && statIncreased[k])];
}

async function performSteps(PlayingPage, steps) {
  for (const step of steps) {
    await PlayingPage.perform(step);
  }
}

module.exports = { detectCharacter, statLogLine, performSteps };
