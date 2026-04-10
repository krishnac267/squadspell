'use strict';

/**
 * After pkg: patch SquadSpell.exe PE header so Windows uses GUI subsystem (no console window).
 * End users only need one file: SquadSpell.exe
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dist = path.join(__dirname, '..', 'dist');
const exePath = path.join(dist, 'SquadSpell.exe');

function sleepBrief() {
  try {
    if (process.platform === 'win32') {
      execSync('ping 127.0.0.1 -n 2 > nul', { stdio: 'ignore' });
    } else {
      execSync('sleep 1', { stdio: 'ignore' });
    }
  } catch {
    /* ignore */
  }
}

function readExeWithRetry(filePath) {
  let lastErr;
  for (let i = 0; i < 10; i++) {
    try {
      return fs.readFileSync(filePath);
    } catch (e) {
      lastErr = e;
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        sleepBrief();
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

function writeExeWithRetry(filePath, buf) {
  let lastErr;
  for (let i = 0; i < 10; i++) {
    try {
      fs.writeFileSync(filePath, buf);
      return;
    } catch (e) {
      lastErr = e;
      if (e.code === 'EBUSY' || e.code === 'EPERM') {
        sleepBrief();
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

const IMAGE_SUBSYSTEM_WINDOWS_GUI = 2;
const IMAGE_SUBSYSTEM_WINDOWS_CUI = 3;

function patchExeToNoConsole(filePath) {
  const buf = readExeWithRetry(filePath);
  if (buf.length < 0x100) throw new Error('File too small');

  const peOffset = buf.readUInt32LE(0x3c);
  if (peOffset + 0x100 > buf.length) throw new Error('Invalid PE offset');

  const peSig = buf.readUInt32LE(peOffset);
  if (peSig !== 0x00004550) throw new Error('Not a PE executable (missing PE\\0\\0)');

  const coffStart = peOffset + 4;
  const optionalStart = coffStart + 20;
  const magic = buf.readUInt16LE(optionalStart);
  if (magic !== 0x20b && magic !== 0x10b) {
    throw new Error(`Unknown optional header magic: 0x${magic.toString(16)}`);
  }

  const subsystemOffset = optionalStart + 0x44;
  const current = buf.readUInt16LE(subsystemOffset);

  if (current === IMAGE_SUBSYSTEM_WINDOWS_GUI) {
    console.log('SquadSpell.exe: already GUI subsystem (no console)');
    return;
  }

  if (current !== IMAGE_SUBSYSTEM_WINDOWS_CUI) {
    console.warn(`SquadSpell.exe: unexpected subsystem ${current}, patching to GUI anyway`);
  }

  buf.writeUInt16LE(IMAGE_SUBSYSTEM_WINDOWS_GUI, subsystemOffset);
  writeExeWithRetry(filePath, buf);
  console.log('SquadSpell.exe: patched to Windows GUI subsystem (no console window)');
}

function cleanupOldLaunchers() {
  const oldVbs = path.join(dist, 'Launch SquadSpell (no console).vbs');
  if (fs.existsSync(oldVbs)) {
    fs.unlinkSync(oldVbs);
    console.log('Removed legacy VBS launcher (single SquadSpell.exe is enough)');
  }
}

if (!fs.existsSync(exePath)) {
  console.error('Missing', exePath, '— run pkg first');
  process.exit(1);
}

try {
  patchExeToNoConsole(exePath);
  cleanupOldLaunchers();
} catch (e) {
  console.error('PE patch failed:', e.message);
  console.error('You can still run SquadSpell.exe; a console window may appear.');
  process.exit(1);
}
