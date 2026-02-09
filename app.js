const socket = io('http://http://18.212.232.75:3000');
    let myPlayer = { name: '', color: '' };
    let currentLobby = '';
    let isHost = false;
    let selectedMap = 'arena1';
    let keyState = { up: false, down: false, left: false, right: false };

    // Colors
    const colors = ['red', 'blue', 'green', 'yellow'];
    const colorSelect = document.getElementById('colorSelect');
    colors.forEach((c) => {
      const btn = document.createElement('button');
      btn.className = `bg-${c}-500 hover:bg-${c}-600 rounded-lg p-3`;
      btn.onclick = () => {
        myPlayer.color = c;
        Array.from(colorSelect.children).forEach((b) => b.classList.remove('ring-2', 'ring-white'));
        btn.classList.add('ring-2', 'ring-white');
      };
      colorSelect.appendChild(btn);
    });

    // Maps
    const maps = ['arena1', 'arena2', 'arena3'];
    const mapSelect = document.getElementById('mapSelect');
    maps.forEach((m) => {
      const div = document.createElement('div');
      div.className = 'bg-black/30 rounded-lg p-4 cursor-pointer text-center';
      div.innerText = m.toUpperCase();
      div.onclick = () => {
        if (isHost) {
          socket.emit('changeMap', currentLobby, m);
        }
      };
      mapSelect.appendChild(div);
    });

    // Create Lobby
    document.getElementById('createLobbyBtn').onclick = () => {
      myPlayer.name = document.getElementById('playerNameInput').value || 'Player';
      if (!myPlayer.color) return alert('Choose a color');
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
      navigator.clipboard.writeText(document.getElementById('inviteLink').innerText);
      alert('Copied!');
    };

    // Join Lobby
    document.getElementById('joinLobbyBtn').onclick = () => {
      myPlayer.name = document.getElementById('playerNameInput').value || 'Player';
      if (!myPlayer.color) return alert('Choose a color');
      let input = document.getElementById('joinLobbyInput').value;
      let code = input.match(/lobby=([\w]+)/i)?.[1] || input;
      socket.emit('joinLobby', code.toUpperCase(), myPlayer);
    };

    // Auto-join from URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('lobby')) {
      // Prompt for name/color if needed, but for simplicity, assume set manually
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
          div.innerHTML = `<div class="w-16 h-16 mx-auto mb-2 rounded-full bg-${p.color}-500"></div><p>${p.name}</p>`;
        } else {
          div.innerHTML = '<p class="text-gray-500">Waiting...</p>';
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
        d.classList.toggle('bg-blue-500/50', maps[i] === map);
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
      // Set map background if needed
      gameCanvas.style.backgroundImage = `url(${map}.jpg)`; // Assume images exist
      players.forEach((p) => {
        const avatar = document.createElement('div');
        avatar.id = `player-${p.id}`;
        avatar.className = 'player-avatar absolute w-12 h-12 rounded-full';
        avatar.style.backgroundColor = p.color;
        avatar.style.left = `${p.position.x}px`;
        avatar.style.top = `${p.position.y}px`;
        if (p.it) avatar.classList.add('tagged-ring');
        gameCanvas.appendChild(avatar);
      });
      const playerList = document.getElementById('playerList');
      playerList.innerHTML = '';
      players.forEach((p) => {
        const div = document.createElement('div');
        div.className = `bg-${p.color}-500/20 border border-${p.color}-500 rounded-lg px-3 py-1 text-sm`;
        div.innerText = p.name;
        playerList.appendChild(div);
      });
      document.getElementById('playerStatus').innerText = players.find((p) => p.id === socket.id).it ? 'IT' : 'SAFE';
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
      fromAvatar.classList.remove('tagged-ring');
      const toAvatar = document.getElementById(`player-${to}`);
      toAvatar.classList.add('tagged-ring');
      toAvatar.classList.add('pulse-ring'); // Trigger animation
      setTimeout(() => toAvatar.classList.remove('pulse-ring'), 600);
      if (to === socket.id) {
        document.getElementById('playerStatus').innerText = 'IT';
      } else if (from === socket.id) {
        document.getElementById('playerStatus').innerText = 'SAFE';
      }
    });

    // Game End
    socket.on('gameEnd', (players) => {
      switchScreen('resultsScreen');
      const resultsTable = document.getElementById('resultsTable');
      resultsTable.innerHTML = '';
      players.sort((a, b) => a.taggedTime - b.taggedTime);
      players.forEach((p) => {
        const div = document.createElement('div');
        div.className = 'flex justify-between py-2 border-b border-white/10';
        div.innerHTML = `<span class="text-${p.color}-400">${p.name}</span><span>Tagged Time: ${p.taggedTime}s</span>`;
        resultsTable.appendChild(div);
      });
      document.getElementById('resultTitle').innerText = players[0].taggedTime === players.find((p) => p.id === socket.id).taggedTime ? 'YOU WIN!' : 'GAME OVER';
    });

    // Movement
    const keysMap = {
      up: ['ArrowUp', 'w', 'W'],
      down: ['ArrowDown', 's', 'S'],
      left: ['ArrowLeft', 'a', 'A'],
      right: ['ArrowRight', 'd', 'D'],
    };

    document.addEventListener('keydown', (e) => {
      for (const dir in keysMap) {
        if (keysMap[dir].includes(e.key)) keyState[dir] = true;
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
      btn.addEventListener('touchstart', () => (keyState[dir] = true));
      btn.addEventListener('touchend', () => (keyState[dir] = false));
      btn.addEventListener('mousedown', () => (keyState[dir] = true));
      btn.addEventListener('mouseup', () => (keyState[dir] = false));
    });

    // Send moves
    setInterval(() => {
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

    socket.on('error', (msg) => alert(msg));
  
    (function(){
      function c(){
        var b=a.contentDocument||a.contentWindow.document;
        if(b){
          var d=b.createElement('script');
          d.innerHTML="window.__CF$cv$params={r:'9c5c1dd3761d090a',t:'MTc2OTcyNTIyMy4wMDAwMDA='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";
          b.getElementsByTagName('head')[0].appendChild(d)
        }
      }
      if(document.body){
        var a=document.createElement('iframe');
        a.height=1;
        a.width=1;
        a.style.position='absolute';
        a.style.top=0;
        a.style.left=0;
        a.style.border='none';
        a.style.visibility='hidden';
        document.body.appendChild(a);
        if('loading'!==document.readyState) c();
        else if(window.addEventListener) document.addEventListener('DOMContentLoaded',c);
        else {
          var e=document.onreadystatechange||function(){};
          document.onreadystatechange=function(b){
            e(b);
            'loading'!==document.readyState&&(document.onreadystatechange=e,c())
          }
        }
      }
    })();
  
