// DOM/unit integration, not a visual browser test. Real HTTP + WebSocket backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';
import { Window } from 'happy-dom';
import WebSocket from 'ws';
import { createApp } from '../server/index.mjs';

const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
const source=(await Promise.all(['arsenal.js','game.js','tutorial.js','online.js'].map(name=>readFile(new URL(`../dist/${name}`,import.meta.url),'utf8')))).join('\n');
async function until(check,label,timeout=6000) {
  const start=Date.now();
  while(Date.now()-start<timeout){if(check())return;await wait(20);}
  assert.fail(`Timed out: ${label}`);
}
function makeClient(origin, { firstVisit = false, touch = false, savedTutorial = null, brokenStorage = false } = {}) {
  const win=new Window({url:origin,width:1200,height:800,settings:{disableJavaScriptFileLoading:true,disableCSSFileLoading:true}});
  const errors=[];let cookie='';const sockets=[];
  win.addEventListener('error',event=>errors.push(event.error));
  win.document.write(html);
  const drawing=new Proxy({measureText:text=>({width:String(text).length*8}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},
    {get:(object,key)=>object[key]||(()=>{}),set:(object,key,value)=>{object[key]=value;return true;}});
  win.HTMLCanvasElement.prototype.getContext=()=>drawing;
  win.HTMLElement.prototype.getBoundingClientRect=()=>({left:0,top:0,width:1200,height:800,right:1200,bottom:800});
  win.HTMLElement.prototype.setPointerCapture=()=>{};
  win.requestAnimationFrame=()=>0;
  win.matchMedia=query=>({matches:touch && ['(pointer: coarse)','(hover: none)'].includes(query)});
  if (!firstVisit) win.localStorage.setItem('inkfront-tutorial',savedTutorial || JSON.stringify({version:'1',result:'completed'}));
  if (brokenStorage) {
    Object.defineProperty(win,'localStorage',{get(){throw new Error('Storage disabled');}});
  }
  win.fetch=async(path,init={})=>{
    const response=await fetch(new URL(path,origin),{...init,headers:{...init.headers,Origin:origin,Cookie:cookie}});
    const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0];
    return response;
  };
  win.WebSocket=class extends WebSocket {constructor(url){super(url,{headers:{Origin:origin,Cookie:cookie}});sockets.push(this);}};
  const context=vm.createContext(win);
  vm.runInContext(`${source}\n;globalThis.__testGame={state,input,render,view,updatePlayer,clearHeldControls,loop};`,context,{filename:'client-integration.js'});
  const $=id=>win.document.getElementById(id);
  return {win,$,errors,game:win.__testGame,
    click:id=>$(id).click(),
    submit:id=>$(id).dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true})),
    async signup(username){
      await until(()=>$('onlineGateText').textContent.includes('Sign in or create'),'API available');
      this.click('accountBtn');this.click('signupTab');
      $('authUsername').value=username;$('authPassword').value='UI test password only 123!';this.submit('authForm');
      await until(()=>$('accountLabel').textContent===username,`signup ${username}`);
    },
    async close(){for(const socket of sockets)socket.terminate();await win.happyDOM.close();},
  };
}

test('actual HTML account/lobby controls connect two clients, deploy, render and rematch',async t=>{
  const app=await createApp({production:false,storeOptions:{sqlitePath:':memory:'}});
  const origin=await app.listen(0,'127.0.0.1');
  const a=makeClient(origin),b=makeClient(origin);
  t.after(async()=>{await a.close();await b.close();await app.close();});
  await a.signup('UI_Alice');await b.signup('UI_Bob');
  a.click('profileOnlineBtn');b.click('profileOnlineBtn');
  await until(()=>a.$('connectionStatus').textContent==='CONNECTED'&&b.$('connectionStatus').textContent==='CONNECTED','both sockets');
  a.submit('createRoomForm');
  await until(()=>!a.$('roomLobby').hidden,'created lobby');
  b.$('joinCode').value=a.$('roomCode').textContent;b.submit('joinRoomForm');
  await until(()=>b.$('roomVolt').textContent.includes('UI_Alice')&&a.$('roomFlare').textContent.includes('UI_Bob'),'shared roster');
  for(const client of [a,b]) {
    assert.equal(client.$('onlineUpgradeChoices').children.length,3);
    assert.ok([...client.$('onlineUpgradeChoices').children].every(button=>button.querySelector('small').textContent.length>3));
    await wait(100);client.$('onlineUpgradeChoices').children[0].click();
    await until(()=>!client.$('readyRoomBtn').disabled,'upgrade selected');
    await wait(100);client.click('readyRoomBtn');
    await until(()=>client.$('readyRoomBtn').textContent.includes('undo'),'ready response');
  }
  await until(()=>!a.$('startRoomBtn').disabled,'everyone ready');
  a.click('startRoomBtn');
  await until(()=>a.game.state.online&&b.game.state.online,'both deployed');
  assert.equal(a.game.state.layoutSeed,b.game.state.layoutSeed);
  assert.notEqual(a.game.state.playerTeam,b.game.state.playerTeam);
  await until(()=>a.game.state.player.alive&&b.game.state.player.alive,'snapshot received');
  const activeRoom=[...app.rooms.rooms.values()][0];activeRoom.engine.state.countdown=0;
  await until(()=>a.game.state.countdown<=0&&b.game.state.countdown<=0,'live input enabled');
  const initialA=a.game.state.player.x,initialB=b.game.state.player.x;
  a.game.input.keys.add('KeyD');b.game.input.keys.add('KeyA');
  for(let step=0;step<12;step++){a.win.InkfrontOnline.frame(1/30);b.win.InkfrontOnline.frame(1/30);await wait(34);}
  assert.ok(a.game.state.player.x>initialA+10,'first browser controls its own player');
  assert.ok(b.game.state.player.x<initialB-10,'second browser controls its own player');
  a.game.clearHeldControls();b.game.clearHeldControls();
  a.game.render();b.game.render();
  assert.equal(a.$('startScreen').hidden,true);assert.equal(b.$('onlineDialog').hidden,true);
  a.click('pauseBtn');assert.equal(a.$('pauseScreen').hidden,false);assert.equal(a.game.state.mode,'playing','online menu cannot pause server');
  a.click('restartPauseBtn');assert.equal(a.$('onlineDialog').hidden,false);assert.equal(a.$('returnMatchBtn').hidden,false);
  a.click('returnMatchBtn');assert.equal(a.$('onlineDialog').hidden,true);assert.equal(a.$('pauseScreen').hidden,true);
  const room=[...app.rooms.rooms.values()][0];room.engine.state.countdown=0;room.engine.state.time=0.01;room.engine.state.paintCounts=[0,1000,100];
  await until(()=>!a.$('resultScreen').hidden&&!b.$('resultScreen').hidden,'both result screens');
  a.click('rematchBtn');assert.equal(a.$('onlineDialog').hidden,false);assert.equal(a.game.state.mode,'ended','return-to-room does not trigger offline draft');
  a.click('reopenRoomBtn');
  await until(()=>!a.$('onlineLoadout').hidden&&!b.$('onlineLoadout').hidden,'new draft');
  assert.equal(a.game.state.online,false);assert.equal(a.$('onlineUpgradeChoices').children.length,3);
  await wait(100);a.click('leaveRoomBtn');await until(()=>a.$('roomLobby').hidden,'leave room');
  a.click('accountBtn');a.click('logoutBtn');await until(()=>a.$('accountLabel').textContent==='Sign in','signed out');
  assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
});

test('floating touch controls use arbitrary origins, two fingers, cancellation and typed input',async t=>{
  const client=makeClient('file:///C:/offline/index.html');t.after(()=>client.close());
  const {win,game,$}=client;const canvas=$('gameCanvas');
  client.click('mobileBtn');
  // Complete the existing offline three-step flow through actual DOM buttons.
  client.click('deployBtn');client.click('deployBtn');$('upgradeChoices').children[0].click();game.state.countdown=0;
  const pointer=(type,pointerId,x,y)=>canvas.dispatchEvent(new win.PointerEvent(type,{pointerType:'touch',pointerId,clientX:x,clientY:y,bubbles:true}));
  pointer('pointerdown',1,150,270);assert.equal(game.input.moveTouch.x,0);assert.equal($('moveStick').style.left,'150px');
  pointer('pointermove',1,210,270);assert.equal(game.input.moveTouch.x,1);
  pointer('pointerdown',2,920,300);assert.equal(game.input.mouseDown,false);
  pointer('pointermove',2,980,300);assert.equal(game.input.mouseDown,true);assert.equal($('aimStick').style.top,'300px');
  pointer('pointerup',1,210,270);assert.equal(game.input.moveTouch.x,0);assert.equal(game.input.mouseDown,true);
  pointer('pointercancel',2,980,300);assert.equal(game.input.mouseDown,false);assert.equal($('aimStick').classList.contains('active'),false);
  pointer('pointerdown',3,1100,700);pointer('pointermove',3,1050,700);assert.equal(game.input.mouseDown,true);
  client.click('mobileBtn');assert.equal(game.input.mouseDown,false);assert.equal($('aimStick').classList.contains('active'),false);
  client.click('accountBtn');$('authUsername').focus();
  $('authUsername').dispatchEvent(new win.KeyboardEvent('keydown',{code:'KeyW',key:'w',bubbles:true,cancelable:true}));
  assert.equal(game.input.keys.size,0,'typing a username never moves the character');
  assert.deepEqual(client.errors,[]);
});

test('first splash teaches real PC controls, freezes match time, pauses and restores match choices',async t=>{
  const client=makeClient('file:///C:/tutorial-pc/index.html',{firstVisit:true});t.after(()=>client.close());
  const {win,game,$}=client;
  assert.equal($('tutorialScreen').hidden,false);
  assert.equal($('tutorialPcBtn').getAttribute('aria-pressed'),'true');
  assert.equal($('tutorialMobileHint').hidden,true);
  assert.equal(win.document.activeElement.id,'tutorialWelcomeTitle');
  const key=(type,code)=>win.dispatchEvent(new win.KeyboardEvent(type,{code,bubbles:true,cancelable:true}));
  key('keydown','KeyW');assert.equal(game.input.keys.size,0,'welcome does not leak gameplay input');
  // First-run modal traps keyboard focus, with Skip always at the bottom.
  $('tutorialSkipWelcome').focus();
  $('tutorialSkipWelcome').dispatchEvent(new win.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  assert.equal(win.document.activeElement.id,'tutorialPcBtn');
  client.click('tutorialStartBtn');
  assert.equal($('tutorialScreen').hidden,true);assert.equal($('tutorialCoach').hidden,false);
  assert.equal($('tutorialPracticeFooter').hidden,false);
  const initialTime=game.state.time;const enemy=game.state.agents.find(a=>a.team===2);const enemyX=enemy.x;
  const advance=(frames=1)=>{for(let i=0;i<frames;i++)win.InkfrontTutorial.update(1/30);};
  key('keydown','KeyD');advance(30);key('keyup','KeyD');
  assert.ok($('tutorialTaskStatus').classList.contains('passed'),'movement completes by reaching the actual ring');
  assert.equal(game.state.time,initialTime);assert.equal(enemy.x,enemyX,'target never attacks or runs AI');
  client.click('tutorialNextBtn');
  const canvas=$('gameCanvas');
  canvas.dispatchEvent(new win.PointerEvent('pointerdown',{pointerType:'mouse',button:0,bubbles:true}));
  advance(25);
  canvas.dispatchEvent(new win.PointerEvent('pointerup',{pointerType:'mouse',button:0,bubbles:true}));
  assert.ok(game.state.player.shotsFired>=5);assert.ok($('tutorialTaskStatus').classList.contains('passed'));
  client.click('tutorialNextBtn');key('keydown','Space');advance();key('keyup','Space');
  assert.ok($('tutorialTaskStatus').classList.contains('passed'),'real dash completes lesson');
  client.click('tutorialNextBtn');key('keydown','KeyE');advance();key('keyup','KeyE');
  assert.equal(game.state.player.secondaryUses,1);assert.ok($('tutorialTaskStatus').classList.contains('passed'));
  client.click('tutorialNextBtn');assert.equal(game.state.player.specialCharge,100);
  key('keydown','KeyF');advance();key('keyup','KeyF');
  assert.equal(game.state.player.specialUses,1);assert.ok($('tutorialTaskStatus').classList.contains('passed'));
  client.click('tutorialNextBtn');assert.equal(game.state.player.hp,55);
  assert.ok(win.document.body.classList.contains('tutorial-map-lesson'));
  key('keydown','KeyA');advance(30);key('keyup','KeyA');advance(45);
  assert.ok(game.state.player.hp>=90);assert.ok($('tutorialTaskStatus').classList.contains('passed'),'real safe-zone healing completes lesson');
  client.click('pauseBtn');assert.equal(game.state.mode,'paused');assert.match($('tutorialNextBtn').textContent,/Resume/);
  client.click('tutorialNextBtn');assert.equal(game.state.mode,'playing');
  client.click('tutorialNextBtn');assert.equal($('tutorialComplete').hidden,false);
  assert.equal($('tutorialScreen').getAttribute('aria-labelledby'),'tutorialCompleteTitle');
  client.click('tutorialFinishBtn');
  assert.equal(game.state.mode,'lobby');assert.equal(game.state.teamSize,2);assert.equal(game.state.difficulty,'tactical');
  assert.equal(game.state.player,null);assert.equal(game.state.agents.length,0);
  assert.equal($('startScreen').hidden,false);assert.equal($('tutorialScreen').hidden,true);
  assert.equal(JSON.parse(win.localStorage.getItem('inkfront-tutorial')).result,'completed');
  assert.equal(game.input.keys.size,0);assert.equal(game.input.mouseDown,false);
  assert.deepEqual(client.errors,[]);
});

test('mobile tutorial detects touch, accepts floating sticks and ability buttons, and skips cleanly',async t=>{
  const client=makeClient('file:///C:/tutorial-mobile/index.html',{firstVisit:true,touch:true});t.after(()=>client.close());
  const {win,game,$}=client;
  assert.equal($('tutorialMobileBtn').getAttribute('aria-pressed'),'true');assert.equal($('tutorialMobileHint').hidden,false);
  client.click('tutorialStartBtn');assert.match($('tutorialLessonCaption').textContent,/left half/);
  const canvas=$('gameCanvas');
  const pointer=(type,id,x,y)=>canvas.dispatchEvent(new win.PointerEvent(type,{pointerType:'touch',pointerId:id,clientX:x,clientY:y,bubbles:true}));
  pointer('pointerdown',1,180,350);pointer('pointermove',1,240,350);
  for(let i=0;i<30;i++)win.InkfrontTutorial.update(1/30);
  pointer('pointerup',1,240,350);assert.ok($('tutorialTaskStatus').classList.contains('passed'));
  client.click('tutorialNextBtn');assert.match($('tutorialLessonCaption').textContent,/right half/);
  pointer('pointerdown',2,900,350);pointer('pointermove',2,960,350);
  for(let i=0;i<25;i++)win.InkfrontTutorial.update(1/30);
  pointer('pointercancel',2,960,350);assert.ok($('tutorialTaskStatus').classList.contains('passed'));
  client.click('tutorialNextBtn');
  $('mobileDash').dispatchEvent(new win.PointerEvent('pointerdown',{pointerType:'touch',bubbles:true,cancelable:true}));
  win.InkfrontTutorial.update(1/30);assert.ok($('tutorialTaskStatus').classList.contains('passed'));
  client.click('tutorialNextBtn');client.click('secondaryBtn');win.InkfrontTutorial.update(1/30);
  assert.equal(game.state.player.secondaryUses,1);
  client.click('tutorialNextBtn');client.click('specialBtn');win.InkfrontTutorial.update(1/30);
  assert.equal(game.state.player.specialUses,1);
  // Device switching updates captions and clears every held touch input.
  pointer('pointerdown',3,150,350);pointer('pointermove',3,200,350);
  client.click('tutorialSwitchBtn');assert.equal(game.state.mobileControls,false);assert.equal(game.input.moveTouch.x,0);
  assert.match($('tutorialControlHint').textContent,/F/);
  client.click('tutorialSkipPractice');assert.equal(game.state.mode,'lobby');assert.equal($('tutorialPracticeFooter').hidden,true);
  assert.equal(JSON.parse(win.localStorage.getItem('inkfront-tutorial')).result,'skipped');
  game.state.teamSize=4;game.state.characterId='miso';game.state.setupStep='character';
  client.click('tutorialReplayBtn');client.click('tutorialStartBtn');client.click('tutorialSkipPractice');
  assert.equal(game.state.teamSize,4);assert.equal(game.state.characterId,'miso');assert.equal(game.state.setupStep,'character');
  assert.deepEqual(client.errors,[]);
});

test('tutorial remembers skipping, replays on demand, and works with unavailable storage',async t=>{
  const returning=makeClient('file:///C:/tutorial-returning/index.html',{savedTutorial:JSON.stringify({version:'1',result:'skipped'})});
  const blocked=makeClient('file:///C:/tutorial-no-storage/index.html',{firstVisit:true,brokenStorage:true});
  t.after(async()=>{await returning.close();await blocked.close();});
  assert.equal(returning.$('tutorialScreen').hidden,true);
  returning.click('tutorialReplayBtn');assert.equal(returning.$('tutorialScreen').hidden,false);
  returning.click('tutorialSkipWelcome');assert.equal(returning.$('startScreen').hidden,false);
  assert.equal(blocked.$('tutorialScreen').hidden,false);blocked.click('tutorialMobileBtn');
  blocked.click('tutorialStartBtn');
  // A player may read and manually advance every lesson without a required action.
  for(let i=0;i<6;i++)blocked.click('tutorialNextBtn');
  assert.equal(blocked.$('tutorialComplete').hidden,false);
  blocked.click('tutorialAgainBtn');assert.equal(blocked.$('tutorialCoach').hidden,false);
  blocked.click('tutorialSkipPractice');assert.equal(blocked.game.state.mode,'lobby');
  assert.deepEqual(blocked.errors,[]);
});
