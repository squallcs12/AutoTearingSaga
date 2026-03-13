// Steps to execute the battle (movement + attack sequence).
// Available: O, X, 2O, up, down, left, right, up-left, up-right, down-left, down-right, wait
const fight = `
  up 1
  O
  O
`;

// Set to true if the current enemy is a boss (uses longer post-battle wait).
const isBoss = false;

// Character name (used in commit messages and save tracking)
const characterName = 'kreiss';

// Set to true to automatically pull the save, git add, commit and push when a good result is found.
const syncGithub = false;

// Number of levels to gain when running arena.e2e.js
const levelsToGain = 3;

module.exports = { fight, isBoss, characterName, syncGithub, levelsToGain };
