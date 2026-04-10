'use strict';

/**
 * Copies static game files into www/ for Capacitor (Android / iOS).
 * Run before: npx cap sync
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(root, 'www');

const files = ['index.html', 'dictionary.js', 'word-meaning-fallbacks.js'];

function main() {
  fs.mkdirSync(www, { recursive: true });
  for (const f of files) {
    const src = path.join(root, f);
    if (!fs.existsSync(src)) {
      console.error('Missing required file:', src);
      process.exit(1);
    }
    fs.copyFileSync(src, path.join(www, f));
  }
  const assetsSrc = path.join(root, 'assets');
  const assetsDst = path.join(www, 'assets');
  if (!fs.existsSync(assetsSrc)) {
    console.error('Missing assets folder:', assetsSrc);
    process.exit(1);
  }
  fs.rmSync(assetsDst, { recursive: true, force: true });
  fs.cpSync(assetsSrc, assetsDst, { recursive: true });
  console.log('Synced game assets →', www);
}

main();
