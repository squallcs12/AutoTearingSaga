// Standalone desktop level-up automation (no WebdriverIO/Appium required).
// Run from project root: node desktop/levelup.js
//
// Prerequisites:
//   - DuckStation running on this PC with the game loaded
//   - android/specs/levelup.js exists locally (gitignored config file)

const { checkLevelUpgrade } = require('./check-level');
const PlayingPage = require('./playing');
const { sleep } = require('./common');
const { forceRandom, fight, isBoss, goodCondition } = require('../android/specs/levelup');

async function main() {
  const rawSteps = `
    ${forceRandom}
    O
    X
    save
    ${fight}
    confirm
    ${isBoss ? 'boss' : 'finish'}
  `;
  const steps = rawSteps.split('\n').map(x => x.trim()).filter(x => x.length > 0);

  while (true) {
    await PlayingPage.reload();
    await sleep(2000);

    for (const step of steps) {
      await PlayingPage.perform(step);
    }

    await PlayingPage.perform('wait-level-up');
    await PlayingPage.perform('save1');

    const isGood = await checkLevelUpgrade(goodCondition);
    if (isGood) break;
  }

  console.log('Done! Good level-up stats found.');
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
