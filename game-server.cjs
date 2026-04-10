'use strict';

const { VALID_WORDS } = require('./dictionary.js');
const { meaningDetailForBundledWord } = require('./word-meaning-fallbacks.js');

const BOARD_SIZE = 15;
const RACK_SIZE = 7;

const LETTER_POINTS = {
  A: 1,
  B: 3,
  C: 3,
  D: 2,
  E: 1,
  F: 4,
  G: 2,
  H: 4,
  I: 1,
  J: 8,
  K: 5,
  L: 1,
  M: 3,
  N: 1,
  O: 1,
  P: 3,
  Q: 10,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 4,
  W: 4,
  X: 8,
  Y: 4,
  Z: 10,
  '?': 0
};

function normalizeMysticIndex(m) {
  const n = Math.floor(Number(m));
  if (!Number.isFinite(n)) return null;
  return ((n % 3) + 3) % 3;
}

function normalizeRackSlot(s) {
  if (s && typeof s === 'object' && typeof s.letter === 'string' && s.letter.length > 0) {
    let mystic = normalizeMysticIndex(s.mystic);
    if (mystic === null) mystic = Math.floor(Math.random() * 3);
    return { letter: s.letter, mystic };
  }
  if (typeof s === 'string' && s.length > 0) {
    return { letter: s, mystic: s.charCodeAt(0) % 3 };
  }
  return null;
}

function newRackSlot(letter) {
  return { letter, mystic: Math.floor(Math.random() * 3) };
}

const LETTER_DISTRIBUTION = {
  A: 9,
  B: 2,
  C: 2,
  D: 4,
  E: 12,
  F: 2,
  G: 3,
  H: 2,
  I: 9,
  J: 1,
  K: 1,
  L: 4,
  M: 2,
  N: 6,
  O: 8,
  P: 2,
  Q: 1,
  R: 6,
  S: 4,
  T: 6,
  U: 4,
  V: 2,
  W: 2,
  X: 1,
  Y: 2,
  Z: 1,
  '?': 2
};

const PREMIUM_LAYOUT = [
  'T..d...T...d..T',
  '.W...t...t...W.',
  '..W...d.d...W..',
  'd..W...d...W..d',
  '....W.....W....',
  '.t...t...t...t.',
  '..d...d.d...d..',
  'T..d...*...d..T',
  '..d...d.d...d..',
  '.t...t...t...t.',
  '....W.....W....',
  'd..W...d...W..d',
  '..W...d.d...W..',
  '.W...t...t...W.',
  'T..d...T...d..T'
];

const DICTIONARY_API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const onlineWordCache = new Map();

function gameEffectiveDict(game) {
  return game.dictMode === 'off' ? 'off' : game.dictMode;
}

function extractMeaningDetailFromApi(data) {
  const MAX_POS_SECTIONS = 1;
  const MAX_DEFS_PER_SECTION = 2;
  const MAX_SYN_ANT = 2;

  if (!data || !Array.isArray(data) || data.length === 0) return null;
  const entry = data[0];
  let phoneticText = null;
  let phoneticAudioUrl = null;
  if (entry.phonetics && Array.isArray(entry.phonetics)) {
    for (const ph of entry.phonetics) {
      if (!ph || typeof ph !== 'object') continue;
      if (!phoneticText && ph.text) {
        const t = String(ph.text).trim();
        if (t) phoneticText = t;
      }
      if (!phoneticAudioUrl && ph.audio) {
        const a = String(ph.audio).trim();
        if (a) phoneticAudioUrl = a;
      }
    }
  }
  const outMeanings = [];
  const posSectionCount = new Map();
  const meaningsRaw = entry.meanings;
  if (meaningsRaw && Array.isArray(meaningsRaw)) {
    for (const m of meaningsRaw) {
      if (!m || typeof m !== 'object') continue;
      const partOfSpeech = m.partOfSpeech ? String(m.partOfSpeech).trim() : null;
      const posKey = (partOfSpeech || '').toLowerCase() || '_';
      const seen = posSectionCount.get(posKey) || 0;
      if (seen >= MAX_POS_SECTIONS) continue;

      const defs = [];
      if (m.definitions && Array.isArray(m.definitions)) {
        for (const d of m.definitions) {
          if (defs.length >= MAX_DEFS_PER_SECTION) break;
          if (!d || typeof d !== 'object') continue;
          const defStr = d.definition ? String(d.definition).trim() : '';
          const syn = Array.isArray(d.synonyms)
            ? d.synonyms
                .map(x => String(x).trim())
                .filter(Boolean)
                .slice(0, MAX_SYN_ANT)
            : [];
          const ant = Array.isArray(d.antonyms)
            ? d.antonyms
                .map(x => String(x).trim())
                .filter(Boolean)
                .slice(0, MAX_SYN_ANT)
            : [];
          if (!defStr && syn.length === 0 && ant.length === 0) continue;
          defs.push({ definition: defStr || null, synonyms: syn, antonyms: ant });
        }
      }
      let msyn = Array.isArray(m.synonyms)
        ? m.synonyms.map(x => String(x).trim()).filter(Boolean)
        : [];
      let mant = Array.isArray(m.antonyms)
        ? m.antonyms.map(x => String(x).trim()).filter(Boolean)
        : [];
      msyn = msyn.slice(0, MAX_SYN_ANT);
      mant = mant.slice(0, MAX_SYN_ANT);
      if (!partOfSpeech && defs.length === 0 && msyn.length === 0 && mant.length === 0) continue;
      posSectionCount.set(posKey, seen + 1);
      outMeanings.push({
        partOfSpeech: partOfSpeech || null,
        definitions: defs,
        synonyms: msyn,
        antonyms: mant
      });
    }
  }
  const hasBody = outMeanings.length > 0;
  const hasPhone = !!(phoneticText || phoneticAudioUrl);
  if (!hasBody && !hasPhone) return null;
  return { v: 1, phoneticText, phoneticAudioUrl, meanings: outMeanings };
}

async function isWordAcceptedAsync(upperWord, game) {
  if (VALID_WORDS.has(upperWord)) {
    return { ok: true, fromWeb: false, meaningDetail: meaningDetailForBundledWord(upperWord, 'missing') };
  }
  if (gameEffectiveDict(game) === 'off') return { ok: true, fromWeb: false, meaningDetail: null };
  const cached = onlineWordCache.get(upperWord);
  if (cached !== undefined) {
    return {
      ok: cached.ok,
      fromWeb: !!cached.fromWeb,
      meaningDetail: cached.meaningDetail,
      networkError: cached.networkError
    };
  }
  try {
    const url = DICTIONARY_API + encodeURIComponent(upperWord.toLowerCase());
    const r = await fetch(url);
    if (!r.ok) {
      const rec = { ok: false, fromWeb: false };
      onlineWordCache.set(upperWord, rec);
      return rec;
    }
    const data = await r.json();
    const meaningDetail = extractMeaningDetailFromApi(data);
    const rec = { ok: true, fromWeb: true, meaningDetail };
    onlineWordCache.set(upperWord, rec);
    return { ok: true, fromWeb: true, meaningDetail };
  } catch (e) {
    return { ok: false, fromWeb: false, networkError: true };
  }
}

function lineReadingVariantsUpper(tiles) {
  if (!tiles || tiles.length === 0) return [];
  const rows = new Set(tiles.map(t => t.row));
  const cols = new Set(tiles.map(t => t.col));
  const seen = new Set();
  const out = [];
  const add = str => {
    const u = str.toUpperCase();
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  };

  if (rows.size === 1) {
    const byCol = [...tiles].sort((a, b) => a.col - b.col);
    add(byCol.map(t => t.letter).join(''));
    add([...byCol].reverse().map(t => t.letter).join(''));
  }
  if (cols.size === 1) {
    const byRow = [...tiles].sort((a, b) => a.row - b.row);
    add(byRow.map(t => t.letter).join(''));
    add([...byRow].reverse().map(t => t.letter).join(''));
  }

  if (out.length === 0) {
    add(tiles.map(t => t.letter).join(''));
  }
  return out;
}

async function acceptLineWordAnyReading(wordTiles, game) {
  if (gameEffectiveDict(game) === 'off') {
    const v = lineReadingVariantsUpper(wordTiles)[0] || canonicalWordFromTiles(wordTiles).toUpperCase();
    return { ok: true, fromWeb: false, meaningDetail: null, dictWord: v };
  }
  const variants = lineReadingVariantsUpper(wordTiles);
  let networkError = false;
  for (const v of variants) {
    const r = await isWordAcceptedAsync(v, game);
    if (r.networkError) networkError = true;
    if (r.ok) return { ok: true, fromWeb: r.fromWeb, meaningDetail: r.meaningDetail, dictWord: v };
  }
  return { ok: false, fromWeb: false, networkError };
}

function readHintFromMatch(tiles, matchedUpper) {
  if (!tiles || tiles.length < 2) return { readDir: null, readStartRow: 0, readStartCol: 0 };
  const rows = new Set(tiles.map(t => t.row));
  const cols = new Set(tiles.map(t => t.col));
  const sorted = [...tiles];
  if (rows.size === 1) sorted.sort((a, b) => a.col - b.col);
  else if (cols.size === 1) sorted.sort((a, b) => a.row - b.row);
  else {
    return { readDir: 'ltr', readStartRow: tiles[0].row, readStartCol: tiles[0].col };
  }
  const forward = sorted.map(t => t.letter).join('').toUpperCase();
  const backward = [...sorted].reverse().map(t => t.letter).join('').toUpperCase();
  const m = String(matchedUpper || '').toUpperCase();
  if (m === forward) {
    if (rows.size === 1) {
      return { readDir: 'ltr', readStartRow: sorted[0].row, readStartCol: sorted[0].col };
    }
    return { readDir: 'ttb', readStartRow: sorted[0].row, readStartCol: sorted[0].col };
  }
  if (m === backward) {
    const last = sorted[sorted.length - 1];
    if (rows.size === 1) {
      return { readDir: 'rtl', readStartRow: last.row, readStartCol: last.col };
    }
    return { readDir: 'btt', readStartRow: last.row, readStartCol: last.col };
  }
  if (rows.size === 1) {
    return { readDir: 'ltr', readStartRow: sorted[0].row, readStartCol: sorted[0].col };
  }
  return { readDir: 'ttb', readStartRow: sorted[0].row, readStartCol: sorted[0].col };
}

function canonicalWordFromTiles(tiles) {
  if (!tiles || tiles.length === 0) return '';
  const rows = new Set(tiles.map(t => t.row));
  const cols = new Set(tiles.map(t => t.col));
  let ordered;
  if (rows.size === 1) {
    ordered = [...tiles].sort((a, b) => a.col - b.col);
  } else if (cols.size === 1) {
    ordered = [...tiles].sort((a, b) => a.row - b.row);
  } else {
    ordered = [...tiles];
  }
  return ordered.map(t => t.letter).join('');
}

class ScrabbleGameServer {
  constructor(playerNames, dictMode = 'online') {
    this.dictMode = dictMode === 'local' ? 'online' : dictMode === 'off' ? 'off' : 'online';
    this.players = playerNames.map(name => ({ name, rack: [], score: 0 }));
    this.board = Array.from({ length: BOARD_SIZE }, () =>
      Array.from({ length: BOARD_SIZE }, () => null)
    );
    this.tileBag = [];
    this.currentPlayerIndex = 0;
    this.placedThisTurn = [];
    this.consecutivePasses = 0;
    this.isFirstMove = true;
    this.gameOver = false;
    this.turnHistory = [];
    this.playedWordsLog = [];

    this.initBag();
    for (const p of this.players) this.drawTiles(p, RACK_SIZE);
  }

  initBag() {
    this.tileBag = [];
    for (const [letter, count] of Object.entries(LETTER_DISTRIBUTION)) {
      for (let i = 0; i < count; i++) this.tileBag.push(letter);
    }
    this.shuffle(this.tileBag);
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  drawTiles(player, count) {
    const needed = Math.min(count, this.tileBag.length);
    for (let i = 0; i < needed; i++) {
      player.rack.push(newRackSlot(this.tileBag.pop()));
    }
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  placeTile(row, col, rackIndex, blankLetter) {
    const player = this.currentPlayer;
    const slot = normalizeRackSlot(player.rack[rackIndex]);
    if (!slot) return false;
    if (this.board[row][col]) return false;
    const letter = slot.letter;
    const mystic = slot.mystic;

    if (letter === '?') {
      const L = String(blankLetter || '').toUpperCase();
      if (!/^[A-Z]$/.test(L)) return false;
      this.board[row][col] = { letter: L, points: 0, isBlank: true, locked: false, mystic };
    } else {
      this.board[row][col] = {
        letter,
        points: LETTER_POINTS[letter],
        isBlank: false,
        locked: false,
        mystic
      };
    }
    player.rack.splice(rackIndex, 1);
    this.placedThisTurn.push({ row, col });
    return true;
  }

  recallTile(row, col) {
    const idx = this.placedThisTurn.findIndex(p => p.row === row && p.col === col);
    if (idx === -1) return false;
    const tile = this.board[row][col];
    let m = normalizeMysticIndex(tile.mystic);
    if (m === null) m = Math.floor(Math.random() * 3);
    this.currentPlayer.rack.push({
      letter: tile.isBlank ? '?' : tile.letter,
      mystic: m
    });
    this.board[row][col] = null;
    this.placedThisTurn.splice(idx, 1);
    return true;
  }

  recallAllTiles() {
    while (this.placedThisTurn.length > 0) {
      const { row, col } = this.placedThisTurn[0];
      this.recallTile(row, col);
    }
  }

  forfeitTurn() {
    this.recallAllTiles();
    this.consecutivePasses++;
    if (this.consecutivePasses >= this.players.length * 2) {
      this.endGame();
      return true;
    }
    this.nextPlayer();
    return false;
  }

  validatePlacement() {
    const placed = this.placedThisTurn;
    if (placed.length === 0) return { valid: false, error: 'Place at least one tile.' };

    if (this.isFirstMove) {
      const coversCenter = placed.some(p => p.row === 7 && p.col === 7);
      if (!coversCenter) return { valid: false, error: 'First word must cover the center star.' };
      if (placed.length < 2) return { valid: false, error: 'First word must be at least 2 letters.' };
    }

    const rows = [...new Set(placed.map(p => p.row))];
    const cols = [...new Set(placed.map(p => p.col))];
    const isHorizontal = rows.length === 1;
    const isVertical = cols.length === 1;

    if (!isHorizontal && !isVertical) return { valid: false, error: 'Tiles must be in a single row or column.' };

    if (isHorizontal) {
      const r = rows[0];
      const sortedCols = placed.map(p => p.col).sort((a, b) => a - b);
      for (let c = sortedCols[0]; c <= sortedCols[sortedCols.length - 1]; c++) {
        if (!this.board[r][c]) return { valid: false, error: 'Tiles must be contiguous (no gaps).' };
      }
    } else {
      const c = cols[0];
      const sortedRows = placed.map(p => p.row).sort((a, b) => a - b);
      for (let r = sortedRows[0]; r <= sortedRows[sortedRows.length - 1]; r++) {
        if (!this.board[r][c]) return { valid: false, error: 'Tiles must be contiguous (no gaps).' };
      }
    }

    if (!this.isFirstMove) {
      let connected = false;
      for (const { row, col } of placed) {
        const neighbors = [
          [row - 1, col],
          [row + 1, col],
          [row, col - 1],
          [row, col + 1]
        ];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
            const tile = this.board[nr][nc];
            if (tile && tile.locked) {
              connected = true;
              break;
            }
          }
        }
        if (connected) break;
      }
      if (!connected) return { valid: false, error: 'Word must connect to existing tiles.' };
    }

    return { valid: true };
  }

  findFormedWords() {
    const placed = this.placedThisTurn;
    const words = [];
    const rows = [...new Set(placed.map(p => p.row))];
    const isHorizontal = rows.length === 1;

    const getWord = (startRow, startCol, dRow, dCol) => {
      let r = startRow;
      let c = startCol;
      while (r - dRow >= 0 && c - dCol >= 0 && this.board[r - dRow]?.[c - dCol]) {
        r -= dRow;
        c -= dCol;
      }
      const tiles = [];
      while (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && this.board[r][c]) {
        tiles.push({ row: r, col: c, ...this.board[r][c] });
        r += dRow;
        c += dCol;
      }
      return tiles;
    };

    let mainDir;
    if (placed.length === 1) {
      const h = getWord(placed[0].row, placed[0].col, 0, 1);
      const v = getWord(placed[0].row, placed[0].col, 1, 0);
      if (h.length >= 2 && v.length >= 2) {
        mainDir = h.length > v.length ? [0, 1] : [1, 0];
      } else if (v.length >= 2) {
        mainDir = [1, 0];
      } else {
        mainDir = [0, 1];
      }
    } else {
      mainDir = isHorizontal ? [0, 1] : [1, 0];
    }

    const mainWord = getWord(placed[0].row, placed[0].col, mainDir[0], mainDir[1]);
    if (mainWord.length >= 2) {
      words.push(mainWord);
    }

    const crossDir = mainDir[0] === 0 ? [1, 0] : [0, 1];
    for (const { row, col } of placed) {
      const crossWord = getWord(row, col, crossDir[0], crossDir[1]);
      if (crossWord.length >= 2) words.push(crossWord);
    }

    return { words };
  }

  calculateTurnScore() {
    const { words } = this.findFormedWords();
    if (words.length === 0) return { total: 0, words: [], reverseMain: null };

    const placedSet = new Set(this.placedThisTurn.map(p => `${p.row},${p.col}`));
    let total = 0;
    const scoredWords = [];

    for (const word of words) {
      let wordScore = 0;
      let wordMultiplier = 1;

      for (const tile of word) {
        const key = `${tile.row},${tile.col}`;
        let letterScore = tile.points;

        if (placedSet.has(key)) {
          const premium = PREMIUM_LAYOUT[tile.row][tile.col];
          if (premium === 'd') letterScore *= 2;
          else if (premium === 't') letterScore *= 3;
          else if (premium === 'W' || premium === '*') wordMultiplier *= 2;
          else if (premium === 'T') wordMultiplier *= 3;
        }
        wordScore += letterScore;
      }
      wordScore *= wordMultiplier;
      total += wordScore;
      const canonicalStr = canonicalWordFromTiles(word);
      const wordTiles = word.map(t => ({ row: t.row, col: t.col, letter: t.letter }));
      scoredWords.push({
        word: canonicalStr,
        wordPlacement: canonicalStr,
        wordTiles,
        score: wordScore
      });
    }

    if (this.placedThisTurn.length === 7) total += 50;

    return { total, words: scoredWords, reverseMain: null };
  }

  async submitTurn() {
    const validation = this.validatePlacement();
    if (!validation.valid) {
      if (this.placedThisTurn.length > 0) {
        const forfeitingPlayerName = this.currentPlayer.name;
        const gameOver = this.forfeitTurn();
        return {
          success: false,
          error: validation.error,
          turnForfeited: true,
          gameOver,
          forfeitingPlayerName
        };
      }
      return { success: false, error: validation.error };
    }

    const result = this.calculateTurnScore();
    if (result.words.length === 0) {
      const forfeitingPlayerName = this.currentPlayer.name;
      const gameOver = this.forfeitTurn();
      return {
        success: false,
        error: 'No valid words formed.',
        turnForfeited: true,
        gameOver,
        forfeitingPlayerName
      };
    }

    const scoringPlayerName = this.currentPlayer.name;
    let webWords = [];
    let meaningLookupWords = null;
    let checks = [];
    if (gameEffectiveDict(this) !== 'off') {
      checks = await Promise.all(result.words.map(w => acceptLineWordAnyReading(w.wordTiles, this)));
      const hadNetworkError = checks.some(c => c.networkError);
      const invalid = result.words.filter((w, i) => !checks[i].ok);
      if (invalid.length > 0) {
        const list = invalid
          .map(w => {
            const vars = lineReadingVariantsUpper(w.wordTiles);
            return vars.length > 1 ? `${vars.join(' / ')}` : vars[0];
          })
          .join(', ');
        const err = hadNetworkError
          ? `Cannot reach online dictionary. Check your connection or turn word check off. Unknown words: ${list}`
          : `Not in online dictionary: ${list}`;
        if (!hadNetworkError) {
          const gameOver = this.forfeitTurn();
          return {
            success: false,
            error: err,
            turnForfeited: true,
            gameOver,
            forfeitingPlayerName: scoringPlayerName
          };
        }
        return { success: false, error: err };
      }
      webWords = [...new Set(checks.map((c, i) => (c.ok && c.fromWeb ? c.dictWord : null)).filter(Boolean))];
      meaningLookupWords = [...new Set(checks.filter(c => c.ok).map(c => c.dictWord))];
      for (let i = 0; i < result.words.length; i++) {
        if (checks[i].ok) result.words[i].matchedWord = checks[i].dictWord;
      }
    } else {
      for (let i = 0; i < result.words.length; i++) {
        result.words[i].matchedWord = result.words[i].word.toUpperCase();
      }
    }

    for (let i = 0; i < result.words.length; i++) {
      const w = result.words[i];
      const mw = w.matchedWord || w.word.toUpperCase();
      const hint = readHintFromMatch(w.wordTiles, mw);
      w.readDir = hint.readDir;
      w.readStartRow = hint.readStartRow;
      w.readStartCol = hint.readStartCol;
    }

    const h0 = readHintFromMatch(
      result.words[0].wordTiles,
      result.words[0].matchedWord || result.words[0].word.toUpperCase()
    );
    result.reverseMain = h0.readDir === 'ltr' ? null : h0.readDir;

    this.currentPlayer.score += result.total;

    for (const { row, col } of this.placedThisTurn) {
      this.board[row][col].locked = true;
    }

    for (const w of result.words) {
      if (!w.readDir) continue;
      const t = this.board[w.readStartRow][w.readStartCol];
      if (!t) continue;
      if (!t.readDirs) t.readDirs = [];
      if (!t.readDirs.includes(w.readDir)) t.readDirs.push(w.readDir);
    }

    const tilesPlaced = this.placedThisTurn.length;
    this.placedThisTurn = [];
    this.isFirstMove = false;
    this.consecutivePasses = 0;

    this.drawTiles(this.currentPlayer, tilesPlaced);
    this.turnHistory.push({
      player: scoringPlayerName,
      words: result.words,
      score: result.total
    });

    this.playedWordsLog.push({
      player: scoringPlayerName,
      score: result.total,
      items: result.words.map((w, i) => ({
        matched: w.matchedWord || w.word.toUpperCase(),
        boardWord: w.word,
        points: w.score,
        meaningDetail:
          checks[i] && checks[i].meaningDetail != null ? checks[i].meaningDetail : null
      }))
    });

    if (this.currentPlayer.rack.length === 0 && this.tileBag.length === 0) {
      this.endGame();
      return {
        success: true,
        ...result,
        webWords,
        meaningLookupWords,
        scoringPlayerName,
        gameOver: true
      };
    }

    this.nextPlayer();
    return { success: true, ...result, webWords, meaningLookupWords, scoringPlayerName };
  }

  passTurn() {
    this.recallAllTiles();
    this.consecutivePasses++;
    if (this.consecutivePasses >= this.players.length * 2) {
      this.endGame();
      return true;
    }
    this.nextPlayer();
    return false;
  }

  exchangeTiles(indices) {
    if (this.tileBag.length === 0) return false;
    const player = this.currentPlayer;
    const tiles = indices.map(i => player.rack[i]).filter(Boolean);
    const sorted = [...indices].sort((a, b) => b - a);
    for (const i of sorted) player.rack.splice(i, 1);
    this.drawTiles(player, tiles.length);
    for (const t of tiles) {
      const sl = normalizeRackSlot(t);
      if (sl) this.tileBag.push(sl.letter);
    }
    this.shuffle(this.tileBag);
    this.consecutivePasses = 0;
    this.nextPlayer();
    return true;
  }

  nextPlayer() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
  }

  endGame() {
    this.gameOver = true;
    let finisher = -1;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[i].rack.length === 0) {
        finisher = i;
        break;
      }
    }

    for (let i = 0; i < this.players.length; i++) {
      const rackValue = this.players[i].rack.reduce(
        (sum, s) => sum + (LETTER_POINTS[normalizeRackSlot(s).letter] || 0),
        0
      );
      this.players[i].score -= rackValue;
      if (finisher >= 0 && finisher !== i) {
        this.players[finisher].score += rackValue;
      }
    }
  }

  shufflePlayerRack() {
    this.shuffle(this.currentPlayer.rack);
  }
}

function serializeState(game, playerIndex, roomCode) {
  return {
    roomCode,
    yourPlayerIndex: playerIndex,
    board: game.board,
    players: game.players.map(p => ({
      name: p.name,
      score: p.score,
      rackCount: p.rack.length
    })),
    yourRack: [...game.players[playerIndex].rack],
    currentPlayerIndex: game.currentPlayerIndex,
    bagCount: game.tileBag.length,
    placedThisTurn: game.placedThisTurn,
    isFirstMove: game.isFirstMove,
    gameOver: game.gameOver,
    consecutivePasses: game.consecutivePasses,
    turnHistory: game.turnHistory,
    playedWordsLog: game.playedWordsLog,
    dictMode: game.dictMode
  };
}

module.exports = { ScrabbleGameServer, serializeState, BOARD_SIZE, RACK_SIZE };
