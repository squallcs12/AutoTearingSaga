// Generate goodCondition array from a character's growth JSON.
//   good — all non-zero stats must increase
//   avg  — all non-zero stats except the lowest must increase
//   bad  — the 2 lowest non-zero stats must NOT increase
// If move > 0, move is always required.
const getGoodCondition = (character) => {
  const data = require(`./growth/${character}.json`);
  const g = data.growthRates;
  const tier = data.tier;

  const nonZero = Object.entries(g).filter(([, v]) => v > 0).map(([k, v]) => ({ name: k, growth: v }));
  const sorted = [...nonZero].sort((a, b) => a.growth - b.growth);

  let cond = {};
  if (tier === 'good') {
    cond = { count: nonZero.length };
    for (const { name } of nonZero) cond[name] = 1;
  } else if (tier === 'avg') {
    const exclude = sorted[0].name;
    const required = nonZero.filter(({ name }) => name !== exclude);
    cond = { count: required.length };
    for (const { name } of required) cond[name] = 1;
  } else { // bad
    const excluded = sorted.slice(0, 2).map(({ name }) => name);
    cond = { count: nonZero.length - 2 };
    for (const name of excluded) cond[name] = -1;
  }

  if (g.move > 0) cond.move = 1;
  return [cond];
};

module.exports = { getGoodCondition };