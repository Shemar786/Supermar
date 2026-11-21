/* Supermar — police chase: police AI, smashable obstacles, score, heat, busting and the Golden Eagle win */
(function () {
  'use strict';
  const SM = window.SM, T = THREE, clamp = SM.clamp;
  const EAGLE_TARGET = 8000, COMBO_WINDOW = 2.5, MAX_POLICE = 6;

  const G = (geo, col) => SM.tint(geo, col);
  const TYPES = {
    cone: { pts: 50, slow: 0.012, r: 0.45, label: 'CONE', count: 34, smoke: '#ff7a2a', build: () => [
      G(new T.ConeGeometry(0.3, 0.75, 10).translate(0, 0.43, 0), '#ff6a13'), G(new T.CylinderGeometry(0.125, 0.17, 0.12, 10).translate(0, 0.45, 0), '#f6f6f6'),
      G(new T.BoxGeometry(0.62, 0.06, 0.62).translate(0, 0.03, 0), '#c9480a')] },
    can: { pts: 100, slow: 0.03, r: 0.5, label: 'TRASH CAN', count: 14, smoke: '#7c8a6a', build: () => [
      G(new T.CylinderGeometry(0.32, 0.28, 0.95, 12).translate(0, 0.475, 0), '#3d6b4f'), G(new T.CylinderGeometry(0.35, 0.35, 0.07, 12).translate(0, 0.98, 0), '#2a4a37')] },
    crate: { pts: 150, slow: 0.05, r: 0.75, label: 'CRATE', count: 16, smoke: '#c9a26b', build: () => [
      G(new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), '#b07a3f'), G(new T.BoxGeometry(1.04, 0.12, 1.04).translate(0, 0.2, 0), '#74501f'),
      G(new T.BoxGeometry(1.04, 0.12, 1.04).translate(0, 0.8, 0), '#74501f')] },
    drum: { pts: 120, slow: 0.04, r: 0.55, label: 'WATER DRUM', count: 12, smoke: '#9fd0ff', build: () => [
      G(new T.CylinderGeometry(0.38, 0.38, 0.95, 14).translate(0, 0.475, 0), '#1f6fd1'), G(new T.CylinderGeometry(0.4, 0.4, 0.07, 14).translate(0, 0.96, 0), '#164f96')] },
    cart: { pts: 300, slow: 0.08, r: 1.25, label: 'FRUIT CART', count: 8, smoke: '#ffb347', build: () => {
      const p = [G(new T.BoxGeometry(1.8, 0.2, 1.1).translate(0, 0.75, 0), '#8a5a2b'), G(new T.BoxGeometry(1.8, 0.3, 0.06).translate(0, 0.95, 0.53), '#a36b33'),
        G(new T.BoxGeometry(1.8, 0.3, 0.06).translate(0, 0.95, -0.53), '#a36b33'),
        G(new T.CylinderGeometry(0.4, 0.4, 0.12, 12).rotateX(Math.PI / 2).translate(0.5, 0.4, 0.62), '#2b2b2b'),
        G(new T.CylinderGeometry(0.4, 0.4, 0.12, 12).rotateX(Math.PI / 2).translate(0.5, 0.4, -0.62), '#2b2b2b'),
        G(new T.BoxGeometry(0.9, 0.06, 0.06).translate(-1.3, 0.85, 0.35), '#6b4420'), G(new T.BoxGeometry(0.9, 0.06, 0.06).translate(-1.3, 0.85, -0.35), '#6b4420'),
        G(new T.CylinderGeometry(0.03, 0.03, 1.6, 5).translate(0, 1.65, 0), '#555'), G(new T.ConeGeometry(1.2, 0.45, 8).translate(0, 2.5, 0), '#fed100')];
      const fruit = ['#ff8c1a', '#7cc242', '#ffd23f', '#d7192a', '#5a3a1a'];
      for (let k = 0; k < 12; k++) p.push(G(new T.IcosahedronGeometry(0.13, 1).translate(-0.7 + (k % 6) * 0.28, 1.0 + Math.floor(k / 6) * 0.12, -0.25 + Math.floor(k / 6) * 0.3), fruit[k % fruit.length]));
      return p; } },
    jerk: { pts: 200, slow: 0.06, r: 0.75, label: 'JERK DRUM', count: 6, smoke: '#d9d3c7', build: () => {
      const p = [G(new T.CylinderGeometry(0.42, 0.42, 1.0, 14).rotateZ(Math.PI / 2).translate(0, 0.95, 0), '#1b1b1b'),
        G(new T.BoxGeometry(1.02, 0.05, 0.6).translate(0, 1.3, -0.12), '#2a2a2a'), G(new T.CylinderGeometry(0.06, 0.06, 0.5, 6).translate(0.3, 1.5, 0.1), '#333')];
      for (const x of [-0.42, 0.42]) for (const z of [-0.3, 0.3]) p.push(G(new T.BoxGeometry(0.06, 0.8, 0.06).translate(x, 0.4, z), '#444'));
      return p; } },
    barrier: { pts: 250, slow: 0.04, r: 1.15, label: 'BARRIER', count: 12, smoke: '#ffffff', build: () => {
      const p = [G(new T.BoxGeometry(2.2, 0.3, 0.1).translate(0, 0.95, 0), '#ff6a13')];
      for (const x of [-0.75, 0, 0.75]) p.push(G(new T.BoxGeometry(0.34, 0.31, 0.11).translate(x, 0.95, 0), '#f6f6f6'));
      for (const x of [-0.9, 0.9]) for (const s of [-1, 1]) p.push(G(new T.BoxGeometry(0.08, 1.0, 0.08).rotateX(s * 0.3).translate(x, 0.48, s * 0.14), '#d8d8d8'));
      return p; } },
    bench: { pts: 80, slow: 0.03, r: 0.95, label: 'BENCH', count: 8, smoke: '#8fbf7a', build: () => {
      const p = [G(new T.BoxGeometry(1.8, 0.08, 0.5).translate(0, 0.45, 0), '#2f7a43'), G(new T.BoxGeometry(1.8, 0.4, 0.06).translate(0, 0.75, -0.25), '#2f7a43')];
      for (const x of [-0.8, 0.8]) for (const z of [-0.2, 0.2]) p.push(G(new T.BoxGeometry(0.06, 0.45, 0.06).translate(x, 0.22, z), '#222'));
      return p; } },
  };

  let scene, player, rng = Math.random;
  const police = [], obstacles = [];
  const st = { score: 0, combo: 0, comboT: 0, mult: 1, heat: 1, time: 0, smashed: 0, bust: 0, alert: true, seenT: 0, lastSeen: { x: 0, z: 0 },
    over: false, won: false, eagle: null, eagleOn: false, siren: 0, flashes: [] };
  const chase = (SM.chase = { st, cars: [], police });

  // ---------------- police cars ----------------
  function makePolice(k) {
    const m = SM.makeRival('#f4f5f7', 3, 'POLICE');
    const navy = new T.MeshStandardMaterial({ color: 0x14254f, metalness: 0.4, roughness: 0.4 });
    for (const s of [-1, 1]) { const b = new T.Mesh(new T.BoxGeometry(0.04, 0.32, 3.2), navy); b.position.set(s * 0.99, 0.62, 0); m.body.add(b); }
    const red = new T.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 0.3 });
    const blue = new T.MeshStandardMaterial({ color: 0x2060ff, emissive: 0x2050ff, emissiveIntensity: 0.3 });
    const bar = new T.Mesh(new T.BoxGeometry(1.3, 0.12, 0.34), new T.MeshStandardMaterial({ color: 0x222222 })); bar.position.set(0, 1.5, 0); m.body.add(bar);
    const r = new T.Mesh(new T.BoxGeometry(0.58, 0.16, 0.3), red); r.position.set(0.33, 1.62, 0); m.body.add(r);
    const b = new T.Mesh(new T.BoxGeometry(0.58, 0.16, 0.3), blue); b.position.set(-0.33, 1.62, 0); m.body.add(b);
    const glow = SM.fxGlow;
    const gr = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0xff2a3a, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    const gb = new T.Sprite(new T.SpriteMaterial({ map: glow, color: 0x3a6cff, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    gr.position.set(0.4, 1.7, 0); gb.position.set(-0.4, 1.7, 0); gr.scale.set(3, 3, 1); gb.scale.set(3, 3, 1); m.body.add(gr, gb);
    m.lights = { red, blue, gr, gb };
    m.root.visible = false;
    scene.add(m.root);
    const c = SM.createCar({ name: 'Police', car: 'Police', color: '#3a6cff', model: m, perf: {} });
    c.ai = { los: false, losT: 0, route: null, wander: { x: 0, z: 0 }, stuckT: 0, revT: 0, revSteer: 1, lastThr: 0, lastSteer: 0, ph: k * 0.37 };
    c.active = false;
    return c;
  }

  function pick(n, prev, goal) {
    const C = SM.city;
    let opts = C.neighbors(n).filter(m => !prev || m.i !== prev.i || m.j !== prev.j);
    if (!opts.length) opts = C.neighbors(n);
    let best = opts[0], bs = Infinity;
    for (const m of opts) { const q = C.nodePos(m.i, m.j), s = Math.hypot(q.x - goal.x, q.z - goal.z) + rng() * 30; if (s < bs) { bs = s; best = m; } }
    return best;
  }

  function spawnPolice(p, minD, maxD) {
    const C = SM.city;
    for (let k = 0; k < 80; k++) {
      const i = Math.floor(rng() * (C.NX + 1)), j = Math.floor(rng() * (C.NZ + 1)), q = C.nodePos(i, j);
      const dx = player.x - q.x, dz = player.z - q.z, d = Math.hypot(dx, dz);
      if (d < minD || d > maxD || (k < 60 && C.los(q.x, q.z, player.x, player.z))) continue;
      if (police.some(o => o !== p && o.active && Math.hypot(o.x - q.x, o.z - q.z) < 12)) continue;
      p.x = q.x; p.z = q.z;
      p.h = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (dz > 0 ? 0 : Math.PI);
      p.vx = p.vz = 0; p.yaw = 0; p.steer = 0; p.nitro = 0.5; p.ai.route = null; p.ai.revT = 0; p.ai.stuckT = 0;
      p.ai.wander = C.spot(p.x, p.z, 50, 0);
      return true;
    }
    return false;
  }

  function activatePolice() {
    const hp = st.heat;
    for (const p of police) p.perf = { top: 58 + hp * 3.2, accel: 13 + hp * 0.6, brake: 28, grip: 22, boostTop: 10 };
    const want = Math.min(MAX_POLICE, st.eagleOn ? MAX_POLICE : st.heat + 1);
    for (const p of police) {
      if (chase.cars.filter(c => c !== player).length >= want) break;
      if (p.active) continue;
      if (spawnPolice(p, 150, 300)) { p.active = true; p.model.root.visible = true; chase.cars.push(p); }
    }
  }

  function policeInput(p, dt) {
    const ai = p.ai, pl = player, C = SM.city;
    const dx = pl.x - p.x, dz = pl.z - p.z, dist = Math.hypot(dx, dz), sp = Math.hypot(p.vx, p.vz);
    ai.losT -= dt;
    if (ai.losT <= 0) { ai.losT = 0.12 + rng() * 0.08; ai.los = dist < 230 && C.los(p.x, p.z, pl.x, pl.z); }
    if (ai.revT > 0) { ai.revT -= dt; return { steer: ai.revSteer, throttle: 0, brake: 1, drift: false, nitro: false }; }
    if (sp < 1.5 && ai.lastThr > 0.4) { ai.stuckT += dt; if (ai.stuckT > 1.1) { ai.stuckT = 0; ai.revT = 0.9; ai.revSteer = ai.lastSteer > 0 ? -1 : 1; ai.route = null; } }
    else ai.stuckT = 0;

    let tx, tz, vT = p.perf.top, direct = false;
    if (st.alert && ai.los) {
      direct = true;
      const lead = Math.min(1.1, dist / 40);
      tx = pl.x + pl.vx * lead; tz = pl.z + pl.vz * lead;
      if (!C.los(p.x, p.z, tx, tz)) { tx = pl.x; tz = pl.z; }
      ai.route = null;
    } else {
      const goal = st.alert ? st.lastSeen : ai.wander;
      if (!ai.route) { const n1 = C.nodeAhead(p.x, p.z, p.h); ai.route = { prev: null, n1, n2: pick(n1, null, goal) }; }
      const r = ai.route;
      let n1p = C.nodePos(r.n1.i, r.n1.j);
      if (Math.hypot(n1p.x - p.x, n1p.z - p.z) < 10) { r.prev = r.n1; r.n1 = r.n2; r.n2 = pick(r.n1, r.prev, goal); n1p = C.nodePos(r.n1.i, r.n1.j); }
      const n2p = C.nodePos(r.n2.i, r.n2.j), pp = r.prev ? C.nodePos(r.prev.i, r.prev.j) : { x: p.x, z: p.z };
      const turning = Math.abs((n1p.x - pp.x) * (n2p.z - n1p.z) - (n1p.z - pp.z) * (n2p.x - n1p.x)) > 50;
      const dn1 = Math.hypot(n1p.x - p.x, n1p.z - p.z);
      if (turning) vT = Math.min(vT, 14 + dn1 * 0.55);
      const w = turning ? clamp((15 - dn1) / 15, 0, 1) : 0;
      tx = n1p.x * (1 - w) + n2p.x * w; tz = n1p.z * (1 - w) + n2p.z * w;
      if (!st.alert) { vT = Math.min(vT, 28); if (Math.hypot(ai.wander.x - p.x, ai.wander.z - p.z) < 30) ai.wander = C.spot(p.x, p.z, 80, 0); }
    }
    const fx = Math.sin(p.h), fz = Math.cos(p.h), ddx = tx - p.x, ddz = tz - p.z;
    const df = ddx * fx + ddz * fz, dl = ddx * Math.cos(p.h) - ddz * Math.sin(p.h);
    const alpha = Math.atan2(-dl, df), Ld = Math.max(4, Math.hypot(ddx, ddz));
    const steer = clamp(Math.atan(2 * 2.8 * Math.sin(alpha) / Ld) / SM.steerMax(sp), -1, 1);
    if (direct) {
      if (Math.abs(alpha) > 0.7) vT = Math.min(vT, 16);
      if (dist < 14) vT = Math.max(Math.hypot(pl.vx, pl.vz) + 6, 12);
    }
    const throttle = clamp((vT - sp) / 3 + 0.3, 0, 1), brake = clamp((sp - vT) / 4, 0, 1);
    ai.lastThr = brake > 0.05 ? 0 : throttle; ai.lastSteer = steer;
    const nitro = direct && dist > 60 && Math.abs(alpha) < 0.15 && p.nitro > 0.3;
    return { steer, throttle: brake > 0.05 ? 0 : throttle, brake, drift: false, nitro };
  }

  // ---------------- obstacles ----------------
  function placeObstacle(o, avoidD) {
    const C = SM.city, d = o.def;
    let s;
    if (o.type === 'bench' && rng() < 0.7) {
      const b = C.plaza.b; s = { x: b.x0 + 6 + rng() * (b.x1 - b.x0 - 12), z: b.z0 + 6 + rng() * (b.z1 - b.z0 - 12), horiz: rng() < 0.5 };
      if (Math.hypot(s.x - C.plaza.x, s.z - C.plaza.z) < 6) s.x += 8;
    } else s = C.spot(player ? player.x : 0, player ? player.z : 0, avoidD, o.type === 'cart' || o.type === 'jerk' ? C.SW / 2 - 1.6 : C.SW / 2 - 2);
    o.x = s.x; o.z = s.z; o.y = 0; o.state = 'stand'; o.t = 0;
    o.mesh.position.set(o.x, 0, o.z);
    o.mesh.rotation.set(0, (s.horiz ? Math.PI / 2 : 0) + (o.type === 'barrier' ? 0 : (rng() - 0.5) * 0.6), 0);
    o.mesh.visible = true;
    void d;
  }

  function hitObstacle(o, c) {
    const sp = Math.hypot(c.vx, c.vz);
    o.state = 'fly'; o.t = 0;
    o.vx = c.vx * (1 + rng() * 0.35) + (rng() - 0.5) * 6; o.vz = c.vz * (1 + rng() * 0.35) + (rng() - 0.5) * 6;
    o.vy = 3 + sp * 0.12 + rng() * 3;
    o.ax = (rng() - 0.5) * 12; o.ay = (rng() - 0.5) * 8; o.az = (rng() - 0.5) * 12;
    c.vx *= 1 - o.def.slow; c.vz *= 1 - o.def.slow;
    for (let k = 0; k < 7; k++) SM.fx.spawn(o.x, 0.8, o.z, (rng() - 0.5) * 6 + c.vx * 0.3, 1 + rng() * 3, (rng() - 0.5) * 6 + c.vz * 0.3, 0.9, 0.7, o.def.smoke, false, 2.5);
    if (c === player) {
      st.combo = st.comboT > 0 ? st.combo + 1 : 1;
      st.comboT = COMBO_WINDOW;
      st.mult = Math.min(5, 1 + Math.floor((st.combo - 1) / 2));
      const pts = o.def.pts * st.mult;
      st.score += pts; st.smashed++;
      SM.ui.pop('+' + pts + ' ' + o.def.label + (st.mult > 1 ? '  ×' + st.mult : ''), st.mult > 2 ? 'gold' : '');
      SM.audio.smash(o.def.slow);
    }
  }

  function obstacleHits(c) {
    for (const o of obstacles) {
      if (o.state !== 'stand') continue;
      const dx = o.x - c.x, dz = o.z - c.z;
      if (dx * dx + dz * dz > 25) continue;
      for (const off of [1.25, -1.25]) {
        const cx = c.x + Math.sin(c.h) * off, cz = c.z + Math.cos(c.h) * off;
        if ((o.x - cx) ** 2 + (o.z - cz) ** 2 < (o.def.r + 1.2) ** 2) { hitObstacle(o, c); break; }
      }
    }
  }

  function updateObstacles(dt) {
    const C = SM.city;
    for (const o of obstacles) {
      if (o.state === 'fly') {
        o.vy -= 22 * dt;
        const nx = o.x + o.vx * dt, nz = o.z + o.vz * dt;
        if (C.inside(nx, nz, 0.3)) { o.vx *= -0.4; o.vz *= -0.4; } else { o.x = nx; o.z = nz; }
        o.y += o.vy * dt;
        o.mesh.rotation.x += o.ax * dt; o.mesh.rotation.y += o.ay * dt; o.mesh.rotation.z += o.az * dt;
        if (o.y < 0) {
          o.y = 0;
          if (Math.abs(o.vy) > 2) { o.vy = -o.vy * 0.35; o.vx *= 0.6; o.vz *= 0.6; o.ax *= 0.6; o.ay *= 0.6; o.az *= 0.6; }
          else { o.state = 'rest'; o.t = 0; }
        }
        o.mesh.position.set(o.x, o.y, o.z);
      } else if (o.state === 'rest') {
        o.t += dt;
        if (o.t > 6) { o.mesh.position.y -= dt * 0.8; if (o.mesh.position.y < -1.8) { o.state = 'gone'; o.t = 0; o.mesh.visible = false; } }
      } else if (o.state === 'gone') {
        o.t += dt;
        if (o.t > 5) placeObstacle(o, 140);
      } else if (o.type === 'jerk' && rng() < dt * 3) {
        const d2 = (o.x - player.x) ** 2 + (o.z - player.z) ** 2;
        if (d2 < 120 * 120) SM.fx.spawn(o.x + 0.3, 1.8, o.z, (rng() - 0.5) * 0.6, 1.4, (rng() - 0.5) * 0.6, 0.8, 2.2, '#d9d3c7', false, 1.4);
      }
    }
  }

  // ---------------- Golden Eagle ----------------
  function buildEagle() {
    const gold = new T.MeshStandardMaterial({ color: 0xffc21a, metalness: 1, roughness: 0.22, emissive: 0x6a4a00, emissiveIntensity: 0.6 });
    const g = new T.Group(), trophy = new T.Group();
    const base = new T.Mesh(new T.CylinderGeometry(1.1, 1.3, 0.6, 20), new T.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.4, roughness: 0.4 }));
    base.position.y = 0.3; g.add(base);
    const bodyG = new T.SphereGeometry(0.55, 16, 12); bodyG.scale(0.8, 1.2, 0.8);
    const body = new T.Mesh(bodyG, gold); body.position.y = 1.6; trophy.add(body);
    const head = new T.Mesh(new T.SphereGeometry(0.3, 14, 10), gold); head.position.set(0, 2.45, 0.15); trophy.add(head);
    const beak = new T.Mesh(new T.ConeGeometry(0.11, 0.35, 8).rotateX(Math.PI / 2), gold); beak.position.set(0, 2.4, 0.5); beak.rotation.x = 0.4; trophy.add(beak);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const f = new T.Mesh(new T.BoxGeometry(1.5 - k * 0.2, 0.08, 0.32), gold);
        f.position.set(s * (0.95 + k * 0.05), 2.05 - k * 0.22, -0.1); f.rotation.z = s * (0.55 - k * 0.1); trophy.add(f);
      }
    }
    trophy.position.y = 0.6; g.add(trophy);
    const beam = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 160, 24, 1, true),
      new T.MeshBasicMaterial({ color: 0xffc21a, transparent: true, opacity: 0.32, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    beam.position.y = 80; g.add(beam);
    const halo = new T.Sprite(new T.SpriteMaterial({ map: SM.fxGlow, color: 0xffd34a, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    halo.scale.set(9, 9, 1); halo.position.y = 2.2; g.add(halo);
    g.visible = false; scene.add(g);
    return { g, trophy, x: 0, z: 0 };
  }

  function spawnEagle() {
    const C = SM.city;
    let s = C.spot(player.x, player.z, 280, 0);
    if (rng() < 0.3) s = { x: C.plaza.x + 14, z: C.plaza.z + 14 };
    st.eagle.x = s.x; st.eagle.z = s.z; st.eagle.g.position.set(s.x, 0, s.z); st.eagle.g.visible = true;
    st.eagleOn = true; st.alert = true; st.lastSeen = { x: player.x, z: player.z };
    st.heat = 5;
    SM.ui.flash('GOLDEN EAGLE UNLOCKED', 'gold');
    SM.ui.pop('Follow the gold beam and grab it to win', 'gold');
    SM.audio.beep(880, 0.25, 0.18); setTimeout(() => SM.audio.beep(1320, 0.4, 0.18), 220);
    activatePolice();
  }

  // ---------------- public API ----------------
  chase.build = function (sc, pl) {
    scene = sc; player = pl;
    for (let k = 0; k < MAX_POLICE; k++) police.push(makePolice(k));
    const mat = new T.MeshLambertMaterial({ vertexColors: true });
    for (const type in TYPES) {
      const def = TYPES[type], geo = SM.mergeColored(def.build());
      for (let k = 0; k < def.count; k++) {
        const mesh = new T.Mesh(geo, mat); mesh.castShadow = true; scene.add(mesh);
        obstacles.push({ type, def, mesh, x: 0, z: 0, y: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, state: 'stand', t: 0 });
      }
    }
    st.eagle = buildEagle();
  };

  chase.reset = function () {
    const C = SM.city;
    Object.assign(st, { score: 0, combo: 0, comboT: 0, mult: 1, heat: 1, time: 0, smashed: 0, bust: 0, alert: true, spotted: false, seenT: 0, over: false, won: false, eagleOn: false, siren: 0 });
    st.eagle.g.visible = false;
    Object.assign(player, { x: C.SX[4] - 4, z: C.SZ[6] + 26, h: Math.PI, vx: 0, vz: 0, yaw: 0, steer: 0, nitro: 0.5, boosting: false, drifting: false,
      miniTurbo: 0, rpm: 1000, hit: 0, draft: 0, lean: 0, pitch: 0, events: [], lat: 0, offroad: false, finished: false });
    st.lastSeen = { x: player.x, z: player.z };
    chase.cars.length = 0; chase.cars.push(player);
    for (const p of police) { p.active = false; p.model.root.visible = false; }
    // a cone line just ahead so the first smash comes quickly
    obstacles.forEach(o => placeObstacle(o, 40));
    const cones = obstacles.filter(o => o.type === 'cone').slice(0, 4);
    cones.forEach((o, k) => { o.x = player.x + (k % 2 ? 0.7 : -0.7); o.z = player.z - 45 - k * 6; o.mesh.position.set(o.x, 0, o.z); });
    activatePolice();
  };

  chase.respawn = function () { SM.city.snapToStreet(player); };

  chase.step = function (dt, pin) {
    st.time += dt;
    for (const c of chase.cars) {
      const inp = c === player ? (st.over ? { steer: 0, throttle: 0, brake: st.won ? 0.3 : 1, drift: false, nitro: false } : pin) : (st.over ? { steer: 0, throttle: 0, brake: 1, drift: false, nitro: false } : policeInput(c, dt));
      SM.stepCar(c, dt, inp);
      SM.city.collide(c);
    }
    SM.collide(chase.cars);
    for (const c of chase.cars) obstacleHits(c);
  };

  chase.frame = function (dt, t) {
    const C = SM.city;
    updateObstacles(dt);
    // police lights
    let near = Infinity, anyLos = false;
    for (const p of police) {
      if (!p.active) continue;
      const on = Math.sin(t * 14 + p.ai.ph * 6) > 0, L = p.model.lights;
      L.red.emissiveIntensity = on ? 3 : 0.2; L.blue.emissiveIntensity = on ? 0.2 : 3;
      L.gr.material.opacity = on ? 0.9 : 0.05; L.gb.material.opacity = on ? 0.05 : 0.9;
      p.color = on ? '#ff3344' : '#3a6cff';
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      near = Math.min(near, d);
      if (p.ai.los && d < 180) anyLos = true;
      if (d > 430 && !st.over) spawnPolice(p, 170, 280);
    }
    if (st.over) { st.siren = Math.max(0, st.siren - dt); return; }

    // seen, searching, evaded
    if (anyLos) {
      if (!st.alert) { st.alert = true; SM.ui.flash('SPOTTED', ''); }
      st.spotted = true; st.seenT = 0; st.lastSeen = { x: player.x, z: player.z };
    } else st.seenT += dt;
    if (st.alert && st.spotted && st.seenT > 7 && !st.eagleOn) {
      st.alert = false; st.spotted = false; const bonus = 750 * st.heat; st.score += bonus;
      SM.ui.flash('EVADED', 'blue'); SM.ui.pop('+' + bonus + ' CLEAN GETAWAY', 'blue');
      for (const p of police) p.ai.wander = C.spot(st.lastSeen.x, st.lastSeen.z, 30, 0);
    }
    st.siren = st.alert ? clamp(1 - near / 280, 0, 1) : 0;

    // score over time, drifting, combo timer
    st.score += dt * 4 * st.heat;
    if (player.drifting) st.score += dt * 60;
    if (st.comboT > 0) { st.comboT -= dt; if (st.comboT <= 0) { st.combo = 0; st.mult = 1; } }

    // heat rises with time and mayhem
    const heat = Math.min(5, Math.max(1 + Math.floor(st.time / 50), 1 + Math.floor(st.score / 2200)));
    if (heat > st.heat && !st.eagleOn) { st.heat = heat; SM.ui.flash('HEAT LEVEL ' + heat, 'red'); }
    activatePolice();

    // busted: boxed in and stopped
    const sp = Math.hypot(player.vx, player.vz);
    if (near < 7.5 && sp < 6) st.bust = Math.min(1, st.bust + dt / 2.2); else st.bust = Math.max(0, st.bust - dt * 0.6);
    if (st.bust >= 1) { st.over = true; st.won = false; SM.ui.flash('BUSTED', 'red'); SM.audio.beep(220, 0.6, 0.2); }

    // Golden Eagle
    if (!st.eagleOn && st.score >= EAGLE_TARGET) spawnEagle();
    if (st.eagleOn) {
      const e = st.eagle; e.trophy.rotation.y += dt * 1.6; e.trophy.position.y = 0.6 + Math.sin(t * 2.4) * 0.15;
      if (Math.hypot(e.x - player.x, e.z - player.z) < 4.5) {
        st.over = true; st.won = true; e.g.visible = false;
        SM.ui.flash('YOU WIN', 'gold'); SM.audio.beep(988, 0.25, 0.2); setTimeout(() => SM.audio.beep(1319, 0.5, 0.2), 200);
        for (let k = 0; k < 60; k++) SM.fx.spawn(e.x, 2, e.z, (rng() - 0.5) * 16, 4 + rng() * 10, (rng() - 0.5) * 16, 0.8, 1.4, k % 3 ? '#ffd23f' : '#009b3a', true, -0.3);
      }
    }
  };

  chase.hudData = function () {
    let goal = null;
    if (st.eagleOn && !st.over) {
      const dx = st.eagle.x - player.x, dz = st.eagle.z - player.z;
      const rel = Math.atan2(dx, dz) - player.h;
      goal = { dist: Math.hypot(dx, dz), angle: Math.atan2(Math.sin(rel), Math.cos(rel)) };
    }
    return {
      score: Math.floor(st.score), mult: st.mult, comboT: st.comboT / COMBO_WINDOW, heat: st.heat, time: st.time, smashed: st.smashed,
      bust: st.bust, status: st.over ? (st.won ? 'WON' : 'BUSTED') : !st.alert ? 'HIDDEN' : !st.spotted ? 'CLOSING IN' : st.seenT < 1 ? 'PURSUIT' : 'SEARCHING ' + Math.max(0, 7 - st.seenT).toFixed(0) + 's',
      eagle: Math.min(1, st.score / EAGLE_TARGET), eagleOn: st.eagleOn, target: EAGLE_TARGET, goal, police: chase.cars.length - 1
    };
  };
  chase.eagleTarget = EAGLE_TARGET;
})();
