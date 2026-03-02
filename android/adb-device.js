const { execSync } = require('child_process');

const getPhoneDevice = () => {
  const output = execSync('adb devices').toString();
  const device = output.split('\n')
    .slice(1)
    .map(l => l.trim())
    .filter(l => l.endsWith('\tdevice') || l.endsWith(' device'))
    .map(l => l.split(/\s+/)[0])
    .find(id => !id.startsWith('emulator-'));
  if (!device) throw new Error('No real device found via adb devices');
  return device;
};

module.exports = { getPhoneDevice };
