const sharp = require('sharp');
const path = require('path');
const { cropGameArea } = require('./calib');
sharp.cache(false);

// Reference: binarised "Staff" text (dark text -> 0, background -> 255)
const refPath = path.join(__dirname, '..', 'example', 'staff-menu', 'img.png');
const refPromise = sharp(refPath).greyscale().raw().toBuffer();
const refSize = { w: 90, h: 30 };

// Region in game area (1080x810 calibration) containing "Staff" text (2nd menu item)
// Menu can appear on right or left side depending on character position
const menuCrops = [
  { left: 775, top: 115, width: 90, height: 30 }, // right side
  { left: 134, top: 115, width: 90, height: 30 }, // left side
];
const THRESHOLD = 140;
const MATCH_THRESHOLD = 0.9;

const binarise = (buf) => {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] < THRESHOLD ? 0 : 255;
  }
  return out;
};

const isStaffMenu = async (filename) => {
  const { image, s } = await cropGameArea(sharp(filename));
  const gameBuf = await image.toBuffer();
  const refBuf = await refPromise;

  for (const menuCrop of menuCrops) {
    const curRaw = await sharp(gameBuf).extract({
      left: Math.round(menuCrop.left * s),
      top: Math.round(menuCrop.top * s),
      width: Math.round(menuCrop.width * s),
      height: Math.round(menuCrop.height * s),
    }).resize(refSize.w, refSize.h).greyscale().raw().toBuffer();
    const curBin = binarise(curRaw);
    let same = 0;
    for (let i = 0; i < refBuf.length; i++) {
      if (refBuf[i] === curBin[i]) same++;
    }
    const score = same / refBuf.length;
    if (require.main === module) console.log(`score: ${score.toFixed(4)}`);
    if (score > MATCH_THRESHOLD) return true;
  }
  return false;
};

module.exports = { isStaffMenu };

// CLI: node scene-detection/check-staff.js <screenshot.png>
if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node check-staff.js <screenshot.png>'); process.exit(1); }
  isStaffMenu(file).then(result => {
    console.log(`isStaffMenu: ${result}`);
  });
}
