const sharp = require('sharp');
const { existsSync } = require('fs');
const { cropGameArea } = require('./calib');
sharp.cache(false);

const confirmConfigs = [
  {
    ref: sharp('example/arena/android/img.png').raw().toBuffer(),
    crop: (s) => ({ left: Math.round(15 * s), top: Math.round(470 * s), width: Math.round(1050 * s), height: Math.round(280 * s) }),
    refSize: { w: 1050, h: 280 },
  },
  {
    ref: sharp('example/arena/desktop/img.png').raw().toBuffer(),
    crop: (s) => ({ left: 0, top: Math.round(518 * s), width: Math.round(1080 * s), height: Math.round(303 * s) }),
    refSize: { w: 1080, h: 303 },
  },
];

const winConfigs = [
  {
    ref: sharp('example/arena/android/win.png').raw().toBuffer(),
    crop: (s) => ({ left: 0, top: Math.round(525 * s), width: Math.round(1080 * s), height: Math.round(150 * s) }),
    refSize: { w: 1080, h: 150 },
  },
  ...(existsSync('example/arena/desktop/win.png') ? [{
    ref: sharp('example/arena/desktop/win.png').raw().toBuffer(),
    crop: (s) => ({ left: 0, top: Math.round(518 * s), width: Math.round(1080 * s), height: Math.round(303 * s) }),
    refSize: { w: 1080, h: 303 },
  }] : []),
];


const matchesAny = async (filename, configs) => {
  const { image, s } = await cropGameArea(sharp(filename));
  for (const { ref, crop, refSize } of configs) {
    const [refBuf, curBuf] = await Promise.all([
      ref,
      image.clone().extract(crop(s)).resize(refSize.w, refSize.h).raw().toBuffer(),
    ]);
    let same = 0;
    for (let i = 0; i < refBuf.length; i++) {
      if (Math.abs(refBuf[i] - curBuf[i]) < 10) same++;
    }
    if (same / refBuf.length > 0.9) return true;
  }
  return false;
};

const isArenaConfirm = (filename) => matchesAny(filename, confirmConfigs);
const isArenaWin     = (filename) => matchesAny(filename, winConfigs);

module.exports = { isArenaConfirm, isArenaWin };
