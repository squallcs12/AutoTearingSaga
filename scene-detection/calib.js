// Calibration width — all pixel coordinates in check-*.js were measured at 1080px wide.
const CALIB_WIDTH = 1080;

// Crop to the 4:3 game area and return { image, s }.
// Landscape: game is height*4/3 wide, centered horizontally — crop left/right bars.
// Portrait: game fills full width, crop bottom controller UI.
const cropGameArea = async (image) => {
  const { width, height } = await image.metadata();
  if (height >= width) {
    // Portrait
    const gameH = Math.round(width * 3 / 4);
    return { image: image.extract({ left: 0, top: 0, width, height: gameH }), s: width / CALIB_WIDTH };
  }
  // Landscape
  const gameW = Math.round(height * 4 / 3);
  const offsetX = Math.round((width - gameW) / 2);
  return { image: image.extract({ left: offsetX, top: 0, width: gameW, height }), s: gameW / CALIB_WIDTH };
};

module.exports = { CALIB_WIDTH, cropGameArea };
