// Desktop version of checkLevelUpgrade — replaces driver.saveScreenshot with takeScreenshot.
const { checkIsGoodLevelUp } = require('../scene-detection/check-level');
const { sleep, takeScreenshot } = require('./common');
const { exec } = require('child_process');

let syncGithub = false;
try {
  ({ syncGithub } = require('../android/specs/levelup'));
} catch (_) {}

async function checkLevelUpgrade(required) {
  const total = 7;
  for (let i = 1; i <= total; i++) {
    await sleep(400);
    await takeScreenshot(`tmp/level-up-${i}.png`);
  }
  const { isGood, statIncreased } = await checkIsGoodLevelUp(total, required);
  if (isGood) {
    console.error('Goooooooooooooodddddddddddddddddd');
    if (syncGithub) {
      exec('git add .', () => {
        exec('git cm -m "update save file"', () => {
          exec('git push', () => {});
        });
      });
    }
  }
  return { isGood, statIncreased };
}

module.exports = { checkLevelUpgrade };
