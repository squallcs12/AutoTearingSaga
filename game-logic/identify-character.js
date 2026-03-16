const sharp = require('sharp');
const fs = require('fs');

const FACE_W = 216;
const FACE_H = 243;
const CALIB_W = 1080;
const CALIB_H = 810; // 1080 * 3/4
const MIN_MATCH = 0.95;
const FACES_DIR = `${__dirname}/characters/faces`;

// Find the first non-black row (skip status bar / black bar at top)
async function findGameTop(imagePath, width, maxScan) {
  const { data, info } = await sharp(imagePath).removeAlpha()
    .extract({ left: 0, top: 0, width, height: Math.min(maxScan, 300) })
    .raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const stride = width * ch;
  for (let y = 0; y < Math.min(maxScan, 300); y++) {
    let sum = 0;
    for (let x = Math.round(width * 0.1); x < Math.round(width * 0.9); x += 10) {
      const i = y * stride + x * ch;
      sum += data[i] + data[i + 1] + data[i + 2];
    }
    const samples = Math.ceil((Math.round(width * 0.9) - Math.round(width * 0.1)) / 10);
    if (sum / samples > 30) return y;
  }
  return 0;
}

// Extract the 4:3 game area from the screenshot, normalized to 1080x810
async function extractGameArea(imagePath) {
  const { width, height } = await sharp(imagePath).metadata();
  const isLandscape = width > height;
  let left, top, w, h;
  if (isLandscape) {
    h = height;
    w = Math.round(h * 4 / 3);
    left = Math.round((width - w) / 2);
    top = 0;
  } else {
    w = width;
    h = Math.round(w * 3 / 4);
    left = 0;
    top = await findGameTop(imagePath, width, height);
    h = Math.min(h, height - top);
  }
  return sharp(imagePath).extract({ left, top, width: w, height: h }).resize(CALIB_W, CALIB_H);
}

// Find the Y position of the popup's top golden border in 1080x810 space.
// The popup border is a solid olive/gold line spanning most of the game width.
async function findPopupBorderY(gameImage) {
  const { data, info } = await gameImage.clone().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  const getPixel = (x, y) => {
    const i = (y * w + x) * ch;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };

  // Scan for rows where nearly all sampled pixels are golden/olive
  // Gold border color: R>150, G>140, B<100, R-B>60, G-B>50
  const SOLID_THRESHOLD = 300; // out of 400 samples (x=100..900 step 2)
  for (let y = 0; y < h; y++) {
    let goldCount = 0;
    for (let x = 100; x < 900; x += 2) {
      const p = getPixel(x, y);
      if (p.r > 150 && p.g > 140 && p.b < 100 && p.r - p.b > 60 && p.g - p.b > 50) {
        goldCount++;
      }
    }
    if (goldCount >= SOLID_THRESHOLD) {
      return y;
    }
  }
  return -1;
}

// Normalized Cross-Correlation: compares image structure, invariant to brightness/contrast
function ncc(a, b) {
  let sumA = 0, sumB = 0;
  for (let i = 0; i < a.length; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / a.length, meanB = sumB / b.length;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < a.length; i++) {
    const da = a[i] - meanA, db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  return num / Math.sqrt(denA * denB);
}

// Slide reference face over a region of the game image, return best NCC score
function slidingNcc(game, gw, ref, fw, fh, searchX, searchY, searchW, searchH, step) {
  // Precompute ref stats
  let sumR = 0;
  for (let i = 0; i < ref.length; i++) sumR += ref[i];
  const meanR = sumR / ref.length;
  let denR = 0;
  for (let i = 0; i < ref.length; i++) denR += (ref[i] - meanR) ** 2;
  if (denR === 0) return { score: 0, x: 0, y: 0 };

  let bestScore = -1, bestX = 0, bestY = 0;
  for (let sy = searchY; sy <= searchY + searchH - fh; sy += step) {
    for (let sx = searchX; sx <= searchX + searchW - fw; sx += step) {
      let sumP = 0;
      for (let fy = 0; fy < fh; fy++)
        for (let fx = 0; fx < fw; fx++)
          sumP += game[(sy + fy) * gw + (sx + fx)];
      const meanP = sumP / ref.length;
      let num = 0, denP = 0;
      for (let fy = 0; fy < fh; fy++) {
        for (let fx = 0; fx < fw; fx++) {
          const pv = game[(sy + fy) * gw + (sx + fx)] - meanP;
          const rv = ref[fy * fw + fx] - meanR;
          num += pv * rv;
          denP += pv * pv;
        }
      }
      const score = denP > 0 ? num / Math.sqrt(denP * denR) : 0;
      if (score > bestScore) { bestScore = score; bestX = sx; bestY = sy; }
    }
  }
  return { score: bestScore, x: bestX, y: bestY };
}

async function identifyCharacter(imagePath) {
  const faceFiles = fs.readdirSync(FACES_DIR).filter(f => f.endsWith('.png'));
  if (faceFiles.length === 0) {
    console.log('[levelup] no face images in', FACES_DIR);
    return null;
  }

  const gameImage = await extractGameArea(imagePath);
  const borderY = await findPopupBorderY(gameImage);

  if (borderY < 0) {
    console.log('[levelup] could not find popup golden border');
    return null;
  }

  const position = borderY < CALIB_H / 2 ? 'TOP' : 'BOTTOM';
  console.log(`[levelup] popup border at y=${borderY} (${position})`);

  // Get greyscale game area pixels for sliding search
  const gameBuf = await gameImage.clone().greyscale().raw().toBuffer();

  // Search the full game height — border detection is unreliable due to terrain colors
  const searchX = 350, searchW = 350;
  const searchY = 0, searchH = CALIB_H;

  let bestName = null, bestScore = -1, bestPos = {};
  for (const file of faceFiles) {
    const refBuf = await sharp(`${FACES_DIR}/${file}`).resize(FACE_W, FACE_H).greyscale().raw().toBuffer();
    // Coarse pass (step=10)
    const coarse = slidingNcc(gameBuf, CALIB_W, refBuf, FACE_W, FACE_H, searchX, searchY, searchW, searchH, 10);
    // Refine around best (step=1, ±15px)
    const rx = Math.max(searchX, coarse.x - 15), ry = Math.max(searchY, coarse.y - 15);
    const rw = Math.min(30, searchX + searchW - rx), rh = Math.min(30, searchY + searchH - ry);
    const fine = slidingNcc(gameBuf, CALIB_W, refBuf, FACE_W, FACE_H, rx, ry, rw + FACE_W, rh + FACE_H, 1);
    console.log(`[levelup]   ${file}: NCC=${(fine.score * 100).toFixed(1)}% at (${fine.x},${fine.y})`);
    if (fine.score > bestScore) {
      bestScore = fine.score;
      bestName = file.replace('.png', '');
      bestPos = fine;
    }
  }

  console.log(`[levelup] face match: ${bestName} (${(bestScore * 100).toFixed(1)}%) at (${bestPos.x},${bestPos.y})`);
  if (bestScore < MIN_MATCH) {
    console.log(`[levelup] face match below ${MIN_MATCH * 100}% threshold, ignoring`);
    return null;
  }
  return bestName;
}

async function saveFaceFromScreenshot(imagePath, outputPath) {
  const gameImage = await extractGameArea(imagePath);

  await gameImage.clone()
    .extract({ left: 450, top: 40, width: FACE_W, height: FACE_H })
    .toFile(outputPath);
  console.log(`[levelup] face saved to ${outputPath}`);
}

module.exports = { identifyCharacter, extractGameArea, saveFaceFromScreenshot };
