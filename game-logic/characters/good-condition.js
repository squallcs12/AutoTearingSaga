// Generate goodCondition from a character's growth JSON.
// Tiers based on max reachable stat increases (>=1% chance):
//   S — cnt>=7, A — cnt>=6, B — cnt>=5, C — cnt>=4, D — cnt>=3
// +hp required.
// If move > 0, move is always required and count is reduced by 1.
const getGoodCondition = (character) => {
  const data = require(`./growth/${character}.json`);
  const g = data.growthRates;
  const tier = process.env.TIER_OVERRIDE || data.tier;

  const tierConfig = { S: 7, A: 6, B: 5, C: 4, D: 3 };
  const cond = { count: tierConfig[tier], hp: 1 };

  if (g.move > 0) {
    cond.move = 1;
    cond.count = Math.max(1, cond.count - 1);
  }

  return [cond];
};

module.exports = { getGoodCondition };