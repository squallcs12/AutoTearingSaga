const { execSync } = require('child_process');

const getConnectedDevices = () => {
  const output = execSync('adb devices').toString();
  return output.split('\n')
    .slice(1)
    .map(l => l.trim())
    .filter(l => l.endsWith('\tdevice') || l.endsWith(' device'))
    .map(l => l.split(/\s+/)[0]);
};

const getPhoneDevice = () => {
  const device = getConnectedDevices().find(id => !id.startsWith('emulator-'));
  if (!device) throw new Error('No real device found via adb devices');
  return device;
};

const getAvdDevice = () => {
  const emulators = getConnectedDevices().filter(id => id.startsWith('emulator-'));
  for (const id of emulators) {
    const avdName = execSync(`adb -s ${id} shell getprop ro.boot.qemu.avd_name`, { encoding: 'utf8' }).trim();
    if (avdName) return id;
  }
  if (emulators.length === 1) return emulators[0];
  throw new Error('No AVD emulator found. Run "adb devices" to check.');
};

module.exports = { getPhoneDevice, getAvdDevice };
