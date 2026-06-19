const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// ─── Game Config ────────────────────────────────────────────────────────────
const SPEED        = 5;       // px per tick
const PLAYER_SIZE  = 48;      // px (matches w-12 h-12)
const TAG_DISTANCE = 60;      // px — how close to tag
const ROUND_TIME   = 60;      // seconds
const TICK_RATE    = 50;      // ms (20 ticks/sec)

// Map boundaries (canvas is roughly 800×600 for now; server clamps positions)
const MAP_BOUNDS = { minX: 0, minY: 0, maxX: 800, maxY: 600 };

// ─── State ───────────────────────────────────────────────────────────────────
// lobbies: { [code]: { host, players: [], map, gameActive, timer, interval } }
const lobbies = {};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function distance(a, b) {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

function randomSpawn() {
  return {
    x: 100 + Math.random() * (MAP_BOUNDS.maxX - 200),
    y: 100 + Math.random() * (MAP_BOUNDS.maxY - 200),
  };
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max);
}

function getLobbyPlayers(code) {
  return lobbies[code]?.players ?? [];
}

function broadcastLobbyPlayers(code) {
  io.to(code).emit('playersUpdate', getLobbyPlayers(code));
}

// ─── Socket handlers ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── Create Lobby ────────────────────────────────────────────────────────────
  socket.on('createLobby', (player) => {
    const code = generateCode();
    lobbies[code] = {
      host: socket.id,
      players: [],
      map: 'arena1',
      gameActive: false,
      timer: ROUND_TIME,
      interval: null,
    };

    _joinLobby(socket, code, player);
    socket.emit('lobbyCreated', code);
  });

  // ── Join Lobby ──────────────────────────────────────────────────────────────
  socket.on('joinLobby', (code, player) => {
    const lobby = lobbies[code];
    if (!lobby)                         return socket.emit('error', 'Lobby not found.');
    if (lobby.gameActive)               return socket.emit('error', 'Game already started.');
    if (lobby.players.length >= 4)      return socket.emit('error', 'Lobby is full.');
    if (lobby.players.find(p => p.id === socket.id)) return; // already in

    _joinLobby(socket, code, player);
  });

  function _joinLobby(socket, code, player) {
    socket.join(code);
    socket.data.lobbyCode = code;
    socket.emit("joinedLobby", code);

    lobbies[code].players.push({
      id:         socket.id,
      name:       player.name || 'Player',
      color:      player.color || 'red',
      position:   randomSpawn(),
      it:         false,
      taggedTime: 0,
      keys:       { up: false, down: false, left: false, right: false },
    });

    broadcastLobbyPlayers(code);
  }

  // ── Change Map ──────────────────────────────────────────────────────────────
  socket.on('changeMap', (code, map) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.host !== socket.id) return;
    lobby.map = map;
    io.to(code).emit('mapUpdate', map);
  });

  // ── Start Game ──────────────────────────────────────────────────────────────
  socket.on('startGame', (code) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.host !== socket.id) return;
    if (lobby.players.length < 2)           return socket.emit('error', 'Need at least 2 players.');
    if (lobby.gameActive)                   return;

    lobby.gameActive = true;
    lobby.timer      = ROUND_TIME;

    // Pick a random "IT" player
    const itIndex = Math.floor(Math.random() * lobby.players.length);
    lobby.players.forEach((p, i) => {
      p.it         = i === itIndex;
      p.taggedTime = 0;
      p.position   = randomSpawn();
    });

    io.to(code).emit('gameStart', {
      players: lobby.players,
      map:     lobby.map,
    });

    // Game tick — movement + tag detection
    lobby.interval = setInterval(() => {
      if (!lobby.gameActive) return;

      const players = lobby.players;

      // Move each player
      players.forEach((p) => {
        if (p.keys.up)    p.position.y -= SPEED;
        if (p.keys.down)  p.position.y += SPEED;
        if (p.keys.left)  p.position.x -= SPEED;
        if (p.keys.right) p.position.x += SPEED;

        p.position.x = clamp(p.position.x, MAP_BOUNDS.minX, MAP_BOUNDS.maxX - PLAYER_SIZE);
        p.position.y = clamp(p.position.y, MAP_BOUNDS.minY, MAP_BOUNDS.maxY - PLAYER_SIZE);

        io.to(code).emit('positionUpdate', { id: p.id, position: p.position });
      });

      // Tag detection — "IT" player touches another
      const itPlayer = players.find((p) => p.it);
      if (itPlayer) {
        players.forEach((p) => {
          if (p.it) return;
          if (distance(itPlayer, p) < TAG_DISTANCE) {
            itPlayer.it = false;
            p.it        = true;
            io.to(code).emit('tag', { from: itPlayer.id, to: p.id });
          }
        });
      }

      // Accumulate tagged time for the current "IT" player
      const currentIt = players.find((p) => p.it);
      if (currentIt) currentIt.taggedTime += TICK_RATE / 1000;

    }, TICK_RATE);

    // Round countdown (1-second intervals)
    const countdown = setInterval(() => {
      if (!lobby.gameActive) { clearInterval(countdown); return; }

      lobby.timer--;
      io.to(code).emit('timerUpdate', lobby.timer);

      if (lobby.timer <= 0) {
        clearInterval(countdown);
        clearInterval(lobby.interval);
        lobby.gameActive = false;

        io.to(code).emit('gameEnd', lobby.players);
      }
    }, 1000);
  });

  // ── Player Movement ─────────────────────────────────────────────────────────
  socket.on('move', (code, dir) => {
    const lobby = lobbies[code];
    if (!lobby?.gameActive) return;

    const player = lobby.players.find((p) => p.id === socket.id);
    if (!player) return;

    // Reset all, then set the pressed key
    // (client sends key-down each tick while held)
    player.keys[dir] = true;

    // Auto-release: if no 'move' arrives for this direction in 2 ticks, stop
    clearTimeout(player[`_stop_${dir}`]);
    player[`_stop_${dir}`] = setTimeout(() => {
      player.keys[dir] = false;
    }, TICK_RATE * 2);
  });

  // ── Leave Lobby ─────────────────────────────────────────────────────────────
  socket.on('leaveLobby', (code) => {
    _removeFromLobby(socket, code);
  });

  // ── Disconnect ──────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    console.log(`[disconnect] ${socket.id}`);
    const code = socket.data.lobbyCode;
    if (code) _removeFromLobby(socket, code);
  });

  function _removeFromLobby(socket, code) {
    const lobby = lobbies[code];
    if (!lobby) return;

    lobby.players = lobby.players.filter((p) => p.id !== socket.id);
    socket.leave(code);

    if (lobby.players.length === 0) {
      // Clean up empty lobby
      clearInterval(lobby.interval);
      delete lobbies[code];
      return;
    }

    // Transfer host if needed
    if (lobby.host === socket.id) {
      lobby.host = lobby.players[0].id;
    }

    broadcastLobbyPlayers(code);

    // End game early if fewer than 2 players remain mid-game
    if (lobby.gameActive && lobby.players.length < 2) {
      clearInterval(lobby.interval);
      lobby.gameActive = false;
      io.to(code).emit('gameEnd', lobby.players);
    }
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Ultimatum server running on port ${PORT}`);
});
