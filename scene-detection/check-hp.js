const sharp = require('sharp');
const { cropGameArea } = require('./calib');
sharp.cache(false);

// HP bar: filled=orange (R>200, B<5), empty=dark red (R>100, G<80, B<30)
// Coordinates calibrated at 1080px wide; scaled uniformly by image width.
const checkHp = async (filename) => {
  const { image, s } = await cropGameArea(sharp(filename));

  const { data, info } = await image
    .extract({
      left:   Math.round(732 * s),
      top:    Math.round(742 * s),
      width:  Math.round(135 * s),
      height: Math.max(1, Math.round(8 * s)),
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let filled = 0, empty = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 200 && b < 5) filled++;
    else if (r > 100 && g < 80 && b < 30) empty++;
  }
  if (filled + empty === 0) return null;
  return filled / (filled + empty);
};

module.exports = { checkHp };
