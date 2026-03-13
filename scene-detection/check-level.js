const sharp = require('sharp');
const { sleep, statOrder } = require('../utils');
const { cropGameArea } = require('./calib');
sharp.cache(false);

const debug = false;

const path = require('path');
const fs = require('fs');

// Load reference label images (stat name columns) for template matching
const refDir = path.join(__dirname, '..', 'example', 'level-up');
const loadRef = async (file) => {
  const img = sharp(path.join(refDir, file));
  const meta = await img.metadata();
  const buf = await img.greyscale().raw().toBuffer();
  return { buf, width: meta.width, height: meta.height };
};
const refLeftPromise  = loadRef('col-left-half.png');
const refRightPromise = loadRef('col-right-half.png');

// Positions of label columns relative to panel origin (panelStart)
const labelLeft  = { x: 420 - 140, y: 270 - 227 }; // (280, 43)
const labelRight = { x: 700 - 140, y: 270 - 227 }; // (560, 43)

const matchRegion = async (panelImage, ref, pos, s) => {
  const left   = Math.round(pos.x * s);
  const top    = Math.round(pos.y * s);
  const width  = Math.round(ref.width * s);
  const height = Math.round(ref.height * s);
  const region = await panelImage.clone()
    .extract({ left, top, width, height })
    .resize(ref.width, ref.height)
    .greyscale().raw().toBuffer();
  let match = 0;
  for (let i = 0; i < region.length; i++) {
    if (Math.abs(region[i] - ref.buf[i]) <= 30) match++;
  }
  return match / region.length;
};

const MATCH_THRESHOLD = 0.75;

const checkIsLevelUp = async (panelImage, s = 1) => {
  const [refLeft, refRight] = await Promise.all([refLeftPromise, refRightPromise]);
  const [scoreL, scoreR] = await Promise.all([
    matchRegion(panelImage, refLeft, labelLeft, s),
    matchRegion(panelImage, refRight, labelRight, s),
  ]);
  if (debug) console.log(`[checkIsLevelUp] left=${scoreL.toFixed(3)} right=${scoreR.toFixed(3)}`);
  return scoreL >= MATCH_THRESHOLD && scoreR >= MATCH_THRESHOLD;
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
    if (debug) await statImage.png().toFile(`xxx1-${i}.png`);
    if (await hasIncrease(statImage)) increase[statOrder[i]] = 1;
  }
  for (let i = 0; i < 4; i++) {
    if (i + 5 < startIdx) continue;
    const statImage = await newImage.clone().extract({ left: x2, top: y0 + i * dh, width: sw, height: sh });
    if (debug) await statImage.png().toFile(`xxx2-${i}.png`);
    if (await hasIncrease(statImage)) increase[statOrder[i + 5]] = 1;
  }
  return increase;
};

const checkIsGoodLevelUpImg = async (filePath, startStat) => {
  const { image, s } = await cropGameArea(sharp(filePath));
  const panelPipeline = await extractLevelUpPanel(image, s);
  // Materialize to buffer so subsequent .extract() calls work on the cropped panel,
  // not the original image (Sharp chains extracts against the source, not the prior extract)
  const panelBuf = await panelPipeline.toBuffer();
  if (debug) await sharp(panelBuf).png().toFile(`crop-level-up-${i}.png`);
  return findTotalStatIncrease(sharp(panelBuf), startStat, s);
};

const getStatIncreased = async (filePath, { expectMove = false } = {}) => {
  const increased = { count: 0 };
  const stopIdx = expectMove ? statOrder.length : statOrder.indexOf('move');
  const findIncreased = await checkIsGoodLevelUpImg(filePath, 0);
  if (findIncreased) {
    for (let k = 0; k < stopIdx; k++) {
      const name = statOrder[k];
      if (findIncreased[name]) increased[name] = 1;
    }
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

const checkIsGoodLevelUp = async (filePath, required) => {
  const expectMove = required.some(r => r.move === 1);
  const statIncreased = await getStatIncreased(filePath, { expectMove });
  console.error(statSummary(statIncreased));
  const isGood = checkGoodCondition(statIncreased, required);
  return { isGood, statIncreased };
};

const checkIsLevelUpByPath = async (filePath) => {
  const { image, s } = await cropGameArea(sharp(filePath));
  const panelPipeline = await extractLevelUpPanel(image, s);
  const panelBuf = await panelPipeline.toBuffer();
  return checkIsLevelUp(sharp(panelBuf), s);
};

const checkLevelUpgrade = async (required, saveScreenshot, characterName, initialPath = null) => {
  const total = 14;
  const checkPromises = [];

  const paths = initialPath ? [initialPath] : [];
  if (initialPath) {
    checkPromises.push(checkIsLevelUpByPath(initialPath).then(isLevelUp => isLevelUp ? 0 : null));
  }
  for (let i = 1; i <= total; i++) {
    const filePath = await saveScreenshot(`level-up-${i}.png`);
    const idx = paths.push(filePath) - 1;
    // Fire off level-up check concurrently with next screenshot
    checkPromises.push(
      checkIsLevelUpByPath(filePath).then(isLevelUp => isLevelUp ? idx : null)
    );
  }

  // All screenshots done; wait for any remaining checks
  const results = await Promise.all(checkPromises);
  const latestLevelUpIdx = results.reduce((max, r) => r !== null && r > max ? r : max, -1);

  if (latestLevelUpIdx === -1) {
    console.error('[checkLevelUpgrade] No level-up panel detected in any screenshot');
    return { isGood: false, statIncreased: { count: 0 } };
  }

  console.log(`[checkLevelUpgrade] latest level-up panel at index ${latestLevelUpIdx}`);
  const { isGood, statIncreased } = await checkIsGoodLevelUp(paths[latestLevelUpIdx], required);
  if (isGood) {
    console.error('Goooooooooooooodddddddddddddddddd');
  }
  return { isGood, statIncreased };
};

const waitLevelUp = async (playing, { sleepMs = 500 } = {}) => {
  const timeoutMs = parseInt(process.env.WAIT_LEVEL_UP_TIMEOUT || '15000', 10);
  const start = Date.now();
  for (let i = 0; Date.now() - start < timeoutMs; i++) {
    const screenshotPath = await playing.saveScreenshot('current.png');
    await playing.pressO();
    const { image, s } = await cropGameArea(sharp(screenshotPath));
    const panelBuf = await (await extractLevelUpPanel(image, s)).toBuffer();
    if (await checkIsLevelUp(sharp(panelBuf), s)) {
      console.log(`[waitLevelUp] detected at i=${i} +${Date.now() - start}ms`);
      const suffix = path.basename(screenshotPath, '.png').replace(/^current/, '');
      const levelUpPath = path.join(path.dirname(screenshotPath), `level-up-1${suffix}.png`);
      fs.renameSync(screenshotPath, levelUpPath);
      return levelUpPath;
    }
    await sleep(sleepMs);
  }
  console.log(`[waitLevelUp] gave up after ${Date.now() - start}ms`);
  return false;
};

module.exports = { checkIsGoodLevelUp, statSummary, checkGoodCondition, checkIsLevelUp, extractLevelUpPanel, checkLevelUpgrade, waitLevelUp };

if (debug) {
  (async () => {
    const { isGood, statIncreased } = await checkIsGoodLevelUp('tmp/level-up-7.png', [{ count: 1 }]);
    console.log({ isGood, statIncreased });
  })();
}