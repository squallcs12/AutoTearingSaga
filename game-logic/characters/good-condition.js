// Generate goodCondition from a character's growth JSON.
// Tiers based on max reachable stat increases (>2% chance):
//   S — cnt>=7, A — cnt>=6, B — cnt>=5, C — cnt>=4, D — cnt>=3
// +hp required.
// If move > 0, move is always required and count is reduced by 1.
const tierConfig = { S: 7, A: 6, B: 5, C: 4, D: 3 };
const tierOrder = ['D', 'C', 'B', 'A', 'S'];

const getGoodCondition = (character, tierOverride) => {
  const data = require(`./growth/${character}.json`);

  if (data.goodCondition && !tierOverride && !process.env.TIER_OVERRIDE) {
    return data.goodCondition;
  }

  const g = data.growthRates;
  const tier = tierOverride || process.env.TIER_OVERRIDE || data.tier;

  const cond = { count: tierConfig[tier], hp: 1 };

  if (g.move > 0) {
    cond.move = 1;
    cond.count = Math.max(1, cond.count - 1);
  }

  // Require the stat with the highest growth rate
  const statKeys = ['str', 'mag', 'skill', 'spd', 'luck', 'mst', 'def'];
  let maxStat = null;
  let maxRate = 0;
  for (const key of statKeys) {
    if (g[key] > maxRate) {
      maxRate = g[key];
      maxStat = key;
    }
  }
  if (maxStat) {
    cond[maxStat] = 1;
  }

  return [cond];
};

// Returns the next tier up, or null if already at S
const getNextTier = (character) => {
  const data = require(`./growth/${character}.json`);
  const tier = process.env.TIER_OVERRIDE || data.tier;
  const idx = tierOrder.indexOf(tier);
  if (idx < 0 || idx >= tierOrder.length - 1) return null;
  return tierOrder[idx + 1];
};

module.exports = { getGoodCondition, getNextTier };