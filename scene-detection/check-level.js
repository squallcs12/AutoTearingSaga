const sharp = require('sharp');
const { sleep, statOrder } = require('../utils');
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
const labelLeft  = { x: 420 - 390, y: 260 - 254 }; // (30, 6)
const labelRight = { x: 700 - 390, y: 260 - 254 }; // (310, 6)

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

// Combined: check if level-up panel AND detect which stats increased via green pixels
const checkLevelUpAndStats = async (filePath) => {
  const panelPipeline = await extractLevelUpPanel(sharp(filePath));
  const panelBuf = await panelPipeline.toBuffer();
  const panelImage = sharp(panelBuf);
  const isLevelUp = await checkIsLevelUp(panelImage.clone());
  if (!isLevelUp) return { isLevelUp: false, statIncreased: null };

  const increase = {};
  for (const st of statOrder) increase[st] = 0;
  const x1 = statBegin[0]  - panelStart[0];
  const x2 = stat2Begin[0] - panelStart[0];
  const y0 = statBegin[1]  - panelStart[1];
  const dh = statHeight;
  const sw = statSize[0];
  const sh = statSize[1];

  for (let i = 0; i < 5; i++) {
    const statImage = panelImage.clone().extract({ left: x1, top: y0 + i * dh, width: sw, height: sh });
    if (await hasIncrease(statImage)) increase[statOrder[i]] = 1;
  }
  for (let i = 0; i < 4; i++) {
    const statImage = panelImage.clone().extract({ left: x2, top: y0 + i * dh, width: sw, height: sh });
    if (await hasIncrease(statImage)) increase[statOrder[i + 5]] = 1;
  }
  increase.count = Object.values(increase).reduce((a, b) => a + b, 0);
  return { isLevelUp: true, statIncreased: increase };
};

// avd
const panelStart = [390, 254];
const panelStop  = [920, 484];

// stat regions (green arrow detection — shifted 150px right, 50px wide)
const statBegin  = [570, 270];
const stat2Begin = [850];
const statSize   = [50, 30];
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
  const panelPipeline = await extractLevelUpPanel(sharp(filePath));
  // Materialize to buffer so subsequent .extract() calls work on the cropped panel,
  // not the original image (Sharp chains extracts against the source, not the prior extract)
  const panelBuf = await panelPipeline.toBuffer();
  if (debug) await sharp(panelBuf).png().toFile(`crop-level-up-${i}.png`);
  return findTotalStatIncrease(sharp(panelBuf), startStat);
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
  if (required.exact) {
    if (isGood.count !== required.exact) return false;
  } else {
    if (required.count && isGood.count > required.count) return true; // more than expect
    if (isGood.count < required.count) return false;
  }
  for (const k in required) {
    if (k === 'count' || k === 'exact') continue;
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

const checkIsLevelUpByPath = async (filePath, signal) => {
  if (signal?.aborted) return false;
  const panelPipeline = await extractLevelUpPanel(sharp(filePath));
  if (signal?.aborted) return false;
  const panelBuf = await panelPipeline.toBuffer();
  if (signal?.aborted) return false;
  return checkIsLevelUp(sharp(panelBuf));
};

const checkLevelUpgrade = async (required, saveScreenshot, characterName, initialPath = null, playing, beforeFightPath) => {
  const total = 14;
  let seenPanel = false;
  let i = 1;

  if (initialPath) {
    if (await checkIsLevelUpByPath(initialPath)) seenPanel = true;
    else i = total + 1; // no panel in initial path, skip loop
  }

  for (; i <= total; i++) {
    const p = await saveScreenshot(`level-up-${i + 1}.png`);
    const isLevelUp = await checkIsLevelUpByPath(p);
    if (isLevelUp) {
      seenPanel = true;
    } else if (seenPanel) {
      break;
    }
  }

  if (!seenPanel) {
    console.error('[checkLevelUpgrade] No level-up panel detected in any screenshot');
    return { isGood: false, statIncreased: { count: 0 } };
  }

  console.log(`[checkLevelUpgrade] panel gone after ${i} screenshots`);

  await playing.pressX();
  await playing.pressX();
  await playing.pressX();
  await playing.pressTriangle();
  const afterPath = await saveScreenshot('after-fight.png');
  await playing.pressX();
  const beforePath = beforeFightPath || path.join(path.dirname(afterPath), 'before-fight.png');
  const statIncreased = await detectStatChanges(beforePath, afterPath);
  console.error(statSummary(statIncreased));
  const isGood = checkGoodCondition(statIncreased, required);
  if (isGood) console.error('Goooooooooooooodddddddddddddddddd');
  return { isGood, statIncreased };
};

// Panel-based stat detection: read green arrows directly from level-up screenshots
const checkLevelUpgradePanel = async (required, saveScreenshot, characterName, initialPath = null, playing, beforeFightPath) => {
  const total = 14;
  let bestStat = null;

  const checkFile = async (filePath) => {
    const result = await checkLevelUpAndStats(filePath);
    if (result.isLevelUp && result.statIncreased && result.statIncreased.count > (bestStat?.count || 0)) {
      bestStat = result.statIncreased;
    }
    return result.isLevelUp;
  };

  let seenPanel = false;
  let i = 1;
  if (initialPath) {
    if (await checkFile(initialPath)) seenPanel = true;
    else i = total + 1;
  }

  for (; i <= total; i++) {
    const p = await saveScreenshot(`level-up-${i + 1}.png`);
    if (await checkFile(p)) {
      seenPanel = true;
    } else if (seenPanel) {
      break;
    }
  }

  if (!seenPanel || !bestStat) {
    console.error('[checkLevelUpgradePanel] No level-up panel detected');
    return { isGood: false, statIncreased: { count: 0 } };
  }

  console.log(`[checkLevelUpgradePanel] panel gone after ${i} screenshots`);
  console.error(statSummary(bestStat));
  const isGood = checkGoodCondition(bestStat, required);
  if (isGood) console.error('Goooooooooooooodddddddddddddddddd');
  return { isGood, statIncreased: bestStat };
};

const waitLevelUp = async (playing, { sleepMs = 500 } = {}) => {
  const timeoutMs = parseInt(process.env.WAIT_LEVEL_UP_TIMEOUT || '15000', 10);
  const start = Date.now();
  for (let i = 0; Date.now() - start < timeoutMs; i++) {
    const screenshotPath = await playing.saveScreenshot('current.png');
    await playing.pressO();
    const panelBuf = await (await extractLevelUpPanel(sharp(screenshotPath))).toBuffer();
    if (await checkIsLevelUp(sharp(panelBuf))) {
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

// Stat value box positions in normalized 1080x810 game area space
const statBoxes = [
  { stat: 'str',   x: 195, y: 349, w: 48, h: 40 },
  { stat: 'skill', x: 195, y: 397, w: 48, h: 40 },
  { stat: 'spd',   x: 195, y: 445, w: 48, h: 40 },
  { stat: 'def',   x: 195, y: 493, w: 48, h: 40 },
  { stat: 'mag',   x: 380, y: 349, w: 48, h: 40 },
  { stat: 'luck',  x: 380, y: 397, w: 48, h: 40 },
  { stat: 'mst',   x: 380, y: 445, w: 48, h: 40 },
  { stat: 'hp',    x: 373, y: 150, w: 65, h: 40 },
  { stat: 'move',  x: 360, y: 228, w: 70, h: 40 },
];

const WHITE_THRESHOLD = 10;
const DIFF_THRESHOLD = 20;

const detectStatChanges = async (beforePath, afterPath) => {
  const [before, after] = await Promise.all([
    sharp(beforePath).raw().toBuffer({ resolveWithObject: true }),
    sharp(afterPath).raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height, channels } = before.info;

  const diff = Buffer.alloc(width * height);
  for (let i = 0; i < diff.length; i++) {
    for (let c = 0; c < channels; c++) {
      if (Math.abs(before.data[i * channels + c] - after.data[i * channels + c]) > DIFF_THRESHOLD) {
        diff[i] = 255;
        break;
      }
    }
  }

  const increased = { count: 0 };
  for (const b of statBoxes) {
    let white = 0;
    for (let row = b.y; row < b.y + b.h; row++) {
      for (let col = b.x; col < b.x + b.w; col++) {
        if (diff[row * width + col] === 255) white++;
      }
    }
    if (white >= WHITE_THRESHOLD) { increased[b.stat] = 1; increased.count++; }
  }
  return increased;
};

module.exports = { checkIsGoodLevelUp, statSummary, checkGoodCondition, checkIsLevelUp, checkLevelUpAndStats, extractLevelUpPanel, checkLevelUpgrade, checkLevelUpgradePanel, waitLevelUp, detectStatChanges };

if (debug) {
  (async () => {
    const { isGood, statIncreased } = await checkIsGoodLevelUp('tmp/level-up-7.png', [{ count: 1 }]);
    console.log({ isGood, statIncreased });
  })();
}