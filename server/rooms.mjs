import { randomInt } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createEngine } from './engine.mjs';

const HEROES = ['rook','vex','miso','kilo','nyx','tess'];
const UPGRADES = ['capacitor','quickdraw','reservoir','kinetic','impact','hull'];
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const fail = (message) => { throw new Error(message); };
const send = (ws, data) => {
  if (ws?.readyState === 1 && ws.bufferedAmount < 256 * 1024) ws.send(JSON.stringify(data));
};
function offers() {
  const pool = [...UPGRADES];
  return Array.from({length:3}, () => pool.splice(randomInt(pool.length),1)[0]);
}
export function validateCommand(data) {
  if (!data || typeof data !== 'object' || !Number.isSafeInteger(data.seq) || data.seq < 0) return null;
  if (![data.mx, data.my, data.angle].every(Number.isFinite) || Math.abs(data.mx) > 1 || Math.abs(data.my) > 1 || Math.abs(data.angle) > 1e6) return null;
  if (!['fire','dash','secondary','special','autoLock'].every(key => typeof data[key] === 'boolean')) return null;
  const magnitude = Math.hypot(data.mx,data.my);
  return { mx:data.mx / Math.max(1,magnitude),my:data.my / Math.max(1,magnitude), angle:Math.atan2(Math.sin(data.angle),Math.cos(data.angle)),
    fire:data.fire,dash:data.dash,secondary:data.secondary,special:data.special,autoLock:data.autoLock };
}

export function createRooms(store, { maxRooms = 12 } = {}) {
  const rooms = new Map();
  const membership = new Map();
  const connections = new Map();
  let lastTick = performance.now();
  let accumulator = 0;
  let tick = 0;
  const configOf = (raw) => {
    if (![1,2,3,4].includes(raw.teamSize) || !['turf','zones','clash'].includes(raw.matchMode)
      || !['switchyard','crescent','breakwater','random'].includes(raw.mapChoice) || !['rookie','tactical','elite'].includes(raw.difficulty))
      fail('Choose a valid match size, mode, map and bot difficulty.');
    return {teamSize:raw.teamSize,matchMode:raw.matchMode,mapChoice:raw.mapChoice,difficulty:raw.difficulty};
  };
  function roomFor(id) { return rooms.get(membership.get(id)); }
  function meIn(room,id) { return room?.members.find(m => m.id === id); }
  function publish(room) {
    for (const member of room.members) send(connections.get(member.id), { type:'room', room:{
      code:room.code, hostId:room.hostId, phase:room.phase, config:room.config,
      members:room.members.map(m => ({id:m.id,username:m.username,team:m.team,characterId:m.characterId,upgradeId:m.upgradeId,
        ready:m.ready,connected:connections.has(m.id)})),
      offers:member.offers,
    }});
  }
  function electHost(room) {
    if (!connections.has(room.hostId)) room.hostId = room.members.find(m => connections.has(m.id))?.id || room.members[0]?.id;
  }
  function remove(id) {
    const room = roomFor(id);
    if (!room) return;
    membership.delete(id);
    room.engine?.disconnected(id);
    room.members = room.members.filter(m => m.id !== id);
    send(connections.get(id), {type:'left'});
    if (!room.members.length) { rooms.delete(room.code); return; }
    if (room.hostId === id) room.hostId = room.members.find(m => connections.has(m.id))?.id || room.members[0].id;
    publish(room);
  }
  function join(room,user) {
    if (room.phase !== 'lobby') fail('That match has already started. Join after it finishes.');
    if (room.members.length >= room.config.teamSize * 2) fail('This room is full.');
    const counts = [0,1,2].map(team => room.members.filter(m => m.team === team).length);
    const team = counts[1] <= counts[2] ? 1 : 2;
    const characterId = HEROES.find(id => !room.members.some(m => m.team === team && m.characterId === id));
    const member = {id:user.id,username:user.username,team,characterId,upgradeId:null,ready:false,offers:offers(),lastSeen:Date.now()};
    room.members.push(member);
    membership.set(user.id,room.code);
    publish(room);
  }
  function sendGame(room,id) {
    const ws = connections.get(id);
    if (!ws || !room.engine) return;
    const me = room.engine.state.agents.find(a => a.userId === id);
    if (!me) return;
    send(ws, {type:'match', match:{...room.metadata,me:me.id,playerTeam:me.team,roomCode:room.code}});
    const snapshot = room.engine.snapshot(id,true);
    if (snapshot) { snapshot.paint = Buffer.from(snapshot.paint).toString('base64'); send(ws,snapshot); }
  }
  async function finish(room) {
    if (room.phase !== 'playing') return;
    room.phase = 'ended';
    room.endedAt = Date.now();
    room.result = room.engine.results();
    broadcastSnapshots(room,true);
    for (const member of room.members) send(connections.get(member.id), {type:'finished',result:room.result});
    publish(room);
    try {
      await Promise.all(room.participants.map(m => store.recordMatch(m.id,room.result.winner === m.team && membership.get(m.id) === room.code)));
    } catch { process.stderr.write('Could not save match statistics.\n'); }
  }
  function broadcastSnapshots(room,forcePaint=false) {
    const includePaint = forcePaint || tick % 6 === 0;
    let encoded;
    for (const member of room.members) {
      const ws = connections.get(member.id);
      if (!ws || ws.bufferedAmount > 128*1024) continue;
      const snapshot = room.engine.snapshot(member.id,includePaint);
      if (!snapshot) continue;
      if (includePaint) snapshot.paint = encoded ||= Buffer.from(snapshot.paint).toString('base64');
      snapshot.tick = tick;
      snapshot.ack = ws.lastSeq;
      send(ws,snapshot);
    }
  }
  const timer = setInterval(() => {
    const now = performance.now();
    accumulator += Math.min(0.15,(now-lastTick)/1000);
    lastTick = now;
    let steps = 0;
    while (accumulator >= 1/30 && steps++ < 4) {
      tick++;
      for (const room of rooms.values()) if (room.phase === 'playing') {
        for (const member of room.members) if (Date.now() - (connections.get(member.id)?.lastInput || 0) > 500) {
          const agent = room.engine.state.agents.find(a => a.userId === member.id);
          if (agent?.isPlayer) room.engine.input(member.id,{mx:0,my:0,angle:agent.angle,autoLock:true,fire:false});
        }
        room.engine.step(1/30);
        if (room.engine.state.mode === 'ended') void finish(room);
        else if (tick%2===0) broadcastSnapshots(room);
      }
      accumulator -= 1/30;
    }
    for (const room of rooms.values()) {
      for (const member of [...room.members]) if (!connections.has(member.id) && Date.now()-member.lastSeen > 90000) remove(member.id);
      if (room.phase === 'ended' && Date.now()-room.endedAt > 20*60*1000) for (const member of [...room.members]) remove(member.id);
    }
  },1000/30);
  timer.unref();
  return {
    rooms, connections,
    connect(user,ws) {
      const old = connections.get(user.id);
      if (old) old.close(4001,'Signed in from another tab');
      connections.set(user.id,ws);
      ws.lastSeq = -1;
      ws.lastInput = Date.now();
      ws.windowStart = Date.now(); ws.messages = 0;
      send(ws,{type:'hello',roomCode:membership.get(user.id)||null,user:{id:user.id,username:user.username,matches:Number(user.matches),wins:Number(user.wins)}});
      const room = roomFor(user.id);
      if (room) {
        const member = meIn(room,user.id);
        member.lastSeen = Date.now();
        if (room.phase !== 'lobby') {
          const agent = room.engine.state.agents.find(a => a.userId === user.id);
          if (agent) agent.isPlayer = true;
          sendGame(room,user.id);
        }
        publish(room);
        if (room.phase === 'ended') send(ws,{type:'finished',result:room.result});
      }
      ws.on('message',(bytes,isBinary) => {
        if (connections.get(user.id) !== ws) return;
        if (Date.now()-ws.windowStart > 1000) { ws.windowStart=Date.now(); ws.messages=0; }
        if (++ws.messages > 90) { ws.close(1008,'Too many messages'); return; }
        try {
          if (isBinary) fail('Only JSON messages are supported.');
          const data = JSON.parse(bytes.toString());
          if (!data || typeof data !== 'object') fail('Invalid message.');
          if (data.type === 'ping') { send(ws,{type:'pong',at:data.at}); return; }
          const room = roomFor(user.id);
          if (data.type === 'input') {
            const command = validateCommand(data);
            if (!command || data.seq <= ws.lastSeq) return;
            ws.lastSeq=data.seq; ws.lastInput=Date.now();
            if (room?.phase === 'playing') room.engine.input(user.id,command);
            return;
          }
          if (Date.now()-(ws.lastAction || 0)<80) fail('Please wait a moment between room actions.');
          ws.lastAction=Date.now();
          if (data.type === 'create') {
            if (room) fail('Leave your current room first.');
            if (rooms.size >= maxRooms) fail('All arenas are busy. Please try again later.');
            const config=configOf(data.config || {});
            let code;
            do { code=Array.from({length:6},()=>ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join(''); } while(rooms.has(code));
            const next={code,hostId:user.id,phase:'lobby',members:[],config};
            rooms.set(code,next); join(next,user);
          } else if (data.type === 'join') {
            if (room) fail('Leave your current room first.');
            const code=typeof data.code==='string' ? data.code.trim().toUpperCase() : '';
            const target=rooms.get(code);
            if (!target) fail('Room not found. Check the six-character code.');
            join(target,user);
          } else if (data.type === 'leave') remove(user.id);
          else if (data.type === 'loadout') {
            if (!room || room.phase!=='lobby') fail('Loadouts can only change in the lobby.');
            const member=meIn(room,user.id);
            const team=data.team;
            if (![1,2].includes(team) || !HEROES.includes(data.characterId)) fail('Invalid team or character.');
            if (room.members.filter(m=>m.id!==user.id&&m.team===team).length>=room.config.teamSize) fail('That team is full.');
            if (room.members.some(m=>m.id!==user.id&&m.team===team&&m.characterId===data.characterId)) fail('A teammate already chose that character.');
            if (data.upgradeId!==null && !member.offers.includes(data.upgradeId)) fail('Choose one of your three offered upgrades.');
            Object.assign(member,{team,characterId:data.characterId,upgradeId:data.upgradeId,ready:false});
            publish(room);
          } else if (data.type === 'ready') {
            if (!room || room.phase!=='lobby') fail('Wait for the next lobby.');
            const member=meIn(room,user.id);
            if (!member.upgradeId) fail('Choose an upgrade first.');
            member.ready=!member.ready; publish(room);
          } else if (data.type === 'start') {
            if (!room || room.hostId!==user.id) fail('Only the room leader can deploy.');
            if (room.phase!=='lobby') fail('This match has already started.');
            if (!room.members.every(m=>m.ready&&connections.has(m.id))) fail('Every player must be connected and ready.');
            room.engine=createEngine();
            room.metadata=room.engine.start(room.config,room.members);
            room.participants=room.members.map(m=>({id:m.id,team:m.team}));
            room.phase='playing';
            for(const member of room.members) sendGame(room,member.id);
            publish(room);
          } else if (data.type === 'rematch') {
            if (!room || room.hostId!==user.id || room.phase!=='ended') fail('The leader can reopen the lobby after the match.');
            room.phase='lobby'; room.engine=null; room.result=null;
            for(const member of room.members) Object.assign(member,{ready:false,upgradeId:null,offers:offers()});
            publish(room);
          } else fail('Unknown room action.');
        } catch(error) { send(ws,{type:'error',message:error.message || 'That action could not be completed.'}); }
      });
      ws.on('close',() => {
        if (connections.get(user.id)!==ws) return;
        connections.delete(user.id);
        const room=roomFor(user.id);
        if (!room) return;
        const member=meIn(room,user.id);
        member.lastSeen=Date.now(); member.ready=false;
        room.engine?.disconnected(user.id);
        electHost(room); publish(room);
      });
    },
    revoke(id) { remove(id); connections.get(id)?.close(4003,'Please sign in again'); },
    close() {
      clearInterval(timer);
      for(const ws of connections.values()) ws.close(1012,'Server restarting; rooms will reset');
      rooms.clear(); membership.clear(); connections.clear();
    },
  };
}
