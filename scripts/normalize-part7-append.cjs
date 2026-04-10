'use strict';

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const main = path.join(dataDir, 'word-meaning-fallbacks-source.txt');

function processLine(line) {
  const t = line.trim();
  if (!t || t.startsWith('#')) return null;
  if (/^[A-Za-z]$/.test(t)) return null;
  if (/^[A-Za-z]\s*[–—-]\s*Meanings$/i.test(t)) return null;

  let m = t.match(/^([A-Za-z]+)\s*[–—-]\s*(.+)$/);
  if (m) return `${m[1].toUpperCase()} – ${m[2].trim()}`;

  m = t.match(/^([A-Za-z]+):\s*(.+)$/);
  if (m) return `${m[1].toUpperCase()} – ${m[2].trim()}`;

  m = t.match(/^([A-Za-z]+)\s+(.+)$/);
  if (m && m[1].length >= 2) return `${m[1].toUpperCase()} – ${m[2].trim()}`;

  return null;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node normalize-part7-append.cjs <file.txt> [...]');
  process.exit(1);
}

let out = '\n# Part 7 – extended P–Z, A–F (mixed formats)\n';
for (const rel of files) {
  const fp = path.join(dataDir, rel);
  const text = fs.readFileSync(fp, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const r = processLine(line);
    if (r) out += `${r}\n`;
  }
}

fs.appendFileSync(main, out, 'utf8');
console.log('Appended', files.join(', '));
