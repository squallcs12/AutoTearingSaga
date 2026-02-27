const sharp = require('sharp');
const _ = require('lodash');
const { exec } = require("child_process");

const { goodCondition, syncGithub } = require('./test/specs/levelup');
const { sleep } = require('./test/specs/common');
sharp.cache(false);

const debug = false;

const findColor = (color, colors) => {
  for (let i = 0; i < colors.length; i++) {
    if (_.isEqual(colors[i], color)) {
      return true;
    }
  }
  return false;
}

const totalStat = 9;

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
}

const sampleColorsPromise = loadSampleColors();


const checkIsLevelUp = async (newImage) => {
  const sampleColors = await sampleColorsPromise;
  newImage = await newImage.clone().greyscale().raw().toBuffer();
  let count = 0;
  for (let j = 0; j < newImage.length; j++) {
    const color = newImage[j];
    if (sampleColors.includes(color)) {
      count += 1;
    }
  }
  const percentage = count / newImage.length;
  return percentage >= 0.5;
}

// real
// [260, ]
// [220, 30]

// stat
// const panelStart = [145, 290];
// const panelStop = [930, 750];


// avd
const panelStart = [140, 227];
const panelStop = [920, 657];


// stat
const statBegin = [420, 270];
const stat2Begin = [700]
const statSize = [200, 30]
const statHeight = 40;

const findTotalStatIncrease = async (newImage, start) => {
  let increase = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    6: 0,
    7: 0,
    8: 0,
    9: 0,
  }
  for (let i = 0; i < 5; i++) {
    if (i + 1 <= start) {
      continue
    }
    const statImage = await newImage.clone().extract({
      left: statBegin[0] - panelStart[0],
      top: statBegin[1] + i * statHeight - panelStart[1],
      width: statSize[0],
      height: statSize[1],
    })
    
    if (debug) {
      await statImage.toFormat('jpg').toFile(`xxx1-${i}.jpg`)
    }

    if (await hasIncrease(statImage)) {
      increase[i + 1] = 1;
    }
  }
  for (let i = 0; i < 4; i++) {
    if (i + 6 <= start) {
      continue
    }
    const statImage = await newImage.clone().extract({
      left: stat2Begin[0] - panelStart[0],
      top: statBegin[1] + i * statHeight - panelStart[1],
      width: statSize[0],
      height: statSize[1],
    });

    if (debug) {
      await statImage.toFormat('jpg').toFile(`xxx2-${i}.jpg`)
    }

    if (await hasIncrease(statImage)) {
      increase[i + 6] = 1;
    }
  }
  return increase;
}

const hasIncrease = async (image) => {
  image = await image.raw().toBuffer({ resolveWithObject: true });
  for (let k = 0; k < image.data.length; k += 4) {
    const [r, g, b] = [image.data[k], image.data[k + 1], image.data[k + 2]];
    if ((g >= 220 && r <= 100 && b <= 100) || (g >= 180 && r <= 60 && b <= 60) || (g >= 150 && r <= 10 && b <= 60))  {
      return true;
    }
  }
}


const extractLevelUpPanel = async (image) => {
  return image.extract({
    left: panelStart[0],
    top: panelStart[1],
    width: panelStop[0] - panelStart[0],
    height: panelStop[1] - panelStart[1],
  });
}

const checkIsGoodLevelUpImg = async (i, startStat) => {
  const image = sharp(`level-up-${i}.png`);
  
  const newImage = await extractLevelUpPanel(image);

  if (debug) {
    await newImage.toFormat('jpg').toFile(`crop-level-up-${i}.jpg`)
  }
  const isLevelUp = await checkIsLevelUp(newImage);
  if (isLevelUp) {
    const totalStatIncrease = await findTotalStatIncrease(image, startStat);
    return totalStatIncrease;
  }
}

const getStatIncreased = async (total) => {
  let increased = {count: 0};
  let lastStatIncreased = 0;
  for (let i = 1; i <= total; i++) {
    // console.error({i});
    const findIncreased = await checkIsGoodLevelUpImg(i, lastStatIncreased);
    if (!findIncreased) {
      continue;
    }
    for (let k = lastStatIncreased + 1; k <= totalStat; k++) {
      if (findIncreased[k]) {
        increased[k] = 1;
        lastStatIncreased = k;
      }
    }
    if (lastStatIncreased === totalStat) {
      break;
    }
  }
  for (let k = 1; k <= totalStat; k++) {
    if (increased[k]) {
      increased.count += 1;
    }
  }
  return increased;
}

const checkIsGoodLevelUp = async (total, required) => {
  const statIncreased = await getStatIncreased(total);
  console.error(statSummary(statIncreased));
  const isGood = checkGoodCondition(statIncreased, required);
  return isGood;
}



const statName = {
  1: 'strength',
  2: 'skill',
  3: 'speed',
  4: 'luck',
  5: 'def',
  6: 'magic',
  7: 'mastery',
  8: 'hp',
  9: 'move',
  count: 'Count',
}

const statSummary = (stats) => {
  if (debug) {
    console.log({stats})
  }
  const summary = [stats.count];
  for (let i = 1; i <= totalStat; i++) {
    if(stats[i]) {
      summary.push(statName[i])
    }
  }
  return summary;
}

const isGoodCondition = (isGood, required) => {
  if (required.count && isGood.count > required.count) {  // more than expect
    return true;
  }
  if (isGood.count < required.count) {
    return false;
  }

  for (const k in required) { // equal expect
    if (required[k] === -1 && isGood[k]) {
      return false;
    }
    if (required[k] === 1 && !isGood[k]) {
      return false;
    }
  }
  return true;
}

const checkGoodCondition = (isGood, required) => {
  for (let i = 0; i < required.length; i++) {
    if (isGoodCondition(isGood, required[i])) {
      return true;
    }
  }
  return false;
}

const checkLevelUpgrade = async (required) => {
  const total = 7;
  for (let i = 1; i <= total; i++) {
    await sleep(400);
    await driver.saveScreenshot(`level-up-${i}.png`);
  }
  const good = await checkIsGoodLevelUp(total, required);
  if (good) {
    console.error('Goooooooooooooodddddddddddddddddd')
  }
  if (good && syncGithub) {
    exec('adb -s emulator-5554 pull storage/self/primary/duckstation/savestates/SLPS-03177_1.sav SLPS-03177_0.sav', (err1, stdout, stderr) => {
      exec('git add .', (err1, stdout, stderr) => {
        exec('git cm -m "update save file"', (err1, stdout, stderr) => {
          exec('git push', (err1, stdout, stderr) => {
          })
        })
      })
    });
  }
  return good;
}


module.exports = { checkIsGoodLevelUp, statSummary, checkGoodCondition, checkIsLevelUp, findColor, extractLevelUpPanel, checkLevelUpgrade }

const func = async () => {
  const good = await checkIsGoodLevelUp(7, goodCondition);
  console.log({good})
}
if (debug) {
  func();
}

