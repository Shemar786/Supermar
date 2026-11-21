/* Supermar — input (keyboard, gamepad, touch), HUD, minimap and overlays */
(function () {
  'use strict';
  const SM = window.SM;
  const $ = id => document.getElementById(id);

  // ---------------- input ----------------
  const keys = {}, touch = { left: 0, right: 0, gas: 0, brake: 0, drift: 0, nitro: 0 };
  const MAP = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right', Space: 'drift', ShiftLeft: 'nitro', ShiftRight: 'nitro', KeyN: 'nitro'
  };
  const once = {};
  SM.onKey = (code, fn) => { once[code] = fn; };

  window.addEventListener('keydown', e => {
    if (SM.menuKey && SM.menuKey(e.code)) { e.preventDefault(); return; }
    const k = MAP[e.code];
    if (k) { keys[k] = true; e.preventDefault(); return; }
    if (!e.repeat && once[e.code]) { once[e.code](); e.preventDefault(); }
  });
  window.addEventListener('keyup', e => { const k = MAP[e.code]; if (k) { keys[k] = false; e.preventDefault(); } });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  let padPrev = {};
  SM.input = {
    read() {
      let steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + touch.right - touch.left;
      let throttle = keys.up || touch.gas ? 1 : 0;
      let brake = keys.down || touch.brake ? 1 : 0;
      let drift = !!(keys.drift || touch.drift), nitro = !!(keys.nitro || touch.nitro);
      let pads = [];
      try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { pads = []; }
      for (const gp of pads || []) {
        if (!gp) continue;
        const ax = gp.axes[0] || 0;
        if (Math.abs(ax) > 0.12) steer = Math.sign(ax) * Math.pow((Math.abs(ax) - 0.12) / 0.88, 1.4);
        const b = i => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0);
        if (b(14)) steer = -1; if (b(15)) steer = 1;
        throttle = Math.max(throttle, b(7)); brake = Math.max(brake, b(6));
        if (b(0) > 0.5) nitro = true;
        if (b(1) > 0.5 || b(2) > 0.5 || b(5) > 0.5) drift = true;
        const start = b(9) > 0.5, cam = b(3) > 0.5;
        if (start && !padPrev.start && once.Escape) once.Escape();
        if (cam && !padPrev.cam && once.KeyC) once.KeyC();
        padPrev = { start, cam };
        break;
      }
      return { steer: Math.max(-1, Math.min(1, steer)), throttle, brake, drift, nitro };
    }
  };

  function bindTouch() {
    document.querySelectorAll('[data-k]').forEach(el => {
      const k = el.dataset.k;
      const on = e => { e.preventDefault(); touch[k] = 1; el.classList.add('down'); try { el.setPointerCapture(e.pointerId); } catch (_) {} };
      const off = e => { touch[k] = 0; el.classList.remove('down'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    });
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) document.body.classList.add('touch');
    window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
  }

  // ---------------- formatting ----------------
  const fmt = t => {
    if (!isFinite(t) || t <= 0) return '–:––.––';
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  };
  const clamp01 = v => Math.max(0, Math.min(1, v));
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)] || 'th');
  SM.fmt = fmt; SM.ord = ord;

  // ---------------- minimap ----------------
  let mm = null;
  function initMinimap(kind) {
    const cv = $('minimap'), tr = SM.track, city = kind === 'city';
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = 168;
    cv.width = size * dpr; cv.height = size * dpr;
    cv.classList.toggle('square', city);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    if (city) { minX = minZ = -SM.city.H; maxX = maxZ = SM.city.H; }
    else tr.pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
    const pad = city ? 6 : 14, sc = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = pad + ((size - pad * 2) - (maxX - minX) * sc) / 2, oz = pad + ((size - pad * 2) - (maxZ - minZ) * sc) / 2;
    // east (the sea) on the right, north up: screen x = world x, screen y = world z
    const map = (x, z) => [(ox + (x - minX) * sc) * dpr, (oz + (z - minZ) * sc) * dpr];
    const base = document.createElement('canvas'); base.width = cv.width; base.height = cv.height;
    const g = base.getContext('2d');
    if (city) {
      const [ax, ay] = map(minX, minZ), [bx, by] = map(maxX, maxZ);
      g.fillStyle = '#5a5e66'; g.fillRect(ax, ay, bx - ax, by - ay);
      g.fillStyle = 'rgba(10,16,13,0.96)';
      for (const R of SM.city.rects) { const [x0, y0] = map(R.x0, R.z0), [x1, y1] = map(R.x1, R.z1); g.fillRect(x0, y0, x1 - x0, y1 - y0); }
      const pb = SM.city.plaza.b, [px0, py0] = map(pb.x0, pb.z0), [px1, py1] = map(pb.x1, pb.z1);
      g.fillStyle = '#8a7a5c'; g.fillRect(px0, py0, px1 - px0, py1 - py0);
      g.fillStyle = '#1d6f8a'; g.fillRect(ax, by, bx - ax, cv.height - by);
      mm = { cv, ctx: cv.getContext('2d'), base, map, dpr };
      return;
    }
    const path = () => { g.beginPath(); tr.pts.forEach((p, i) => { const [x, y] = map(p.x, p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
    g.lineJoin = 'round';
    path(); g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9 * dpr; g.stroke();
    path(); g.strokeStyle = '#e9efe6'; g.lineWidth = 3.5 * dpr; g.stroke();
    const [sx, sy] = map(tr.pts[0].x, tr.pts[0].z);
    g.fillStyle = '#fed100'; g.fillRect(sx - 5 * dpr, sy - 1.5 * dpr, 10 * dpr, 3 * dpr);
    mm = { cv, ctx: cv.getContext('2d'), base, map, dpr };
  }
  function drawMinimap(cars, player, goal) {
    if (!mm) return;
    const g = mm.ctx; g.clearRect(0, 0, mm.cv.width, mm.cv.height); g.drawImage(mm.base, 0, 0);
    if (goal) {
      const [x, y] = mm.map(goal.x, goal.z), r = 8 * mm.dpr;
      g.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = '#fed100'; g.fill(); g.lineWidth = 1.5 * mm.dpr; g.strokeStyle = '#0b0f0c'; g.stroke();
    }
    for (const c of cars) {
      if (c === player) continue;
      const [x, y] = mm.map(c.x, c.z);
      g.beginPath(); g.arc(x, y, 4 * mm.dpr, 0, Math.PI * 2); g.fillStyle = c.color; g.fill();
      g.lineWidth = 1.5 * mm.dpr; g.strokeStyle = '#0b0f0c'; g.stroke();
    }
    const [x, y] = mm.map(player.x, player.z);
    g.save(); g.translate(x, y); g.rotate(-player.h + Math.PI);
    g.beginPath(); g.moveTo(0, -8 * mm.dpr); g.lineTo(5.5 * mm.dpr, 6 * mm.dpr); g.lineTo(-5.5 * mm.dpr, 6 * mm.dpr); g.closePath();
    g.fillStyle = '#d7192a'; g.fill(); g.lineWidth = 2 * mm.dpr; g.strokeStyle = '#ffffff'; g.stroke();
    g.restore();
  }

  // ---------------- HUD ----------------
  let boardT = 0, flashT = 0;
  const ui = (SM.ui = {
    init() {
      bindTouch();
      const segs = $('rpmSegs');
      for (let i = 0; i < 18; i++) { const s = document.createElement('i'); if (i >= 15) s.className = 'red'; segs.appendChild(s); }
    },
    setMinimap: initMinimap,
    show(id, on) { $(id).hidden = !on; },
    hud(d, dt) {
      $('posNum').textContent = d.pos;
      $('posSuf').textContent = ord(d.pos).slice(String(d.pos).length);
      $('lapNum').textContent = Math.min(d.laps, Math.max(1, d.lap)) + '/' + d.laps;
      $('raceTime').textContent = fmt(d.time);
      $('bestLap').textContent = fmt(d.best);
      boardT -= dt;
      if (boardT <= 0) { boardT = 0.25; ui.board(d.board); }
      ui.speedo(d, dt);
    },
    chaseHud(d, s, dt) {
      $('score').textContent = s.score.toLocaleString('en-US');
      $('mult').textContent = '×' + s.mult;
      $('mult').classList.toggle('hot', s.mult > 1);
      $('comboFill').style.transform = 'scaleX(' + clamp01(s.comboT).toFixed(3) + ')';
      const stars = $('heat').children;
      for (let i = 0; i < stars.length; i++) stars[i].classList.toggle('on', i < s.heat);
      $('status').textContent = s.status;
      $('status').className = /PURSUIT|BUSTED/.test(s.status) ? 'red' : /WON|HIDDEN/.test(s.status) ? 'gold' : 'blue';
      $('chaseTime').textContent = fmt(s.time).replace(/\.\d+$/, '');
      $('smashed').textContent = s.smashed;
      $('copCount').textContent = s.police;
      $('bustFill').style.transform = 'scaleX(' + clamp01(s.bust).toFixed(3) + ')';
      $('bustRow').classList.toggle('warn', s.bust > 0.02);
      $('eagleFill').style.transform = 'scaleX(' + clamp01(s.eagle).toFixed(3) + ')';
      $('eagleLabel').textContent = s.eagleOn ? 'Golden Eagle is out. Grab it to win.' : 'Golden Eagle at ' + s.target.toLocaleString('en-US') + ' points';
      const goal = $('goal');
      goal.hidden = !s.goal;
      if (s.goal) {
        $('goalArrow').style.transform = 'rotate(' + (-s.goal.angle).toFixed(3) + 'rad)';
        $('goalDist').textContent = Math.round(s.goal.dist) + ' m';
      }
      ui.speedo(d, dt);
    },
    speedo(d, dt) {
      $('speed').textContent = Math.round(d.kmh);
      $('gear').textContent = d.gear === 0 ? 'R' : d.gear;
      const lit = Math.round((d.rpm / 9200) * 18);
      const segs = $('rpmSegs').children;
      for (let i = 0; i < segs.length; i++) segs[i].classList.toggle('on', i < lit);
      $('nitroFill').style.transform = 'scaleX(' + d.nitro.toFixed(3) + ')';
      $('nitroBar').classList.toggle('boost', d.boosting);
      $('nitroBar').classList.toggle('full', d.nitro > 0.98);
      $('tags').textContent = d.draft ? 'SLIPSTREAM' : d.drifting ? 'DRIFT ' + d.driftTime.toFixed(1) + 's' : '';
      $('wrong').hidden = !d.wrong;
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) $('flash').classList.remove('on'); }
    },
    pop(text, cls) {
      const box = $('pops'), el = document.createElement('div');
      el.className = 'popline ' + (cls || ''); el.textContent = text;
      box.appendChild(el);
      while (box.children.length > 4) box.removeChild(box.firstChild);
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1600);
    },
    chaseEnd(s, best) {
      $('endTitle').textContent = s.won ? 'You win. The Golden Eagle is yours.' : 'Busted.';
      $('endSub').textContent = s.won ? 'You grabbed the trophy with every police car in Kingston on your tail.' : 'The police boxed you in. Keep moving, and break line of sight to shake them.';
      $('endScore').textContent = s.score.toLocaleString('en-US');
      $('endTime').textContent = fmt(s.time).replace(/\.\d+$/, '');
      $('endSmashed').textContent = s.smashed;
      $('endHeat').textContent = s.heat + ' of 5';
      $('endBest').textContent = best.toLocaleString('en-US');
      $('chaseEnd').classList.toggle('won', s.won);
    },
    board(rows) {
      $('board').innerHTML = rows.map((r, i) =>
        '<li class="' + (r.isPlayer ? 'me' : '') + '"><b>' + (i + 1) + '</b><span class="chip" style="background:' + r.color + '"></span><span class="nm">' +
        r.name + '</span><span class="gap">' + r.gap + '</span></li>').join('');
    },
    flash(text, cls) {
      const el = $('flash'); el.textContent = text; el.className = 'on ' + (cls || ''); flashT = 1.3;
    },
    count(text, cls) {
      const el = $('count'); el.textContent = text; el.className = '';
      void el.offsetWidth; el.className = 'pop ' + (cls || '');
    },
    minimap: drawMinimap,
    results(rows, player, laps) {
      const me = rows.findIndex(r => r.isPlayer) + 1;
      $('resTitle').textContent = me === 1 ? 'You win. Supermar rules the coast.' : 'You finished ' + ord(me) + '.';
      $('resSub').textContent = laps + ' laps · best lap ' + fmt(player.bestLap) + ' · race ' + fmt(player.finishTime);
      $('resBody').innerHTML = rows.map((r, i) =>
        '<tr class="' + (r.isPlayer ? 'me' : '') + '"><td>' + (i + 1) + '</td><td><span class="chip" style="background:' + r.color + '"></span>' + r.name +
        '</td><td>' + r.car + '</td><td class="num">' + r.time + '</td></tr>').join('');
    }
  });
})();
