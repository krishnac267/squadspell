'use strict';

/**
 * Runs gradlew assembleDebug after ensuring android/local.properties has sdk.dir.
 * Install Android Studio (or SDK only) and set ANDROID_HOME, or create local.properties manually.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const androidDir = path.join(root, 'android');
const localProps = path.join(androidDir, 'local.properties');

function findSdk() {
  const env =
    (process.env.ANDROID_HOME && process.env.ANDROID_HOME.trim()) ||
    (process.env.ANDROID_SDK_ROOT && process.env.ANDROID_SDK_ROOT.trim());
  if (env && fs.existsSync(env)) return path.resolve(env);

  if (process.platform === 'win32') {
    const p = path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');
    if (fs.existsSync(p)) return p;
  }
  if (process.platform === 'darwin') {
    const p = path.join(process.env.HOME || '', 'Library', 'Android', 'sdk');
    if (fs.existsSync(p)) return p;
  }
  const linux = path.join(process.env.HOME || '', 'Android', 'Sdk');
  if (fs.existsSync(linux)) return linux;

  return null;
}

function readExistingSdkDir() {
  if (!fs.existsSync(localProps)) return null;
  const text = fs.readFileSync(localProps, 'utf8');
  const m = text.match(/^\s*sdk\.dir\s*=\s*(.+)\s*$/m);
  if (!m) return null;
  return m[1].trim().replace(/\\\\/g, '\\');
}

let sdk = readExistingSdkDir();
if (sdk && !fs.existsSync(sdk)) sdk = null;
if (!sdk) sdk = findSdk();

if (!sdk) {
  console.error(
    'Android SDK not found.\n' +
      '• Install Android Studio: https://developer.android.com/studio\n' +
      '• Then set ANDROID_HOME to your SDK path, or create:\n' +
      `  ${localProps}\n` +
      '  with one line: sdk.dir=C:/Users/YOU/AppData/Local/Android/Sdk\n' +
      '  (use forward slashes on Windows)'
  );
  process.exit(1);
}

const existing = readExistingSdkDir();
const needWrite = !existing || !fs.existsSync(existing);
if (needWrite) {
  const sdkLine = `sdk.dir=${sdk.replace(/\\/g, '/')}\n`;
  fs.writeFileSync(localProps, sdkLine);
  console.log('Wrote sdk.dir to android/local.properties');
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const task = process.argv[2] || 'assembleDebug';
const r = spawnSync(gradlew, [task, '--no-daemon'], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: process.platform === 'win32'
});
process.exit(r.status === null ? 1 : r.status);
