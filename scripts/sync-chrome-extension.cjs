'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const extDir = path.join(root, 'chrome-extension');
const assetsSrc = path.join(root, 'assets');
const assetsDst = path.join(extDir, 'assets');

function copyFile(fromRel, toRel) {
  const from = path.join(root, fromRel);
  const to = path.join(extDir, toRel);
  if (!fs.existsSync(from)) {
    console.error('Missing source file:', from);
    process.exit(1);
  }
  fs.copyFileSync(from, to);
}

fs.mkdirSync(extDir, { recursive: true });
fs.mkdirSync(assetsDst, { recursive: true });

copyFile('index.html', 'game.html');
copyFile('dictionary.js', 'dictionary.js');
copyFile('word-meaning-fallbacks.js', 'word-meaning-fallbacks.js');

if (!fs.existsSync(assetsSrc)) {
  console.error('Missing assets folder:', assetsSrc);
  process.exit(1);
}
fs.rmSync(assetsDst, { recursive: true, force: true });
fs.cpSync(assetsSrc, assetsDst, { recursive: true });

console.log(
  'Synced index.html → chrome-extension/game.html, dictionary.js, word-meaning-fallbacks.js, and assets/'
);
