const sharp = require('sharp');
sharp.cache(false);

// HP bar fixed position in game UI (character info panel bottom-right)
// Filled: bright orange (R>200, B<5), Empty: dark red (R>100, G<80, B<30)
const checkHp = async (filename) => {
  const { data, info } = await sharp(filename)
    .extract({ left: 732, top: 740, width: 120, height: 3 })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let filled = 0;
  let empty = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r > 200 && b < 5) filled++;
    else if (r > 100 && g < 80 && b < 30) empty++;
  }
  if (filled + empty === 0) return null;
  return filled / (filled + empty);
};

module.exports = { checkHp };