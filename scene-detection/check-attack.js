const sharp = require('sharp');
const path = require('path');
const { cropGameArea } = require('./calib');
sharp.cache(false);

// Reference: binarised "Attack" text (dark text -> 0, background -> 255)
const refPath = path.join(__dirname, '..', 'example', 'attack-menu', 'img.png');
const refPromise = sharp(refPath).greyscale().raw().toBuffer();
const refSize = { w: 90, h: 30 };

// Region in game area (1080x810 calibration) containing "Attack" text
const menuCrop = { left: 775, top: 70, width: 90, height: 30 };
const THRESHOLD = 140;
const MATCH_THRESHOLD = 0.9;

const binarise = (buf) => {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] < THRESHOLD ? 0 : 255;
  }
  return out;
};

const isAttackMenu = async (filename) => {
  const { image, s } = await cropGameArea(sharp(filename));
  const gameBuf = await image.toBuffer();
  const [refBuf, curRaw] = await Promise.all([
    refPromise,
    sharp(gameBuf).extract({
      left: Math.round(menuCrop.left * s),
      top: Math.round(menuCrop.top * s),
      width: Math.round(menuCrop.width * s),
      height: Math.round(menuCrop.height * s),
    }).resize(refSize.w, refSize.h).greyscale().raw().toBuffer(),
  ]);
  const curBin = binarise(curRaw);
  let same = 0;
  for (let i = 0; i < refBuf.length; i++) {
    if (refBuf[i] === curBin[i]) same++;
  }
  const score = same / refBuf.length;
  if (require.main === module) console.log(`score: ${score.toFixed(4)}`);
  return score > MATCH_THRESHOLD;
};

module.exports = { isAttackMenu };

// CLI: node scene-detection/check-attack.js <screenshot.png>
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node check-attack.js <screenshot.png>'); process.exit(1); }
  isAttackMenu(file).then(result => {
    console.log(`isAttackMenu: ${result}`);
  });
}
