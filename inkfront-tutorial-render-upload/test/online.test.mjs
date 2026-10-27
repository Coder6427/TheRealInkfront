import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import WebSocket from 'ws';
import { createApp } from '../server/index.mjs';
import { createEngine } from '../server/engine.mjs';
import { openStore } from '../server/store.mjs';
import { validateCommand } from '../server/rooms.mjs';

const config={teamSize:2,matchMode:'turf',mapChoice:'crescent',difficulty:'tactical'};
const command=(seq=1,extra={})=>({type:'input',seq,mx:1,my:0,angle:0,fire:false,dash:false,secondary:false,special:false,autoLock:true,...extra});
function socketClient(origin,cookie) {
  const socket=new WebSocket(`${origin.replace('http:','ws:')}/socket`,{headers:{Origin:origin,Cookie:cookie}});
  const inbox=[];const observers=new Set();
  socket.on('message',bytes=>{const data=JSON.parse(bytes);inbox.push(data);for(const observer of observers)observer(data);});
  return {socket,inbox,send:data=>socket.send(JSON.stringify(data)),
    next(predicate,timeout=5000){
      const index=inbox.findIndex(predicate);
      if(index>=0)return Promise.resolve(inbox.splice(index,1)[0]);
      return new Promise((yes,no)=>{
        const timer=setTimeout(()=>{observers.delete(observe);no(new Error(`Timed out waiting for ${predicate.toString()}; inbox: ${JSON.stringify(inbox.filter(d=>d.type!=='snapshot').slice(-5))}`));},timeout);
        const observe=data=>{if(predicate(data)){clearTimeout(timer);observers.delete(observe);inbox.splice(inbox.indexOf(data),1);yes(data);}};
        observers.add(observe);
      });
    },
    async action(data,predicate){await wait(95);inbox.length=0;this.send(data);return this.next(predicate);},
  };
}

test('accounts, authenticated rooms, shared simulation, fog, reconnect and logout',async t=>{
  const app=await createApp({production:false,storeOptions:{sqlitePath:':memory:'}});
  const origin=await app.listen(0,'127.0.0.1');
  t.after(()=>app.close());
  const post=async(path,body,cookie='',customOrigin=origin)=>{
    const response=await fetch(`${origin}${path}`,{method:'POST',headers:{Origin:customOrigin,'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  };
  assert.equal((await fetch(`${origin}/api/health`)).status,200);
  const tutorialAsset=await fetch(`${origin}/tutorial.js`);
  assert.equal(tutorialAsset.status,200,'Render serves the new first-run tutorial');
  assert.match(tutorialAsset.headers.get('content-type'),/javascript/);
  assert.match(await tutorialAsset.text(),/InkfrontTutorial/);
  assert.equal((await fetch(`${origin}/server/store.mjs`)).status,404);
  assert.equal((await post('/api/signup',{username:'No',password:'short'})).status,400);
  assert.equal((await post('/api/signup',{username:'CrossSite',password:'not a real password'},'','https://evil.invalid')).status,403);
  const alice=await post('/api/signup',{username:'Alice',password:'Test-only password 123!'});
  const bob=await post('/api/signup',{username:'Bob_2',password:'Test-only password 456!'});
  assert.equal(alice.status,200);assert.equal(bob.status,200);
  assert.match(alice.headers.get('set-cookie'),/HttpOnly/);assert.match(alice.headers.get('set-cookie'),/SameSite=Lax/);
  assert.ok(!alice.body.user.password_hash);
  assert.equal((await post('/api/signup',{username:'alice',password:'Another test password'})).status,409);
  assert.equal((await post('/api/login',{username:'ALICE',password:'wrong password'})).status,401);
  const signed=await post('/api/login',{username:'ALICE',password:'Test-only password 123!'});
  assert.equal(signed.status,200);
  const unauth=new WebSocket(`${origin.replace('http:','ws:')}/socket`,{headers:{Origin:origin}});
  const denied=await new Promise(resolve=>{unauth.on('unexpected-response',(_,res)=>{res.resume();resolve(res.statusCode);});unauth.on('error',()=>{});});
  assert.equal(denied,401);unauth.terminate();
  const a=socketClient(origin,signed.cookie),b=socketClient(origin,bob.cookie);
  const [helloA,helloB]=await Promise.all([a.next(d=>d.type==='hello'),b.next(d=>d.type==='hello')]);
  assert.equal(helloA.user.username,'Alice');
  const created=await a.action({type:'create',config},d=>d.type==='room');
  assert.match(created.room.code,/^[A-Z2-9]{6}$/);
  const joined=await b.action({type:'join',code:created.room.code.toLowerCase()},d=>d.type==='room');
  assert.equal(joined.room.members.length,2);assert.equal(new Set(joined.room.members.map(m=>m.team)).size,2);
  await b.action({type:'start'},d=>d.type==='error');
  const room=app.rooms.rooms.get(created.room.code);
  for(const [client,user,hero] of [[a,helloA.user,'vex'],[b,helloB.user,'rook']]) {
    const member=room.members.find(m=>m.id===user.id);
    const illegal=UPGRADE_NOT_OFFERED(member.offers);
    const error=await client.action({type:'loadout',team:member.team,characterId:hero,upgradeId:illegal},d=>d.type==='error');
    assert.match(error.message,/three offered/);
    await client.action({type:'loadout',team:member.team,characterId:hero,upgradeId:member.offers[0]},d=>d.type==='room'&&d.room.members.some(m=>m.id===user.id&&m.characterId===hero&&m.upgradeId));
    await client.action({type:'ready'},d=>d.type==='room'&&d.room.members.some(m=>m.id===user.id&&m.ready));
  }
  const started=await a.action({type:'start'},d=>d.type==='match');
  const other=await b.next(d=>d.type==='match');
  assert.equal(started.match.layoutSeed,other.match.layoutSeed);assert.notEqual(started.match.me,other.match.me);
  assert.equal(started.match.roster.length,4);
  const snap=await a.next(d=>d.type==='snapshot');
  assert.ok(snap.agents.every(agent=>agent.team===1),'hidden rivals must not be transmitted');
  assert.ok(snap.rosterStatus.every(agent=>Object.keys(agent).sort().join(',')==='alive,id'));
  assert.equal(Buffer.from(snap.paint,'base64').length,1600/25*900/25);
  const controlled=room.engine.state.agents.find(agent=>agent.userId===helloA.user.id);
  room.engine.state.countdown=0;
  const oldX=controlled.x;
  a.send(command(1,{x:999999,hp:999999,fire:true}));
  await wait(240);
  assert.ok(controlled.x>oldX&&controlled.x-oldX<110,'server controls movement speed');
  assert.ok(controlled.hp<=controlled.maxHp);assert.ok(controlled.x<1000);
  a.send(command(2,{mx:NaN}));a.send(command(1,{mx:-1}));
  await wait(120);assert.equal(a.socket.readyState,1);
  a.socket.close();await wait(100);assert.equal(controlled.isPlayer,false,'AI takes over disconnected player');
  const a2=socketClient(origin,signed.cookie);
  await a2.next(d=>d.type==='hello');await a2.next(d=>d.type==='match');await a2.next(d=>d.type==='snapshot');
  assert.equal(controlled.isPlayer,true,'reconnect restores the same agent');
  room.engine.state.time=0.02;room.engine.state.paintCounts=[0,900,200];
  await a2.next(d=>d.type==='finished');
  await wait(50);
  const profile=await fetch(`${origin}/api/me`,{headers:{Cookie:signed.cookie}}).then(r=>r.json());
  assert.equal(profile.user.matches,1);assert.equal(profile.user.wins,1);
  assert.equal(room.hostId,helloB.user.id,'connected player takes leadership during a disconnect');
  await b.action({type:'rematch'},d=>d.type==='room'&&d.room.phase==='lobby');
  assert.ok(room.members.every(m=>!m.ready&&!m.upgradeId&&m.offers.length===3));
  const changed=await post('/api/password',{currentPassword:'Test-only password 123!',password:'New test-only password 321!'},signed.cookie);
  assert.equal(changed.status,200);
  const expired=await fetch(`${origin}/api/me`,{headers:{Cookie:signed.cookie}}).then(r=>r.json());assert.equal(expired.user,null);
  assert.equal((await post('/api/logout',{},bob.cookie)).status,200);
  await wait(50);assert.equal(b.socket.readyState,3);
});
const UPGRADE_NOT_OFFERED=list=>['capacitor','quickdraw','reservoir','kinetic','impact','hull'].find(id=>!list.includes(id));

test('SQLite accounts and sessions survive a server/store restart',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'inkfront-test-'));
  try{
    const path=join(dir,'accounts.sqlite');
    let store=await openStore({production:false,sqlitePath:path});
    const user=await store.signup('Persistent','persistent','Test persistent password 123!');
    const token=await store.newSession(user.id);await store.close();
    store=await openStore({production:false,sqlitePath:path});
    assert.equal((await store.authenticate(token)).id,user.id);await store.logout(token);assert.equal(await store.authenticate(token),null);await store.close();
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('production refuses ephemeral account storage',async()=>{
  await assert.rejects(openStore({production:true,databaseUrl:''}),/DATABASE_URL/);
});
test('input validation rejects cheats and normalizes diagonal movement',()=>{
  assert.equal(validateCommand(command(1,{mx:Infinity})),null);
  assert.equal(validateCommand(command(1,{my:4})),null);
  assert.equal(validateCommand(command(1,{fire:'yes'})),null);
  const valid=validateCommand(command(1,{mx:1,my:1}));assert.ok(Math.hypot(valid.mx,valid.my)<=1);
});
test('all formats/modes, abilities and team visibility run on authoritative engine',()=>{
  for(const size of [1,2,3,4])for(const mode of ['turf','zones','clash']){
    const engine=createEngine();
    engine.start({teamSize:size,matchMode:mode,mapChoice:size%2?'breakwater':'crescent',difficulty:'tactical'},[
      {id:'first',username:'First',team:1,characterId:'rook',upgradeId:'hull'},
      {id:'second',username:'Second',team:2,characterId:'kilo',upgradeId:'impact'}]);
    assert.equal(engine.state.agents.length,size*2);
    for(const team of [1,2])assert.equal(new Set(engine.state.agents.filter(a=>a.team===team).map(a=>a.characterId)).size,size);
    engine.state.countdown=0;
    engine.input('first',validateCommand(command(1,{mx:1,my:0,fire:true})));
    for(let i=0;i<60;i++)engine.step(1/30);
    const player=engine.state.agents.find(a=>a.userId==='first');
    assert.ok(player.x>120);assert.ok(Number.isFinite(player.hp));
    // Use the same secondary/special rules away from protected spawn rings.
    player.x=engine.WORLD.w*.45;player.y=engine.WORLD.h*.5;player.specialCharge=100;player.secondaryCd=0;player.ammo=100;
    engine.input('first',validateCommand(command(2,{mx:0,secondary:true,special:true})));
    engine.step(1/30);assert.equal(player.secondaryUses,1);assert.equal(player.specialUses,1);
    const enemy=engine.state.agents.find(a=>a.userId==='second');enemy.x=player.x+90;enemy.y=player.y;enemy.shield=0;
    engine.step(1/30);
    const snap=engine.snapshot('first',false);assert.ok(snap.agents.some(a=>a.id===enemy.id));
    enemy.x=engine.WORLD.w-110;enemy.y=engine.WORLD.h/2;engine.step(1/30);
    const hidden=engine.snapshot('first',false);assert.ok(!hidden.agents.some(a=>a.id===enemy.id));
  }
});
