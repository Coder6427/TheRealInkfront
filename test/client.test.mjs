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
const source=(await Promise.all(['arsenal.js','game.js','online.js'].map(name=>readFile(new URL(`../dist/${name}`,import.meta.url),'utf8')))).join('\n');
async function until(check,label,timeout=6000) {
  const start=Date.now();
  while(Date.now()-start<timeout){if(check())return;await wait(20);}
  assert.fail(`Timed out: ${label}`);
}
function makeClient(origin) {
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
  win.matchMedia=()=>({matches:false});
  win.fetch=async(path,init={})=>{
    const response=await fetch(new URL(path,origin),{...init,headers:{...init.headers,Origin:origin,Cookie:cookie}});
    const next=response.headers.get('set-cookie');if(next)cookie=next.split(';')[0];
    return response;
  };
  win.WebSocket=class extends WebSocket {constructor(url){super(url,{headers:{Origin:origin,Cookie:cookie}});sockets.push(this);}};
  const context=vm.createContext(win);
  vm.runInContext(`${source}\n;globalThis.__testGame={state,input,render,view,updatePlayer,clearHeldControls};`,context,{filename:'client-integration.js'});
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
