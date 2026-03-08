// Generate goodCondition array from a character's growth JSON.
//   good — all non-zero stats except the lowest must increase
//   avg  — the 2 lowest non-zero stats must NOT increase
//   bad  — the 3 lowest non-zero stats must NOT increase
// If move > 0, move is always required.
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
    cond = { count: 5 };
    cond[sorted[0].name] = -1;
  }

  if (g.move > 0) {
    cond.move = 1;
    cond.count = Math.max(1, cond.count - 1);
  }
  return [cond];
};

module.exports = { getGoodCondition };