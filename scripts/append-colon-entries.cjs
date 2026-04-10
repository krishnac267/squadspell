'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'data');
const main = path.join(root, 'word-meaning-fallbacks-source.txt');
const chunkFiles = process.argv.slice(2);

if (chunkFiles.length === 0) {
  console.error('Usage: node append-colon-entries.cjs <chunk.txt> [...]');
  process.exit(1);
}

let out = '\n# Part 6 – L through Z\n';
for (const rel of chunkFiles) {
  const fp = path.isAbsolute(rel) ? rel : path.join(root, rel);
  const text = fs.readFileSync(fp, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf(':');
    if (idx === -1) continue;
    const word = t.slice(0, idx).trim();
    const def = t.slice(idx + 1).trim();
    if (!/^[A-Za-z]+$/.test(word)) continue;
    out += `${word.toUpperCase()} – ${def}\n`;
  }
}

fs.appendFileSync(main, out, 'utf8');
console.log('Appended', chunkFiles.join(', '));
