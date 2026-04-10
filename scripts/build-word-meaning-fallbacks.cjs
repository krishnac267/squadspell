'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcPath = path.join(root, 'data', 'word-meaning-fallbacks-source.txt');
const outPath = path.join(root, 'word-meaning-fallbacks.js');

const raw = fs.readFileSync(srcPath, 'utf8');
const seen = new Map();

for (const line of raw.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const m = t.match(/^([A-Za-z]+)\s*[–—-]\s*(.+)$/);
  if (!m) continue;
  const word = m[1].toUpperCase();
  const def = m[2].trim();
  if (seen.has(word) && seen.get(word) !== def) {
    console.warn(`Duplicate word ${word}: replacing earlier definition`);
  }
  seen.set(word, def);
}

const dataObj = Object.fromEntries(seen);
const json = JSON.stringify(dataObj, null, 2);

const file = `'use strict';

/** Auto-generated from data/word-meaning-fallbacks-source.txt — run: npm run build:fallbacks */

const WORD_MEANING_FALLBACK_DATA = ${json};

const WORD_MEANING_FALLBACKS = new Map(Object.entries(WORD_MEANING_FALLBACK_DATA));

function meaningDetailFromUserFallback(upperWord) {
  const def = WORD_MEANING_FALLBACKS.get(String(upperWord).toUpperCase());
  if (!def) return null;
  return {
    v: 1,
    phoneticText: null,
    phoneticAudioUrl: null,
    meanings: [
      {
        partOfSpeech: null,
        definitions: [{ definition: def, synonyms: [], antonyms: [] }],
        synonyms: [],
        antonyms: []
      }
    ]
  };
}

/** Word is on the bundled list but the free dictionary API has no entry or could not be reached. */
function meaningDetailBundledFallback(reason) {
  const definition =
    reason === 'network'
      ? 'Valid per the game word list. The online dictionary could not be reached.'
      : 'Valid per the game word list. The free dictionary (api.dictionaryapi.dev) has no definition for this spelling.';
  return {
    v: 1,
    phoneticText: null,
    phoneticAudioUrl: null,
    meanings: [
      {
        partOfSpeech: null,
        definitions: [{ definition, synonyms: [], antonyms: [] }],
        synonyms: [],
        antonyms: []
      }
    ]
  };
}

/** Prefer bundled player-provided glosses, then generic bundled message (shared by browser + Node server). */
function meaningDetailForBundledWord(upperKey, reason) {
  const u = meaningDetailFromUserFallback(upperKey);
  if (u) return u;
  return meaningDetailBundledFallback(reason);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WORD_MEANING_FALLBACKS,
    meaningDetailFromUserFallback,
    meaningDetailBundledFallback,
    meaningDetailForBundledWord
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.meaningDetailFromUserFallback = meaningDetailFromUserFallback;
  globalThis.meaningDetailBundledFallback = meaningDetailBundledFallback;
  globalThis.meaningDetailForBundledWord = meaningDetailForBundledWord;
}
`;

fs.writeFileSync(outPath, file, 'utf8');
console.log(`Wrote ${outPath} (${seen.size} words)`);
