const socket = io();

// ─── Audio Manager ────────────────────────────────────────────────────────────
const Audio = {
  _unlocked: false,
  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    ['bgMusic','sfxTag','sfxCountdown','sfxWin','sfxLose'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.volume = 0;
      el.play().catch(() => {}).finally(() => { el.pause(); el.currentTime = 0; el.volume = 1; });
    });
  },
  playBg() {
    const el = document.getElementById('bgMusic');
    if (!el || !el.paused) return;
    el.volume = 0.35; el.currentTime = 0; el.play().catch(() => {});
  },
  stopBg() {
    const el = document.getElementById('bgMusic');
    if (!el) return; el.pause(); el.currentTime = 0;
  },
  fadeBg(duration = 2000) {
    const el = document.getElementById('bgMusic');
    if (!el) return;
    const step = el.volume / (duration / 50);
    const fade = setInterval(() => {
      if (el.volume > step) { el.volume = Math.max(0, el.volume - step); }
      else { el.volume = 0; el.pause(); el.currentTime = 0; clearInterval(fade); }
    }, 50);
  },
  play(id, volume = 0.7) {
    const el = document.getElementById(id);
    if (!el) return; el.volume = volume; el.currentTime = 0; el.play().catch(() => {});
  },
};
document.addEventListener('pointerdown', () => Audio.unlock(), { once: true });

let myPlayer = { name: '', color: '' };
let currentLobby = '';
let isHost = false;
let selectedMap = 'arena1';
let keyState = { up: false, down: false, left: false, right: false };

// ─── Colors ──────────────────────────────────────────────────────────────────
const colors = [
  { name: 'red',    bg: '#ef4444' }, { name: 'orange', bg: '#f97316' },
  { name: 'amber',  bg: '#f59e0b' }, { name: 'yellow', bg: '#eab308' },
  { name: 'lime',   bg: '#84cc16' }, { name: 'green',  bg: '#22c55e' },
  { name: 'teal',   bg: '#14b8a6' }, { name: 'cyan',   bg: '#06b6d4' },
  { name: 'blue',   bg: '#3b82f6' }, { name: 'indigo', bg: '#6366f1' },
  { name: 'purple', bg: '#a855f7' }, { name: 'pink',   bg: '#ec4899' },
  { name: 'rose',   bg: '#f43f5e' }, { name: 'white',  bg: '#f1f5f9' },
];

const colorSelect = document.getElementById('colorSelect');
colors.forEach(({ name, bg }) => {
  const btn = document.createElement('button');
  btn.style.cssText = `background-color:${bg};min-width:56px;height:56px;border-radius:50%;border:3px solid transparent;cursor:pointer;transition:border-color .15s,transform .15s;flex-shrink:0;`;
  btn.title = name;
  btn.onmouseover = () => btn.style.transform = 'scale(1.15)';
  btn.onmouseout  = () => btn.style.transform = 'scale(1)';
  btn.onclick = () => {
    myPlayer.color = name;
    Array.from(colorSelect.children).forEach(b => { b.style.borderColor = 'transparent'; b.style.transform = 'scale(1)'; });
    btn.style.borderColor = 'white'; btn.style.transform = 'scale(1.2)';
  };
  colorSelect.appendChild(btn);
});

// ─── Maps ─────────────────────────────────────────────────────────────────────
const maps = [
  { id:'arena1', label:'THE PIT',     desc:'Open battlefield — Shield powerup',    icon:'⚔️',  powerupIcon:'🛡️',  bg:'linear-gradient(135deg,#1a1a2e,#16213e)', grid:'rgba(255,255,255,0.04)' },
  { id:'arena2', label:'NEON CITY',   desc:'Urban chaos — Speed boost powerup',    icon:'🌆',  powerupIcon:'⚡',  bg:'linear-gradient(135deg,#0d0d1a,#1a0533)', grid:'rgba(168,85,247,0.08)' },
  { id:'arena3', label:'FROZEN LAKE', desc:'Slippery edges — Freeze IT powerup',   icon:'❄️',  powerupIcon:'🧊',  bg:'linear-gradient(135deg,#0c1a2e,#0e2a4a)', grid:'rgba(6,182,212,0.08)' },
  { id:'arena4', label:'VOLCANO',     desc:'Hot zone — Random swap powerup',       icon:'🌋',  powerupIcon:'🔄',  bg:'linear-gradient(135deg,#1a0a00,#3d0f00)', grid:'rgba(239,68,68,0.08)' },
  { id:'arena5', label:'THE VOID',    desc:'No escape — Ghost walk powerup',       icon:'🕳️', powerupIcon:'👻',  bg:'linear-gradient(135deg,#050505,#0a0a0f)', grid:'rgba(99,102,241,0.06)' },
  { id:'arena6', label:'JUNGLE',      desc:'Dense cover — Shrink tag powerup',     icon:'🌿',  powerupIcon:'🔬',  bg:'linear-gradient(135deg,#021a00,#0a2e0a)', grid:'rgba(34,197,94,0.07)' },
];

const mapSelect = document.getElementById('mapSelect');
maps.forEach((m) => {
  const div = document.createElement('div');
  div.id = `map-${m.id}`;
  div.style.cssText = `background:${m.bg};border:2px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;cursor:pointer;text-align:center;transition:border-color .2s,transform .2s;`;
  div.innerHTML = `
    <div style="font-size:26px;margin-bottom:4px">${m.icon}</div>
    <div style="font-family:'Orbitron',sans-serif;font-size:12px;font-weight:700;color:#fff;margin-bottom:4px">${m.label}</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.45)">${m.desc}</div>
    <div style="margin-top:6px;font-size:18px" title="Exclusive powerup">${m.powerupIcon}</div>
  `;
  div.onmouseover = () => { if (div.dataset.selected !== 'true') div.style.borderColor = 'rgba(255,255,255,0.3)'; };
  div.onmouseout  = () => { if (div.dataset.selected !== 'true') div.style.borderColor = 'rgba(255,255,255,0.1)'; };
  div.onclick = () => { if (isHost) socket.emit('changeMap', currentLobby, m.id); };
  mapSelect.appendChild(div);
});

function setSelectedMap(mapId) {
  selectedMap = mapId;
  maps.forEach(m => {
    const el = document.getElementById(`map-${m.id}`);
    if (!el) return;
    const sel = m.id === mapId;
    el.style.borderColor = sel ? '#00ff88' : 'rgba(255,255,255,0.1)';
    el.style.transform   = sel ? 'scale(1.03)' : 'scale(1)';
    el.dataset.selected  = sel ? 'true' : 'false';
  });
}
setSelectedMap('arena1');

// ─── Powerup visuals ──────────────────────────────────────────────────────────
const POWERUP_VISUALS = {
  shield: { icon:'🛡️',  color:'#38bdf8', label:'Shield — immune to tags!' },
  speed:  { icon:'⚡',  color:'#facc15', label:'Speed boost!' },
  freeze: { icon:'🧊',  color:'#67e8f9', label:'IT is frozen!' },
  swap:   { icon:'🔄',  color:'#f97316', label:'Swapped with IT!' },
  ghost:  { icon:'👻',  color:'#a78bfa', label:'Ghost — walk through walls!' },
  shrink: { icon:'🔬',  color:'#4ade80', label:"IT's tag range shrunk!" },
};

// In-game powerup DOM elements: { id -> element }
const powerupEls = {};

// Active effect banner timeout
let effectBannerTimeout = null;

function showEffectBanner(type) {
  const v = POWERUP_VISUALS[type];
  if (!v) return;
  let banner = document.getElementById('effectBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'effectBanner';
    banner.style.cssText = `
      position:absolute;top:16px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.85);border:2px solid;border-radius:12px;
      padding:8px 20px;font-size:15px;font-weight:700;z-index:100;
      transition:opacity .4s;pointer-events:none;white-space:nowrap;
    `;
    document.getElementById('gameCanvas').appendChild(banner);
  }
  banner.style.borderColor = v.color;
  banner.style.color = v.color;
  banner.innerText = `${v.icon}  ${v.label}`;
  banner.style.opacity = '1';
  clearTimeout(effectBannerTimeout);
  effectBannerTimeout = setTimeout(() => { banner.style.opacity = '0'; }, 3500);
}

// ─── Lobby / socket setup ─────────────────────────────────────────────────────
document.getElementById('createLobbyBtn').onclick = () => {
  myPlayer.name = document.getElementById('playerNameInput').value.trim() || 'Player';
  if (!myPlayer.color) return alert('Please choose a color first!');
  socket.emit('createLobby', myPlayer);
};

socket.on('lobbyCreated', (code) => {
  currentLobby = code; isHost = true;
  document.getElementById('inviteLink').innerText = window.location.origin + '?lobby=' + code;
  switchScreen('lobbyScreen');
});

document.getElementById('copyInviteBtn').onclick = () => {
  navigator.clipboard.writeText(document.getElementById('inviteLink').innerText)
    .then(() => alert('Invite link copied!'));
};

document.getElementById('joinLobbyBtn').onclick = () => {
  myPlayer.name = document.getElementById('playerNameInput').value.trim() || 'Player';
  if (!myPlayer.color) return alert('Please choose a color first!');
  const input = document.getElementById('joinLobbyInput').value.trim();
  if (!input) return alert('Please enter a lobby code or invite link!');
  const code = input.match(/lobby=([\w]+)/i)?.[1] || input;
  socket.emit('joinLobby', code.toUpperCase(), myPlayer);
};

socket.on('joinedLobby', (code) => {
  currentLobby = code; isHost = false;
  switchScreen('lobbyScreen');
});

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('lobby')) {
  const code = urlParams.get('lobby');
  document.getElementById('joinLobbyInput').value = code;
  document.getElementById('joinLobbyInput').placeholder = `Code: ${code} — set name & color then JOIN`;
}

socket.on('playersUpdate', (players) => {
  const lobbyPlayers = document.getElementById('lobbyPlayers');
  lobbyPlayers.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    const div = document.createElement('div');
    div.className = 'bg-black/30 rounded-xl p-4 text-center';
    if (p) {
      const hex = colors.find(c => c.name === p.color)?.bg || '#888';
      div.innerHTML = `<div style="width:64px;height:64px;border-radius:50%;background:${hex};margin:0 auto 8px;box-shadow:0 0 16px ${hex}66"></div><p class="font-semibold">${p.name}</p>`;
    } else {
      div.innerHTML = '<p class="text-gray-500 mt-6">Waiting...</p>';
    }
    lobbyPlayers.appendChild(div);
  }
  document.getElementById('playerCountText').innerText = `Players: ${players.length}/4`;
  document.getElementById('startGameBtn').disabled = players.length < 2 || !isHost;
});

socket.on('mapUpdate', setSelectedMap);

document.getElementById('startGameBtn').onclick = () => {
  if (isHost) socket.emit('startGame', currentLobby);
};

// ─── Obstacle visuals ─────────────────────────────────────────────────────────
const obstacleThemes = {
  wall:   { bg:'rgba(100,116,139,0.85)', border:'#94a3b8', radius:'4px'  },
  pillar: { bg:'rgba(109,40,217,0.7)',   border:'#a855f7', radius:'6px'  },
  ice:    { bg:'rgba(14,165,233,0.5)',   border:'#38bdf8', radius:'8px'  },
  rock:   { bg:'rgba(180,83,9,0.8)',     border:'#f97316', radius:'3px'  },
  void:   { bg:'rgba(15,15,25,0.95)',    border:'#6366f1', radius:'2px'  },
  tree:   { bg:'rgba(21,128,61,0.8)',    border:'#4ade80', radius:'12px' },
};

function getMapConfig(mapId) { return maps.find(m => m.id === mapId) || maps[0]; }

// ─── Head-start overlay ───────────────────────────────────────────────────────
let headStartInterval = null;
function showHeadStart(ms) {
  clearInterval(headStartInterval);
  let remaining = Math.ceil(ms / 1000);
  const hud = document.getElementById('playerStatus');
  hud.innerText = `SAFE — ${remaining}s head start!`;
  hud.style.color = '#00ff88';
  headStartInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(headStartInterval);
      hud.innerText = 'SAFE';
    } else {
      hud.innerText = `SAFE — ${remaining}s head start!`;
    }
  }, 1000);
}

// ─── Game Start ───────────────────────────────────────────────────────────────
socket.on('gameStart', ({ players, map, obstacles, powerups }) => {
  switchScreen('gameScreen');
  Audio.stopBg(); Audio.playBg();

  // Clear old powerup els
  Object.keys(powerupEls).forEach(k => delete powerupEls[k]);

  const gameCanvas = document.getElementById('gameCanvas');
  gameCanvas.innerHTML = '';

  const mapCfg = getMapConfig(map);
  gameCanvas.style.background = mapCfg.bg;

  // Grid
  const grid = document.createElement('div');
  grid.style.cssText = `position:absolute;inset:0;pointer-events:none;
    background-image:linear-gradient(${mapCfg.grid} 1px,transparent 1px),linear-gradient(90deg,${mapCfg.grid} 1px,transparent 1px);
    background-size:40px 40px;`;
  gameCanvas.appendChild(grid);

  // Obstacles
  (obstacles || []).forEach(o => {
    const theme = obstacleThemes[o.style] || obstacleThemes.wall;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;
      background:${theme.bg};border:2px solid ${theme.border};border-radius:${theme.radius};
      box-shadow:0 0 12px ${theme.border}55,inset 0 1px 0 rgba(255,255,255,0.1);pointer-events:none;`;
    gameCanvas.appendChild(el);
  });

  // Powerups
  (powerups || []).forEach(pu => {
    const v = POWERUP_VISUALS[pu.type] || {};
    const el = document.createElement('div');
    el.id = `pu-${pu.id}`;
    el.style.cssText = `
      position:absolute;left:${pu.x}px;top:${pu.y}px;width:32px;height:32px;
      border-radius:50%;border:2px solid ${v.color || '#fff'};
      background:rgba(0,0,0,0.6);
      box-shadow:0 0 14px ${v.color || '#fff'};
      display:flex;align-items:center;justify-content:center;
      font-size:16px;z-index:20;pointer-events:none;
      animation:puFloat 2s ease-in-out infinite;
    `;
    el.innerText = v.icon || '★';
    gameCanvas.appendChild(el);
    powerupEls[pu.id] = el;
  });

  // Add float animation if not present
  if (!document.getElementById('puStyle')) {
    const s = document.createElement('style');
    s.id = 'puStyle';
    s.textContent = `
      @keyframes puFloat {
        0%,100% { transform: translateY(0); }
        50%      { transform: translateY(-6px); }
      }
      @keyframes headStartRing {
        0%   { box-shadow: 0 0 0 0 rgba(0,255,136,0.7); }
        100% { box-shadow: 0 0 0 20px rgba(0,255,136,0); }
      }
    `;
    document.head.appendChild(s);
  }

  // Players
  players.forEach(p => {
    const hex = colors.find(c => c.name === p.color)?.bg || '#888';
    const avatar = document.createElement('div');
    avatar.id = `player-${p.id}`;
    avatar.className = 'player-avatar absolute w-12 h-12 rounded-full';
    avatar.style.cssText = `
      background-color:${hex};left:${p.position.x}px;top:${p.position.y}px;
      box-shadow:0 0 ${p.it?'20px':'8px'} ${hex}${p.it?'ff':'88'};
      border:${p.it?'3px solid white':'2px solid rgba(255,255,255,0.3)'};
      z-index:10;transition:left .05s linear,top .05s linear;
    `;
    avatar.title = p.name;
    if (p.it) avatar.classList.add('tagged-ring');
    gameCanvas.appendChild(avatar);
  });

  // HUD player list
  const playerList = document.getElementById('playerList');
  playerList.innerHTML = '';
  players.forEach(p => {
    const hex = colors.find(c => c.name === p.color)?.bg || '#888';
    const div = document.createElement('div');
    div.style.cssText = `border:1px solid ${hex};background:${hex}33;border-radius:8px;padding:4px 12px;font-size:14px;font-weight:600`;
    div.innerText = p.name;
    playerList.appendChild(div);
  });

  const me = players.find(p => p.id === socket.id);
  const statusEl = document.getElementById('playerStatus');
  statusEl.innerText = me?.it ? 'IT' : 'SAFE';
  statusEl.style.color = me?.it ? '#ff4444' : '#00ff88';
});

// ─── Timer ────────────────────────────────────────────────────────────────────
socket.on('timerUpdate', (time) => {
  const el = document.getElementById('roundTimer');
  el.innerText = `${time}s`;
  el.style.color = time <= 10 ? '#ff4444' : '#22d3ee';
  if (time <= 10 && time > 0) Audio.play('sfxCountdown', 0.4);
});

// ─── Position ─────────────────────────────────────────────────────────────────
socket.on('positionUpdate', ({ id, position }) => {
  const el = document.getElementById(`player-${id}`);
  if (el) { el.style.left = `${position.x}px`; el.style.top = `${position.y}px`; }
});

// ─── Tag ──────────────────────────────────────────────────────────────────────
socket.on('tag', ({ from, to, headStartMs }) => {
  Audio.play('sfxTag', 0.6);

  const fromEl = document.getElementById(`player-${from}`);
  if (fromEl) {
    fromEl.classList.remove('tagged-ring');
    fromEl.style.border = '2px solid rgba(255,255,255,0.3)';
    // Show head-start glow on the former IT
    fromEl.style.animation = 'headStartRing 0.8s ease-out 3';
    setTimeout(() => { if (fromEl) fromEl.style.animation = ''; }, headStartMs);
  }

  const toEl = document.getElementById(`player-${to}`);
  if (toEl) {
    toEl.classList.add('tagged-ring');
    toEl.style.border = '3px solid white';
    setTimeout(() => toEl.classList.remove('tagged-ring'), 600);
  }

  const statusEl = document.getElementById('playerStatus');
  if (to === socket.id) {
    statusEl.innerText = 'IT'; statusEl.style.color = '#ff4444';
    clearInterval(headStartInterval);
  } else if (from === socket.id) {
    showHeadStart(headStartMs);
  }
});

// ─── Powerup events ───────────────────────────────────────────────────────────
socket.on('powerupCollected', ({ powerupId, playerId, type }) => {
  const el = powerupEls[powerupId];
  if (el) el.style.display = 'none';

  if (playerId === socket.id) {
    showEffectBanner(type);
    // Apply local visual tint on avatar
    const avatar = document.getElementById(`player-${socket.id}`);
    if (avatar) {
      const v = POWERUP_VISUALS[type];
      avatar.style.outline = `3px solid ${v?.color || '#fff'}`;
    }
  }
});

socket.on('powerupExpired', ({ playerId }) => {
  if (playerId === socket.id) {
    const avatar = document.getElementById(`player-${socket.id}`);
    if (avatar) avatar.style.outline = '';
  }
});

socket.on('powerupRespawned', ({ powerupId }) => {
  const el = powerupEls[powerupId];
  if (el) el.style.display = '';
});

// ─── Game End ─────────────────────────────────────────────────────────────────
socket.on('gameEnd', (players) => {
  Audio.fadeBg(1500);
  switchScreen('resultsScreen');
  const resultsTable = document.getElementById('resultsTable');
  resultsTable.innerHTML = '';
  players.sort((a, b) => a.taggedTime - b.taggedTime);
  const winner = players[0];
  const medals = ['🥇','🥈','🥉','💀'];

  const header = document.createElement('div');
  header.style.cssText = `display:flex;justify-content:space-between;padding:0 0 10px;border-bottom:2px solid rgba(255,255,255,0.2);margin-bottom:4px;font-size:13px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px`;
  header.innerHTML = `<span>Player</span><span>Time as IT</span>`;
  resultsTable.appendChild(header);

  players.forEach((p, i) => {
    const hex = colors.find(c => c.name === p.color)?.bg || '#888';
    const isMe = p.id === socket.id;
    const isTop = i === 0;
    const div = document.createElement('div');
    div.style.cssText = `display:flex;justify-content:space-between;align-items:center;
      padding:14px 12px;margin:4px 0;border-radius:10px;
      border:1px solid ${isTop?'#00ff88':'rgba(255,255,255,0.08)'};
      background:${isTop?'rgba(0,255,136,0.07)':isMe?'rgba(255,255,255,0.04)':'transparent'};`;
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:22px;min-width:28px">${medals[i]||'#'+(i+1)}</span>
        <div style="width:30px;height:30px;border-radius:50%;background:${hex};box-shadow:0 0 10px ${hex}88;flex-shrink:0"></div>
        <div>
          <span style="font-weight:700;font-size:17px;color:${isMe?hex:'#fff'}">${p.name}${isMe?' (you)':''}</span>
          ${isTop?'<div style="font-size:11px;color:#00ff88;font-weight:600;letter-spacing:1px">LEAST TIME TAGGED — WINNER</div>':''}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;font-family:'Orbitron',sans-serif;color:${isTop?'#00ff88':'rgba(255,255,255,0.7)'}">${p.taggedTime.toFixed(1)}s</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.3)">as IT</div>
      </div>`;
    resultsTable.appendChild(div);
  });

  const me = players.find(p => p.id === socket.id);
  const isWinner = me && winner.id === me.id;
  const titleEl = document.getElementById('resultTitle');
  titleEl.innerText = isWinner ? 'YOU WIN! 🏆' : 'GAME OVER';
  titleEl.style.color = isWinner ? '#00ff88' : '#ff4444';
  setTimeout(() => Audio.play(isWinner ? 'sfxWin' : 'sfxLose', 0.8), 400);
});

// ─── Movement ─────────────────────────────────────────────────────────────────
const keysMap = { up:['ArrowUp','w','W'], down:['ArrowDown','s','S'], left:['ArrowLeft','a','A'], right:['ArrowRight','d','D'] };
function isTypingInField(e) { const t = e.target.tagName; return t==='INPUT'||t==='TEXTAREA'||e.target.isContentEditable; }

document.addEventListener('keydown', (e) => {
  if (isTypingInField(e)) return;
  for (const dir in keysMap) if (keysMap[dir].includes(e.key)) { e.preventDefault(); keyState[dir] = true; }
});
document.addEventListener('keyup', (e) => {
  if (isTypingInField(e)) return;
  for (const dir in keysMap) if (keysMap[dir].includes(e.key)) keyState[dir] = false;
});

['up','down','left','right'].forEach(dir => {
  const btn = document.getElementById(`${dir}Btn`);
  btn.addEventListener('touchstart',  e => { e.preventDefault(); keyState[dir] = true; });
  btn.addEventListener('touchend',    e => { e.preventDefault(); keyState[dir] = false; });
  btn.addEventListener('mousedown',   () => keyState[dir] = true);
  btn.addEventListener('mouseup',     () => keyState[dir] = false);
  btn.addEventListener('mouseleave',  () => keyState[dir] = false);
});

setInterval(() => {
  if (!currentLobby) return;
  for (const dir in keyState) if (keyState[dir]) socket.emit('move', currentLobby, dir);
}, 50);

// ─── Nav ──────────────────────────────────────────────────────────────────────
document.getElementById('leaveLobbyBtn').onclick = () => {
  socket.emit('leaveLobby', currentLobby); Audio.stopBg();
  switchScreen('mainMenu'); currentLobby = ''; isHost = false;
};
document.getElementById('playAgainBtn').onclick = () => {
  switchScreen('mainMenu'); currentLobby = ''; isHost = false;
};

function switchScreen(id) {
  ['mainMenu','lobbyScreen','gameScreen','resultsScreen'].forEach(s => {
    document.getElementById(s).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

socket.on('error', msg => alert('Error: ' + msg));
