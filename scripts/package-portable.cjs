'use strict';

/**
 * Builds dist/SquadSpell-Portable/ for sharing:
 *   - SquadSpell.exe (embedded Node server — run this before Wi‑Fi host from the extension)
 *   - chrome-extension/ (Load unpacked in Chrome)
 *   - README + optional launcher .bat
 *
 * Run: npm run extension:sync && node scripts/package-portable.cjs
 * Or:  npm run package:release  (builds exe first, then this)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const outDir = path.join(dist, 'SquadSpell-Portable');
const exeSrc = path.join(dist, 'SquadSpell.exe');
const extSrc = path.join(root, 'chrome-extension');

function main() {
  execSync(`node "${path.join(root, 'scripts', 'sync-chrome-extension.cjs')}"`, {
    stdio: 'inherit',
    cwd: root
  });

  if (!fs.existsSync(extSrc) || !fs.existsSync(path.join(extSrc, 'manifest.json'))) {
    console.error('Missing chrome-extension folder or manifest.json');
    process.exit(1);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const extDst = path.join(outDir, 'chrome-extension');
  fs.cpSync(extSrc, extDst, { recursive: true });

  let hasExe = false;
  if (fs.existsSync(exeSrc)) {
    fs.copyFileSync(exeSrc, path.join(outDir, 'SquadSpell.exe'));
    hasExe = true;
    console.log('Copied SquadSpell.exe');
  } else {
    console.warn('No dist/SquadSpell.exe — run: npm run build:exe');
    console.warn('Portable folder has extension only until you add the exe.');
  }

  const launchBat = `@echo off
cd /d "%~dp0"
set SQUADSPELL_NO_BROWSER=1
echo Starting SquadSpell server...
start "" "%~dp0SquadSpell.exe"
timeout /t 3 /nobreak >nul
echo Opening Chrome (Extensions tab + setup page)...
start chrome "chrome://extensions/"
timeout /t 1 /nobreak >nul
start "" "http://127.0.0.1:3331/extension-setup"
`;

  const serverOnlyBat = `@echo off
cd /d "%~dp0"
set SQUADSPELL_NO_BROWSER=1
start "" "%~dp0SquadSpell.exe"
echo Server running on port 3331. No browser tabs opened.
timeout /t 2 >nul
`;

  if (hasExe) {
    fs.writeFileSync(path.join(outDir, 'SquadSpell-Launch.bat'), launchBat, 'utf8');
    fs.writeFileSync(path.join(outDir, 'Start-server-only.bat'), serverOnlyBat, 'utf8');
  }

  const readme = `SquadSpell — portable package (Windows)
${hasExe ? '' : 'NOTE: SquadSpell.exe is missing. Run "npm run build:exe" on the dev machine, then run "npm run package:portable" again.\n'}

What this is
------------
• SquadSpell.exe — game server (Node is inside the exe — no Node install).
• chrome-extension — load this folder in Chrome (Load unpacked).
• SquadSpell-Launch.bat — recommended: starts server, opens Chrome Extensions + setup page.
• Start-server-only.bat — server only, no Chrome tabs (for quiet background use).

First-time / extension setup
----------------------------
Option A — Double-click SquadSpell.exe
  Chrome opens to Extensions + a setup page with the exact folder path and “Play in browser”.

Option B — Double-click SquadSpell-Launch.bat
  Same as A, but the exe does not open its own tabs first (avoids duplicate tabs).

Then: Developer mode → Load unpacked → choose the "chrome-extension" folder → pin SquadSpell → Start game.

Wi‑Fi host
----------
Keep the exe running. Host from the extension; others use your LAN link or join in browser.

Sharing
-------
Zip this whole folder. Recipients need Chrome + Windows (exe is win-x64).

Privacy / local-only (no LAN, no Wi‑Fi join)
---------------------------------------------
By default the game does not load Google Fonts or call the web dictionary unless you choose "Words: Web + file" in the game.

To run the server only on this PC (other devices on your network cannot connect):
  set SQUADSPELL_LAN=0
before starting SquadSpell.exe, or set SQUADSPELL_BIND=127.0.0.1

Example (Command Prompt):
  set SQUADSPELL_LAN=0
  SquadSpell.exe
`;

  fs.writeFileSync(path.join(outDir, 'README.txt'), readme, 'utf8');
  console.log('\nCreated:', outDir);
  console.log('Zip this folder to share with friends.\n');
}

main();
