const sharp = require('sharp');
const _ = require('lodash');
const { exec, execSync } = require('child_process');
const { exportSave } = require('../android/specs/transfer-save');

const { goodCondition, syncGithub } = require('../config');
const { sleep, statOrder } = require('../utils');
const { cropGameArea } = require('./calib');
sharp.cache(false);

const debug = false;

const findColor = (color, colors) => {
  for (let i = 0; i < colors.length; i++) {
    if (_.isEqual(colors[i], color)) {
      return true;
    }
  }
  return false;
};

const loadSampleColors = async () => {
  const raw = await sharp('example/level-up/level-up.jpg').greyscale().raw().toBuffer();
  const colorCount = {};
  for (let i = 0; i < raw.length; i++) {
    colorCount[raw[i]] = (colorCount[raw[i]] || 0) + 1;
  }
  const sorted = Object.entries(colorCount).sort((a, b) => b[1] - a[1]);
  let sum = 0;
  const sampleColors = [];
  for (const [color, count] of sorted) {
    sum += count;
    sampleColors.push(parseInt(color, 10));
    if (sum / raw.length > 0.8) break;
  }
  return sampleColors;
};

const sampleColorsPromise = loadSampleColors();

const checkIsLevelUp = async (newImage) => {
  const sampleColors = await sampleColorsPromise;
  newImage = await newImage.clone().greyscale().raw().toBuffer();
  let count = 0;
  for (let j = 0; j < newImage.length; j++) {
    if (sampleColors.includes(newImage[j])) count += 1;
  }
  return count / newImage.length >= 0.5;
};

// avd
const panelStart = [140, 227];
const panelStop  = [920, 657];

// stat regions
const statBegin  = [420, 270];
const stat2Begin = [700];
const statSize   = [200, 30];
const statHeight = 40;

const extractLevelUpPanel = async (image, s = 1) => {
  return image.extract({
    left:   Math.round(panelStart[0] * s),
    top:    Math.round(panelStart[1] * s),
    width:  Math.round((panelStop[0] - panelStart[0]) * s),
    height: Math.round((panelStop[1] - panelStart[1]) * s),
  });
};

const hasIncrease = async (image) => {
  image = await image.raw().toBuffer({ resolveWithObject: true });
  for (let k = 0; k < image.data.length; k += 4) {
    const [r, g, b] = [image.data[k], image.data[k + 1], image.data[k + 2]];
    if ((g >= 220 && r <= 100 && b <= 100) || (g >= 180 && r <= 60 && b <= 60) || (g >= 150 && r <= 10 && b <= 60)) {
      return true;
    }
  }
};

const findTotalStatIncrease = async (newImage, startIdx, s = 1) => {
  const increase = {};
  for (const st of statOrder) increase[st] = 0;

  const x1 = Math.round((statBegin[0]  - panelStart[0]) * s);
  const x2 = Math.round((stat2Begin[0] - panelStart[0]) * s);
  const y0 = Math.round((statBegin[1]  - panelStart[1]) * s);
  const dh = Math.round(statHeight * s);
  const sw = Math.round(statSize[0] * s);
  const sh = Math.max(1, Math.round(statSize[1] * s));

  for (let i = 0; i < 5; i++) {
    if (i < startIdx) continue;
    const statImage = await newImage.clone().extract({ left: x1, top: y0 + i * dh, width: sw, height: sh });
    if (debug) await statImage.toFormat('jpg').toFile(`xxx1-${i}.jpg`);
    if (await hasIncrease(statImage)) increase[statOrder[i]] = 1;
  }
  for (let i = 0; i < 4; i++) {
    if (i + 5 < startIdx) continue;
    const statImage = await newImage.clone().extract({ left: x2, top: y0 + i * dh, width: sw, height: sh });
    if (debug) await statImage.toFormat('jpg').toFile(`xxx2-${i}.jpg`);
    if (await hasIncrease(statImage)) increase[statOrder[i + 5]] = 1;
  }
  return increase;
};

const checkIsGoodLevelUpImg = async (i, startStat) => {
  const { image, s } = await cropGameArea(sharp(`tmp/level-up-${i}.png`));
  const panelPipeline = await extractLevelUpPanel(image, s);
  // Materialize to buffer so subsequent .extract() calls work on the cropped panel,
  // not the original image (Sharp chains extracts against the source, not the prior extract)
  const panelBuf = await panelPipeline.toBuffer();
  if (debug) await sharp(panelBuf).toFormat('jpg').toFile(`crop-level-up-${i}.jpg`);
  const isLevelUp = await checkIsLevelUp(sharp(panelBuf));
  if (isLevelUp) return findTotalStatIncrease(sharp(panelBuf), startStat, s);
};

const getStatIncreased = async (total) => {
  const increased = { count: 0 };
  let lastStatIdx = 0;
  for (let i = 1; i <= total; i++) {
    const findIncreased = await checkIsGoodLevelUpImg(i, lastStatIdx);
    if (!findIncreased) continue;
    for (let k = lastStatIdx; k < statOrder.length; k++) {
      const name = statOrder[k];
      if (findIncreased[name]) {
        increased[name] = 1;
        lastStatIdx = k + 1;
      }
    }
    if (lastStatIdx >= statOrder.length) break;
  }
  for (const name of statOrder) {
    if (increased[name]) increased.count += 1;
  }
  return increased;
};

const statSummary = (stats) => {
  if (debug) console.log({ stats });
  const summary = [stats.count];
  for (const name of statOrder) {
    if (stats[name]) summary.push(name);
  }
  return summary;
};

const isGoodCondition = (isGood, required) => {
  if (required.count && isGood.count > required.count) return true; // more than expect
  if (isGood.count < required.count) return false;
  for (const k in required) { // equal expect
    if (required[k] === -1 && isGood[k]) return false;
    if (required[k] === 1 && !isGood[k]) return false;
  }
  return true;
};

const checkGoodCondition = (isGood, required) => {
  for (let i = 0; i < required.length; i++) {
    if (isGoodCondition(isGood, required[i])) return true;
  }
  return false;
};

const checkIsGoodLevelUp = async (total, required) => {
  const statIncreased = await getStatIncreased(total);
  console.error(statSummary(statIncreased));
  const isGood = checkGoodCondition(statIncreased, required);
  return { isGood, statIncreased };
};

const syncSave = async (message) => {
  execSync('git pull');
  await $('id=com.github.stenzek.duckstation:id/controller_button_pause').touchAction({ action: 'tap', x: 10, y: 10 });
  await sleep(500);
  await $('android=new UiSelector().text("Exit Game")').click();
  await exportSave();
  execSync('adb -s emulator-5554 pull /sdcard/Download/duckstation/savestates/SLPS-03177_0.sav SLPS-03177_0.sav');
  execSync('git add .');
  execSync(`git cm -m "${message}"`);
  execSync('git push');
};

const checkLevelUpgrade = async (required, saveScreenshot, characterName) => {
  const total = 14;
  for (let i = 1; i <= total; i++) {
    await saveScreenshot(`level-up-${i}.png`);
  }
  const { isGood, statIncreased } = await checkIsGoodLevelUp(total, required);
  if (isGood) {
    console.error('Goooooooooooooodddddddddddddddddd');
    if (syncGithub) {
      try {
        await syncSave(`Level up ${characterName}: ${statSummary(statIncreased).join(' ')}`);
      } catch (e) {
        console.error('[syncSave] failed:', e.message);
      }
    }
  }
  return { isGood, statIncreased };
};

const waitLevelUp = async (playing, { sleepMs = 500 } = {}) => {
  const start = Date.now();
  for (let i = 0; i < 30; i++) {
    await playing.saveScreenshot('current.png');
    const { image, s } = await cropGameArea(sharp('tmp/current.png'));
    const cropImage = await extractLevelUpPanel(image, s);
    if (await checkIsLevelUp(cropImage)) {
      console.log(`[waitLevelUp] detected at i=${i} +${Date.now() - start}ms`);
      return true;
    }
    await sleep(sleepMs);
    await playing.pressO();
  }
  console.log(`[waitLevelUp] gave up after ${Date.now() - start}ms`);
  return false;
};

module.exports = { checkIsGoodLevelUp, statSummary, checkGoodCondition, checkIsLevelUp, findColor, extractLevelUpPanel, checkLevelUpgrade, waitLevelUp };

if (debug) {
  (async () => {
    const { isGood, statIncreased } = await checkIsGoodLevelUp(7, goodCondition);
    console.log({ isGood, statIncreased });
  })();
}