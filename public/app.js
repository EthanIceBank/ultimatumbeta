const socket = io();
let myPlayer = { name: '', color: '' };
let currentLobby = '';
let isHost = false;
let selectedMap = 'arena1';
let keyState = { up: false, down: false, left: false, right: false };

// Colors — hardcoded styles so Tailwind CDN doesn't purge them
const colors = [
  { name: 'red',    bg: '#ef4444' },
  { name: 'blue',   bg: '#3b82f6' },
  { name: 'green',  bg: '#22c55e' },
  { name: 'yellow', bg: '#eab308' },
];

const colorSelect = document.getElementById('colorSelect');
colors.forEach(({ name, bg }) => {
  const btn = document.createElement('button');
  btn.style.backgroundColor = bg;
  btn.style.width = '100%';
  btn.style.height = '48px';
  btn.style.borderRadius = '8px';
  btn.style.border = '3px solid transparent';
  btn.style.cursor = 'pointer';
  btn.style.transition = 'border-color 0.2s';
  btn.title = name;
  btn.onclick = () => {
    myPlayer.color = name;
    Array.from(colorSelect.children).forEach((b) => (b.style.borderColor = 'transparent'));
    btn.style.borderColor = 'white';
  };
  colorSelect.appendChild(btn);
});

// Maps
const maps = ['arena1', 'arena2', 'arena3'];
const mapSelect = document.getElementById('mapSelect');
maps.forEach((m) => {
  const div = document.createElement('div');
  div.className = 'bg-black/30 rounded-lg p-4 cursor-pointer text-center hover:bg-white/10 transition-colors';
  div.innerText = m.toUpperCase();
  div.onclick = () => {
    if (isHost) socket.emit('changeMap', currentLobby, m);
  };
  mapSelect.appendChild(div);
});

// Create Lobby
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

// Copy Invite
document.getElementById('copyInviteBtn').onclick = () => {
  const link = document.getElementById('inviteLink').innerText;
  navigator.clipboard.writeText(link).then(() => alert('Invite link copied!'));
};

// Join Lobby
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
  // Show a hint to the user
  document.getElementById('joinLobbyInput').placeholder = `Auto-detected: ${code} — set name & color then JOIN`;
}

// Players Update
socket.on('playersUpdate', (players) => {
  const lobbyPlayers = document.getElementById('lobbyPlayers');
  lobbyPlayers.innerHTML = '';
  for (let i = 0; i < 4; i++) {
    const p = players[i];
    const div = document.createElement('div');
    div.className = 'bg-black/30 rounded-xl p-4 text-center';
    if (p) {
      const colorHex = colors.find(c => c.name === p.color)?.bg || p.color;
      div.innerHTML = `
        <div style="width:64px;height:64px;border-radius:50%;background:${colorHex};margin:0 auto 8px;"></div>
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

// Map Update
socket.on('mapUpdate', (map) => {
  selectedMap = map;
  Array.from(mapSelect.children).forEach((d, i) => {
    d.style.background = maps[i] === map ? 'rgba(59,130,246,0.4)' : '';
  });
});

// Start Game
document.getElementById('startGameBtn').onclick = () => {
  if (isHost) socket.emit('startGame', currentLobby);
};

socket.on('gameStart', ({ players, map }) => {
  switchScreen('gameScreen');
  const gameCanvas = document.getElementById('gameCanvas');
  gameCanvas.innerHTML = '';

  players.forEach((p) => {
    const avatar = document.createElement('div');
    avatar.id = `player-${p.id}`;
    avatar.className = 'player-avatar absolute w-12 h-12 rounded-full flex items-center justify-center text-xs font-bold text-white';
    const colorHex = colors.find(c => c.name === p.color)?.bg || p.color;
    avatar.style.backgroundColor = colorHex;
    avatar.style.left = `${p.position.x}px`;
    avatar.style.top = `${p.position.y}px`;
    avatar.style.boxShadow = p.it ? `0 0 0 4px white, 0 0 12px ${colorHex}` : '';
    avatar.title = p.name;
    if (p.it) avatar.classList.add('tagged-ring');
    gameCanvas.appendChild(avatar);
  });

  const playerList = document.getElementById('playerList');
  playerList.innerHTML = '';
  players.forEach((p) => {
    const colorHex = colors.find(c => c.name === p.color)?.bg || p.color;
    const div = document.createElement('div');
    div.style.border = `1px solid ${colorHex}`;
    div.style.background = colorHex + '33';
    div.className = 'rounded-lg px-3 py-1 text-sm font-semibold';
    div.innerText = p.name;
    playerList.appendChild(div);
  });

  const me = players.find((p) => p.id === socket.id);
  const statusEl = document.getElementById('playerStatus');
  statusEl.innerText = me?.it ? 'IT' : 'SAFE';
  statusEl.style.color = me?.it ? '#ff4444' : '#00ff88';
});

// Timer Update
socket.on('timerUpdate', (time) => {
  document.getElementById('roundTimer').innerText = `${time}s`;
});

// Position Update
socket.on('positionUpdate', ({ id, position }) => {
  const avatar = document.getElementById(`player-${id}`);
  if (avatar) {
    avatar.style.left = `${position.x}px`;
    avatar.style.top = `${position.y}px`;
  }
});

// Tag
socket.on('tag', ({ from, to }) => {
  const fromAvatar = document.getElementById(`player-${from}`);
  if (fromAvatar) {
    fromAvatar.classList.remove('tagged-ring');
    fromAvatar.style.boxShadow = '';
  }
  const toAvatar = document.getElementById(`player-${to}`);
  if (toAvatar) {
    toAvatar.classList.add('tagged-ring');
    toAvatar.style.boxShadow = '0 0 0 4px white, 0 0 12px red';
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

// Game End
socket.on('gameEnd', (players) => {
  switchScreen('resultsScreen');
  const resultsTable = document.getElementById('resultsTable');
  resultsTable.innerHTML = '';
  players.sort((a, b) => a.taggedTime - b.taggedTime);
  players.forEach((p, i) => {
    const colorHex = colors.find(c => c.name === p.color)?.bg || p.color;
    const div = document.createElement('div');
    div.className = 'flex justify-between items-center py-3 border-b border-white/10';
    div.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="title-font text-lg" style="color:${colorHex}">#${i + 1}</span>
        <span class="font-semibold">${p.name}</span>
      </div>
      <span class="text-gray-300">Tagged: ${p.taggedTime.toFixed(1)}s</span>
    `;
    resultsTable.appendChild(div);
  });
  const me = players.find((p) => p.id === socket.id);
  const isWinner = me && players[0].id === me.id;
  document.getElementById('resultTitle').innerText = isWinner ? 'YOU WIN! 🏆' : 'GAME OVER';
  document.getElementById('resultTitle').style.color = isWinner ? '#00ff88' : '#ff4444';
});

// Movement
const keysMap = {
  up:    ['ArrowUp', 'w', 'W'],
  down:  ['ArrowDown', 's', 'S'],
  left:  ['ArrowLeft', 'a', 'A'],
  right: ['ArrowRight', 'd', 'D'],
};

document.addEventListener('keydown', (e) => {
  for (const dir in keysMap) {
    if (keysMap[dir].includes(e.key)) {
      e.preventDefault();
      keyState[dir] = true;
    }
  }
});

document.addEventListener('keyup', (e) => {
  for (const dir in keysMap) {
    if (keysMap[dir].includes(e.key)) keyState[dir] = false;
  }
});

// Touch buttons
['up', 'down', 'left', 'right'].forEach((dir) => {
  const btn = document.getElementById(`${dir}Btn`);
  btn.addEventListener('touchstart', (e) => { e.preventDefault(); keyState[dir] = true; });
  btn.addEventListener('touchend',   (e) => { e.preventDefault(); keyState[dir] = false; });
  btn.addEventListener('mousedown',  () => keyState[dir] = true);
  btn.addEventListener('mouseup',    () => keyState[dir] = false);
  btn.addEventListener('mouseleave', () => keyState[dir] = false);
});

// Send moves
setInterval(() => {
  if (!currentLobby) return;
  for (const dir in keyState) {
    if (keyState[dir]) socket.emit('move', currentLobby, dir);
  }
}, 50);

// Leave Lobby
document.getElementById('leaveLobbyBtn').onclick = () => {
  socket.emit('leaveLobby', currentLobby);
  switchScreen('mainMenu');
  currentLobby = '';
  isHost = false;
};

// Play Again
document.getElementById('playAgainBtn').onclick = () => {
  switchScreen('mainMenu');
  currentLobby = '';
  isHost = false;
};

// Switch Screen
function switchScreen(id) {
  ['mainMenu', 'lobbyScreen', 'gameScreen', 'resultsScreen'].forEach((s) => {
    document.getElementById(s).classList.add('hidden');
  });
  document.getElementById(id).classList.remove('hidden');
}

socket.on('error', (msg) => alert('Error: ' + msg));
