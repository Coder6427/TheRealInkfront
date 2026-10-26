/* Same-origin accounts + private online rooms. No credentials in browser storage. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const ui = Object.fromEntries(['accountDialog','onlineDialog','accountLabel','authTabs','authForm','authUsername','authPassword','authSubmit','authMessage','accountProfile','profileName','profileStats','loginTab','signupTab','onlineGate','onlineGateText','onlineSignInBtn','onlineHome','roomLobby','connectionStatus','onlineMessage','roomCode','roomRules','roomVolt','roomFlare','onlineLoadout','roomTeam','roomCharacter','onlineHeroDetail','onlineUpgradeChoices','readyRoomBtn','startRoomBtn','returnMatchBtn','reopenRoomBtn','roomHint','networkBadge'].map(id=>[id,$(id)]));
  const net = { user:null, available:false, authRevision:0, ws:null, room:null, match:null, signup:false, menu:false,
    reconnectTimer:null, reconnectAttempts:0, intentionalClose:false, seq:0, lastSend:0,lastSnapshot:0,lastPing:0,ping:null,
    pending:{dash:false,secondary:false,special:false}, requestOnline:false, wasPlaying:false, lastFocus:null };
  const hosted = ['http:','https:'].includes(location.protocol);
  const escape = value => String(value ?? '').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const status = (message,success=false,auth=false) => {
    const target=auth?ui.authMessage:ui.onlineMessage;
    target.textContent=message; target.classList.toggle('success',success);
  };
  const hasDialog=()=>!ui.accountDialog.hidden||!ui.onlineDialog.hidden||net.menu;
  const connected=()=>net.ws?.readyState===WebSocket.OPEN;
  function send(data) {
    if(!connected()) { status('Connecting to the server. Please try again in a moment.'); return false; }
    net.ws.send(JSON.stringify(data)); return true;
  }
  async function api(path,body) {
    const response=await fetch(path,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json().catch(()=>({error:'This copy does not have the online server running.'}));
    if(!response.ok) throw new Error(data.error || 'The request could not be completed.');
    return data;
  }
  function showDialog(id) {
    net.lastFocus=document.activeElement;
    if(!state.online&&state.mode==='playing') { net.wasPlaying=true; togglePause(true); }
    clearHeldControls();
    ui.accountDialog.hidden=id!=='account'; ui.onlineDialog.hidden=id!=='online';
    const dialog=id==='account'?ui.accountDialog:ui.onlineDialog;
    setTimeout(()=>dialog.querySelector('button:not([hidden])')?.focus(),0);
  }
  function hideDialogs() {
    ui.accountDialog.hidden=ui.onlineDialog.hidden=true;
    if(state.online) { net.menu=false; dom.pause.hidden=true; }
    else if(net.wasPlaying&&state.mode==='paused') { net.wasPlaying=false; togglePause(false); }
    clearHeldControls();
    (net.lastFocus?.isConnected?net.lastFocus:canvas).focus({preventScroll:true});
  }
  function renderAccount() {
    ui.accountLabel.textContent=net.user?.username || 'Sign in';
    $('accountBtn').setAttribute('aria-label',net.user?`Account: ${net.user.username}`:'Sign in or create an account');
    ui.accountProfile.hidden=!net.user;
    ui.authForm.hidden=Boolean(net.user); ui.authTabs.hidden=Boolean(net.user);
    $('accountTitle').textContent=net.user?'Your player account.':net.signup?'Make your mark.':'Welcome to the squad.';
    if(net.user) {
      ui.profileName.textContent=net.user.username;
      ui.profileStats.textContent=`${net.user.matches} online matches · ${net.user.wins} wins`;
    }
    ui.loginTab.classList.toggle('selected',!net.signup); ui.signupTab.classList.toggle('selected',net.signup);
    ui.authSubmit.textContent=net.signup?'Create account':'Sign in';
    ui.authPassword.autocomplete=net.signup?'new-password':'current-password';
  }
  function openAccount() { renderAccount();status('',false,true);showDialog('account');void refreshAccount(); }
  function openOnline() {
    net.requestOnline=true;
    showDialog('online'); renderRoom();
    if(net.user&&net.available) connect();
  }
  function connectionLabel(text) {
    ui.connectionStatus.textContent=text;
    if(state.online) ui.networkBadge.textContent=text;
  }
  function renderRoom() {
    const canPlay=net.user&&net.available;
    ui.onlineGate.hidden=Boolean(canPlay);
    ui.onlineHome.hidden=!canPlay||Boolean(net.room);
    ui.roomLobby.hidden=!canPlay||!net.room;
    if(!canPlay) {
      ui.onlineGateText.textContent=!hosted||!net.available
        ? 'This is an offline copy. Online play and accounts need the included Node server. Open the game at its Render Web Service URL, or run npm start locally and visit http://127.0.0.1:3000. Offline battles still work here.'
        : 'Sign in or create a free player account, then create a room or join a friend. Offline play never requires an account.';
      ui.onlineSignInBtn.hidden=!net.available;
      return;
    }
    if(!net.room) return;
    const room=net.room,me=room.members.find(m=>m.id===net.user.id);
    if(!me) return;
    const waiting=room.phase==='lobby',host=room.hostId===net.user.id;
    ui.roomCode.textContent=room.code;
    ui.roomRules.textContent=`${room.config.teamSize}v${room.config.teamSize} · ${MATCH_MODES[room.config.matchMode].label}\n${MAPS[room.config.mapChoice]?.name||'Random map'} · ${DIFFICULTY[room.config.difficulty].label} BOTS`;
    for(const [team,target] of [[1,ui.roomVolt],[2,ui.roomFlare]]) {
      const members=room.members.filter(m=>m.team===team);
      target.innerHTML=members.map(m=>`<div class="room-member"><span><strong>${escape(m.username)}${m.id===net.user.id?' · YOU':''}${m.id===room.hostId?' ♔':''}</strong><small>${CHARACTERS[m.characterId].name} · ${escape(UPGRADES.find(u=>u.id===m.upgradeId)?.name||'Choosing upgrade')}</small></span><b>${!m.connected?'RECONNECTING':waiting?(m.ready?'READY':'CHOOSING'):'ONLINE'}</b></div>`).join('')+Array.from({length:room.config.teamSize-members.length},()=>'<div class="room-member bot-slot"><span>AI teammate<small>Replaced when a friend joins</small></span><b>BOT</b></div>').join('');
    }
    ui.onlineLoadout.hidden=!waiting;
    ui.roomTeam.value=String(me.team);
    ui.roomCharacter.innerHTML=Object.entries(CHARACTERS).map(([id,hero])=>`<option value="${id}" ${room.members.some(m=>m.id!==me.id&&m.team===me.team&&m.characterId===id)?'disabled':''}>${hero.name} · ${ROLE_DATA[hero.role].label}</option>`).join('');
    ui.roomCharacter.value=me.characterId;
    const hero=CHARACTERS[me.characterId];
    ui.onlineHeroDetail.textContent=`${hero.name} · Secondary: ${hero.secondary} · Special: ${hero.special}`;
    ui.onlineUpgradeChoices.innerHTML='';
    for(const id of room.offers) {
      const upgrade=UPGRADES.find(u=>u.id===id);
      const button=document.createElement('button');
      button.type='button';button.className=`online-upgrade${me.upgradeId===id?' selected':''}`;
      button.setAttribute('aria-pressed',String(me.upgradeId===id));
      button.innerHTML=`<strong>${upgrade.name}</strong><small>${upgrade.stat}</small>`;
      button.addEventListener('click',()=>changeLoadout({upgradeId:id}));
      ui.onlineUpgradeChoices.append(button);
    }
    ui.readyRoomBtn.hidden=!waiting;ui.startRoomBtn.hidden=!waiting||!host;
    ui.readyRoomBtn.disabled=!me.upgradeId||!connected();
    ui.readyRoomBtn.textContent=me.ready?'✓ Ready · undo':'Ready up';
    ui.startRoomBtn.disabled=!connected()||!room.members.every(m=>m.ready&&m.connected);
    ui.returnMatchBtn.hidden=room.phase!=='playing';
    ui.reopenRoomBtn.hidden=room.phase!=='ended'||!host;
    ui.roomHint.textContent=waiting?'Everyone chooses an upgrade and readies up. The room leader deploys. Invite friends before starting; bots fill the remaining slots.':room.phase==='playing'?'The match keeps running while this menu is open. A lost connection gives control to a bot; reconnect within 90 seconds to return.':host?'Round finished. Open a new lobby for another upgrade draft.':'Waiting for the room leader to open the next round.';
  }
  function changeLoadout(change) {
    const me=net.room?.members.find(m=>m.id===net.user.id);
    if(!me) return;
    let characterId=change.characterId||me.characterId;
    const team=change.team||me.team;
    if(team!==me.team&&net.room.members.some(m=>m.id!==me.id&&m.team===team&&m.characterId===characterId))
      characterId=Object.keys(CHARACTERS).find(id=>!net.room.members.some(m=>m.id!==me.id&&m.team===team&&m.characterId===id));
    send({type:'loadout',team,characterId,upgradeId:change.upgradeId||me.upgradeId});
  }
  function stopConnection() {
    net.intentionalClose=true;clearTimeout(net.reconnectTimer);net.reconnectTimer=null;
    net.ws?.close();net.ws=null;
    connectionLabel('OFFLINE');
  }
  function connect() {
    if(!net.user||!net.available||net.ws?.readyState===WebSocket.CONNECTING||connected()) return;
    net.intentionalClose=false;
    const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/socket`);
    net.ws=ws;connectionLabel(net.reconnectAttempts?'RECONNECTING…':'CONNECTING…');
    ws.addEventListener('open',()=>{
      if(net.ws!==ws)return;
      net.reconnectAttempts=0;net.seq=0;net.lastPing=0;
      connectionLabel('CONNECTED');status('');renderRoom();
    });
    ws.addEventListener('message',event=>{
      if(net.ws!==ws)return;
      let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.type==='hello') {
        net.user=data.user;renderAccount();
        if(!data.roomCode&&net.room) {
          net.room=null;net.match=null;state.online=false;net.menu=false;ui.networkBadge.hidden=true;
          restoreOfflineUI();setSetupStep('match');openOnline();status('Your previous room closed, possibly after a server restart. Create or join a new room.');
        }
      }
      else if(data.type==='room') {
        const previous=net.room?.phase;
        net.room=data.room;renderRoom();
        if(data.room.phase==='lobby'&&(state.online||previous==='ended')) {
          state.online=false;net.match=null;state.mode='lobby';dom.hud.classList.remove('visible');dom.result.hidden=true;dom.pause.hidden=true;
          ui.networkBadge.hidden=true;setSetupStep('match');showDialog('online');
        }
      } else if(data.type==='match') beginOnlineMatch(data.match);
      else if(data.type==='snapshot') applySnapshot(data);
      else if(data.type==='finished') showOnlineResults(data.result);
      else if(data.type==='left') {
        net.room=null;net.match=null;state.online=false;net.menu=false;ui.networkBadge.hidden=true;
        dom.pause.hidden=dom.result.hidden=true;restoreOfflineUI();setSetupStep('match');renderRoom();
        if(!ui.onlineDialog.hidden) showDialog('online');
      } else if(data.type==='error') status(data.message);
      else if(data.type==='pong'&&Number.isFinite(data.at)) {
        net.ping=Math.max(0,Math.round(performance.now()-data.at));
        connectionLabel(`ONLINE · ${net.ping} ms${net.room?` · ${net.room.code}`:''}`);
      }
    });
    ws.addEventListener('error',()=>status('Connection interrupted. Trying to reconnect…'));
    ws.addEventListener('close',event=>{
      if(net.ws!==ws)return;
      net.ws=null;clearHeldControls();renderRoom();
      if(net.intentionalClose)return;
      if(event.code===4001||event.code===4003) {
        connectionLabel('SIGNED OUT');
        net.room=null;net.match=null;
        if(event.code===4003)net.user=null;
        if(state.online) { state.online=false;net.menu=false;state.mode='lobby';restoreOfflineUI();setSetupStep('match');ui.networkBadge.hidden=true;showDialog('online'); }
        renderAccount();renderRoom();
        status(event.code===4001?'This account is playing in another tab. Close that tab before reconnecting.':'Your session ended. Sign in again.');
        return;
      }
      connectionLabel('RECONNECTING…');
      const delay=Math.min(15000,700*2**Math.min(net.reconnectAttempts++,5))+Math.random()*400;
      net.reconnectTimer=setTimeout(async()=>{
        try {
          const session=await api('/api/me');
          if(!session.user){net.user=null;net.room=null;net.match=null;state.online=false;state.mode='lobby';ui.networkBadge.hidden=true;restoreOfflineUI();setSetupStep('match');renderAccount();connectionLabel('SIGN IN AGAIN');openOnline();return;}
          net.user=session.user;connect();
        }catch{connect();}
      },delay);
    });
  }
  function beginOnlineMatch(match) {
    restoreOfflineUI();
    net.match=match;net.menu=false;net.pending={dash:false,secondary:false,special:false};
    Object.assign(state,{online:true,mode:'playing',teamSize:match.teamSize,matchMode:match.matchMode,difficulty:match.difficulty,
      activeMap:match.activeMap,layoutSeed:match.layoutSeed,layoutVariant:match.layoutVariant,playerTeam:match.playerTeam,
      countdown:3.2,overtime:false,lockTargetId:null,particles:[],texts:[],effects:[],projectiles:[]});
    configureArena();
    state.agents=match.roster.map(info=>({...info,isPlayer:info.id===match.me,x:TEAM[info.team].spawnX,y:TEAM[info.team].spawnY,
      vx:0,vy:0,radius:20,angle:info.team===1?0:Math.PI,hp:100,maxHp:100,ammo:100,alive:false,respawn:0,
      shield:0,dashCd:0,dashTime:0,secondaryCd:0,specialCharge:25,overdrive:0,slowTime:0,
      path:[],target:null,utilities:{},intent:'support',intentLabel:info.username?'HUMAN TEAMMATE':'SCANNING',paintContribution:0,damageContribution:0}));
    state.player=state.agents.find(a=>a.id===match.me);
    state.characterId=state.player.characterId;state.upgradeId=state.player.upgradeId;
    state.camera.x=state.player.x;state.camera.y=state.player.y;state.camera.followId=match.me;
    for(const team of TEAM_IDS)state.vision[team].clear();
    buildRosters();
    dom.playerName.textContent=`${net.user.username} // ${state.player.name}`;dom.playerName.style.color=TEAM[match.playerTeam].color;
    dom.formatBadge.textContent=`ONLINE · ${match.teamSize}v${match.teamSize} · ${MAPS[match.activeMap].name}`;
    dom.difficultyBadge.textContent='LIVE SQUAD';dom.minimapMode.textContent=MATCH_MODES[match.matchMode].short;
    dom.start.hidden=dom.pause.hidden=dom.result.hidden=true;dom.hud.classList.add('visible');
    ui.accountDialog.hidden=ui.onlineDialog.hidden=true;ui.networkBadge.hidden=false;
    net.lastSnapshot=performance.now();clearHeldControls();updateViewTransform(true);canvas.focus({preventScroll:true});
  }
  function applySnapshot(snapshot) {
    if(!state.online||!net.match)return;
    net.lastSnapshot=performance.now();
    Object.assign(state,{time:snapshot.time,countdown:snapshot.countdown,overtime:snapshot.overtime,
      paintCounts:snapshot.paintCounts,modeScores:snapshot.modeScores,zones:snapshot.zones,
      effects:snapshot.effects,projectiles:snapshot.projectiles,lockTargetId:snapshot.lockTargetId});
    if(snapshot.paint) {
      const bytes=atob(snapshot.paint);
      if(bytes.length===state.paint.length)for(let i=0;i<bytes.length;i++)state.paint[i]=bytes.charCodeAt(i);
    }
    for(const info of snapshot.rosterStatus) {
      const agent=state.agents.find(a=>a.id===info.id);if(agent)agent.alive=info.alive;
    }
    state.vision[state.playerTeam]=new Set(snapshot.vision);
    for(const info of snapshot.agents) {
      const agent=state.agents.find(a=>a.id===info.id);if(!agent)continue;
      if(info.id===state.player.id&&agent.netTarget) {
        if(info.shotsFired>agent.shotsFired)sound.shot(true);
        if(info.dashTime>0&&agent.dashTime<=0)sound.dash();
        if(info.hp<agent.hp&&info.alive){sound.hit();state.flash=0.35;}
        if(!info.alive&&agent.alive)sound.down();
        if(info.secondaryUses>agent.secondaryUses)sound.tone(390,0.12,'triangle',0.035,190);
        if(info.specialUses>agent.specialUses)sound.tone(180,0.32,'sawtooth',0.03,620);
      }
      const previous={x:agent.x,y:agent.y,angle:agent.angle};
      const snap=!agent.netTarget||!agent.alive||Math.hypot(info.x-agent.x,info.y-agent.y)>160;
      Object.assign(agent,info);
      agent.netTarget={x:info.x,y:info.y,angle:info.angle};
      if(!snap) Object.assign(agent,previous);
    }
    if(!snapshot.ended)state.mode='playing';
    updateHUD();
  }
  function showOnlineResults(result) {
    if(!state.online)return;
    net.menu=false;clearHeldControls();ui.accountDialog.hidden=ui.onlineDialog.hidden=true;
    state.mode='playing';finishMatch();
    dom.resultSummary.textContent=result.winner===state.playerTeam?'Your squad won the online round. Return to the room for a fresh upgrade draft.':result.winner?'Your rivals took this round. Regroup in the room and try a new loadout.':'A dead-even online finish. Regroup in the room for another round.';
    dom.rematch.textContent='Return to room';dom.setup.textContent='Leave online room';
    dom.pause.hidden=true;
    void api('/api/me').then(data=>{if(data.user){net.user=data.user;renderAccount();}}).catch(()=>{});
  }
  function restoreOfflineUI() {
    dom.rematch.textContent='Play again';dom.setup.textContent='Change match settings';
    dom.restartPause.textContent='Restart with a new upgrade';
    const kicker=dom.pause.querySelector('.eyebrow');if(kicker)kicker.textContent='MATCH PAUSED';
    const title=dom.pause.querySelector('h2');if(title)title.textContent='Take a breath.';
    const note=dom.pause.querySelector('p');if(note)note.textContent='Your squad will continue where you left off.';
  }
  function toggleMenu(force) {
    if(!state.online||state.mode==='ended')return;
    net.menu=typeof force==='boolean'?force:!net.menu;
    clearHeldControls();dom.pause.hidden=!net.menu;
    if(net.menu) {
      dom.pause.querySelector('.eyebrow').textContent='ONLINE MATCH · STILL LIVE';
      dom.pause.querySelector('h2').textContent='Stay in the action.';
      dom.pause.querySelector('p').textContent='Online matches cannot pause. Return to play, or open your room to leave.';
      dom.restartPause.textContent='Open room / leave match';
    }
  }
  function frame(dt) {
    if(!state.online||!state.player)return;
    const now=performance.now();
    state.flash=Math.max(0,state.flash-dt*2.5);
    state.shake=Math.max(0,state.shake-dt*22);
    for(const agent of state.agents)if(agent.netTarget) {
      const factor=clamp(dt*26,0,1);
      agent.x=lerp(agent.x,agent.netTarget.x,factor);agent.y=lerp(agent.y,agent.netTarget.y,factor);
      agent.angle+=angleDelta(agent.angle,agent.netTarget.angle)*factor;
    }
    if(state.mode==='playing') {
      const command=readPlayerCommand(state.player);
      const blocked=hasDialog()||document.hidden||state.countdown>0||!state.player.alive;
      if(blocked){Object.assign(command,{mx:0,my:0,fire:false,dash:false,secondary:false,special:false});net.pending={dash:false,secondary:false,special:false};}
      for(const key of ['dash','secondary','special'])net.pending[key] ||= command[key];
      if(connected()&&now-net.lastSend>=33) {
        net.lastSend=now;
        send({type:'input',seq:++net.seq,...command,...net.pending});
        net.pending={dash:false,secondary:false,special:false};
      }
      updateCamera(dt);
    }
    if(connected()&&now-net.lastPing>5000) {net.lastPing=now;send({type:'ping',at:now});}
    if(now-net.lastSnapshot>1500&&state.mode==='playing')ui.networkBadge.textContent='CONNECTION SLOW · WAITING FOR SERVER';
  }
  async function refreshAccount() {
    if(!hosted)return;
    const revision=net.authRevision;
    try{const data=await api('/api/me');if(revision!==net.authRevision)return;net.available=true;net.user=data.user;renderAccount();renderRoom();}
    catch{if(revision!==net.authRevision)return;net.available=false;renderRoom();}
  }
  $('onlineBtn').addEventListener('click',openOnline);$('onlineSetupBtn').addEventListener('click',openOnline);
  $('accountBtn').addEventListener('click',openAccount);$('profileOnlineBtn').addEventListener('click',openOnline);
  ui.onlineSignInBtn.addEventListener('click',()=>{net.requestOnline=true;openAccount();});
  document.querySelectorAll('[data-close-network]').forEach(button=>button.addEventListener('click',hideDialogs));
  ui.loginTab.addEventListener('click',()=>{net.signup=false;status('',false,true);renderAccount();});
  ui.signupTab.addEventListener('click',()=>{net.signup=true;status('',false,true);renderAccount();});
  ui.authForm.addEventListener('submit',async event=>{
    net.authRevision++;
    event.preventDefault();ui.authSubmit.disabled=true;status('Connecting…',true,true);
    try{
      if(!hosted)throw new Error('Accounts are available at the game’s Render URL, or with npm start locally.');
      const data=await api(net.signup?'/api/signup':'/api/login',{username:ui.authUsername.value.trim(),password:ui.authPassword.value});
      net.available=true;net.user=data.user;ui.authPassword.value='';renderAccount();status('Signed in. Your squad is waiting.',true,true);
      if(net.requestOnline)openOnline();
    }catch(error){status(error.message,false,true);}finally{ui.authSubmit.disabled=false;}
  });
  $('logoutBtn').addEventListener('click',async()=>{
    net.authRevision++;
    try{
      await api('/api/logout',{});stopConnection();net.user=null;net.room=null;net.match=null;state.online=false;net.menu=false;
      ui.networkBadge.hidden=true;dom.pause.hidden=dom.result.hidden=true;restoreOfflineUI();setSetupStep('match');renderAccount();renderRoom();status('Signed out.',true,true);
    }catch(error){status(error.message,false,true);}
  });
  $('passwordForm').addEventListener('submit',async event=>{
    net.authRevision++;
    event.preventDefault();$('passwordSubmit').disabled=true;
    try{
      await api('/api/password',{currentPassword:$('currentPassword').value,password:$('newPassword').value});
      $('currentPassword').value=$('newPassword').value='';
      stopConnection();net.room=null;net.match=null;state.online=false;ui.networkBadge.hidden=true;restoreOfflineUI();setSetupStep('match');
      await refreshAccount();
      status('Password updated. Other sessions are signed out. You can join a new room.',true,true);
    }catch(error){status(error.message,false,true);}finally{$('passwordSubmit').disabled=false;}
  });
  $('createRoomForm').addEventListener('submit',event=>{event.preventDefault();status('');send({type:'create',config:{teamSize:Number($('onlineSize').value),matchMode:$('onlineMode').value,mapChoice:$('onlineMap').value,difficulty:$('onlineDifficulty').value}});});
  $('joinRoomForm').addEventListener('submit',event=>{event.preventDefault();status('');send({type:'join',code:$('joinCode').value});});
  $('roomTeam').addEventListener('change',()=>changeLoadout({team:Number(ui.roomTeam.value)}));
  $('roomCharacter').addEventListener('change',()=>changeLoadout({characterId:ui.roomCharacter.value}));
  ui.readyRoomBtn.addEventListener('click',()=>{status('');send({type:'ready'});});
  ui.startRoomBtn.addEventListener('click',()=>{status('');send({type:'start'});});
  $('leaveRoomBtn').addEventListener('click',()=>send({type:'leave'}));
  ui.returnMatchBtn.addEventListener('click',hideDialogs);
  ui.reopenRoomBtn.addEventListener('click',()=>{status('');send({type:'rematch'});});
  $('copyRoomBtn').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(net.room.code);status('Room code copied. Send it to a friend with this website’s URL.',true);}
    catch{status(`Your room code is ${net.room.code}. Select and copy it above.`,true);}
  });
  // Capture these existing local controls before their offline handlers run.
  for(const button of [dom.rematch,dom.setup,dom.restartPause])button.addEventListener('click',event=>{
    if(!state.online)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(button===dom.setup)send({type:'leave'});
    else {dom.result.hidden=dom.pause.hidden=true;openOnline();}
  },true);
  document.addEventListener('keydown',event=>{
    if(!hasDialog())return;
    if(event.code==='Escape') {event.preventDefault();event.stopImmediatePropagation();hideDialogs();return;}
    if(event.code==='Tab') {
      const dialog=!ui.accountDialog.hidden?ui.accountDialog:!ui.onlineDialog.hidden?ui.onlineDialog:dom.pause;
      const elements=[...dialog.querySelectorAll('button,input,select,summary,[tabindex]')].filter(element=>!element.disabled&&element.getClientRects().length);
      const first=elements[0],last=elements.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
  globalThis.InkfrontOnline={frame,toggleMenu,hasDialog,openOnline};
  void refreshAccount();
})();
