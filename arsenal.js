const CHARACTERS = {
  rook: {
    name: 'ROOK', title: 'The walking fortress', icon: '⬡', role: 'guard', accent: '#ffc86a',
    primary: 'Bastion repeater', rate: 0.16, damage: 17, speed: 650, paint: 37,
    secondary: 'Rampart disc', secondaryText: 'Throw a 5-second bullet shield. Allies shoot out; rival shots dissolve.', cooldown: 10,
    special: 'Citadel', specialText: 'Raise a wide healing dome for 7 seconds. Allies inside take 65% less damage.',
  },
  vex: {
    name: 'VEX', title: 'Angles are everything', icon: '✧', role: 'vanguard', accent: '#ff9bb8',
    primary: 'Prism carbine', rate: 0.11, damage: 12, speed: 790, paint: 32,
    secondary: 'Bankshot blade', secondaryText: 'A heavy ink blade ricochets off up to three walls, coating its route.', cooldown: 7,
    special: 'Prism bloom', specialText: 'Three expanding volleys of ink blades burst in every direction.',
  },
  miso: {
    name: 'MISO', title: 'A little chaos, a lot of care', icon: '✿', role: 'painter', accent: '#c3f794',
    primary: 'Petal sprayer', rate: 0.085, damage: 8.5, speed: 670, paint: 43,
    secondary: 'Seedling station', secondaryText: 'Plant a 7-second garden that repairs teammates and restores their ink.', cooldown: 11,
    special: 'Wildgarden', specialText: 'A huge 8-second garden heals allies, coats the floor, and stings rivals.',
  },
  kilo: {
    name: 'KILO', title: 'Make an entrance', icon: '✦', role: 'vanguard', accent: '#ffad70',
    primary: 'Slugger cannon', rate: 0.25, damage: 27, speed: 590, paint: 48,
    secondary: 'Pop mortar', secondaryText: 'Lob an explosive over cover. Its warning ring gives enemies time to escape.', cooldown: 8,
    special: 'Starfall', specialText: 'Call three staggered, massive ink strikes along your aim direction.',
  },
  nyx: {
    name: 'NYX', title: 'Catch me if you can', icon: '⌁', role: 'rover', accent: '#b7a5ff',
    primary: 'Needle driver', rate: 0.095, damage: 10, speed: 900, paint: 28,
    secondary: 'Afterimage mine', secondaryText: 'Leave a hidden-to-rivals proximity trap. It arms, then bursts on contact.', cooldown: 8,
    special: 'Echo drive', specialText: 'For 7 seconds: move 40% faster, resist damage, and fire twin shots.',
  },
  tess: {
    name: 'TESS', title: 'Stay a little longer', icon: 'ϟ', role: 'guard', accent: '#8bd5ff',
    primary: 'Arc caster', rate: 0.13, damage: 14, speed: 735, paint: 36,
    secondary: 'Static snare', secondaryText: 'Launch a 5-second field that slows rival movement by 45%.', cooldown: 9,
    special: 'Stormwheel', specialText: 'A wide electric storm slows, damages, and repaints an area for 7 seconds.',
  },
};

const UPGRADES = [
  { id: 'capacitor', name: 'SUPERCHARGER', icon: 'ϟ', stat: '+45% special charge', text: 'Charge your big ability faster from time, damage, and painting.' },
  { id: 'quickdraw', name: 'POCKET WORKSHOP', icon: '⚙', stat: '−30% secondary cooldown', text: 'Bring your signature second weapon back sooner.' },
  { id: 'reservoir', name: 'DEEP RESERVOIR', icon: '◒', stat: '−30% shot cost · +25% refill', text: 'Keep spraying and recover ink more quickly.' },
  { id: 'kinetic', name: 'KINETIC SOLES', icon: '»', stat: '+16% speed · −25% dash cooldown', text: 'Rotate between fights and escape dangerous ground.' },
  { id: 'impact', name: 'DENSE INK', icon: '✦', stat: '+20% primary damage', text: 'Heavier primary shots reward accurate aim.' },
  { id: 'hull', name: 'REINFORCED SHELL', icon: '⬡', stat: '+35 maximum hull', text: 'Extra health for pushing, protecting, and surviving.' },
];

function characterOf(agent) { return CHARACTERS[agent.characterId]; }
function upgradeIs(agent, id) { return agent.upgradeId === id; }
function specialGain(agent, amount) {
  if (!agent.alive || agent.overdrive > 0) return;
  agent.specialCharge = Math.min(100, agent.specialCharge + amount * (upgradeIs(agent, 'capacitor') ? 1.45 : 1));
}

function openAbilityPoint(point) {
  if (!pointInObstacle(point.x, point.y, 8)) return point;
  for (let radius = 18; radius <= 160; radius += 18) {
    for (let direction = 0; direction < 16; direction += 1) {
      const angle = direction * Math.PI / 8;
      const candidate = { x: clamp(point.x + Math.cos(angle) * radius, 35, WORLD.w - 35), y: clamp(point.y + Math.sin(angle) * radius, 35, WORLD.h - 35) };
      if (!pointInObstacle(candidate.x, candidate.y, 8)) return candidate;
    }
  }
  return point;
}

function abilityAimPoint(agent, range = 220) {
  let reach = range;
  if (agent.isPlayer && !input.aimTouch.active && input.pointerInside) reach = Math.min(range, Math.hypot(input.mouseX - agent.x, input.mouseY - agent.y));
  if (!agent.isPlayer && agent.abilityTarget) reach = Math.min(range, dist(agent, agent.abilityTarget));
  let point = { x: clamp(agent.x + Math.cos(agent.angle) * reach, 35, WORLD.w - 35), y: clamp(agent.y + Math.sin(agent.angle) * reach, 35, WORLD.h - 35) };
  // Ground deployments stop before solid cover; artillery may land beyond it.
  if (agent.characterId !== 'kilo') {
    for (let step = 0; step < 16 && (pointInObstacle(point.x, point.y, 15) || !hasLineOfSight(agent, point)); step += 1) {
      reach = Math.max(0, reach - 18);
      point = { x: agent.x + Math.cos(agent.angle) * reach, y: agent.y + Math.sin(agent.angle) * reach };
    }
  }
  return openAbilityPoint(point);
}

function addAbilityEffect(agent, type, point, radius, life, extra = {}) {
  const effect = { type, team: agent.team, ownerId: agent.id, x: point.x, y: point.y, radius, life, maxLife: life, pulse: 0, ...extra };
  state.effects.push(effect);
  return effect;
}

function useSecondary(agent) {
  if (!agent?.alive || agent.secondaryCd > 0 || agent.ammo < 20 || agent.dashTime > 0) return false;
  const hero = characterOf(agent);
  const point = abilityAimPoint(agent, agent.characterId === 'rook' ? 120 : agent.characterId === 'miso' ? 90 : 245);
  agent.ammo -= 20;
  agent.secondaryCd = hero.cooldown * (upgradeIs(agent, 'quickdraw') ? 0.7 : 1);
  agent.secondaryUses += 1;
  if (agent.characterId === 'rook') addAbilityEffect(agent, 'barrier', point, 86, 5);
  else if (agent.characterId === 'vex') {
    state.projectiles.push({ x: agent.x + Math.cos(agent.angle) * 31, y: agent.y + Math.sin(agent.angle) * 31, vx: Math.cos(agent.angle) * 580, vy: Math.sin(agent.angle) * 580, team: agent.team, ownerId: agent.id, life: 1.8, trail: 0, radius: 10, damage: 32, paintRadius: 46, bounces: 3, blade: true });
  } else if (agent.characterId === 'miso') addAbilityEffect(agent, 'seedling', point, 112, 7);
  else if (agent.characterId === 'kilo') addAbilityEffect(agent, 'mortar', point, 103, 1.05, { damage: 44 });
  else if (agent.characterId === 'nyx') addAbilityEffect(agent, 'mine', agent, 95, 13, { armedIn: 0.65 });
  else if (agent.characterId === 'tess') addAbilityEffect(agent, 'snare', point, 106, 5);
  if (agent.isPlayer) sound.tone(390, 0.12, 'triangle', 0.035, 190);
  return true;
}

function useSpecial(agent) {
  if (!agent?.alive || agent.specialCharge < 100) return false;
  const hero = characterOf(agent);
  agent.specialCharge = 0;
  agent.specialUses += 1;
  const point = abilityAimPoint(agent, 240);
  if (agent.characterId === 'rook') addAbilityEffect(agent, 'citadel', agent, 163, 7);
  else if (agent.characterId === 'vex') addAbilityEffect(agent, 'prism', agent, 50, 0.95, { nextVolley: 0, volleys: 3 });
  else if (agent.characterId === 'miso') addAbilityEffect(agent, 'garden', agent, 205, 8);
  else if (agent.characterId === 'kilo') {
    for (let i = 0; i < 3; i += 1) {
      const reach = 130 + i * 125;
      addAbilityEffect(agent, 'starfall', openAbilityPoint({ x: clamp(agent.x + Math.cos(agent.angle) * reach, 35, WORLD.w - 35), y: clamp(agent.y + Math.sin(agent.angle) * reach, 35, WORLD.h - 35) }), 135, 0.9 + i * 0.44, { damage: 65 });
    }
  } else if (agent.characterId === 'nyx') agent.overdrive = 7;
  else if (agent.characterId === 'tess') addAbilityEffect(agent, 'storm', point, 180, 7);
  addEvent(`${agent.name} // ${hero.special.toUpperCase()}`, agent.team);
  if (agent.isPlayer || isPointVisibleToTeam(agent, state.playerTeam)) sound.tone(180, 0.32, 'sawtooth', 0.03, 620);
  return true;
}

function explodeAbility(effect) {
  paintAt(effect.x, effect.y, effect.radius, effect.team);
  for (const target of state.agents) {
    if (!target.alive || target.team === effect.team) continue;
    const distance = dist(target, effect);
    if (distance > effect.radius + target.radius || !hasLineOfSight(effect, target)) continue;
    damageAgent(target, (effect.damage || 42) * (1 - Math.min(0.45, distance / effect.radius * 0.45)), effect);
  }
  state.effects.push({ ...effect, type: 'burst', life: 0.45, maxLife: 0.45 });
}

function updateAbilityEffects(dt) {
  for (let i = state.effects.length - 1; i >= 0; i -= 1) {
    const effect = state.effects[i];
    effect.life -= dt;
    effect.pulse -= dt;
    if (effect.type === 'mine') {
      effect.armedIn -= dt;
      if (effect.armedIn <= 0 && state.agents.some((a) => a.alive && a.team !== effect.team && dist(a, effect) < 67 && hasLineOfSight(effect, a))) {
        effect.life = 0;
        effect.triggered = true;
      }
    }
    if (effect.type === 'prism') {
      effect.nextVolley -= dt;
      if (effect.nextVolley <= 0 && effect.volleys > 0) {
        for (let shot = 0; shot < 14; shot += 1) {
          const angle = shot / 14 * Math.PI * 2 + effect.volleys * 0.18;
          state.projectiles.push({ x: effect.x + Math.cos(angle) * 30, y: effect.y + Math.sin(angle) * 30, vx: Math.cos(angle) * 570, vy: Math.sin(angle) * 570, team: effect.team, ownerId: effect.ownerId, life: 0.72, trail: 0, radius: 8, damage: 20, paintRadius: 40, bounces: 1, blade: true });
        }
        effect.volleys -= 1;
        effect.nextVolley = 0.29;
      }
    }
    if (effect.pulse <= 0 && ['seedling', 'citadel', 'garden', 'storm', 'snare'].includes(effect.type)) {
      effect.pulse = 0.2;
      if (effect.type !== 'citadel') paintAt(effect.x, effect.y, effect.radius * 0.85, effect.team, false);
      for (const target of state.agents) {
        if (!target.alive || dist(target, effect) > effect.radius || !hasLineOfSight(effect, target)) continue;
        if (target.team === effect.team) {
          if (['seedling', 'citadel', 'garden'].includes(effect.type)) {
            target.hp = Math.min(target.maxHp, target.hp + (effect.type === 'garden' ? 3 : 2.4));
            target.ammo = Math.min(100, target.ammo + 3);
          }
        } else {
          if (effect.type === 'snare' || effect.type === 'storm') target.slowTime = Math.max(target.slowTime, 0.35);
          if (effect.type === 'garden' || effect.type === 'storm') damageAgent(target, effect.type === 'storm' ? 3.4 : 2.6, effect);
        }
      }
    }
    if (effect.life <= 0) {
      if (['mortar', 'starfall'].includes(effect.type) || (effect.type === 'mine' && effect.triggered)) explodeAbility(effect);
      state.effects.splice(i, 1);
    }
  }
}

function botUseAbilities(bot, dt) {
  bot.abilityThink -= dt;
  if (bot.abilityThink > 0) return;
  bot.abilityThink = 0.25 + botTuning(bot).reaction;
  const contacts = visibleEnemies(bot).map((sight) => sight.enemy);
  const enemy = contacts.sort((a, b) => dist(bot, a) - dist(bot, b))[0];
  const allies = state.agents.filter((a) => a.alive && a.team === bot.team && dist(a, bot) < 220);
  const hurtAlly = allies.some((a) => a.hp < a.maxHp * 0.7);
  const inZone = state.matchMode === 'zones' && state.zones.some((zone) => dist(bot, zone) < zone.radius * 1.4);
  const underFire = performance.now() / 1000 - bot.lastDamage < 1.8;
  bot.abilityTarget = enemy ? { x: enemy.x, y: enemy.y } : null;
  if (enemy) bot.angle = Math.atan2(enemy.y - bot.y, enemy.x - bot.x);
  const defensive = bot.characterId === 'rook' || bot.characterId === 'miso';
  const wantSecondary = defensive ? (hurtAlly || underFire || (inZone && enemy)) : bot.characterId === 'nyx' ? (enemy || inZone || underFire) : Boolean(enemy);
  if (wantSecondary) useSecondary(bot);
  const wantSpecial = defensive ? (hurtAlly && (enemy || underFire)) || (inZone && contacts.length > 0) : bot.characterId === 'nyx' ? contacts.length > 0 && bot.hp > 25 : contacts.length >= 2 || (enemy && (inZone || enemy.hp > 45));
  if (wantSpecial) useSpecial(bot);
}

function drawAbilityEffects() {
  for (const effect of state.effects) {
    if (effect.team !== state.playerTeam && !isPointVisibleToTeam(effect, state.playerTeam)) continue;
    if (effect.type === 'mine' && effect.team !== state.playerTeam && !state.agents.some((a) => a.alive && a.team === state.playerTeam && dist(a, effect) < 120 && hasLineOfSight(a, effect))) continue;
    const warning = ['mortar', 'starfall'].includes(effect.type);
    const color = TEAM[effect.team].color;
    ctx.save();
    ctx.translate(effect.x, effect.y);
    const radius = effect.type === 'mine' ? 18 : effect.type === 'burst' ? effect.radius * (1.4 - effect.life / effect.maxLife) : effect.radius;
    ctx.fillStyle = `rgba(${TEAM[effect.team].rgb},${warning ? 0.12 : 0.07})`;
    ctx.strokeStyle = color;
    ctx.lineWidth = effect.type === 'citadel' || effect.type === 'barrier' ? 5 : 2;
    ctx.setLineDash(warning ? [12, 8] : effect.type === 'snare' || effect.type === 'storm' ? [4, 9] : []);
    ctx.globalAlpha = effect.type === 'burst' ? effect.life / effect.maxLife : 0.55 + Math.sin(performance.now() * 0.006) * 0.15;
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.setLineDash([]);
    if (warning) {
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, radius * (1 - effect.life / effect.maxLife), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = color;
    ctx.font = '900 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(warning ? '!' : effect.type === 'mine' ? '×' : effect.type === 'barrier' || effect.type === 'citadel' ? '⬡' : effect.type === 'seedling' || effect.type === 'garden' ? '+' : 'ϟ', 0, 0);
    ctx.restore();
  }
}
