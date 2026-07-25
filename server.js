const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ─── Config ───────────────────────────────────────────────────────────────────
const SPEED         = 5;
const PLAYER_SIZE   = 48;
const TAG_DISTANCE  = 60;
const ROUND_TIME    = 60;
const TICK_RATE     = 50;
const HEAD_START_MS = 5000;   // ms the new IT can't be retagged after swap
const MAP_W         = 800;
const MAP_H         = 600;
const POWERUP_SIZE  = 32;
const POWERUP_COLLECT_DIST = 50;
const POWERUP_DURATION_MS  = 5000;  // effect lasts 5s
const POWERUP_RESPAWN_MS   = 12000; // respawn after 12s

// ─── Seeded RNG ───────────────────────────────────────────────────────────────
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
const MAP_PROFILES = {
  arena1: { count: 7,  minW: 50, maxW: 120, minH: 25, maxH: 70,  style: 'wall'   },
  arena2: { count: 10, minW: 22, maxW: 55,  minH: 22, maxH: 110, style: 'pillar' },
  arena3: { count: 5,  minW: 90, maxW: 190, minH: 22, maxH: 38,  style: 'ice'    },
  arena4: { count: 8,  minW: 35, maxW: 85,  minH: 35, maxH: 85,  style: 'rock'   },
  arena5: { count: 12, minW: 22, maxW: 48,  minH: 22, maxH: 48,  style: 'void'   },
  arena6: { count: 8,  minW: 35, maxW: 90,  minH: 35, maxH: 90,  style: 'tree'   },
};

// Map-exclusive powerup types
const MAP_POWERUPS = {
  arena1: ['shield'],          // The Pit  — protective shield
  arena2: ['speed'],           // Neon City — speed boost
  arena3: ['freeze'],          // Frozen Lake — freeze IT briefly
  arena4: ['swap'],            // Volcano — random position swap
  arena5: ['ghost'],           // The Void — ghost (pass through obstacles)
  arena6: ['shrink'],          // Jungle — shrink tag radius for IT
};

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh, margin = 0) {
  return ax < bx + bw + margin &&
         ax + aw + margin > bx &&
         ay < by + bh + margin &&
         ay + ah + margin > by;
}

function generateObstacles(mapId, seed) {
  const profile = MAP_PROFILES[mapId] || MAP_PROFILES.arena1;
  const rng = makeRng(seed);
  const placed = [];
  const BORDER     = 50;
  const MIN_GAP    = 80;   // minimum gap between any two obstacles
  const SAFE_R     = 100;  // centre safe radius
  const MAX_TRIES  = 60;

  for (let i = 0; i < profile.count; i++) {
    const w = Math.floor(profile.minW + rng() * (profile.maxW - profile.minW));
    const h = Math.floor(profile.minH + rng() * (profile.maxH - profile.minH));

    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const x = Math.floor(BORDER + rng() * (MAP_W - w - BORDER * 2));
      const y = Math.floor(BORDER + rng() * (MAP_H - h - BORDER * 2));
      const cx = x + w / 2, cy = y + h / 2;

      // Skip centre safe zone
      if (Math.hypot(cx - MAP_W / 2, cy - MAP_H / 2) < SAFE_R) continue;

      // Skip if too close to any already-placed obstacle
      const tooClose = placed.some(o =>
        rectsOverlap(x, y, w, h, o.x, o.y, o.w, o.h, MIN_GAP)
      );
      if (tooClose) continue;

      placed.push({ x, y, w, h, style: profile.style });
      break;
    }
  }
  return placed;
}

// ─── Powerup generation ───────────────────────────────────────────────────────
function generatePowerups(mapId, obstacles, seed) {
  const types = MAP_POWERUPS[mapId] || ['speed'];
  const rng = makeRng(seed + 1);
  const powerups = [];
  const count = 3;

  for (let i = 0; i < count; i++) {
    const type = types[Math.floor(rng() * types.length)];
    for (let attempt = 0; attempt < 80; attempt++) {
      const x = Math.floor(60 + rng() * (MAP_W - 120));
      const y = Math.floor(60 + rng() * (MAP_H - 120));
      if (collidesWithObstacle(x, y, obstacles, POWERUP_SIZE)) continue;
      powerups.push({ id: `pu_${i}`, type, x, y, active: true });
      break;
    }
  }
  return powerups;
}

// ─── Collision ────────────────────────────────────────────────────────────────
function collidesWithObstacle(px, py, obstacles, size = PLAYER_SIZE) {
  for (const o of obstacles) {
    if (px < o.x + o.w && px + size > o.x && py < o.y + o.h && py + size > o.y) return true;
  }
  return false;
}

// ─── State ────────────────────────────────────────────────────────────────────
const lobbies = {};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function generateCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }
function distance(a, b) { return Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y); }
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function getLobbyPlayers(c) { return lobbies[c]?.players ?? []; }
function broadcastLobbyPlayers(c) { io.to(c).emit('playersUpdate', getLobbyPlayers(c)); }

function randomSpawn(obstacles) {
  for (let i = 0; i < 150; i++) {
    const x = 60 + Math.random() * (MAP_W - 180);
    const y = 60 + Math.random() * (MAP_H - 180);
    if (!collidesWithObstacle(x, y, obstacles)) return { x, y };
  }
  return { x: 60, y: 60 };
}

// ─── Socket ───────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('createLobby', (player) => {
    const code = generateCode();
    lobbies[code] = {
      host: socket.id, players: [], map: 'arena1',
      gameActive: false, timer: ROUND_TIME,
      interval: null, obstacles: [], powerups: [],
    };
    _joinLobby(socket, code, player);
    socket.emit('lobbyCreated', code);
  });

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
      id: socket.id,
      name: player.name || 'Player',
      color: player.color || 'red',
      position: { x: 100, y: 100 },
      it: false,
      taggedTime: 0,
      keys: { up: false, down: false, left: false, right: false },
      // powerup state
      activeEffect: null,   // { type, expiresAt }
      headStartUntil: 0,    // timestamp — can't be retagged before this
    });
    broadcastLobbyPlayers(code);
  }

  socket.on('changeMap', (code, map) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.host !== socket.id) return;
    lobby.map = map;
    io.to(code).emit('mapUpdate', map);
  });

  socket.on('startGame', (code) => {
    const lobby = lobbies[code];
    if (!lobby || lobby.host !== socket.id) return;
    if (lobby.players.length < 2) return socket.emit('error', 'Need at least 2 players.');
    if (lobby.gameActive) return;

    lobby.gameActive = true;
    lobby.timer = ROUND_TIME;

    const seed = Math.floor(Math.random() * 0xffffffff);
    lobby.obstacles = generateObstacles(lobby.map, seed);
    lobby.powerups  = generatePowerups(lobby.map, lobby.obstacles, seed);

    const itIndex = Math.floor(Math.random() * lobby.players.length);
    lobby.players.forEach((p, i) => {
      p.it           = i === itIndex;
      p.taggedTime   = 0;
      p.activeEffect = null;
      p.headStartUntil = 0;
      p.position     = randomSpawn(lobby.obstacles);
    });

    io.to(code).emit('gameStart', {
      players:   lobby.players,
      map:       lobby.map,
      obstacles: lobby.obstacles,
      powerups:  lobby.powerups,
      seed,
    });

    // ── Game tick ──────────────────────────────────────────────────────────────
    lobby.interval = setInterval(() => {
      if (!lobby.gameActive) return;
      const now = Date.now();
      const players = lobby.players;

      // Clear expired effects
      players.forEach(p => {
        if (p.activeEffect && now > p.activeEffect.expiresAt) {
          p.activeEffect = null;
          io.to(code).emit('powerupExpired', { playerId: p.id });
        }
      });

      // Movement
      players.forEach((p) => {
        const isGhost = p.activeEffect?.type === 'ghost';
        const speedMult = p.activeEffect?.type === 'speed' ? 1.8 : 1;
        let nx = p.position.x;
        let ny = p.position.y;

        if (p.keys.up)    ny -= SPEED * speedMult;
        if (p.keys.down)  ny += SPEED * speedMult;
        if (p.keys.left)  nx -= SPEED * speedMult;
        if (p.keys.right) nx += SPEED * speedMult;

        nx = clamp(nx, 0, MAP_W - PLAYER_SIZE);
        ny = clamp(ny, 0, MAP_H - PLAYER_SIZE);

        if (isGhost) {
          p.position.x = nx;
          p.position.y = ny;
        } else {
          if (!collidesWithObstacle(nx, p.position.y, lobby.obstacles)) p.position.x = nx;
          if (!collidesWithObstacle(p.position.x, ny, lobby.obstacles)) p.position.y = ny;
        }

        io.to(code).emit('positionUpdate', { id: p.id, position: p.position });
      });

      // Powerup collection
      lobby.powerups.forEach(pu => {
        if (!pu.active) return;
        players.forEach(p => {
          if (Math.hypot(p.position.x - pu.x, p.position.y - pu.y) < POWERUP_COLLECT_DIST) {
            pu.active = false;
            p.activeEffect = { type: pu.type, expiresAt: now + POWERUP_DURATION_MS };
            io.to(code).emit('powerupCollected', { powerupId: pu.id, playerId: p.id, type: pu.type });

            // Handle instant effects
            if (pu.type === 'swap') {
              // Swap IT player's position with collector
              const itPlayer = players.find(q => q.it);
              if (itPlayer && itPlayer.id !== p.id) {
                const tmp = { ...itPlayer.position };
                itPlayer.position = { ...p.position };
                p.position = tmp;
                io.to(code).emit('positionUpdate', { id: itPlayer.id, position: itPlayer.position });
                io.to(code).emit('positionUpdate', { id: p.id, position: p.position });
              }
              p.activeEffect = null; // swap is instant
            }

            // Respawn powerup after delay
            setTimeout(() => {
              pu.active = true;
              io.to(code).emit('powerupRespawned', { powerupId: pu.id });
            }, POWERUP_RESPAWN_MS);
          }
        });
      });

      // Tag detection
      const itPlayer = players.find(p => p.it);
      if (itPlayer) {
        // Frozen IT can't tag
        const itFrozen = itPlayer.activeEffect?.type === 'freeze';

        itPlayer.taggedTime += TICK_RATE / 1000;

        if (!itFrozen) {
          const effectiveTagDist = itPlayer.activeEffect?.type === 'shrink'
            ? TAG_DISTANCE * 0.4   // shrunk tag radius
            : TAG_DISTANCE;

          for (const p of players) {
            if (p.it) continue;
            if (now < p.headStartUntil) continue;           // head start protection
            if (p.activeEffect?.type === 'shield') continue; // shielded
            if (distance(itPlayer, p) < effectiveTagDist) {
              itPlayer.it          = false;
              itPlayer.headStartUntil = now + HEAD_START_MS; // old IT gets 5s head start
              p.it                 = true;
              io.to(code).emit('tag', { from: itPlayer.id, to: p.id, headStartMs: HEAD_START_MS });
              break;
            }
          }
        }
      }

    }, TICK_RATE);

    // ── Countdown ─────────────────────────────────────────────────────────────
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

  socket.on('move', (code, dir) => {
    const lobby = lobbies[code];
    if (!lobby?.gameActive) return;
    const player = lobby.players.find(p => p.id === socket.id);
    if (!player) return;
    player.keys[dir] = true;
    clearTimeout(player[`_stop_${dir}`]);
    player[`_stop_${dir}`] = setTimeout(() => { player.keys[dir] = false; }, TICK_RATE * 2);
  });

  socket.on('leaveLobby', (code) => { _removeFromLobby(socket, code); });
  socket.on('disconnect', () => {
    const code = socket.data.lobbyCode;
    if (code) _removeFromLobby(socket, code);
  });

  function _removeFromLobby(socket, code) {
    const lobby = lobbies[code];
    if (!lobby) return;
    lobby.players = lobby.players.filter(p => p.id !== socket.id);
    socket.leave(code);
    if (lobby.players.length === 0) { clearInterval(lobby.interval); delete lobbies[code]; return; }
    if (lobby.host === socket.id) lobby.host = lobby.players[0].id;
    broadcastLobbyPlayers(code);
    if (lobby.gameActive && lobby.players.length < 2) {
      clearInterval(lobby.interval);
      lobby.gameActive = false;
      io.to(code).emit('gameEnd', lobby.players);
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ultimatum server running on port ${PORT}`));
