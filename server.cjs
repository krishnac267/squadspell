'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const express = require('express');
const { WebSocketServer } = require('ws');
const { ScrabbleGameServer, serializeState } = require('./game-server.cjs');

function openBrowser(url) {
  if (process.env.SQUADSPELL_NO_BROWSER === '1') return;
  try {
    if (process.platform === 'win32') {
      execFile('cmd', ['/c', 'start', '', url], { windowsHide: true }, () => {});
    } else if (process.platform === 'darwin') {
      execFile('open', [url], () => {});
    } else {
      execFile('xdg-open', [url], () => {});
    }
  } catch (e) {
    /* ignore */
  }
}

/** Folder containing manifest.json for “Load unpacked” (next to .exe in portable zip, or repo chrome-extension/). */
function getChromeExtensionDir() {
  if (process.pkg) {
    return path.join(path.dirname(process.execPath), 'chrome-extension');
  }
  return path.join(__dirname, 'chrome-extension');
}

function hasPortableChromeExtension() {
  try {
    return fs.existsSync(path.join(getChromeExtensionDir(), 'manifest.json'));
  } catch {
    return false;
  }
}

function openChromeExtensionsPage() {
  if (process.env.SQUADSPELL_NO_BROWSER === '1') return;
  try {
    if (process.platform === 'win32') {
      execFile('cmd', ['/c', 'start', 'chrome', 'chrome://extensions/'], { windowsHide: true }, () => {});
    } else if (process.platform === 'darwin') {
      execFile('open', ['-a', 'Google Chrome', 'chrome://extensions/'], () => {});
    } else {
      execFile('xdg-open', ['chrome://extensions/'], () => {});
    }
  } catch (e) {
    /* ignore */
  }
}

const PORT = Number(process.env.PORT) || 3331;
const isPackaged = Boolean(process.pkg);

/** Local-only: set SQUADSPELL_LAN=0 or SQUADSPELL_BIND=127.0.0.1 so the server does not accept LAN connections. */
function resolveBindHost() {
  const b = (process.env.SQUADSPELL_BIND || '').trim();
  if (b) return b;
  if (process.env.SQUADSPELL_LAN === '0' || process.env.SQUADSPELL_LAN === 'false') return '127.0.0.1';
  return '0.0.0.0';
}
const BIND_HOST = resolveBindHost();
const LAN_CLIENTS_ALLOWED = BIND_HOST !== '127.0.0.1' && BIND_HOST !== '::1';

const app = express();

function isLocalHost(req) {
  const a = req.socket.remoteAddress;
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

function remoteAddrPlain(req) {
  let a = req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress) : '';
  if (a.startsWith('::ffff:')) a = a.slice(7);
  return a;
}

/** True when the HTTP client is this machine (loopback or connected via one of our IPv4 addresses). */
function isClientOnServerMachine(req) {
  const a = remoteAddrPlain(req);
  if (a === '127.0.0.1' || a === '::1') return true;
  if (!a) return false;
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        const v4 = net.family === 'IPv4' || net.family === 4;
        if (v4 && net.address === a) return true;
      }
    }
  } catch (_) {
    /* ignore */
  }
  return false;
}

/** Best IPv4 for “open this on another device on Wi‑Fi” (private range preferred). */
function pickLanIPv4() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (!v4 || net.internal) continue;
      const a = net.address;
      const priv =
        a.startsWith('10.') ||
        a.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(a);
      candidates.push({ a, priv });
    }
  }
  candidates.sort((x, y) => Number(y.priv) - Number(x.priv) || x.a.localeCompare(y.a));
  return candidates[0] ? candidates[0].a : null;
}

/** Packaged exe: track browser tabs on this machine so we can exit when all close. */
const browserSessions = new Set();
let exitWhenIdleTimer = null;

function scheduleExitWhenNoLocalBrowsers() {
  if (!isPackaged) return;
  clearTimeout(exitWhenIdleTimer);
  exitWhenIdleTimer = setTimeout(() => {
    if (browserSessions.size === 0) {
      process.exit(0);
    }
  }, 750);
}

app.post('/api/lifecycle/start', (req, res) => {
  if (!isPackaged) return res.status(404).end();
  if (!isLocalHost(req)) return res.status(403).end();
  const id = String(req.query.id || '').slice(0, 96);
  if (!/^[\w.-]+$/.test(id)) return res.status(400).end();
  browserSessions.add(id);
  clearTimeout(exitWhenIdleTimer);
  res.status(204).end();
});

app.post('/api/lifecycle/end', (req, res) => {
  if (!isPackaged) return res.status(404).end();
  if (!isLocalHost(req)) return res.status(403).end();
  const id = String(req.query.id || '').slice(0, 96);
  browserSessions.delete(id);
  scheduleExitWhenNoLocalBrowsers();
  res.status(204).end();
});

app.get('/api/lan-play-url', (_req, res) => {
  if (!LAN_CLIENTS_ALLOWED) {
    return res.status(404).json({ ok: false, error: 'lan_disabled' });
  }
  const ip = pickLanIPv4();
  if (!ip) {
    return res.status(404).json({ ok: false, error: 'no_lan' });
  }
  const url = `http://${ip}:${PORT}`;
  res.json({ ok: true, url, port: PORT });
});

app.get('/api/server-meta', (req, res) => {
  const loopbackBase = `http://127.0.0.1:${PORT}`;
  const lanIp = LAN_CLIENTS_ALLOWED ? pickLanIPv4() : null;
  const lanBase = lanIp ? `http://${lanIp}:${PORT}` : null;
  res.json({
    loopbackBase,
    lanBase,
    clientIsOnServerMachine: isClientOnServerMachine(req)
  });
});

app.get('/extension-setup', (_req, res) => {
  const extDir = getChromeExtensionDir();
  const extPathJson = JSON.stringify(extDir);
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SquadSpell — Chrome extension</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, Segoe UI, Roboto, sans-serif; max-width: 42rem; margin: 0 auto; padding: 1.5rem;
      background: linear-gradient(165deg, #1a0a2e 0%, #0f0518 100%); color: #f5f0ff; min-height: 100vh; }
    h1 { font-size: 1.35rem; margin-bottom: 0.5rem; }
    p, li { line-height: 1.5; opacity: 0.95; }
    .path { background: rgba(0,0,0,0.35); padding: 0.75rem 1rem; border-radius: 8px; word-break: break-all;
      font-family: ui-monospace, Consolas, monospace; font-size: 0.85rem; margin: 0.75rem 0; border: 1px solid rgba(212,175,55,0.25); }
    button, .btn {
      display: inline-block; padding: 0.65rem 1.1rem; border-radius: 8px; font-weight: 700; cursor: pointer;
      border: none; margin: 0.35rem 0.35rem 0.35rem 0; text-decoration: none; font-size: 0.95rem;
    }
    button { background: linear-gradient(180deg, #e8c547, #b8860b); color: #1a0f08; }
    .btn-secondary { background: #3d2a55; color: #f5f0ff; border: 1px solid rgba(212,175,55,0.35); }
    ol { padding-left: 1.25rem; }
    li { margin: 0.5rem 0; }
    .ok { color: #9ccc65; font-size: 0.9rem; margin-top: 0.5rem; min-height: 1.25rem; }
    .note { font-size: 0.85rem; opacity: 0.75; margin-top: 1.25rem; }
  </style>
</head>
<body>
  <script>
  (function () {
    try {
      if (location.protocol !== 'http:') return;
      var h = location.hostname;
      if (h === '127.0.0.1' || h === 'localhost') return;
      if (!/^(?:\\d{1,3}\\.){3}\\d{1,3}$/.test(h)) return;
      fetch(location.origin + '/api/server-meta')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.clientIsOnServerMachine || !j.loopbackBase) return;
          var u = new URL(location.pathname + location.search + location.hash, j.loopbackBase);
          if (u.href !== location.href) location.replace(u.href);
        })
        .catch(function () {});
    } catch (e) {}
  })();
  </script>
  <h1>Add SquadSpell to Chrome</h1>
  <p>A Chrome tab to <strong>Extensions</strong> should have opened. If not, open <code>chrome://extensions</code> manually.</p>
  <ol>
    <li>Turn on <strong>Developer mode</strong> (top right).</li>
    <li>Click <strong>Load unpacked</strong>.</li>
    <li>Select this folder (copy the path below if needed):</li>
  </ol>
  <div class="path" id="path">${extDir.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
  <button type="button" id="copy">Copy folder path</button>
  <a class="btn btn-secondary" href="/">Play in browser (no extension)</a>
  <p class="ok" id="msg"></p>
  <p class="note">After loading the extension, click the SquadSpell puzzle icon → <strong>Start game</strong>. Wi‑Fi hosting uses this same server (already running).</p>
  <script>
    const EXT_PATH = ${extPathJson};
    document.getElementById('copy').onclick = async () => {
      const m = document.getElementById('msg');
      try {
        await navigator.clipboard.writeText(EXT_PATH);
        m.textContent = 'Copied to clipboard.';
      } catch (e) {
        m.textContent = 'Could not copy — select the path above and copy manually.';
      }
    };
  </script>
</body>
</html>`);
});

app.use(express.static(__dirname));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const rooms = new Map();

function makeCode() {
  return crypto.randomBytes(2).toString('hex').toUpperCase();
}

function broadcastRoom(room) {
  const { game, slots, code } = room;
  for (let i = 0; i < slots.length; i++) {
    const ws = slots[i];
    if (ws && ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({ type: 'state', payload: serializeState(game, i, code) }));
      } catch (e) {
        /* ignore */
      }
    }
  }
}

function sendError(ws, msg) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify({ type: 'error', message: msg }));
    } catch (e) {
      /* ignore */
    }
  }
}

wss.on('connection', ws => {
  ws.playerIndex = null;
  ws.roomCode = null;

  ws.on('message', async raw => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return sendError(ws, 'Invalid message');
    }

    const t = msg.type;

    if (t === 'hostRoom') {
      if (!Array.isArray(msg.playerNames) || msg.playerNames.length < 2 || msg.playerNames.length > 4) {
        return sendError(ws, 'Need 2–4 player names');
      }
      const names = msg.playerNames.map((n, i) => String(n || '').trim() || `Player ${i + 1}`);
      const dictMode = msg.dictMode === 'off' ? 'off' : 'online';
      let code;
      do {
        code = makeCode();
      } while (rooms.has(code));

      const game = new ScrabbleGameServer(names, dictMode);
      const room = { code, game, slots: Array(names.length).fill(null) };
      rooms.set(code, room);
      room.slots[0] = ws;
      ws.roomCode = code;
      ws.playerIndex = 0;
      broadcastRoom(room);
      ws.send(JSON.stringify({ type: 'hosted', roomCode: code }));
      return;
    }

    if (t === 'joinRoom') {
      const code = String(msg.code || '')
        .trim()
        .toUpperCase();
      const room = rooms.get(code);
      if (!room) return sendError(ws, 'Room not found');
      let slot = -1;
      for (let i = 1; i < room.slots.length; i++) {
        if (!room.slots[i]) {
          slot = i;
          break;
        }
      }
      if (slot < 0) return sendError(ws, 'Room is full');
      room.slots[slot] = ws;
      ws.roomCode = code;
      ws.playerIndex = slot;
      broadcastRoom(room);
      ws.send(JSON.stringify({ type: 'joined', roomCode: code, playerIndex: slot }));
      return;
    }

    const code = ws.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room || ws.playerIndex == null) return sendError(ws, 'Not in a room');

    const { game } = room;
    const pi = ws.playerIndex;

    const needsTurn = [
      'placeTile',
      'recallTile',
      'recallAll',
      'submitTurn',
      'passTurn',
      'exchangeTiles',
      'shuffleRack'
    ];
    if (needsTurn.includes(t) && game.gameOver) return sendError(ws, 'Game over');
    if (needsTurn.includes(t) && pi !== game.currentPlayerIndex) {
      return sendError(ws, 'Not your turn');
    }

    try {
      if (t === 'placeTile') {
        const ok = game.placeTile(msg.row, msg.col, msg.rackIndex, msg.blankLetter);
        if (!ok) sendError(ws, 'Cannot place tile');
        else broadcastRoom(room);
        return;
      }
      if (t === 'recallTile') {
        game.recallTile(msg.row, msg.col);
        broadcastRoom(room);
        return;
      }
      if (t === 'recallAll') {
        game.recallAllTiles();
        broadcastRoom(room);
        return;
      }
      if (t === 'shuffleRack') {
        game.shufflePlayerRack();
        broadcastRoom(room);
        return;
      }
      if (t === 'passTurn') {
        const ended = game.passTurn();
        broadcastRoom(room);
        if (ended) {
          for (const c of room.slots) {
            if (c && c.readyState === 1) {
              try {
                c.send(JSON.stringify({ type: 'gameOver' }));
              } catch (e) {
                /* ignore */
              }
            }
          }
        }
        return;
      }
      if (t === 'exchangeTiles') {
        if (!Array.isArray(msg.indices) || msg.indices.length === 0) {
          return sendError(ws, 'Select tiles');
        }
        const ok = game.exchangeTiles(msg.indices);
        if (!ok) sendError(ws, 'Cannot exchange');
        else broadcastRoom(room);
        return;
      }
      if (t === 'submitTurn') {
        const result = await game.submitTurn();
        broadcastRoom(room);
        if (!result.success && result.turnForfeited) {
          for (const c of room.slots) {
            if (c && c.readyState === 1) {
              c.send(JSON.stringify({ type: 'playRejected', result }));
            }
          }
        } else if (!result.success) {
          sendError(ws, result.error || 'Invalid play');
        } else {
          for (const c of room.slots) {
            if (c && c.readyState === 1) {
              c.send(JSON.stringify({ type: 'playSuccess', result }));
            }
          }
        }
        return;
      }
    } catch (e) {
      console.error(e);
      sendError(ws, 'Server error');
    }
  });

  ws.on('close', () => {
    const code = ws.roomCode;
    const room = code ? rooms.get(code) : null;
    if (!room) return;
    const i = ws.playerIndex;
    if (i == null) return;
    if (room.slots[i] !== ws) return;
    room.slots[i] = null;

    if (i === 0) {
      for (const c of room.slots) {
        if (c && c.readyState === 1) {
          sendError(c, 'Host disconnected. This room is closed.');
        }
      }
      rooms.delete(code);
    } else {
      broadcastRoom(room);
    }
  });
});

server.listen(PORT, BIND_HOST, () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`SquadSpell — open ${url}`);
  if (LAN_CLIENTS_ALLOWED) {
    console.log('Other devices on Wi‑Fi: http://<this-computer-LAN-IP>:' + PORT);
  } else {
    console.log('LAN / Wi‑Fi clients disabled (local-only). Unset SQUADSPELL_LAN=0 or bind 0.0.0.0 to allow.');
  }
  if (process.pkg) {
    if (hasPortableChromeExtension()) {
      openChromeExtensionsPage();
      openBrowser(`${url}/extension-setup`);
    } else {
      openBrowser(url);
    }
  }
});
