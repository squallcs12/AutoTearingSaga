const { exec } = require("child_process");
exec('adb -s R3CN203BDKN pull storage/self/primary/duckstation/savestates/SLPS-03177_0.sav /tmp/', (err1, stdout, stderr) => {
  exec('adb -s emulator-5554 push /tmp/SLPS-03177_0.sav storage/self/primary/duckstation/savestates/SLPS-03177_0.sav', (err2, stdout, stderr) => {
    if (err1 || err2) {
      console.log(err1, err2)
    } else {
      console.log('Sync from phone to emulator');
    }
  })
})