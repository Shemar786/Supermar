/* Supermar — car models. Local space: +z is forward, +y up, +x is the car's left. */
(function () {
  'use strict';
  const SM = window.SM;
  const T = THREE;

  const tireGeo = new T.CylinderGeometry(0.42, 0.42, 0.34, 22); tireGeo.rotateZ(Math.PI / 2);
  const rimGeo = new T.CylinderGeometry(0.27, 0.27, 0.36, 12); rimGeo.rotateZ(Math.PI / 2);
  const spokeGeo = new T.BoxGeometry(0.37, 0.07, 0.48);
  const tireMat = new T.MeshStandardMaterial({ color: 0x141414, roughness: 0.92 });

  function std(color, metal, rough, extra) {
    return new T.MeshStandardMaterial(Object.assign({ color, metalness: metal, roughness: rough }, extra || {}));
  }
  function box(w, h, l, mat, x, y, z) {
    const m = new T.Mesh(new T.BoxGeometry(w, h, l), mat);
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m;
  }
  function wheel(rimMat) {
    const g = new T.Group();
    const t = new T.Mesh(tireGeo, tireMat); t.castShadow = true; g.add(t);
    g.add(new T.Mesh(rimGeo, rimMat));
    for (let k = 0; k < 3; k++) { const s = new T.Mesh(spokeGeo, rimMat); s.rotation.x = k * Math.PI / 3; g.add(s); }
    return g;
  }
  function addWheels(car, rimMat, track, base, front) {
    const out = { spin: [], pivots: [] };
    [[1, front], [-1, front], [1, -base], [-1, -base]].forEach(([sx, z], i) => {
      const pivot = new T.Group(); pivot.position.set(sx * track, 0.42, z);
      const w = wheel(rimMat); pivot.add(w); car.add(pivot);
      out.spin.push(w); if (i < 2) out.pivots.push(pivot);
    });
    return out;
  }
  function plateTexture(text, bg, fg) {
    return SM.canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.fillStyle = fg; g.font = '900 34px Bungee, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, h / 2 + 2, w - 12);
    });
  }

  // ---------------- SUPERMAR ----------------
  SM.makeSupermar = function () {
    const root = new T.Group();
    const body = new T.Group(); root.add(body);
    const red = std(0xd0111f, 0.55, 0.26);
    const deepRed = std(0x7d0814, 0.45, 0.35);
    const black = std(0x111214, 0.35, 0.45);
    const chrome = std(0xe3e7ec, 1.0, 0.16);
    const gold = std(0xf2b705, 0.65, 0.28);
    const white = std(0xf3f1ea, 0.2, 0.4);
    const glass = std(0x0b141d, 0.9, 0.06);

    // rectangular shell: lower tub, upper deck, cabin
    body.add(box(2.02, 0.5, 4.7, red, 0, 0.6, 0));
    body.add(box(1.92, 0.16, 4.55, red, 0, 0.93, -0.02));
    body.add(box(2.06, 0.14, 4.72, black, 0, 0.36, 0));             // side skirts
    body.add(box(1.5, 0.44, 1.8, glass, 0, 1.22, 0.35));            // cabin glass
    body.add(box(1.54, 0.07, 1.55, red, 0, 1.47, 0.3));             // roof
    body.add(box(0.1, 0.06, 1.5, gold, 0, 1.52, 0.3));              // gold spine down the roof

    // eagle face: fierce slanted headlight eyes, brows, hooked gold beak
    const eyeMat = new T.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff0c0, emissiveIntensity: 1.2 });
    for (const s of [-1, 1]) {
      const eye = box(0.56, 0.11, 0.06, eyeMat, s * 0.6, 0.76, 2.36); eye.rotation.z = s * -0.28; body.add(eye);
      const brow = box(0.66, 0.08, 0.12, black, s * 0.58, 0.88, 2.34); brow.rotation.z = s * -0.42; body.add(brow);
    }
    const beakGeo = new T.ConeGeometry(0.24, 0.85, 4); beakGeo.rotateX(Math.PI / 2);
    const beak = new T.Mesh(beakGeo, gold); beak.position.set(0, 0.66, 2.62); beak.rotation.x = 0.38; beak.scale.set(1.25, 0.75, 1); beak.castShadow = true;
    body.add(beak);
    body.add(box(1.36, 0.2, 0.06, black, 0, 0.44, 2.36));           // lower grille
    // white crest on the hood like an eagle's head, with feather chevrons
    body.add(box(1.1, 0.03, 0.75, white, 0, 1.02, 1.85));
    for (let k = 0; k < 3; k++) for (const s of [-1, 1]) {
      const f = box(0.5, 0.03, 0.07, deepRed, s * 0.25, 1.035, 1.62 - k * 0.22); f.rotation.y = s * 0.5; body.add(f);
    }

    // swept feather wings along both flanks
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const len = 1.7 - k * 0.2;
        const feather = box(0.07, 0.11, len, k % 2 ? deepRed : red, s * (1.04 + k * 0.025), 0.86 - k * 0.085, 0.55 - k * 0.38);
        feather.rotation.y = s * (0.05 + k * 0.045);
        body.add(feather);
        const tip = box(0.075, 0.11, 0.3, black, 0, 0, -len / 2 - 0.12); feather.add(tip);
      }
    }

    // rear wing shaped like spread eagle wings with primary feathers
    for (const s of [-1, 1]) body.add(box(0.08, 0.42, 0.25, black, s * 0.55, 1.22, -2.05));
    body.add(box(1.8, 0.06, 0.48, red, 0, 1.45, -2.08));
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) {
        const p = box(0.36, 0.045, 0.16 + k * 0.03, k > 1 ? black : deepRed, s * (1.05 + k * 0.17), 1.43 - k * 0.07, -2.08 - k * 0.07);
        p.rotation.y = s * (0.18 + k * 0.12); p.rotation.z = s * (0.12 + k * 0.06);
        body.add(p);
      }
    }
    // white tail-feather fan under the rear
    for (let k = 0; k < 7; k++) {
      const a = (k - 3) * 0.17;
      const f = box(0.13, 0.04, 0.75, white, Math.sin(a) * 0.4, 0.42, -2.55 - Math.cos(a) * 0.12);
      f.rotation.y = a; body.add(f);
    }

    // exposed V16: two banks of eight cylinders in a V
    const capMat = std(0x1b1b1b, 0.5, 0.4);
    const cylGeo = new T.CylinderGeometry(0.075, 0.075, 0.3, 10), capGeo = new T.CylinderGeometry(0.085, 0.085, 0.05, 10);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 8; k++) {
        const c = new T.Mesh(cylGeo, chrome); c.position.set(s * 0.52, 1.08, -0.72 - k * 0.19); c.rotation.z = s * 0.5; body.add(c);
        const cap = new T.Mesh(capGeo, capMat); cap.position.set(0, 0.17, 0); c.add(cap);
      }
      body.add(box(0.08, 0.06, 1.5, gold, s * 0.62, 1.22, -1.38));    // rocker covers
    }
    // the turbo cylinder: big chrome drum on the rear deck, intake facing back
    const turboGeo = new T.CylinderGeometry(0.33, 0.33, 1.3, 28); turboGeo.rotateX(Math.PI / 2);
    const turbo = new T.Mesh(turboGeo, chrome); turbo.position.set(0, 1.2, -1.42); turbo.castShadow = true; body.add(turbo);
    const ringGeo = new T.TorusGeometry(0.335, 0.035, 8, 28);
    for (const z of [-0.85, -1.4, -1.95]) { const r = new T.Mesh(ringGeo, gold); r.position.set(0, 1.2, z); body.add(r); }
    const glowMat = new T.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff5a10, emissiveIntensity: 0.6 });
    const glow = new T.Mesh(new T.CircleGeometry(0.29, 24), glowMat); glow.position.set(0, 1.2, -2.08); glow.rotation.y = Math.PI; body.add(glow);
    const fan = new T.Group(); fan.position.set(0, 1.2, -2.09);
    for (let k = 0; k < 7; k++) { const b = box(0.04, 0.27, 0.02, chrome, 0, 0, 0); b.rotation.z = k * Math.PI * 2 / 7; b.geometry.translate(0, 0.13, 0); fan.add(b); }
    body.add(fan);
    body.add(box(0.12, 0.28, 0.5, chrome, 0, 1.0, -0.85));           // intake neck into the engine

    // rear: tail lights, exhausts, plate
    const tailMat = new T.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 0.5 });
    for (const s of [-1, 1]) body.add(box(0.55, 0.12, 0.05, tailMat, s * 0.68, 0.78, -2.36));
    const exGeo = new T.CylinderGeometry(0.075, 0.09, 0.3, 12); exGeo.rotateX(Math.PI / 2);
    const exhausts = [];
    for (const x of [-0.62, -0.36, 0.36, 0.62]) {
      const e = new T.Mesh(exGeo, chrome); e.position.set(x, 0.52, -2.42); body.add(e);
      exhausts.push(new T.Vector3(x, 0.52, -2.6));
    }
    const plate = new T.Mesh(new T.PlaneGeometry(0.9, 0.22), new T.MeshBasicMaterial({ map: plateTexture('SUPERMAR V16', '#fed100', '#111') }));
    plate.position.set(0, 0.6, -2.37); plate.rotation.y = Math.PI; body.add(plate);

    const wheels = addWheels(root, gold, 1.02, 1.55, 1.55);
    return { root, body, wheels, tailMat, glowMat, fan, exhausts, turboTip: new T.Vector3(0, 1.2, -2.2) };
  };

  // ---------------- RIVALS ----------------
  const STYLES = [
    { cabZ: -0.2, cabL: 1.6, cabH: 0.38, wingH: 0.3, hood: 0.0 },   // wedge
    { cabZ: 0.1, cabL: 1.9, cabH: 0.44, wingH: 0.55, hood: 0.05 },  // GT with tall wing
    { cabZ: -0.45, cabL: 1.7, cabH: 0.46, wingH: 0.0, hood: 0.12 }, // long-hood muscle
    { cabZ: 0.0, cabL: 2.1, cabH: 0.5, wingH: 0.25, hood: 0.0, scoop: true }, // rally
    { cabZ: -0.1, cabL: 1.5, cabH: 0.34, wingH: 0.4, fins: true },  // hyper with fins
  ];

  SM.makeRival = function (hex, style, label) {
    const S = STYLES[style % STYLES.length];
    const root = new T.Group(), body = new T.Group(); root.add(body);
    const paint = std(hex, 0.5, 0.3), trim = std(0x16181b, 0.3, 0.5), glass = std(0x0c151d, 0.9, 0.08);
    const accent = std(new T.Color(hex).getHSL({}).l > 0.6 ? 0x111111 : 0xf3f1ea, 0.3, 0.4);
    body.add(box(1.96, 0.5, 4.5, paint, 0, 0.6, 0));
    body.add(box(2.0, 0.14, 4.52, trim, 0, 0.36, 0));
    if (S.hood) body.add(box(1.0, S.hood, 1.4, paint, 0, 0.9, 1.3));
    body.add(box(1.45, S.cabH, S.cabL, glass, 0, 0.85 + S.cabH / 2, S.cabZ));
    body.add(box(1.48, 0.06, S.cabL * 0.85, paint, 0, 0.88 + S.cabH, S.cabZ));
    body.add(box(0.32, 0.03, 4.4, accent, 0.35, 0.86, 0));
    body.add(box(0.32, 0.03, 4.4, accent, -0.35, 0.86, 0));
    if (S.scoop) body.add(box(0.5, 0.15, 0.5, trim, 0, 0.96 + S.cabH, S.cabZ));
    if (S.wingH > 0) {
      for (const s of [-1, 1]) body.add(box(0.07, S.wingH, 0.2, trim, s * 0.6, 0.85 + S.wingH / 2, -2.0));
      body.add(box(1.9, 0.06, 0.45, paint, 0, 0.88 + S.wingH, -2.02));
    }
    if (S.fins) for (const s of [-1, 1]) body.add(box(0.06, 0.45, 1.3, paint, s * 0.7, 1.08, -1.4));
    const headMat = new T.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2cc, emissiveIntensity: 1 });
    const tailMat = new T.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 0.5 });
    for (const s of [-1, 1]) {
      body.add(box(0.5, 0.12, 0.05, headMat, s * 0.62, 0.72, 2.26));
      body.add(box(0.5, 0.12, 0.05, tailMat, s * 0.62, 0.74, -2.26));
    }
    const wheels = addWheels(root, std(0xb9bec4, 0.9, 0.25), 0.99, 1.5, 1.5);

    // driver name tag
    const tagTex = SM.canvasTex(256, 64, (g, w, h) => {
      g.fillStyle = 'rgba(8,14,10,0.78)'; g.fillRect(0, 8, w, 48);
      g.fillStyle = '#' + new T.Color(hex).getHexString(); g.fillRect(0, 8, 10, 48);
      g.fillStyle = '#ffffff'; g.font = '700 30px "Chakra Petch", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, w / 2 + 5, 33, w - 24);
    });
    const tag = new T.Sprite(new T.SpriteMaterial({ map: tagTex, depthWrite: false, transparent: true }));
    tag.scale.set(3.4, 0.85, 1); tag.position.y = 2.7; root.add(tag);

    return { root, body, wheels, tailMat, tag, exhausts: [new T.Vector3(-0.5, 0.5, -2.35), new T.Vector3(0.5, 0.5, -2.35)] };
  };
})();
