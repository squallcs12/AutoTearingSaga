const { exec } = require("child_process");
exec('adb -s R3CN203BDKN pull storage/self/primary/duckstation/savestates/SLPS-03177_0.sav /home/bang/.local/share/duckstation/savestates/SLPS-03177_1.sav', (err1, stdout, stderr) => {
  if (err1) {
    console.log(err1)
  } else {
    console.log('Sync from phone to laptop');
  }
})