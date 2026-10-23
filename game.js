const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d', { alpha: false });

const WORLD = { w: 1600, h: 900 };
const CELL = 25;
let COLS = WORLD.w / CELL;
let ROWS = WORLD.h / CELL;
const NAV = 50;
let NAV_COLS = Math.ceil(WORLD.w / NAV);
let NAV_ROWS = Math.ceil(WORLD.h / NAV);
const MATCH_LENGTH = 90;
const VISION_RADIUS = 315;
const SAFE_RADIUS = 150;
const MAPS = {
  switchyard: { name: 'Switchyard', note: 'Industrial lanes, movable crates, and broad central crossings.', floor: '#191d35', edge: '#14182d', accent: '#97a9c9' },
  crescent: { name: 'Crescent Court', note: 'Half-moon shelters and open gardens. Duck inside a curve, then flank around it.', floor: '#172c30', edge: '#102125', accent: '#87cdb4' },
  breakwater: { name: 'Breakwater', note: 'Staggered dock lanes and curved bunkers create a winding fight through the middle.', floor: '#24253a', edge: '#181a30', accent: '#b7a5e4' },
};
const MATCH_SIZES = {
  1: { name: 'Duel yard', label: 'Compact', w: 1200, h: 750, note: 'A focused arena for one-on-one fights.' },
  2: { name: 'Switchyard', label: 'Standard', w: 1600, h: 900, note: 'Room for a partner and coordinated flanks.' },
  3: { name: 'Switchyard East', label: 'Expanded', w: 1800, h: 1050, note: 'A larger arena with wider lanes and extra flank cover.' },
  4: { name: 'Switchyard Grand', label: 'Large', w: 2000, h: 1150, note: 'The largest layout, with more space for full squads.' },
};

const MATCH_MODES = {
  turf: { label: 'TURF CLAIM', short: 'TURF', time: MATCH_LENGTH, target: 0, phase: 'TERRITORY' },
  zones: { label: 'SECTOR LOCK', short: 'ZONES', time: 105, target: 100, phase: 'SECTOR CONTROL' },
  clash: { label: 'TEAM CLASH', short: 'CLASH', time: 75, target: 15, phase: 'FIRST TO 15' },
};

const TEAM = {
  1: { name: 'VOLT', color: '#28e0d6', dark: '#0a8887', rgb: '40,224,214', spawnX: 110, spawnY: 450, shape: 'diamond', css: 'cyan' },
  2: { name: 'FLARE', color: '#ff5f78', dark: '#aa2f51', rgb: '255,95,120', spawnX: 1490, spawnY: 450, shape: 'circle', css: 'coral' },
};
const TEAM_IDS = [1, 2];

const DIFFICULTY = {
  rookie: { label: 'ROOKIE', think: 0.34, reaction: 0.28, aimError: 0.16, prediction: 0.18, coordination: 0.35, memory: 1.2 },
  tactical: { label: 'TACTICAL', think: 0.18, reaction: 0.15, aimError: 0.078, prediction: 0.68, coordination: 0.76, memory: 2.5 },
  elite: { label: 'ELITE', think: 0.105, reaction: 0.08, aimError: 0.038, prediction: 0.96, coordination: 1.0, memory: 4.0 },
};

const ROLE_DATA = {
  painter: { label: 'COATER', paint: 1.35, pressure: 0.78, defend: 0.9, support: 1.0 },
  vanguard: { label: 'VANGUARD', paint: 0.82, pressure: 1.3, defend: 0.85, support: 0.9 },
  guard: { label: 'ANCHOR', paint: 0.9, pressure: 1.02, defend: 1.5, support: 1.12 },
  rover: { label: 'ROVER', paint: 1.0, pressure: 1.06, defend: 0.88, support: 1.05 },
};

const BASE_OBSTACLES = [
  { x: 286, y: 146, w: 146, h: 154, kind: 'block' },
  { x: 286, y: 600, w: 146, h: 154, kind: 'block' },
  { x: 1168, y: 146, w: 146, h: 154, kind: 'block' },
  { x: 1168, y: 600, w: 146, h: 154, kind: 'block' },
  { x: 526, y: 94, w: 114, h: 116, kind: 'tank' },
  { x: 960, y: 690, w: 114, h: 116, kind: 'tank' },
  { x: 526, y: 690, w: 114, h: 116, kind: 'tank' },
  { x: 960, y: 94, w: 114, h: 116, kind: 'tank' },
  { x: 700, y: 270, w: 200, h: 94, kind: 'bridge' },
  { x: 700, y: 536, w: 200, h: 94, kind: 'bridge' },
  { x: 562, y: 406, w: 122, h: 88, kind: 'crate' },
  { x: 916, y: 406, w: 122, h: 88, kind: 'crate' },
];
let obstacles = BASE_OBSTACLES.map((obstacle) => ({ ...obstacle }));

const dom = {
  start: document.querySelector('#startScreen'),
  pause: document.querySelector('#pauseScreen'),
  result: document.querySelector('#resultScreen'),
  hud: document.querySelector('#matchHud'),
  deploy: document.querySelector('#deployBtn'),
  resume: document.querySelector('#resumeBtn'),
  restartPause: document.querySelector('#restartPauseBtn'),
  rematch: document.querySelector('#rematchBtn'),
  setup: document.querySelector('#setupBtn'),
  pauseBtn: document.querySelector('#pauseBtn'),
  lockBtn: document.querySelector('#lockBtn'),
  aiLensBtn: document.querySelector('#aiLensBtn'),
  soundBtn: document.querySelector('#soundBtn'),
  aiPanel: document.querySelector('#aiPanel'),
  aiCards: document.querySelector('#aiCards'),
  difficultyBadge: document.querySelector('#difficultyBadge'),
  cyanPercent: document.querySelector('#cyanPercent'),
  coralPercent: document.querySelector('#coralPercent'),
  cyanBar: document.querySelector('#cyanBar'),
  coralBar: document.querySelector('#coralBar'),
  timer: document.querySelector('#timer'),
  phase: document.querySelector('#matchPhase'),
  cyanRoster: document.querySelector('#cyanRoster'),
  coralRoster: document.querySelector('#coralRoster'),
  eventFeed: document.querySelector('#eventFeed'),
  minimapCanvas: document.querySelector('#minimapCanvas'),
  minimapMode: document.querySelector('#minimapMode'),
  playerName: document.querySelector('#playerName'),
  healthBar: document.querySelector('#healthBar'),
  healthText: document.querySelector('#healthText'),
  ammoBar: document.querySelector('#ammoBar'),
  ammoText: document.querySelector('#ammoText'),
  dashRing: document.querySelector('#dashRing'),
  dashText: document.querySelector('#dashText'),
  respawnNotice: document.querySelector('#respawnNotice'),
  respawnTimer: document.querySelector('#respawnTimer'),
  resultKicker: document.querySelector('#resultKicker'),
  resultTitle: document.querySelector('#resultTitle'),
  resultCyan: document.querySelector('#resultCyan'),
  resultCoral: document.querySelector('#resultCoral'),
  resultSummary: document.querySelector('#resultSummary'),
  moveStick: document.querySelector('#moveStick'),
  aimStick: document.querySelector('#aimStick'),
  mobileDash: document.querySelector('#mobileDash'),
  characterPicker: document.querySelector('#characterPicker'),
  characterDetails: document.querySelector('#characterDetails'),
  upgradeScreen: document.querySelector('#upgradeScreen'),
  upgradeChoices: document.querySelector('#upgradeChoices'),
  upgradeBack: document.querySelector('#upgradeBackBtn'),
  secondaryBtn: document.querySelector('#secondaryBtn'),
  specialBtn: document.querySelector('#specialBtn'),
  secondaryName: document.querySelector('#secondaryName'),
  secondaryStatus: document.querySelector('#secondaryStatus'),
  specialName: document.querySelector('#specialName'),
  specialStatus: document.querySelector('#specialStatus'),
  upgradeBadge: document.querySelector('#upgradeBadge'),
  setupMatch: document.querySelector('#setupMatch'),
  setupCharacter: document.querySelector('#setupCharacter'),
  setupTitle: document.querySelector('#setupTitle'),
  setupDescription: document.querySelector('#setupDescription'),
  setupSummary: document.querySelector('#setupSummary'),
  mapName: document.querySelector('#mapName'),
  mapDetail: document.querySelector('#mapDetail'),
  mapDimensions: document.querySelector('#mapDimensions'),
  formatBadge: document.querySelector('#formatBadge'),
  mobileBtn: document.querySelector('#mobileBtn'),
  arenaPreview: document.querySelector('#arenaPreview'),
  safeNotice: document.querySelector('#safeNotice'),
};

const state = {
  mode: 'lobby',
  previousMode: 'playing',
  matchMode: 'turf',
  teamSize: 2,
  mapChoice: 'switchyard',
  activeMap: 'switchyard',
  lastRandomMap: null,
  layoutSeed: 1,
  layoutVariant: 1,
  mobileControls: matchMedia('(pointer: coarse)').matches,
  setupStep: 'match',
  playerTeam: 1,
  characterId: 'vex',
  upgradeId: null,
  upgradeOffers: [],
  difficulty: 'tactical',
  time: MATCH_LENGTH,
  countdown: 3.25,
  overtime: false,
  overtimeTime: 0,
  agents: [],
  projectiles: [],
  particles: [],
  texts: [],
  effects: [],
  paint: new Uint8Array(COLS * ROWS),
  paintable: new Uint8Array(COLS * ROWS),
  paintCounts: [0, 0, 0],
  totalPaintable: 0,
  player: null,
  nextId: 1,
  debug: false,
  sound: true,
  shake: 0,
  flash: 0,
  lastTimestamp: 0,
  hudTimer: 0,
  teamPlanTimer: 0,
  danger: [null, ...TEAM_IDS.map(() => new Float32Array(NAV_COLS * NAV_ROWS))],
  teamMemory: [null, ...TEAM_IDS.map(() => new Map())],
  claims: [null, ...TEAM_IDS.map(() => new Map())],
  laneReward: [null, ...TEAM_IDS.map(() => new Float32Array(12))],
  modeScores: [0, 0, 0],
  zones: [],
  vision: [null, ...TEAM_IDS.map(() => new Set())],
  camera: { x: WORLD.w * 0.5, y: WORLD.h * 0.5, followId: null },
  autoLock: true,
  lockTargetId: null,
  lockLostAt: 0,
  minimapTimer: 0,
};

const input = {
  keys: new Set(),
  mouseX: WORLD.w * 0.5,
  mouseY: WORLD.h * 0.5,
  pointerClientX: 0,
  pointerClientY: 0,
  pointerInside: false,
  mouseDown: false,
  moveTouch: { x: 0, y: 0 },
  aimTouch: { x: 0, y: 0, active: false },
  gamepadAimActive: false,
  gamepadFire: false,
  gamepadSecondary: false,
  gamepadSpecial: false,
  dashRequested: false,
  secondaryRequested: false,
  specialRequested: false,
};

const view = { dpr: 1, width: 0, height: 0, scale: 1, ox: 0, oy: 0, visibleW: WORLD.w, visibleH: WORLD.h };
const minimapCtx = dom.minimapCanvas.getContext('2d');
const previewCtx = dom.arenaPreview.getContext('2d');
const fogCanvas = document.createElement('canvas');
const fogCtx = fogCanvas.getContext('2d');

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const leadingRival = (team) => TEAM_IDS.filter((id) => id !== team).sort((a, b) => getModeScore(b) - getModeScore(a))[0];
const rivalTerritory = (team) => Math.max(...TEAM_IDS.filter((id) => id !== team).map(territoryPercent));
const hash = (x, y = 0) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const botTuning = (bot) => DIFFICULTY[bot.team === state.playerTeam ? 'tactical' : state.difficulty];
const normalize = (x, y) => {
  const length = Math.hypot(x, y);
  return length > 0.0001 ? { x: x / length, y: y / length, length } : { x: 0, y: 0, length: 0 };
};

class SoundEngine {
  constructor() {
    this.context = null;
    this.lastShot = 0;
  }

  init() {
    if (!state.sound) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!this.context) this.context = new AudioContextClass();
    if (this.context.state === 'suspended') this.context.resume();
  }

  tone(freq = 440, duration = 0.08, type = 'sine', volume = 0.035, slide = 0) {
    if (!state.sound) return;
    this.init();
    if (!this.context) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  shot(isPlayer) {
    const now = performance.now();
    if (!isPlayer || now - this.lastShot < 65) return;
    this.lastShot = now;
    this.tone(235, 0.045, 'square', 0.018, -80);
  }

  hit() { this.tone(720, 0.055, 'triangle', 0.035, 180); }
  dash() { this.tone(180, 0.16, 'sawtooth', 0.045, 540); }
  down() { this.tone(130, 0.28, 'square', 0.045, -80); }
  tick(high = false) { this.tone(high ? 880 : 520, 0.09, 'sine', 0.04, high ? 220 : 0); }
  swing() { this.tone(380, 0.13, 'triangle', 0.025, 210); }
}

const sound = new SoundEngine();

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  view.width = Math.max(1, rect.width);
  view.height = Math.max(1, rect.height);
  canvas.width = Math.round(view.width * view.dpr);
  canvas.height = Math.round(view.height * view.dpr);
  fogCanvas.width = canvas.width;
  fogCanvas.height = canvas.height;
  updateViewTransform(true);
}

function updateViewTransform(snap = false) {
  const lobbyScale = Math.min(view.width / WORLD.w, view.height / WORLD.h);
  const portrait = view.height > view.width * 1.05;
  const targetScale = state.mode === 'lobby'
    ? lobbyScale
    : Math.max(view.width / (portrait ? 610 : 1030), view.height / (portrait ? 760 : 625));
  view.scale = snap ? targetScale : lerp(view.scale, targetScale, 0.12);
  view.visibleW = view.width / Math.max(0.001, view.scale);
  view.visibleH = view.height / Math.max(0.001, view.scale);
  if (state.mode === 'lobby') {
    state.camera.x = WORLD.w * 0.5;
    state.camera.y = WORLD.h * 0.5;
  }
  const halfW = view.visibleW * 0.5;
  const halfH = view.visibleH * 0.5;
  state.camera.x = view.visibleW >= WORLD.w ? WORLD.w * 0.5 : clamp(state.camera.x, halfW, WORLD.w - halfW);
  state.camera.y = view.visibleH >= WORLD.h ? WORLD.h * 0.5 : clamp(state.camera.y, halfH, WORLD.h - halfH);
  view.ox = view.width * 0.5 - state.camera.x * view.scale;
  view.oy = view.height * 0.5 - state.camera.y * view.scale;
}

function updateCamera(dt) {
  if (!state.player) return;
  let followed = state.player.alive ? state.player : state.agents.find((a) => a.alive && a.team === state.playerTeam);
  if (!followed) followed = state.player;
  state.camera.followId = followed.id;
  const lookAhead = followed.isPlayer && followed.alive ? 46 : 0;
  const targetX = followed.x + Math.cos(followed.angle) * lookAhead;
  const targetY = followed.y + Math.sin(followed.angle) * lookAhead;
  const follow = 1 - Math.exp(-Math.max(0, dt) * 6.5);
  state.camera.x = lerp(state.camera.x, targetX, follow);
  state.camera.y = lerp(state.camera.y, targetY, follow);
  updateViewTransform();
  if (input.pointerInside) {
    const pointer = screenToWorld(input.pointerClientX, input.pointerClientY);
    input.mouseX = pointer.x;
    input.mouseY = pointer.y;
  }
}

function screenToWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clamp((clientX - rect.left - view.ox) / view.scale, 0, WORLD.w),
    y: clamp((clientY - rect.top - view.oy) / view.scale, 0, WORLD.h),
  };
}

function worldToScreen(x, y) {
  return { x: x * view.scale + view.ox, y: y * view.scale + view.oy };
}

function closestOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / Math.max(0.0001, dx * dx + dy * dy), 0, 1);
  return { x: x1 + dx * t, y: y1 + dy * t };
}

function closestOnArc(x, y, arc) {
  const full = Math.PI * 2;
  const angle = Math.atan2(y - arc.cy, x - arc.cx);
  const relative = ((angle - arc.start) % full + full) % full;
  let selected = angle;
  if (relative > arc.span) {
    const a = { x: arc.cx + Math.cos(arc.start) * arc.r, y: arc.cy + Math.sin(arc.start) * arc.r };
    const b = { x: arc.cx + Math.cos(arc.start + arc.span) * arc.r, y: arc.cy + Math.sin(arc.start + arc.span) * arc.r };
    return Math.hypot(x - a.x, y - a.y) < Math.hypot(x - b.x, y - b.y) ? a : b;
  }
  return { x: arc.cx + Math.cos(selected) * arc.r, y: arc.cy + Math.sin(selected) * arc.r };
}

function obstacleContains(o, x, y, pad = 0) {
  if (x < o.x - pad || x > o.x + o.w + pad || y < o.y - pad || y > o.y + o.h + pad) return false;
  if (o.kind !== 'arc') return true;
  const nearest = closestOnArc(x, y, o);
  return Math.hypot(x - nearest.x, y - nearest.y) < o.thickness / 2 + pad;
}

function pointInObstacle(x, y, pad = 0) {
  return obstacles.some((o) => obstacleContains(o, x, y, pad));
}

function pointInSafeZone(point, team) {
  const base = TEAM[team];
  return Math.hypot(point.x - base.spawnX, point.y - base.spawnY) <= SAFE_RADIUS;
}

function isInOwnSafeZone(agent) { return pointInSafeZone(agent, agent.team); }

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let n = value;
    n = Math.imul(n ^ n >>> 15, n | 1);
    n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}

function buildMapLayout(mapId, width, height, teamSize, seed) {
  const random = seededRandom(seed);
  const result = [];
  const scale = teamSize === 1 ? 0.82 : 1;
  const jitterX = (random() - 0.5) * 34;
  const jitterY = (random() - 0.5) * 32;
  const arc = (cx, cy, radius, start, span = Math.PI) => {
    const r = radius * scale;
    const thickness = 28 * scale;
    const o = { kind: 'arc', cx, cy, r, start, span, thickness, x: cx - r - thickness / 2, y: cy - r - thickness / 2, w: 2 * r + thickness, h: 2 * r + thickness, segments: [] };
    for (let i = 0; i < 14; i += 1) {
      const a = start + span * i / 14;
      const b = start + span * (i + 1) / 14;
      o.segments.push({ x1: cx + Math.cos(a) * r, y1: cy + Math.sin(a) * r, x2: cx + Math.cos(b) * r, y2: cy + Math.sin(b) * r });
    }
    result.push(o);
  };
  const box = (cx, cy, w, h, kind = 'crate') => result.push({ x: cx - w * scale / 2, y: cy - h * scale / 2, w: w * scale, h: h * scale, kind });
  if (mapId === 'switchyard') {
    for (const o of BASE_OBSTACLES.filter((item) => teamSize > 1 || item.kind !== 'tank')) {
      const side = o.x + o.w / 2 < 800 ? 1 : -1;
      const vertical = o.y + o.h / 2 < 450 ? 1 : -1;
      const laneY = o.kind === 'bridge' ? height * (vertical === 1 ? 0.25 : 0.75) : (o.y + o.h / 2) / 900 * height;
      box((o.x + o.w / 2) / 1600 * width + side * jitterX, laneY + vertical * jitterY, o.w, o.h, o.kind);
    }
  } else if (mapId === 'crescent') {
    const tilt = (random() - 0.5) * 0.25;
    for (const y of [0.29, 0.71]) {
      arc(width * 0.31 + jitterX, height * y + (y < 0.5 ? jitterY : -jitterY), 100, Math.PI / 2 + tilt);
      arc(width * 0.69 - jitterX, height * y + (y < 0.5 ? jitterY : -jitterY), 100, -Math.PI / 2 - tilt);
    }
    for (const y of [0.34, 0.66]) box(width / 2, height * y, 126 + random() * 22, 34, 'bridge');
    box(width * 0.22, height / 2 - jitterY, 64, 104);
    box(width * 0.78, height / 2 - jitterY, 64, 104);
  } else {
    for (const side of [-1, 1]) {
      arc(width / 2 + side * width * 0.135, height / 2, 105, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      for (const y of [0.28, 0.72]) {
        box(width / 2 + side * width * 0.27 + side * jitterX, height * y + (y < 0.5 ? jitterY : -jitterY), 156, 65, 'bridge');
        box(width / 2 + side * width * 0.09, height * y, 58, 76, 'crate');
      }
    }
  }
  if (teamSize >= 3) {
    const lane = 0.34 + random() * 0.025;
    for (const side of [-1, 1]) {
      for (const y of [lane, 1 - lane]) box(width / 2 + side * width * 0.32, height * y, 72, 48);
    }
  }
  return result;
}

function configureArena() {
  const profile = MATCH_SIZES[state.teamSize];
  WORLD.w = profile.w;
  WORLD.h = profile.h;
  COLS = WORLD.w / CELL;
  ROWS = WORLD.h / CELL;
  NAV_COLS = Math.ceil(WORLD.w / NAV);
  NAV_ROWS = Math.ceil(WORLD.h / NAV);
  obstacles = buildMapLayout(state.activeMap, WORLD.w, WORLD.h, state.teamSize, state.layoutSeed);
  TEAM[1].spawnX = 110;
  TEAM[2].spawnX = WORLD.w - 110;
  for (const team of TEAM_IDS) TEAM[team].spawnY = WORLD.h / 2;
  state.paint = new Uint8Array(COLS * ROWS);
  state.paintable = new Uint8Array(COLS * ROWS);
  state.danger = [null, ...TEAM_IDS.map(() => new Float32Array(NAV_COLS * NAV_ROWS))];
  state.zones = [0.13, 0.5, 0.87].map((y, index) => ({
    id: String.fromCharCode(65 + index), x: WORLD.w / 2, y: WORLD.h * y,
    radius: state.teamSize === 1 ? 78 : 96, capture: 0, captureTeam: 0, owner: 0, contested: false,
  }));
  buildPaintMask();
}

function sectorAt(x, y) {
  return clamp(Math.floor(x / WORLD.w * 4), 0, 3) + clamp(Math.floor(y / WORLD.h * 3), 0, 2) * 4;
}

function buildPaintMask() {
  state.totalPaintable = 0;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const x = col * CELL + CELL / 2;
      const y = row * CELL + CELL / 2;
      const index = row * COLS + col;
      const valid = x > 32 && x < WORLD.w - 32 && y > 32 && y < WORLD.h - 32 && !pointInObstacle(x, y, 2)
        && !TEAM_IDS.some((team) => pointInSafeZone({ x, y }, team));
      state.paintable[index] = valid ? 1 : 0;
      if (valid) state.totalPaintable += 1;
    }
  }
}

function paintOwnerAt(x, y) {
  const base = TEAM_IDS.find((team) => pointInSafeZone({ x, y }, team));
  if (base) return base;
  const col = clamp(Math.floor(x / CELL), 0, COLS - 1);
  const row = clamp(Math.floor(y / CELL), 0, ROWS - 1);
  return state.paint[row * COLS + col];
}

function paintAt(x, y, radius, team, particles = true) {
  const minCol = clamp(Math.floor((x - radius) / CELL), 0, COLS - 1);
  const maxCol = clamp(Math.floor((x + radius) / CELL), 0, COLS - 1);
  const minRow = clamp(Math.floor((y - radius) / CELL), 0, ROWS - 1);
  const maxRow = clamp(Math.floor((y + radius) / CELL), 0, ROWS - 1);
  let changed = 0;

  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const index = row * COLS + col;
      if (!state.paintable[index]) continue;
      const cx = col * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;
      const jitter = 0.84 + hash(col, row) * 0.28;
      if (Math.hypot(cx - x, cy - y) > radius * jitter) continue;
      const previous = state.paint[index];
      if (previous === team) continue;
      if (previous) state.paintCounts[previous] -= 1;
      state.paint[index] = team;
      state.paintCounts[team] += 1;
      changed += 1;
    }
  }

  if (particles && state.particles.length < 420) {
    const count = Math.min(7, 2 + Math.round(radius / 14));
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const speed = 25 + Math.random() * 100;
      state.particles.push({
        type: 'drop', team, x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        life: 0.28 + Math.random() * 0.24, maxLife: 0.52, size: 2 + Math.random() * 5,
      });
    }
  }
  return changed;
}

function resetPaint() {
  state.paint.fill(0);
  state.paintCounts = [0, 0, 0];
  for (const team of TEAM_IDS) {
    const base = TEAM[team];
    paintAt(base.spawnX + (team === 1 ? 175 : -175), base.spawnY, 68, team, false);
  }
}

function makeAgent(team, isPlayer, slot, role) {
  const angleToCenter = team === 1 ? 0 : Math.PI;
  const x = TEAM[team].spawnX;
  const y = TEAM[team].spawnY + (slot - (state.teamSize - 1) / 2) * 60;
  const heroIds = state.lineups[team];
  const characterId = isPlayer ? state.characterId : heroIds[slot];
  const hero = CHARACTERS[characterId];
  const upgradeId = isPlayer ? state.upgradeId : UPGRADES[Math.floor(Math.random() * UPGRADES.length)].id;
  const maxHp = upgradeId === 'hull' ? 135 : 100;
  const agent = {
    id: state.nextId++,
    team,
    isPlayer,
    characterId,
    upgradeId,
    name: hero.name,
    x, y, spawnX: x, spawnY: y,
    vx: 0, vy: 0,
    radius: 20,
    angle: angleToCenter,
    hp: maxHp,
    maxHp,
    ammo: 100,
    alive: true,
    respawn: 0,
    shield: 1.2,
    dashCd: 0,
    dashTime: 0,
    dashDir: { x: Math.cos(angleToCenter), y: Math.sin(angleToCenter) },
    shotCd: 0,
    secondaryCd: 0,
    specialCharge: 25,
    overdrive: 0,
    slowTime: 0,
    abilityThink: Math.random() * 0.3,
    secondaryUses: 0,
    specialUses: 0,
    lastDamage: -99,
    firing: false,
    role: hero.role,
    baseRole: hero.role,
    intent: 'paint',
    intentLabel: 'SCANNING TURF',
    target: { x: lerp(x, WORLD.w / 2, 0.65), y: lerp(y, WORLD.h / 2, 0.65) },
    targetEnemy: null,
    targetAlly: null,
    path: [],
    pathIndex: 0,
    pathTimer: Math.random() * 0.4,
    retargetTimer: 0.4 + Math.random() * 0.7,
    thinkTimer: Math.random() * 0.16,
    goalLock: 0,
    goalScore: 0,
    strafe: Math.random() < 0.5 ? -1 : 1,
    strafeTimer: 0.5 + Math.random(),
    aimNoise: 0,
    utilities: {},
    stuck: 0,
    lastX: x,
    lastY: y,
    paintContribution: 0,
    damageContribution: 0,
  };
  resolveMapCollision(agent);
  agent.spawnX = agent.x;
  agent.spawnY = agent.y;
  return agent;
}

function resetMatch() {
  if (state.mapChoice === 'random') {
    const choices = Object.keys(MAPS).filter((id) => id !== state.lastRandomMap);
    state.activeMap = choices[Math.floor(Math.random() * choices.length)];
    state.lastRandomMap = state.activeMap;
  } else state.activeMap = state.mapChoice;
  state.layoutSeed = (Math.floor(Math.random() * 4294967295) + state.layoutSeed + 1) >>> 0;
  state.layoutVariant = state.layoutSeed % 3 + 1;
  configureArena();
  state.time = MATCH_MODES[state.matchMode].time;
  state.countdown = 3.2;
  state.overtime = false;
  state.overtimeTime = 0;
  state.modeScores = [0, 0, 0];
  state.lockTargetId = null;
  state.lockLostAt = 0;
  state.minimapTimer = 0;
  for (const team of TEAM_IDS) state.vision[team].clear();
  for (const zone of state.zones) {
    zone.capture = 0;
    zone.captureTeam = 0;
    zone.owner = 0;
    zone.contested = false;
  }
  state.projectiles.length = 0;
  state.particles.length = 0;
  state.texts.length = 0;
  state.effects.length = 0;
  state.agents.length = 0;
  state.nextId = 1;
  input.secondaryRequested = false;
  input.specialRequested = false;
  input.dashRequested = false;
  input.mouseDown = false;
  for (const team of TEAM_IDS) {
    state.danger[team].fill(0);
    state.teamMemory[team].clear();
    state.laneReward[team].fill(0);
  }
  resetPaint();

  const heroIds = Object.keys(CHARACTERS);
  state.lineups = [null];
  for (const team of TEAM_IDS) {
    const available = heroIds.filter((id) => team !== state.playerTeam || id !== state.characterId);
    for (let i = available.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }
    state.lineups[team] = team === state.playerTeam ? [state.characterId, ...available] : available;
  }
  for (const team of TEAM_IDS) {
    for (let slot = 0; slot < state.teamSize; slot += 1) {
      const isPlayer = team === state.playerTeam && slot === 0;
      const agent = makeAgent(team, isPlayer, slot);
      state.agents.push(agent);
      if (isPlayer) state.player = agent;
    }
  }

  buildRosters();
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  state.camera.followId = state.player.id;
  updateViewTransform(true);
  updateTeamRoles();
  updateHUD(true);
  dom.eventFeed.innerHTML = '';
  addEvent(`${MAPS[state.activeMap].name.toUpperCase()} // LAYOUT ${state.layoutVariant}`, state.playerTeam, 'acid');
  addEvent(state.matchMode === 'zones' ? 'BOTS CLAIMING SECTORS' : state.matchMode === 'clash' ? 'BOTS FORMING HUNT PAIRS' : 'BOTS ASSIGNING LANES', state.playerTeam);
}

function buildRosters() {
  const rosters = [null, dom.cyanRoster, dom.coralRoster];
  for (const team of TEAM_IDS) rosters[team].innerHTML = '';
  for (const agent of state.agents) {
    const unit = document.createElement('span');
    unit.className = `roster-unit ${TEAM[agent.team].css}${agent.isPlayer ? ' player' : ''}`;
    unit.textContent = characterOf(agent).icon;
    unit.dataset.agent = String(agent.id);
    unit.title = `${agent.name}${agent.isPlayer ? ' (You)' : ''} — ${characterOf(agent).special}`;
    rosters[agent.team].append(unit);
  }
}

function addEvent(message, team = 1, tone = '') {
  const item = document.createElement('div');
  item.className = `event-item ${tone || TEAM[team]?.css || ''}`;
  item.textContent = message;
  dom.eventFeed.prepend(item);
  while (dom.eventFeed.children.length > 2) dom.eventFeed.lastElementChild.remove();
  window.setTimeout(() => {
    item.style.opacity = '0';
    item.style.transform = 'translateX(-6px)';
  }, 3200);
  window.setTimeout(() => item.remove(), 3650);
}

function addWorldText(x, y, text, team = 0) {
  state.texts.push({ x, y, text, team, life: 0.85, maxLife: 0.85 });
}

function renderCharacterPicker() {
  dom.characterPicker.innerHTML = '';
  for (const [id, hero] of Object.entries(CHARACTERS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `character-choice${id === state.characterId ? ' selected' : ''}`;
    button.dataset.character = id;
    button.style.setProperty('--hero', hero.accent);
    button.setAttribute('aria-pressed', String(id === state.characterId));
    button.innerHTML = `<span class="character-portrait">${hero.icon}</span><strong>${hero.name}</strong><small>${ROLE_DATA[hero.role].label}</small>`;
    button.addEventListener('click', () => {
      state.characterId = id;
      renderCharacterPicker();
      updateSetupSummary();
      sound.tick(true);
    });
    dom.characterPicker.append(button);
  }
  const hero = CHARACTERS[state.characterId];
  dom.characterDetails.style.setProperty('--hero', hero.accent);
  dom.characterDetails.innerHTML = `<div class="hero-heading"><span>${hero.icon}</span><div><strong>${hero.name}</strong><small>${hero.title}</small></div></div>
    <div class="weapon-row"><kbd>CLICK</kbd><div><small>PRIMARY</small><strong>${hero.primary}</strong><p>Your main ink weapon. Hold click to spray.</p></div></div>
    <div class="weapon-row"><kbd>E</kbd><div><small>SECONDARY · ${hero.cooldown}s COOLDOWN</small><strong>${hero.secondary}</strong><p>${hero.secondaryText}</p></div></div>
    <div class="weapon-row"><kbd>F</kbd><div><small>SPECIAL · CHARGE TO 100%</small><strong>${hero.special}</strong><p>${hero.specialText}</p></div></div>`;
}

function updateSetupSummary() {
  const size = MATCH_SIZES[state.teamSize];
  const map = MAPS[state.mapChoice];
  dom.mapName.textContent = map?.name || 'Random map';
  dom.mapDetail.textContent = map?.note || 'A surprise pick from all three maps. Random avoids repeating the previous random map.';
  dom.mapDimensions.textContent = `${size.label} · ${size.w.toLocaleString()} × ${size.h.toLocaleString()}`;
  dom.setupSummary.textContent = `${state.teamSize}v${state.teamSize} · ${map?.name || 'Random map'} · ${MATCH_MODES[state.matchMode].label} · ${CHARACTERS[state.characterId].name} · ${TEAM[state.playerTeam].name}`;
  drawArenaPreview();
}

function drawTacticalTerrain(context, layout, width, height, screenW, screenH) {
  context.save();
  context.scale(screenW / width, screenH / height);
  for (const o of layout) {
    if (o.kind === 'arc') {
      context.strokeStyle = '#8294b0';
      context.lineWidth = o.thickness;
      context.lineCap = 'round';
      context.beginPath(); context.arc(o.cx, o.cy, o.r, o.start, o.start + o.span); context.stroke();
    } else {
      context.fillStyle = '#535f7d';
      context.fillRect(o.x, o.y, o.w, o.h);
    }
  }
  for (const team of TEAM_IDS) {
    const x = team === 1 ? 110 : width - 110;
    context.fillStyle = `rgba(${TEAM[team].rgb},0.12)`;
    context.strokeStyle = TEAM[team].color;
    context.lineWidth = 6;
    context.beginPath(); context.arc(x, height / 2, SAFE_RADIUS, 0, Math.PI * 2); context.fill(); context.stroke();
  }
  context.restore();
}

function drawArenaPreview() {
  const mapId = state.mapChoice === 'random' ? 'crescent' : state.mapChoice;
  const profile = MATCH_SIZES[state.teamSize];
  const w = dom.arenaPreview.width;
  const h = dom.arenaPreview.height;
  previewCtx.clearRect(0, 0, w, h);
  previewCtx.fillStyle = MAPS[mapId].floor;
  previewCtx.fillRect(0, 0, w, h);
  drawTacticalTerrain(previewCtx, buildMapLayout(mapId, profile.w, profile.h, state.teamSize, 157), profile.w, profile.h, w, h);
  if (state.mapChoice === 'random') {
    previewCtx.fillStyle = 'rgba(9,13,26,0.58)';
    previewCtx.fillRect(0, 0, w, h);
    previewCtx.fillStyle = '#f4f5fa';
    previewCtx.font = '800 40px system-ui,sans-serif';
    previewCtx.textAlign = 'center';
    previewCtx.fillText('?', w / 2, h / 2 + 14);
  }
}

function setSetupStep(step) {
  state.setupStep = step;
  state.mode = step === 'upgrade' ? 'draft' : 'lobby';
  dom.start.hidden = false;
  dom.start.scrollTop = 0;
  dom.pause.hidden = true;
  dom.result.hidden = true;
  dom.hud.classList.remove('visible');
  dom.setupMatch.hidden = step !== 'match';
  dom.setupCharacter.hidden = step !== 'character';
  dom.upgradeScreen.hidden = step !== 'upgrade';
  dom.deploy.hidden = step === 'upgrade';
  dom.upgradeBack.hidden = step === 'match';
  dom.deploy.textContent = step === 'match' ? 'Choose character →' : 'Choose upgrade →';
  dom.upgradeBack.textContent = step === 'character' ? '← Match settings' : '← Character';
  const copy = {
    match: ['Set up your match', 'Pick your team size and rules. AI fills the other slots.'],
    character: ['Choose your character', 'One primary weapon, one secondary, one special.'],
    upgrade: ['Pick one upgrade', 'Choose a bonus for this match. Select a card to deploy.'],
  }[step];
  dom.setupTitle.textContent = copy[0];
  dom.setupDescription.textContent = copy[1];
  document.querySelectorAll('[data-step]').forEach((button) => {
    const active = button.dataset.step === step;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'step' : 'false');
  });
  updateSetupSummary();
}

function beginUpgradeDraft() {
  input.mouseDown = false;
  setSetupStep('upgrade');
  const shuffled = [...UPGRADES];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  state.upgradeOffers = shuffled.slice(0, 3).map((upgrade) => upgrade.id);
  state.upgradeId = null;
  dom.upgradeChoices.innerHTML = '';
  for (const upgrade of shuffled.slice(0, 3)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'upgrade-choice';
    button.dataset.upgrade = upgrade.id;
    button.innerHTML = `<span class="upgrade-icon">${upgrade.icon}</span><strong>${upgrade.name}</strong><b>${upgrade.stat}</b><p>${upgrade.text}</p><small>Pick & play →</small>`;
    button.addEventListener('click', () => {
      if (state.mode !== 'draft') return;
      state.upgradeId = upgrade.id;
      startMatch();
    });
    dom.upgradeChoices.append(button);
  }
}

function startMatch() {
  if (!state.upgradeId) return beginUpgradeDraft();
  sound.init();
  resetMatch();
  state.mode = 'playing';
  updateViewTransform(true);
  dom.start.hidden = true;
  dom.pause.hidden = true;
  dom.result.hidden = true;
  dom.upgradeScreen.hidden = true;
  dom.hud.classList.add('visible');
  dom.playerName.textContent = `${CHARACTERS[state.characterId].name} // ${TEAM[state.playerTeam].name}`;
  dom.playerName.style.color = TEAM[state.playerTeam].color;
  dom.difficultyBadge.textContent = DIFFICULTY[state.difficulty].label;
  dom.minimapMode.textContent = MATCH_MODES[state.matchMode].short;
  dom.formatBadge.textContent = `${state.teamSize}v${state.teamSize} · ${MAPS[state.activeMap].name} · Layout ${state.layoutVariant}`;
  canvas.focus({ preventScroll: true });
}

function showSetup() {
  setSetupStep('match');
}

function togglePause(force) {
  if (!['playing', 'paused'].includes(state.mode)) return;
  const shouldPause = typeof force === 'boolean' ? force : state.mode === 'playing';
  if (shouldPause) {
    state.previousMode = 'playing';
    state.mode = 'paused';
    dom.pause.hidden = false;
    input.mouseDown = false;
  } else {
    state.mode = 'playing';
    dom.pause.hidden = true;
    canvas.focus({ preventScroll: true });
  }
}

function finishMatch() {
  if (state.mode === 'ended') return;
  state.mode = 'ended';
  input.mouseDown = false;
  const standings = TEAM_IDS.map((team) => ({ team, score: getModeScore(team) })).sort((a, b) => b.score - a.score);
  const winner = Math.abs(standings[0].score - standings[1].score) < 0.001 ? 0 : standings[0].team;
  const playerWon = winner === state.playerTeam;
  dom.result.hidden = false;
  dom.resultCyan.textContent = formatModeScore(getModeScore(1));
  dom.resultCoral.textContent = formatModeScore(getModeScore(2));
  dom.resultTitle.textContent = winner ? `${TEAM[winner].name} WINS.` : 'DEAD EVEN.';
  dom.resultTitle.style.color = winner ? TEAM[winner].color : '#f7f3e8';
  dom.resultKicker.innerHTML = `<i></i> ${MATCH_MODES[state.matchMode].label} // FINAL`;

  const playerBots = state.agents.filter((a) => a.team === state.playerTeam && !a.isPlayer);
  const mainIntent = playerBots.reduce((acc, bot) => {
    acc[bot.intent] = (acc[bot.intent] || 0) + 1;
    return acc;
  }, {});
  const dominant = Object.entries(mainIntent).sort((a, b) => b[1] - a[1])[0]?.[0] || 'paint';
  if (!winner) dom.resultSummary.textContent = 'The leading squads finished level. No one could break the deadlock.';
  else if (state.matchMode === 'zones' && playerWon) dom.resultSummary.textContent = 'Your squad rotated between sectors, shared vision, and held the scoring line under pressure.';
  else if (state.matchMode === 'clash' && playerWon) dom.resultSummary.textContent = 'Your squad grouped intelligently, focused exposed targets, and won the disable race.';
  else if (playerWon && dominant === 'defend') dom.resultSummary.textContent = 'Your squad read the late lead, protected valuable lanes, and closed the yard cleanly.';
  else if (playerWon) dom.resultSummary.textContent = 'Your squad spread its roles, reclaimed contested ground, and converted pressure into territory.';
  else dom.resultSummary.textContent = 'The rival squad converted its information faster. Use team vision and change your approach on the rematch.';
  sound.tone(playerWon ? 520 : 180, 0.55, playerWon ? 'triangle' : 'sawtooth', 0.05, playerWon ? 420 : -80);
}

function territoryPercent(team) {
  return (state.paintCounts[team] / Math.max(1, state.totalPaintable)) * 100;
}

function getModeScore(team) {
  return state.matchMode === 'turf' ? territoryPercent(team) : state.modeScores[team];
}

function formatModeScore(score) {
  return state.matchMode === 'turf' ? `${score.toFixed(1)}%` : String(Math.floor(score));
}

function navIndex(col, row) { return row * NAV_COLS + col; }

function navFromWorld(x, y) {
  return {
    col: clamp(Math.floor(x / NAV), 0, NAV_COLS - 1),
    row: clamp(Math.floor(y / NAV), 0, NAV_ROWS - 1),
  };
}

function worldFromNav(col, row) {
  return { x: clamp(col * NAV + NAV / 2, 38, WORLD.w - 38), y: clamp(row * NAV + NAV / 2, 38, WORLD.h - 38) };
}

function navBlocked(col, row, team = 0) {
  if (col < 0 || row < 0 || col >= NAV_COLS || row >= NAV_ROWS) return true;
  const p = worldFromNav(col, row);
  return pointInObstacle(p.x, p.y, 24) || (team && TEAM_IDS.some((id) => id !== team && Math.hypot(p.x - TEAM[id].spawnX, p.y - TEAM[id].spawnY) < SAFE_RADIUS + 28));
}

function nearestOpenNav(col, row, team = 0) {
  if (!navBlocked(col, row, team)) return { col, row };
  for (let radius = 1; radius < 5; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const nc = col + dx;
        const nr = row + dy;
        if (!navBlocked(nc, nr, team)) return { col: nc, row: nr };
      }
    }
  }
  return { col, row };
}

function findPath(agent, target) {
  const hostileBase = TEAM_IDS.find((team) => team !== agent.team && pointInSafeZone(target, team));
  if (hostileBase) target = { x: TEAM[hostileBase].spawnX + (hostileBase === 1 ? 1 : -1) * (SAFE_RADIUS + 65), y: TEAM[hostileBase].spawnY };
  let start = navFromWorld(agent.x, agent.y);
  let goal = navFromWorld(target.x, target.y);
  start = nearestOpenNav(start.col, start.row, agent.team);
  goal = nearestOpenNav(goal.col, goal.row, agent.team);
  const startId = navIndex(start.col, start.row);
  const goalId = navIndex(goal.col, goal.row);
  if (startId === goalId) return [target];

  const count = NAV_COLS * NAV_ROWS;
  const g = new Float32Array(count);
  const f = new Float32Array(count);
  const came = new Int16Array(count);
  const opened = new Uint8Array(count);
  const closed = new Uint8Array(count);
  g.fill(99999);
  f.fill(99999);
  came.fill(-1);
  g[startId] = 0;
  f[startId] = Math.hypot(goal.col - start.col, goal.row - start.row);
  const open = [startId];
  opened[startId] = 1;
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  while (open.length) {
    let bestAt = 0;
    for (let i = 1; i < open.length; i += 1) if (f[open[i]] < f[open[bestAt]]) bestAt = i;
    const current = open.splice(bestAt, 1)[0];
    if (current === goalId) {
      const path = [];
      let cursor = current;
      while (cursor !== startId && cursor >= 0) {
        const col = cursor % NAV_COLS;
        const row = Math.floor(cursor / NAV_COLS);
        path.push(worldFromNav(col, row));
        cursor = came[cursor];
      }
      path.reverse();
      path.push(target);
      return path;
    }
    closed[current] = 1;
    const col = current % NAV_COLS;
    const row = Math.floor(current / NAV_COLS);
    for (const [dx, dy] of neighbors) {
      const nc = col + dx;
      const nr = row + dy;
      if (navBlocked(nc, nr, agent.team)) continue;
      if (dx && dy && (navBlocked(col + dx, row, agent.team) || navBlocked(col, row + dy, agent.team))) continue;
      const id = navIndex(nc, nr);
      if (closed[id]) continue;
      const point = worldFromNav(nc, nr);
      const owner = paintOwnerAt(point.x, point.y);
      const terrain = owner === agent.team ? 0.68 : owner === 0 ? 1.08 : 1.58;
      const danger = state.danger[agent.team][id] || 0;
      const diagonal = dx && dy ? 1.414 : 1;
      const tentative = g[current] + diagonal * terrain + danger * 1.35;
      if (tentative >= g[id]) continue;
      came[id] = current;
      g[id] = tentative;
      f[id] = tentative + Math.hypot(goal.col - nc, goal.row - nr);
      if (!opened[id]) {
        opened[id] = 1;
        open.push(id);
      }
    }
  }
  return [target];
}

function lineHitsRect(x1, y1, x2, y2, rect, pad = 0) {
  const left = rect.x - pad;
  const right = rect.x + rect.w + pad;
  const top = rect.y - pad;
  const bottom = rect.y + rect.h + pad;
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const checks = [[-dx, x1 - left], [dx, right - x1], [-dy, y1 - top], [dy, bottom - y1]];
  for (const [p, q] of checks) {
    if (p === 0 && q < 0) return false;
    if (p !== 0) {
      const r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

function hasLineOfSight(a, b) {
  return !obstacles.some((o) => lineHitsObstacle(a.x, a.y, b.x, b.y, o, 5));
}

function segmentDistanceSquared(ax, ay, bx, by, cx, cy, dx, dy) {
  const cross = (ux, uy, vx, vy) => ux * vy - uy * vx;
  const denominator = cross(bx - ax, by - ay, dx - cx, dy - cy);
  if (Math.abs(denominator) > 0.00001) {
    const t = cross(cx - ax, cy - ay, dx - cx, dy - cy) / denominator;
    const u = cross(cx - ax, cy - ay, bx - ax, by - ay) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  const a = closestOnSegment(ax, ay, cx, cy, dx, dy);
  const b = closestOnSegment(bx, by, cx, cy, dx, dy);
  const c = closestOnSegment(cx, cy, ax, ay, bx, by);
  const d = closestOnSegment(dx, dy, ax, ay, bx, by);
  return Math.min((ax - a.x) ** 2 + (ay - a.y) ** 2, (bx - b.x) ** 2 + (by - b.y) ** 2, (cx - c.x) ** 2 + (cy - c.y) ** 2, (dx - d.x) ** 2 + (dy - d.y) ** 2);
}

function lineHitsObstacle(x1, y1, x2, y2, obstacle, pad = 0) {
  if (!lineHitsRect(x1, y1, x2, y2, obstacle, pad)) return false;
  if (obstacle.kind !== 'arc') return true;
  const radiusSquared = (obstacle.thickness / 2 + pad + 0.6) ** 2;
  return obstacle.segments.some((s) => segmentDistanceSquared(x1, y1, x2, y2, s.x1, s.y1, s.x2, s.y2) <= radiusSquared);
}

function hasDirectVision(observer, point, radius = VISION_RADIUS) {
  return observer.alive && Math.hypot(observer.x - point.x, observer.y - point.y) <= radius && hasLineOfSight(observer, point);
}

function isPointVisibleToTeam(point, team) {
  return state.agents.some((ally) => ally.team === team && hasDirectVision(ally, point));
}

function isAgentVisibleToTeam(agent, team) {
  if (agent.team === team) return true;
  return agent.alive && state.vision[team].has(agent.id);
}

function updateVision() {
  for (const team of TEAM_IDS) {
    const visible = state.vision[team];
    visible.clear();
    for (const enemy of state.agents) {
      if (!enemy.alive || enemy.team === team) continue;
      if (state.agents.some((ally) => ally.team === team && hasDirectVision(ally, enemy))) visible.add(enemy.id);
    }
  }
}

function selectAutoLock(player, manualAngle, dt) {
  if (!state.autoLock || !player.alive) {
    state.lockTargetId = null;
    return null;
  }
  const now = performance.now() / 1000;
  const previous = state.agents.find((a) => a.id === state.lockTargetId && a.alive && a.team !== player.team);
  const validPrevious = previous && !isInOwnSafeZone(previous) && hasDirectVision(player, previous, VISION_RADIUS);
  let best = null;
  let bestScore = Infinity;
  for (const enemy of state.agents) {
    if (!enemy.alive || enemy.team === player.team || enemy.shield > 0 || isInOwnSafeZone(enemy)) continue;
    const d = dist(player, enemy);
    if (d > VISION_RADIUS || !hasDirectVision(player, enemy, VISION_RADIUS)) continue;
    const bearing = Math.atan2(enemy.y - player.y, enemy.x - player.x);
    const angle = Math.abs(angleDelta(manualAngle, bearing));
    const cone = enemy.id === state.lockTargetId ? 1.18 : 0.62;
    if (angle > cone) continue;
    const score = angle * 2.8 + d / 760 + enemy.hp / 500 - (enemy.id === state.lockTargetId ? 0.38 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  if (!best && validPrevious && now - state.lockLostAt < 0.12) best = previous;
  if (best) state.lockLostAt = now;
  if (best?.id !== state.lockTargetId) {
    state.lockTargetId = best?.id || null;
    if (best) sound.tone(760, 0.045, 'sine', 0.018, 180);
  }
  if (!best) state.lockTargetId = null;
  return best;
}

function nearestEnemyDistance(agent, point = agent) {
  let best = 9999;
  for (const other of state.agents) {
    if (!other.alive || other.team === agent.team || !isAgentVisibleToTeam(other, agent.team)) continue;
    best = Math.min(best, Math.hypot(other.x - point.x, other.y - point.y));
  }
  return best;
}

function visibleEnemies(bot) {
  const result = [];
  for (const enemy of state.agents) {
    if (!enemy.alive || enemy.team === bot.team || isInOwnSafeZone(enemy)) continue;
    const d = dist(bot, enemy);
    if (d > VISION_RADIUS) continue;
    const bearing = Math.atan2(enemy.y - bot.y, enemy.x - bot.x);
    const inCone = Math.abs(angleDelta(bot.angle, bearing)) < 1.35 || d < 185;
    if (inCone && hasLineOfSight(bot, enemy)) result.push({ enemy, d });
  }
  return result;
}

function samplePaintTarget(bot) {
  let best = bot.target || { x: WORLD.w / 2, y: WORLD.h / 2 };
  let bestScore = -999;
  const ownPct = territoryPercent(bot.team);
  const enemyPct = rivalTerritory(bot.team);
  const trailing = clamp((enemyPct - ownPct) / 12, -1, 1);
  const claimMap = state.claims[bot.team];
  const tuning = botTuning(bot);

  for (let i = 0; i < 52; i += 1) {
    const col = Math.floor(Math.random() * COLS);
    const row = Math.floor(Math.random() * ROWS);
    const index = row * COLS + col;
    if (!state.paintable[index]) continue;
    const x = col * CELL + CELL / 2;
    const y = row * CELL + CELL / 2;
    const owner = state.paint[index];
    const travel = Math.hypot(x - bot.x, y - bot.y) / 900;
    const center = 1 - Math.abs(x - WORLD.w / 2) / (WORLD.w / 2);
    const enemyDepth = Math.min(1, Math.hypot(x - TEAM[bot.team].spawnX, y - TEAM[bot.team].spawnY) / 950);
    const sector = sectorAt(x, y);
    const claimed = claimMap.get(sector) || 0;
    const dangerCell = navFromWorld(x, y);
    const danger = state.danger[bot.team][navIndex(dangerCell.col, dangerCell.row)] || 0;
    let value = owner && owner !== bot.team ? 1.55 : owner === 0 ? 0.92 : 0.05;
    value += center * 0.18 + trailing * enemyDepth * 0.28;
    value += state.laneReward[bot.team][sector] * 0.12;
    value -= travel * 0.64 + danger * 0.72 + claimed * 0.36 * tuning.coordination;
    if (bot.role === 'rover') value += enemyDepth * 0.2;
    if (value > bestScore) {
      bestScore = value;
      best = { x, y, sector };
    }
  }
  return best;
}

function sampleSafePoint(bot) {
  if (bot.hp < bot.maxHp * 0.4 || bot.ammo < 12) return { x: bot.spawnX, y: bot.spawnY };
  let best = { x: bot.spawnX, y: bot.spawnY };
  let bestScore = -999;
  for (let i = 0; i < 34; i += 1) {
    const col = Math.floor(Math.random() * COLS);
    const row = Math.floor(Math.random() * ROWS);
    const index = row * COLS + col;
    if (!state.paintable[index] || state.paint[index] !== bot.team) continue;
    const x = col * CELL + CELL / 2;
    const y = row * CELL + CELL / 2;
    const safety = nearestEnemyDistance(bot, { x, y }) / 700;
    const travel = Math.hypot(x - bot.x, y - bot.y) / 850;
    const homeBias = 1 - Math.hypot(x - bot.spawnX, y - bot.spawnY) / WORLD.w;
    const score = safety * 1.25 + homeBias * 0.2 - travel * 0.62;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

function selectZoneTarget(bot) {
  let selected = state.zones[1];
  let bestScore = -999;
  for (const zone of state.zones) {
    const distancePenalty = Math.hypot(zone.x - bot.x, zone.y - bot.y) / 1000;
    const ownPresence = state.agents.filter((a) => a.alive && a.team === bot.team && dist(a, zone) < zone.radius * 1.25).length;
    const enemyPresence = state.agents.filter((a) => a.alive && a.team !== bot.team && isAgentVisibleToTeam(a, bot.team) && dist(a, zone) < zone.radius * 1.25).length;
    const claimKey = 20 + zone.id.charCodeAt(0);
    const claimed = state.claims[bot.team].get(claimKey) || 0;
    let score = zone.owner === bot.team ? 0.56 : zone.owner === 0 ? 1.05 : 1.45;
    if (zone.contested) score += 0.62;
    score += enemyPresence * 0.24 - ownPresence * 0.13 - claimed * 0.28 * botTuning(bot).coordination;
    score -= distancePenalty * (bot.role === 'rover' ? 0.5 : 0.72);
    if (bot.role === 'guard' && zone.owner === bot.team) score += 0.38;
    if (score > bestScore) {
      bestScore = score;
      selected = zone;
    }
  }
  const slotAngle = ((bot.id * 2.399) + selected.id.charCodeAt(0)) % (Math.PI * 2);
  const spread = bot.role === 'guard' ? 0.5 : 0.32;
  return {
    x: selected.x + Math.cos(slotAngle) * selected.radius * spread,
    y: selected.y + Math.sin(slotAngle) * selected.radius * spread,
    zone: selected,
  };
}

function selectCombatTarget(bot, visible) {
  let best = null;
  let bestScore = -99;
  const teamFocus = state.teamMemory[bot.team].get('focus');
  const now = performance.now() / 1000;
  for (const sight of visible) {
    const enemy = sight.enemy;
    const weak = 1 - enemy.hp / enemy.maxHp;
    const rangeFit = 1 - Math.min(1, Math.abs(sight.d - 270) / 350);
    const support = state.agents.filter((a) => a.alive && a.team === enemy.team && a.id !== enemy.id && isAgentVisibleToTeam(a, bot.team) && dist(a, enemy) < 230).length;
    const threat = enemy.isPlayer ? 0.18 : 0;
    const focus = teamFocus?.id === enemy.id && now - teamFocus.seen < 2.4 ? 0.55 * botTuning(bot).coordination : 0;
    const score = weak * 1.4 + rangeFit * 0.55 + threat + focus - support * 0.24;
    if (score > bestScore) {
      bestScore = score;
      best = enemy;
    }
  }
  return best;
}

function botThink(bot) {
  if (!bot.alive) return;
  const now = performance.now() / 1000;
  const tuning = botTuning(bot);
  const visible = visibleEnemies(bot);
  for (const { enemy } of visible) {
    state.teamMemory[bot.team].set(enemy.id, { id: enemy.id, x: enemy.x, y: enemy.y, vx: enemy.vx, vy: enemy.vy, hp: enemy.hp, seen: now, source: bot.id });
  }

  const enemy = selectCombatTarget(bot, visible);
  const remembered = [...state.teamMemory[bot.team].entries()]
    .filter(([id, memory]) => id !== 'focus' && now - memory.seen < tuning.memory)
    .map(([, memory]) => memory)
    .sort((a, b) => (a.hp - b.hp) || (b.seen - a.seen))[0] || null;
  if (enemy && tuning.coordination > 0.5 && enemy.hp < 55) state.teamMemory[bot.team].set('focus', { id: enemy.id, seen: now });
  const nearbyEnemies = state.agents.filter((a) => a.alive && a.team !== bot.team && isAgentVisibleToTeam(a, bot.team) && dist(a, bot) < 310).length;
  const nearbyAllies = state.agents.filter((a) => a.alive && a.team === bot.team && a.id !== bot.id && dist(a, bot) < 310).length;
  const health = bot.hp / bot.maxHp;
  const ammo = bot.ammo / 100;
  const dangerCell = navFromWorld(bot.x, bot.y);
  const danger = clamp((state.danger[bot.team][navIndex(dangerCell.col, dangerCell.row)] || 0) / 2.2, 0, 1);
  const outnumbered = clamp((nearbyEnemies - nearbyAllies) / 3, 0, 1);
  const role = ROLE_DATA[bot.role];
  const ownPct = territoryPercent(bot.team);
  const enemyPct = rivalTerritory(bot.team);
  const ownScore = getModeScore(bot.team);
  const enemyScore = getModeScore(leadingRival(bot.team));
  const scoreScale = state.matchMode === 'turf' ? 14 : state.matchMode === 'zones' ? 18 : 5;
  const deficit = clamp((enemyScore - ownScore) / scoreScale, 0, 1);
  const late = state.time < 22 ? 1 : 0;
  const homeThreats = state.agents.filter((a) => a.alive && a.team !== bot.team && isAgentVisibleToTeam(a, bot.team) && Math.hypot(a.x - bot.spawnX, a.y - bot.spawnY) < 370).length;
  const weakAlly = state.agents
    .filter((a) => a.alive && a.team === bot.team && a.id !== bot.id && a.hp < 55)
    .sort((a, b) => a.hp - b.hp)[0];

  const utilities = {
    recover: ((health < 0.55 || ammo < 0.35 || danger > 0.55) ? 1 : 0) * (2.05 * (1 - health) + 1.5 * (1 - ammo) + 1.05 * danger + 0.75 * outnumbered),
    pressure: enemy || remembered ? role.pressure * (0.36 + (1 - (enemy?.hp ?? remembered.hp) / (enemy?.maxHp || 100)) * 1.1 + health * 0.44 + ammo * 0.38 - danger * 0.8 - outnumbered * 0.6 + deficit * 0.25) : state.matchMode === 'clash' ? role.pressure * (0.7 + deficit * 0.45) : -1,
    paint: role.paint * (0.72 + deficit * 0.58 + late * deficit * 0.42 - danger * 0.58),
    defend: homeThreats ? role.defend * (0.42 + homeThreats * 0.7 + (late && ownPct > enemyPct ? 0.75 : 0)) : (late && ownPct > enemyPct + 2 ? role.defend * 0.72 : 0.1),
    support: weakAlly ? role.support * (0.35 + (1 - weakAlly.hp / 100) + (dist(bot, weakAlly) < 420 ? 0.2 : 0)) : 0,
    objective: state.matchMode === 'zones' ? 1.22 + deficit * 0.72 + (bot.role === 'guard' ? 0.24 : 0) : -1,
  };
  if (state.matchMode === 'zones') {
    utilities.paint *= 0.64;
    utilities.pressure *= 0.96;
    utilities.defend *= 0.72;
  } else if (state.matchMode === 'clash') {
    utilities.paint *= 0.5;
    utilities.pressure *= 1.38;
    utilities.support *= 1.18;
    utilities.defend *= 0.58;
  } else {
    utilities.paint *= 1.18;
  }
  if (bot.intent && utilities[bot.intent] !== undefined) utilities[bot.intent] += 0.22;
  bot.utilities = utilities;

  let choice = Object.entries(utilities).sort((a, b) => b[1] - a[1])[0];
  if (now < bot.goalLock && choice[0] !== bot.intent && choice[1] < bot.goalScore + 0.34 && health > 0.18 && ammo > 0.08) {
    choice = [bot.intent, utilities[bot.intent] || bot.goalScore];
  }

  const nextIntent = choice[0];
  let target = bot.target;
  let label = '';
  bot.targetEnemy = null;
  bot.targetAlly = null;

  const intentChanged = nextIntent !== bot.intent;
  const currentTargetReached = !bot.target || Math.hypot(bot.target.x - bot.x, bot.target.y - bot.y) < 82;
  const paintTargetSpent = bot.intent === 'paint' && bot.target && paintOwnerAt(bot.target.x, bot.target.y) === bot.team;
  const canRetarget = intentChanged || bot.retargetTimer <= 0 || currentTargetReached || paintTargetSpent;

  if (nextIntent === 'recover') {
    target = !canRetarget && bot.intent === 'recover' ? bot.target : sampleSafePoint(bot);
    label = bot.hp < 50 ? 'REPAIR ROUTE' : 'REFILL CHROMA';
  } else if (nextIntent === 'objective') {
    target = !canRetarget && bot.intent === 'objective' ? bot.target : selectZoneTarget(bot);
    label = target.zone?.owner === bot.team ? `HOLD SECTOR ${target.zone.id}` : `CAPTURE SECTOR ${target.zone?.id || '?'}`;
  } else if (nextIntent === 'pressure' && enemy) {
    target = { x: enemy.x, y: enemy.y };
    bot.targetEnemy = enemy;
    label = `PRESSURE ${enemy.name}`;
  } else if (nextIntent === 'pressure' && remembered) {
    const age = Math.min(0.6, now - remembered.seen);
    target = { x: remembered.x + remembered.vx * age, y: remembered.y + remembered.vy * age };
    label = 'INVESTIGATE CONTACT';
  } else if (nextIntent === 'pressure' && state.matchMode === 'clash') {
    const lane = ((bot.id + bot.team) % 3) - 1;
    const rivalBase = TEAM[leadingRival(bot.team)];
    const sweepPhase = Math.floor((MATCH_MODES.clash.time - state.time) / 8 + bot.id) % 3;
    const sweepDepth = sweepPhase === 0 ? 0 : sweepPhase === 1 ? 0.55 : 0.85;
    target = !canRetarget && bot.intent === 'pressure'
      ? bot.target
      : {
        x: clamp(lerp(WORLD.w / 2, rivalBase.spawnX, sweepDepth) + (Math.random() - 0.5) * 100, 60, WORLD.w - 60),
        y: clamp(WORLD.h / 2 + lane * WORLD.h * 0.17 + (Math.random() - 0.5) * 100, 60, WORLD.h - 60),
      };
    label = nearbyAllies ? 'SWEEP FOR CONTACT' : 'REGROUP + SWEEP';
  } else if (nextIntent === 'defend') {
    const threat = visible
      .map(({ enemy: seenEnemy }) => seenEnemy)
      .sort((a, b) => Math.hypot(a.x - bot.spawnX, a.y - bot.spawnY) - Math.hypot(b.x - bot.spawnX, b.y - bot.spawnY))[0];
    target = threat && Math.hypot(threat.x - bot.spawnX, threat.y - bot.spawnY) < 520
      ? { x: threat.x, y: threat.y }
      : remembered && Math.hypot(remembered.x - bot.spawnX, remembered.y - bot.spawnY) < 520
        ? { x: remembered.x, y: remembered.y }
      : { x: lerp(bot.spawnX, WORLD.w / 2, 0.5), y: lerp(bot.spawnY, WORLD.h / 2, 0.5) + (bot.id % 3 - 1) * 75 };
    bot.targetEnemy = threat && hasLineOfSight(bot, threat) ? threat : null;
    label = homeThreats ? 'INTERCEPT HOME' : 'HOLD PAINTED LANE';
  } else if (nextIntent === 'support' && weakAlly) {
    target = { x: weakAlly.x, y: weakAlly.y };
    bot.targetAlly = weakAlly;
    label = `COVER ${weakAlly.name}`;
  } else {
    target = !canRetarget && bot.intent === 'paint' ? bot.target : samplePaintTarget(bot);
    label = paintOwnerAt(target.x, target.y) && paintOwnerAt(target.x, target.y) !== bot.team
      ? 'RECLAIM SECTOR' : 'COAT OPEN TURF';
  }

  const targetShift = !bot.target ? 9999 : Math.hypot(target.x - bot.target.x, target.y - bot.target.y);
  const changed = intentChanged || (canRetarget && nextIntent !== 'pressure' && targetShift > 120);
  bot.intent = nextIntent;
  bot.intentLabel = label;
  bot.goalScore = choice[1];
  if (changed) {
    bot.goalLock = now + 0.72;
    bot.retargetTimer = nextIntent === 'paint' ? 1.35 + Math.random() * 1.1 : nextIntent === 'objective' ? 1.1 + Math.random() * 0.5 : 0.8 + Math.random() * 0.65;
    bot.target = target;
    bot.path = findPath(bot, target);
    bot.pathIndex = 0;
    bot.pathTimer = 0.45 + Math.random() * 0.2;
    bot.aimNoise = (Math.random() * 2 - 1) * tuning.aimError;
  } else {
    bot.target = target;
  }
  bot.thinkTimer = tuning.think * (0.84 + Math.random() * 0.34) + tuning.reaction * 0.12;
}

function updateClaims() {
  for (const team of TEAM_IDS) state.claims[team].clear();
  for (const bot of state.agents) {
    if (!bot.alive || bot.isPlayer || !bot.target) continue;
    const sector = bot.intent === 'objective' && bot.target.zone
      ? 20 + bot.target.zone.id.charCodeAt(0)
      : sectorAt(bot.target.x, bot.target.y);
    state.claims[bot.team].set(sector, (state.claims[bot.team].get(sector) || 0) + 1);
  }
}

function updateTeamRoles() {
  for (const team of TEAM_IDS) {
    const bots = state.agents.filter((a) => a.team === team && !a.isPlayer);
    const behind = getModeScore(leadingRival(team)) - getModeScore(team);
    const homeThreat = state.agents.some((a) => a.alive && a.team !== team && isAgentVisibleToTeam(a, team) && Math.hypot(a.x - TEAM[team].spawnX, a.y - TEAM[team].spawnY) < 350);
    for (const bot of bots) bot.role = bot.baseRole;
    if (behind > (state.matchMode === 'turf' ? 7 : state.matchMode === 'zones' ? 12 : 3) && bots.length) {
      bots[bots.length - 1].role = state.matchMode === 'clash' ? 'vanguard' : state.matchMode === 'zones' ? 'rover' : 'painter';
    }
    if (homeThreat && bots.length > 1) bots[1].role = 'guard';
    if (state.time < 20 && behind < -3 && bots.length) bots[0].role = 'guard';
  }
}

function resolveMapCollision(agent) {
  agent.x = clamp(agent.x, 28, WORLD.w - 28);
  agent.y = clamp(agent.y, 28, WORLD.h - 28);
  for (const o of obstacles) {
    if (o.kind === 'arc') {
      if (!obstacleContains(o, agent.x, agent.y, agent.radius)) continue;
      const nearest = closestOnArc(agent.x, agent.y, o);
      let dx = agent.x - nearest.x;
      let dy = agent.y - nearest.y;
      let distance = Math.hypot(dx, dy);
      if (distance < 0.001) { dx = agent.x - o.cx; dy = agent.y - o.cy; distance = Math.hypot(dx, dy) || 1; }
      const push = agent.radius + o.thickness / 2 - Math.hypot(agent.x - nearest.x, agent.y - nearest.y) + 0.2;
      agent.x += dx / distance * push;
      agent.y += dy / distance * push;
      continue;
    }
    const closestX = clamp(agent.x, o.x, o.x + o.w);
    const closestY = clamp(agent.y, o.y, o.y + o.h);
    const dx = agent.x - closestX;
    const dy = agent.y - closestY;
    const d2 = dx * dx + dy * dy;
    if (d2 >= agent.radius * agent.radius) continue;
    if (d2 > 0.001) {
      const d = Math.sqrt(d2);
      const push = agent.radius - d + 0.1;
      agent.x += (dx / d) * push;
      agent.y += (dy / d) * push;
    } else {
      const left = Math.abs(agent.x - o.x);
      const right = Math.abs(agent.x - (o.x + o.w));
      const top = Math.abs(agent.y - o.y);
      const bottom = Math.abs(agent.y - (o.y + o.h));
      const min = Math.min(left, right, top, bottom);
      if (min === left) agent.x = o.x - agent.radius;
      else if (min === right) agent.x = o.x + o.w + agent.radius;
      else if (min === top) agent.y = o.y - agent.radius;
      else agent.y = o.y + o.h + agent.radius;
    }
  }
  for (const team of TEAM_IDS) {
    if (team === agent.team) continue;
    const base = TEAM[team];
    const dx = agent.x - base.spawnX;
    const dy = agent.y - base.spawnY;
    const distance = Math.hypot(dx, dy);
    if (distance < SAFE_RADIUS + agent.radius) {
      const angle = distance > 0.001 ? Math.atan2(dy, dx) : team === 1 ? 0 : Math.PI;
      const radius = SAFE_RADIUS + agent.radius + 0.2;
      agent.x = base.spawnX + Math.cos(angle) * radius;
      agent.y = base.spawnY + Math.sin(angle) * radius;
      if (agent.x < 28 || agent.x > WORLD.w - 28) {
        agent.x = clamp(agent.x, 28, WORLD.w - 28);
        const horizontal = agent.x - base.spawnX;
        agent.y = base.spawnY + (dy >= 0 ? 1 : -1) * Math.sqrt(Math.max(0, radius * radius - horizontal * horizontal));
      }
    }
  }
  agent.x = clamp(agent.x, 28, WORLD.w - 28);
  agent.y = clamp(agent.y, 28, WORLD.h - 28);
}

function moveAgent(agent, direction, baseSpeed, dt) {
  const owner = paintOwnerAt(agent.x, agent.y);
  let terrain = owner === agent.team ? 1.18 : owner && owner !== agent.team ? 0.73 : 1;
  if (agent.slowTime > 0) terrain *= 0.55;
  if (agent.overdrive > 0) terrain *= 1.4;
  if (upgradeIs(agent, 'kinetic')) terrain *= 1.16;
  if (agent.dashTime > 0) terrain = 1;
  const speed = agent.dashTime > 0 ? 590 : baseSpeed * terrain;
  const desiredX = direction.x * speed;
  const desiredY = direction.y * speed;
  const responsiveness = agent.dashTime > 0 ? 1 : 1 - Math.exp(-dt * 13);
  agent.vx = lerp(agent.vx, desiredX, responsiveness);
  agent.vy = lerp(agent.vy, desiredY, responsiveness);
  const beforeX = agent.x;
  const beforeY = agent.y;
  agent.x += agent.vx * dt;
  resolveMapCollision(agent);
  agent.y += agent.vy * dt;
  resolveMapCollision(agent);
  if (agent.dashTime > 0) paintAt(agent.x, agent.y, 24, agent.team, Math.random() < 0.22);
  const moved = Math.hypot(agent.x - beforeX, agent.y - beforeY);
  if (moved < 0.25 && Math.hypot(desiredX, desiredY) > 40) agent.stuck += dt;
  else agent.stuck = Math.max(0, agent.stuck - dt * 2);
}

function tryDash(agent, direction) {
  if (!agent.alive || agent.dashCd > 0 || agent.ammo < 12 || Math.hypot(direction.x, direction.y) < 0.1) return false;
  const n = normalize(direction.x, direction.y);
  agent.dashDir = { x: n.x, y: n.y };
  agent.dashTime = 0.18;
  agent.dashCd = upgradeIs(agent, 'kinetic') ? 3 : 4;
  agent.ammo -= 12;
  state.shake = Math.max(state.shake, agent.isPlayer ? 6 : 2);
  if (agent.isPlayer) sound.dash();
  return true;
}

function tryShoot(agent) {
  const hero = characterOf(agent);
  const cost = 3.2 * (upgradeIs(agent, 'reservoir') ? 0.7 : 1);
  if (!agent.alive || isInOwnSafeZone(agent) || agent.shotCd > 0 || agent.ammo < cost || agent.dashTime > 0) return false;
  const speed = hero.speed;
  const spread = agent.isPlayer ? (Math.random() - 0.5) * 0.018 : (Math.random() - 0.5) * 0.025;
  const angle = agent.angle + spread;
  const muzzle = agent.radius + 8;
  for (const offset of agent.overdrive > 0 ? [-0.055, 0.055] : [0]) {
    state.projectiles.push({
      x: agent.x + Math.cos(angle + offset) * muzzle,
      y: agent.y + Math.sin(angle + offset) * muzzle,
      vx: Math.cos(angle + offset) * speed,
      vy: Math.sin(angle + offset) * speed,
      team: agent.team, ownerId: agent.id, life: 0.8, trail: 0,
      radius: agent.characterId === 'kilo' ? 8 : 6,
      damage: hero.damage * (upgradeIs(agent, 'impact') ? 1.2 : 1),
      paintRadius: hero.paint,
    });
  }
  agent.ammo -= cost;
  agent.shotCd = hero.rate;
  sound.shot(agent.isPlayer);
  return true;
}

function damageAgent(target, amount, projectile) {
  if (!target.alive || target.shield > 0 || isInOwnSafeZone(target)) return;
  const protectedByDome = state.effects.some((effect) => effect.type === 'citadel' && effect.life > 0 && effect.team === target.team && dist(target, effect) < effect.radius && hasLineOfSight(effect, target));
  if (protectedByDome) amount *= 0.35;
  if (target.overdrive > 0) amount *= 0.65;
  target.hp -= amount;
  target.lastDamage = performance.now() / 1000;
  const attacker = state.agents.find((a) => a.id === projectile.ownerId);
  if (attacker) {
    attacker.damageContribution += amount;
    specialGain(attacker, amount * 0.12);
  }
  const cell = navFromWorld(target.x, target.y);
  const index = navIndex(cell.col, cell.row);
  state.danger[target.team][index] = clamp(state.danger[target.team][index] + 0.72, 0, 3);
  state.flash = target.isPlayer ? 0.4 : state.flash;
  if (target.isPlayer) sound.hit();
  addWorldText(target.x, target.y - 25, `-${Math.round(amount)}`, projectile.team);
  if (target.hp <= 0) disableAgent(target, attacker);
}

function disableAgent(agent, attacker) {
  agent.alive = false;
  agent.hp = 0;
  agent.respawn = 3.4;
  agent.vx = 0;
  agent.vy = 0;
  agent.firing = false;
  if (state.lockTargetId === agent.id) state.lockTargetId = null;
  state.shake = Math.max(state.shake, agent.isPlayer ? 8 : 3);
  if (attacker) paintAt(agent.x, agent.y, 65, attacker.team);
  for (let i = 0; i < 18; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 210;
    state.particles.push({ type: 'burst', team: agent.team, x: agent.x, y: agent.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.55 + Math.random() * 0.3, maxLife: 0.85, size: 3 + Math.random() * 7 });
  }
  const sector = sectorAt(agent.x, agent.y);
  state.laneReward[agent.team][sector] = lerp(state.laneReward[agent.team][sector], -1, 0.18);
  if (attacker) state.laneReward[attacker.team][sector] = lerp(state.laneReward[attacker.team][sector], 1, 0.12);
  if (attacker && state.matchMode === 'clash') {
    state.modeScores[attacker.team] += 1;
    addWorldText(agent.x, agent.y - 48, `${Math.floor(state.modeScores[attacker.team])} / ${MATCH_MODES.clash.target}`, attacker.team);
  }
  addEvent(`${attacker?.name || 'RIVAL'} OPENED SPACE`, attacker?.team || leadingRival(agent.team));
  sound.down();
}

function respawnAgent(agent) {
  agent.alive = true;
  agent.hp = agent.maxHp;
  agent.ammo = 100;
  agent.x = agent.spawnX;
  agent.y = agent.spawnY;
  agent.vx = 0;
  agent.vy = 0;
  agent.shield = 1.4;
  agent.overdrive = 0;
  agent.slowTime = 0;
  agent.path.length = 0;
  agent.thinkTimer = 0;
  agent.intent = 'paint';
  paintAt(agent.x, agent.y, 58, agent.team);
  if (agent.isPlayer) addEvent('DRONE REBOOT COMPLETE', agent.team, 'acid');
}

function updateAgentTimers(agent, dt) {
  agent.shotCd = Math.max(0, agent.shotCd - dt);
  agent.secondaryCd = Math.max(0, agent.secondaryCd - dt);
  agent.overdrive = Math.max(0, agent.overdrive - dt);
  agent.slowTime = Math.max(0, agent.slowTime - dt);
  agent.dashCd = Math.max(0, agent.dashCd - dt);
  agent.shield = Math.max(0, agent.shield - dt);
  agent.dashTime = Math.max(0, agent.dashTime - dt);
  if (!agent.alive) {
    agent.respawn -= dt;
    if (agent.respawn <= 0) respawnAgent(agent);
    return;
  }
  const owner = paintOwnerAt(agent.x, agent.y);
  specialGain(agent, dt * 2.25);
  if (isInOwnSafeZone(agent)) {
    agent.hp = Math.min(agent.maxHp, agent.hp + 35 * dt);
    agent.ammo = Math.min(100, agent.ammo + 55 * dt);
    agent.slowTime = 0;
    return;
  }
  if (!agent.firing) {
    const regen = (owner === agent.team ? 26 : 13) * (upgradeIs(agent, 'reservoir') ? 1.25 : 1);
    agent.ammo = Math.min(100, agent.ammo + regen * dt);
  }
  const now = performance.now() / 1000;
  if (owner === agent.team && now - agent.lastDamage > 3.2 && agent.hp < agent.maxHp) agent.hp = Math.min(agent.maxHp, agent.hp + 7.5 * dt);
}

function updatePlayer(player, dt) {
  if (!player.alive) return;
  let mx = (input.keys.has('KeyD') ? 1 : 0) - (input.keys.has('KeyA') ? 1 : 0) + input.moveTouch.x;
  let my = (input.keys.has('KeyS') ? 1 : 0) - (input.keys.has('KeyW') ? 1 : 0) + input.moveTouch.y;
  const gamepad = navigator.getGamepads?.()[0];
  if (gamepad) {
    const gx = Math.abs(gamepad.axes[0]) > 0.16 ? gamepad.axes[0] : 0;
    const gy = Math.abs(gamepad.axes[1]) > 0.16 ? gamepad.axes[1] : 0;
    if (Math.hypot(gx, gy) > Math.hypot(mx, my)) { mx = gx; my = gy; }
    const ax = Math.abs(gamepad.axes[2]) > 0.16 ? gamepad.axes[2] : 0;
    const ay = Math.abs(gamepad.axes[3]) > 0.16 ? gamepad.axes[3] : 0;
    if (Math.hypot(ax, ay) > 0.16) {
      input.aimTouch = { x: ax, y: ay, active: true };
      input.gamepadAimActive = true;
    } else if (input.gamepadAimActive) {
      input.aimTouch = { x: 0, y: 0, active: false };
      input.gamepadAimActive = false;
    }
    input.gamepadFire = (gamepad.buttons[7]?.value || 0) > 0.2;
    if (gamepad.buttons[0]?.pressed) input.dashRequested = true;
    const secondaryPressed = Boolean(gamepad.buttons[4]?.pressed);
    const specialPressed = Boolean(gamepad.buttons[5]?.pressed);
    if (secondaryPressed && !input.gamepadSecondary) input.secondaryRequested = true;
    if (specialPressed && !input.gamepadSpecial) input.specialRequested = true;
    input.gamepadSecondary = secondaryPressed;
    input.gamepadSpecial = specialPressed;
  } else {
    if (input.gamepadAimActive) input.aimTouch = { x: 0, y: 0, active: false };
    input.gamepadAimActive = false;
    input.gamepadFire = false;
    input.gamepadSecondary = false;
    input.gamepadSpecial = false;
  }
  const movement = normalize(mx, my);
  const manualAngle = input.aimTouch.active
    ? Math.atan2(input.aimTouch.y, input.aimTouch.x)
    : state.mobileControls && !input.pointerInside ? player.angle : Math.atan2(input.mouseY - player.y, input.mouseX - player.x);
  const locked = selectAutoLock(player, manualAngle, dt);
  if (locked) {
    const flight = dist(player, locked) / characterOf(player).speed;
    const aimX = locked.x + locked.vx * Math.min(0.34, flight * 0.72);
    const aimY = locked.y + locked.vy * Math.min(0.34, flight * 0.72);
    const desired = Math.atan2(aimY - player.y, aimX - player.x);
    player.angle += clamp(angleDelta(player.angle, desired), -9.5 * dt, 9.5 * dt);
  } else {
    player.angle = manualAngle;
  }
  if (input.secondaryRequested) {
    useSecondary(player);
    input.secondaryRequested = false;
  }
  if (input.specialRequested) {
    if (!useSpecial(player)) addEvent(`SPECIAL CHARGING // ${Math.floor(player.specialCharge)}%`, player.team);
    input.specialRequested = false;
  }
  if (input.dashRequested) {
    const dashDirection = movement.length > 0.1 ? movement : { x: Math.cos(player.angle), y: Math.sin(player.angle) };
    tryDash(player, dashDirection);
    input.dashRequested = false;
  }
  const direction = player.dashTime > 0 ? player.dashDir : movement;
  moveAgent(player, direction, 205, dt);
  player.firing = (input.mouseDown || input.gamepadFire) && player.dashTime <= 0;
  if (player.firing) tryShoot(player);
}

function updateBot(bot, dt) {
  if (!bot.alive) return;
  bot.thinkTimer -= dt;
  bot.pathTimer -= dt;
  bot.retargetTimer -= dt;
  bot.strafeTimer -= dt;
  if (bot.thinkTimer <= 0) botThink(bot);
  botUseAbilities(bot, dt);
  if (bot.strafeTimer <= 0) {
    bot.strafe *= -1;
    bot.strafeTimer = 0.55 + Math.random() * 0.85;
  }
  if (bot.stuck > 0.7) {
    bot.path = findPath(bot, bot.target);
    bot.pathIndex = 0;
    bot.stuck = 0;
  }
  if (bot.pathTimer <= 0 && bot.target) {
    bot.path = findPath(bot, bot.target);
    bot.pathIndex = 0;
    bot.pathTimer = 0.55 + Math.random() * 0.22;
  }

  let waypoint = bot.target || { x: bot.x, y: bot.y };
  if (bot.path.length) {
    waypoint = bot.path[Math.min(bot.pathIndex, bot.path.length - 1)];
    if (Math.hypot(waypoint.x - bot.x, waypoint.y - bot.y) < 52 && bot.pathIndex < bot.path.length - 1) {
      bot.pathIndex += 1;
      waypoint = bot.path[bot.pathIndex];
    }
  }

  let dx = waypoint.x - bot.x;
  let dy = waypoint.y - bot.y;
  let move = normalize(dx, dy);
  let targetEnemy = bot.targetEnemy;
  if (!targetEnemy?.alive || !hasDirectVision(bot, targetEnemy)) {
    const visible = visibleEnemies(bot);
    targetEnemy = selectCombatTarget(bot, visible);
  }

  if (targetEnemy && hasLineOfSight(bot, targetEnemy)) {
    const enemyDistance = dist(bot, targetEnemy);
    const toEnemy = normalize(targetEnemy.x - bot.x, targetEnemy.y - bot.y);
    if (enemyDistance < 185) move = normalize(-toEnemy.x + -toEnemy.y * bot.strafe * 0.52, -toEnemy.y + toEnemy.x * bot.strafe * 0.52);
    else if (enemyDistance < 360) move = normalize(move.x * 0.35 + -toEnemy.y * bot.strafe * 0.72, move.y * 0.35 + toEnemy.x * bot.strafe * 0.72);
    const tuning = botTuning(bot);
    const travel = enemyDistance / characterOf(bot).speed;
    const lead = travel * tuning.prediction;
    const aimX = targetEnemy.x + targetEnemy.vx * lead;
    const aimY = targetEnemy.y + targetEnemy.vy * lead;
    const desiredAngle = Math.atan2(aimY - bot.y, aimX - bot.x) + bot.aimNoise;
    bot.angle += angleDelta(bot.angle, desiredAngle) * clamp(dt * (5 + 6 * (1 - tuning.reaction)), 0, 1);
    const aimDifference = Math.abs(angleDelta(bot.angle, Math.atan2(targetEnemy.y - bot.y, targetEnemy.x - bot.x)));
    bot.firing = enemyDistance < VISION_RADIUS + 18 && aimDifference < 0.22 + tuning.aimError && bot.ammo > 9;
  } else {
    const desiredAngle = Math.atan2(dy, dx);
    bot.angle += angleDelta(bot.angle, desiredAngle) * clamp(dt * 7, 0, 1);
    const probeX = bot.x + Math.cos(bot.angle) * 95;
    const probeY = bot.y + Math.sin(bot.angle) * 95;
    const ownerAhead = paintOwnerAt(probeX, probeY);
    bot.firing = bot.intent !== 'recover' && bot.ammo > 14 && (ownerAhead !== bot.team || Math.random() < 0.012);
  }

  for (const ally of state.agents) {
    if (!ally.alive || ally.id === bot.id) continue;
    const d = dist(bot, ally);
    if (d > 0 && d < 58) {
      move = normalize(move.x + (bot.x - ally.x) / d * 0.55, move.y + (bot.y - ally.y) / d * 0.55);
    }
  }

  if (bot.dashTime <= 0 && bot.dashCd <= 0 && bot.ammo > 35) {
    const shouldDash = (bot.intent === 'recover' && bot.hp < 35) || (bot.intent === 'pressure' && targetEnemy && dist(bot, targetEnemy) > 390 && Math.random() < dt * 0.75);
    if (shouldDash) tryDash(bot, move);
  }
  const direction = bot.dashTime > 0 ? bot.dashDir : move;
  moveAgent(bot, direction, 192, dt);
  if (bot.firing) tryShoot(bot);
}

function updateProjectiles(dt) {
  for (let i = state.projectiles.length - 1; i >= 0; i -= 1) {
    const p = state.projectiles[i];
    p.life -= dt;
    p.trail -= dt;
    const oldX = p.x;
    const oldY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    let impact = p.life <= 0 || p.x < 25 || p.x > WORLD.w - 25 || p.y < 25 || p.y > WORLD.h - 25;
    const hostileBase = TEAM_IDS.find((team) => team !== p.team && (() => {
      const base = TEAM[team];
      const closest = closestOnSegment(base.spawnX, base.spawnY, oldX, oldY, p.x, p.y);
      return Math.hypot(closest.x - base.spawnX, closest.y - base.spawnY) < SAFE_RADIUS + p.radius;
    })());
    if (hostileBase) { state.projectiles.splice(i, 1); continue; }
    const hitWall = obstacles.find((o) => lineHitsObstacle(oldX, oldY, p.x, p.y, o, p.radius));
    const hitBoundary = p.x < 25 || p.x > WORLD.w - 25 || p.y < 25 || p.y > WORLD.h - 25;
    if (p.bounces > 0 && p.life > 0 && (hitWall || hitBoundary)) {
      if (hitWall) {
        if (hitWall.kind === 'arc') {
          const nearest = closestOnArc(oldX, oldY, hitWall);
          const normal = normalize(oldX - nearest.x, oldY - nearest.y);
          const projection = p.vx * normal.x + p.vy * normal.y;
          p.vx -= 2 * projection * normal.x;
          p.vy -= 2 * projection * normal.y;
        } else {
          const outsideX = oldX < hitWall.x - p.radius || oldX > hitWall.x + hitWall.w + p.radius;
          if (outsideX) p.vx *= -1; else p.vy *= -1;
        }
      } else {
        if (p.x < 25 || p.x > WORLD.w - 25) p.vx *= -1;
        if (p.y < 25 || p.y > WORLD.h - 25) p.vy *= -1;
      }
      p.x = oldX;
      p.y = oldY;
      p.bounces -= 1;
      impact = false;
    } else if (!impact && hitWall) impact = true;
    if (!impact) {
      const shield = state.effects.find((effect) => effect.type === 'barrier' && effect.life > 0 && effect.team !== p.team && Math.hypot(effect.x - p.x, effect.y - p.y) < effect.radius);
      if (shield) {
        state.projectiles.splice(i, 1);
        continue;
      }
    }
    let hitAgent = null;
    if (!impact) {
      for (const agent of state.agents) {
        if (!agent.alive || agent.team === p.team || agent.id === p.ownerId) continue;
        if (Math.hypot(agent.x - p.x, agent.y - p.y) < agent.radius + p.radius) {
          hitAgent = agent;
          impact = true;
          break;
        }
      }
    }
    if (p.trail <= 0) {
      paintAt(p.x, p.y, p.blade ? 23 : 11, p.team, false);
      p.trail = 0.052;
    }
    if (impact) {
      const changed = paintAt(clamp(p.x, 20, WORLD.w - 20), clamp(p.y, 20, WORLD.h - 20), p.paintRadius || 34, p.team);
      const owner = state.agents.find((a) => a.id === p.ownerId);
      if (owner) {
        owner.paintContribution += changed;
        specialGain(owner, changed * 0.19);
      }
      if (hitAgent) damageAgent(hitAgent, p.damage || 11.5, p);
      state.projectiles.splice(i, 1);
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.04, dt);
    p.vy *= Math.pow(0.04, dt);
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.texts.length - 1; i >= 0; i -= 1) {
    const text = state.texts[i];
    text.life -= dt;
    text.y -= 26 * dt;
    if (text.life <= 0) state.texts.splice(i, 1);
  }
}

function updateDanger(dt) {
  const decay = Math.pow(0.94, dt);
  for (const team of TEAM_IDS) {
    const map = state.danger[team];
    for (let i = 0; i < map.length; i += 1) map[i] *= decay;
    for (const [id, memory] of state.teamMemory[team]) {
      const maxAge = id === 'focus' ? 2.4 : 4;
      const focusTargetAlive = id !== 'focus' || state.agents.some((agent) => agent.alive && agent.id === memory.id);
      if (performance.now() / 1000 - memory.seen > maxAge || !focusTargetAlive) state.teamMemory[team].delete(id);
    }
  }
}

function updateGameMode(dt) {
  if (state.matchMode === 'zones') {
    for (const zone of state.zones) {
      const previousOwner = zone.owner;
      const occupants = [0, 0, 0];
      for (const agent of state.agents) {
        if (agent.alive && dist(agent, zone) <= zone.radius) occupants[agent.team] += 1;
      }
      const presentTeams = TEAM_IDS.filter((team) => occupants[team] > 0);
      zone.contested = presentTeams.length > 1;
      if (presentTeams.length === 1) {
        const capturingTeam = presentTeams[0];
        const strength = 0.34 + Math.min(3, occupants[capturingTeam]) * 0.1;
        if (zone.captureTeam && zone.captureTeam !== capturingTeam) {
          zone.capture = Math.max(0, zone.capture - strength * dt);
          if (zone.capture < 0.18) zone.owner = 0;
          if (zone.capture === 0) zone.captureTeam = capturingTeam;
        } else {
          zone.captureTeam = capturingTeam;
          zone.capture = Math.min(1, zone.capture + strength * dt);
          if (zone.capture >= 0.68) zone.owner = capturingTeam;
        }
      }
      const ownerThreatened = zone.owner && presentTeams.some((team) => team !== zone.owner);
      if (zone.owner && !zone.contested && !ownerThreatened) state.modeScores[zone.owner] = Math.min(MATCH_MODES.zones.target, state.modeScores[zone.owner] + dt * 1.08);
      if (zone.owner !== previousOwner && zone.owner) {
        addEvent(`${TEAM[zone.owner].name} LOCKED SECTOR ${zone.id}`, zone.owner, zone.owner === state.playerTeam ? 'acid' : '');
        sound.swing();
      }
    }
  }

  const target = MATCH_MODES[state.matchMode].target;
  if (target && TEAM_IDS.some((team) => state.modeScores[team] >= target)) finishMatch();
}

function needsOvertime() {
  const scores = TEAM_IDS.map(getModeScore).sort((a, b) => b - a);
  if (state.matchMode === 'turf') return scores[0] - scores[1] < 1.2;
  if (state.matchMode === 'zones') return scores[0] - scores[1] < 2;
  return Math.floor(scores[0]) === Math.floor(scores[1]);
}

function updateMatch(dt) {
  if (state.countdown > 0) {
    const before = Math.ceil(state.countdown);
    state.countdown -= dt;
    const after = Math.ceil(Math.max(0, state.countdown));
    if (after !== before) sound.tick(after === 0);
    if (state.countdown <= 0) addEvent(state.matchMode === 'zones' ? 'LOCK THE SECTORS' : state.matchMode === 'clash' ? 'WIN THE DISABLE RACE' : 'PAINT THE YARD', state.playerTeam, 'acid');
    updateParticles(dt);
    updateVision();
    updateCamera(dt);
    updateHUD();
    return;
  }

  state.time -= dt;
  updateCamera(0);
  state.teamPlanTimer -= dt;
  if (state.teamPlanTimer <= 0) {
    updateClaims();
    updateTeamRoles();
    state.teamPlanTimer = 2.2;
  }
  for (const agent of state.agents) updateAgentTimers(agent, dt);
  for (const agent of state.agents) agent.firing = false;
  if (state.player.alive) updatePlayer(state.player, dt);
  else {
    input.secondaryRequested = false;
    input.specialRequested = false;
    input.dashRequested = false;
    state.lockTargetId = null;
  }
  for (const agent of state.agents) if (!agent.isPlayer && agent.alive) updateBot(agent, dt);
  updateProjectiles(dt);
  updateAbilityEffects(dt);
  updateParticles(dt);
  updateDanger(dt);
  updateVision();
  updateGameMode(dt);
  updateCamera(dt);
  state.shake = Math.max(0, state.shake - dt * 22);
  state.flash = Math.max(0, state.flash - dt * 2.5);

  if (state.mode === 'ended') {
    updateHUD();
    return;
  }
  if (state.overtime && !needsOvertime()) {
    finishMatch();
    updateHUD();
    return;
  }

  if (state.time <= 10 && state.time + dt > 10) addEvent('FINAL TEN // ADAPT NOW', state.playerTeam, 'acid');
  if (state.time <= 0) {
    if (!state.overtime && needsOvertime()) {
      state.overtime = true;
      state.time = state.matchMode === 'zones' ? 15 : 12;
      state.overtimeTime = state.time;
      addEvent('DEADLOCK // OVERTIME', state.playerTeam, 'acid');
      sound.swing();
    } else if (state.overtime && needsOvertime()) {
      state.time = 0;
    } else finishMatch();
  }
  updateHUD();
}

function updateHUD(force = false) {
  state.hudTimer -= 1 / 60;
  const cyan = getModeScore(1);
  const coral = getModeScore(2);
  dom.cyanPercent.textContent = formatModeScore(cyan);
  dom.coralPercent.textContent = formatModeScore(coral);
  const combined = cyan + coral;
  for (const [bar, score] of [[dom.cyanBar, cyan], [dom.coralBar, coral]]) bar.style.width = `${combined > 0 ? score / combined * 100 : 50}%`;
  const displayTime = Math.max(0, Math.ceil(state.time));
  dom.timer.textContent = `${Math.floor(displayTime / 60)}:${String(displayTime % 60).padStart(2, '0')}`;
  dom.phase.textContent = state.countdown > 0 ? 'DEPLOYING' : state.overtime ? 'OVERTIME' : state.time <= 10 ? 'FINAL PUSH' : MATCH_MODES[state.matchMode].phase;
  if (state.time <= 10 && state.countdown <= 0) dom.timer.style.color = '#d9ff58';
  else dom.timer.style.color = '';

  const player = state.player;
  if (player) {
    dom.healthBar.style.width = `${clamp(player.hp / player.maxHp * 100, 0, 100)}%`;
    dom.healthText.textContent = String(Math.ceil(Math.max(0, player.hp)));
    dom.ammoBar.style.width = `${player.ammo}%`;
    dom.ammoBar.style.background = TEAM[player.team].color;
    dom.ammoText.textContent = String(Math.ceil(player.ammo));
    const dashPercent = (1 - player.dashCd / (upgradeIs(player, 'kinetic') ? 3 : 4)) * 100;
    dom.dashRing.style.setProperty('--dash', `${dashPercent}%`);
    dom.dashText.textContent = player.dashCd <= 0 ? 'DASH READY' : `RECHARGE ${player.dashCd.toFixed(1)}`;
    dom.respawnNotice.hidden = player.alive;
    if (!player.alive) dom.respawnTimer.textContent = Math.max(0, player.respawn).toFixed(1);
    const hero = characterOf(player);
    dom.secondaryName.textContent = hero.secondary;
    dom.secondaryStatus.textContent = !player.alive ? 'REBOOTING' : player.secondaryCd > 0 ? `${player.secondaryCd.toFixed(1)}s` : player.ammo < 20 ? 'NEED 20 INK' : 'READY';
    dom.specialName.textContent = hero.special;
    dom.specialStatus.textContent = player.overdrive > 0 ? `ACTIVE ${player.overdrive.toFixed(1)}s` : player.specialCharge >= 100 ? 'UNLEASH' : `${Math.floor(player.specialCharge)}%`;
    const safe = player.alive && isInOwnSafeZone(player);
    dom.safeNotice.hidden = !safe;
    if (safe) {
      dom.secondaryStatus.textContent = 'LEAVE SAFE ZONE';
      dom.specialStatus.textContent = 'LEAVE SAFE ZONE';
    }
    dom.secondaryBtn.disabled = safe || state.mode !== 'playing' || state.countdown > 0 || !player.alive || player.secondaryCd > 0 || player.ammo < 20;
    dom.specialBtn.disabled = safe || state.mode !== 'playing' || state.countdown > 0 || !player.alive || player.specialCharge < 100;
    dom.specialBtn.classList.toggle('charged', player.specialCharge >= 100);
    dom.specialBtn.style.setProperty('--charge', `${player.specialCharge}%`);
    dom.upgradeBadge.textContent = UPGRADES.find((upgrade) => upgrade.id === player.upgradeId)?.name || '';
  }
  document.querySelectorAll('.roster-unit').forEach((unit) => {
    const agent = state.agents.find((a) => a.id === Number(unit.dataset.agent));
    unit.classList.toggle('down', !agent?.alive);
  });

  if (force || state.hudTimer <= 0) {
    state.hudTimer = 0.28;
    renderAICards();
  }
}

function renderAICards() {
  if (!state.player) return;
  const allies = state.agents.filter((a) => a.team === state.player.team && !a.isPlayer);
  dom.aiCards.innerHTML = allies.length ? allies.map((bot) => `
    <div class="ai-card">
      <span class="ai-avatar">${bot.name.slice(0, 2)}</span>
      <span class="ai-card-copy">
        <strong>${bot.name} // ${ROLE_DATA[bot.role].label}</strong>
        <small>${bot.alive ? `${bot.intentLabel} · ${Math.floor(bot.specialCharge)}% ULT` : `REBOOT ${bot.respawn.toFixed(1)}S`}</small>
      </span>
      <span class="ai-intent ${bot.alive ? bot.intent : 'recover'}">${bot.alive ? bot.intent.toUpperCase() : 'DOWN'}</span>
    </div>
  `).join('') : '<p class="ai-empty">Solo match. Your aim, your plan.</p>';
}

function drawArena() {
  const palette = MAPS[state.activeMap];
  ctx.fillStyle = palette.edge;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  ctx.fillStyle = palette.floor;
  ctx.fillRect(28, 28, WORLD.w - 56, WORLD.h - 56);

  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.lineWidth = 1;
  for (let x = 40; x < WORLD.w; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, WORLD.h - 30); ctx.stroke();
  }
  for (let y = 40; y < WORLD.h; y += 50) {
    ctx.beginPath(); ctx.moveTo(30, y); ctx.lineTo(WORLD.w - 30, y); ctx.stroke();
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.065)';
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  ctx.moveTo(40, WORLD.h / 2); ctx.lineTo(WORLD.w - 40, WORLD.h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(WORLD.w / 2, 32); ctx.lineTo(WORLD.w / 2, WORLD.h - 32);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  ctx.fillRect(42, WORLD.h / 2 - 126, WORLD.w - 84, 252);

  drawPaint();
  drawZones();
  for (const team of TEAM_IDS) drawSpawnPad(team);
  drawObstacles();
}

function drawPaint() {
  ctx.save();
  ctx.globalAlpha = 0.76;
  const minCol = clamp(Math.floor((state.camera.x - view.visibleW * 0.55) / CELL), 0, COLS - 1);
  const maxCol = clamp(Math.ceil((state.camera.x + view.visibleW * 0.55) / CELL), 0, COLS - 1);
  const minRow = clamp(Math.floor((state.camera.y - view.visibleH * 0.55) / CELL), 0, ROWS - 1);
  const maxRow = clamp(Math.ceil((state.camera.y + view.visibleH * 0.55) / CELL), 0, ROWS - 1);
  for (let row = minRow; row <= maxRow; row += 1) {
    for (let col = minCol; col <= maxCol; col += 1) {
      const owner = state.paint[row * COLS + col];
      if (!owner) continue;
      const wobble = hash(col, row);
      const inset = wobble > 0.7 ? 1 : 0;
      ctx.fillStyle = TEAM[owner].color;
      ctx.fillRect(col * CELL - 1 + inset, row * CELL - 1 + inset, CELL + 2 - inset * 2, CELL + 2 - inset * 2);
      if (wobble > 0.82) {
        ctx.beginPath();
        ctx.arc(col * CELL + CELL * wobble, row * CELL + CELL * (1 - wobble), 6 + wobble * 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.08;
  for (let row = minRow; row <= maxRow; row += 3) {
    for (let col = minCol; col <= maxCol; col += 3) {
      const owner = state.paint[row * COLS + col];
      if (!owner) continue;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(col * CELL + 6, row * CELL + 5, 3, 3);
    }
  }
  ctx.restore();
}

function drawZones() {
  if (state.matchMode !== 'zones') return;
  for (const zone of state.zones) {
    const captureTeam = zone.captureTeam;
    const color = zone.owner ? TEAM[zone.owner].color : '#f7f3e8';
    ctx.save();
    ctx.translate(zone.x, zone.y);
    ctx.fillStyle = zone.owner ? `rgba(${TEAM[zone.owner].rgb},0.09)` : 'rgba(247,243,232,0.035)';
    ctx.beginPath(); ctx.arc(0, 0, zone.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = zone.contested ? 0.9 : 0.5;
    ctx.lineWidth = zone.contested ? 5 : 3;
    ctx.setLineDash(zone.contested ? [12, 9] : [4, 10]);
    ctx.beginPath(); ctx.arc(0, 0, zone.radius, 0, Math.PI * 2); ctx.stroke();
    if (captureTeam) {
      ctx.setLineDash([]);
      ctx.strokeStyle = TEAM[captureTeam].color;
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, zone.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.abs(zone.capture));
      ctx.stroke();
    }
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = color;
    ctx.font = '950 italic 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(zone.contested ? '×' : zone.id, 0, 1);
    ctx.font = '800 8px ui-monospace, monospace';
    ctx.fillText(zone.contested ? 'CONTESTED' : zone.owner ? `${TEAM[zone.owner].name} LOCK` : 'CAPTURE', 0, 27);
    ctx.restore();
  }
}

function drawSpawnPad(team) {
  const x = TEAM[team].spawnX;
  const color = TEAM[team].color;
  ctx.save();
  ctx.translate(x, TEAM[team].spawnY);
  ctx.fillStyle = `rgba(${TEAM[team].rgb},0.1)`;
  ctx.beginPath(); ctx.arc(0, 0, SAFE_RADIUS, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 7]);
  ctx.beginPath(); ctx.arc(0, 0, SAFE_RADIUS, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.2;
  ctx.lineWidth = 10;
  ctx.beginPath(); ctx.arc(0, 0, SAFE_RADIUS - 9, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.font = '800 9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText('SAFE ZONE', 0, -42);
  ctx.font = '600 7px ui-monospace, monospace';
  ctx.fillText('HEAL + RELOAD', 0, 44);
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = color;
  if (team === 1) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-10, -10, 20, 20);
  } else if (team === 2) {
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(16, 13); ctx.lineTo(-16, 13); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawObstacles() {
  for (const o of obstacles) {
    ctx.save();
    if (o.kind === 'arc') {
      ctx.lineCap = 'round';
      ctx.lineWidth = o.thickness + 7;
      ctx.strokeStyle = 'rgba(2,4,13,0.38)';
      ctx.beginPath(); ctx.arc(o.cx + 6, o.cy + 8, o.r, o.start, o.start + o.span); ctx.stroke();
      ctx.lineWidth = o.thickness;
      ctx.strokeStyle = MAPS[state.activeMap].accent;
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, o.start, o.start + o.span); ctx.stroke();
      ctx.lineWidth = o.thickness - 7;
      ctx.strokeStyle = '#343e56';
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r, o.start, o.start + o.span); ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.arc(o.cx, o.cy, o.r - o.thickness * 0.3, o.start + 0.05, o.start + o.span - 0.05); ctx.stroke();
      ctx.restore();
      continue;
    }
    ctx.fillStyle = 'rgba(2,4,13,0.42)';
    ctx.fillRect(o.x + 9, o.y + 12, o.w, o.h);
    const gradient = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
    gradient.addColorStop(0, o.kind === 'tank' ? '#3c425d' : '#323851');
    gradient.addColorStop(1, '#23283e');
    ctx.fillStyle = gradient;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    ctx.fillRect(o.x + 9, o.y + 8, o.w - 18, 7);
    ctx.fillStyle = 'rgba(8,10,24,0.34)';
    ctx.fillRect(o.x + 10, o.y + o.h - 15, o.w - 20, 7);
    ctx.strokeStyle = 'rgba(217,255,88,0.24)';
    ctx.lineWidth = 3;
    ctx.setLineDash([9, 8]);
    ctx.beginPath(); ctx.moveTo(o.x + 12, o.y + o.h - 8); ctx.lineTo(o.x + o.w - 12, o.y + o.h - 8); ctx.stroke();
    ctx.restore();
  }
}

function drawProjectile(p) {
  const color = TEAM[p.team].color;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.36;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(p.x - p.vx * 0.025, p.y - p.vy * 0.025);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
  if (p.blade) {
    ctx.translate(p.x, p.y);
    ctx.rotate(performance.now() * 0.018);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.moveTo(0, -13); ctx.lineTo(0, 13); ctx.stroke();
  }
  ctx.restore();
}

function drawAgent(agent) {
  if (!agent.alive) {
    const progress = clamp(1 - agent.respawn / 3.4, 0, 1);
    ctx.save();
    ctx.translate(agent.spawnX, agent.spawnY);
    ctx.strokeStyle = TEAM[agent.team].color;
    ctx.globalAlpha = 0.25 + progress * 0.6;
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 8]);
    ctx.beginPath(); ctx.arc(0, 0, 23 + progress * 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress); ctx.stroke();
    ctx.restore();
    return;
  }
  const color = TEAM[agent.team].color;
  ctx.save();
  ctx.translate(agent.x, agent.y);
  ctx.rotate(agent.angle);
  ctx.fillStyle = 'rgba(4,6,16,0.42)';
  ctx.beginPath(); ctx.ellipse(5, 8, 24, 19, 0, 0, Math.PI * 2); ctx.fill();
  ctx.rotate(-agent.angle);

  if (agent.shield > 0) {
    ctx.strokeStyle = '#f7f3e8';
    ctx.globalAlpha = 0.28 + Math.sin(performance.now() * 0.012) * 0.12;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 29, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (agent.overdrive > 0) {
    ctx.strokeStyle = '#d9ff58';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.arc(0, 0, 35, performance.now() * 0.003, performance.now() * 0.003 + Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  if (agent.isPlayer) {
    ctx.strokeStyle = '#f7f3e8';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#d9ff58';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 31, -0.6, 0.6); ctx.stroke();
  }

  ctx.rotate(agent.angle);
  ctx.fillStyle = '#12162c';
  ctx.fillRect(10, -6, 24, 12);
  ctx.fillStyle = color;
  ctx.fillRect(27, -4, 10, 8);
  ctx.rotate(-agent.angle);

  ctx.fillStyle = color;
  if (agent.team === 1) {
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-15, -15, 30, 30);
    ctx.rotate(-Math.PI / 4);
  } else if (agent.team === 2) {
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(23, 18); ctx.lineTo(-23, 18); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = '#13172d';
  ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = characterOf(agent).accent;
  ctx.font = '900 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(characterOf(agent).icon, 0, 0);

  if (agent.hp < agent.maxHp) {
    ctx.fillStyle = 'rgba(7,9,20,0.72)';
    ctx.fillRect(-22, -34, 44, 5);
    ctx.fillStyle = agent.hp > 40 ? '#f7f3e8' : '#d9ff58';
    ctx.fillRect(-21, -33, 42 * (agent.hp / agent.maxHp), 3);
  }
  if (!agent.isPlayer) {
    ctx.fillStyle = 'rgba(7,9,20,0.72)';
    ctx.fillRect(-23, 27, 46, 13);
    ctx.fillStyle = '#f7f3e8';
    ctx.font = '700 8px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name, 0, 34);
  }
  ctx.restore();
}

function drawParticles() {
  for (const p of state.particles) {
    if (p.team !== state.playerTeam && !isPointVisibleToTeam(p, state.playerTeam)) continue;
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = TEAM[p.team].color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + alpha * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const text of state.texts) {
    if (text.team && text.team !== state.playerTeam && !isPointVisibleToTeam(text, state.playerTeam)) continue;
    ctx.globalAlpha = clamp(text.life / text.maxLife, 0, 1);
    ctx.fillStyle = text.team ? TEAM[text.team].color : '#f7f3e8';
    ctx.font = '900 16px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text.text, text.x, text.y);
  }
  ctx.globalAlpha = 1;
}

function drawDebug() {
  if (!state.debug) return;
  ctx.save();
  for (const bot of state.agents) {
    if (bot.isPlayer || !bot.alive) continue;
    if (bot.team !== state.playerTeam && !isAgentVisibleToTeam(bot, state.playerTeam)) continue;
    const color = bot.intent === 'recover' || bot.intent === 'support' ? '#d9ff58' : bot.intent === 'pressure' || bot.intent === 'defend' ? '#ff5f78' : '#28e0d6';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.66;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(bot.x, bot.y);
    for (let i = bot.pathIndex; i < bot.path.length; i += 1) ctx.lineTo(bot.path[i].x, bot.path[i].y);
    ctx.stroke();
    if (bot.target) {
      ctx.setLineDash([]);
      ctx.strokeRect(bot.target.x - 9, bot.target.y - 9, 18, 18);
    }
    ctx.globalAlpha = 0.92;
    ctx.font = '800 10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${ROLE_DATA[bot.role].label} // ${bot.intent.toUpperCase()}`, bot.x + 27, bot.y - 23);
  }
  ctx.globalAlpha = 0.09;
  for (let row = 0; row < NAV_ROWS; row += 1) {
    for (let col = 0; col < NAV_COLS; col += 1) {
      const danger = state.danger[state.playerTeam][navIndex(col, row)];
      if (danger < 0.05) continue;
      ctx.fillStyle = '#ff5f78';
      ctx.globalAlpha = Math.min(0.2, danger * 0.07);
      ctx.fillRect(col * NAV, row * NAV, NAV, NAV);
    }
  }
  ctx.restore();
}

function drawCrosshair() {
  if (!state.player?.alive || state.mobileControls) return;
  const x = input.mouseX;
  const y = input.mouseY;
  const firing = input.mouseDown;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#f7f3e8';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.85;
  const gap = firing ? 10 : 7;
  ctx.beginPath();
  ctx.moveTo(-gap - 7, 0); ctx.lineTo(-gap, 0);
  ctx.moveTo(gap, 0); ctx.lineTo(gap + 7, 0);
  ctx.moveTo(0, -gap - 7); ctx.lineTo(0, -gap);
  ctx.moveTo(0, gap); ctx.lineTo(0, gap + 7);
  ctx.stroke();
  ctx.fillStyle = TEAM[state.player.team].color;
  ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawLockReticle() {
  if (!state.autoLock || !state.player?.alive || !state.lockTargetId) return;
  const target = state.agents.find((agent) => agent.id === state.lockTargetId);
  if (!target || !isAgentVisibleToTeam(target, state.playerTeam) || !hasDirectVision(state.player, target, VISION_RADIUS)) return;
  const pulse = 2 + Math.sin(performance.now() * 0.012) * 2;
  const radius = target.radius + 13 + pulse;
  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.strokeStyle = '#d9ff58';
  ctx.fillStyle = '#d9ff58';
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 4; i += 1) {
    ctx.rotate(Math.PI / 2);
    ctx.fillRect(radius - 1, -1, 10, 2);
  }
  ctx.font = '900 8px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LOCK', 0, -radius - 8);
  ctx.restore();
}

function drawFogOfWar() {
  if (state.mode === 'lobby' || !state.player) return;
  fogCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  fogCtx.clearRect(0, 0, view.width, view.height);
  fogCtx.fillStyle = 'rgba(2,3,11,0.86)';
  fogCtx.fillRect(0, 0, view.width, view.height);
  fogCtx.globalCompositeOperation = 'destination-out';
  for (const ally of state.agents) {
    if (!ally.alive || ally.team !== state.playerTeam) continue;
    const screen = worldToScreen(ally.x, ally.y);
    const radius = VISION_RADIUS * view.scale;
    const gradient = fogCtx.createRadialGradient(screen.x, screen.y, radius * 0.7, screen.x, screen.y, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(0.78, 'rgba(0,0,0,0.98)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    fogCtx.fillStyle = gradient;
    fogCtx.beginPath();
    fogCtx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
    fogCtx.fill();
  }
  fogCtx.globalCompositeOperation = 'source-over';
  ctx.drawImage(fogCanvas, 0, 0, fogCanvas.width, fogCanvas.height, 0, 0, view.width, view.height);
}

function drawMinimap() {
  const mini = minimapCtx;
  if (!mini) return;
  const width = dom.minimapCanvas.width;
  const height = dom.minimapCanvas.height;
  const sx = width / WORLD.w;
  const sy = height / WORLD.h;
  mini.clearRect(0, 0, width, height);
  mini.fillStyle = '#080b18';
  mini.fillRect(0, 0, width, height);
  mini.fillStyle = '#171b31';
  mini.fillRect(3, 3, width - 6, height - 6);

  mini.globalAlpha = 0.42;
  for (let row = 0; row < ROWS; row += 2) {
    for (let col = 0; col < COLS; col += 2) {
      const owner = state.paint[row * COLS + col];
      if (!owner) continue;
      mini.fillStyle = TEAM[owner].color;
      mini.fillRect(col * CELL * sx, row * CELL * sy, CELL * 2 * sx + 1, CELL * 2 * sy + 1);
    }
  }
  mini.globalAlpha = 1;
  drawTacticalTerrain(mini, obstacles, WORLD.w, WORLD.h, width, height);

  if (state.matchMode === 'zones') {
    for (const zone of state.zones) {
      mini.strokeStyle = zone.owner ? TEAM[zone.owner].color : 'rgba(247,243,232,0.55)';
      mini.lineWidth = 2;
      mini.beginPath();
      mini.arc(zone.x * sx, zone.y * sy, Math.max(4, zone.radius * Math.min(sx, sy)), 0, Math.PI * 2);
      mini.stroke();
    }
  }

  if (state.mode !== 'lobby') {
    mini.save();
    mini.strokeStyle = 'rgba(247,243,232,0.34)';
    mini.lineWidth = 1;
    mini.strokeRect((state.camera.x - view.visibleW * 0.5) * sx, (state.camera.y - view.visibleH * 0.5) * sy, view.visibleW * sx, view.visibleH * sy);
    mini.restore();
  }

  for (const agent of state.agents) {
    if (!agent.alive) continue;
    if (agent.team !== state.playerTeam && !isAgentVisibleToTeam(agent, state.playerTeam)) continue;
    const x = agent.x * sx;
    const y = agent.y * sy;
    mini.fillStyle = TEAM[agent.team].color;
    mini.strokeStyle = agent.isPlayer || agent.id === state.camera.followId ? '#ffffff' : 'rgba(4,6,16,0.9)';
    mini.lineWidth = agent.isPlayer || agent.id === state.camera.followId ? 2 : 1;
    mini.beginPath();
    mini.arc(x, y, agent.team === state.playerTeam ? 4.2 : 4.8, 0, Math.PI * 2);
    mini.fill();
    mini.stroke();
  }

  mini.strokeStyle = 'rgba(247,243,232,0.42)';
  mini.lineWidth = 2;
  mini.strokeRect(1, 1, width - 2, height - 2);
}

function drawCountdown() {
  if (state.mode !== 'playing' || state.countdown <= 0) return;
  const number = Math.ceil(state.countdown);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '950 italic 120px system-ui, sans-serif';
  ctx.fillStyle = number > 0 ? '#f7f3e8' : '#d9ff58';
  ctx.shadowColor = TEAM[state.playerTeam].color;
  ctx.shadowBlur = 25;
  ctx.fillText(number > 0 ? number : 'GO', view.width / 2, view.height / 2);
  ctx.shadowBlur = 0;
  ctx.font = '800 14px ui-monospace, monospace';
  ctx.fillStyle = '#a8abc0';
  ctx.fillText('SQUAD LINKS READY', view.width / 2, view.height / 2 + 78);
  ctx.restore();
}

function render() {
  updateViewTransform();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = '#090b18';
  ctx.fillRect(0, 0, view.width, view.height);
  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  ctx.save();
  ctx.translate(view.ox + shakeX, view.oy + shakeY);
  ctx.scale(view.scale, view.scale);
  drawArena();
  if (state.mode !== 'lobby' && state.mode !== 'draft') {
    drawAbilityEffects();
    for (const p of state.projectiles) {
      if (p.team === state.playerTeam || isPointVisibleToTeam(p, state.playerTeam)) drawProjectile(p);
    }
    const orderedAgents = [...state.agents].sort((a, b) => a.y - b.y);
    for (const agent of orderedAgents) {
      if (agent.team === state.playerTeam || isAgentVisibleToTeam(agent, state.playerTeam)) drawAgent(agent);
    }
    drawParticles();
    drawDebug();
    drawCrosshair();
    drawLockReticle();
  }
  ctx.restore();

  drawFogOfWar();
  drawCountdown();

  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,95,120,${state.flash * 0.18})`;
    ctx.fillRect(0, 0, view.width, view.height);
  }
  drawMinimap();
}

function loop(timestamp) {
  const rawDt = state.lastTimestamp ? (timestamp - state.lastTimestamp) / 1000 : 0;
  state.lastTimestamp = timestamp;
  const dt = Math.min(rawDt, 0.033);
  if (state.mode === 'playing') updateMatch(dt);
  else if (state.mode === 'lobby') updateParticles(dt);
  render();
  requestAnimationFrame(loop);
}

function toggleAILens() {
  state.debug = !state.debug;
  dom.aiPanel.classList.toggle('visible', state.debug);
  dom.aiLensBtn.setAttribute('aria-pressed', String(state.debug));
  if (state.debug && state.mode === 'playing') addEvent('AI LENS // PATHS + INTENTS', state.playerTeam, 'acid');
}

function toggleAutoLock() {
  state.autoLock = !state.autoLock;
  if (!state.autoLock) state.lockTargetId = null;
  dom.lockBtn.setAttribute('aria-pressed', String(state.autoLock));
  dom.lockBtn.querySelector('.button-icon').textContent = state.autoLock ? '◇' : '×';
  if (state.mode === 'playing') addEvent(`AUTO LOCK // ${state.autoLock ? 'ONLINE' : 'OFFLINE'}`, state.playerTeam, state.autoLock ? 'acid' : '');
  sound.tick(state.autoLock);
}

function toggleSound() {
  state.sound = !state.sound;
  dom.soundBtn.setAttribute('aria-pressed', String(state.sound));
  dom.soundBtn.querySelector('.button-icon').textContent = state.sound ? '◖' : '×';
  if (state.sound) sound.tick(true);
}

function setMobileControls(enabled, remember = true) {
  state.mobileControls = Boolean(enabled);
  document.body.classList.toggle('touch-mode', state.mobileControls);
  dom.mobileBtn.setAttribute('aria-pressed', String(state.mobileControls));
  dom.mobileBtn.querySelector('.button-label').textContent = state.mobileControls ? 'Mobile: ON' : 'Mobile mode';
  input.moveTouch = { x: 0, y: 0 };
  input.aimTouch = { x: 0, y: 0, active: false };
  input.mouseDown = false;
  input.pointerInside = false;
  input.secondaryRequested = false;
  input.specialRequested = false;
  dom.moveStick.querySelector('i').style.transform = '';
  dom.aimStick.querySelector('i').style.transform = '';
  if (remember) {
    try { localStorage.setItem('inkfront-mobile-controls', String(state.mobileControls)); } catch { /* Storage may be unavailable in local-file previews. */ }
  }
  resizeCanvas();
}

function setupStick(element, type) {
  let activePointer = null;
  const nub = element.querySelector('i');
  const update = (event) => {
    if (!state.mobileControls || state.mode !== 'playing' || state.countdown > 0) return;
    const rect = element.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width * 0.33;
    const n = normalize(dx, dy);
    const magnitude = Math.min(1, n.length / max);
    const x = n.x * magnitude;
    const y = n.y * magnitude;
    nub.style.transform = `translate(${x * max}px, ${y * max}px)`;
    if (type === 'move') input.moveTouch = { x, y };
    else {
      input.aimTouch = { x: n.x, y: n.y, active: magnitude > 0.18 };
      input.mouseDown = magnitude > 0.18;
    }
  };
  const end = (event) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    nub.style.transform = '';
    if (type === 'move') input.moveTouch = { x: 0, y: 0 };
    else { input.aimTouch = { x: 0, y: 0, active: false }; input.mouseDown = false; }
  };
  element.addEventListener('pointerdown', (event) => {
    if (!state.mobileControls || state.mode !== 'playing' || state.countdown > 0) return;
    event.preventDefault();
    activePointer = event.pointerId;
    element.setPointerCapture(event.pointerId);
    update(event);
  });
  element.addEventListener('pointermove', (event) => {
    if (event.pointerId === activePointer) update(event);
  });
  element.addEventListener('pointerup', end);
  element.addEventListener('pointercancel', end);
}

document.querySelectorAll('.team-choice').forEach((button) => {
  button.addEventListener('click', () => {
    state.playerTeam = Number(button.dataset.team);
    document.querySelectorAll('.team-choice').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
      item.querySelector('i').textContent = selected ? 'SELECTED' : 'JOIN';
    });
    sound.init();
    sound.tick(true);
    updateSetupSummary();
  });
});

document.querySelectorAll('[data-difficulty]').forEach((button) => {
  button.addEventListener('click', () => {
    state.difficulty = button.dataset.difficulty;
    document.querySelectorAll('[data-difficulty]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    sound.init();
    sound.tick();
    updateSetupSummary();
  });
});

document.querySelectorAll('[data-mode]').forEach((button) => {
  button.addEventListener('click', () => {
    state.matchMode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    dom.minimapMode.textContent = MATCH_MODES[state.matchMode].short;
    sound.init();
    sound.tick(true);
    updateSetupSummary();
  });
});

document.querySelectorAll('[data-size]').forEach((button) => {
  button.addEventListener('click', () => {
    state.teamSize = Number(button.dataset.size);
    document.querySelectorAll('[data-size]').forEach((item) => {
      item.classList.toggle('selected', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    updateSetupSummary();
    sound.tick();
  });
});
document.querySelectorAll('[data-map]').forEach((button) => {
  button.addEventListener('click', () => {
    state.mapChoice = button.dataset.map;
    document.querySelectorAll('[data-map]').forEach((item) => {
      item.classList.toggle('selected', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    updateSetupSummary();
    sound.tick();
  });
});
document.querySelectorAll('[data-step]').forEach((button) => {
  button.addEventListener('click', () => button.dataset.step === 'upgrade' ? beginUpgradeDraft() : setSetupStep(button.dataset.step));
});
dom.deploy.addEventListener('click', () => state.setupStep === 'match' ? setSetupStep('character') : beginUpgradeDraft());
dom.rematch.addEventListener('click', beginUpgradeDraft);
dom.setup.addEventListener('click', showSetup);
dom.resume.addEventListener('click', () => togglePause(false));
dom.restartPause.addEventListener('click', beginUpgradeDraft);
dom.upgradeBack.addEventListener('click', () => setSetupStep(state.setupStep === 'upgrade' ? 'character' : 'match'));
dom.secondaryBtn.addEventListener('click', () => { if (state.mode === 'playing' && state.countdown <= 0) input.secondaryRequested = true; });
dom.specialBtn.addEventListener('click', () => { if (state.mode === 'playing' && state.countdown <= 0) input.specialRequested = true; });
dom.pauseBtn.addEventListener('click', () => togglePause());
dom.lockBtn.addEventListener('click', toggleAutoLock);
dom.aiLensBtn.addEventListener('click', toggleAILens);
dom.soundBtn.addEventListener('click', toggleSound);
dom.mobileBtn.addEventListener('click', () => setMobileControls(!state.mobileControls));
dom.mobileDash.addEventListener('pointerdown', (event) => { event.preventDefault(); input.dashRequested = true; });

window.addEventListener('keydown', (event) => {
  if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyF'].includes(event.code)) event.preventDefault();
  input.keys.add(event.code);
  if (event.code === 'Space' && !event.repeat) input.dashRequested = true;
  if (state.mode === 'playing' && state.countdown <= 0 && !event.repeat) {
    if (event.code === 'KeyE') input.secondaryRequested = true;
    if (event.code === 'KeyF') input.specialRequested = true;
  }
  if (event.code === 'KeyB' && !event.repeat) toggleAILens();
  if (event.code === 'KeyQ' && !event.repeat) toggleAutoLock();
  if (event.code === 'KeyM' && !event.repeat) toggleSound();
  if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) togglePause();
});

window.addEventListener('keyup', (event) => input.keys.delete(event.code));
window.addEventListener('blur', () => {
  input.keys.clear();
  input.mouseDown = false;
  if (state.mode === 'playing' && state.countdown <= 0) togglePause(true);
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  input.pointerClientX = event.clientX;
  input.pointerClientY = event.clientY;
  input.pointerInside = true;
  const p = screenToWorld(event.clientX, event.clientY);
  input.mouseX = p.x;
  input.mouseY = p.y;
});
canvas.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') return;
  if (state.mode !== 'playing' || state.countdown > 0) return;
  if (event.button === 2) input.secondaryRequested = true;
  if (event.button === 0) {
    sound.init();
    input.mouseDown = true;
    canvas.setPointerCapture?.(event.pointerId);
  }
});
canvas.addEventListener('pointerup', (event) => { if (event.button === 0) input.mouseDown = false; });
canvas.addEventListener('pointercancel', () => { input.mouseDown = false; });
canvas.addEventListener('pointerleave', () => { input.pointerInside = false; });
canvas.addEventListener('contextmenu', (event) => event.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.mode === 'playing' && state.countdown <= 0) togglePause(true);
});

window.addEventListener('resize', resizeCanvas);
setupStick(dom.moveStick, 'move');
setupStick(dom.aimStick, 'aim');
configureArena();
renderCharacterPicker();
setSetupStep('match');
resetPaint();
try {
  const savedControls = localStorage.getItem('inkfront-mobile-controls');
  if (savedControls !== null) state.mobileControls = savedControls === 'true';
} catch { /* Use touch detection when storage is unavailable. */ }
setMobileControls(state.mobileControls, false);
resizeCanvas();
requestAnimationFrame(loop);
