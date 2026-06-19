const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ─── Game Config ─────────────────────────────────────────────────────────────
const SPEED       = 5;
const PLAYER_SIZE = 48;
const TAG_DISTANCE = 60;
const ROUND_TIME  = 60;
const TICK_RATE   = 50;
const MAP_W       = 800;
const MAP_H       = 600;
const MAP_BOUNDS  = { minX: 0, minY: 0, maxX: MAP_W, maxY: MAP_H };

// ─── Seeded RNG (mulberry32) ──────────────────────────────────────────────────
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = s + 0x6d2b79f5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ─── Obstacle generation ─────────────────────────────────────────────────────
// Each map has a personality that shapes what gets generated.
const MAP_PROFILES = {
  arena1: { count: 8,  minW: 40, maxW: 120, minH: 20, maxH: 80,  style: 'wall' },
  arena2: { count: 12, minW: 20, maxW: 60,  minH: 20, maxH: 120, style: 'pillar' },
  arena3: { count: 6,  minW: 80, maxW: 200, minH: 20, maxH: 40,  style: 'ice' },
  arena4: { count: 10, minW: 30, maxW: 90,  minH: 30, maxH: 90,  style: 'rock' },
  arena5: { count: 14, minW: 20, maxW: 50,  minH: 20, maxH: 50,  style: 'void' },
  arena6: { count: 9,  minW: 30, maxW: 100, minH: 30, maxH: 100, style: 'tree' },
};

function generateObstacles(mapId, seed) {
  const profile = MAP_PROFILES[mapId] || MAP_PROFILES.arena1;
  const rng = makeRng(seed);
  const obstacles = [];

  // Safe zone in centre so players don't immediately clip into a wall
  const SAFE_MARGIN = 80;

  for (let i = 0; i < profile.count; i++) {
    const w = Math.floor(profile.minW + rng() * (profile.maxW - profile.minW));
    const h = Math.floor(profile.minH + rng() * (profile.maxH - profile.minH));

    // Place anywhere inside bounds minus a border strip
    const border = 40;
    const x = Math.floor(border + rng() * (MAP_W - w - border * 2));
    const y = Math.floor(border + rng() * (MAP_H - h - border * 2));

    // Skip if it overlaps the very centre safe zone
    const cx = x + w / 2, cy = y + h / 2;
    if (
      cx > MAP_W / 2 - SAFE_MARGIN && cx < MAP_W / 2 + SAFE_MARGIN &&
      cy > MAP_H / 2 - SAFE_MARGIN && cy < MAP_H / 2 + SAFE_MARGIN
    ) continue;

    obstacles.push({ x, y, w, h, style: profile.style });
  }

  return obstacles;
}

// ─── AABB collision ───────────────────────────────────────────────────────────
function collidesWithObstacle(px, py, obstacles) {
  for (const o of obstacles) {
    if (
      px < o.x + o.w &&
      px + PLAYER_SIZE > o.x &&
      py < o.y + o.h &&
      py + PLAYER_SIZE > o.y
    ) return true;
  }
  return false;
}

// ─── State ────────────────────────────────────────────────────────────────────
const lobbies = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function distance(a, b) {
  return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
}

function randomSpawn(obstacles) {
  // Keep trying until we find a clear spot
  for (let i = 0; i < 100; i++) {
    const x = 60 + Math.random() * (MAP_W - 180);
    const y = 60 + Math.random() * (MAP_H - 180);
    if (!collidesWithObstacle(x, y, obstacles)) return { x, y };
  }
  // Fallback to corners
  return { x: 60, y: 60 };
}

function clamp(val, min, max) { return Math.min(Math.max(val, min), max); }
function getLobbyPlayers(code) { return lobbies[code]?.players ?? []; }
function broadcastLobbyPlayers(code) {
  io.to(code).emit('playersUpdate', getLobbyPlayers(code));
}

// ─── Socket handlers ──────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // ── Create Lobby ─────────────────────────────────────────────────────────────
  socket.on('createLobby', (player) => {
    const code = generateCode();
    lobbies[code] = {
      host: socket.id,
      players: [],
      map: 'arena1',
      gameActive: false,
      timer: ROUND_TIME,
      interval: null,
      obstacles: [],
    };
    _joinLobby(socket, code, player);
    socket.emit('lobbyCreated', code);
  });

  // ── Join Lobby ────────────────────────────────────────────────────────────────
  socket.on('joinLobby', (code, player) => {
    const lobby = lobbies[code];
    if (!lobby)                    return socket.emit('error', 'Lobby not found.');
    if (lobby.gameActive)          return socket.emit('error', 'Game already started.');
    if (lobby.players.length >= 4) return socket.emit('error', 'Lobby is full.');
    if (lobby.players.find(p => p.id === socket.id)) return;
    _joinLobby(socket, code, player);
  });

  function _joinLobby(socket, code, player) {
    socket.join(code);
    socket.data.lobbyCode = code;
    socket.emit('joinedLobby', code);
    lobbies[code].players.push({
      id:         socket.id,
      name:       player.name || 'Player',
      color:      player.color || 'red',
      position:   { x: 100, y: 100 },
      it:         false,
      taggedTime: 0,
      keys:       { up: false, down: false, left: false, right: false },
    });
    broadcastLobbyPlayers(code);
  }

  // ── Change Map ────────────────────────────────────────────────────────────────
  socket.on('changeMap', (code, map) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.host !== socket.id) return;
    lobby.map = map;
    io.to(code).emit('mapUpdate', map);
  });

  // ── Start Game ────────────────────────────────────────────────────────────────
  socket.on('startGame', (code) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.host !== socket.id) return;
    if (lobby.players.length < 2) return socket.emit('error', 'Need at least 2 players.');
    if (lobby.gameActive) return;

    lobby.gameActive = true;
    lobby.timer = ROUND_TIME;

    // Generate obstacles with a random seed (sent to clients so they draw the same layout)
    const seed = Math.floor(Math.random() * 0xffffffff);
    lobby.obstacles = generateObstacles(lobby.map, seed);

    // Pick random IT
    const itIndex = Math.floor(Math.random() * lobby.players.length);
    lobby.players.forEach((p, i) => {
      p.it         = i === itIndex;
      p.taggedTime = 0;
      p.position   = randomSpawn(lobby.obstacles);
    });

    io.to(code).emit('gameStart', {
      players:   lobby.players,
      map:       lobby.map,
      obstacles: lobby.obstacles,
      seed,
    });

    // ── Game tick ───────────────────────────────────────────────────────────────
    lobby.interval = setInterval(() => {
      if (!lobby.gameActive) return;
      const players = lobby.players;

      players.forEach((p) => {
        let nx = p.position.x;
        let ny = p.position.y;

        if (p.keys.up)    ny -= SPEED;
        if (p.keys.down)  ny += SPEED;
        if (p.keys.left)  nx -= SPEED;
        if (p.keys.right) nx += SPEED;

        // Clamp to bounds
        nx = clamp(nx, MAP_BOUNDS.minX, MAP_BOUNDS.maxX - PLAYER_SIZE);
        ny = clamp(ny, MAP_BOUNDS.minY, MAP_BOUNDS.maxY - PLAYER_SIZE);

        // Obstacle collision — try axes independently for sliding
        const canMoveX = !collidesWithObstacle(nx, p.position.y, lobby.obstacles);
        const canMoveY = !collidesWithObstacle(p.position.x, ny, lobby.obstacles);

        if (canMoveX) p.position.x = nx;
        if (canMoveY) p.position.y = ny;

        io.to(code).emit('positionUpdate', { id: p.id, position: p.position });
      });

      // Tag detection — IT touches a safe player → swap
      const itPlayer = players.find((p) => p.it);
      if (itPlayer) {
        // Accumulate tagged time BEFORE potentially swapping
        itPlayer.taggedTime += TICK_RATE / 1000;

        for (const p of players) {
          if (p.it) continue;
          if (distance(itPlayer, p) < TAG_DISTANCE) {
            itPlayer.it = false;   // tagger becomes safe
            p.it        = true;    // tagged player becomes IT
            io.to(code).emit('tag', { from: itPlayer.id, to: p.id });
            break; // only one tag per tick
          }
        }
      }

    }, TICK_RATE);

    // ── Countdown ───────────────────────────────────────────────────────────────
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

  // ── Movement ──────────────────────────────────────────────────────────────────
  socket.on('move', (code, dir) => {
    const lobby = lobbies[code];
    if (!lobby?.gameActive) return;
    const player = lobby.players.find((p) => p.id === socket.id);
    if (!player) return;
    player.keys[dir] = true;
    clearTimeout(player[`_stop_${dir}`]);
    player[`_stop_${dir}`] = setTimeout(() => { player.keys[dir] = false; }, TICK_RATE * 2);
  });

  // ── Leave / Disconnect ────────────────────────────────────────────────────────
  socket.on('leaveLobby', (code) => { _removeFromLobby(socket, code); });
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
      clearInterval(lobby.interval);
      delete lobbies[code];
      return;
    }
    if (lobby.host === socket.id) lobby.host = lobby.players[0].id;
    broadcastLobbyPlayers(code);
    if (lobby.gameActive && lobby.players.length < 2) {
      clearInterval(lobby.interval);
      lobby.gameActive = false;
      io.to(code).emit('gameEnd', lobby.players);
    }
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ultimatum server running on port ${PORT}`));
