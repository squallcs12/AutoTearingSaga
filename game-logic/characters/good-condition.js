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
    const exclude = sorted[0].name;
    const required = nonZero.filter(({ name }) => name !== exclude);
    cond = { count: required.length };
    for (const { name } of required) cond[name] = 1;
  } else if (tier === 'avg') {
    cond = { count: nonZero.length - 2 };
    cond[sorted[0].name] = -1;
  } else { // bad
    cond = { count: nonZero.length - 3 };
    cond[sorted[0].name] = -1;
    cond[sorted[1].name] = -1;
  }

  if (g.move > 0) cond.move = 1;
  return [cond];
};

module.exports = { getGoodCondition };