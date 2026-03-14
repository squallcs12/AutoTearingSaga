// Generate goodCondition from a character's growth JSON.
// Tiers based on max reachable stat increases (>=1% chance):
//   S — cnt>=6, A — cnt>=5, B — cnt>=4, C/D — cnt>=3
// +hp required, lowest stat must NOT increase.
// If move > 0, move is always required and count is reduced by 1.
const getGoodCondition = (character) => {
  const data = require(`./growth/${character}.json`);
  const g = data.growthRates;
  const tier = process.env.TIER_OVERRIDE || data.tier;

  const nonZero = Object.entries(g).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, growth: v }));
  const sorted = [...nonZero].sort((a, b) => a.growth - b.growth);

  const tierConfig = { S: 6, A: 5, B: 4, C: 3, D: 3 };
  const cond = { count: tierConfig[tier], hp: 1 };
  cond[sorted[0].name] = -1;

  if (g.move > 0) {
    cond.move = 1;
    cond.count = Math.max(1, cond.count - 1);
  }

  return [cond];
};

module.exports = { getGoodCondition };