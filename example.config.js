// Steps to execute the battle (movement + attack sequence).
// Available: O, X, 2O, up, down, left, right, up-left, up-right, down-left, down-right, wait
const fight = `
  up 1
  O
  O
`;

// Set to true if the current enemy is a boss (uses longer post-battle wait).
const isBoss = false;

// goodCondition is an array of objects (any match = success).
// In each object:
//   count      — minimum number of stats that must increase
//   str/skill/spd/luck/def/mag/mst/hp/move — 1 means MUST increase, -1 means must NOT increase
const goodCondition = [
  { count: 5, str: 1 },  // at least 5 stats, strength required
  { count: 6 },          // at least 6 stats (any combination)
];

// Set to true to automatically pull the save, git add, commit and push when a good result is found.
const syncGithub = false;

// Character name (used in commit messages and save tracking)
const characterName = 'kreiss';

// Number of levels to gain when running arena.e2e.js
const levelsToGain = 3;

module.exports = { fight, isBoss, goodCondition, syncGithub, characterName, levelsToGain };