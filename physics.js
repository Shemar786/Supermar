/* Supermar — arcade car physics, track progress, collisions and rival AI.
   Heading h: forward = (sin h, cos h). Steering input > 0 turns right. */
(function () {
  'use strict';
  const SM = window.SM;
  const clamp = SM.clamp;
  const WHEELBASE = 2.8;
  const GEARS = [0, 15, 27, 39, 51, 63, 76, 120];

  SM.steerMax = v => 0.62 / (1 + Math.max(0, v) / 21);

  // drift charge: hold a drift this long to reach each mini-turbo level, which then boosts for TURBO_T seconds
  const DRIFT_TIER_T = [0.6, 1.5, 2.6];
  const TURBO_T = [0, 0.6, 1.0, 1.5];
  SM.driftColors = ['#f2f6ee', '#5fb8ff', '#ffa31a', '#e15bff'];
  SM.TURBO_NAMES = ['', 'MINI TURBO', 'SUPER TURBO', 'ULTRA TURBO'];

  SM.createCar = function (o) {
    return {
      name: o.name, car: o.car, color: o.color, isPlayer: !!o.isPlayer, model: o.model,
      perf: o.perf, x: 0, z: 0, h: 0, vx: 0, vz: 0, steer: 0, yaw: 0,
      idx: 0, lat: 0, lap: -1, prog: 0, finished: false, finishTime: 0, lapStart: 0, bestLap: 0, lastLap: 0,
      nitro: 0.4, boosting: false, drifting: false, driftDir: 0, driftTime: 0, driftTier: 0, miniTurbo: 0, turboTier: 1,
      rpm: 1000, gear: 1, offroad: false, skid: 0, hit: 0, draft: 0, wrongTime: 0, stuck: 0,
      lean: 0, pitch: 0, ax: 0, wheelRot: 0, throttle: 0, braking: false,
      ai: o.ai || null, events: []
    };
  };

  SM.placeCar = function (c, idx, lat) {
    const tr = SM.track, p = tr.pts[idx], r = tr.right[idx], t = tr.tan[idx];
    c.x = p.x + r.x * lat; c.z = p.z + r.z * lat; c.h = Math.atan2(t.x, t.z);
    c.vx = c.vz = 0; c.steer = c.yaw = 0; c.idx = idx;
    c.drifting = false; c.boosting = false; c.miniTurbo = 0; c.stuck = 0;
    SM.updateProgress(c, true);
  };

  SM.respawn = function (c) {
    const lap = c.lap;
    SM.placeCar(c, c.idx, 0);
    c.lap = lap; SM.updateProgress(c);
  };

  SM.stepCar = function (c, dt, inp) {
    const P = c.perf;
    // smooth steering: quick to turn in, quicker to return to centre
    const toward = inp.steer - c.steer;
    const rate = Math.abs(inp.steer) < Math.abs(c.steer) || inp.steer * c.steer < 0 ? 10 : 6;
    c.steer += clamp(toward, -rate * dt, rate * dt);

    let sinH = Math.sin(c.h), cosH = Math.cos(c.h);
    const vF0 = c.vx * sinH + c.vz * cosH;
    const off = !SM.cityMode && Math.abs(c.lat) > SM.track.W / 2 + 1.6;
    c.offroad = off;

    // drift / handbrake
    if (!c.drifting && inp.drift && vF0 > 11 && Math.abs(c.steer) > 0.18) {
      c.drifting = true; c.driftDir = Math.sign(c.steer); c.driftTime = 0; c.driftTier = 0;
    }
    if (c.drifting && (!inp.drift || vF0 < 8)) {
      if (c.driftTier > 0 && vF0 > 8) { c.miniTurbo = TURBO_T[c.driftTier]; c.turboTier = c.driftTier; c.events.push('mini'); }
      c.drifting = false; c.driftTier = 0;
    }
    if (c.drifting) {
      c.driftTime += dt; c.nitro = Math.min(1, c.nitro + 0.2 * dt);
      let tier = 0; while (tier < 3 && c.driftTime >= DRIFT_TIER_T[tier]) tier++;
      if (tier > c.driftTier) { c.driftTier = tier; c.events.push('tier'); }
    }

    // yaw from bicycle model, limited by tyre grip
    const delta = c.steer * SM.steerMax(vF0);
    let yawT = -vF0 * Math.tan(delta) / WHEELBASE;
    const latMax = (off ? 0.72 : 1) * P.grip;
    const maxYaw = latMax / Math.max(5, Math.abs(vF0));
    if (c.drifting) {
      yawT = yawT * 1.3 - c.driftDir * 0.42 * Math.min(1, vF0 / 25);
      yawT = clamp(yawT, -maxYaw * 1.9, maxYaw * 1.9);
    } else yawT = clamp(yawT, -maxYaw, maxYaw);
    c.yaw += (yawT - c.yaw) * (1 - Math.exp(-(c.drifting ? 6 : 11) * dt));
    c.h += c.yaw * dt;

    sinH = Math.sin(c.h); cosH = Math.cos(c.h);
    const fx = sinH, fz = cosH, lx = cosH, lz = -sinH;
    let vF = c.vx * fx + c.vz * fz;
    let vL = c.vx * lx + c.vz * lz;

    // nitro
    c.boosting = !!inp.nitro && c.nitro > 0.01 && vF > 3;
    if (c.boosting) c.nitro = Math.max(0, c.nitro - 0.3 * dt);
    else c.nitro = Math.min(1, c.nitro + 0.012 * dt);
    if (c.miniTurbo > 0) c.miniTurbo = Math.max(0, c.miniTurbo - dt);

    let top = P.top * (off ? 0.5 : 1) + (c.boosting ? P.boostTop : 0) + (c.miniTurbo > 0 ? 7 : 0) + c.draft * 4;
    let ax = 0;
    const thr = inp.throttle, brk = inp.brake;
    if (thr > 0) {
      if (vF < -1) ax += P.brake * thr;
      else {
        const r = clamp(vF / top, 0, 1.3);
        ax += thr * P.accel * Math.max(0, 1 - r * r);
      }
    }
    if (c.boosting) ax += 9;
    if (c.miniTurbo > 0) ax += 7;
    ax += c.draft * 2.5;
    if (brk > 0) {
      if (vF > 1) ax -= P.brake * brk;
      else if (thr === 0) ax -= brk * 9 * Math.max(0, 1 - -vF / 14);
    }
    if (inp.drift && !c.drifting && vF > 1) ax -= 8;           // handbrake without steering
    ax -= vF * (0.035 + (off ? 0.32 : 0));
    if (vF > top) ax -= (vF - top) * 0.9;
    if (thr === 0 && brk === 0 && Math.abs(vF) < 1.5) vF *= Math.max(0, 1 - 3 * dt);
    vF += ax * dt;
    c.ax = ax;

    if (c.drifting) {
      // in a drift the tyres swing the car's path round toward the nose instead of killing the sideways speed,
      // so a long slide keeps its pace; a little scrub keeps it from being faster than gripping
      const sp = Math.hypot(vF, vL), slip = Math.atan2(vL, vF) * Math.exp(-1.7 * dt);
      vF = sp * Math.cos(slip); vL = sp * Math.sin(slip);
      vF -= Math.abs(vL) * 0.5 * dt;
    } else vL *= Math.exp(-(off ? 4.5 : 9) * dt);

    c.vx = fx * vF + lx * vL; c.vz = fz * vF + lz * vL;
    c.x += c.vx * dt; c.z += c.vz * dt;

    // feel: skid, rpm, gear, body motion
    const speed = Math.abs(vF);
    c.skid = clamp(Math.abs(vL) / 5 + (c.drifting ? 0.45 : 0) + (brk > 0.5 && vF > 25 ? 0.35 : 0), 0, 1);
    if (vF < -0.5) { c.gear = 0; }
    else { let g = 1; while (g < 7 && speed > GEARS[g]) g++; c.gear = g; }
    const g = Math.max(1, c.gear), lo = GEARS[g - 1], hi = GEARS[g];
    let rpmT = 1000 + clamp((speed - lo) / (hi - lo), 0, 1) * 8000 * (g === 1 ? 1 : 0.62) + (g === 1 ? 0 : 3000);
    if (thr > 0 && speed < 4) rpmT = Math.max(rpmT, 2600 + thr * 2000);
    if (c.drifting) rpmT += 900;
    c.rpm += (Math.min(9200, rpmT) - c.rpm) * Math.min(1, dt * 9);
    c.throttle = thr; c.braking = brk > 0.1 && vF > 1;
    c.lean += (clamp(c.yaw * vF * 0.0045, -0.085, 0.085) - c.lean) * Math.min(1, dt * 6);
    c.pitch += (clamp(-ax * 0.0035, -0.05, 0.06) - c.pitch) * Math.min(1, dt * 6);
    c.wheelRot += vF * dt / 0.42;
  };

  SM.updateProgress = function (c, full) {
    const tr = SM.track, N = tr.N;
    let best = c.idx, bd = Infinity;
    const scan = (i) => { const p = tr.pts[i], dx = p.x - c.x, dz = p.z - c.z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } };
    for (let k = -25; k <= 45; k++) scan((c.idx + k + N) % N);
    if (full || bd > 3600) { bd = Infinity; for (let i = 0; i < N; i++) scan(i); }
    const prev = c.idx;
    if (prev > N * 0.8 && best < N * 0.2) c.lap++;
    else if (prev < N * 0.2 && best > N * 0.8) c.lap--;
    c.idx = best;
    const p = tr.pts[best], r = tr.right[best], t = tr.tan[best];
    c.lat = (c.x - p.x) * r.x + (c.z - p.z) * r.z;
    const along = (c.x - p.x) * t.x + (c.z - p.z) * t.z;
    c.prog = c.lap * N + best + along / tr.ds;
  };

  SM.walls = function (c) {
    const tr = SM.track, lim = tr.wall - 1.05;
    if (Math.abs(c.lat) <= lim) return;
    const s = Math.sign(c.lat), r = tr.right[c.idx], pen = Math.abs(c.lat) - lim;
    c.x -= r.x * s * pen; c.z -= r.z * s * pen; c.lat = s * lim;
    const vn = (c.vx * r.x + c.vz * r.z) * s;
    if (vn > 0) {
      c.vx -= r.x * s * vn * 1.35; c.vz -= r.z * s * vn * 1.35;
      c.vx *= 0.97; c.vz *= 0.97;
      c.hit = Math.max(c.hit, vn);
      // turn the nose back along the wall so a scrape never becomes a dead stop
      const t = tr.tan[c.idx], fwd = Math.sin(c.h) * t.x + Math.cos(c.h) * t.z;
      if (fwd > 0) { const a = Math.atan2(t.x, t.z) - c.h; c.h += clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.05, 0.05); }
      c.drifting = false;
    }
  };

  SM.collide = function (cars) {
    const R = 1.08, offs = [1.25, -1.25];
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx0 = a.x - b.x, dz0 = a.z - b.z;
      if (dx0 * dx0 + dz0 * dz0 > 36) continue;
      for (const oa of offs) for (const ob of offs) {
        const ax = a.x + Math.sin(a.h) * oa, az = a.z + Math.cos(a.h) * oa;
        const bx = b.x + Math.sin(b.h) * ob, bz = b.z + Math.cos(b.h) * ob;
        const dx = ax - bx, dz = az - bz, d2 = dx * dx + dz * dz;
        if (d2 >= 4 * R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, ov = 2 * R - d;
        a.x += nx * ov * 0.5; a.z += nz * ov * 0.5; b.x -= nx * ov * 0.5; b.z -= nz * ov * 0.5;
        const vrel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
        if (vrel < 0) {
          const jimp = -(1.25) * vrel / 2;
          a.vx += nx * jimp; a.vz += nz * jimp; b.vx -= nx * jimp; b.vz -= nz * jimp;
          a.hit = Math.max(a.hit, -vrel); b.hit = Math.max(b.hit, -vrel);
          a.yaw += (Math.random() - 0.5) * 0.05 * -vrel; b.yaw -= (Math.random() - 0.5) * 0.05 * -vrel;
        }
      }
    }
  };

  // slipstream: tucked in behind another car gives a tow and fills nitro
  SM.drafting = function (c, cars, dt) {
    c.draft = 0;
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    for (const o of cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, ahead = dx * fx + dz * fz, side = Math.abs(dx * fz - dz * fx);
      if (ahead > 4 && ahead < 26 && side < 2.4 && Math.hypot(c.vx, c.vz) > 20) { c.draft = 1; break; }
    }
    if (c.draft) c.nitro = Math.min(1, c.nitro + 0.07 * dt);
  };

  SM.aiInput = function (c, cars, dt, race) {
    const tr = SM.track, N = tr.N, ai = c.ai;
    const speed = Math.hypot(c.vx, c.vz);
    const ahead = (m) => (c.idx + Math.round(m / tr.ds)) % N;

    // racing line: lean toward the inside of what's coming
    const kNear = tr.turn[ahead(35)], kFar = tr.turn[ahead(80)];
    let laneT = clamp((kNear * 0.6 + kFar * 0.4) * 950, -6.5, 6.5) + ai.bias;
    // avoid cars just ahead
    for (const o of cars) {
      if (o === c) continue;
      const dp = (o.prog - c.prog) * tr.ds;
      if (dp > 0 && dp < 16 && Math.abs(o.lat - (ai.lane)) < 2.8) { laneT = o.lat + (o.lat > 0 ? -3.6 : 3.6); break; }
    }
    laneT = clamp(laneT, -7.5, 7.5);
    ai.lane += clamp(laneT - ai.lane, -4 * dt, 4 * dt);

    const look = 9 + speed * 0.55;
    const ti = ahead(look), p = tr.pts[ti], r = tr.right[ti];
    const tx = p.x + r.x * ai.lane - c.x, tz = p.z + r.z * ai.lane - c.z;
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    const df = tx * fx + tz * fz, dl = tx * Math.cos(c.h) - tz * Math.sin(c.h);
    const alpha = Math.atan2(-dl, df), Ld = Math.max(4, Math.hypot(tx, tz));
    const delta = Math.atan(2 * 2.8 * Math.sin(alpha) / Ld);
    const steer = clamp(delta / SM.steerMax(speed) + ai.wobble * Math.sin(race.time * 0.7 + ai.ph), -1, 1);

    // speed from the precomputed safe-speed profile, scaled by skill and rubber band
    const gapM = (c.prog - race.leaderRef) * tr.ds;
    const band = 1 - clamp(gapM / 1600, -0.07, 0.07);
    let vT = tr.safe[ahead(8)] * ai.skill * band;
    if (c.offroad) vT = Math.min(vT, 30);
    const throttle = clamp((vT - speed) / 3 + 0.2, 0, 1);
    const brake = clamp((speed - vT) / 4, 0, 1);

    // nitro on long fast stretches
    ai.nitroCd -= dt;
    let nitro = c.boosting && c.nitro > 0.05 && tr.safe[ahead(60)] > speed + 8;
    if (!nitro && ai.nitroCd <= 0 && c.nitro > 0.5 && tr.safe[ahead(120)] > 70 && speed > 35 && speed < 75) { nitro = true; ai.nitroCd = 6 + Math.random() * 6; }

    // unstick
    if (speed < 2 && race.time > 3) { ai.stuckT += dt; if (ai.stuckT > 2) { SM.respawn(c); ai.stuckT = 0; } }
    else ai.stuckT = 0;

    return { steer, throttle: brake > 0.05 ? 0 : throttle, brake, drift: false, nitro };
  };
})();
