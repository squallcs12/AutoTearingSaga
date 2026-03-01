const { copyFileSync } = require('fs');
const src  = 'C:\\Users\\daotr\\AppData\\Local\\DuckStation\\savestates\\SLPS-03177_4.sav';
const dest = 'SLPS-03177_0.sav';
copyFileSync(src, dest);
console.log(`Copied ${src} -> ${dest}`);
