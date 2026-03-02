// Calibration width — all pixel coordinates in check-*.js were measured at 1080px wide.
// Android height included on-screen controller UI, so only width is used for scaling.
const CALIB_WIDTH = 1080;

const getScale = (imageWidth) => imageWidth / CALIB_WIDTH;

module.exports = { CALIB_WIDTH, getScale };
