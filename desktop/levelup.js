// Standalone desktop level-up automation (no WebdriverIO/Appium required).
// Run from project root: node desktop/levelup.js

const { levelupLoop } = require('../game-logic/levelup-loop');
const { checkLevelUpgrade } = require('./check-level');
const PlayingPage = require('./playing');
const { takeScreenshot } = require('./common');
levelupLoop(PlayingPage, takeScreenshot, checkLevelUpgrade).catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
