// Standalone desktop arena automation (no WebdriverIO/Appium required).
// Run from project root: node desktop/arena.js

const { arenaLoop } = require('../game-logic/arena-loop');
const { checkLevelUpgrade } = require('./check-level');
const PlayingPage = require('./playing');
const { sleep, takeScreenshot } = require('./common');
const { goodCondition, levelsToGain } = require('../config');

arenaLoop(PlayingPage, sleep, takeScreenshot, checkLevelUpgrade, goodCondition, levelsToGain).catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});