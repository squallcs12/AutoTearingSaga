const speed = parseFloat(process.env.EMULATOR_SPEED || 1);
const sleep = (ms) => new Promise(r => setTimeout(r, ms / speed));
module.exports = { sleep };