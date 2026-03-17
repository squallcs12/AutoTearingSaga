const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { saveFaceFromScreenshot } = require('../game-logic/identify-character');

const FACES_DIR = path.join(__dirname, '..', 'game-logic', 'characters', 'faces');
const TMP_DIR = path.join(__dirname, '..', 'tmp');

const args = process.argv.slice(2);
const modeIdx = args.indexOf('-m');
const mode = modeIdx !== -1 ? args[modeIdx + 1] : 'desktop';
const name = args.find((a, i) => a !== '-m' && (modeIdx === -1 || i !== modeIdx + 1));

if (!name) {
  console.error('Usage: node scripts/take-face.js <name> [-m desktop|emu|phone]');
  process.exit(1);
}

async function screenshotDesktop() {
  const { takeScreenshot } = require('../desktop/common');
  return takeScreenshot('face-capture.png');
}

async function screenshotAdb(device) {
  const rawPath = path.join(TMP_DIR, 'face-capture.raw.png');
  const destPath = path.join(TMP_DIR, 'face-capture.png');
  execSync(`adb -s ${device} exec-out screencap -p > "${rawPath}"`);
  // Just save raw — saveFaceFromScreenshot handles game area extraction
  fs.renameSync(rawPath, destPath);
  return destPath;
}

async function main() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  let screenshotPath;
  if (mode === 'desktop') {
    screenshotPath = await screenshotDesktop();
  } else if (mode === 'emu') {
    const { getTargetDevice } = require('../android/adb-device');
    screenshotPath = await screenshotAdb(getTargetDevice());
  } else if (mode === 'phone') {
    const { getPhoneDevice } = require('../android/adb-device');
    screenshotPath = await screenshotAdb(getPhoneDevice());
  } else {
    console.error(`Unknown mode: ${mode}. Use desktop, emu, or phone.`);
    process.exit(1);
  }

  const outputPath = path.join(FACES_DIR, `${name}.png`);
  if (fs.existsSync(outputPath)) {
    console.error(`Face already exists: ${outputPath}. Delete it first to overwrite.`);
    process.exit(1);
  }
  await saveFaceFromScreenshot(screenshotPath, outputPath);
  console.log(`Saved face for "${name}" to ${outputPath}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
