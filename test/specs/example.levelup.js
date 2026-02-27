// Steps executed before battle to position the character randomly.
// Each token is a step name optionally followed by a repeat count.
// Available: up, down, left, right, up-left, up-right, down-left, down-right
const forceRandom = `
  right 2
  down 1
`;

// Steps to execute the battle (movement + attack sequence).
// Available: O, X, 2O, up, down, left, right, up-left, up-right, down-left, down-right, wait
const fight = `
  up 1
  O
  O
`;

// Set to true if the current enemy is a boss (uses longer post-battle wait).
const isBoss = false;

// Stat numbers:
//   1: strength  2: skill  3: speed  4: luck   5: def
//   6: magic     7: mastery  8: hp   9: move
//
// goodCondition is an array of objects (any match = success).
// In each object:
//   count  — minimum number of stats that must increase
//   1..9   — 1 means stat MUST increase, -1 means stat must NOT increase
const goodCondition = [
  { count: 5, 1: 1 },   // at least 5 stats, strength required
  { count: 6 },          // at least 6 stats (any combination)
];

// Set to true to automatically pull the save, git add, commit and push when a good result is found.
const syncGithub = false;

// Number of levels to gain when running arena.e2e.js
const levelsToGain = 3;

module.exports = { forceRandom, fight, isBoss, goodCondition, syncGithub, levelsToGain };