/* Supermar — world: track, terrain, sea, sky and Jamaican scenery */
(function () {
  'use strict';
  const SM = (window.SM = window.SM || {});
  const T = THREE;

  // ---------- helpers ----------
  let seed = 20261120;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  SM.rnd = rnd; SM.clamp = clamp; SM.smooth = smooth;

  function mergeGeos(list) {
    let total = 0;
    const flat = list.map(g => { const n = g.index ? g.toNonIndexed() : g; total += n.attributes.position.count; return n; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3);
    let o = 0;
    flat.forEach(g => {
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      o += g.attributes.position.count;
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    return out;
  }
  SM.mergeGeos = mergeGeos;

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.anisotropy = 8; return t;
  }
  SM.canvasTex = canvasTex;

  function drawJamaicaFlag(g, w, h) {
    g.fillStyle = '#009B3A'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#000000';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w / 2, h / 2); g.lineTo(0, h); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(w, 0); g.lineTo(w / 2, h / 2); g.lineTo(w, h); g.closePath(); g.fill();
    g.strokeStyle = '#FED100'; g.lineWidth = h / 6;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
  }
  SM.drawJamaicaFlag = drawJamaicaFlag;

  // ---------- track ----------
  const CTRL = [[0, 100], [0, -150], [30, -300], [140, -380], [280, -360], [340, -250], [290, -140], [320, -40],
    [440, 20], [500, 140], [450, 270], [320, 320], [200, 260], [90, 300], [-40, 360], [-170, 320], [-210, 200], [-110, 160]];

  function buildTrack() {
    const curve = new T.CatmullRomCurve3(CTRL.map(p => new T.Vector3(p[0], 0, p[1])), true, 'centripetal');
    const N = 1200;
    const raw = curve.getSpacedPoints(N); raw.pop();
    let k0 = 0, bd = Infinity;
    raw.forEach((p, i) => { const d = p.x * p.x + (p.z + 20) * (p.z + 20); if (d < bd) { bd = d; k0 = i; } });
    const pts = raw.slice(k0).concat(raw.slice(0, k0));
    const tan = [], right = [];
    for (let i = 0; i < N; i++) {
      const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
      const t = new T.Vector3(b.x - a.x, 0, b.z - a.z).normalize();
      tan.push(t); right.push(new T.Vector3(-t.z, 0, t.x));
    }
    let length = 0;
    for (let i = 0; i < N; i++) length += pts[i].distanceTo(pts[(i + 1) % N]);
    const ds = length / N;
    const kap = new Float32Array(N), turn = new Float32Array(N), safe = new Float32Array(N);
    const K = 5;
    for (let i = 0; i < N; i++) {
      const a = tan[(i - K + N) % N], b = tan[(i + K) % N], ra = right[(i - K + N) % N];
      const ang = Math.acos(clamp(a.x * b.x + a.z * b.z, -1, 1));
      kap[i] = ang / (2 * K * ds);
      turn[i] = Math.sign(b.x * ra.x + b.z * ra.z) * kap[i];
    }
    const LAT = 19, BR = 17;
    for (let i = 0; i < N; i++) safe[i] = Math.min(92, Math.sqrt(LAT / Math.max(kap[i], 1e-5)));
    for (let pass = 0; pass < 3; pass++) {
      for (let i = N - 1; i >= 0; i--) { const j = (i + 1) % N; safe[i] = Math.min(safe[i], Math.sqrt(safe[j] * safe[j] + 2 * BR * ds)); }
    }
    const coarse = []; for (let i = 0; i < N; i += 6) coarse.push(pts[i]);
    SM.track = { pts, tan, right, N, ds, length, W: 20, wall: 23, kap, turn, safe, coarse };
  }

  function trackDist(x, z) {
    const c = SM.track.coarse; let m = Infinity;
    for (let i = 0; i < c.length; i++) { const dx = c[i].x - x, dz = c[i].z - z, d = dx * dx + dz * dz; if (d < m) m = d; }
    return Math.sqrt(m);
  }
  SM.trackDist = trackDist;

  // ---------- terrain ----------
  function coastX(z) { return 735 + 60 * Math.sin(z / 150 + 0.6) + 24 * Math.sin(z / 47 + 1.3); }
  SM.coastX = coastX;

  function heightAt(x, z, dKnown) {
    const d = dKnown !== undefined ? dKnown : trackDist(x, z);
    const flat = smooth(28, 150, d);
    let h = (7 * Math.sin(x / 83) * Math.cos(z / 97) + 4 * Math.sin((x + z) / 61) + 2.5 * Math.sin(x / 23 + z / 31) + 9) * flat;
    const mx = -480 - x;
    if (mx > 0) h += Math.pow(mx, 1.12) * 0.36 * (0.72 + 0.2 * Math.sin(z / 170) + 0.12 * Math.sin(z / 57 + 2)) * flat;
    const cx = coastX(z);
    if (x > cx - 110) { const t = smooth(cx - 110, cx - 40, x); h = h * (1 - t) + 0.5 * t; }
    if (x > cx - 40) { const t = smooth(cx - 40, cx + 50, x); h = 0.5 * (1 - t) - 6 * t; }
    return h;
  }
  SM.heightAt = heightAt;

  function buildTerrain(scene) {
    const geo = new T.PlaneGeometry(5200, 5200, 230, 230);
    geo.rotateX(-Math.PI / 2); geo.translate(150, 0, 0);
    const p = geo.attributes.position, n = p.count;
    const cols = new Float32Array(n * 3), c = new T.Color();
    const sand = new T.Color('#e8d6a0'), shallow = new T.Color('#3fc1c0'), deep = new T.Color('#11627e');
    const grassA = new T.Color('#4c9a35'), grassB = new T.Color('#3b7f2a'), forest = new T.Color('#24552c'), haze = new T.Color('#5b7590');
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), z = p.getZ(i), d = trackDist(x, z), h = heightAt(x, z, d);
      p.setY(i, h);
      const cx = coastX(z);
      if (h < -0.4) c.copy(shallow).lerp(deep, clamp((-h - 0.4) / 5, 0, 1));
      else if (x > cx - 78 && h < 3) c.copy(sand);
      else {
        const nz = 0.5 + 0.5 * Math.sin(x / 37) * Math.cos(z / 41);
        c.copy(grassA).lerp(grassB, nz);
        if (d < 26) c.lerp(new T.Color('#6ab04c'), 0.35);
        if (h > 40) c.lerp(forest, clamp((h - 40) / 120, 0, 1));
        if (h > 240) c.lerp(haze, clamp((h - 240) / 260, 0, 0.85));
      }
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(cols, 3));
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true }));
    mesh.receiveShadow = true;
    scene.add(mesh);

    const water = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
      new T.MeshPhongMaterial({ color: 0x17a9c4, specular: 0xbff2ff, shininess: 90, transparent: true, opacity: 0.86 }));
    water.position.y = -0.9;
    scene.add(water);
    return water;
  }

  // ---------- sky ----------
  function buildSky(scene) {
    const geo = new T.SphereGeometry(4200, 32, 16);
    const p = geo.attributes.position, cols = new Float32Array(p.count * 3);
    const hor = new T.Color('#d4ecf1'), zen = new T.Color('#2b7fd0'), c = new T.Color();
    for (let i = 0; i < p.count; i++) {
      const t = clamp(p.getY(i) / 4200, 0, 1);
      c.copy(hor).lerp(zen, Math.pow(t, 0.55));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new T.BufferAttribute(cols, 3));
    const sky = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    sky.renderOrder = -10;
    const sunDir = new T.Vector3(0.55, 0.42, -0.72).normalize();
    const disc = new T.Mesh(new T.SphereGeometry(120, 16, 8), new T.MeshBasicMaterial({ color: 0xfff4d2, fog: false }));
    disc.position.copy(sunDir).multiplyScalar(3900);
    sky.add(disc);
    scene.add(sky);

    const cloudMat = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a99a6 });
    const ball = new T.IcosahedronGeometry(1, 2);
    for (let k = 0; k < 20; k++) {
      const g = new T.Group();
      const parts = 4 + Math.floor(rnd() * 4);
      for (let j = 0; j < parts; j++) {
        const m = new T.Mesh(ball, cloudMat);
        const s = 28 + rnd() * 40;
        m.scale.set(s * 1.5, s * 0.55, s);
        m.position.set((j - parts / 2) * 38 + rnd() * 20, rnd() * 14, rnd() * 30);
        g.add(m);
      }
      const a = rnd() * Math.PI * 2, r = 700 + rnd() * 1300;
      g.position.set(150 + Math.cos(a) * r, 300 + rnd() * 160, Math.sin(a) * r);
      g.rotation.y = rnd() * Math.PI;
      scene.add(g);
    }
    return { sky, sunDir };
  }

  // ---------- road, curbs, walls ----------
  function roadTexture() {
    return canvasTex(256, 512, (g, w, h) => {
      g.fillStyle = '#46484b'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const v = 55 + Math.floor(rnd() * 30);
        g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 2) + ')';
        g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
      }
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(60, 0, 40, h); g.fillRect(156, 0, 40, h);
      g.fillStyle = '#f3f1ea'; g.fillRect(9, 0, 5, h); g.fillRect(w - 14, 0, 5, h);
      g.fillStyle = '#f6d24a'; g.fillRect(126, 0, 4, h * 0.5);
    });
  }

  function buildRoad(scene) {
    const tr = SM.track, N = tr.N, W = tr.W;
    const pos = [], uv = [], nor = [], idx = [];
    let dist = 0;
    for (let i = 0; i <= N; i++) {
      const k = i % N, p = tr.pts[k], r = tr.right[k];
      pos.push(p.x - r.x * W / 2, 0.06, p.z - r.z * W / 2, p.x + r.x * W / 2, 0.06, p.z + r.z * W / 2);
      nor.push(0, 1, 0, 0, 1, 0);
      uv.push(0, dist / 18, 1, dist / 18);
      if (i < N) {
        dist += p.distanceTo(tr.pts[(i + 1) % N]);
        const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const tex = roadTexture(); tex.wrapT = T.RepeatWrapping;
    const road = new T.Mesh(geo, new T.MeshStandardMaterial({ map: tex, roughness: 0.93, metalness: 0 }));
    road.receiveShadow = true;
    scene.add(road);
    return tex;
  }

  function stripMesh(build, double) {
    const pos = [], col = [], nor = [];
    build(pos, col, nor);
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return new T.Mesh(geo, new T.MeshLambertMaterial({ vertexColors: true, side: double ? T.DoubleSide : T.FrontSide }));
  }

  function buildCurbsAndWalls(scene) {
    const tr = SM.track, N = tr.N, W = tr.W;
    const gold = new T.Color('#fed100'), green = new T.Color('#009b3a'), black = new T.Color('#16181a'), white = new T.Color('#f2f2ee');
    const P = (i, off, y) => { const p = tr.pts[i], r = tr.right[i]; return [p.x + r.x * off, y, p.z + r.z * off]; };
    const curbs = stripMesh((pos, col, nor) => {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        if (Math.max(tr.kap[i], tr.kap[j]) < 1 / 230) continue;
        const c = Math.floor(i / 2) % 2 ? gold : green;
        for (const s of [-1, 1]) {
          const a = P(i, s * W / 2, 0.1), b = P(i, s * (W / 2 + 1.7), 0.1), cc = P(j, s * W / 2, 0.1), d = P(j, s * (W / 2 + 1.7), 0.1);
          pos.push(...a, ...b, ...cc, ...b, ...d, ...cc);
          for (let q = 0; q < 6; q++) { col.push(c.r, c.g, c.b); nor.push(0, 1, 0); }
        }
      }
    }, true);
    curbs.receiveShadow = true;
    scene.add(curbs);

    const walls = stripMesh((pos, col, nor) => {
      const cyc = [green, gold, black, white];
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N, c = cyc[Math.floor(i / 3) % 4];
        for (const s of [-1, 1]) {
          const a = P(i, s * tr.wall, 0), b = P(i, s * tr.wall, 1.15), cc = P(j, s * tr.wall, 0), d = P(j, s * tr.wall, 1.15);
          pos.push(...a, ...b, ...cc, ...b, ...d, ...cc);
          const r = tr.right[i];
          for (let q = 0; q < 6; q++) { col.push(c.r, c.g, c.b); nor.push(-r.x * s, 0, -r.z * s); }
        }
      }
    }, true);
    scene.add(walls);
  }

  // ---------- start line, gantry, grandstand ----------
  function buildStart(scene) {
    const tr = SM.track, p = tr.pts[0], t = tr.tan[0], r = tr.right[0], W = tr.W;
    const h = Math.atan2(t.x, t.z);
    const check = canvasTex(256, 32, (g, w, hh) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 16, y * 16, 16, 16); }
    });
    const line = new T.Mesh(new T.PlaneGeometry(W, 2.5).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: check }));
    line.position.set(p.x, 0.075, p.z); line.rotation.y = h; line.receiveShadow = true;
    scene.add(line);

    const banner = canvasTex(1024, 128, (g, w, hh) => {
      g.fillStyle = '#0b0d0c'; g.fillRect(0, 0, w, hh);
      g.save(); g.translate(14, 14); drawJamaicaFlag(g, 200, 100); g.restore();
      g.save(); g.translate(w - 214, 14); drawJamaicaFlag(g, 200, 100); g.restore();
      g.fillStyle = '#fed100'; g.font = '900 64px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('JAMAICA COAST RUN', w / 2, hh / 2 + 4);
    });
    const gantry = new T.Group();
    const steel = new T.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.6, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const post = new T.Mesh(new T.BoxGeometry(0.8, 8, 0.8), steel);
      post.position.set(s * (W / 2 + 2), 4, 0); post.castShadow = true; gantry.add(post);
    }
    const bar = new T.Mesh(new T.BoxGeometry(W + 5, 2.2, 0.6), [steel, steel, steel, steel,
      new T.MeshBasicMaterial({ map: banner }), new T.MeshBasicMaterial({ map: banner })]);
    bar.position.y = 8.2; bar.castShadow = true; gantry.add(bar);
    gantry.position.set(p.x, 0, p.z); gantry.rotation.y = h;
    scene.add(gantry);

    // grandstand on the left of the main straight
    const stand = new T.Group();
    const concrete = new T.MeshLambertMaterial({ color: 0xc9c6bd });
    const len = 130;
    for (let k = 0; k < 6; k++) {
      const step = new T.Mesh(new T.BoxGeometry(1.7, 1.2 + k * 0.9, len), concrete);
      step.position.set(-(W / 2 + 17 + k * 1.7), (1.2 + k * 0.9) / 2, 0); stand.add(step);
    }
    const roof = new T.Mesh(new T.BoxGeometry(13, 0.4, len), new T.MeshLambertMaterial({ color: 0x0f7a3a }));
    roof.position.set(-(W / 2 + 21.5), 10.5, 0); stand.add(roof);
    const crowdColors = ['#d7192a', '#fed100', '#009b3a', '#f5f5f0', '#1b1b1b', '#2c7be5', '#ff8c2a'];
    const crowd = new T.InstancedMesh(new T.BoxGeometry(0.55, 0.95, 0.45), new T.MeshLambertMaterial({ color: 0xffffff }), 520);
    const m = new T.Matrix4(), col = new T.Color();
    for (let i = 0; i < 520; i++) {
      const k = i % 6, zz = (rnd() - 0.5) * (len - 4);
      m.makeTranslation(-(W / 2 + 17 + k * 1.7) + (rnd() - 0.5) * 0.5, 1.2 + k * 0.9 + 0.48, zz);
      crowd.setMatrixAt(i, m); crowd.setColorAt(i, col.set(crowdColors[Math.floor(rnd() * crowdColors.length)]));
    }
    stand.add(crowd);
    stand.position.set(p.x, 0, p.z);
    stand.rotation.y = Math.atan2(r.x, r.z) - Math.PI / 2;
    scene.add(stand);
    return crowd;
  }

  // ---------- flags ----------
  function buildFlags(scene) {
    const tr = SM.track, flags = [];
    const tex = canvasTex(256, 128, drawJamaicaFlag);
    const poleMat = new T.MeshStandardMaterial({ color: 0xdedede, metalness: 0.7, roughness: 0.3 });
    const flagMat = new T.MeshLambertMaterial({ map: tex, side: T.DoubleSide });
    for (let k = 0; k < 22; k++) {
      const i = Math.floor((k + 0.3 * rnd()) / 22 * tr.N) % tr.N, s = k % 2 ? 1 : -1;
      const p = tr.pts[i], r = tr.right[i];
      const g = new T.Group();
      const pole = new T.Mesh(new T.CylinderGeometry(0.08, 0.1, 8, 6), poleMat);
      pole.position.y = 4; g.add(pole);
      const geo = new T.PlaneGeometry(3.6, 1.8, 12, 4); geo.translate(1.8, 0, 0);
      const flag = new T.Mesh(geo, flagMat); flag.position.y = 7; g.add(flag);
      g.position.set(p.x + r.x * s * (tr.wall + 2), 0, p.z + r.z * s * (tr.wall + 2));
      g.rotation.y = rnd() * Math.PI * 2;
      scene.add(g);
      flags.push({ geo, base: Float32Array.from(geo.attributes.position.array), ph: rnd() * 6 });
    }
    return flags;
  }

  // ---------- vegetation, villages, boats, billboards ----------
  function placeNearTrack(minOff, spread) {
    const tr = SM.track;
    for (let tries = 0; tries < 30; tries++) {
      const i = Math.floor(rnd() * tr.N), s = rnd() < 0.5 ? -1 : 1, off = minOff + rnd() * spread;
      const p = tr.pts[i], r = tr.right[i];
      const x = p.x + r.x * s * off, z = p.z + r.z * s * off;
      if (trackDist(x, z) < minOff - 2 || x > coastX(z) - 50) continue;
      return { x, z, i, s };
    }
    return null;
  }

  function palmGeos() {
    const trunk = new T.CylinderGeometry(0.2, 0.36, 9, 7, 8, true);
    trunk.translate(0, 4.5, 0);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + Math.pow(y / 9, 2) * 1.7); }
    trunk.computeVertexNormals();
    const fronds = [];
    for (let k = 0; k < 8; k++) {
      const f = new T.PlaneGeometry(5.2, 1.3, 6, 1); f.rotateX(-Math.PI / 2); f.translate(2.6, 0, 0);
      const fp = f.attributes.position;
      for (let i = 0; i < fp.count; i++) {
        const s = fp.getX(i) / 5.2;
        fp.setZ(i, fp.getZ(i) * Math.sin(Math.PI * clamp(s * 0.95 + 0.05, 0, 1)));
        fp.setY(i, 0.7 * s - 2.7 * s * s);
      }
      f.rotateY(k * Math.PI / 4 + rnd() * 0.3); f.translate(1.7, 9, 0);
      f.computeVertexNormals();
      fronds.push(f);
    }
    return { trunk, fronds: mergeGeos(fronds) };
  }

  SM.palmGeos = palmGeos;

  function buildVegetation(scene) {
    const pg = palmGeos(), m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3(), up = new T.Vector3(0, 1, 0);
    const spots = [];
    for (let k = 0; k < 230; k++) { const s = placeNearTrack(27, 110); if (s) spots.push(s); }
    for (let k = 0; k < 140; k++) {
      const z = -1100 + rnd() * 2200, x = coastX(z) - 45 - rnd() * 70;
      if (trackDist(x, z) > 28) spots.push({ x, z });
    }
    const trunks = new T.InstancedMesh(pg.trunk, new T.MeshLambertMaterial({ color: 0x8a6a45 }), spots.length);
    const fronds = new T.InstancedMesh(pg.fronds, new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide }), spots.length);
    const c = new T.Color();
    spots.forEach((s, i) => {
      q.setFromAxisAngle(up, rnd() * Math.PI * 2); const k = 0.8 + rnd() * 0.5; sc.set(k, k, k);
      ps.set(s.x, heightAt(s.x, s.z) - 0.2, s.z); m.compose(ps, q, sc);
      trunks.setMatrixAt(i, m); fronds.setMatrixAt(i, m);
      fronds.setColorAt(i, c.setHSL(0.27 + rnd() * 0.06, 0.55 + rnd() * 0.2, 0.28 + rnd() * 0.1));
    });
    trunks.castShadow = true; fronds.castShadow = true;
    scene.add(trunks, fronds);

    // round broadleaf trees on hills and mountain slopes
    const canopyGeo = new T.IcosahedronGeometry(1, 0), stemGeo = new T.CylinderGeometry(0.25, 0.35, 1, 5); stemGeo.translate(0, 0.5, 0);
    const COUNT = 1100;
    const canopy = new T.InstancedMesh(canopyGeo, new T.MeshLambertMaterial({ color: 0xffffff }), COUNT);
    const stems = new T.InstancedMesh(stemGeo, new T.MeshLambertMaterial({ color: 0x5b4632 }), COUNT);
    let n = 0;
    for (let tries = 0; tries < 6000 && n < COUNT; tries++) {
      const x = -1700 + rnd() * 2300, z = -1500 + rnd() * 3000;
      if (x > coastX(z) - 120) continue;
      const d = trackDist(x, z); if (d < 34) continue;
      const h = heightAt(x, z, d); if (h > 520) continue;
      const k = 3 + rnd() * 4;
      q.setFromAxisAngle(up, rnd() * 6);
      ps.set(x, h + k * 0.9, z); sc.set(k, k * 0.85, k); m.compose(ps, q, sc); canopy.setMatrixAt(n, m);
      canopy.setColorAt(n, c.setHSL(0.28 + rnd() * 0.07, 0.5, 0.2 + rnd() * 0.12));
      ps.set(x, h - 0.3, z); sc.set(1, k * 0.7, 1); m.compose(ps, q, sc); stems.setMatrixAt(n, m);
      n++;
    }
    canopy.count = n; stems.count = n;
    scene.add(canopy, stems);
  }

  function buildVillages(scene) {
    const tr = SM.track, N = tr.N, W = tr.W;
    const box = new T.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    const roofG = new T.ConeGeometry(0.76, 0.6, 4); roofG.rotateY(Math.PI / 4); roofG.translate(0, 0.3, 0);
    const MAX = 90;
    const houses = new T.InstancedMesh(box, new T.MeshLambertMaterial({ color: 0xffffff }), MAX);
    const roofs = new T.InstancedMesh(roofG, new T.MeshLambertMaterial({ color: 0xffffff }), MAX);
    const palette = ['#f7c548', '#ef6f6c', '#63c7b2', '#6aa9e9', '#f4a259', '#fbfbf6', '#b5e48c', '#ff99c8'];
    const m = new T.Matrix4(), q = new T.Quaternion(), sc = new T.Vector3(), ps = new T.Vector3(), up = new T.Vector3(0, 1, 0), c = new T.Color();
    let n = 0;
    [0.2, 0.43, 0.64, 0.87].forEach(f => {
      const center = Math.floor(f * N);
      for (let k = 0; k < 30 && n < MAX; k++) {
        const i = (center + Math.floor((rnd() - 0.5) * 80) + N) % N, s = rnd() < 0.5 ? -1 : 1, off = W / 2 + 28 + rnd() * 60;
        const p = tr.pts[i], r = tr.right[i];
        const x = p.x + r.x * s * off, z = p.z + r.z * s * off;
        if (trackDist(x, z) < 28 || x > coastX(z) - 70) continue;
        const w = 5 + rnd() * 4, hgt = 3 + rnd() * 3.5, d = 5 + rnd() * 4, y = heightAt(x, z) - 0.2;
        q.setFromAxisAngle(up, Math.atan2(-s * r.x, -s * r.z) + (rnd() - 0.5) * 0.4);
        ps.set(x, y, z); sc.set(w, hgt, d); m.compose(ps, q, sc);
        houses.setMatrixAt(n, m); houses.setColorAt(n, c.set(palette[Math.floor(rnd() * palette.length)]));
        ps.set(x, y + hgt, z); sc.set(w * 1.08, 2.2, d * 1.08); m.compose(ps, q, sc);
        roofs.setMatrixAt(n, m); roofs.setColorAt(n, c.set(rnd() < 0.5 ? '#8b3a2b' : '#9aa4aa'));
        n++;
      }
    });
    houses.count = n; roofs.count = n;
    houses.castShadow = true;
    scene.add(houses, roofs);
  }

  function buildBoats(scene) {
    const boats = [];
    const hullMat = new T.MeshLambertMaterial({ color: 0xf6f6f2 }), stripe = new T.MeshLambertMaterial({ color: 0x1f6fb2 });
    const sailMat = new T.MeshLambertMaterial({ color: 0xffffff, side: T.DoubleSide });
    const sailGeo = new T.BufferGeometry();
    sailGeo.setAttribute('position', new T.Float32BufferAttribute([0, 1.2, -1.5, 0, 9, 0.4, 0, 1.2, 2.6], 3));
    sailGeo.computeVertexNormals();
    for (let k = 0; k < 8; k++) {
      const g = new T.Group();
      const hull = new T.Mesh(new T.BoxGeometry(2.4, 1, 7), hullMat); g.add(hull);
      const st = new T.Mesh(new T.BoxGeometry(2.45, 0.25, 7.05), stripe); st.position.y = 0.2; g.add(st);
      if (k % 2 === 0) {
        const mast = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 9, 5), hullMat); mast.position.y = 5; g.add(mast);
        g.add(new T.Mesh(sailGeo, sailMat));
      }
      const z = -1000 + rnd() * 2000;
      g.position.set(coastX(z) + 160 + rnd() * 600, -0.6, z);
      g.rotation.y = rnd() * 6;
      scene.add(g);
      boats.push({ g, ph: rnd() * 6 });
    }
    return boats;
  }

  function buildBillboards(scene) {
    const tr = SM.track;
    const lines = [['ONE LOVE', 'drive good, mi bredda'], ['JERK CENTRE', '2 km · pimento smoke'], ['BLUE MOUNTAINS', 'coffee country, turn left'],
      ['WELCOME TO JAMAICA', 'out of many, one people'], ['FRESH COCONUT', 'cold, J$300'], ['SUPERMAR V16', 'the eagle has landed'], ['NEGRIL 1 HR', 'seven miles of sand']];
    const frame = new T.MeshLambertMaterial({ color: 0x24272a });
    lines.forEach((ln, k) => {
      const tex = canvasTex(512, 230, (g, w, h) => {
        g.fillStyle = k % 2 ? '#0d6b34' : '#141617'; g.fillRect(0, 0, w, h);
        g.fillStyle = '#fed100'; g.fillRect(0, h - 22, w, 22);
        g.fillStyle = '#ffffff'; g.textAlign = 'center';
        g.font = '900 54px Bungee, Impact, sans-serif'; g.fillText(ln[0], w / 2, 104, w - 30);
        g.font = '600 30px "Chakra Petch", Arial, sans-serif'; g.fillStyle = '#e9f2ea'; g.fillText(ln[1], w / 2, 160, w - 30);
      });
      const i = Math.floor((k + 0.55) / lines.length * tr.N) % tr.N, s = k % 2 ? -1 : 1;
      const p = tr.pts[i], r = tr.right[i], t = tr.tan[i];
      const g = new T.Group();
      const board = new T.Mesh(new T.BoxGeometry(11, 5, 0.3), [frame, frame, frame, frame, new T.MeshBasicMaterial({ map: tex }), frame]);
      board.position.y = 6; board.castShadow = true; g.add(board);
      for (const x of [-3.5, 3.5]) { const post = new T.Mesh(new T.BoxGeometry(0.35, 4, 0.35), frame); post.position.set(x, 2, 0); g.add(post); }
      const nx = -s * r.x - t.x * 0.7, nz = -s * r.z - t.z * 0.7;
      g.rotation.y = Math.atan2(nx, nz);
      g.position.set(p.x + r.x * s * (tr.wall + 6), 0, p.z + r.z * s * (tr.wall + 6));
      scene.add(g);
    });
  }

  // ---------- assemble ----------
  SM.buildWorld = function (scene, renderer) {
    buildTrack();
    const { sky, sunDir } = buildSky(scene);
    const water = buildTerrain(scene);
    const roadTex = buildRoad(scene);
    roadTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    buildCurbsAndWalls(scene);
    buildStart(scene);
    const flags = buildFlags(scene);
    buildVegetation(scene);
    buildVillages(scene);
    const boats = buildBoats(scene);
    buildBillboards(scene);

    const hemi = new T.HemisphereLight(0xcfeaff, 0x3d6b2a, 0.75);
    scene.add(hemi);
    const sun = new T.DirectionalLight(0xfff0d4, 1.05);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 700;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    // environment map so the chrome and red paint reflect the Caribbean sky
    try {
      const pm = new T.PMREMGenerator(renderer);
      const env = new T.Scene();
      env.add(sky.clone());
      const gnd = new T.Mesh(new T.CircleGeometry(4000, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x3f7a35 }));
      gnd.position.y = -60; env.add(gnd);
      scene.environment = pm.fromScene(env, 0.02, 1, 10000).texture;
      pm.dispose();
    } catch (e) { /* metals just look flatter without it */ }

    const horizon = new T.Color('#cfe7ee');
    scene.background = horizon;
    scene.fog = new T.Fog(horizon, 260, 2600);

    return {
      sun, sunDir,
      update(t, camPos) {
        sky.position.copy(camPos);
        for (const f of flags) {
          const a = f.geo.attributes.position, b = f.base;
          for (let i = 0; i < a.count; i++) {
            const x = b[i * 3];
            a.array[i * 3 + 2] = Math.sin(x * 1.7 - t * 6 + f.ph) * 0.28 * (x / 3.6) + Math.sin(b[i * 3 + 1] * 2 + t * 3) * 0.05;
          }
          a.needsUpdate = true;
        }
        for (const b of boats) { b.g.position.y = -0.6 + Math.sin(t * 1.1 + b.ph) * 0.18; b.g.rotation.z = Math.sin(t * 0.8 + b.ph) * 0.05; }
        water.material.color.setHSL(0.53, 0.78, 0.43 + Math.sin(t * 0.4) * 0.012);
      }
    };
  };
})();
