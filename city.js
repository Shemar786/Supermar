/* Supermar — Kingston-style city for the police chase: street grid, buildings, harbour, collisions */
(function () {
  'use strict';
  const SM = window.SM, T = THREE, rnd = SM.rnd, clamp = SM.clamp;

  const NX = 8, NZ = 8, B = 64, SW = 18;
  const L = NX * B + (NX + 1) * SW, H = L / 2;
  const SX = [], SZ = [];
  for (let i = 0; i <= NX; i++) SX.push(-H + SW / 2 + i * (B + SW));
  for (let j = 0; j <= NZ; j++) SZ.push(-H + SW / 2 + j * (B + SW));
  const PLAZA = { i: 4, j: 3 };
  const block = (i, j) => ({ x0: SX[i] + SW / 2, x1: SX[i + 1] - SW / 2, z0: SZ[j] + SW / 2, z1: SZ[j + 1] - SW / 2 });

  const rects = [];
  for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if (!(i === PLAZA.i && j === PLAZA.j)) rects.push(block(i, j));
  const pb = block(PLAZA.i, PLAZA.j), pcx = (pb.x0 + pb.x1) / 2, pcz = (pb.z0 + pb.z1) / 2;
  rects.push({ x0: pcx - 2.5, x1: pcx + 2.5, z0: pcz - 2.5, z1: pcz + 2.5 });   // monument

  // merge geometries that carry position, normal, optional uv and optional colour
  function mergeColored(list) {
    let total = 0;
    const flat = list.map(g => { const n = g.index ? g.toNonIndexed() : g; total += n.attributes.position.count; return n; });
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2);
    let o = 0;
    flat.forEach(g => {
      const n = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + n) * 3);
      o += n;
    });
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    out.setAttribute('uv', new T.BufferAttribute(uv, 2));
    out.setAttribute('color', new T.BufferAttribute(col, 3));
    return out;
  }
  function tint(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo, c = new T.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new T.BufferAttribute(a, 3)); return g;
  }
  SM.mergeColored = mergeColored; SM.tint = tint;

  // ---------------- collision and queries ----------------
  function pushCircle(c, cx, cz, r) {
    for (const R of rects) {
      if (cx < R.x0 - r || cx > R.x1 + r || cz < R.z0 - r || cz > R.z1 + r) continue;
      const qx = clamp(cx, R.x0, R.x1), qz = clamp(cz, R.z0, R.z1);
      const dx = cx - qx, dz = cz - qz, d2 = dx * dx + dz * dz;
      let nx, nz, pen;
      if (d2 > 1e-8) { const d = Math.sqrt(d2); if (d >= r) continue; nx = dx / d; nz = dz / d; pen = r - d; }
      else {
        const l = cx - R.x0, rr = R.x1 - cx, t = cz - R.z0, b = R.z1 - cz, m = Math.min(l, rr, t, b);
        if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; }
        else if (m === t) { nx = 0; nz = -1; pen = t + r; } else { nx = 0; nz = 1; pen = b + r; }
      }
      c.x += nx * pen; c.z += nz * pen; cx += nx * pen; cz += nz * pen;
      bounce(c, nx, nz);
    }
  }
  function bounce(c, nx, nz) {
    const vn = c.vx * nx + c.vz * nz;
    if (vn >= 0) return;
    c.vx -= nx * vn * 1.35; c.vz -= nz * vn * 1.35; c.vx *= 0.97; c.vz *= 0.97;
    c.hit = Math.max(c.hit, -vn);
    const tx = -nz, tz = nx, s = Math.sin(c.h) * tx + Math.cos(c.h) * tz >= 0 ? 1 : -1;
    const a = Math.atan2(tx * s, tz * s) - c.h;
    c.h += clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.06, 0.06);
    c.drifting = false;
  }
  function collide(c) {
    for (const o of [1.25, -1.25]) pushCircle(c, c.x + Math.sin(c.h) * o, c.z + Math.cos(c.h) * o, 1.1);
    const lim = H - 1.3;
    if (c.x > lim) { c.x = lim; bounce(c, -1, 0); } else if (c.x < -lim) { c.x = -lim; bounce(c, 1, 0); }
    if (c.z > lim) { c.z = lim; bounce(c, 0, -1); } else if (c.z < -lim) { c.z = -lim; bounce(c, 0, 1); }
  }
  function inside(x, z, m) {
    m = m || 0;
    if (Math.abs(x) > H - m || Math.abs(z) > H - m) return true;
    for (const R of rects) if (x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m) return true;
    return false;
  }
  function los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    for (const R of rects) {
      let t0 = 0, t1 = 1;
      if (Math.abs(dx) < 1e-9) { if (ax < R.x0 || ax > R.x1) continue; }
      else { let a = (R.x0 - ax) / dx, b = (R.x1 - ax) / dx; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
      if (Math.abs(dz) < 1e-9) { if (az < R.z0 || az > R.z1) continue; }
      else { let a = (R.z0 - az) / dz, b = (R.z1 - az) / dz; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) continue; }
      return false;
    }
    return true;
  }
  const nodePos = (i, j) => ({ x: SX[i], z: SZ[j] });
  function nearestNode(x, z) {
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) { const d = (SX[i] - x) ** 2 + (SZ[j] - z) ** 2; if (d < bd) { bd = d; bi = i; bj = j; } }
    return { i: bi, j: bj };
  }
  // the node ahead of a car on its current street, so it never plans a U-turn
  function nodeAhead(x, z, h) {
    const fx = Math.sin(h), fz = Math.cos(h);
    let best = nearestNode(x, z), bs = -Infinity;
    for (let i = 0; i <= NX; i++) for (let j = 0; j <= NZ; j++) {
      const dx = SX[i] - x, dz = SZ[j] - z, d = Math.hypot(dx, dz);
      if (d > 110) continue;
      const onStreet = Math.abs(dx) < SW * 0.6 || Math.abs(dz) < SW * 0.6;
      if (!onStreet) continue;
      const score = (dx * fx + dz * fz) / Math.max(1, d) * 60 - d * 0.5;
      if (score > bs) { bs = score; best = { i, j }; }
    }
    return best;
  }
  function neighbors(n) {
    const out = [];
    if (n.i > 0) out.push({ i: n.i - 1, j: n.j }); if (n.i < NX) out.push({ i: n.i + 1, j: n.j });
    if (n.j > 0) out.push({ i: n.i, j: n.j - 1 }); if (n.j < NZ) out.push({ i: n.i, j: n.j + 1 });
    return out;
  }
  // a random spot on a street, at least minD from (px, pz)
  function spot(px, pz, minD, lateral) {
    for (let k = 0; k < 60; k++) {
      const horiz = rnd() < 0.5;
      const line = horiz ? SZ[Math.floor(rnd() * SZ.length)] : SX[Math.floor(rnd() * SX.length)];
      const along = -H + 6 + rnd() * (L - 12), lat = (rnd() * 2 - 1) * (lateral === undefined ? SW / 2 - 2 : lateral);
      const x = horiz ? along : line + lat, z = horiz ? line + lat : along;
      if ((x - px) ** 2 + (z - pz) ** 2 < minD * minD || inside(x, z, 1)) continue;
      return { x, z, horiz };
    }
    return { x: SX[0], z: SZ[0], horiz: true };
  }
  function camClamp(c, px, pz) {
    if (!inside(px, pz, 0.6)) return [px, pz];
    const dx = px - c.x, dz = pz - c.z, d = Math.hypot(dx, dz);
    let k = 0;
    for (let s = 0.5; s <= d; s += 0.5) { if (inside(c.x + dx * s / d, c.z + dz * s / d, 0.6)) break; k = s; }
    return [c.x + dx * k / d, c.z + dz * k / d];
  }
  function snapToStreet(c) {
    const n = nearestNode(c.x, c.z), p = nodePos(n.i, n.j);
    const onX = Math.abs(c.x - p.x) < Math.abs(c.z - p.z);   // closer to a north-south street
    if (onX) { c.x = p.x - 4; c.h = Math.cos(c.h) >= 0 ? 0 : Math.PI; }
    else { c.z = p.z + 4; c.h = Math.sin(c.h) >= 0 ? Math.PI / 2 : -Math.PI / 2; }
    if (inside(c.x, c.z, 1.5)) { c.x = p.x; c.z = p.z; }
    c.vx = c.vz = 0; c.yaw = 0; c.steer = 0;
  }

  SM.city = { NX, NZ, B, SW, L, H, SX, SZ, rects, plaza: { x: pcx, z: pcz, b: pb }, collide, inside, los, nodePos, nearestNode, nodeAhead, neighbors, spot, camClamp, snapToStreet };

  // ---------------- visuals ----------------
  function asphaltTexture() {
    return SM.canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = '#3b3d41'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 6000; i++) { const v = 50 + Math.floor(rnd() * 26); g.fillStyle = 'rgb(' + v + ',' + v + ',' + (v + 3) + ')'; g.fillRect(rnd() * w, rnd() * h, 1.5, 1.5); }
      g.fillStyle = '#e9e6dc'; g.fillRect(0, 4, w, 3); g.fillRect(0, h - 7, w, 3);
      g.fillStyle = '#f2c230'; g.fillRect(0, h / 2 - 4, w, 2.5); g.fillRect(0, h / 2 + 1.5, w, 2.5);
      g.fillStyle = '#e9e6dc';
      for (let x = 50; x < w - 50; x += 44) { g.fillRect(x, h / 4 - 1, 24, 2.5); g.fillRect(x, (3 * h) / 4 - 1, 24, 2.5); }
      for (const x0 of [6, w - 30]) for (let y = 10; y < h - 10; y += 12) g.fillRect(x0, y, 24, 7);   // zebra crossings
    });
  }
  function windowTextures() {
    const lit = [];
    const wall = SM.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 3000; i++) { g.fillStyle = 'rgba(0,0,0,' + (rnd() * 0.05) + ')'; g.fillRect(rnd() * w, rnd() * h, 3, 3); }
      for (let fy = 0; fy < 4; fy++) for (let bx = 0; bx < 4; bx++) {
        const x = bx * 128 + 29, y = fy * 128 + 37;
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 12, y, 9, 58); g.fillRect(x + 73, y, 9, 58);   // shutters
        g.fillStyle = '#26313c'; g.fillRect(x, y, 70, 58);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 4, y + 4, 26, 50);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 2, y + 58, 74, 5);
        if (rnd() < 0.42) lit.push([x, y]);
      }
    });
    const glow = SM.canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (const [x, y] of lit) { g.fillStyle = rnd() < 0.7 ? '#ffcf7a' : '#bfe0ff'; g.fillRect(x, y, 70, 58); }
    });
    for (const t of [wall, glow]) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return { wall, glow };
  }

  function building(x, z, w, d, h, color) {
    const g = new T.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, h / 2, z);
    const uv = g.attributes.uv;
    // BoxGeometry faces: +x, -x, +y, -y, +z, -z (6 vertices each after toNonIndexed)
    for (let f = 0; f < 6; f++) for (let k = 0; k < 6; k++) {
      const i = f * 6 + k, u = uv.getX(i), v = uv.getY(i);
      if (f === 2 || f === 3) uv.setXY(i, 0.01, 0.99);
      else uv.setXY(i, u * (f < 2 ? d : w) / 16, v * h / 14 + 0.02);
    }
    return tint(g, color);
  }

  function buildCity(scene, renderer) {
    // sky at golden hour
    const skyGeo = new T.SphereGeometry(4200, 32, 16), sp = skyGeo.attributes.position, sc = new Float32Array(sp.count * 3);
    const hor = new T.Color('#f6b077'), mid = new T.Color('#d9839a'), zen = new T.Color('#3a4f9a'), c = new T.Color();
    for (let i = 0; i < sp.count; i++) {
      const t = clamp(sp.getY(i) / 4200, 0, 1);
      if (t < 0.25) c.copy(hor).lerp(mid, t / 0.25); else c.copy(mid).lerp(zen, Math.pow((t - 0.25) / 0.75, 0.6));
      sc[i * 3] = c.r; sc[i * 3 + 1] = c.g; sc[i * 3 + 2] = c.b;
    }
    skyGeo.setAttribute('color', new T.BufferAttribute(sc, 3));
    const sky = new T.Mesh(skyGeo, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false }));
    const sunDir = new T.Vector3(-0.8, 0.2, 0.35).normalize();
    const disc = new T.Mesh(new T.SphereGeometry(150, 16, 8), new T.MeshBasicMaterial({ color: 0xffd9a0, fog: false }));
    disc.position.copy(sunDir).multiplyScalar(3900); sky.add(disc);
    scene.add(sky);

    // ground, harbour water
    const ground = new T.Mesh(new T.PlaneGeometry(L + 700, L + 352).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ color: 0x34363a }));
    ground.position.set(0, 0, -176 + 4); ground.receiveShadow = true; scene.add(ground);
    const water = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
      new T.MeshPhongMaterial({ color: 0x1d6f8a, specular: 0xffc89a, shininess: 70, transparent: true, opacity: 0.9 }));
    water.position.y = -1.2; scene.add(water);

    // street segments with markings
    const tex = asphaltTexture();
    const segs = [];
    for (let j = 0; j <= NZ; j++) for (let i = 0; i < NX; i++) {
      const g = new T.PlaneGeometry(B, SW).rotateX(-Math.PI / 2); g.translate((SX[i] + SX[i + 1]) / 2, 0.02, SZ[j]); segs.push(g);
    }
    for (let i = 0; i <= NX; i++) for (let j = 0; j < NZ; j++) {
      const g = new T.PlaneGeometry(B, SW).rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2); g.translate(SX[i], 0.02, (SZ[j] + SZ[j + 1]) / 2); segs.push(g);
    }
    const roads = new T.Mesh(mergeColored(segs), new T.MeshLambertMaterial({ map: tex }));
    roads.receiveShadow = true; scene.add(roads);

    // sidewalks, buildings, plaza
    const walks = [], blds = [], tanks = [];
    const pastel = ['#f6c85f', '#ef8b74', '#6cc4a1', '#7fb3e6', '#f2a65a', '#ece6d6', '#c99be0', '#9fd39b', '#f7e3a1', '#e58fb0'];
    const tower = ['#c7ccd1', '#9fb0bd', '#d8d2c4', '#8fa5b8'];
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      const b = block(i, j);
      if (i === PLAZA.i && j === PLAZA.j) continue;
      walks.push(tint(new T.BoxGeometry(B, 0.25, B).translate((b.x0 + b.x1) / 2, 0.125, (b.z0 + b.z1) / 2), '#b9b3a6'));
      const downtown = Math.abs(i - 3.5) + Math.abs(j - 3.5) < 2.6;
      const lots = rnd() < (downtown ? 0.5 : 0.2) ? 1 : 2, inset = 3.5, size = (B - inset * 2) / lots;
      for (let a = 0; a < lots; a++) for (let e = 0; e < lots; e++) {
        const w = size - 1.5 - rnd() * 4, d = size - 1.5 - rnd() * 4;
        const x = b.x0 + inset + size * (a + 0.5), z = b.z0 + inset + size * (e + 0.5);
        let h = 8 + Math.floor(rnd() * 4) * 3.5;
        if (downtown) h += Math.floor(rnd() * 12) * 3.5;
        const col = h > 30 ? tower[Math.floor(rnd() * tower.length)] : pastel[Math.floor(rnd() * pastel.length)];
        blds.push(building(x, z, w, d, h, col));
        if (h < 30 && rnd() < 0.6) tanks.push([x + (rnd() - 0.5) * w * 0.5, h, z + (rnd() - 0.5) * d * 0.5]);
      }
    }
    // perimeter row beyond the outer streets (north, east, west)
    for (let k = -9; k <= 9; k++) {
      const p = k * 40;
      const h1 = 10 + rnd() * 30, h2 = 10 + rnd() * 30, h3 = 10 + rnd() * 30;
      blds.push(building(p, -H - 22, 36, 36, h1, pastel[Math.floor(rnd() * pastel.length)]));
      if (Math.abs(p) < H + 30) {
        blds.push(building(-H - 22, p, 36, 36, h2, pastel[Math.floor(rnd() * pastel.length)]));
        blds.push(building(H + 22, p, 36, 36, h3, pastel[Math.floor(rnd() * pastel.length)]));
      }
    }
    const walkMesh = new T.Mesh(mergeColored(walks), new T.MeshLambertMaterial({ vertexColors: true }));
    walkMesh.receiveShadow = true; scene.add(walkMesh);
    const wt = windowTextures();
    const bldMesh = new T.Mesh(mergeColored(blds), new T.MeshLambertMaterial({ vertexColors: true, map: wt.wall, emissiveMap: wt.glow, emissive: 0xffffff, emissiveIntensity: 0.85 }));
    bldMesh.castShadow = true; bldMesh.receiveShadow = true; scene.add(bldMesh);

    // rooftop water tanks
    const tankGeo = new T.CylinderGeometry(1.1, 1.1, 1.8, 10); tankGeo.translate(0, 0.9, 0);
    const tankMesh = new T.InstancedMesh(tankGeo, new T.MeshLambertMaterial({ color: 0x1b1d1f }), tanks.length);
    const m = new T.Matrix4();
    tanks.forEach((t, k) => { m.makeTranslation(t[0], t[1], t[2]); tankMesh.setMatrixAt(k, m); });
    scene.add(tankMesh);

    // plaza: paving, monument, flags
    const pave = SM.canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#c9b89a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(80,60,40,0.35)'; g.lineWidth = 2;
      for (let k = 0; k <= 128; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, h); g.moveTo(0, k); g.lineTo(w, k); g.stroke(); }
    });
    pave.wrapS = pave.wrapT = T.RepeatWrapping; pave.repeat.set(16, 16);
    const plaza = new T.Mesh(new T.PlaneGeometry(B, B).rotateX(-Math.PI / 2), new T.MeshLambertMaterial({ map: pave }));
    plaza.position.set(pcx, 0.03, pcz); plaza.receiveShadow = true; scene.add(plaza);
    const stone = new T.MeshLambertMaterial({ color: 0xd8d2c2 });
    const ped = new T.Mesh(new T.BoxGeometry(5, 2, 5), stone); ped.position.set(pcx, 1, pcz); ped.castShadow = true; scene.add(ped);
    const obel = new T.Mesh(new T.CylinderGeometry(0.6, 1.4, 12, 4), stone); obel.position.set(pcx, 8, pcz); obel.rotation.y = Math.PI / 4; obel.castShadow = true; scene.add(obel);
    const flagTex = SM.canvasTex(256, 128, SM.drawJamaicaFlag);
    const flags = [];
    for (const [dx, dz] of [[-2.9, -2.9], [2.9, 2.9]]) {
      const pole = new T.Mesh(new T.CylinderGeometry(0.07, 0.09, 9, 6), new T.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.7, roughness: 0.3 }));
      pole.position.set(pcx + dx, 4.5, pcz + dz); scene.add(pole);
      const fg = new T.PlaneGeometry(3.2, 1.6, 10, 3); fg.translate(1.6, 0, 0);
      const f = new T.Mesh(fg, new T.MeshLambertMaterial({ map: flagTex, side: T.DoubleSide })); f.position.set(pcx + dx, 8.1, pcz + dz); scene.add(f);
      flags.push({ geo: fg, base: Float32Array.from(fg.attributes.position.array), ph: rnd() * 6 });
    }

    // street lights and palms on the sidewalks
    const poleGeo = SM.mergeGeos([new T.CylinderGeometry(0.1, 0.14, 7, 6).translate(0, 3.5, 0), new T.BoxGeometry(0.1, 0.1, 1.6).translate(0, 6.9, 0.75)]);
    const lampGeo = new T.BoxGeometry(0.5, 0.18, 0.7).translate(0, 6.8, 1.45);
    const lightSpots = [], palmSpots = [];
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      if (i === PLAZA.i && j === PLAZA.j) continue;
      const b = block(i, j);
      for (const t of [0.25, 0.75]) {
        lightSpots.push([b.x0 + B * t, b.z0 + 1.2, Math.PI]); lightSpots.push([b.x0 + B * t, b.z1 - 1.2, 0]);
        lightSpots.push([b.x0 + 1.2, b.z0 + B * t, -Math.PI / 2]); lightSpots.push([b.x1 - 1.2, b.z0 + B * t, Math.PI / 2]);
      }
      if (rnd() < 0.45) for (const [x, z] of [[b.x0 + 1.6, b.z0 + 1.6], [b.x1 - 1.6, b.z1 - 1.6]]) palmSpots.push([x, z]);
    }
    const poles = new T.InstancedMesh(poleGeo, new T.MeshLambertMaterial({ color: 0x2c3034 }), lightSpots.length);
    const lamps = new T.InstancedMesh(lampGeo, new T.MeshBasicMaterial({ color: 0xffe2a8 }), lightSpots.length);
    const q = new T.Quaternion(), up = new T.Vector3(0, 1, 0), one = new T.Vector3(1, 1, 1), ps = new T.Vector3();
    lightSpots.forEach((s, k) => { q.setFromAxisAngle(up, s[2]); ps.set(s[0], 0.25, s[1]); m.compose(ps, q, one); poles.setMatrixAt(k, m); lamps.setMatrixAt(k, m); });
    scene.add(poles, lamps);
    const pg = SM.palmGeos();
    const trunks = new T.InstancedMesh(pg.trunk, new T.MeshLambertMaterial({ color: 0x8a6a45 }), palmSpots.length);
    const fronds = new T.InstancedMesh(pg.fronds, new T.MeshLambertMaterial({ color: 0x2f8a3a, side: T.DoubleSide }), palmSpots.length);
    palmSpots.forEach((s, k) => { q.setFromAxisAngle(up, rnd() * 6); const sc2 = 0.8 + rnd() * 0.3; ps.set(s[0], 0.2, s[1]); m.compose(ps, q, new T.Vector3(sc2, sc2, sc2)); trunks.setMatrixAt(k, m); fronds.setMatrixAt(k, m); });
    trunks.castShadow = fronds.castShadow = true;
    scene.add(trunks, fronds);

    // shop signs on street-facing walls
    const names = [['PATTY SHOP', '#d7192a'], ['JERK CENTRE', '#0d6b34'], ['RUM BAR', '#5b2a86'], ['BARBER SHOP', '#1f5fa8'], ['HARDWARE', '#b35a00'],
      ['BAKERY · HARD DOUGH', '#8a4b2a'], ['SOUND SYSTEM FRIDAY', '#111'], ['ACKEE & SALTFISH', '#c48a00'], ['PHONE CARDS', '#0b7a8a'], ['ICE COLD SKY JUICE', '#d14a8a']];
    const signTex = names.map(([t, bg]) => SM.canvasTex(512, 96, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = '#fed100'; g.fillRect(0, h - 10, w, 10);
      g.fillStyle = '#fff'; g.font = '400 46px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, w / 2, h / 2 - 3, w - 24);
    }));
    let si = 0;
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      if ((i === PLAZA.i && j === PLAZA.j) || rnd() < 0.35) continue;
      const b = block(i, j), side = Math.floor(rnd() * 4);
      const sg = new T.Mesh(new T.PlaneGeometry(9, 1.7), new T.MeshBasicMaterial({ map: signTex[si++ % signTex.length] }));
      const off = 3.5 + 0.9, t = 0.3 + rnd() * 0.4;
      if (side === 0) { sg.position.set(b.x0 + B * t, 4.2, b.z0 + off); sg.rotation.y = Math.PI; }
      else if (side === 1) { sg.position.set(b.x0 + B * t, 4.2, b.z1 - off); }
      else if (side === 2) { sg.position.set(b.x0 + off, 4.2, b.z0 + B * t); sg.rotation.y = -Math.PI / 2; }
      else { sg.position.set(b.x1 - off, 4.2, b.z0 + B * t); sg.rotation.y = Math.PI / 2; }
      scene.add(sg);
    }

    // harbour: seawall, pier with containers, cranes, ship
    const wall = new T.Mesh(new T.BoxGeometry(L + 700, 1.2, 1.2), new T.MeshLambertMaterial({ color: 0x8d8a83 }));
    wall.position.set(0, 0.6, H + 3.4); scene.add(wall);
    const pier = new T.Mesh(new T.BoxGeometry(520, 2.4, 120), new T.MeshLambertMaterial({ color: 0x77736c }));
    pier.position.set(180, 0, H + 160); scene.add(pier);
    const cont = [], ccols = ['#c0392b', '#1f6fb2', '#e67e22', '#27ae60', '#f1c40f', '#7f8c8d', '#8e44ad'];
    for (let k = 0; k < 90; k++) {
      const x = -60 + Math.floor(k / 9) * 48 + (rnd() - 0.5) * 4, z = H + 120 + (k % 3) * 14, y = 1.2 + Math.floor((k % 9) / 3) * 2.6;
      cont.push(tint(new T.BoxGeometry(12, 2.6, 2.5).translate(x, y + 1.3, z + Math.floor((k % 9) / 3) * 0.1), ccols[Math.floor(rnd() * ccols.length)]));
    }
    scene.add(new T.Mesh(mergeColored(cont), new T.MeshLambertMaterial({ vertexColors: true })));
    const craneMat = new T.MeshLambertMaterial({ color: 0xd94a2b });
    for (const cx of [40, 170, 300]) {
      const cr = [];
      for (const lx of [-8, 8]) for (const lz of [-8, 8]) cr.push(new T.BoxGeometry(1.2, 40, 1.2).translate(cx + lx, 20, H + 205 + lz));
      cr.push(new T.BoxGeometry(18, 2.4, 2.4).translate(cx, 40, H + 197));
      cr.push(new T.BoxGeometry(2.6, 2.6, 110).translate(cx, 42, H + 175));
      scene.add(new T.Mesh(SM.mergeGeos(cr), craneMat));
    }
    const ship = new T.Mesh(new T.BoxGeometry(30, 10, 170), new T.MeshLambertMaterial({ color: 0x24313f }));
    ship.position.set(470, 2, H + 260); scene.add(ship);

    // Blue Mountains to the north
    const mg = new T.PlaneGeometry(5200, 1100, 140, 34); mg.rotateX(-Math.PI / 2);
    const mp = mg.attributes.position, mc = new Float32Array(mp.count * 3), green = new T.Color('#2f5c45'), haze = new T.Color('#6d7ea8');
    for (let i = 0; i < mp.count; i++) {
      const x = mp.getX(i), z = mp.getZ(i), t = (550 - z) / 1100;
      const hgt = Math.max(0, (Math.sin(x / 310) * 0.5 + 0.5) * 260 + Math.sin(x / 97 + 1) * 70 + Math.sin(x / 41) * 25 + 140) * Math.sin(Math.PI * clamp(t, 0, 1));
      mp.setY(i, hgt);
      c.copy(green).lerp(haze, clamp(hgt / 420, 0, 1)); mc[i * 3] = c.r; mc[i * 3 + 1] = c.g; mc[i * 3 + 2] = c.b;
    }
    mg.setAttribute('color', new T.BufferAttribute(mc, 3)); mg.computeVertexNormals();
    const mtn = new T.Mesh(mg, new T.MeshLambertMaterial({ vertexColors: true })); mtn.position.set(0, -4, -H - 900); scene.add(mtn);

    // lights
    scene.add(new T.HemisphereLight(0xffd2a6, 0x48475a, 0.72));
    const sun = new T.DirectionalLight(0xffc285, 1.0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sh = sun.shadow.camera; sh.left = -80; sh.right = 80; sh.top = 80; sh.bottom = -80; sh.near = 10; sh.far = 800;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    try {
      const pm = new T.PMREMGenerator(renderer), env = new T.Scene();
      env.add(sky.clone());
      const gnd = new T.Mesh(new T.CircleGeometry(4000, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x3b3a40 }));
      gnd.position.y = -60; env.add(gnd);
      scene.environment = pm.fromScene(env, 0.02, 1, 10000).texture; pm.dispose();
    } catch (e) { /* flatter metals */ }
    const fogC = new T.Color('#e8a37e');
    scene.background = fogC; scene.fog = new T.Fog(fogC, 200, 1500);

    return {
      sun, sunDir,
      update(t, camPos) {
        sky.position.copy(camPos);
        for (const f of flags) {
          const a = f.geo.attributes.position, b = f.base;
          for (let i = 0; i < a.count; i++) { const x = b[i * 3]; a.array[i * 3 + 2] = Math.sin(x * 1.8 - t * 6 + f.ph) * 0.26 * (x / 3.2); }
          a.needsUpdate = true;
        }
      }
    };
  }
  SM.buildCity = buildCity;
})();
