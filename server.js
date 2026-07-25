const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

// ─── Config ───────────────────────────────────────────────────────────────────
const SPEED              = 5;
const PLAYER_SIZE        = 48;
const TAG_DISTANCE       = 60;
const ROUND_TIME         = 60;
const TICK_RATE          = 50;
const HEAD_START_MS      = 5000;
const MAP_W              = 800;
const MAP_H              = 600;
const POWERUP_COLLECT_DIST = 48;
const POWERUP_DURATION_MS  = 6000;
const POWERUP_RESPAWN_MS   = 14000;
const JUMP_PAD_BOOST       = 180;  // px teleport distance forward
const SPEED_PAD_DURATION   = 2000; // ms of speed boost from pad

// ─── Hand-crafted maze layouts ────────────────────────────────────────────────
// Each wall: { x, y, w, h, style }
// style drives client visuals only

const MAZE_LAYOUTS = {

  // ── arena1 : THE PIT  (stone corridors) ────────────────────────────────────
  arena1: {
    obstacles: [
      // outer frame gaps left intentionally for entries
      {x:0,   y:0,   w:800, h:20,  style:'wall'}, // top
      {x:0,   y:580, w:800, h:20,  style:'wall'}, // bottom
      {x:0,   y:0,   w:20,  h:600, style:'wall'}, // left
      {x:780, y:0,   w:20,  h:600, style:'wall'}, // right
      // internal maze walls
      {x:100, y:20,  w:20,  h:160, style:'wall'},
      {x:100, y:260, w:20,  h:180, style:'wall'},
      {x:200, y:100, w:20,  h:200, style:'wall'},
      {x:200, y:380, w:20,  h:200, style:'wall'},
      {x:300, y:20,  w:20,  h:120, style:'wall'},
      {x:300, y:220, w:20,  h:160, style:'wall'},
      {x:300, y:460, w:20,  h:120, style:'wall'},
      {x:400, y:100, w:20,  h:160, style:'wall'},
      {x:400, y:360, w:20,  h:140, style:'wall'},
      {x:500, y:20,  w:20,  h:220, style:'wall'},
      {x:500, y:340, w:20,  h:220, style:'wall'},
      {x:600, y:100, w:20,  h:180, style:'wall'},
      {x:600, y:380, w:20,  h:180, style:'wall'},
      {x:680, y:20,  w:20,  h:160, style:'wall'},
      {x:680, y:260, w:20,  h:140, style:'wall'},
      // horizontal dividers
      {x:20,  y:200, w:160, h:20,  style:'wall'},
      {x:20,  y:400, w:80,  h:20,  style:'wall'},
      {x:220, y:300, w:80,  h:20,  style:'wall'},
      {x:320, y:160, w:80,  h:20,  style:'wall'},
      {x:320, y:440, w:80,  h:20,  style:'wall'},
      {x:420, y:260, w:80,  h:20,  style:'wall'},
      {x:520, y:160, w:80,  h:20,  style:'wall'},
      {x:520, y:440, w:80,  h:20,  style:'wall'},
      {x:620, y:300, w:80,  h:20,  style:'wall'},
      {x:700, y:200, w:80,  h:20,  style:'wall'},
      {x:700, y:420, w:80,  h:20,  style:'wall'},
    ],
    speedPads: [
      {x:150, y:80,  dir:'right'},
      {x:450, y:500, dir:'left'},
      {x:650, y:80,  dir:'down'},
    ],
    jumpPads: [
      {x:240, y:220, teleport:{x:540, y:220}},
      {x:540, y:380, teleport:{x:240, y:380}},
    ],
  },

  // ── arena2 : NEON CITY  (city blocks) ──────────────────────────────────────
  arena2: {
    obstacles: [
      {x:0,   y:0,   w:800, h:20,  style:'pillar'},
      {x:0,   y:580, w:800, h:20,  style:'pillar'},
      {x:0,   y:0,   w:20,  h:600, style:'pillar'},
      {x:780, y:0,   w:20,  h:600, style:'pillar'},
      // city blocks — wide rectangles like buildings
      {x:60,  y:60,  w:120, h:120, style:'pillar'},
      {x:260, y:60,  w:80,  h:200, style:'pillar'},
      {x:440, y:60,  w:200, h:80,  style:'pillar'},
      {x:700, y:60,  w:60,  h:160, style:'pillar'},
      {x:60,  y:260, w:80,  h:80,  style:'pillar'},
      {x:200, y:320, w:120, h:80,  style:'pillar'},
      {x:380, y:220, w:80,  h:160, style:'pillar'},
      {x:540, y:220, w:160, h:60,  style:'pillar'},
      {x:700, y:280, w:60,  h:120, style:'pillar'},
      {x:60,  y:420, w:160, h:80,  style:'pillar'},
      {x:300, y:460, w:200, h:80,  style:'pillar'},
      {x:560, y:420, w:80,  h:140, style:'pillar'},
      {x:700, y:460, w:60,  h:100, style:'pillar'},
      // neon dividers
      {x:160, y:160, w:80,  h:20,  style:'pillar'},
      {x:360, y:160, w:60,  h:20,  style:'pillar'},
      {x:460, y:300, w:80,  h:20,  style:'pillar'},
    ],
    speedPads: [
      {x:170, y:80,  dir:'right'},
      {x:660, y:500, dir:'up'},
      {x:350, y:350, dir:'right'},
    ],
    jumpPads: [
      {x:140, y:340, teleport:{x:640, y:140}},
      {x:640, y:340, teleport:{x:140, y:140}},
    ],
  },

  // ── arena3 : FROZEN LAKE  (ice sheet corridors) ─────────────────────────────
  arena3: {
    obstacles: [
      {x:0,   y:0,   w:800, h:20,  style:'ice'},
      {x:0,   y:580, w:800, h:20,  style:'ice'},
      {x:0,   y:0,   w:20,  h:600, style:'ice'},
      {x:780, y:0,   w:20,  h:600, style:'ice'},
      // long ice shelves
      {x:20,  y:100, w:300, h:20,  style:'ice'},
      {x:480, y:100, w:300, h:20,  style:'ice'},
      {x:20,  y:200, w:200, h:20,  style:'ice'},
      {x:380, y:200, w:200, h:20,  style:'ice'},
      {x:660, y:200, w:120, h:20,  style:'ice'},
      {x:20,  y:300, w:120, h:20,  style:'ice'},
      {x:260, y:300, w:280, h:20,  style:'ice'},
      {x:660, y:300, w:120, h:20,  style:'ice'},
      {x:20,  y:400, w:200, h:20,  style:'ice'},
      {x:380, y:400, w:200, h:20,  style:'ice'},
      {x:660, y:400, w:120, h:20,  style:'ice'},
      {x:20,  y:500, w:300, h:20,  style:'ice'},
      {x:480, y:500, w:300, h:20,  style:'ice'},
      // vertical ice pillars
      {x:160, y:120, w:20,  h:80,  style:'ice'},
      {x:400, y:120, w:20,  h:80,  style:'ice'},
      {x:620, y:120, w:20,  h:80,  style:'ice'},
      {x:240, y:220, w:20,  h:80,  style:'ice'},
      {x:540, y:220, w:20,  h:80,  style:'ice'},
      {x:160, y:420, w:20,  h:80,  style:'ice'},
      {x:400, y:420, w:20,  h:80,  style:'ice'},
      {x:620, y:420, w:20,  h:80,  style:'ice'},
    ],
    speedPads: [
      {x:340, y:60,  dir:'right'},
      {x:340, y:520, dir:'right'},
      {x:60,  y:340, dir:'down'},
    ],
    jumpPads: [
      {x:700, y:150, teleport:{x:60,  y:450}},
      {x:60,  y:150, teleport:{x:700, y:450}},
    ],
  },

  // ── arena4 : VOLCANO  (lava rock maze) ─────────────────────────────────────
  arena4: {
    obstacles: [
      {x:0,   y:0,   w:800, h:20,  style:'rock'},
      {x:0,   y:580, w:800, h:20,  style:'rock'},
      {x:0,   y:0,   w:20,  h:600, style:'rock'},
      {x:780, y:0,   w:20,  h:600, style:'rock'},
      // chunky rock formations
      {x:80,  y:80,  w:80,  h:80,  style:'rock'},
      {x:240, y:60,  w:60,  h:160, style:'rock'},
      {x:380, y:80,  w:160, h:60,  style:'rock'},
      {x:620, y:60,  w:80,  h:100, style:'rock'},
      {x:80,  y:240, w:60,  h:120, style:'rock'},
      {x:220, y:220, w:100, h:60,  style:'rock'},
      {x:420, y:220, w:60,  h:120, style:'rock'},
      {x:560, y:200, w:140, h:60,  style:'rock'},
      {x:700, y:220, w:60,  h:120, style:'rock'},
      {x:80,  y:440, w:100, h:80,  style:'rock'},
      {x:260, y:420, w:60,  h:140, style:'rock'},
      {x:380, y:460, w:160, h:60,  style:'rock'},
      {x:560, y:420, w:80,  h:100, style:'rock'},
      {x:700, y:460, w:60,  h:80,  style:'rock'},
      // lava channel dividers
      {x:160, y:160, w:80,  h:20,  style:'rock'},
      {x:340, y:340, w:80,  h:20,  style:'rock'},
      {x:560, y:340, w:80,  h:20,  style:'rock'},
      {x:160, y:360, w:80,  h:20,  style:'rock'},
    ],
    speedPads: [
      {x:320, y:160, dir:'right'},
      {x:640, y:380, dir:'up'},
      {x:160, y:500, dir:'right'},
    ],
    jumpPads: [
      {x:320, y:480, teleport:{x:320, y:80}},
      {x:480, y:80,  teleport:{x:480, y:480}},
    ],
  },

  // ── arena5 : THE VOID  (dark symmetrical labyrinth) ────────────────────────
  arena5: {
    obstacles: [
      {x:0,   y:0,   w:800, h:20,  style:'void'},
      {x:0,   y:580, w:800, h:20,  style:'void'},
      {x:0,   y:0,   w:20,  h:600, style:'void'},
      {x:780, y:0,   w:20,  h:600, style:'void'},
      // symmetric void spires
      {x:80,  y:80,  w:20,  h:200, style:'void'},
      {x:700, y:80,  w:20,  h:200, style:'void'},
      {x:80,  y:320, w:20,  h:200, style:'void'},
      {x:700, y:320, w:20,  h:200, style:'void'},
      {x:160, y:80,  w:200, h:20,  style:'void'},
      {x:440, y:80,  w:200, h:20,  style:'void'},
      {x:160, y:500, w:200, h:20,  style:'void'},
      {x:440, y:500, w:200, h:20,  style:'void'},
      {x:160, y:160, w:20,  h:160, style:'void'},
      {x:620, y:160, w:20,  h:160, style:'void'},
      {x:160, y:280, w:120, h:20,  style:'void'},
      {x:520, y:280, w:120, h:20,  style:'void'},
      {x:260, y:200, w:20,  h:200, style:'void'},
      {x:520, y:200, w:20,  h:200, style:'void'},
      {x:300, y:200, w:200, h:20,  style:'void'},
      {x:300, y:380, w:200, h:20,  style:'void'},
      // centre cross
      {x:360, y:260, w:80,  h:20,  style:'void'},
      {x:390, y:240, w:20,  h:120, style:'void'},
    ],
    speedPads: [
      {x:100, y:300, dir:'down'},
      {x:680, y:300, dir:'up'},
      {x:390, y:430, dir:'right'},
    ],
    jumpPads: [
      {x:100, y:540, teleport:{x:680, y:60}},
      {x:680, y:540, teleport:{x:100, y:60}},
    ],
  },

  // ── arena6 : JUNGLE  (dense organic maze) ──────────────────────────────────
  arena6: {
    obstacles: [
      {x:0,   y:0,   w:800, h:20,  style:'tree'},
      {x:0,   y:580, w:800, h:20,  style:'tree'},
      {x:0,   y:0,   w:20,  h:600, style:'tree'},
      {x:780, y:0,   w:20,  h:600, style:'tree'},
      // jungle canopy clusters (round-ish via radius in client)
      {x:60,  y:60,  w:100, h:100, style:'tree'},
      {x:220, y:60,  w:60,  h:160, style:'tree'},
      {x:360, y:60,  w:100, h:80,  style:'tree'},
      {x:540, y:40,  w:80,  h:120, style:'tree'},
      {x:680, y:60,  w:80,  h:80,  style:'tree'},
      {x:40,  y:220, w:80,  h:120, style:'tree'},
      {x:180, y:240, w:120, h:60,  style:'tree'},
      {x:360, y:200, w:60,  h:120, style:'tree'},
      {x:500, y:220, w:100, h:80,  style:'tree'},
      {x:680, y:200, w:80,  h:140, style:'tree'},
      {x:60,  y:400, w:80,  h:140, style:'tree'},
      {x:200, y:420, w:120, h:80,  style:'tree'},
      {x:380, y:380, w:80,  h:120, style:'tree'},
      {x:520, y:420, w:140, h:60,  style:'tree'},
      {x:700, y:400, w:60,  h:140, style:'tree'},
      // vines / branches
      {x:160, y:160, w:60,  h:20,  style:'tree'},
      {x:460, y:160, w:80,  h:20,  style:'tree'},
      {x:280, y:340, w:80,  h:20,  style:'tree'},
      {x:620, y:340, w:60,  h:20,  style:'tree'},
    ],
    speedPads: [
      {x:300, y:120, dir:'right'},
      {x:300, y:460, dir:'right'},
      {x:680, y:300, dir:'up'},
    ],
    jumpPads: [
      {x:140, y:300, teleport:{x:640, y:300}},
      {x:640, y:480, teleport:{x:140, y:100}},
    ],
  },
};

// ─── Map-exclusive powerups: safe player vs IT ────────────────────────────────
// safeType = picked up by a safe player, itType = picked up by IT
const MAP_POWERUP_DEFS = {
  arena1: { safeType:'shield',   itType:'magnet'  }, // Pit: shield self / magnet pulls safe players
  arena2: { safeType:'speed',    itType:'flash'   }, // City: safe speed / IT flash-dash
  arena3: { safeType:'freeze',   itType:'blizzard'}, // Lake: freeze IT / blizzard slows all safe
  arena4: { safeType:'swap',     itType:'inferno' }, // Volcano: swap pos / inferno large tag radius
  arena5: { safeType:'ghost',    itType:'phase'   }, // Void: ghost walk / IT phases through walls
  arena6: { safeType:'shrink',   itType:'hunt'    }, // Jungle: shrink IT radius / IT sees all positions
};

function buildPowerups(mapId, obstacles) {
  const def = MAP_POWERUP_DEFS[mapId] || { safeType:'speed', itType:'flash' };
  // 2 safe powerups + 2 IT powerups, placed in quadrants
  const slots = [
    { x:120, y:120 }, { x:620, y:440 },  // safe
    { x:620, y:120 }, { x:120, y:440 },  // IT
  ];
  return [
    { id:'pu_s0', forIt:false, type:def.safeType, x:slots[0].x, y:slots[0].y, active:true },
    { id:'pu_s1', forIt:false, type:def.safeType, x:slots[1].x, y:slots[1].y, active:true },
    { id:'pu_i0', forIt:true,  type:def.itType,   x:slots[2].x, y:slots[2].y, active:true },
    { id:'pu_i1', forIt:true,  type:def.itType,   x:slots[3].x, y:slots[3].y, active:true },
  ];
}

// ─── Collision ────────────────────────────────────────────────────────────────
function collidesWithObstacle(px, py, obstacles, size = PLAYER_SIZE) {
  for (const o of obstacles) {
    if (px < o.x+o.w && px+size > o.x && py < o.y+o.h && py+size > o.y) return true;
  }
  return false;
}

// ─── State ────────────────────────────────────────────────────────────────────
const lobbies = {};

function generateCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }
function dist(a,b) { return Math.hypot(a.position.x-b.position.x, a.position.y-b.position.y); }
function clamp(v,lo,hi) { return Math.min(Math.max(v,lo),hi); }
function getLobbyPlayers(c) { return lobbies[c]?.players ?? []; }
function broadcastLobbyPlayers(c) { io.to(c).emit('playersUpdate', getLobbyPlayers(c)); }

// Spawn points per map (handpicked open spots)
const SPAWN_POINTS = {
  arena1: [{x:40,y:40},{x:720,y:40},{x:40,y:520},{x:720,y:520}],
  arena2: [{x:40,y:40},{x:700,y:40},{x:40,y:500},{x:700,y:500}],
  arena3: [{x:40,y:40},{x:720,y:40},{x:40,y:520},{x:720,y:520}],
  arena4: [{x:40,y:40},{x:700,y:40},{x:40,y:500},{x:700,y:500}],
  arena5: [{x:100,y:280},{x:660,y:280},{x:380,y:100},{x:380,y:480}],
  arena6: [{x:300,y:280},{x:480,y:280},{x:300,y:460},{x:480,y:100}],
};

function getSpawn(mapId, index) {
  const pts = SPAWN_POINTS[mapId] || [{x:60,y:60},{x:700,y:60},{x:60,y:500},{x:700,y:500}];
  return { ...pts[index % pts.length] };
}

// ─── Socket ───────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('createLobby', (player) => {
    const code = generateCode();
    lobbies[code] = { host:socket.id, players:[], map:'arena1', gameActive:false,
                      timer:ROUND_TIME, interval:null, obstacles:[], powerups:[], speedPads:[], jumpPads:[] };
    _joinLobby(socket, code, player);
    socket.emit('lobbyCreated', code);
  });

  socket.on('joinLobby', (code, player) => {
    const lobby = lobbies[code];
    if (!lobby)                    return socket.emit('error','Lobby not found.');
    if (lobby.gameActive)          return socket.emit('error','Game already started.');
    if (lobby.players.length >= 4) return socket.emit('error','Lobby is full.');
    if (lobby.players.find(p=>p.id===socket.id)) return;
    _joinLobby(socket, code, player);
  });

  function _joinLobby(socket, code, player) {
    socket.join(code);
    socket.data.lobbyCode = code;
    socket.emit('joinedLobby', code);
    lobbies[code].players.push({
      id:socket.id, name:player.name||'Player', color:player.color||'red',
      position:{x:100,y:100}, it:false, taggedTime:0,
      keys:{up:false,down:false,left:false,right:false},
      activeEffect:null, headStartUntil:0,
    });
    broadcastLobbyPlayers(code);
  }

  socket.on('changeMap', (code, map) => {
    const lobby = lobbies[code];
    if (!lobby||lobby.host!==socket.id) return;
    lobby.map = map; io.to(code).emit('mapUpdate', map);
  });

  socket.on('startGame', (code) => {
    const lobby = lobbies[code];
    if (!lobby||lobby.host!==socket.id) return;
    if (lobby.players.length < 2) return socket.emit('error','Need at least 2 players.');
    if (lobby.gameActive) return;

    lobby.gameActive = true;
    lobby.timer = ROUND_TIME;
    const layout = MAZE_LAYOUTS[lobby.map] || MAZE_LAYOUTS.arena1;
    lobby.obstacles = layout.obstacles;
    lobby.speedPads = layout.speedPads || [];
    lobby.jumpPads  = layout.jumpPads  || [];
    lobby.powerups  = buildPowerups(lobby.map, lobby.obstacles);

    const itIndex = Math.floor(Math.random() * lobby.players.length);
    lobby.players.forEach((p,i) => {
      p.it=i===itIndex; p.taggedTime=0; p.activeEffect=null; p.headStartUntil=0;
      p.position = getSpawn(lobby.map, i);
    });

    io.to(code).emit('gameStart', {
      players:lobby.players, map:lobby.map,
      obstacles:lobby.obstacles, powerups:lobby.powerups,
      speedPads:lobby.speedPads, jumpPads:lobby.jumpPads,
    });

    // ── Tick ──────────────────────────────────────────────────────────────────
    lobby.interval = setInterval(() => {
      if (!lobby.gameActive) return;
      const now = Date.now();
      const players = lobby.players;

      // Expire effects
      players.forEach(p => {
        if (p.activeEffect && now > p.activeEffect.expiresAt) {
          p.activeEffect = null;
          io.to(code).emit('powerupExpired', { playerId:p.id });
        }
      });

      // Move
      players.forEach(p => {
        const ghost  = p.activeEffect?.type === 'ghost' || p.activeEffect?.type === 'phase';
        const slow   = p.activeEffect?.type === 'blizzard' && !p.it;
        const fast   = p.activeEffect?.type === 'speed' || p.activeEffect?.type === 'padSpeed';
        const spMult = fast ? 1.9 : slow ? 0.45 : 1;
        let nx = p.position.x, ny = p.position.y;

        if (p.keys.up)    ny -= SPEED * spMult;
        if (p.keys.down)  ny += SPEED * spMult;
        if (p.keys.left)  nx -= SPEED * spMult;
        if (p.keys.right) nx += SPEED * spMult;
        nx = clamp(nx, 0, MAP_W-PLAYER_SIZE);
        ny = clamp(ny, 0, MAP_H-PLAYER_SIZE);

        if (ghost) { p.position.x=nx; p.position.y=ny; }
        else {
          if (!collidesWithObstacle(nx, p.position.y, lobby.obstacles)) p.position.x=nx;
          if (!collidesWithObstacle(p.position.x, ny, lobby.obstacles)) p.position.y=ny;
        }

        // Speed pads
        lobby.speedPads.forEach(sp => {
          if (Math.hypot(p.position.x-sp.x, p.position.y-sp.y) < 36) {
            if (!p.activeEffect || p.activeEffect.type === 'padSpeed') {
              p.activeEffect = { type:'padSpeed', expiresAt: now+SPEED_PAD_DURATION };
              io.to(code).emit('padActivated', { playerId:p.id, padType:'speed', dir:sp.dir });
            }
          }
        });

        // Jump pads
        lobby.jumpPads.forEach(jp => {
          if (Math.hypot(p.position.x-jp.x, p.position.y-jp.y) < 36) {
            if (!p._jumpCooldown || now > p._jumpCooldown) {
              p.position.x = jp.teleport.x;
              p.position.y = jp.teleport.y;
              p._jumpCooldown = now + 1500;
              io.to(code).emit('padActivated', { playerId:p.id, padType:'jump' });
              io.to(code).emit('positionUpdate', { id:p.id, position:p.position });
            }
          }
        });

        io.to(code).emit('positionUpdate', { id:p.id, position:p.position });
      });

      // Powerup collection
      lobby.powerups.forEach(pu => {
        if (!pu.active) return;
        players.forEach(p => {
          if (Math.hypot(p.position.x-pu.x, p.position.y-pu.y) >= POWERUP_COLLECT_DIST) return;
          // Enforce role: IT pickups forIt only, safe pickups !forIt only
          if (pu.forIt && !p.it) return;
          if (!pu.forIt && p.it) return;

          pu.active = false;
          p.activeEffect = { type:pu.type, expiresAt: now+POWERUP_DURATION_MS };
          io.to(code).emit('powerupCollected', { powerupId:pu.id, playerId:p.id, type:pu.type, forIt:pu.forIt });

          // Instant effects
          if (pu.type === 'swap') {
            const itP = players.find(q=>q.it);
            if (itP && itP.id !== p.id) {
              const tmp = {...itP.position};
              itP.position = {...p.position};
              p.position = tmp;
              io.to(code).emit('positionUpdate', {id:itP.id, position:itP.position});
              io.to(code).emit('positionUpdate', {id:p.id,   position:p.position});
            }
            p.activeEffect = null;
          }
          if (pu.type === 'hunt') {
            // Reveal all player positions to IT
            players.forEach(q => {
              io.to(socket.id).emit('huntReveal', { id:q.id, position:q.position });
            });
            p.activeEffect = { type:'hunt', expiresAt: now+POWERUP_DURATION_MS };
          }

          setTimeout(() => {
            pu.active = true;
            io.to(code).emit('powerupRespawned', { powerupId:pu.id });
          }, POWERUP_RESPAWN_MS);
        });
      });

      // Tag detection
      const itPlayer = players.find(p=>p.it);
      if (itPlayer) {
        itPlayer.taggedTime += TICK_RATE/1000;
        const frozen   = itPlayer.activeEffect?.type === 'freeze';
        const inferno  = itPlayer.activeEffect?.type === 'inferno';
        const tagDist  = inferno ? TAG_DISTANCE*2.2
                       : itPlayer.activeEffect?.type === 'shrink' ? TAG_DISTANCE*0.4
                       : TAG_DISTANCE;

        if (!frozen) {
          // Magnet: pull nearest safe player slightly toward IT
          if (itPlayer.activeEffect?.type === 'magnet') {
            players.forEach(p => {
              if (p.it) return;
              const dx = itPlayer.position.x - p.position.x;
              const dy = itPlayer.position.y - p.position.y;
              const d  = Math.hypot(dx,dy);
              if (d > 0 && d < 220) {
                const pull = 1.5;
                const nx = clamp(p.position.x + dx/d*pull, 0, MAP_W-PLAYER_SIZE);
                const ny = clamp(p.position.y + dy/d*pull, 0, MAP_H-PLAYER_SIZE);
                if (!collidesWithObstacle(nx,p.position.y,lobby.obstacles)) p.position.x=nx;
                if (!collidesWithObstacle(p.position.x,ny,lobby.obstacles)) p.position.y=ny;
                io.to(code).emit('positionUpdate',{id:p.id,position:p.position});
              }
            });
          }

          for (const p of players) {
            if (p.it) continue;
            if (now < p.headStartUntil) continue;
            if (p.activeEffect?.type === 'shield') continue;
            if (dist(itPlayer,p) < tagDist) {
              itPlayer.it=false;
              itPlayer.headStartUntil = now+HEAD_START_MS;
              p.it=true;
              io.to(code).emit('tag',{from:itPlayer.id,to:p.id,headStartMs:HEAD_START_MS});
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
        clearInterval(countdown); clearInterval(lobby.interval);
        lobby.gameActive = false;
        io.to(code).emit('gameEnd', lobby.players);
      }
    }, 1000);
  });

  socket.on('move', (code, dir) => {
    const lobby = lobbies[code];
    if (!lobby?.gameActive) return;
    const player = lobby.players.find(p=>p.id===socket.id);
    if (!player) return;
    player.keys[dir]=true;
    clearTimeout(player[`_stop_${dir}`]);
    player[`_stop_${dir}`]=setTimeout(()=>{player.keys[dir]=false;}, TICK_RATE*2);
  });

  socket.on('leaveLobby', code => _removeFromLobby(socket,code));
  socket.on('disconnect', () => {
    const code = socket.data.lobbyCode;
    if (code) _removeFromLobby(socket,code);
  });

  function _removeFromLobby(socket,code) {
    const lobby = lobbies[code];
    if (!lobby) return;
    lobby.players = lobby.players.filter(p=>p.id!==socket.id);
    socket.leave(code);
    if (lobby.players.length===0) { clearInterval(lobby.interval); delete lobbies[code]; return; }
    if (lobby.host===socket.id) lobby.host=lobby.players[0].id;
    broadcastLobbyPlayers(code);
    if (lobby.gameActive && lobby.players.length<2) {
      clearInterval(lobby.interval); lobby.gameActive=false;
      io.to(code).emit('gameEnd',lobby.players);
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ultimatum server running on port ${PORT}`));
