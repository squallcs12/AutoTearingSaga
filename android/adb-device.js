const { execSync, spawn } = require('child_process');

const isWindows = process.platform === 'win32';

const sleepSync = (ms) => {
  if (isWindows) {
    execSync(`powershell -c "Start-Sleep -Milliseconds ${ms}"`);
  } else {
    execSync(`sleep ${ms / 1000}`);
  }
};

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

const startAvdAndWait = (avdName) => {
  console.log(`No ADB devices found. Starting AVD "${avdName}"...`);
  if (isWindows) {
    execSync(`start "" emulator -avd ${avdName}`, { shell: 'cmd.exe', stdio: 'ignore' });
  } else {
    spawn('emulator', ['-avd', avdName], { detached: true, stdio: 'ignore' }).unref();
  }

  const timeoutSec = 120;
  const start = Date.now();
  while ((Date.now() - start) / 1000 < timeoutSec) {
    sleepSync(3000);
    const devices = getConnectedDevices();
    const emulator = devices.find(id => id.startsWith('emulator-'));
    if (emulator) {
      try {
        const bootComplete = execSync(`adb -s ${emulator} shell getprop sys.boot_completed`, { encoding: 'utf8' }).trim();
        if (bootComplete === '1') {
          console.log(`AVD "${avdName}" is ready (${emulator})`);
          return emulator;
        }
      } catch {}
    }
  }
  throw new Error(`Timed out waiting for AVD "${avdName}" to boot after ${timeoutSec}s`);
};

const getAvdDevice = () => {
  const emulators = getConnectedDevices().filter(id => id.startsWith('emulator-'));
  for (const id of emulators) {
    const avdName = execSync(`adb -s ${id} shell getprop ro.boot.qemu.avd_name`, { encoding: 'utf8' }).trim();
    if (avdName) return id;
  }
  if (emulators.length === 1) return emulators[0];
  if (getConnectedDevices().length === 0) {
    return startAvdAndWait('Medium_Phone');
  }
  throw new Error('No AVD emulator found. Run "adb devices" to check.');
};

const getBluestackDevice = () => {
  const emulators = getConnectedDevices().filter(id => id.startsWith('emulator-'));
  for (const id of emulators) {
    const avdName = execSync(`adb -s ${id} shell getprop ro.boot.qemu.avd_name`, { encoding: 'utf8' }).trim();
    if (!avdName) return id; // BlueStacks has no avd_name
  }
  throw new Error('No BlueStacks emulator found. Run "adb devices" to check.');
};

module.exports = { getPhoneDevice, getAvdDevice, getBluestackDevice };
