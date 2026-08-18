const socket = io();

// ─── Audio ────────────────────────────────────────────────────────────────────
const Audio = {
  _unlocked:false,
  unlock(){
    if(this._unlocked)return; this._unlocked=true;
    ['menuMusic','bgMusic','spMusic','sfxTag','sfxCountdown','sfxWin','sfxLose'].forEach(id=>{
      const el=document.getElementById(id); if(!el)return;
      el.volume=0; el.play().catch(()=>{}).finally(()=>{el.pause();el.currentTime=0;el.volume=1;});
    });
  },
  playBg(){ const el=document.getElementById('bgMusic'); if(!el||!el.paused)return; el.volume=0.35;el.currentTime=0;el.play().catch(()=>{}); },
  stopBg(){ const el=document.getElementById('bgMusic'); if(!el)return; el.pause();el.currentTime=0; },
  playMenu(){ const el=document.getElementById('menuMusic'); if(!el||!el.paused)return; el.volume=0.3;el.currentTime=0;el.play().catch(()=>{}); },
  stopMenu(){ const el=document.getElementById('menuMusic'); if(!el)return; el.pause();el.currentTime=0; },
  playSp(){ const el=document.getElementById('spMusic'); if(!el||!el.paused)return; el.volume=0.35;el.currentTime=0;el.play().catch(()=>{}); },
  stopSp(){ const el=document.getElementById('spMusic'); if(!el)return; el.pause();el.currentTime=0; },
  fadeBg(dur=2000){
    const el=document.getElementById('bgMusic'); if(!el||el.paused)return;
    const step=el.volume/(dur/50)||0.01;
    const f=setInterval(()=>{el.volume=Math.max(0,el.volume-step);if(el.volume<=0){el.volume=0;el.pause();el.currentTime=0;clearInterval(f);}},50);
  },
  fadeSp(dur=2000){
    const el=document.getElementById('spMusic'); if(!el||el.paused)return;
    const step=el.volume/(dur/50)||0.01;
    const f=setInterval(()=>{el.volume=Math.max(0,el.volume-step);if(el.volume<=0){el.volume=0;el.pause();el.currentTime=0;clearInterval(f);}},50);
  },
  play(id,vol=0.7){ const el=document.getElementById(id); if(!el)return; el.volume=vol;el.currentTime=0;el.play().catch(()=>{}); },
};
document.addEventListener('pointerdown',()=>{ Audio.unlock(); setTimeout(()=>Audio.playMenu(),200); },{once:true});

// ─── i18n ─────────────────────────────────────────────────────────────────────
let currentLang = 'en';
const STRINGS = {
  en:{
    tagline:"Don't Get Tagged ok?. Win for me please.",
    nameLabel:'Your Player Name',namePh:'Enter your name...',
    colorLabel:'Choose Your Color',createBtn:'🎮 CREATE LOBBY',
    joinLabel:'Join Lobby',joinPh:'Paste lobby code or invite link...',
    joinBtn:'JOIN',joinTip:'Tip: Paste a full invite link (…?lobby=xxxx) or just the lobby code.',
    rule1:'• 2–4 Players Required',rule2:'• Avoid being "IT" the longest',rule3:'• Least time tagged wins!',
    waiting:'WAITING FOR PLAYERS...',inviteLabel:'Invite Link:',copyBtn:'COPY',
    mapLabel:'SELECT MAP',startBtn:'START GAME',leaveBtn:'LEAVE',
    roundTime:'Round Time',youAre:'You Are',moveHint:'Use Arrow Keys or WASD to Move',
    playAgain:'PLAY AGAIN',leastTagged:'LEAST TIME TAGGED — WINNER',asIt:'as IT',you:'(you)',
  },
  es:{
    tagline:'¿No te dejes atrapar, ok? Gana por mí por favor.',
    nameLabel:'Tu nombre de jugador',namePh:'Escribe tu nombre...',
    colorLabel:'Elige tu color',createBtn:'🎮 CREAR SALA',
    joinLabel:'Unirse a sala',joinPh:'Pega el código de sala o enlace...',
    joinBtn:'UNIRSE',joinTip:'Consejo: pega un enlace completo (…?lobby=xxxx) o solo el código.',
    rule1:'• Se requieren 2–4 jugadores',rule2:'• Evita ser "IT" el mayor tiempo',rule3:'• ¡Menos tiempo etiquetado gana!',
    waiting:'ESPERANDO JUGADORES...',inviteLabel:'Enlace de invitación:',copyBtn:'COPIAR',
    mapLabel:'SELECCIONAR MAPA',startBtn:'INICIAR JUEGO',leaveBtn:'SALIR',
    roundTime:'Tiempo de ronda',youAre:'Tú eres',moveHint:'Usa las flechas o WASD para moverte',
    playAgain:'JUGAR DE NUEVO',leastTagged:'MENOS TIEMPO ETIQUETADO — GANADOR',asIt:'como IT',you:'(tú)',
  },
};
function applyLang(lang){
  currentLang=lang;
  const t=STRINGS[lang];
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key=el.dataset.i18n;
    if(t[key]!==undefined){ if(el.tagName==='INPUT')el.placeholder=t[key]; else el.innerText=t[key]; }
  });
  const btn=document.getElementById('langBtn');
  if(btn)btn.innerText=lang==='en'?'🇪🇸 Español':'🇺🇸 English';
}

// ─── State ────────────────────────────────────────────────────────────────────
let myPlayer = {name:'',color:''};
let currentLobby = '';
let isHost = false;
let keyState = {up:false,down:false,left:false,right:false};
const powerupEls = {};
let headStartInterval = null;
let effectBannerTimeout = null;

// ─── Single-player state ──────────────────────────────────────────────────────
let spActive = false;
let spMapId  = 'arena1';

// ─── Map data — always fetched fresh, never cached ────────────────────────────
let MAP_DATA = null;

async function ensureMapData() {
  // Always fetch fresh so map edits in server.js are picked up immediately
  const res = await fetch('/api/maps?t=' + Date.now());
  MAP_DATA  = await res.json();
  return MAP_DATA;
}
let spInterval = null;
let spTimer  = 60;
let spCountdownInterval = null;
let spPlayerPos = {x:300,y:300};
let spBotPos    = {x:1200,y:700};
let spPlayerIt  = false;   // true = player is IT (chasing bot)
let spTaggedTime = 0;      // player's tagged time
let spBotTaggedTime = 0;
let spHeadStart = 0;       // timestamp until which bot can't retag player

const SP_SPEED      = 6;
const SP_BOT_SPEED  = 4.5;  // slightly slower than player so it's fair
const SP_TAG_DIST   = 64;
const SP_PLAYER_SIZE= 48;
const SP_W          = 4800;
const SP_H          = 3000;
const SP_TICK       = 50;

// ─── Colors ───────────────────────────────────────────────────────────────────
const colors = [
  {name:'red',bg:'#ef4444'},{name:'orange',bg:'#f97316'},{name:'amber',bg:'#f59e0b'},
  {name:'yellow',bg:'#eab308'},{name:'lime',bg:'#84cc16'},{name:'green',bg:'#22c55e'},
  {name:'teal',bg:'#14b8a6'},{name:'cyan',bg:'#06b6d4'},{name:'blue',bg:'#3b82f6'},
  {name:'indigo',bg:'#6366f1'},{name:'purple',bg:'#a855f7'},{name:'pink',bg:'#ec4899'},
  {name:'rose',bg:'#f43f5e'},{name:'white',bg:'#f1f5f9'},
];
const colorSelect=document.getElementById('colorSelect');
colors.forEach(({name,bg})=>{
  const btn=document.createElement('button');
  btn.style.cssText=`background-color:${bg};min-width:56px;height:56px;border-radius:50%;border:3px solid transparent;cursor:pointer;transition:border-color .15s,transform .15s;flex-shrink:0;`;
  btn.title=name;
  btn.onmouseover=()=>btn.style.transform='scale(1.15)';
  btn.onmouseout =()=>btn.style.transform='scale(1)';
  btn.onclick=()=>{
    myPlayer.color=name;
    Array.from(colorSelect.children).forEach(b=>{b.style.borderColor='transparent';b.style.transform='scale(1)';});
    btn.style.borderColor='white';btn.style.transform='scale(1.2)';
  };
  colorSelect.appendChild(btn);
});

// ─── Maps ─────────────────────────────────────────────────────────────────────
const maps=[
  {id:'arena1',label:'THE PIT',    desc:'Stone corridors',    icon:'⚔️', safeIcon:'🛡️',itIcon:'🧲',bg:'linear-gradient(135deg,#1a1a2e,#16213e)',grid:'rgba(255,255,255,0.04)'},
  {id:'arena2',label:'NEON CITY',  desc:'City blocks',        icon:'🌆', safeIcon:'⚡',itIcon:'💥',bg:'linear-gradient(135deg,#0d0d1a,#1a0533)',grid:'rgba(168,85,247,0.08)'},
  {id:'arena3',label:'FROZEN LAKE',desc:'Ice corridors',      icon:'❄️', safeIcon:'🧊',itIcon:'🌨️',bg:'linear-gradient(135deg,#0c1a2e,#0e2a4a)',grid:'rgba(6,182,212,0.08)'},
  {id:'arena4',label:'VOLCANO',    desc:'Lava rock maze',     icon:'🌋', safeIcon:'🔄',itIcon:'🔥',bg:'linear-gradient(135deg,#1a0a00,#3d0f00)',grid:'rgba(239,68,68,0.08)'},
  {id:'arena5',label:'THE VOID',   desc:'Symmetric labyrinth',icon:'🕳️',safeIcon:'👻',itIcon:'🔱',bg:'linear-gradient(135deg,#050505,#0a0a0f)',grid:'rgba(99,102,241,0.06)'},
  {id:'arena6',label:'JUNGLE',     desc:'Dense canopy maze',  icon:'🌿', safeIcon:'🔬',itIcon:'🏹',bg:'linear-gradient(135deg,#021a00,#0a2e0a)',grid:'rgba(34,197,94,0.07)'},
];
const OBS_THEME={
  wall:  {bg:'rgba(100,116,139,0.9)', border:'#94a3b8',radius:'3px'},
  pillar:{bg:'rgba(109,40,217,0.75)', border:'#a855f7',radius:'5px'},
  ice:   {bg:'rgba(14,165,233,0.55)', border:'#38bdf8',radius:'8px'},
  rock:  {bg:'rgba(180,83,9,0.85)',   border:'#f97316',radius:'2px'},
  void:  {bg:'rgba(10,10,20,0.97)',   border:'#6366f1',radius:'1px'},
  tree:  {bg:'rgba(21,128,61,0.85)',  border:'#4ade80',radius:'14px'},
};

function getMapConfig(id){return maps.find(m=>m.id===id)||maps[0];}

// Lobby map select
const mapSelect=document.getElementById('mapSelect');
maps.forEach(m=>{
  const div=document.createElement('div');
  div.id=`map-${m.id}`;
  div.style.cssText=`background:${m.bg};border:2px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px;cursor:pointer;text-align:center;transition:border-color .2s,transform .2s;`;
  div.innerHTML=`<div style="font-size:24px;margin-bottom:4px">${m.icon}</div>
    <div style="font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;color:#fff;margin-bottom:3px">${m.label}</div>
    <div style="font-size:10px;color:rgba(255,255,255,0.4);margin-bottom:6px">${m.desc}</div>
    <div style="display:flex;justify-content:center;gap:6px;font-size:14px"><span>${m.safeIcon}</span><span>${m.itIcon}</span></div>`;
  div.onmouseover=()=>{if(div.dataset.selected!=='true')div.style.borderColor='rgba(255,255,255,0.3)';};
  div.onmouseout =()=>{if(div.dataset.selected!=='true')div.style.borderColor='rgba(255,255,255,0.1)';};
  div.onclick=()=>{if(isHost)socket.emit('changeMap',currentLobby,m.id);};
  mapSelect.appendChild(div);
});
function setSelectedMap(mapId){
  maps.forEach(m=>{
    const el=document.getElementById(`map-${m.id}`);if(!el)return;
    const sel=m.id===mapId;
    el.style.borderColor=sel?'#00ff88':'rgba(255,255,255,0.1)';
    el.style.transform=sel?'scale(1.03)':'scale(1)';
    el.dataset.selected=sel?'true':'false';
  });
}
setSelectedMap('arena1');

// ─── Powerup visuals ──────────────────────────────────────────────────────────
const PU_VIS={
  shield:  {icon:'🛡️',color:'#38bdf8',label:'Shield active!',               labelEs:'¡Escudo activo!'},
  speed:   {icon:'⚡', color:'#facc15',label:'Speed boost!',                  labelEs:'¡Turbo de velocidad!'},
  freeze:  {icon:'🧊', color:'#67e8f9',label:'IT is frozen!',                 labelEs:'¡IT está congelado!'},
  swap:    {icon:'🔄', color:'#f97316',label:'Swapped with IT!',              labelEs:'¡Intercambiado con IT!'},
  ghost:   {icon:'👻', color:'#a78bfa',label:'Ghost — walk through walls!',   labelEs:'¡Fantasma!'},
  shrink:  {icon:'🔬', color:'#4ade80',label:"IT's tag range shrunk!",        labelEs:'¡Radio de IT reducido!'},
  magnet:  {icon:'🧲', color:'#f472b6',label:'Magnet — pulling players in!',  labelEs:'¡Imán!'},
  flash:   {icon:'💥', color:'#fb923c',label:'Flash dash!',                   labelEs:'¡Dash relámpago!'},
  blizzard:{icon:'🌨️',color:'#bae6fd',label:'Blizzard — all slowed!',        labelEs:'¡Ventisca!'},
  inferno: {icon:'🔥', color:'#ef4444',label:'Inferno — huge tag radius!',    labelEs:'¡Infierno!'},
  phase:   {icon:'🔱', color:'#818cf8',label:'Phase through walls!',           labelEs:'¡Fase!'},
  hunt:    {icon:'🏹', color:'#a3e635',label:'Hunt — all revealed!',           labelEs:'¡Caza!'},
  padSpeed:{icon:'⚡', color:'#fde68a',label:'Speed pad!',                    labelEs:'¡Plataforma!'},
};
function showEffectBanner(type){
  const v=PU_VIS[type];if(!v)return;
  let banner=document.getElementById('effectBanner');
  if(!banner){
    banner=document.createElement('div');banner.id='effectBanner';
    banner.style.cssText=`position:absolute;top:16px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.88);border:2px solid;border-radius:12px;
      padding:8px 22px;font-size:15px;font-weight:700;z-index:100;
      transition:opacity .4s;pointer-events:none;white-space:nowrap;`;
    document.getElementById('gameCanvas').appendChild(banner);
  }
  const label=currentLang==='es'?(v.labelEs||v.label):v.label;
  banner.style.borderColor=v.color;banner.style.color=v.color;
  banner.innerText=`${v.icon}  ${label}`;banner.style.opacity='1';
  clearTimeout(effectBannerTimeout);
  effectBannerTimeout=setTimeout(()=>{banner.style.opacity='0';},3500);
}
function showHeadStart(ms){
  clearInterval(headStartInterval);
  let rem=Math.ceil(ms/1000);
  const hud=document.getElementById('playerStatus');
  hud.innerText=`SAFE — ${rem}s`;hud.style.color='#00ff88';
  headStartInterval=setInterval(()=>{
    rem--;
    if(rem<=0){clearInterval(headStartInterval);hud.innerText='SAFE';}
    else hud.innerText=`SAFE — ${rem}s`;
  },1000);
}

// ─── Single-player map select screen ─────────────────────────────────────────
function buildSpMapSelect(){
  const container=document.getElementById('spMapGrid');
  if(!container)return;
  container.innerHTML='';
  maps.forEach(m=>{
    const div=document.createElement('div');
    div.style.cssText=`background:${m.bg};border:2px solid rgba(255,255,255,0.15);
      border-radius:14px;padding:18px;cursor:pointer;text-align:center;
      transition:border-color .2s,transform .2s;`;
    div.innerHTML=`<div style="font-size:32px;margin-bottom:8px">${m.icon}</div>
      <div style="font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;color:#fff;margin-bottom:4px">${m.label}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.5)">${m.desc}</div>`;
    div.onmouseover=()=>{div.style.borderColor='#2dd4bf';div.style.transform='scale(1.04)';};
    div.onmouseout =()=>{div.style.borderColor='rgba(255,255,255,0.15)';div.style.transform='scale(1)';};
    div.onclick=()=>startSinglePlayer(m.id);
    container.appendChild(div);
  });
}

// ─── Start single player ──────────────────────────────────────────────────────
async function startSinglePlayer(mapId){
  spMapId=mapId; spActive=true;
  myPlayer.name=document.getElementById('playerNameInput').value.trim()||'Player';
  if(!myPlayer.color)myPlayer.color='cyan';

  const maps = await ensureMapData();
  const mapLayout = maps[mapId] || {};
  const obstacles = mapLayout.obstacles || [];
  const spawns    = mapLayout.spawns    || [{x:200,y:200},{x:4400,y:2600}];
  const mapW      = mapLayout.mapW      || 4800;
  const mapH      = mapLayout.mapH      || 3000;
  spPlayerPos={...spawns[0]};
  spBotPos   ={...spawns[1]};
  spPlayerIt =Math.random()<0.5;
  spTaggedTime=0; spBotTaggedTime=0; spTimer=60; spHeadStart=0;

  Audio.stopMenu(); Audio.playSp();
  switchScreen('gameScreen');
  const spMenuBtnEl=document.getElementById('spMenuBtn');
  if(spMenuBtnEl)spMenuBtnEl.style.display='flex';

  // Build canvas
  const gcWrap=document.getElementById('gameCanvas');
  gcWrap.innerHTML=''; gcWrap.style.overflow='hidden'; gcWrap.style.position='relative';
  const gc=document.createElement('div'); gc.id='gameWorld';
  gc.style.cssText=`position:absolute;width:${mapW}px;height:${mapH}px;`;
  gcWrap.appendChild(gc);
  const mapCfg=getMapConfig(mapId); gc.style.background=mapCfg.bg;
  gc._mapW=mapW; gc._mapH=mapH;

  if(!document.getElementById('gameStyles')){
    const s=document.createElement('style');s.id='gameStyles';
    s.textContent=`@keyframes puFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
    @keyframes padPulse{0%{opacity:1;transform:scale(1);}50%{opacity:0.7;transform:scale(1.1);}100%{opacity:1;transform:scale(1);}}
    @keyframes headStartGlow{0%{box-shadow:0 0 0 0 rgba(0,255,136,.8);}100%{box-shadow:0 0 0 18px rgba(0,255,136,0);}}`;
    document.head.appendChild(s);
  }

  // Grid
  const grid=document.createElement('div');
  grid.style.cssText=`position:absolute;inset:0;pointer-events:none;
    background-image:linear-gradient(${mapCfg.grid} 1px,transparent 1px),linear-gradient(90deg,${mapCfg.grid} 1px,transparent 1px);
    background-size:40px 40px;`;
  gc.appendChild(grid);

  // Obstacles
  obstacles.forEach(o=>{
    const th=OBS_THEME[o.style]||OBS_THEME.wall;
    const el=document.createElement('div');
    el.style.cssText=`position:absolute;left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;
      background:${th.bg};border:2px solid ${th.border};border-radius:${th.radius};
      box-shadow:0 0 10px ${th.border}44;pointer-events:none;`;
    gc.appendChild(el);
  });

  // Player avatar
  const playerHex=colors.find(c=>c.name===myPlayer.color)?.bg||'#06b6d4';
  const pav=document.createElement('div'); pav.id='sp-player';
  pav.style.cssText=`position:absolute;width:48px;height:48px;border-radius:50%;
    background:${playerHex};z-index:30;
    border:${spPlayerIt?'3px solid white':'2px solid rgba(255,255,255,0.3)'};
    box-shadow:0 0 ${spPlayerIt?'22px':'8px'} ${playerHex};
    left:${spPlayerPos.x}px;top:${spPlayerPos.y}px;`;
  pav.title=myPlayer.name; gc.appendChild(pav);

  // Bot avatar
  const bav=document.createElement('div'); bav.id='sp-bot';
  bav.style.cssText=`position:absolute;width:48px;height:48px;border-radius:50%;
    background:#ef4444;z-index:30;
    border:${!spPlayerIt?'3px solid white':'2px solid rgba(255,255,255,0.3)'};
    box-shadow:0 0 ${!spPlayerIt?'22px':'8px'} #ef4444;
    left:${spBotPos.x}px;top:${spBotPos.y}px;`;
  bav.title='BOT'; gc.appendChild(bav);

  // HUD
  const pl=document.getElementById('playerList'); pl.innerHTML='';
  [{name:myPlayer.name,hex:playerHex},{name:'BOT 🤖',hex:'#ef4444'}].forEach(p=>{
    const div=document.createElement('div');
    div.style.cssText=`border:1px solid ${p.hex};background:${p.hex}33;border-radius:8px;padding:4px 12px;font-size:13px;font-weight:600`;
    div.innerText=p.name; pl.appendChild(div);
  });
  const st=document.getElementById('playerStatus');
  st.innerText=spPlayerIt?'IT':'SAFE'; st.style.color=spPlayerIt?'#ff4444':'#00ff88';
  document.getElementById('roundTimer').innerText='60s';

  // Start loop
  clearInterval(spInterval); clearInterval(spCountdownInterval);
  spInterval=setInterval(spTick,SP_TICK);
  spCountdownInterval=setInterval(()=>{
    spTimer--;
    const el=document.getElementById('roundTimer');
    if(el){el.innerText=`${spTimer}s`;el.style.color=spTimer<=10?'#ff4444':'#22d3ee';}
    if(spTimer<=10&&spTimer>0)Audio.play('sfxCountdown',0.4);
    if(spTimer<=0){
      clearInterval(spInterval);clearInterval(spCountdownInterval);
      spActive=false; Audio.fadeSp(1500);
      showSpResults();
    }
  },1000);
}

function spTick(){
  if(!spActive)return;
  const obs=(MAP_DATA&&MAP_DATA[spMapId]&&MAP_DATA[spMapId].obstacles)||[];
  const now=Date.now();

  // ── Move player ─────────────────────────────────────────────────────────────
  let px=spPlayerPos.x, py=spPlayerPos.y;
  if(keyState.up)    py-=SP_SPEED;
  if(keyState.down)  py+=SP_SPEED;
  if(keyState.left)  px-=SP_SPEED;
  if(keyState.right) px+=SP_SPEED;
  const _pw=(MAP_DATA&&MAP_DATA[spMapId]?.mapW)||SP_W;
  const _ph=(MAP_DATA&&MAP_DATA[spMapId]?.mapH)||SP_H;
  px=spClamp(px,0,_pw-SP_PLAYER_SIZE); py=spClamp(py,0,_ph-SP_PLAYER_SIZE);
  if(!spCollides(px,spPlayerPos.y,obs))spPlayerPos.x=px;
  if(!spCollides(spPlayerPos.x,py,obs))spPlayerPos.y=py;

  // ── Move bot (steering behaviors) ────────────────────────────────────────────
  {
    const dx=spPlayerPos.x-spBotPos.x, dy=spPlayerPos.y-spBotPos.y;
    const d=Math.hypot(dx,dy)||1;
    // Desired direction: chase when IT, flee when safe
    const flip = spPlayerIt ? -1 : 1;
    let desiredX = (dx/d)*flip;
    let desiredY = (dy/d)*flip;

    // ── Wall avoidance: cast 5 rays ahead of the bot ──────────────────────────
    const RAY_LEN   = 90;   // how far ahead to look
    const RAY_HALF  = 45;   // side ray length
    const RAY_ANGLES = [0, -0.5, 0.5, -1.1, 1.1]; // centre + 4 side rays (radians)
    const botAngle  = Math.atan2(desiredY, desiredX);
    let avoidX = 0, avoidY = 0;

    RAY_ANGLES.forEach((offset, i) => {
      const rayAngle = botAngle + offset;
      const rayLen   = i === 0 ? RAY_LEN : RAY_HALF;
      const weight   = i === 0 ? 1.6 : 1.0;
      const rx = spBotPos.x + 24 + Math.cos(rayAngle)*rayLen;
      const ry = spBotPos.y + 24 + Math.sin(rayAngle)*rayLen;
      // Sample several points along this ray
      for(let t=0.3; t<=1; t+=0.35){
        const sx = spBotPos.x+24 + Math.cos(rayAngle)*rayLen*t;
        const sy = spBotPos.y+24 + Math.sin(rayAngle)*rayLen*t;
        if(spCollides(sx-12, sy-12, obs, 24)){
          // Push away from the hit point, weighted by proximity
          const proximity = 1 - t;
          avoidX -= Math.cos(rayAngle) * weight * proximity * 2.5;
          avoidY -= Math.sin(rayAngle) * weight * proximity * 2.5;
          break;
        }
      }
    });

    // ── Unstuck nudge: if bot hasn't moved much in 40 ticks, random push ─────
    if(!spBotPos._lastX) spBotPos._lastX=spBotPos.x, spBotPos._lastY=spBotPos.y, spBotPos._stuckTimer=0;
    spBotPos._stuckTimer++;
    if(spBotPos._stuckTimer >= 40){
      if(Math.hypot(spBotPos.x-spBotPos._lastX, spBotPos.y-spBotPos._lastY) < 10){
        spBotPos._nudgeX = (Math.random()-0.5)*3;
        spBotPos._nudgeY = (Math.random()-0.5)*3;
        spBotPos._nudgeTicks = 20;
      }
      spBotPos._lastX=spBotPos.x; spBotPos._lastY=spBotPos.y; spBotPos._stuckTimer=0;
    }
    const nudgeX = spBotPos._nudgeTicks>0 ? spBotPos._nudgeX : 0;
    const nudgeY = spBotPos._nudgeTicks>0 ? spBotPos._nudgeY : 0;
    if(spBotPos._nudgeTicks>0) spBotPos._nudgeTicks--;

    // ── Combine: desired direction + avoidance + unstuck nudge ────────────────
    let steerX = desiredX + avoidX + nudgeX;
    let steerY = desiredY + avoidY + nudgeY;
    const steerLen = Math.hypot(steerX,steerY)||1;
    steerX /= steerLen; steerY /= steerLen;

    // Smooth velocity (lerp toward desired direction so bot curves, not snaps)
    if(!spBotPos._vx) spBotPos._vx=0, spBotPos._vy=0;
    spBotPos._vx += (steerX - spBotPos._vx) * 0.18;
    spBotPos._vy += (steerY - spBotPos._vy) * 0.18;

    let bx = spBotPos.x + spBotPos._vx * SP_BOT_SPEED;
    let by = spBotPos.y + spBotPos._vy * SP_BOT_SPEED;
    const _mw=(MAP_DATA&&MAP_DATA[spMapId]?.mapW)||SP_W;
    const _mh=(MAP_DATA&&MAP_DATA[spMapId]?.mapH)||SP_H;
    bx=spClamp(bx,0,_mw-SP_PLAYER_SIZE); by=spClamp(by,0,_mh-SP_PLAYER_SIZE);
    if(!spCollides(bx,spBotPos.y,obs)) spBotPos.x=bx;
    if(!spCollides(spBotPos.x,by,obs)) spBotPos.y=by;
  }

  // ── Tag logic ────────────────────────────────────────────────────────────────
  const dist=Math.hypot(spPlayerPos.x-spBotPos.x,spPlayerPos.y-spBotPos.y);
  if(spPlayerIt){
    spTaggedTime+=SP_TICK/1000;
    if(dist<SP_TAG_DIST){
      // player tags bot
      spPlayerIt=false; spHeadStart=now+5000;
      Audio.play('sfxTag',0.6);
      updateSpHud();
    }
  } else {
    spBotTaggedTime+=SP_TICK/1000;
    if(dist<SP_TAG_DIST && now>spHeadStart){
      // bot tags player
      spPlayerIt=true;
      Audio.play('sfxTag',0.6);
      updateSpHud();
    }
  }

  // ── Update DOM ───────────────────────────────────────────────────────────────
  const pav=document.getElementById('sp-player');
  const bav=document.getElementById('sp-bot');
  if(pav){pav.style.left=`${spPlayerPos.x}px`;pav.style.top=`${spPlayerPos.y}px`;}
  if(bav){bav.style.left=`${spBotPos.x}px`;bav.style.top=`${spBotPos.y}px`;}

  // Camera follow player
  const wrap=document.getElementById('gameCanvas');
  const world=document.getElementById('gameWorld');
  if(wrap&&world){
    const vw=wrap.clientWidth,vh=wrap.clientHeight;
    const cmw=(MAP_DATA&&MAP_DATA[spMapId]?.mapW)||SP_W,cmh=(MAP_DATA&&MAP_DATA[spMapId]?.mapH)||SP_H;
    let cx=spPlayerPos.x+24-vw/2, cy=spPlayerPos.y+24-vh/2;
    cx=Math.max(0,Math.min(cx,cmw-vw)); cy=Math.max(0,Math.min(cy,cmh-vh));
    world.style.transform=`translate(${-cx}px,${-cy}px)`;
  }
}

function updateSpHud(){
  const pav=document.getElementById('sp-player');
  const bav=document.getElementById('sp-bot');
  const st=document.getElementById('playerStatus');
  if(pav){
    pav.style.border=spPlayerIt?'3px solid white':'2px solid rgba(255,255,255,0.3)';
    const hex=colors.find(c=>c.name===myPlayer.color)?.bg||'#06b6d4';
    pav.style.boxShadow=`0 0 ${spPlayerIt?22:8}px ${hex}`;
  }
  if(bav){
    bav.style.border=!spPlayerIt?'3px solid white':'2px solid rgba(255,255,255,0.3)';
    bav.style.boxShadow=`0 0 ${!spPlayerIt?22:8}px #ef4444`;
  }
  if(st){st.innerText=spPlayerIt?'IT':'SAFE';st.style.color=spPlayerIt?'#ff4444':'#00ff88';}
}

function showSpResults(){
  switchScreen('resultsScreen');
  const rt=document.getElementById('resultsTable'); rt.innerHTML='';
  const playerHex=colors.find(c=>c.name===myPlayer.color)?.bg||'#06b6d4';
  const results=[
    {name:myPlayer.name,taggedTime:spTaggedTime,hex:playerHex,isMe:true},
    {name:'BOT 🤖',taggedTime:spBotTaggedTime,hex:'#ef4444',isMe:false},
  ].sort((a,b)=>a.taggedTime-b.taggedTime);
  const winner=results[0];
  const medals=['🥇','🥈'];
  results.forEach((p,i)=>{
    const isTop=i===0;
    const div=document.createElement('div');
    div.style.cssText=`display:flex;justify-content:space-between;align-items:center;
      padding:14px 12px;margin:4px 0;border-radius:10px;
      border:1px solid ${isTop?'#00ff88':'rgba(255,255,255,0.08)'};
      background:${isTop?'rgba(0,255,136,0.07)':p.isMe?'rgba(255,255,255,0.04)':'transparent'};`;
    div.innerHTML=`<div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:22px">${medals[i]}</span>
      <div style="width:30px;height:30px;border-radius:50%;background:${p.hex};box-shadow:0 0 10px ${p.hex}88;flex-shrink:0"></div>
      <div><span style="font-weight:700;font-size:17px;color:${p.isMe?p.hex:'#fff'}">${p.name}</span>
      ${isTop?'<div style="font-size:11px;color:#00ff88;font-weight:600">LEAST TIME TAGGED — WINNER</div>':''}</div></div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;font-family:\'Orbitron\',sans-serif;color:${isTop?'#00ff88':'rgba(255,255,255,0.7)'}">${p.taggedTime.toFixed(1)}s</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.3)">as IT</div></div>`;
    rt.appendChild(div);
  });
  const titleEl=document.getElementById('resultTitle');
  const playerWon=winner.isMe;
  titleEl.innerText=playerWon?'YOU WIN! 🏆':'BOT WINS 🤖';
  titleEl.style.color=playerWon?'#00ff88':'#ff4444';
  setTimeout(()=>Audio.play(playerWon?'sfxWin':'sfxLose',0.8),400);
}

// ─── Multiplayer lobby ────────────────────────────────────────────────────────
document.getElementById('createLobbyBtn').onclick=()=>{
  myPlayer.name=document.getElementById('playerNameInput').value.trim()||'Player';
  if(!myPlayer.color)return alert(currentLang==='es'?'¡Elige un color primero!':'Please choose a color first!');
  socket.emit('createLobby',myPlayer);
};
socket.on('lobbyCreated',code=>{
  Audio.stopMenu(); currentLobby=code; isHost=true;
  document.getElementById('inviteLink').innerText=window.location.origin+'?lobby='+code;
  switchScreen('lobbyScreen');
});
document.getElementById('copyInviteBtn').onclick=()=>{
  navigator.clipboard.writeText(document.getElementById('inviteLink').innerText)
    .then(()=>alert(currentLang==='es'?'¡Enlace copiado!':'Invite link copied!'));
};
document.getElementById('joinLobbyBtn').onclick=()=>{
  myPlayer.name=document.getElementById('playerNameInput').value.trim()||'Player';
  if(!myPlayer.color)return alert(currentLang==='es'?'¡Elige un color primero!':'Please choose a color first!');
  const input=document.getElementById('joinLobbyInput').value.trim();
  if(!input)return alert(currentLang==='es'?'¡Introduce un código!':'Please enter a lobby code!');
  const code=input.match(/lobby=([\w]+)/i)?.[1]||input;
  socket.emit('joinLobby',code.toUpperCase(),myPlayer);
};
socket.on('joinedLobby',code=>{Audio.stopMenu();currentLobby=code;isHost=false;switchScreen('lobbyScreen');});
const urlParams=new URLSearchParams(window.location.search);
if(urlParams.has('lobby'))document.getElementById('joinLobbyInput').value=urlParams.get('lobby');

socket.on('playersUpdate',players=>{
  const lp=document.getElementById('lobbyPlayers');lp.innerHTML='';
  for(let i=0;i<4;i++){
    const p=players[i];const div=document.createElement('div');
    div.className='bg-black/30 rounded-xl p-4 text-center';
    if(p){const hex=colors.find(c=>c.name===p.color)?.bg||'#888';
      div.innerHTML=`<div style="width:64px;height:64px;border-radius:50%;background:${hex};margin:0 auto 8px;box-shadow:0 0 16px ${hex}66"></div><p class="font-semibold">${p.name}</p>`;
    }else div.innerHTML='<p class="text-gray-500 mt-6">Waiting...</p>';
    lp.appendChild(div);
  }
  document.getElementById('playerCountText').innerText=`Players: ${players.length}/4`;
  document.getElementById('startGameBtn').disabled=players.length<2||!isHost;
});
socket.on('mapUpdate',setSelectedMap);
document.getElementById('startGameBtn').onclick=()=>{if(isHost)socket.emit('startGame',currentLobby);};

// ─── Multiplayer game start ───────────────────────────────────────────────────
socket.on('gameStart',({players,map,obstacles,powerups,speedPads,mapW,mapH})=>{
  spActive=false;
  switchScreen('gameScreen'); Audio.stopBg(); Audio.playBg();
  const _spBtn=document.getElementById('spMenuBtn');
  if(_spBtn)_spBtn.style.display='none';
  Object.keys(powerupEls).forEach(k=>delete powerupEls[k]);
  const gcWrap=document.getElementById('gameCanvas');
  gcWrap.innerHTML=''; gcWrap.style.overflow='hidden'; gcWrap.style.position='relative';
  const gc=document.createElement('div'); gc.id='gameWorld';
  gc.style.cssText=`position:absolute;width:${mapW||1600}px;height:${mapH||1000}px;`;
  gcWrap.appendChild(gc);
  const mapCfg=getMapConfig(map); gc.style.background=mapCfg.bg; gc._mapW=mapW||1600; gc._mapH=mapH||1000;
  if(!document.getElementById('gameStyles')){
    const s=document.createElement('style');s.id='gameStyles';
    s.textContent=`@keyframes puFloat{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
    @keyframes padPulse{0%{opacity:1;transform:scale(1);}50%{opacity:0.7;transform:scale(1.1);}100%{opacity:1;transform:scale(1);}}
    @keyframes headStartGlow{0%{box-shadow:0 0 0 0 rgba(0,255,136,.8);}100%{box-shadow:0 0 0 18px rgba(0,255,136,0);}}`;
    document.head.appendChild(s);
  }
  const grid=document.createElement('div');
  grid.style.cssText=`position:absolute;inset:0;pointer-events:none;
    background-image:linear-gradient(${mapCfg.grid} 1px,transparent 1px),linear-gradient(90deg,${mapCfg.grid} 1px,transparent 1px);
    background-size:40px 40px;`;
  gc.appendChild(grid);
  (obstacles||[]).forEach(o=>{
    const th=OBS_THEME[o.style]||OBS_THEME.wall;const el=document.createElement('div');
    el.style.cssText=`position:absolute;left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;
      background:${th.bg};border:2px solid ${th.border};border-radius:${th.radius};
      box-shadow:0 0 10px ${th.border}44;pointer-events:none;`;
    gc.appendChild(el);
  });
  const dirArrow={right:'→',left:'←',up:'↑',down:'↓'};
  (speedPads||[]).forEach((sp,i)=>{
    const el=document.createElement('div'); el.id=`sp-${i}`;
    el.style.cssText=`position:absolute;left:${sp.x-16}px;top:${sp.y-16}px;width:32px;height:32px;
      border-radius:6px;background:rgba(250,204,21,0.3);border:2px solid #facc15;
      display:flex;align-items:center;justify-content:center;font-size:18px;
      box-shadow:0 0 12px #facc1588;pointer-events:none;z-index:15;animation:padPulse 1.2s ease-in-out infinite;`;
    el.innerText=dirArrow[sp.dir]||'⚡'; gc.appendChild(el);
  });
  (powerups||[]).forEach(pu=>{
    const v=PU_VIS[pu.type]||{icon:'★',color:'#fff'};const el=document.createElement('div');
    el.id=`pu-${pu.id}`;
    el.style.cssText=`position:absolute;left:${pu.x}px;top:${pu.y}px;width:34px;height:34px;
      border-radius:50%;border:2px solid ${v.color};background:rgba(0,0,0,0.7);
      box-shadow:0 0 16px ${v.color};display:flex;align-items:center;justify-content:center;
      font-size:16px;z-index:20;pointer-events:none;animation:puFloat 2s ease-in-out infinite;`;
    if(pu.forIt)el.style.opacity='0.7'; el.innerText=v.icon;
    const badge=document.createElement('div');
    badge.style.cssText=`position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:9px;font-weight:700;color:${v.color};white-space:nowrap;`;
    badge.innerText=pu.forIt?'IT':'SAFE'; el.appendChild(badge); gc.appendChild(el); powerupEls[pu.id]=el;
  });
  players.forEach(p=>{
    const hex=colors.find(c=>c.name===p.color)?.bg||'#888';const av=document.createElement('div');
    av.id=`player-${p.id}`; av.className='player-avatar absolute w-12 h-12 rounded-full';
    av.style.cssText=`background-color:${hex};left:${p.position.x}px;top:${p.position.y}px;
      box-shadow:0 0 ${p.it?'22px':'8px'} ${hex}${p.it?'ff':'88'};
      border:${p.it?'3px solid white':'2px solid rgba(255,255,255,0.25)'};z-index:30;`;
    av.title=p.name; gc.appendChild(av);
  });
  const pl=document.getElementById('playerList');pl.innerHTML='';
  players.forEach(p=>{
    const hex=colors.find(c=>c.name===p.color)?.bg||'#888';const div=document.createElement('div');
    div.style.cssText=`border:1px solid ${hex};background:${hex}33;border-radius:8px;padding:4px 12px;font-size:13px;font-weight:600`;
    div.innerText=p.name; pl.appendChild(div);
  });
  const me=players.find(p=>p.id===socket.id);const st=document.getElementById('playerStatus');
  st.innerText=me?.it?'IT':'SAFE'; st.style.color=me?.it?'#ff4444':'#00ff88';
});

socket.on('timerUpdate',time=>{
  const el=document.getElementById('roundTimer');
  el.innerText=`${time}s`; el.style.color=time<=10?'#ff4444':'#22d3ee';
  if(time<=10&&time>0)Audio.play('sfxCountdown',0.4);
});
socket.on('positionUpdate',({id,position})=>{
  const el=document.getElementById(`player-${id}`);
  if(el){el.style.left=`${position.x}px`;el.style.top=`${position.y}px`;}
  if(id===socket.id){
    const wrap=document.getElementById('gameCanvas');const world=document.getElementById('gameWorld');
    if(!wrap||!world)return;
    const vw=wrap.clientWidth,vh=wrap.clientHeight,mw=world._mapW||1600,mh=world._mapH||1000;
    let cx=position.x+24-vw/2,cy=position.y+24-vh/2;
    cx=Math.max(0,Math.min(cx,mw-vw)); cy=Math.max(0,Math.min(cy,mh-vh));
    world.style.transform=`translate(${-cx}px,${-cy}px)`;
  }
});
socket.on('tag',({from,to,headStartMs})=>{
  Audio.play('sfxTag',0.6);
  const fromEl=document.getElementById(`player-${from}`);
  if(fromEl){fromEl.classList.remove('tagged-ring');fromEl.style.border='2px solid rgba(255,255,255,0.25)';
    fromEl.style.animation='headStartGlow 0.7s ease-out 4';
    setTimeout(()=>{if(fromEl)fromEl.style.animation='';},headStartMs);}
  const toEl=document.getElementById(`player-${to}`);
  if(toEl){toEl.classList.add('tagged-ring');toEl.style.border='3px solid white';setTimeout(()=>toEl.classList.remove('tagged-ring'),600);}
  const st=document.getElementById('playerStatus');
  if(to===socket.id){st.innerText='IT';st.style.color='#ff4444';clearInterval(headStartInterval);}
  else if(from===socket.id)showHeadStart(headStartMs);
});
socket.on('padActivated',({playerId,padType})=>{
  const av=document.getElementById(`player-${playerId}`);if(!av)return;
  if(padType==='speed'){av.style.boxShadow='0 0 28px #facc15';setTimeout(()=>{if(av)av.style.boxShadow='';},2000);}
  if(playerId===socket.id)showEffectBanner('padSpeed');
});
socket.on('powerupCollected',({powerupId,playerId,type})=>{
  const el=powerupEls[powerupId];if(el)el.style.display='none';
  if(playerId===socket.id){showEffectBanner(type);const av=document.getElementById(`player-${socket.id}`);if(av){const v=PU_VIS[type];av.style.outline=`3px solid ${v?.color||'#fff'}`;}}
});
socket.on('powerupExpired',({playerId})=>{if(playerId===socket.id){const av=document.getElementById(`player-${socket.id}`);if(av)av.style.outline='';}});
socket.on('powerupRespawned',({powerupId})=>{const el=powerupEls[powerupId];if(el)el.style.display='';});
socket.on('gameEnd',players=>{
  Audio.fadeBg(1500); switchScreen('resultsScreen');
  const t=STRINGS[currentLang];const rt=document.getElementById('resultsTable');rt.innerHTML='';
  if(!Array.isArray(players)||players.length===0){
    document.getElementById('resultTitle').innerText='GAME OVER';
    document.getElementById('resultTitle').style.color='#ff4444';return;
  }
  players.forEach(p=>{p.taggedTime=typeof p.taggedTime==='number'?p.taggedTime:0;});
  players.sort((a,b)=>a.taggedTime-b.taggedTime);
  const winner=players[0];const medals=['🥇','🥈','🥉','💀'];
  players.forEach((p,i)=>{
    const hex=colors.find(c=>c.name===p.color)?.bg||'#888';const isMe=p.id===socket.id;const isTop=i===0;
    const div=document.createElement('div');
    div.style.cssText=`display:flex;justify-content:space-between;align-items:center;padding:14px 12px;margin:4px 0;border-radius:10px;
      border:1px solid ${isTop?'#00ff88':'rgba(255,255,255,0.08)'};background:${isTop?'rgba(0,255,136,0.07)':isMe?'rgba(255,255,255,0.04)':'transparent'};`;
    div.innerHTML=`<div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:22px;min-width:28px">${medals[i]||'#'+(i+1)}</span>
      <div style="width:30px;height:30px;border-radius:50%;background:${hex};box-shadow:0 0 10px ${hex}88;flex-shrink:0"></div>
      <div><span style="font-weight:700;font-size:17px;color:${isMe?hex:'#fff'}">${p.name}${isMe?' '+t.you:''}</span>
      ${isTop?`<div style="font-size:11px;color:#00ff88;font-weight:600;letter-spacing:1px">${t.leastTagged}</div>`:''}</div></div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:700;font-family:'Orbitron',sans-serif;color:${isTop?'#00ff88':'rgba(255,255,255,0.7)'}">${p.taggedTime.toFixed(1)}s</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.3)">${t.asIt}</div></div>`;
    rt.appendChild(div);
  });
  const me=players.find(p=>p.id===socket.id);const isWinner=me&&winner.id===me.id;
  const titleEl=document.getElementById('resultTitle');
  titleEl.innerText=isWinner?'YOU WIN! 🏆':'GAME OVER';
  titleEl.style.color=isWinner?'#00ff88':'#ff4444';
  setTimeout(()=>Audio.play(isWinner?'sfxWin':'sfxLose',0.8),400);
});

// ─── Movement ─────────────────────────────────────────────────────────────────
const keysMap={up:['ArrowUp','w','W'],down:['ArrowDown','s','S'],left:['ArrowLeft','a','A'],right:['ArrowRight','d','D']};
function isTyping(e){const t=e.target.tagName;return t==='INPUT'||t==='TEXTAREA'||e.target.isContentEditable;}
document.addEventListener('keydown',e=>{if(isTyping(e))return;for(const d in keysMap)if(keysMap[d].includes(e.key)){e.preventDefault();keyState[d]=true;}});
document.addEventListener('keyup',  e=>{if(isTyping(e))return;for(const d in keysMap)if(keysMap[d].includes(e.key))keyState[d]=false;});
['up','down','left','right'].forEach(dir=>{
  const btn=document.getElementById(`${dir}Btn`);
  btn.addEventListener('touchstart',e=>{e.preventDefault();keyState[dir]=true;});
  btn.addEventListener('touchend',  e=>{e.preventDefault();keyState[dir]=false;});
  btn.addEventListener('mousedown', ()=>keyState[dir]=true);
  btn.addEventListener('mouseup',   ()=>keyState[dir]=false);
  btn.addEventListener('mouseleave',()=>keyState[dir]=false);
});
setInterval(()=>{if(!currentLobby||spActive)return;for(const d in keyState)if(keyState[d])socket.emit('move',currentLobby,d);},50);

// ─── Nav ──────────────────────────────────────────────────────────────────────
document.getElementById('leaveLobbyBtn').onclick=()=>{
  socket.emit('leaveLobby',currentLobby);Audio.stopBg();Audio.playMenu();
  switchScreen('mainMenu');currentLobby='';isHost=false;
};
document.getElementById('spMenuBtn').onclick=()=>{
  clearInterval(spInterval); clearInterval(spCountdownInterval);
  spActive=false; Audio.stopSp(); Audio.playMenu();
  const spMenuBtnEl=document.getElementById('spMenuBtn');
  if(spMenuBtnEl)spMenuBtnEl.style.display='none';
  switchScreen('mainMenu'); currentLobby=''; isHost=false;
};
document.getElementById('playAgainBtn').onclick=()=>{
  clearInterval(spInterval);clearInterval(spCountdownInterval);
  spActive=false;Audio.stopSp();Audio.playMenu();
  switchScreen('mainMenu');currentLobby='';isHost=false;
};
function switchScreen(id){
  ['mainMenu','spMapScreen','lobbyScreen','gameScreen','resultsScreen'].forEach(s=>{
    const el=document.getElementById(s);if(el)el.classList.add('hidden');
  });
  const el=document.getElementById(id);if(el)el.classList.remove('hidden');
}
socket.on('error',msg=>alert('Error: '+msg));

// ─── DOMContentLoaded ─────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  buildSpMapSelect();

  // Single player button wiring
  const spBtn=document.getElementById('singlePlayerBtn');
  if(spBtn)spBtn.onclick=()=>{
    myPlayer.name=document.getElementById('playerNameInput').value.trim()||'Player';
    if(!myPlayer.color)myPlayer.color='cyan';
    switchScreen('spMapScreen');
  };
  document.getElementById('spBackBtn')?.addEventListener('click',()=>switchScreen('mainMenu'));

  // Settings button
  const settingsBtn=document.createElement('button'); settingsBtn.id='settingsBtn'; settingsBtn.innerText='⚙️';
  settingsBtn.style.cssText=`position:fixed;top:14px;right:14px;z-index:999;
    background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
    color:#fff;font-size:20px;width:42px;height:42px;border-radius:10px;
    cursor:pointer;backdrop-filter:blur(6px);transition:background .2s;`;
  settingsBtn.onmouseover=()=>settingsBtn.style.background='rgba(255,255,255,0.18)';
  settingsBtn.onmouseout =()=>settingsBtn.style.background='rgba(255,255,255,0.08)';
  document.body.appendChild(settingsBtn);

  const panel=document.createElement('div'); panel.id='settingsPanel';
  panel.style.cssText=`display:none;position:fixed;top:60px;right:14px;z-index:998;
    background:rgba(10,14,39,0.97);border:1px solid rgba(255,255,255,0.15);
    border-radius:16px;padding:20px 24px;min-width:240px;backdrop-filter:blur(12px);box-shadow:0 8px 32px rgba(0,0,0,0.5);`;
  panel.innerHTML=`<div style="font-family:'Orbitron',sans-serif;font-size:13px;font-weight:700;color:#00ff88;margin-bottom:16px;letter-spacing:1px;">⚙️ SETTINGS</div>
    <div style="margin-bottom:14px;"><label style="font-size:13px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;">🎵 Menu Music</label>
    <input type="range" id="menuVolSlider" min="0" max="100" value="30" style="width:100%;accent-color:#00ff88;cursor:pointer;">
    <div style="text-align:right;font-size:11px;color:rgba(255,255,255,0.4)"><span id="menuVolVal">30</span>%</div></div>
    <div style="margin-bottom:14px;"><label style="font-size:13px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;">🎮 Game Music</label>
    <input type="range" id="bgVolSlider" min="0" max="100" value="35" style="width:100%;accent-color:#00ff88;cursor:pointer;">
    <div style="text-align:right;font-size:11px;color:rgba(255,255,255,0.4)"><span id="bgVolVal">35</span>%</div></div>
    <div><label style="font-size:13px;color:rgba(255,255,255,0.6);display:block;margin-bottom:6px;">🤖 Single Player Music</label>
    <input type="range" id="spVolSlider" min="0" max="100" value="35" style="width:100%;accent-color:#2dd4bf;cursor:pointer;">
    <div style="text-align:right;font-size:11px;color:rgba(255,255,255,0.4)"><span id="spVolVal">35</span>%</div></div>`;
  document.body.appendChild(panel);

  settingsBtn.onclick=e=>{e.stopPropagation();panel.style.display=panel.style.display==='none'?'block':'none';};
  document.addEventListener('click',()=>{panel.style.display='none';});
  panel.addEventListener('click',e=>e.stopPropagation());
  document.getElementById('menuVolSlider').addEventListener('input',function(){
    document.getElementById('menuVolVal').innerText=this.value;
    const el=document.getElementById('menuMusic');if(el)el.volume=this.value/100;
  });
  document.getElementById('bgVolSlider').addEventListener('input',function(){
    document.getElementById('bgVolVal').innerText=this.value;
    const el=document.getElementById('bgMusic');if(el)el.volume=this.value/100;
  });
  document.getElementById('spVolSlider').addEventListener('input',function(){
    document.getElementById('spVolVal').innerText=this.value;
    const el=document.getElementById('spMusic');if(el)el.volume=this.value/100;
  });

  // Lang button
  const btn=document.createElement('button'); btn.id='langBtn'; btn.innerText='🇪🇸 Español';
  btn.style.cssText=`position:fixed;top:14px;left:14px;z-index:999;
    background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);
    color:#fff;font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;
    padding:8px 14px;border-radius:10px;cursor:pointer;backdrop-filter:blur(6px);transition:background .2s;`;
  btn.onmouseover=()=>btn.style.background='rgba(255,255,255,0.18)';
  btn.onmouseout =()=>btn.style.background='rgba(255,255,255,0.08)';
  btn.onclick=()=>applyLang(currentLang==='en'?'es':'en');
  document.body.appendChild(btn);
  applyLang('en');
});
