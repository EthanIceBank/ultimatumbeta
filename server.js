const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

// ─── Config ───────────────────────────────────────────────────────────────────
const SPEED              = 6;
const PLAYER_SIZE        = 48;
const TAG_DISTANCE       = 64;
const ROUND_TIME         = 60;
const TICK_RATE          = 50;
const HEAD_START_MS      = 5000;
const MAP_W              = 4800;
const MAP_H              = 3000;
const POWERUP_COLLECT_DIST = 50;
const POWERUP_DURATION_MS  = 6000;
const POWERUP_RESPAWN_MS   = 14000;
const SPEED_PAD_DURATION   = 2000;

// ─── Collision ────────────────────────────────────────────────────────────────
function collidesWithObstacle(px, py, obstacles, size = PLAYER_SIZE) {
  for (const o of obstacles) {
    if (px < o.x+o.w && px+size > o.x && py < o.y+o.h && py+size > o.y) return true;
  }
  return false;
}

// Helper: verify a spawn point is clear of all obstacles with margin
function spawnClear(x, y, obstacles, margin = 30) {
  return !collidesWithObstacle(x - margin, y - margin, obstacles, PLAYER_SIZE + margin*2);
}

// ─── Maze layouts (1600×1000 canvas) ─────────────────────────────────────────
const MAZE_LAYOUTS = {

  // ── arena1 : THE PIT ────────────────────────────────────────────────────────
  arena1: {
    obstacles: [
      {x:0,    y:0,    w:1600, h:12,   style:'wall'},
      {x:0,    y:988,  w:1600, h:12,   style:'wall'},
      {x:0,    y:0,    w:12,   h:1000, style:'wall'},
      {x:1588, y:0,    w:12,   h:1000, style:'wall'},
      {x:200,  y:12,   w:12,   h:280,  style:'wall'},
      {x:200,  y:380,  w:12,   h:260,  style:'wall'},
      {x:200,  y:730,  w:12,   h:258,  style:'wall'},
      {x:400,  y:150,  w:12,   h:280,  style:'wall'},
      {x:400,  y:520,  w:12,   h:320,  style:'wall'},
      {x:600,  y:12,   w:12,   h:220,  style:'wall'},
      {x:600,  y:320,  w:12,   h:280,  style:'wall'},
      {x:600,  y:700,  w:12,   h:288,  style:'wall'},
      {x:800,  y:120,  w:12,   h:300,  style:'wall'},
      {x:800,  y:520,  w:12,   h:280,  style:'wall'},
      {x:1000, y:12,   w:12,   h:260,  style:'wall'},
      {x:1000, y:380,  w:12,   h:260,  style:'wall'},
      {x:1000, y:740,  w:12,   h:248,  style:'wall'},
      {x:1200, y:150,  w:12,   h:280,  style:'wall'},
      {x:1200, y:530,  w:12,   h:300,  style:'wall'},
      {x:1400, y:12,   w:12,   h:240,  style:'wall'},
      {x:1400, y:360,  w:12,   h:260,  style:'wall'},
      {x:1400, y:720,  w:12,   h:268,  style:'wall'},
      {x:12,   y:320,  w:188,  h:12,   style:'wall'},
      {x:12,   y:650,  w:120,  h:12,   style:'wall'},
      {x:212,  y:480,  w:188,  h:12,   style:'wall'},
      {x:412,  y:320,  w:188,  h:12,   style:'wall'},
      {x:412,  y:720,  w:188,  h:12,   style:'wall'},
      {x:612,  y:480,  w:188,  h:12,   style:'wall'},
      {x:812,  y:320,  w:188,  h:12,   style:'wall'},
      {x:812,  y:720,  w:188,  h:12,   style:'wall'},
      {x:1012, y:480,  w:188,  h:12,   style:'wall'},
      {x:1212, y:320,  w:188,  h:12,   style:'wall'},
      {x:1212, y:720,  w:188,  h:12,   style:'wall'},
      {x:1412, y:480,  w:176,  h:12,   style:'wall'},

    ],
    speedPads: [
      {x:300, y:80,  dir:'right'},
      {x:900, y:880, dir:'left'},
      {x:1500,y:80,  dir:'down'},
    ],
    // spawns verified clear: corners + mid sides, well away from walls
    spawns: [{x:640,y:480}, {x:4200,y:560}, {x:4240,y:2440}, {x:800,y:2320}],
  },

  // ── arena2 : NEON CITY ──────────────────────────────────────────────────────
  arena2: {
    obstacles: [
    {x:600,y:960,w:720,h:40,style:'pillar'},
    {x:1280,y:440,w:40,h:560,style:'pillar'},
    {x:160,y:1000,w:40,h:1320,style:'pillar'},
    {x:800,y:2440,w:3160,h:40,style:'pillar'},
    {x:4680,y:960,w:80,h:1280,style:'pillar'},
    {x:3000,y:320,w:840,h:80,style:'pillar'},
    {x:3800,y:360,w:80,h:720,style:'pillar'},
    {x:3640,y:320,w:280,h:80,style:'pillar'},
    ],
    speedPads: [
      {x:440,  y:200,  dir:'right'},
      {x:440,  y:780,  dir:'right'},
      {x:1200, y:500,  dir:'up'},
    ],
    spawns: [
      {x:80,   y:500},
      {x:1470, y:500},
      {x:700,  y:80},
      {x:700,  y:880},
    ],
  },

  // ── arena3 : FROZEN LAKE ────────────────────────────────────────────────────
  arena3: {
    obstacles: [
    {x:480,y:120,w:40,h:760,style:'ice'},
    {x:1080,y:1040,w:40,h:720,style:'ice'},
    {x:1600,y:160,w:40,h:840,style:'ice'},
    {x:2040,y:1120,w:80,h:720,style:'ice'},
    {x:2760,y:120,w:40,h:840,style:'ice'},
    {x:3080,y:1000,w:40,h:920,style:'ice'},
    {x:3320,y:160,w:40,h:560,style:'ice'},
    {x:3680,y:1000,w:40,h:960,style:'ice'},
    {x:4000,y:160,w:40,h:680,style:'ice'},
    {x:4240,y:1880,w:40,h:800,style:'ice'},
    {x:520,y:1720,w:40,h:880,style:'ice'},
    ],
    speedPads: [
    {x:800,  y:100,  dir:'right'},
    {x:800,  y:900,  dir:'right'},
    {x:100,  y:500,  dir:'down'},
    ],
    spawns: [
    {x:100,  y:100},
    {x:1460, y:100},
    {x:100,  y:880},
    {x:1460, y:880},

    ],
  },

  // ── arena4 : VOLCANO ────────────────────────────────────────────────────────
  arena4: {
    obstacles: [
    {x:360,y:440,w:800,h:400,style:'wall'},
    {x:2200,y:480,w:520,h:720,style:'void'},
    {x:3880,y:360,w:360,h:280,style:'void'},
    {x:1160,y:1760,w:720,h:440,style:'tree'},
    {x:3680,y:2040,w:280,h:280,style:'tree'},
    {x:2720,y:1560,w:200,h:240,style:'tree'},
    {x:3720,y:960,w:200,h:160,style:'tree'},
    {x:320,y:1240,w:240,h:160,style:'tree'},
    {x:440,y:2360,w:240,h:200,style:'tree'},
    {x:2560,y:2480,w:200,h:160,style:'tree'},
],
    ],
    speedPads: [
      {x:500,  y:260,  dir:'right'},
      {x:1000, y:600,  dir:'up'},
      {x:240,  y:880,  dir:'right'},
    ],
    spawns: [{x:320,y:200}, {x:4520,y:240}, {x:4440,y:2600}, {x:800,y:2760}],
  },

  // ── arena5 : THE VOID ───────────────────────────────────────────────────────
  arena5: {
    obstacles: [
      {x:1760,y:1040,w:1000,h:920,style:'void'},
      {x:280,y:1520,w:400,h:200,style:'void'},
      {x:2120,y:240,w:400,h:320,style:'void'},
      {x:3920,y:1160,w:480,h:320,style:'void'},
      {x:2040,y:2400,w:640,h:400,style:'void'},
    ],
    speedPads: [
      {x:200,  y:494,  dir:'down'},
      {x:1380, y:494,  dir:'up'},
      {x:794,  y:880,  dir:'right'},
    ],
    // spawns placed in the open corridors between outer ring and inner walls
    spawns: [{x:1440,y:680}, {x:520,y:2400}, {x:4200,y:440}, {x:4480,y:2320}],
  },

  // ── arena6 : JUNGLE ─────────────────────────────────────────────────────────
  arena6: {
    obstacles: [
    {x:760,y:320,w:160,h:120,style:'tree'},
    {x:880,y:240,w:200,h:200,style:'tree'},
    {x:960,y:360,w:240,h:160,style:'tree'},
    {x:880,y:440,w:160,h:280,style:'tree'},
    {x:2880,y:200,w:120,h:120,style:'tree'},
    {x:2920,y:160,w:200,h:160,style:'tree'},
    {x:2800,y:280,w:160,h:120,style:'tree'},
    {x:2880,y:320,w:320,h:160,style:'tree'},
    {x:2880,y:400,w:120,h:120,style:'tree'},
    {x:3000,y:400,w:40,h:320,style:'wall'},
    {x:960,y:680,w:40,h:280,style:'wall'},
    {x:1640,y:1720,w:40,h:440,style:'wall'},
    {x:1320,y:1640,w:240,h:160,style:'tree'},
    {x:1480,y:1400,w:320,h:320,style:'tree'},
    {x:1720,y:1680,w:200,h:160,style:'tree'},
    {x:1560,y:1640,w:240,h:240,style:'tree'},
    {x:3640,y:1600,w:40,h:560,style:'wall'},
    {x:3320,y:1440,w:160,h:160,style:'tree'},
    {x:3400,y:1240,w:320,h:240,style:'tree'},
    {x:3360,y:1400,w:520,h:200,style:'tree'},
    {x:360,y:2080,w:120,h:160,style:'tree'},
    {x:400,y:1840,w:200,h:240,style:'tree'},
    {x:440,y:2080,w:280,h:160,style:'tree'},
    {x:480,y:2120,w:40,h:280,style:'wall'},
    {x:2560,y:1240,w:40,h:480,style:'wall'},
    {x:2400,y:960,w:360,h:280,style:'tree'},
    ],
    speedPads: [
      {x:480,  y:220,  dir:'right'},
      {x:480,  y:800,  dir:'right'},
      {x:1280, y:500,  dir:'up'},
    ],
    spawns:[{x:400,y:960}, {x:4400,y:600}, {x:2200,y:520}, {x:2400,y:2040}]
  },
};
// ─── Public map data API ──────────────────────────────────────────────────────
app.get('/api/maps', (_req, res) => {
  const data = {};
  Object.entries(MAZE_LAYOUTS).forEach(([id, layout]) => {
    data[id] = {
      obstacles: layout.obstacles,
      speedPads: layout.speedPads || [],
      spawns:    layout.spawns    || [],
      mapW:      MAP_W,
      mapH:      MAP_H,
    };
  });
  res.json(data);
});


// ─── Admin config ─────────────────────────────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_KEY
const adminSockets = new Set();  // socket IDs that have authenticated as admin

// Machine data store: { [socketId]: { name, color, ip, ua, connectedAt } }
const machineData = {};

// ─── Admin HTTP routes ────────────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  if (req.query.key && req.query.key === ADMIN_KEY) {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  } else if (!req.query.key) {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  } else {
    res.status(403).send('Forbidden');
  }
});

app.get('/admin/verify', (req, res) => {
  if (req.query.key === ADMIN_KEY) res.sendStatus(200);
  else res.sendStatus(403);
});

// Helper: build admin state snapshot
function adminSnapshot() {
  const snap = {};
  Object.entries(lobbies).forEach(([code, lobby]) => {
    snap[code] = {
      code,
      map:        lobby.map,
      gameActive: lobby.gameActive,
      timer:      lobby.timer,
      players:    lobby.players.map(p => ({
        id:         p.id,
        name:       p.name,
        color:      p.color,
        it:         p.it,
        taggedTime: p.taggedTime,
        position:   p.position,
      })),
      obstacles:  lobby.obstacles || [],
    };
  });
  return snap;
}

function broadcastAdmin(event, data) {
  adminSockets.forEach(id => {
    const s = io.sockets.sockets.get(id);
    if (s) s.emit(event, data);
  });
}

function adminEvent(code, text, color = '#8b949e') {
  broadcastAdmin('admin:event', { code, text, color, ts: Date.now() });
}

// ─── Socket ───────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  // Store machine metadata
  machineData[socket.id] = {
    ip:          socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || socket.handshake.address,
    ua:          socket.handshake.headers['user-agent'] || 'Unknown',
    connectedAt: Date.now(),
  };

  // ── Admin socket handlers ──────────────────────────────────────────────────
  socket.on('admin:join', (key) => {
    if (key !== ADMIN_KEY) return socket.emit('error', 'Invalid admin key.');
    adminSockets.add(socket.id);
    socket.emit('admin:state', adminSnapshot());
    socket.emit('admin:machineData', machineData);
  });

  socket.on('admin:requestMachineData', (key) => {
    if (key !== ADMIN_KEY) return;
    socket.emit('admin:machineData', machineData);
  });

  socket.on('admin:kick', ({ adminKey: key, socketId, code }) => {
    if (key !== ADMIN_KEY) return;
    const target = io.sockets.sockets.get(socketId);
    if (target) {
      target.emit('error', 'You were kicked by the admin.');
      target.disconnect(true);
      adminEvent(code, `Player kicked by admin`, '#f85149');
    }
  });

// ─── Verify all spawns at startup ─────────────────────────────────────────────
Object.entries(MAZE_LAYOUTS).forEach(([mapId, layout]) => {
  layout.spawns.forEach((sp, i) => {
    if (collidesWithObstacle(sp.x, sp.y, layout.obstacles)) {
      console.warn(`[WARN] ${mapId} spawn ${i} (${sp.x},${sp.y}) collides with obstacle!`);
    }
  });
});

// ─── Map-exclusive powerups ───────────────────────────────────────────────────
const MAP_POWERUP_DEFS = {
  arena1: { safeType:'shield',  itType:'magnet'   },
  arena2: { safeType:'speed',   itType:'flash'    },
  arena3: { safeType:'freeze',  itType:'blizzard' },
  arena4: { safeType:'swap',    itType:'inferno'  },
  arena5: { safeType:'ghost',   itType:'phase'    },
  arena6: { safeType:'shrink',  itType:'hunt'     },
};

function buildPowerups(mapId) {
  const def = MAP_POWERUP_DEFS[mapId] || { safeType:'speed', itType:'flash' };
  // Place in clear quadrant centres — scale to 1600×1000
  return [
    { id:'pu_s0', forIt:false, type:def.safeType, x:300,  y:300,  active:true },
    { id:'pu_s1', forIt:false, type:def.safeType, x:1260, y:680,  active:true },
    { id:'pu_i0', forIt:true,  type:def.itType,   x:1260, y:300,  active:true },
    { id:'pu_i1', forIt:true,  type:def.itType,   x:300,  y:680,  active:true },
  ];
}

// ─── State ────────────────────────────────────────────────────────────────────
const lobbies = {};

function generateCode() { return Math.random().toString(36).substring(2,8).toUpperCase(); }
function dist(a,b) { return Math.hypot(a.position.x-b.position.x, a.position.y-b.position.y); }
function clamp(v,lo,hi) { return Math.min(Math.max(v,lo),hi); }
function getLobbyPlayers(c) { return lobbies[c]?.players ?? []; }
function broadcastLobbyPlayers(c) { io.to(c).emit('playersUpdate', getLobbyPlayers(c)); }

function getSpawn(mapId, index) {
  const pts = MAZE_LAYOUTS[mapId]?.spawns || [{x:100,y:100},{x:1460,y:100},{x:100,y:860},{x:1460,y:860}];
  return { ...pts[index % pts.length] };
}

// ─── Public map data API ──────────────────────────────────────────────────────
app.get('/api/maps', (_req, res) => {
  const data = {};
  Object.entries(MAZE_LAYOUTS).forEach(([id, layout]) => {
    data[id] = {
      obstacles: layout.obstacles,
      speedPads: layout.speedPads || [],
      spawns:    layout.spawns    || [],
      mapW:      MAP_W,
      mapH:      MAP_H,
    };
  });
  res.json(data);
});

// ─── Socket ───────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[connect] ${socket.id}`);

  socket.on('createLobby', (player) => {
    const code = generateCode();
    lobbies[code] = { host:socket.id, players:[], map:'arena1', gameActive:false,
                      timer:ROUND_TIME, interval:null, countdown:null,
                      obstacles:[], powerups:[], speedPads:[] };
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
    lobby.map = map;
    io.to(code).emit('mapUpdate', map);
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
    lobby.powerups  = buildPowerups(lobby.map);

    const itIndex = Math.floor(Math.random() * lobby.players.length);
    lobby.players.forEach((p,i) => {
      p.it=i===itIndex; p.taggedTime=0; p.activeEffect=null; p.headStartUntil=0;
      p.position = getSpawn(lobby.map, i);
    });

    io.to(code).emit('gameStart', {
      players:lobby.players, map:lobby.map,
      obstacles:lobby.obstacles, powerups:lobby.powerups,
      speedPads:lobby.speedPads,
      mapW: MAP_W, mapH: MAP_H,
    });

    // ── Game tick ──────────────────────────────────────────────────────────────
    lobby.interval = setInterval(() => {
      if (!lobby.gameActive) return;
      const now = Date.now();
      const players = lobby.players;

      players.forEach(p => {
        if (p.activeEffect && now > p.activeEffect.expiresAt) {
          p.activeEffect = null;
          io.to(code).emit('powerupExpired', { playerId:p.id });
        }
      });

      players.forEach(p => {
        const ghost  = p.activeEffect?.type==='ghost' || p.activeEffect?.type==='phase';
        const slow   = p.activeEffect?.type==='blizzard' && !p.it;
        const fast   = p.activeEffect?.type==='speed' || p.activeEffect?.type==='padSpeed';
        const spMult = fast ? 1.9 : slow ? 0.45 : 1;
        let nx=p.position.x, ny=p.position.y;

        if (p.keys.up)    ny -= SPEED*spMult;
        if (p.keys.down)  ny += SPEED*spMult;
        if (p.keys.left)  nx -= SPEED*spMult;
        if (p.keys.right) nx += SPEED*spMult;
        nx = clamp(nx, 0, MAP_W-PLAYER_SIZE);
        ny = clamp(ny, 0, MAP_H-PLAYER_SIZE);

        if (ghost) { p.position.x=nx; p.position.y=ny; }
        else {
          if (!collidesWithObstacle(nx, p.position.y, lobby.obstacles)) p.position.x=nx;
          if (!collidesWithObstacle(p.position.x, ny, lobby.obstacles)) p.position.y=ny;
        }

        // Speed pads
        lobby.speedPads.forEach(sp => {
          if (Math.hypot(p.position.x-sp.x, p.position.y-sp.y) < 40) {
            if (!p.activeEffect || p.activeEffect.type==='padSpeed') {
              p.activeEffect = { type:'padSpeed', expiresAt: now+SPEED_PAD_DURATION };
              io.to(code).emit('padActivated', { playerId:p.id, padType:'speed', dir:sp.dir });
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
          if (pu.forIt && !p.it) return;
          if (!pu.forIt && p.it) return;
          pu.active = false;
          p.activeEffect = { type:pu.type, expiresAt: now+POWERUP_DURATION_MS };
          io.to(code).emit('powerupCollected', { powerupId:pu.id, playerId:p.id, type:pu.type, forIt:pu.forIt });
          if (pu.type==='swap') {
            const itP=players.find(q=>q.it);
            if (itP&&itP.id!==p.id) {
              const tmp={...itP.position}; itP.position={...p.position}; p.position=tmp;
              io.to(code).emit('positionUpdate',{id:itP.id,position:itP.position});
              io.to(code).emit('positionUpdate',{id:p.id,position:p.position});
            }
            p.activeEffect=null;
          }
          setTimeout(() => { pu.active=true; io.to(code).emit('powerupRespawned',{powerupId:pu.id}); }, POWERUP_RESPAWN_MS);
        });
      });

      // Tag detection
      const itPlayer = players.find(p=>p.it);
      if (itPlayer) {
        itPlayer.taggedTime += TICK_RATE/1000;
        const frozen  = itPlayer.activeEffect?.type==='freeze';
        const tagDist = itPlayer.activeEffect?.type==='inferno'  ? TAG_DISTANCE*2.2
                      : itPlayer.activeEffect?.type==='shrink'   ? TAG_DISTANCE*0.4
                      : TAG_DISTANCE;
        if (!frozen) {
          if (itPlayer.activeEffect?.type==='magnet') {
            players.forEach(p => {
              if (p.it) return;
              const dx=itPlayer.position.x-p.position.x, dy=itPlayer.position.y-p.position.y;
              const d=Math.hypot(dx,dy);
              if (d>0&&d<300) {
                const nx=clamp(p.position.x+dx/d*1.5,0,MAP_W-PLAYER_SIZE);
                const ny=clamp(p.position.y+dy/d*1.5,0,MAP_H-PLAYER_SIZE);
                if (!collidesWithObstacle(nx,p.position.y,lobby.obstacles)) p.position.x=nx;
                if (!collidesWithObstacle(p.position.x,ny,lobby.obstacles)) p.position.y=ny;
                io.to(code).emit('positionUpdate',{id:p.id,position:p.position});
              }
            });
          }
          for (const p of players) {
            if (p.it||now<p.headStartUntil) continue;
            if (p.activeEffect?.type==='shield') continue;
            if (dist(itPlayer,p)<tagDist) {
              itPlayer.it=false; itPlayer.headStartUntil=now+HEAD_START_MS;
              p.it=true;
              io.to(code).emit('tag',{from:itPlayer.id,to:p.id,headStartMs:HEAD_START_MS});
              break;
            }
          }
        }
      }
    }, TICK_RATE);

    // ── Countdown ─────────────────────────────────────────────────────────────
    lobby.countdown = setInterval(() => {
      if (!lobby.gameActive) { clearInterval(lobby.countdown); return; }
      lobby.timer--;
      io.to(code).emit('timerUpdate', lobby.timer);
      if (lobby.timer <= 0) {
        clearInterval(lobby.countdown); clearInterval(lobby.interval);
        lobby.gameActive = false;
        const results = lobby.players.map(p=>({
          id:p.id, name:p.name, color:p.color,
          taggedTime: typeof p.taggedTime==='number' ? p.taggedTime : 0,
        }));
        io.to(code).emit('gameEnd', results);
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
    const code=socket.data.lobbyCode;
    if (code) _removeFromLobby(socket,code);
  });

  function _removeFromLobby(socket,code) {
    const lobby=lobbies[code];
    if (!lobby) return;
    lobby.players=lobby.players.filter(p=>p.id!==socket.id);
    socket.leave(code);
    if (lobby.players.length===0) {
      clearInterval(lobby.interval); clearInterval(lobby.countdown);
      delete lobbies[code]; return;
    }
    if (lobby.host===socket.id) lobby.host=lobby.players[0].id;
    broadcastLobbyPlayers(code);
    if (lobby.gameActive&&lobby.players.length<2) {
      clearInterval(lobby.interval); clearInterval(lobby.countdown);
      lobby.gameActive=false;
      const results=lobby.players.map(p=>({
        id:p.id,name:p.name,color:p.color,
        taggedTime:typeof p.taggedTime==='number'?p.taggedTime:0,
      }));
      io.to(code).emit('gameEnd',results);
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Ultimatum server running on port ${PORT}`));


