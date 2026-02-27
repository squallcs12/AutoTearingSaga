const sharp = require('sharp');
sharp.cache(false);

const refBuffer = sharp('example/arena/img.png').raw().toBuffer();

const isArenaConfirm = async (filename) => {
  const [resolvedRefBuffer, currentBuffer] = await Promise.all([
    refBuffer,
    sharp(filename).extract({ left: 15, top: 470, width: 1050, height: 280 }).raw().toBuffer(),
  ]);

  let same = 0;
  for (let i = 0; i < resolvedRefBuffer.length; i++) {
    if (Math.abs(resolvedRefBuffer[i] - currentBuffer[i]) < 10) same++;
  }
  return same / resolvedRefBuffer.length > 0.9;
}

const test = async () => {
  console.log(await isArenaConfirm('example/arena/current.png'));
  console.log(await isArenaConfirm('example/arena/level-up-3.png'));
  console.log(await isArenaConfirm('example/arena/Screenshot_1666965174.png'));
}

module.exports = {isArenaConfirm}