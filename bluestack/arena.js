// Standalone BlueStacks arena automation.
// Run from project root: node bluestack/arena.js

const { arenaLoop } = require('../game-logic/arena-loop');
const { checkLevelUpgrade } = require('../scene-detection/check-level');
const PlayingPage = require('./playing');
const { sleep, takeScreenshot } = require('./common');
const { levelsToGain } = require('../config');

arenaLoop(PlayingPage, sleep, takeScreenshot, checkLevelUpgrade, levelsToGain).catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
