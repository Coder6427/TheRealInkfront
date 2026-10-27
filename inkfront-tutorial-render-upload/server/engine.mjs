import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the EXACT offline rules in an isolated, non-rendering context per room.
// No client code is evaluated. This adapter avoids a second, divergent physics/AI
// implementation while the legacy canvas renderer remains usable from file://.
const source = ['arsenal.js', 'game.js'].map((name) => readFileSync(new URL(`../dist/${name}`, import.meta.url), 'utf8')).join('\n');
const noop = () => {};
function headlessDocument() {
  const drawing = new Proxy({}, { get: () => noop, set: () => true });
  const elements = new Map();
  const makeElement = () => ({
    style: { setProperty: noop }, dataset: {}, children: [],
    classList: { add: noop, remove: noop, toggle: noop },
    addEventListener: noop, setAttribute: noop, setPointerCapture: noop, focus: noop, remove: noop,
    getContext: () => drawing,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
    querySelector: () => makeElement(), append: noop, prepend: noop,
  });
  return { body: makeElement(), addEventListener: noop, createElement: makeElement, querySelectorAll: () => [],
    querySelector: (id) => { if (!elements.has(id)) elements.set(id, makeElement()); return elements.get(id); } };
}

const bridge = `
state.sound = false;
state.serverMatch = true;
for (const key of Object.keys(sound)) if (typeof sound[key] === 'function') sound[key] = () => {};
updateHUD = () => {};
buildRosters = () => {};
updateCamera = () => {};
updateViewTransform = () => {};
addEvent = () => {};
addWorldText = () => {};
finishMatch = () => { state.mode = 'ended'; };
updatePlayer = (agent, dt) => {
  const command = agent.command || { mx:0,my:0,angle:agent.angle,autoLock:true };
  state.autoLock = command.autoLock;
  state.lockTargetId = agent.lockTargetId || null;
  state.lockLostAt = agent.lockLostAt || 0;
  applyPlayerCommand(agent, command, dt);
  agent.lockTargetId = state.lockTargetId;
  agent.lockLostAt = state.lockLostAt;
  command.dash = command.secondary = command.special = false;
};
globalThis.engine = {
  state, WORLD, CHARACTERS, UPGRADES, MATCH_MODES, MAPS,
  start(config, members) {
    Object.assign(state, config, { playerTeam: members[0].team, characterId: members[0].characterId, upgradeId: members[0].upgradeId, online:false });
    resetMatch();
    const occupied = new Set();
    const used = [null, new Set(), new Set()];
    for (const member of members) {
      const agent = state.agents.find(a => a.team === member.team && !occupied.has(a.id));
      occupied.add(agent.id);
      used[member.team].add(member.characterId);
      Object.assign(agent, { isPlayer:true, userId:member.id, username:member.username,
        characterId:member.characterId, upgradeId:member.upgradeId, name:CHARACTERS[member.characterId].name,
        role:CHARACTERS[member.characterId].role, baseRole:CHARACTERS[member.characterId].role,
        maxHp:member.upgradeId === 'hull' ? 135:100, hp:member.upgradeId === 'hull' ? 135:100,
        command:{mx:0,my:0,angle:agent.angle,autoLock:true} });
    }
    for (const agent of state.agents) if (!occupied.has(agent.id)) {
      agent.isPlayer = false;
      const choices = Object.keys(CHARACTERS).filter(id => !used[agent.team].has(id));
      if (used[agent.team].has(agent.characterId)) agent.characterId = choices[0];
      used[agent.team].add(agent.characterId);
      agent.name = CHARACTERS[agent.characterId].name;
      agent.role = agent.baseRole = CHARACTERS[agent.characterId].role;
    }
    state.player = state.agents.find(a => a.userId === members[0].id);
    state.mode = 'playing';
    updateVision();
    return this.metadata();
  },
  metadata() {
    return { teamSize:state.teamSize, matchMode:state.matchMode, difficulty:state.difficulty,
      activeMap:state.activeMap, layoutSeed:state.layoutSeed, layoutVariant:state.layoutVariant,
      roster:state.agents.map(a => ({ id:a.id,team:a.team,characterId:a.characterId,upgradeId:a.upgradeId,
        name:a.name,username:a.username || null,userId:a.userId || null,isPlayer:a.isPlayer,role:a.role })) };
  },
  input(id, command) {
    const agent = state.agents.find(a => a.userId === id);
    if (!agent || state.mode !== 'playing') return;
    agent.isPlayer = true;
    // Preserve a one-shot button arriving between server ticks.
    for (const key of ['dash','secondary','special']) command[key] ||= Boolean(agent.command?.[key]);
    agent.command = command;
  },
  disconnected(id) {
    const agent = state.agents.find(a => a.userId === id);
    if (agent) { agent.command = null; agent.isPlayer = false; agent.thinkTimer = 0; }
  },
  step(dt) { if (state.mode === 'playing') updateMatch(dt); state.particles.length = 0; state.texts.length = 0; },
  snapshot(id, includePaint) {
    const me = state.agents.find(a => a.userId === id);
    if (!me) return null;
    const team = me.team;
    const fields = ['id','team','characterId','upgradeId','name','username','x','y','vx','vy','radius','angle','hp','maxHp','ammo','alive','respawn','shield','dashCd','dashTime','shotCd','shotsFired','secondaryCd','specialCharge','overdrive','slowTime','firing','role','intent','intentLabel','paintContribution','damageContribution','secondaryUses','specialUses'];
    const agents = state.agents.filter(a => a.team === team || isAgentVisibleToTeam(a,team)).map(a => {
      const out = {}; for (const key of fields) out[key] = a[key];
      out.isPlayer = a.id === me.id;
      return out;
    });
    const canSee = p => p.team === team || isPointVisibleToTeam(p,team);
    return { type:'snapshot', time:state.time, countdown:state.countdown, overtime:state.overtime,
      ended:state.mode === 'ended', me:me.id, agents,
      // Public roster status contains no hidden position, aim, health or resources.
      rosterStatus:state.agents.map(a => ({id:a.id,alive:a.alive})),
      projectiles:state.projectiles.filter(canSee).map(p => ({...p})),
      effects:state.effects.filter(e => canSee(e) && (e.type !== 'mine' || e.team === team || state.agents.some(a => a.team === team && hasDirectVision(a,e,120)))).map(e => ({...e})),
      zones:state.zones.map(z => ({...z})), paintCounts:[...state.paintCounts], modeScores:[...state.modeScores],
      vision:[...state.vision[team]], lockTargetId:me.lockTargetId || null,
      paint:includePaint ? Array.from(state.paint) : undefined };
  },
  results() {
    const scores = [0,getModeScore(1),getModeScore(2)];
    return { scores, winner:Math.abs(scores[1]-scores[2]) < 0.001 ? 0 : scores[1] > scores[2] ? 1 : 2 };
  }
};
`;

export function createEngine() {
  let time = 0;
  const context = vm.createContext({
    document: headlessDocument(), window: { devicePixelRatio: 1, addEventListener: noop, setTimeout: noop },
    navigator: { getGamepads: () => [] }, matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => null }, performance: { now: () => time }, requestAnimationFrame: noop,
    console,
  });
  vm.runInContext(`${source}\n${bridge}`, context, { timeout: 5000, filename: 'shared-game-engine.js' });
  const engine = context.engine;
  const step = engine.step.bind(engine);
  engine.step = (dt) => { time += dt * 1000; step(dt); };
  return engine;
}
