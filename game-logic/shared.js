const { getGoodCondition } = require('./characters/good-condition');
const { identifyCharacter } = require('./identify-character');

async function detectCharacter(saveScreenshot) {
  await saveScreenshot('current-char-raw.png');
  const detectedName = process.env.CHAR_NAME || await identifyCharacter('tmp/current-char-raw.png');
  if (!detectedName) throw new Error('Could not identify character face (no match above 95%). Add face image to game-logic/characters/faces/ or use -name <char>');
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
