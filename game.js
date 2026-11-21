/* Supermar — game setup, camera, particles, race flow and main loop */
(function () {
  'use strict';
  const SM = window.SM, T = THREE, clamp = SM.clamp;
  const $ = id => document.getElementById(id);

  const RIVALS = [
    { name: 'Kemar', car: 'Montego GT', color: '#f2c200', style: 1 },
    { name: 'Tashana', car: 'Negril R', color: '#0aa34f', style: 0 },
    { name: 'Devon', car: 'Port Royal', color: '#2a2e33', style: 2 },
    { name: 'Shanice', car: 'Ocho Rios S', color: '#13b5c8', style: 4 },
    { name: 'Andre', car: 'Portland Rally', color: '#eef0f2', style: 3 },
  ];
  const DIFF = { easy: { skill: 0.84, perf: 0.9 }, pro: { skill: 0.94, perf: 0.97 }, legend: { skill: 1.0, perf: 1.0 } };
  const PLAYER_PERF = { top: 80, accel: 15.5, brake: 30, grip: 23, boostTop: 17 };

  const STEER_ORDER = ['tilt', 'wheel', 'buttons'], STEER_NAMES = { tilt: 'Tilt', wheel: 'Wheel', buttons: 'Buttons' };
  const MUSIC_ORDER = ['on', 'off'], MUSIC_NAMES = { on: 'On', off: 'Off' };
  const settings = { laps: 3, diff: 'pro', mode: 'chase', steer: 'tilt', autoGas: false, music: 'on' };
  try {
    const s = JSON.parse(localStorage.getItem('supermar-settings') || '{}');
    if (s.laps) settings.laps = s.laps; if (DIFF[s.diff]) settings.diff = s.diff; if (s.mode === 'race' || s.mode === 'chase') settings.mode = s.mode;
    if (STEER_ORDER.includes(s.steer)) settings.steer = s.steer; if (typeof s.autoGas === 'boolean') settings.autoGas = s.autoGas;
    if (s.music === 'off') settings.music = 'off';
  } catch (e) { /* defaults */ }
  let tiltBlocked = false;
  let bestScore = 0;
  try { bestScore = +localStorage.getItem('supermar-best') || 0; } catch (e) { /* none saved */ }

  // ---------------- renderer ----------------
  const canvas = $('game');
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (e) {
    $('nogl').hidden = false; $('menu').hidden = true; return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(62, 1, 0.3, 9000);
  function resize() {
    SM.touch.layout();
    const w = SM.view.w, h = SM.view.h;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  const world = SM.buildWorld(scene, renderer);
  const tr = SM.track;
  const cityScene = new T.Scene();
  const cityWorld = SM.buildCity(cityScene, renderer);
  let activeScene = scene, activeWorld = world;

  // ---------------- cars ----------------
  const pm = SM.makeSupermar(); scene.add(pm.root);
  const player = SM.createCar({ name: 'You', car: 'Supermar', color: '#d7192a', isPlayer: true, model: pm, perf: Object.assign({}, PLAYER_PERF) });
  player.ai = { skill: 0.82, bias: 0, lane: 0, wobble: 0, ph: 0, nitroCd: 99, stuckT: 0 };
  SM.player = player;
  const cars = [player];
  RIVALS.forEach((r, k) => {
    const model = SM.makeRival(r.color, r.style, r.name);
    scene.add(model.root);
    const c = SM.createCar({ name: r.name, car: r.car, color: r.color, model, perf: {} });
    c.ai = { skill: 1, bias: (k - 2) * 1.1, lane: 0, wobble: 0.03, ph: k * 1.7, nitroCd: 4 + k * 1.5, stuckT: 0 };
    cars.push(c);
  });

  // ---------------- particles ----------------
  const puff = SM.canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const PMAX = 320, parts = [], fxGroup = new T.Group();
  scene.add(fxGroup);
  for (let i = 0; i < PMAX; i++) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: 0 }));
    s.visible = false; fxGroup.add(s);
    parts.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, size: 1, grow: 0, op: 0.5 });
  }
  let pi = 0;
  function spawn(x, y, z, vx, vy, vz, size, life, color, additive, grow) {
    const p = parts[pi]; pi = (pi + 1) % PMAX;
    p.s.visible = true; p.s.position.set(x, y, z);
    p.vx = vx; p.vy = vy; p.vz = vz; p.size = size; p.life = p.max = life; p.grow = grow || 0;
    p.s.material.color.set(color);
    p.s.material.blending = additive ? T.AdditiveBlending : T.NormalBlending;
    p.op = additive ? 0.95 : 0.42;
  }
  function updateParts(dt) {
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      p.size += p.grow * dt;
      p.s.scale.set(p.size, p.size, 1);
      p.s.material.opacity = p.op * (p.life / p.max);
    }
  }
  SM.fx = { spawn }; SM.fxGlow = puff;
  SM.chase.build(cityScene, player);
  const activeCars = () => (SM.cityMode ? SM.chase.cars : cars);

  // ---------------- tyre marks: a ring buffer of thin quads laid behind sliding rear wheels ----------------
  const MARKS = 1400;
  const markPos = new Float32Array(MARKS * 12), markIdx = new Uint16Array(MARKS * 6);
  for (let i = 0; i < MARKS; i++) { const v = i * 4; markIdx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6); }
  const markGeo = new T.BufferGeometry();
  markGeo.setAttribute('position', new T.BufferAttribute(markPos, 3).setUsage(T.DynamicDrawUsage));
  markGeo.setIndex(new T.BufferAttribute(markIdx, 1));
  const marks = new T.Mesh(markGeo, new T.MeshBasicMaterial({
    color: 0x0c0c0c, transparent: true, opacity: 0.4, depthWrite: false, side: T.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  }));
  marks.frustumCulled = false; marks.renderOrder = 1;
  let markI = 0, marksDirty = false;
  function markSeg(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    if (L < 1e-3) return;
    const nx = (-dz / L) * 0.14, nz = (dx / L) * 0.14, o = markI * 12;
    markPos.set([ax + nx, 0, az + nz, ax - nx, 0, az - nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz], o);
    markI = (markI + 1) % MARKS; marksDirty = true;
  }
  function tyreMarks(c) {
    const sp = Math.hypot(c.vx, c.vz);
    if (!((c.drifting || c.skid > 0.55) && sp > 5 && !c.offroad)) { c.mark = null; return; }
    const [lx, , lz] = W(c, -1.0, 0, -1.55), [rx, , rz] = W(c, 1.0, 0, -1.55);
    const m = c.mark;
    if (!m) { c.mark = [lx, lz, rx, rz]; return; }
    if ((lx - m[0]) ** 2 + (lz - m[1]) ** 2 < 0.3) return;
    markSeg(m[0], m[1], lx, lz); markSeg(m[2], m[3], rx, rz);
    m[0] = lx; m[1] = lz; m[2] = rx; m[3] = rz;
  }
  function clearMarks() {
    markPos.fill(0); markI = 0; marksDirty = true;
    for (const c of cars) c.mark = null;
    for (const c of SM.chase.cars) c.mark = null;
  }

  function setScene(kind) {
    const city = kind === 'chase';
    activeScene = city ? cityScene : scene; activeWorld = city ? cityWorld : world;
    activeScene.add(pm.root); activeScene.add(fxGroup); activeScene.add(marks);
    marks.position.y = city ? 0.045 : 0.075; clearMarks();
    SM.cityMode = city;
    SM.ui.setMinimap(city ? 'city' : 'race');
    document.body.classList.toggle('mode-chase', city); document.body.classList.toggle('mode-race', !city);
    for (const p of parts) { p.life = 0; p.s.visible = false; }
  }

  const W = (c, lx, ly, lz) => {
    const s = Math.sin(c.h), co = Math.cos(c.h);
    return [c.x + co * lx + s * lz, ly, c.z - s * lx + co * lz];
  };
  function emit(c, dt) {
    const sp = Math.hypot(c.vx, c.vz), fx = Math.sin(c.h), fz = Math.cos(c.h);
    const near = (c.x - camera.position.x) ** 2 + (c.z - camera.position.z) ** 2 < 140 * 140;
    if (!near) return;
    if ((c.skid > 0.45 && sp > 9) || (c.offroad && sp > 12)) {
      const n = Math.random() < dt * 40 ? 1 : 0;
      for (let k = 0; k < n; k++) for (const sx of [-1, 1]) {
        const [x, y, z] = W(c, sx * 1.0, 0.35, -1.5);
        spawn(x, y, z, (Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2,
          1.2, 0.9 + Math.random() * 0.5, c.offroad ? '#b8a27a' : '#eceae4', false, 3.2);
      }
    }
    // drift sparks off the rear tyres, coloured by how charged the mini turbo is
    if (c.drifting && c.driftTier > 0 && sp > 8 && Math.random() < dt * 50) {
      const col = SM.driftColors[c.driftTier];
      for (const sx of [-1, 1]) {
        const [x, y, z] = W(c, sx * 1.0, 0.22, -1.6);
        spawn(x, y, z, c.vx * 0.35 + (Math.random() - 0.5) * 5, 1.2 + Math.random() * 2.2, c.vz * 0.35 + (Math.random() - 0.5) * 5,
          0.28 + c.driftTier * 0.06, 0.2 + Math.random() * 0.12, col, true, -0.6);
      }
    }
    if (c.boosting || c.miniTurbo > 0) {
      const ex = c.model.exhausts;
      for (const e of ex) {
        if (Math.random() > dt * 70) continue;
        const [x, y, z] = W(c, e.x, e.y, e.z);
        spawn(x, y, z, c.vx - fx * 14, 0.3, c.vz - fz * 14, 0.55 + Math.random() * 0.3, 0.14,
          c.miniTurbo > 0 && !c.boosting ? SM.driftColors[c.turboTier] : (Math.random() < 0.5 ? '#ff8a1e' : '#ffd14a'), true, -1.5);
      }
      if (c === player && c.boosting && Math.random() < dt * 50) {
        const [x, y, z] = W(c, 0, 1.2, -2.25);
        spawn(x, y, z, c.vx - fx * 8, 0.2, c.vz - fz * 8, 0.7, 0.12, '#62c3ff', true, -2);
      }
    }
  }

  // ---------------- camera ----------------
  let camMode = 0, camYaw = 0, camDist = 8, camH = 2.6, shake = 0;
  const camLook = new T.Vector3();
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  const CAM_NAMES = ['Chase camera', 'Far chase camera', 'Driver camera'];
  function updateCamera(dt, intro) {
    const c = player, sp = Math.hypot(c.vx, c.vz);
    let dx = Math.sin(c.h), dz = Math.cos(c.h);
    if (sp > 6) {
      const w = c.drifting ? 0.4 : 0.15;
      dx = dx * (1 - w) + (c.vx / sp) * w; dz = dz * (1 - w) + (c.vz / sp) * w;
    }
    camYaw += wrapA(Math.atan2(dx, dz) - camYaw) * (1 - Math.exp(-dt * (camMode === 2 ? 14 : 6)));
    const boost = c.boosting ? 1 : 0;
    let dT, hT, look, lookH;
    if (camMode === 1) { dT = 12 + sp * 0.03; hT = 4.6; look = 6; lookH = 1.4; }
    else { dT = 6.9 + sp * 0.03 + boost * 0.9; hT = 2.5 + sp * 0.005; look = 5; lookH = 1.25; }
    camDist += (dT - camDist) * (1 - Math.exp(-dt * 3));
    camH += (hT - camH) * (1 - Math.exp(-dt * 3));
    let px, py, pz, lx, ly, lz;
    if (camMode === 2 && intro === undefined) {
      const [x, y, z] = W(c, 0, 1.32, 0.55);
      px = x; py = y + c.pitch * 2; pz = z;
      lx = c.x + Math.sin(c.h) * 30; ly = 1.0; lz = c.z + Math.cos(c.h) * 30;
    } else {
      let yaw = camYaw, dist = camDist, h = camH;
      if (intro !== undefined) {
        const e = intro * intro * (3 - 2 * intro);
        yaw = camYaw + Math.PI * 1.15 * (1 - e); dist = camDist + 9 * (1 - e); h = camH + 5 * (1 - e);
      }
      px = c.x - Math.sin(yaw) * dist; py = h; pz = c.z - Math.cos(yaw) * dist;
      if (SM.cityMode) [px, pz] = SM.city.camClamp(c, px, pz);
      lx = c.x + Math.sin(camYaw) * look * (intro !== undefined ? intro : 1); ly = lookH; lz = c.z + Math.cos(camYaw) * look * (intro !== undefined ? intro : 1);
    }
    shake = Math.max(0, shake - dt * 2.5);
    const sk = shake * 0.35 + (c.boosting ? 0.03 : 0) + (c.offroad ? Math.min(0.06, sp * 0.002) : 0);
    camera.position.set(px + (Math.random() - 0.5) * sk, py + (Math.random() - 0.5) * sk, pz + (Math.random() - 0.5) * sk);
    camLook.set(lx, ly, lz);
    camera.lookAt(camLook);
    const fovT = Math.min(90, 62 + sp * 0.16 + boost * 7 + (c.miniTurbo > 0 ? 3 : 0));
    camera.fov += (fovT - camera.fov) * (1 - Math.exp(-dt * 4));
    camera.updateProjectionMatrix();
  }
  function orbitCamera(t, dist, height) {
    const a = t * 0.18 + 0.6, c = player;
    let px = c.x + Math.sin(c.h + a) * dist, pz = c.z + Math.cos(c.h + a) * dist;
    if (SM.cityMode) [px, pz] = SM.city.camClamp(c, px, pz);
    camera.position.set(px, height, pz);
    camera.lookAt(c.x, 0.9, c.z);
    camera.fov += (55 - camera.fov) * 0.05; camera.updateProjectionMatrix();
  }

  // ---------------- race flow ----------------
  let mode = 'menu', pausedFrom = null;
  const race = { time: 0, laps: 3, cd: 0, cdShown: -1, leaderRef: 0, doneT: 0, resultsT: 0, thrDownAt: -1 };

  function standings() {
    return cars.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1; if (b.finished) return 1;
      return b.prog - a.prog;
    });
  }

  function setupGrid() {
    const gap = Math.round(8.5 / tr.ds), stagger = Math.round(3.5 / tr.ds);
    const order = [cars[1], cars[2], cars[3], cars[4], player, cars[5]];
    order.forEach((c, k) => {
      const row = Math.floor(k / 2), col = k % 2;
      SM.placeCar(c, (tr.N - 4 - row * gap - col * stagger) % tr.N, col ? 3.6 : -3.6);
      Object.assign(c, { lap: -1, lapSeen: -1, finished: false, finishTime: 0, lapStart: 0, bestLap: 0, lastLap: 0, nitro: 0.35,
        events: [], wrongTime: 0, hit: 0, draft: 0, rpm: 1000, skid: 0, offroad: false, lean: 0, pitch: 0 });
      SM.updateProgress(c);
      if (c.ai) { c.ai.lane = c.lat; c.ai.stuckT = 0; }
    });
  }

  function applyDifficulty() {
    const d = DIFF[settings.diff];
    cars.forEach((c, k) => {
      if (c === player) return;
      const spread = 1 - (k - 1) * 0.012;
      c.perf = { top: 78 * d.perf * spread, accel: 14 * d.perf, brake: 27, grip: 22, boostTop: 13 };
      c.ai.skill = d.skill * spread;
    });
  }

  // iPhone only lets a page read the tilt sensor after a tap, so this runs from Start and from the menu setting
  function askTilt() {
    SM.touch.askTilt().then(ok => {
      tiltBlocked = !ok;
      if (!ok && mode !== 'menu') SM.ui.flash('TILT IS OFF · DRAG THE WHEEL', '');
      syncSettingsUI();
    });
  }

  function startRace() {
    SM.audio.init(); SM.music.setDriving(true);
    if (SM.touch.active()) {
      SM.touch.landscape();
      if (settings.steer === 'tilt') { askTilt(); SM.touch.recenter(); }
    }
    clearMarks(); race.tiltCheck = false;
    player.perf = Object.assign({}, PLAYER_PERF);
    if (settings.mode === 'chase') SM.chase.reset();
    else { race.laps = settings.laps; applyDifficulty(); setupGrid(); }
    race.time = 0; race.cd = 0; race.cdShown = -1; race.doneT = 0; race.resultsT = 0; race.thrDownAt = -1;
    camYaw = player.h; camDist = 8; camH = 2.6;
    ['menu', 'results', 'pause', 'chaseEnd', 'help'].forEach(id => SM.ui.show(id, false));
    SM.ui.show('hud', true);
    document.body.classList.add('racing', 'counting');
    $('count').className = ''; $('count').textContent = '';
    mode = 'countdown';
    try { canvas.focus({ preventScroll: true }); } catch (e) { /* fine */ }
  }

  function toMenu() {
    mode = 'menu'; SM.audio.silence(); SM.music.setDriving(false);
    if (settings.mode === 'chase') SM.chase.reset(); else setupGrid();
    ['results', 'pause', 'hud', 'chaseEnd'].forEach(id => SM.ui.show(id, false));
    SM.ui.show('menu', true); document.body.classList.remove('racing', 'counting');
  }

  function togglePause() {
    if (mode === 'paused') { mode = pausedFrom; SM.ui.show('pause', false); return; }
    if (mode !== 'race' && mode !== 'countdown') return;
    pausedFrom = mode; mode = 'paused'; SM.ui.show('pause', true); SM.audio.silence();
  }

  function onLap(c) {
    if (c.lap <= c.lapSeen) return;
    c.lapSeen = c.lap;
    if (c.lap === 0) { c.lapStart = race.time; return; }
    const lt = race.time - c.lapStart; c.lastLap = lt; c.lapStart = race.time;
    if (!c.bestLap || lt < c.bestLap) c.bestLap = lt;
    if (c.lap >= race.laps && !c.finished) {
      c.finished = true; c.finishTime = race.time;
      if (c === player) {
        mode = 'done'; race.doneT = 0;
        const pos = standings().indexOf(player) + 1;
        SM.ui.flash(pos === 1 ? 'YOU WIN' : 'FINISHED ' + SM.ord(pos).toUpperCase(), pos === 1 ? 'gold' : '');
        SM.audio.beep(pos === 1 ? 990 : 660, 0.5, 0.2);
      }
      return;
    }
    if (c === player) {
      const left = race.laps - c.lap;
      SM.ui.flash((left === 1 ? 'FINAL LAP' : 'LAP ' + (c.lap + 1)) + '  ' + SM.fmt(lt), left === 1 ? 'gold' : '');
    }
  }

  function physicsStep(dt, pin) {
    race.time += dt;
    race.leaderRef = player.prog;
    for (const c of cars) {
      const inp = c === player && !c.finished ? pin : SM.aiInput(c, cars, dt, race);
      SM.drafting(c, cars, dt);
      SM.stepCar(c, dt, inp);
      SM.updateProgress(c);
      SM.walls(c);
    }
    SM.collide(cars);
    for (const c of cars) { SM.updateProgress(c); onLap(c); }
  }

  let prevNitro = 0;
  function afterSteps(dt, pin) {
    const c = player, sp = Math.hypot(c.vx, c.vz);
    if (!SM.cityMode) {
      const t = tr.tan[c.idx], fwd = Math.sin(c.h) * t.x + Math.cos(c.h) * t.z;
      c.wrongTime = fwd < -0.2 && sp > 4 && !c.finished ? c.wrongTime + dt : 0;
    } else c.wrongTime = 0;
    if (c.hit > 3) { shake = Math.min(1, shake + c.hit / 18); SM.audio.thud(c.hit); }
    for (const o of activeCars()) o.hit = 0;
    for (const e of c.events) {
      if (e === 'mini') { SM.ui.flash(SM.TURBO_NAMES[c.turboTier], ['', 'blue', 'orange', 'pink'][c.turboTier]); SM.audio.miniTurbo(); }
      else if (e === 'tier') SM.audio.beep(520 + c.driftTier * 260, 0.08, 0.07);
    }
    for (const o of activeCars()) o.events.length = 0;
    if (c.nitro > 0.98 && prevNitro <= 0.98 && !c.finished) SM.ui.flash('NITRO FULL', 'gold');
    prevNitro = c.nitro;
  }

  function countdownStep(dt, pin) {
    race.cd += dt;
    if (!race.tiltCheck && race.cd > 2 && SM.touch.active() && settings.steer === 'tilt') {
      race.tiltCheck = true;
      if (!SM.touch.tiltLive() && !tiltBlocked) SM.ui.flash('NO TILT SENSOR · DRAG THE WHEEL', '');
    }
    // rev the V16 on the grid
    player.rpm += ((1000 + pin.throttle * 6800) - player.rpm) * Math.min(1, dt * 6);
    player.throttle = pin.throttle;
    if (pin.throttle > 0 && race.thrDownAt < 0) race.thrDownAt = race.cd;
    if (pin.throttle === 0) race.thrDownAt = -1;
    const marks = [0.8, 1.8, 2.8, 3.8];
    let shown = -1; marks.forEach((m, i) => { if (race.cd >= m) shown = i; });
    if (shown !== race.cdShown) {
      race.cdShown = shown;
      if (shown >= 0 && shown < 3) { SM.ui.count(String(3 - shown)); SM.audio.beep(520, 0.18); }
      if (shown === 3) {
        SM.ui.count('GO', 'go'); SM.audio.beep(1040, 0.45, 0.2);
        mode = 'race'; document.body.classList.remove('counting');
        if (pin.throttle > 0 && race.thrDownAt > 3.2) { player.miniTurbo = 1.1; SM.ui.flash('PERFECT START', 'blue'); SM.audio.miniTurbo(); }
        else if (pin.throttle > 0 && race.thrDownAt >= 0 && race.thrDownAt < 2.0) { player.rpm = 9000; SM.ui.flash('WHEELSPIN', ''); player.nitro = Math.max(0, player.nitro - 0.15); }
      }
    }
  }

  // ---------------- model sync ----------------
  function syncModel(c, dt) {
    const m = c.model, sp = Math.hypot(c.vx, c.vz);
    m.root.position.set(c.x, 0, c.z); m.root.rotation.y = c.h;
    m.body.rotation.z = c.lean; m.body.rotation.x = c.pitch;
    m.body.position.y = c.offroad ? Math.sin(performance.now() * 0.05 + c.x) * Math.min(0.04, sp * 0.002) : 0;
    for (const w of m.wheels.spin) w.rotation.x = c.wheelRot;
    for (const p of m.wheels.pivots) p.rotation.y = -c.steer * 0.5;
    m.tailMat.emissiveIntensity = c.braking ? 2.4 : 0.5;
    if (c === player) {
      m.fan.rotation.z += dt * (6 + c.rpm / 160 + (c.boosting ? 40 : 0));
      m.glowMat.emissiveIntensity = c.boosting ? 2.6 + Math.random() * 1.2 : 0.35 + c.throttle * 0.5 + (c.miniTurbo > 0 ? 1.5 : 0);
      m.glowMat.emissive.setHex(c.boosting || c.miniTurbo > 0 ? 0x4fb4ff : 0xff5a10);
    } else if (m.tag) {
      const d2 = (c.x - camera.position.x) ** 2 + (c.z - camera.position.z) ** 2;
      m.tag.visible = d2 < 170 * 170 && mode !== 'menu';
    }
  }

  // ---------------- HUD feed ----------------
  function hud(dt) {
    const st = standings(), c = player, ld = st[0];
    const ldProg = ld.finished ? race.laps * tr.N : ld.prog;
    const rows = st.map((o, i) => ({
      name: o.isPlayer ? 'You' : o.name, color: o.color, isPlayer: o.isPlayer, car: o.car,
      gap: o.finished ? SM.fmt(o.finishTime) : i === 0 ? 'Leader' : '+' + Math.max(0, (ldProg - o.prog) * tr.ds / 55).toFixed(1) + 's',
      time: o.finished ? SM.fmt(o.finishTime) : 'still racing'
    }));
    SM.ui.hud({
      pos: st.indexOf(c) + 1, lap: c.lap + 1, laps: race.laps, time: mode === 'countdown' ? 0 : (c.finished ? c.finishTime : race.time), best: c.bestLap,
      kmh: Math.abs(Math.sin(c.h) * c.vx + Math.cos(c.h) * c.vz) * 3.6, gear: c.gear, rpm: c.rpm, nitro: c.nitro, boosting: c.boosting,
      draft: c.draft && !c.boosting, drifting: c.drifting, driftTime: c.driftTime, driftTier: c.driftTier, wrong: c.wrongTime > 1.2, board: rows
    }, dt);
    SM.ui.minimap(cars, player);
    return rows;
  }

  function chaseHud(dt) {
    const c = player, st = SM.chase.st;
    SM.ui.chaseHud({
      kmh: Math.abs(Math.sin(c.h) * c.vx + Math.cos(c.h) * c.vz) * 3.6, gear: c.gear, rpm: c.rpm, nitro: c.nitro, boosting: c.boosting,
      draft: false, drifting: c.drifting, driftTime: c.driftTime, driftTier: c.driftTier, wrong: false
    }, SM.chase.hudData(), dt);
    SM.ui.minimap(SM.chase.cars, player, st.eagleOn && !st.over ? st.eagle : null);
  }

  // ---------------- wiring ----------------
  SM.ui.init();
  // ---------------- title menu ----------------
  const DIFF_NAMES = { easy: 'Easy', pro: 'Pro', legend: 'Legend' }, DIFF_ORDER = ['easy', 'pro', 'legend'], LAP_OPTS = [2, 3, 5];
  let sel = settings.mode;
  const menuItems = () => [].concat(settings.mode === 'race' ? ['chase', 'race', 'laps', 'diff'] : ['chase', 'race'],
    SM.music.available ? ['music'] : [], SM.touch.active() ? ['steer', 'autogas'] : [], ['help']);
  const MUSIC_DETAIL = {
    on: 'Your song plays here and on the results screen, with the words lighting up as they are sung. It stops while you drive.',
    off: 'No music.'
  };
  const STEER_DETAIL = {
    tilt: () => tiltBlocked
      ? 'Tilt needs motion access. Reload the page and tap Allow when asked, or pick Wheel.'
      : 'Tilt your phone like a steering wheel. You can also grab the wheel on the left to take over.',
    wheel: () => 'Put your thumb on the left side of the screen and slide it left or right to turn the wheel.',
    buttons: () => 'Two arrow buttons on the left. Simple, but less precise than tilt or the wheel.'
  };
  const DETAIL = {
    chase: () => 'Downtown Kingston at sunset. Smash things for points, lose the police, and grab the Golden Eagle at 8,000 to win.',
    race: () => settings.laps + ' laps of the coast road against five rivals on ' + DIFF_NAMES[settings.diff] + '.',
    steer: () => STEER_DETAIL[settings.steer](),
    music: () => MUSIC_DETAIL[settings.music],
    autogas: () => settings.autoGas ? 'The car accelerates by itself. Hold BRAKE to slow down or reverse.' : 'Hold GAS to go. DRIFT and NITRO keep the gas on too, so one thumb can drive.',
    help: () => 'Controls, points and tips.'
  };
  function syncSettingsUI() {
    document.querySelectorAll('#menuList .mi').forEach(el => el.classList.toggle('sel', el.dataset.item === sel));
    $('lapsVal').textContent = settings.laps;
    $('diffVal').textContent = DIFF_NAMES[settings.diff];
    $('steerVal').textContent = STEER_NAMES[settings.steer];
    $('gasVal').textContent = settings.autoGas ? 'On' : 'Off';
    $('musicVal').textContent = MUSIC_NAMES[settings.music];
    document.querySelector('#menuList [data-item=music]').hidden = !SM.music.available;
    SM.touch.setMode(settings.steer);
    SM.music.setOn(settings.music === 'on');
    $('bestNote').textContent = bestScore ? 'Best ' + bestScore.toLocaleString('en-US') : '';
    $('menuDetail').textContent = (DETAIL[sel] || DETAIL.race)();
    try { localStorage.setItem('supermar-settings', JSON.stringify(settings)); } catch (e) { /* not saved */ }
  }
  function selectItem(it) {
    sel = it;
    const m = it === 'chase' ? 'chase' : it === 'race' || it === 'laps' || it === 'diff' ? 'race' : settings.mode;
    if (m !== settings.mode) {
      settings.mode = m; setScene(m);
      if (m === 'chase') SM.chase.reset(); else setupGrid();
    }
    syncSettingsUI();
  }
  function stepOption(key, dir) {
    if (key === 'laps') settings.laps = LAP_OPTS[(LAP_OPTS.indexOf(settings.laps) + dir + LAP_OPTS.length) % LAP_OPTS.length];
    else if (key === 'steer') {
      settings.steer = STEER_ORDER[(STEER_ORDER.indexOf(settings.steer) + dir + STEER_ORDER.length) % STEER_ORDER.length];
      if (settings.steer === 'tilt') askTilt();
    } else if (key === 'autogas') settings.autoGas = !settings.autoGas;
    else if (key === 'music') {
      settings.music = MUSIC_ORDER[(MUSIC_ORDER.indexOf(settings.music) + dir + MUSIC_ORDER.length) % MUSIC_ORDER.length];
      SM.audio.init();
    }
    else settings.diff = DIFF_ORDER[(DIFF_ORDER.indexOf(settings.diff) + dir + DIFF_ORDER.length) % DIFF_ORDER.length];
    syncSettingsUI();
  }
  const openHelp = on => { SM.ui.show('help', on); if (!on) { try { $('menuList').querySelector('.sel').focus({ preventScroll: true }); } catch (e) { /* fine */ } } };
  function activate(it) { if (it === 'help') openHelp(true); else startRace(); }
  document.querySelectorAll('#menuList .mi').forEach(el => {
    el.addEventListener('pointerenter', () => { if (mode === 'menu' && sel !== el.dataset.item) selectItem(el.dataset.item); });
    el.addEventListener('click', e => {
      if (e.target.closest('[data-step]')) return;
      if (el.classList.contains('sub')) { selectItem(el.dataset.item); if (el.classList.contains('set')) stepOption(el.dataset.item, 1); return; }
      selectItem(el.dataset.item); activate(el.dataset.item);
    });
  });
  document.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { sel = b.dataset.step; stepOption(b.dataset.step, +b.dataset.dir); }));
  $('helpBack').addEventListener('click', () => openHelp(false));
  SM.menuKey = code => {
    if (!$('help').hidden) {
      if (code === 'Escape' || code === 'Enter' || code === 'Backspace' || code === 'KeyH') { openHelp(false); return true; }
      return false;
    }
    if (mode !== 'menu') return false;
    const items = menuItems(), i = Math.max(0, items.indexOf(sel));
    if (code === 'ArrowUp' || code === 'KeyW') { selectItem(items[(i - 1 + items.length) % items.length]); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { selectItem(items[(i + 1) % items.length]); return true; }
    const dir = code === 'ArrowLeft' || code === 'KeyA' ? -1 : code === 'ArrowRight' || code === 'KeyD' ? 1 : 0;
    if (dir && (sel === 'laps' || sel === 'diff' || sel === 'steer' || sel === 'autogas' || sel === 'music')) { stepOption(sel, dir); return true; }
    if (code === 'Enter' || code === 'Space') { activate(sel); return true; }
    if (code === 'KeyH') { openHelp(true); return true; }
    return false;
  };
  syncSettingsUI();
  $('runAgainBtn').addEventListener('click', startRace);
  $('endMenuBtn').addEventListener('click', toMenu);
  $('againBtn').addEventListener('click', startRace);
  $('menuBtn').addEventListener('click', toMenu);
  $('resumeBtn').addEventListener('click', togglePause);
  $('restartBtn').addEventListener('click', startRace);
  $('quitBtn').addEventListener('click', toMenu);
  $('pauseBtn').addEventListener('click', togglePause);
  const setMuteLabel = () => ['muteBtn', 'pauseMuteBtn'].forEach(id => {
    $(id).textContent = SM.audio.muted ? 'Sound off' : 'Sound on'; $(id).setAttribute('aria-pressed', String(!SM.audio.muted));
  });
  ['muteBtn', 'pauseMuteBtn'].forEach(id => $(id).addEventListener('click', () => { SM.audio.init(); SM.audio.setMuted(!SM.audio.muted); setMuteLabel(); }));
  // browsers only allow sound after a tap or key press, so the song starts on the first one
  const wake = () => { SM.audio.init(); SM.music.start(); };
  window.addEventListener('click', wake, true);
  window.addEventListener('keydown', wake, true);
  const cycleCam = () => { camMode = (camMode + 1) % 3; SM.ui.flash(CAM_NAMES[camMode].toUpperCase(), ''); };
  $('camBtn').addEventListener('click', cycleCam);
  SM.onKey('KeyC', () => { if (mode === 'race' || mode === 'countdown' || mode === 'done') cycleCam(); });
  SM.onKey('KeyR', () => {
    if (mode !== 'race') return;
    if (SM.cityMode) SM.chase.respawn(); else SM.respawn(player);
    camYaw = player.h; SM.ui.flash(SM.cityMode ? 'BACK ON THE STREET' : 'BACK ON TRACK', '');
  });
  SM.onKey('Escape', togglePause); SM.onKey('KeyP', togglePause);
  SM.onKey('KeyM', () => { SM.audio.setMuted(!SM.audio.muted); setMuteLabel(); });
  SM.onKey('Enter', () => { if (mode === 'menu' || (mode === 'done' && race.doneT > 2.5)) startRace(); });
  setMuteLabel();

  setupGrid();
  setScene(settings.mode);
  if (settings.mode === 'chase') SM.chase.reset();

  // ---------------- main loop ----------------
  let last = performance.now(), acc = 0;
  const STEP = 1 / 120;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    const pin = SM.input.read();
    if (settings.autoGas && mode === 'race' && SM.touch.active() && !pin.brake) pin.throttle = 1;

    if (mode === 'race' || mode === 'done') {
      acc += dt; let n = 0;
      while (acc >= STEP && n < 10) { if (SM.cityMode) SM.chase.step(STEP, pin); else physicsStep(STEP, pin); acc -= STEP; n++; }
      if (n === 10) acc = 0;
      afterSteps(dt, pin);
      if (SM.cityMode) {
        SM.chase.frame(dt, t);
        const st = SM.chase.st;
        if (st.over && mode === 'race') {
          mode = 'done'; race.doneT = 0;
          if (st.score > bestScore) { bestScore = Math.floor(st.score); try { localStorage.setItem('supermar-best', String(bestScore)); } catch (e) { /* not saved */ } }
          syncSettingsUI();
        }
      }
    } else if (mode === 'countdown') countdownStep(dt, pin);
    else if (mode === 'menu' && SM.cityMode) SM.chase.frame(0, t);

    for (const c of activeCars()) { syncModel(c, dt); if (mode === 'race' || mode === 'done') { emit(c, dt); tyreMarks(c); } }
    updateParts(dt);
    if (marksDirty) { markGeo.attributes.position.needsUpdate = true; marksDirty = false; }

    // in the menu, shift the view so the car sits beside the setup panel rather than behind it
    const vw = SM.view.w, vh = SM.view.h;
    if (mode === 'menu') { if (vw > 760 || vw > vh * 1.3) camera.setViewOffset(vw, vh, -vw * 0.16, vh * 0.1, vw, vh); else camera.setViewOffset(vw, vh, 0, vh * 0.22, vw, vh); }
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();

    if (mode === 'menu') orbitCamera(t, 9.5, 2.3);
    else if (mode === 'countdown') updateCamera(dt, clamp(race.cd / 3.8, 0, 1));
    else if (mode === 'done' && race.doneT > 2.5) orbitCamera(t, 11, 3.4);
    else if (mode !== 'paused') updateCamera(dt);

    const s = activeWorld.sunDir;
    activeWorld.sun.position.set(player.x + s.x * 320, s.y * 320, player.z + s.z * 320);
    activeWorld.sun.target.position.set(player.x, 0, player.z);
    activeWorld.update(t, camera.position);

    if (mode !== 'menu' && mode !== 'paused') {
      const sp = Math.hypot(player.vx, player.vz);
      // once the results card is up, the engine goes quiet so the song has the stage
      if (!(mode === 'done' && race.doneT > 2.5)) {
        SM.audio.update({ rpm: player.rpm, throttle: player.throttle, boost: player.boosting, speed: sp, skid: mode === 'countdown' ? 0 : player.skid, offroad: player.offroad }, dt);
        SM.audio.siren(SM.cityMode && mode !== 'countdown' ? SM.chase.st.siren : 0);
      }
      if (SM.cityMode) {
        chaseHud(dt);
        if (mode === 'done') {
          race.doneT += dt;
          if (race.doneT > 2.5 && $('chaseEnd').hidden) {
            SM.ui.chaseEnd(Object.assign(SM.chase.hudData(), { won: SM.chase.st.won }), bestScore);
            SM.ui.show('chaseEnd', true); SM.ui.show('hud', false); SM.audio.silence(); SM.music.setDriving(false);
          }
        }
      }
      const rows = SM.cityMode ? null : hud(dt);
      if (mode === 'done' && !SM.cityMode) {
        race.doneT += dt; race.resultsT -= dt;
        if (race.doneT > 2.5) {
          if ($('results').hidden) { SM.ui.show('results', true); SM.ui.show('hud', false); race.resultsT = 0; SM.audio.silence(); SM.music.setDriving(false); }
          if (race.resultsT <= 0) { race.resultsT = 0.5; SM.ui.results(rows, player, race.laps); }
        }
      }
    }
    renderer.render(activeScene, camera);
  }
  $('loading').hidden = true;
  requestAnimationFrame(frame);
})();
