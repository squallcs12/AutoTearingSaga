const { execSync } = require('child_process');
const { getPhoneDevice, getAvdDevice, getBluestackDevice } = require('./android/adb-device');

const SAVE_PATH = '/storage/emulated/0/Android/data/com.github.stenzek.duckstation/files/savestates/SLPS-03177_0.sav';
const TMP_FILE = '/tmp/SLPS-03177_0.sav';

const DEVICE_RESOLVERS = {
  avd: getAvdDevice,
  bluestack: getBluestackDevice,
  phone: getPhoneDevice,
};

const ALIASES = { real: 'phone', device: 'phone', bs: 'bluestack' };

function resolveType(name) {
  const key = ALIASES[name] || name;
  if (!DEVICE_RESOLVERS[key]) {
    console.error(`Unknown device type: "${name}". Use: avd, bluestack, phone`);
    process.exit(1);
  }
  return key;
}

const [,, rawFrom, rawTo] = process.argv;

if (!rawFrom || !rawTo) {
  console.error('Usage: node sync.js <from> <to>');
  console.error('Device types: avd, bluestack, phone (aliases: real, device, bs)');
  console.error('Examples:');
  console.error('  yarn sync avd bluestack');
  console.error('  yarn sync phone avd');
  process.exit(1);
}

const fromType = resolveType(rawFrom);
const toType = resolveType(rawTo);

if (fromType === toType) {
  console.error(`Source and destination are the same: ${fromType}`);
  process.exit(1);
}

const fromDevice = DEVICE_RESOLVERS[fromType]();
const toDevice = DEVICE_RESOLVERS[toType]();

console.log(`Syncing save: ${fromType} (${fromDevice}) -> ${toType} (${toDevice})`);

execSync(`adb -s ${fromDevice} pull ${SAVE_PATH} ${TMP_FILE}`, { stdio: 'inherit' });
execSync(`adb -s ${toDevice} push ${TMP_FILE} ${SAVE_PATH}`, { stdio: 'inherit' });

console.log(`Done: ${fromType} -> ${toType}`);
