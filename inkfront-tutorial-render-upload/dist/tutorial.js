(() => {
  'use strict';

  const VERSION = '1';
  const STORAGE_KEY = 'inkfront-tutorial';
  const $ = (id) => document.getElementById(id);
  const ui = Object.fromEntries([
    'tutorialScreen', 'tutorialWelcome', 'tutorialComplete', 'tutorialPcBtn', 'tutorialMobileBtn',
    'tutorialPcHint', 'tutorialMobileHint', 'tutorialStartBtn', 'tutorialSkipWelcome',
    'tutorialSkipPractice', 'tutorialFinishBtn', 'tutorialAgainBtn', 'tutorialReplayBtn',
    'tutorialCoach', 'tutorialPracticeFooter', 'tutorialStepLabel', 'tutorialProgress',
    'tutorialLessonTitle', 'tutorialLessonCaption', 'tutorialControlHint', 'tutorialTaskStatus',
    'tutorialNextBtn', 'tutorialSwitchBtn',
  ].map((id) => [id, $(id)]));

  const detectedMobile = matchMedia('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches);
  const tutorial = { phase: 'closed', step: 0, passed: false, paused: false, saved: null, baseline: {}, elapsed: 0 };
  const blockedButtons = ['onlineBtn', 'accountBtn', 'aiLensBtn', 'lockBtn'].map($);
  const previousDisabled = new Map();
  const lessons = [
    { name: 'MOVE', title: 'Find your feet.',
      pc: 'Use WASD to reach the glowing ring. The camera follows you.',
      mobile: 'Drag anywhere on the left half to reach the glowing ring. Lift your thumb to stop.',
      pcHint: '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>Move to the ring</span>',
      mobileHint: '<span class="tutorial-gesture">◉ →</span><span>LEFT HALF · drag to move</span>',
      success: 'You’ve got movement.' },
    { name: 'AIM + SPRAY', title: 'Make your mark.',
      pc: 'Aim with your mouse. Hold left click to spray the floor or target. More painted ground wins Turf Claim.',
      mobile: 'Drag on the right half to aim and spray. Use both thumbs to move and fire together.',
      pcHint: '<kbd>MOUSE</kbd><kbd>LEFT CLICK</kbd><span>Aim + hold to spray</span>',
      mobileHint: '<span class="tutorial-gesture">◉ ↗</span><span>RIGHT HALF · drag to aim + fire</span>',
      success: 'That’s your turf now.' },
    { name: 'DASH', title: 'Slip out of trouble.',
      pc: 'Press Space while moving to dash. It helps you dodge and reach cover. Then it needs a short recharge.',
      mobile: 'Tap DASH while moving to burst forward. Use it to dodge or reach cover. It recharges after use.',
      pcHint: '<kbd>SPACE</kbd><span>Move + dash</span>',
      mobileHint: '<kbd>DASH</kbd><span>Tap the round button below</span>',
      success: 'A quick escape. Nicely done.' },
    { name: 'SECONDARY', title: 'Try a different angle.',
      pc: 'Press E to throw Vex’s Bankshot blade. It bounces off walls. Every character has a different secondary.',
      mobile: 'Tap SECONDARY below to throw Vex’s bouncing blade. Every character has a different secondary.',
      pcHint: '<kbd>E</kbd><span>Bankshot blade</span>',
      mobileHint: '<kbd>SECONDARY</kbd><span>Tap Bankshot blade below</span>',
      success: 'Your second weapon is ready for action.' },
    { name: 'SPECIAL', title: 'Go big.',
      pc: 'Press F to unleash Prism bloom. Specials charge as you play. We filled yours for this lesson.',
      mobile: 'Tap SPECIAL below for a huge burst of ink. Specials charge as you play. Yours is ready now.',
      pcHint: '<kbd>F</kbd><span>Prism bloom · fully charged</span>',
      mobileHint: '<kbd>SPECIAL</kbd><span>Tap Prism bloom below</span>',
      success: 'Special delivered.' },
    { name: 'RECOVER + MAP', title: 'Know your way home.',
      pc: 'Return to the glowing spawn ring to heal safely. The map shows both teams; rivals appear only when your squad spots them.',
      mobile: 'Drag left to return to your glowing spawn ring and heal. The map shows allies and spotted rivals. Your team shares vision.',
      pcHint: '<kbd>A</kbd><span>Return to your aqua ring</span>',
      mobileHint: '<span class="tutorial-gesture">← ◉</span><span>LEFT HALF · head back to spawn</span>',
      success: 'Recovered. Your squad is waiting.' },
  ];

  function remember(result) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, result })); } catch { /* Practice also works without storage. */ }
  }

  function setModal(modal) {
    document.querySelector('.topbar').inert = modal;
    dom.start.inert = modal || tutorial.phase === 'practice';
    dom.hud.inert = modal;
    document.querySelector('.mobile-controls').inert = modal;
  }

  function setDevice(mobile) {
    clearHeldControls();
    setMobileControls(mobile);
    ui.tutorialPcBtn.setAttribute('aria-pressed', String(!mobile));
    ui.tutorialMobileBtn.setAttribute('aria-pressed', String(mobile));
    ui.tutorialSwitchBtn.textContent = `${mobile ? 'Mobile' : 'PC'} controls ⇄`;
    if (tutorial.phase === 'practice') renderLesson();
  }

  function open() {
    if (state.online || !['lobby', 'draft'].includes(state.mode) || globalThis.InkfrontOnline?.hasDialog()) return;
    tutorial.saved = Object.fromEntries(['teamSize', 'matchMode', 'mapChoice', 'activeMap', 'lastRandomMap', 'layoutSeed',
      'layoutVariant', 'playerTeam', 'characterId', 'upgradeId', 'upgradeOffers', 'difficulty', 'setupStep', 'autoLock', 'debug'].map((key) => [key, state[key]]));
    tutorial.phase = 'welcome';
    for (const button of blockedButtons) { previousDisabled.set(button, button.disabled); button.disabled = true; }
    setModal(true);
    clearHeldControls();
    document.body.classList.add('tutorial-open');
    ui.tutorialScreen.hidden = false;
    ui.tutorialScreen.setAttribute('aria-labelledby', 'tutorialWelcomeTitle');
    ui.tutorialWelcome.hidden = false;
    ui.tutorialComplete.hidden = true;
    ui.tutorialPcHint.hidden = detectedMobile;
    ui.tutorialMobileHint.hidden = !detectedMobile;
    setDevice(state.mobileControls);
    $('tutorialWelcomeTitle').focus({ preventScroll: true });
  }

  function startPractice() {
    tutorial.phase = 'practice';
    setModal(false);
    tutorial.paused = false;
    document.body.classList.add('tutorial-practice');
    document.body.classList.remove('tutorial-paused');
    ui.tutorialScreen.hidden = true;
    ui.tutorialCoach.hidden = false;
    ui.tutorialPracticeFooter.hidden = false;
    Object.assign(state, { online: false, teamSize: 1, matchMode: 'turf', mapChoice: 'switchyard',
      playerTeam: 1, characterId: 'vex', upgradeId: 'reservoir', difficulty: 'rookie', autoLock: true, debug: false });
    resetMatch();
    // A clear lane and one stationary practice target. Use the real physics,
    // ink, weapons and vision without running rival AI or the match clock.
    obstacles = [];
    buildPaintMask();
    resetPaint();
    const target = state.agents.find((agent) => agent.team === 2);
    Object.assign(target, { x: 595, y: WORLD.h / 2, spawnX: 595, spawnY: WORLD.h / 2,
      hp: 10000, maxHp: 10000, shield: 0, name: 'PRACTICE TARGET', firing: false });
    state.countdown = 0;
    state.mode = 'playing';
    state.player.shield = 0;
    dom.start.hidden = dom.pause.hidden = dom.result.hidden = true;
    dom.hud.classList.add('visible');
    dom.aiPanel.classList.remove('visible');
    dom.lockBtn.setAttribute('aria-pressed', 'true');
    dom.lockBtn.querySelector('.button-icon').textContent = '◇';
    dom.aiLensBtn.setAttribute('aria-pressed', 'false');
    dom.playerName.textContent = 'VEX // PRACTICE';
    dom.playerName.style.color = TEAM[1].color;
    dom.minimapMode.textContent = 'PRACTICE';
    dom.formatBadge.textContent = 'TRAINING GROUND';
    sound.init();
    setLesson(0);
    canvas.focus({ preventScroll: true });
  }

  function renderLesson() {
    const lesson = lessons[tutorial.step];
    ui.tutorialStepLabel.textContent = `${String(tutorial.step + 1).padStart(2, '0')} / 06 · ${lesson.name}`;
    ui.tutorialLessonTitle.textContent = lesson.title;
    ui.tutorialLessonCaption.textContent = state.mobileControls ? lesson.mobile : lesson.pc;
    ui.tutorialControlHint.innerHTML = state.mobileControls ? lesson.mobileHint : lesson.pcHint;
    ui.tutorialProgress.innerHTML = lessons.map((item, index) => `<span class="${index < tutorial.step ? 'done' : index === tutorial.step ? 'current' : ''}" title="${item.name}"></span>`).join('');
    ui.tutorialProgress.setAttribute('aria-label', `Lesson ${tutorial.step + 1} of ${lessons.length}`);
    ui.tutorialTaskStatus.textContent = tutorial.paused ? 'Paused · tap Resume' : tutorial.passed ? lesson.success : 'Try it now';
    ui.tutorialTaskStatus.classList.toggle('passed', tutorial.passed);
    ui.tutorialNextBtn.textContent = tutorial.paused ? 'Resume practice →' : tutorial.passed ? tutorial.step === 5 ? 'Finish tutorial →' : 'Continue →' : 'Next tip →';
    ui.tutorialSwitchBtn.textContent = `${state.mobileControls ? 'Mobile' : 'PC'} controls ⇄`;
  }

  function setLesson(index) {
    clearHeldControls();
    tutorial.step = index;
    tutorial.passed = false;
    tutorial.elapsed = 0;
    const player = state.player;
    // Place players in the clear firing lane, even if they skipped movement or
    // wandered back into the spawn where firing is deliberately disabled.
    if (index > 0 && (isInOwnSafeZone(player) || index === 5)) {
      player.x = 345; player.y = WORLD.h / 2; player.vx = player.vy = 0;
    }
    player.ammo = 100;
    player.secondaryCd = 0;
    player.dashCd = 0;
    player.dashTime = 0;
    if (index === 4) player.specialCharge = 100;
    if (index === 5) {
      player.hp = 55; player.ammo = 45;
      player.overdrive = 0;
      state.effects.length = 0;
      state.projectiles.length = 0;
    }
    tutorial.baseline = { shots: player.shotsFired, secondary: player.secondaryUses, special: player.specialUses };
    document.body.classList.toggle('tutorial-map-lesson', index === 5);
    renderLesson();
    updateVision();
    updateCamera(1);
    updateHUD(true);
    canvas.focus({ preventScroll: true });
  }

  function complete() {
    clearHeldControls();
    tutorial.phase = 'complete';
    setModal(true);
    tutorial.paused = false;
    state.mode = 'paused';
    document.body.classList.remove('tutorial-practice', 'tutorial-paused', 'tutorial-map-lesson');
    ui.tutorialCoach.hidden = ui.tutorialPracticeFooter.hidden = true;
    ui.tutorialWelcome.hidden = true;
    ui.tutorialComplete.hidden = false;
    ui.tutorialScreen.hidden = false;
    ui.tutorialScreen.setAttribute('aria-labelledby', 'tutorialCompleteTitle');
    remember('completed');
    $('tutorialCompleteTitle').focus({ preventScroll: true });
  }

  function close(result = 'skipped') {
    remember(result);
    clearHeldControls();
    tutorial.phase = 'closed';
    setModal(false);
    for (const [button, disabled] of previousDisabled) button.disabled = disabled;
    previousDisabled.clear();
    tutorial.paused = false;
    document.body.classList.remove('tutorial-open', 'tutorial-practice', 'tutorial-paused', 'tutorial-map-lesson');
    ui.tutorialScreen.hidden = ui.tutorialCoach.hidden = ui.tutorialPracticeFooter.hidden = true;
    Object.assign(state, tutorial.saved || {});
    tutorial.saved = null;
    state.agents = [];
    state.player = null;
    state.projectiles.length = state.particles.length = state.texts.length = state.effects.length = 0;
    state.lockTargetId = null;
    state.shake = state.flash = 0;
    configureArena();
    resetPaint();
    dom.safeNotice.hidden = dom.respawnNotice.hidden = true;
    dom.minimapMode.textContent = MATCH_MODES[state.matchMode].short;
    dom.lockBtn.setAttribute('aria-pressed', String(state.autoLock));
    dom.lockBtn.querySelector('.button-icon').textContent = state.autoLock ? '◇' : '×';
    dom.aiLensBtn.setAttribute('aria-pressed', String(state.debug));
    dom.aiPanel.classList.toggle('visible', state.debug);
    setSetupStep(state.setupStep || 'match');
    renderCharacterPicker();
    resizeCanvas();
    ui.tutorialReplayBtn.focus({ preventScroll: true });
  }

  function pause(force) {
    if (tutorial.phase !== 'practice') return;
    tutorial.paused = typeof force === 'boolean' ? force : !tutorial.paused;
    clearHeldControls();
    state.mode = tutorial.paused ? 'paused' : 'playing';
    document.body.classList.toggle('tutorial-paused', tutorial.paused);
    renderLesson();
  }

  function update(dt) {
    if (tutorial.paused) return;
    if (!['playing', 'paused'].includes(state.mode) || state.online) { close(); return; }
    tutorial.elapsed += dt;
    const player = state.player;
    updateAgentTimers(player, dt);
    player.firing = false;
    updatePlayer(player, dt);
    updateProjectiles(dt);
    updateAbilityEffects(dt);
    updateParticles(dt);
    updateVision();
    updateCamera(dt);
    state.shake = Math.max(0, state.shake - dt * 22);
    state.flash = Math.max(0, state.flash - dt * 2.5);
    // Infinite practice supplies; recovery is real in the final lesson.
    if (tutorial.step < 5) {
      player.hp = player.maxHp;
      player.ammo = Math.max(player.ammo, 50);
    }
    if (tutorial.step === 4 && !tutorial.passed) player.specialCharge = 100;
    const passed = [
      Math.hypot(player.x - 345, player.y - WORLD.h / 2) < 62,
      player.shotsFired - tutorial.baseline.shots >= 5,
      player.dashCd > 0,
      player.secondaryUses > tutorial.baseline.secondary,
      player.specialUses > tutorial.baseline.special,
      isInOwnSafeZone(player) && player.hp >= 90,
    ][tutorial.step];
    if (!tutorial.passed && passed) {
      tutorial.passed = true;
      renderLesson();
      sound.tick(true);
    }
    if (isInOwnSafeZone(player) && tutorial.step > 0 && tutorial.step < 5 && !tutorial.passed) {
      ui.tutorialTaskStatus.textContent = 'Leave the spawn ring to use weapons';
    } else if (!tutorial.passed && !tutorial.paused) ui.tutorialTaskStatus.textContent = 'Try it now';
    updateHUD();
  }

  function draw(context) {
    if (tutorial.phase !== 'practice') return;
    const point = tutorial.step === 0 ? { x: 345, y: WORLD.h / 2 } :
      tutorial.step === 5 ? { x: TEAM[1].spawnX, y: TEAM[1].spawnY } : null;
    context.save();
    if (point) {
      const radius = tutorial.step === 5 ? 75 : 43;
      context.strokeStyle = '#d9f58a';
      context.fillStyle = 'rgba(217,245,138,.08)';
      context.lineWidth = 3;
      context.setLineDash([8, 6]);
      context.beginPath(); context.arc(point.x, point.y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#d9f58a'; context.textAlign = 'center'; context.font = '800 12px system-ui';
      context.fillText(tutorial.step === 5 ? 'HEAL HERE' : 'MOVE HERE', point.x, point.y - radius - 14);
    }
    if (tutorial.step > 0 && tutorial.step < 5) {
      context.fillStyle = '#ff9bb8'; context.textAlign = 'center'; context.font = '700 10px system-ui';
      context.fillText('PRACTICE TARGET · WON’T SHOOT', 595, WORLD.h / 2 - 45);
    }
    context.restore();
  }

  ui.tutorialPcBtn.addEventListener('click', () => setDevice(false));
  ui.tutorialMobileBtn.addEventListener('click', () => setDevice(true));
  ui.tutorialStartBtn.addEventListener('click', startPractice);
  ui.tutorialAgainBtn.addEventListener('click', startPractice);
  ui.tutorialFinishBtn.addEventListener('click', () => close('completed'));
  ui.tutorialSkipWelcome.addEventListener('click', () => close(tutorial.phase === 'complete' ? 'completed' : 'skipped'));
  ui.tutorialSkipPractice.addEventListener('click', () => close());
  ui.tutorialReplayBtn.addEventListener('click', open);
  ui.tutorialSwitchBtn.addEventListener('click', () => setDevice(!state.mobileControls));
  dom.mobileBtn.addEventListener('click', () => { if (tutorial.phase === 'practice') setDevice(state.mobileControls); });
  ui.tutorialNextBtn.addEventListener('click', () => {
    if (tutorial.paused) { pause(false); canvas.focus({ preventScroll: true }); return; }
    if (tutorial.step === lessons.length - 1) complete();
    else setLesson(tutorial.step + 1);
  });

  // Modal focus stays inside the welcome/finish screen. During practice the
  // coach is non-modal so the canvas, ability buttons and pause remain usable.
  document.addEventListener('keydown', (event) => {
    if (ui.tutorialScreen.hidden || event.key !== 'Tab') return;
    const buttons = [...ui.tutorialScreen.querySelectorAll('button')].filter((button) => !button.closest('[hidden]') && !button.disabled);
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && (!buttons.includes(document.activeElement) || document.activeElement === first)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (!buttons.includes(document.activeElement) || document.activeElement === last)) { event.preventDefault(); first?.focus(); }
  });

  globalThis.InkfrontTutorial = { isOpen: () => tutorial.phase !== 'closed',
    isPracticing: () => tutorial.phase === 'practice', blocksInput: () => tutorial.phase === 'welcome' || tutorial.phase === 'complete',
    update, draw, pause };

  let seen = false;
  try { seen = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')?.version === VERSION; } catch { /* Show the tutorial if storage is empty or unavailable. */ }
  if (!seen) open();
})();
