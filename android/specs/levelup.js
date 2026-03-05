// Input sequence to navigate battle menus and execute the fight.
const fight = `
  left
  O
  O
  O
  O
`;

// Set to true if the enemy is a boss (finishBoss waits longer and spams O at end).
const isBoss = true;

// Stat numbers: 1=strength 2=skill 3=speed 4=luck 5=def 6=magic 7=mastery 8=hp 9=move
//
// goodCondition format:
//   count  - minimum number of stats that must increase (if actual > count, also passes)
//   [1..9] - 1 = stat must increase, -1 = stat must NOT increase
//
// Array of condition objects — any match passes.
//
// Examples:
//   [{ count: 3, 1: 1, 3: 1 }]                 // need strength + speed + any 1 more
//   [{ count: 4, 4: -1 }]                       // 4+ stats, but NOT luck
//   [{ count: 4 }, { count: 3, 1: 1, 3: 1 }]   // either 4+ stats OR strength+speed+1
const goodCondition = [{ count: 6 }];

// Set to true to automatically pull the save file via adb and git commit+push on success.
const syncGithub = false;

const levelsToGain = 1

module.exports = { fight, isBoss, goodCondition, syncGithub, levelsToGain};
