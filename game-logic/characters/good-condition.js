// Generate goodCondition array from a character's growth JSON.
//   good — cnt>=6 +hp, lowest stat must NOT increase
//   avg  — cnt>=5 +hp, lowest stat must NOT increase; OR cnt>=6 +hp (any stats)
//   bad  — cnt>=4 +hp, lowest stat must NOT increase
// If move > 0, move is always required and count is reduced by 1.
const getGoodCondition = (character) => {
  const data = require(`./growth/${character}.json`);
  const g = data.growthRates;
  const tier = process.env.TIER_OVERRIDE || data.tier;

  const nonZero = Object.entries(g).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, growth: v }));
  const sorted = [...nonZero].sort((a, b) => a.growth - b.growth);

  let cond = {};
  if (tier === 'good') {
    cond = { count: 6 };
    cond[sorted[0].name] = -1;
  } else if (tier === 'avg') {
    cond = { count: 5 };
    cond[sorted[0].name] = -1;
  } else { // bad
    cond = { count: 4 };
    cond[sorted[0].name] = -1;
  }

  cond.hp = 1;

  if (g.move > 0) {
    cond.move = 1;
    cond.count = Math.max(1, cond.count - 1);
  }

  if (tier === 'avg') {
    const cond2 = { count: 6, hp: 1 };
    if (g.move > 0) { cond2.move = 1; cond2.count = Math.max(1, cond2.count - 1); }
    return [cond, cond2];
  }
  return [cond];
};

module.exports = { getGoodCondition };