// Standalone BlueStacks level-up automation.
// Run from project root: node bluestack/levelup.js

const { levelupLoop } = require('../game-logic/levelup-loop');
const { checkLevelUpgrade } = require('../scene-detection/check-level');
const PlayingPage = require('./playing');
const { takeScreenshot } = require('./common');
const { fight, isBoss } = require('../config');

levelupLoop(PlayingPage, takeScreenshot, checkLevelUpgrade, fight, isBoss).catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
