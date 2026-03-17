const fs = require('fs');
const path = require('path');
const { getGoodCondition } = require('./characters/good-condition');
const { identifyCharacter, saveFaceFromScreenshot } = require('./identify-character');

const FACES_DIR = path.join(__dirname, 'characters', 'faces');

async function detectCharacter(saveScreenshot) {
  const charPath = await saveScreenshot('current-char-raw.png');
  const detectedName = process.env.CHAR_NAME || await identifyCharacter(charPath);
  if (!detectedName) throw new Error('Could not identify character face (no match above 95%). Add face image to game-logic/characters/faces/ or use -name <char>');

  // Save face image if name was manually specified and no face file exists
  const facePath = path.join(FACES_DIR, `${detectedName}.png`);
  if (process.env.CHAR_NAME && !fs.existsSync(facePath)) {
    console.log(`[levelup] saving face image for ${detectedName}`);
    await saveFaceFromScreenshot(charPath, facePath);
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

// Common game initialization: load game, dismiss dialogs, select character, detect who it is
async function initGame(PlayingPage, saveScreenshot) {
  await PlayingPage.perform('load-game');
  await performSteps(PlayingPage, ['X', 'X', 'X', 'X']);
  await PlayingPage.perform('O'); // select character

  const { detectedName, goodCondition, tier } = await detectCharacter(saveScreenshot);
  console.log(`[loop] detected character: ${detectedName}${process.env.CHAR_NAME ? ' (override)' : ''}`);
  return { detectedName, goodCondition, tier };
}

module.exports = { detectCharacter, statLogLine, performSteps, initGame };
