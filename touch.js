/* Supermar — phone support: always-landscape view, steering wheel, tilt steering and slide-friendly pedals.
   Tilt reads how far the screen's right edge has dropped, so it works with the phone held upright or tipped back. */
(function () {
  'use strict';
  const SM = window.SM;
  const $ = id => document.getElementById(id);
  const clamp = SM.clamp;
  const D2R = Math.PI / 180;

  const mq = q => { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  const coarse = mq('(pointer: coarse)');
  const phone = coarse && Math.min(screen.width, screen.height) < 600;

  // ---------------- landscape ----------------
  // SM.view is the game's own width and height. A phone held upright gets the whole game turned 90°.
  const view = (SM.view = { w: window.innerWidth, h: window.innerHeight, rot: false });
  function layout() {
    const W = window.innerWidth, H = window.innerHeight, app = $('app');
    const rot = phone && H > W;
    view.rot = rot; view.w = rot ? H : W; view.h = rot ? W : H;
    document.body.classList.toggle('rot', rot);
    if (app) { app.style.width = rot ? H + 'px' : ''; app.style.height = rot ? W + 'px' : ''; }
  }

  // Android: full screen plus a landscape lock. iPhone has neither, so the turned view above covers it.
  function landscape() {
    if (!phone) return;
    const lock = () => {
      try { const p = screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not supported */ }
    };
    const de = document.documentElement, req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (document.fullscreenElement || document.webkitFullscreenElement || !req) { lock(); return; }
    try {
      const p = req.call(de, { navigationUI: 'hide' });
      if (p && p.then) p.then(lock, () => {}); else setTimeout(lock, 200);
    } catch (e) { /* refused */ }
  }

  // ---------------- steering response ----------------
  const WHEEL_PX = 64;                 // thumb travel for full lock on the wheel
  const TILT_DEAD = 2.5, TILT_FULL = 24; // degrees
  const curve = s => s * (0.55 + 0.45 * s); // finer near the centre, full lock at the end

  // ---------------- tilt ----------------
  const tilt = { live: false, raw: 0, neutral: 0, val: 0, center: false };
  function screenAngle() {
    let a = typeof window.orientation === 'number' ? window.orientation
      : (screen.orientation && typeof screen.orientation.angle === 'number' ? screen.orientation.angle : 0);
    if (view.rot) a += 90;
    return a * D2R;
  }
  function onTilt(e) {
    if (e.beta == null || e.gamma == null) return;
    tilt.live = true;
    const b = e.beta * D2R, g = e.gamma * D2R, a = screenAngle();
    // world "up" in the phone's own axes, then how much of it points at the screen's right edge
    const ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b);
    const toRight = ux * Math.cos(a) - uy * Math.sin(a);
    tilt.raw = Math.asin(clamp(-toRight, -1, 1)) / D2R;
    if (tilt.center) { tilt.center = false; tilt.neutral = Math.abs(tilt.raw) < 12 ? tilt.raw : 0; }
  }
  window.addEventListener('deviceorientation', onTilt);
  function askTilt() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return Promise.resolve(false);
    if (typeof DOE.requestPermission !== 'function') return Promise.resolve(true);
    let p;
    try { p = DOE.requestPermission(); } catch (e) { return Promise.resolve(false); }
    return Promise.resolve(p).then(r => {
      if (r === 'granted') window.addEventListener('deviceorientation', onTilt);
      return r === 'granted';
    }, () => false);
  }
  function tiltTarget() {
    const a = tilt.raw - tilt.neutral;
    return Math.sign(a) * curve(clamp((Math.abs(a) - TILT_DEAD) / (TILT_FULL - TILT_DEAD), 0, 1));
  }

  // ---------------- buttons and wheel ----------------
  const down = { left: 0, right: 0, gas: 0, brake: 0, drift: 0, nitro: 0 };
  const ptrs = new Map();             // pointerId -> { el } for a button, { wheel: true } for the wheel
  const wheel = { id: null, x0: 0, val: 0 };
  let mode = 'tilt', shown = 999, lastRead = performance.now();

  // the game's own coordinates for a pointer, which differ from the screen's when the view is turned
  const local = e => (view.rot ? { x: e.clientY, y: window.innerWidth - e.clientX } : { x: e.clientX, y: e.clientY });

  function buttonAt(e, prev) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const b = el && el.closest ? el.closest('#touch [data-k]') : null;
    if (b) return b;
    // a thumb sliding just off the edge keeps the button it was on
    if (prev) {
      const r = prev.getBoundingClientRect(), m = 24;
      if (e.clientX > r.left - m && e.clientX < r.right + m && e.clientY > r.top - m && e.clientY < r.bottom + m) return prev;
    }
    return null;
  }
  function sync() {
    for (const k in down) down[k] = 0;
    for (const p of ptrs.values()) if (p.el) down[p.el.dataset.k] = 1;
    document.querySelectorAll('#touch [data-k]').forEach(el => el.classList.toggle('down', !!down[el.dataset.k]));
  }
  function releaseAll() {
    ptrs.clear(); wheel.id = null; wheel.val = 0;
    const z = $('steerZone'); if (z) z.classList.remove('down');
    sync();
  }

  function bind() {
    const box = $('touch'), zone = $('steerZone');
    box.addEventListener('pointerdown', e => {
      if (zone && e.target.closest('#steerZone') && mode !== 'buttons') {
        e.preventDefault();
        if (wheel.id !== null) return;
        wheel.id = e.pointerId; wheel.x0 = local(e).x; wheel.val = 0;
        ptrs.set(e.pointerId, { wheel: true });
        zone.classList.add('down');
        return;
      }
      const el = buttonAt(e, null);
      if (!el) return;
      e.preventDefault();
      ptrs.set(e.pointerId, { el });
      sync();
    });
    box.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      if (p.wheel) {
        const s = clamp((local(e).x - wheel.x0) / WHEEL_PX, -1, 1);
        wheel.val = Math.sign(s) * curve(Math.abs(s));
        return;
      }
      const el = buttonAt(e, p.el);
      if (el !== p.el) { p.el = el; sync(); }
    });
    const end = e => {
      const p = ptrs.get(e.pointerId);
      if (!p) return;
      ptrs.delete(e.pointerId);
      if (p.wheel) { wheel.id = null; wheel.val = 0; if (zone) zone.classList.remove('down'); }
      else sync();
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    box.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  }

  SM.touch = {
    phone,
    layout,
    landscape,
    askTilt,
    active: () => document.body.classList.contains('touch'),
    tiltLive: () => tilt.live,
    recenter() { tilt.center = true; tilt.val = 0; },
    setMode(m) {
      mode = m;
      ['tilt', 'wheel', 'buttons'].forEach(n => document.body.classList.toggle('steer-' + n, n === m));
      releaseAll();
    },
    init() {
      if (coarse) document.body.classList.add('touch');
      window.addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true, passive: true });
      // the first tap anywhere is the earliest moment a phone allows full screen
      window.addEventListener('pointerup', landscape, { once: true });
      bind(); layout();
    },
    read() {
      const now = performance.now(), dt = Math.min(0.1, (now - lastRead) / 1000);
      lastRead = now;
      if (mode === 'tilt' && tilt.live) tilt.val += (tiltTarget() - tilt.val) * (1 - Math.exp(-dt * 22));
      else tilt.val = 0;
      let steer = down.right - down.left;
      if (mode !== 'buttons') steer += wheel.id !== null ? wheel.val : tilt.val;
      steer = clamp(steer, -1, 1);
      // the wheel on screen shows what the car is getting, tilt included
      const deg = Math.round(steer * 120);
      if (deg !== shown) { shown = deg; const w = $('wheel'); if (w) w.style.transform = 'rotate(' + deg + 'deg)'; }
      // DRIFT and NITRO keep the gas on, so one thumb can drive
      const go = down.drift || down.nitro;
      return { steer, throttle: down.gas || go ? 1 : 0, brake: down.brake, drift: !!down.drift, nitro: !!down.nitro };
    }
  };
})();
