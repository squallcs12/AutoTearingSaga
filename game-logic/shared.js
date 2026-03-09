const { getGoodCondition } = require('./characters/good-condition');
const { identifyCharacter } = require('./identify-character');

const FALLBACK_THRESHOLD = 20;

function buildFallbackCondition(goodCondition) {
  return goodCondition.map(c => ({ ...c, count: Math.max(1, c.count - 1), hp: 1 }));
}

function createNearMissTracker(goodCondition, fallbackCondition) {
  let nearMissCount = process.env.NO_FALLBACK ? Infinity : 0;

  return {
    get count() { return nearMissCount; },
    getEffectiveCondition() {
      return nearMissCount >= FALLBACK_THRESHOLD ? fallbackCondition : goodCondition;
    },
    track(isGood, statIncreased) {
      if (!isGood && statIncreased.count === goodCondition[0].count - 1) {
        nearMissCount++;
        if (nearMissCount === FALLBACK_THRESHOLD) {
          return `${FALLBACK_THRESHOLD} near-misses (count=${statIncreased.count}), relaxing to count=${fallbackCondition[0].count} with hp required`;
        }
      }
      return null;
    },
    reset() {
      nearMissCount = process.env.NO_FALLBACK ? Infinity : 0;
    },
  };
}

async function detectCharacter(saveScreenshot) {
  await saveScreenshot('current-char-raw.png');
  const detectedName = process.env.CHAR_NAME || await identifyCharacter('tmp/current-char-raw.png');
  if (!detectedName) throw new Error('Could not identify character face (no match above 95%). Add face image to game-logic/characters/faces/ or use -name <char>');
  const goodCondition = getGoodCondition(detectedName);
  return { detectedName, goodCondition };
}

function statLogLine(statIncreased) {
  return [statIncreased.count, ...Object.keys(statIncreased).filter(k => k !== 'count' && statIncreased[k])];
}

async function performSteps(PlayingPage, steps) {
  for (const step of steps) {
    await PlayingPage.perform(step);
  }
}

module.exports = { FALLBACK_THRESHOLD, buildFallbackCondition, createNearMissTracker, detectCharacter, statLogLine, performSteps };
