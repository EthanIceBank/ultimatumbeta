const socket = io();
let myPlayer = { name: '', color: '' };
let currentLobby = '';
let isHost = false;
let selectedMap = 'arena1';
let keyState = { up: false, down: false, left: false, right: false };

// ─── Colors ──────────────────────────────────────────────────────────────────
const colors = [
  { name: 'red',      bg: '#ef4444', label: 'Red' },
  { name: 'orange',   bg: '#f97316', label: 'Orange' },
  { name: 'amber',    bg: '#f59e0b', label: 'Amber' },
  { name: 'yellow',   bg: '#eab308', label: 'Yellow' },
  { name: 'lime',     bg: '#84cc16', label: 'Lime' },
  { name: 'green',    bg: '#22c55e', label: 'Green' },
  { name: 'teal',     bg: '#14b8a6', label: 'Teal' },
  { name: 'cyan',     bg: '#06b6d4', label: 'Cyan' },
  { name: 'blue',     bg: '#3b82f6', label: 'Blue' },
  { name: 'indigo',   bg: '#6366f1', label: 'Indigo' },
  { name: 'purple',   bg: '#a855f7', label: 'Purple' },
  { name: 'pink',     bg: '#ec4899', label: 'Pink' },
  { name: 'rose',     bg: '#f43f5e', label: 'Rose' },
  { name: 'white',    bg: '#f1f5f9', label: 'White' },
];

const colorSelect = document.getElementById('colorSelect');
colors.forEach(({ name, bg, label }) => {
  const btn = document.createElement('button');
  btn.style.cssText = `
    background-color: ${bg};
    min-width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 3px solid transparent;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s;
    flex-shrink: 0;
    position: relative;
  `;
  btn.title = label;
  btn.onmouseover = () => { btn.style.transform = 'scale(1.15)'; };
  btn.onmouseout  = () => { btn.style.transform = 'scale(1)'; };
  btn.onclick = () => {
    myPlayer.color = name;
    Array.from(colorSelect.children).forEach((b) => {
      b.style.borderColor = 'transparent';
      b.style.transform = 'scale(1)';
    });
    btn.style.borderColor = 'white';
    btn.style.transform = 'scale(1.2)';
  };
  colorSelect.appendChild(btn);
});

// ─── Maps ─────────────────────────────────────────────────────────────────────
const maps = [
  {
    id: 'arena1',
    label: 'THE PIT',
    desc: 'Open battlefield',
    icon: '⚔️',
    bg: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    grid: 'rgba(255,255,255,0.04)',
  },
  {
    id: 'arena2',
    label: 'NEON CITY',
    desc: 'Urban chaos',
    icon: '🌆',
    bg: 'linear-gradient(135deg, #0d0d1a 0%, #1a0533 100%)',
    grid: 'rgba(168,85,247,0.08)',
  },
  {
    id: 'arena3',
    label: 'FROZEN LAKE',
    desc: 'Slippery edges',
    icon: '❄️',
    bg: 'linear-gradient(135deg, #0c1a2e 0%, #0e2a4a 100%)',
    grid: 'rgba(6,182,212,0.08)',
  },
  {
    id: 'arena4',
    label: 'VOLCANO',
    desc: 'Hot zone center',
    icon: '🌋',
    bg: 'linear-gradient(135deg, #1a0a00 0%, #3d0f00 100%)',
    grid: 'rgba(239,68,68,0.08)',
  },
  {
    id: 'arena5',
    label: 'THE VOID',
    desc: 'No escape',
    icon: '🕳️',
    bg: 'linear-gradient(135deg, #050505 0%, #0a0a0f 100%)',
    grid: 'rgba(99,102,241,0.06)',
  },
  {
    id: 'arena6',
    label: 'JUNGLE',
    desc: 'Dense cover',
    icon: '🌿',
    bg: 'linear-gradient(135deg, #021a00 0%, #0a2e0a 100%)',
    grid: 'rgba(34,197,94,0.07)',
  },
];

const mapSelect = document.getElementById('mapSelect');
maps.forEach((m) => {
  const div = document.createElement('div');
  div.id = `map-${m.id}`;
  div.style.cssText = `
    background: ${m.bg};
    border: 2px solid rgba(255,255,255,0.1);
    border-radius: 12px;
    padding: 16px;
    cursor: pointer;
    text-align: center;
    transition: border-color 0.2s, transform 0.2s;
  `;
  div.innerHTML = `
    <div style="font-size:28px;margin-bottom:6px">${m.icon}</div>
    <div style="font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;color:#fff;margin-bottom:4px">${m.label}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.5)">${m.desc}</div>
  `;
  div.onmouseover = () => { if (div.dataset.selected !== 'true') div.style.borderColor = 'rgba(255,255,255,0.3)'; };
  div.onmouseout  = () => { if (div.dataset.selected !== 'true') div.style.borderColor = 'rgba(255,255,255,0.1)'; };
  div.onclick = () => {
    if (!isHost) return;
    socket.emit('changeMap', currentLobby, m.id);
  };
  mapSelect.appendChild(div);
});

function setSelectedMap(mapId) {
  selectedMap = mapId;
  maps.forEach((m) => {
    const el = document.getElementById(`map-${m.id}`);
    if (!el) return;
    if (m.id === mapId) {
      el.style.borderColor = '#00ff88';
      el.style.transform = 'scale(1.03)';
      el.dataset.selected = 'true';
    } else {
      el.style.borderColor = 'rgba(255,255,255,0.1)';
      el.style.transform = 'scale(1)';
      el.dataset.selected = 'false';
    }
  });
}
setSelectedMap('arena1');

// ─── Create Lobby ─────────────────────────────────────────────────────────────
document.getElementById('createLobbyBtn').onclick = () => {
  myPlayer.name = document.getElementById('playerNameInput').value.trim() || 'Player';
  if (!myPlayer.color) return alert('Please choose a color first!');
  socket.emit('createLobby', myPlayer);
};

socket.on('lobbyCreated', (code) => {
  currentLobby = code;
  isHost = true;
  document.getElementById('inviteLink').innerText = window.location.origin + '?lobby=' + code;
  switchScreen('lobbyScreen');
});

// ─── Copy Invite ──────────────────────────────────────────────────────────────
document.getElementById('copyInviteBtn').onclick = () => {
  const link = document.getElementById('inviteLink').innerText;
  navigator.clipboard.writeText(link).then(() => alert('Invite link copied!'));
};

// ─── Join Lobby ───────────────────────────────────────────────────────────────
document.getElementById('joinLobbyBtn').onclick = () => {
  myPlayer.name = document.getElementById('playerNameInput').value.trim() || 'Player';
  if (!myPlayer.color) return alert('Please choose a color first!');
  const input = document.getElementById('joinLobbyInput').value.trim();
  if (!input) return alert('Please enter a lobby code or invite link!');
  const code = input.match(/lobby=([\w]+)/i)?.[1] || input;
  socket.emit('joinLobby', code.toUpperCase(), myPlayer);
};

socket.on('joinedLobby', (code) => {
  currentLobby = code;
  isHost = false;
  switchScreen('lobbyScreen');
});

// Auto-join from URL
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('lobby')) {
  const code = urlParams.get('lobby');
  document.getElementById('joinLobbyInput').value = code;
  document.getElementById('joinLobbyInput').placeholder = `Code: ${code} — set name & color then JOIN`;
}

// ─── Players Update ───────────────────────────────────────────────────────────
socket.on('playersUpdate', (players) => {
  const lobbyPlayers = document.getElementById('lobbyPlayers');
  lobbyPlayers.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    const div = document.createElement('div');
    div.className = 'bg-black/30 rounded-xl p-4 text-center';
    if (p) {
      const colorHex = colors.find(c => c.name === p.color)?.bg || '#888';
      div.innerHTML = `
        <div style="width:64px;height:64px;border-radius:50%;background:${colorHex};margin:0 auto 8px;box-shadow:0 0 16px ${colorHex}66"></div>
        <p class="font-semibold">${p.name}</p>
      `;
    } else {
      div.innerHTML = '<p class="text-gray-500 mt-6">Waiting...</p>';
    }
    lobbyPlayers.appendChild(div);
  }
  document.getElementById('playerCountText').innerText = `Players: ${players.length}/4`;
  document.getElementById('startGameBtn').disabled = players.length < 2 || !isHost;
});

// ─── Map Update ───────────────────────────────────────────────────────────────
socket.on('mapUpdate', (mapId) => {
  setSelectedMap(mapId);
});

// ─── Start Game ───────────────────────────────────────────────────────────────
document.getElementById('startGameBtn').onclick = () => {
  if (isHost) socket.emit('startGame', currentLobby);
};

function getMapConfig(mapId) {
  return maps.find(m => m.id === mapId) || maps[0];
}

// ─── Obstacle visual themes ───────────────────────────────────────────────────
const obstacleThemes = {
  wall:   { bg: 'rgba(100,116,139,0.85)', border: '#94a3b8', radius: '4px', label: '🧱' },
  pillar: { bg: 'rgba(109,40,217,0.7)',   border: '#a855f7', radius: '6px', label: '🔮' },
  ice:    { bg: 'rgba(14,165,233,0.5)',   border: '#38bdf8', radius: '8px', label: '❄️' },
  rock:   { bg: 'rgba(180,83,9,0.8)',     border: '#f97316', radius: '3px', label: '🪨' },
  void:   { bg: 'rgba(15,15,25,0.95)',    border: '#6366f1', radius: '2px', label: '🕳️' },
  tree:   { bg: 'rgba(21,128,61,0.8)',    border: '#4ade80', radius: '12px', label: '🌿' },
};

socket.on('gameStart', ({ players, map, obstacles }) => {
  switchScreen('gameScreen');
  const gameCanvas = document.getElementById('gameCanvas');
  gameCanvas.innerHTML = '';

  // Apply map background
  const mapCfg = getMapConfig(map);
  gameCanvas.style.background = mapCfg.bg;

  // Grid overlay
  const grid = document.createElement('div');
  grid.style.cssText = `
    position:absolute;inset:0;pointer-events:none;
    background-image: linear-gradient(${mapCfg.grid} 1px, transparent 1px),
                      linear-gradient(90deg, ${mapCfg.grid} 1px, transparent 1px);
    background-size: 40px 40px;
  `;
  gameCanvas.appendChild(grid);

  // Draw obstacles
  (obstacles || []).forEach((o) => {
    const theme = obstacleThemes[o.style] || obstacleThemes.wall;
    const el = document.createElement('div');
    el.style.cssText = `
      position: absolute;
      left: ${o.x}px;
      top: ${o.y}px;
      width: ${o.w}px;
      height: ${o.h}px;
      background: ${theme.bg};
      border: 2px solid ${theme.border};
      border-radius: ${theme.radius};
      box-shadow: 0 0 12px ${theme.border}55, inset 0 1px 0 rgba(255,255,255,0.1);
      pointer-events: none;
    `;
    gameCanvas.appendChild(el);
  });

  players.forEach((p) => {
    const colorHex = colors.find(c => c.name === p.color)?.bg || '#888';
    const avatar = document.createElement('div');
    avatar.id = `player-${p.id}`;
    avatar.className = 'player-avatar absolute w-12 h-12 rounded-full flex items-center justify-center';
    avatar.style.cssText = `
      background-color: ${colorHex};
      left: ${p.position.x}px;
      top: ${p.position.y}px;
      box-shadow: 0 0 ${p.it ? '20px' : '8px'} ${colorHex}${p.it ? 'ff' : '88'};
      border: ${p.it ? '3px solid white' : '2px solid rgba(255,255,255,0.3)'};
      font-size: 10px;
      font-weight: 700;
      color: rgba(0,0,0,0.7);
      z-index: 10;
    `;
    avatar.title = p.name;
    if (p.it) avatar.classList.add('tagged-ring');
    gameCanvas.appendChild(avatar);
  });

  const playerList = document.getElementById('playerList');
  playerList.innerHTML = '';
  players.forEach((p) => {
    const colorHex = colors.find(c => c.name === p.color)?.bg || '#888';
    const div = document.createElement('div');
    div.style.cssText = `border:1px solid ${colorHex};background:${colorHex}33;border-radius:8px;padding:4px 12px;font-size:14px;font-weight:600`;
    div.innerText = p.name;
    playerList.appendChild(div);
  });

  const me = players.find((p) => p.id === socket.id);
  const statusEl = document.getElementById('playerStatus');
  statusEl.innerText = me?.it ? 'IT' : 'SAFE';
  statusEl.style.color = me?.it ? '#ff4444' : '#00ff88';
});

// ─── Timer ────────────────────────────────────────────────────────────────────
socket.on('timerUpdate', (time) => {
  const el = document.getElementById('roundTimer');
  el.innerText = `${time}s`;
  el.style.color = time <= 10 ? '#ff4444' : '#22d3ee';
});

// ─── Position Update ──────────────────────────────────────────────────────────
socket.on('positionUpdate', ({ id, position }) => {
  const avatar = document.getElementById(`player-${id}`);
  if (avatar) {
    avatar.style.left = `${position.x}px`;
    avatar.style.top  = `${position.y}px`;
  }
});

// ─── Tag ──────────────────────────────────────────────────────────────────────
socket.on('tag', ({ from, to }) => {
  const fromAvatar = document.getElementById(`player-${from}`);
  if (fromAvatar) {
    fromAvatar.classList.remove('tagged-ring');
    fromAvatar.style.border = '2px solid rgba(255,255,255,0.3)';
    fromAvatar.style.boxShadow = fromAvatar.style.boxShadow.replace('20px', '8px');
  }
  const toAvatar = document.getElementById(`player-${to}`);
  if (toAvatar) {
    toAvatar.classList.add('tagged-ring');
    toAvatar.style.border = '3px solid white';
    setTimeout(() => toAvatar.classList.remove('tagged-ring'), 600);
  }
  const statusEl = document.getElementById('playerStatus');
  if (to === socket.id) {
    statusEl.innerText = 'IT';
    statusEl.style.color = '#ff4444';
  } else if (from === socket.id) {
    statusEl.innerText = 'SAFE';
    statusEl.style.color = '#00ff88';
  }
});

// ─── Game End ─────────────────────────────────────────────────────────────────
socket.on('gameEnd', (players) => {
  switchScreen('resultsScreen');
  const resultsTable = document.getElementById('resultsTable');
  resultsTable.innerHTML = '';

  // Sort ascending — least tagged time = winner
  players.sort((a, b) => a.taggedTime - b.taggedTime);
  const winner = players[0];
  const medals = ['🥇', '🥈', '🥉', '💀'];

  // Header row
  const header = document.createElement('div');
  header.style.cssText = `display:flex;justify-content:space-between;padding:0 0 10px;border-bottom:2px solid rgba(255,255,255,0.2);margin-bottom:4px;font-size:13px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:1px`;
  header.innerHTML = `<span>Player</span><span>Time as IT</span>`;
  resultsTable.appendChild(header);

  players.forEach((p, i) => {
    const colorHex = colors.find(c => c.name === p.color)?.bg || '#888';
    const isMe = p.id === socket.id;
    const isTopWinner = i === 0;
    const div = document.createElement('div');
    div.style.cssText = `
      display:flex;justify-content:space-between;align-items:center;
      padding:14px 12px;
      margin: 4px 0;
      border-radius:10px;
      border:1px solid ${isTopWinner ? '#00ff88' : 'rgba(255,255,255,0.08)'};
      background:${isTopWinner ? 'rgba(0,255,136,0.07)' : isMe ? 'rgba(255,255,255,0.04)' : 'transparent'};
    `;
    div.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:22px;min-width:28px">${medals[i] || `#${i+1}`}</span>
        <div style="width:30px;height:30px;border-radius:50%;background:${colorHex};box-shadow:0 0 10px ${colorHex}88;flex-shrink:0"></div>
        <div>
          <span style="font-weight:700;font-size:17px;color:${isMe ? colorHex : '#fff'}">${p.name}${isMe ? ' (you)' : ''}</span>
          ${isTopWinner ? '<div style="font-size:11px;color:#00ff88;font-weight:600;letter-spacing:1px">LEAST TIME TAGGED</div>' : ''}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;font-family:'Orbitron',sans-serif;color:${isTopWinner ? '#00ff88' : 'rgba(255,255,255,0.7)'}">${p.taggedTime.toFixed(1)}s</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.3)">as IT</div>
      </div>
    `;
    resultsTable.appendChild(div);
  });

  const me = players.find((p) => p.id === socket.id);
  const isWinner = me && winner.id === me.id;
  const titleEl = document.getElementById('resultTitle');
  titleEl.innerText = isWinner ? 'YOU WIN! 🏆' : 'GAME OVER';
  titleEl.style.color = isWinner ? '#00ff88' : '#ff4444';
});

// ─── Movement ─────────────────────────────────────────────────────────────────
const keysMap = {
  up:    ['ArrowUp', 'w', 'W'],
  down:  ['ArrowDown', 's', 'S'],
  left:  ['ArrowLeft', 'a', 'A'],
  right: ['ArrowRight', 'd', 'D'],
};

document.addEventListener('keydown', (e) => {
  for (const dir in keysMap) {
    if (keysMap[dir].includes(e.key)) { e.preventDefault(); keyState[dir] = true; }
  }
});
document.addEventListener('keyup', (e) => {
  for (const dir in keysMap) {
    if (keysMap[dir].includes(e.key)) keyState[dir] = false;
  }
});

['up', 'down', 'left', 'right'].forEach((dir) => {
  const btn = document.getElementById(`${dir}Btn`);
  btn.addEventListener('touchstart',  (e) => { e.preventDefault(); keyState[dir] = true; });
  btn.addEventListener('touchend',    (e) => { e.preventDefault(); keyState[dir] = false; });
  btn.addEventListener('mousedown',   () => keyState[dir] = true);
  btn.addEventListener('mouseup',     () => keyState[dir] = false);
  btn.addEventListener('mouseleave',  () => keyState[dir] = false);
});

setInterval(() => {
  if (!currentLobby) return;
  for (const dir in keyState) {
    if (keyState[dir]) socket.emit('move', currentLobby, dir);
  }
}, 50);

// ─── Lobby controls ───────────────────────────────────────────────────────────
document.getElementById('leaveLobbyBtn').onclick = () => {
  socket.emit('leaveLobby', currentLobby);
  switchScreen('mainMenu');
  currentLobby = ''; isHost = false;
};

document.getElementById('playAgainBtn').onclick = () => {
  switchScreen('mainMenu');
  currentLobby = ''; isHost = false;
};

function switchScreen(id) {
  ['mainMenu', 'lobbyScreen', 'gameScreen', 'resultsScreen'].forEach((s) => {
    document.getElementById(s).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

socket.on('error', (msg) => alert('Error: ' + msg));
