const sharp = require('sharp');
const fs = require('fs');
const { getScale } = require('../scene-detection/calib');

const FACE_BOX = { left: 450, top: 40, width: 216, height: 243 };
const FACES_DIR = `${__dirname}/characters/faces`;

async function extractFace(imagePath) {
  const image = sharp(imagePath);
  const { width } = await image.metadata();
  const s = getScale(width);
  return image.extract({
    left:   Math.round(FACE_BOX.left   * s),
    top:    Math.round(FACE_BOX.top    * s),
    width:  Math.round(FACE_BOX.width  * s),
    height: Math.round(FACE_BOX.height * s),
  }).resize(FACE_BOX.width, FACE_BOX.height);
}

async function identifyCharacter(imagePath) {
  const faceFiles = fs.readdirSync(FACES_DIR).filter(f => f.endsWith('.png'));
  const curBuf = await (await extractFace(imagePath)).raw().toBuffer();
  let bestName = null;
  let bestMatch = 0;
  for (const file of faceFiles) {
    const refBuf = await sharp(`${FACES_DIR}/${file}`).resize(FACE_BOX.width, FACE_BOX.height).raw().toBuffer();
    let same = 0;
    for (let i = 0; i < refBuf.length; i++) {
      if (Math.abs(refBuf[i] - curBuf[i]) < 10) same++;
    }
    const match = same / refBuf.length;
    if (match > bestMatch) {
      bestMatch = match;
      bestName = file.replace('.png', '');
    }
  }
  console.log(`[levelup] face match: ${bestName} (${(bestMatch * 100).toFixed(1)}%)`);
  return bestName;
}

module.exports = { identifyCharacter };