/* Supermar — synthesized V16 engine, turbo whistle, tyres and race sounds (Web Audio, no files) */
(function () {
  'use strict';
  const SM = window.SM;
  const A = (SM.audio = { ctx: null, muted: false, spool: 0, prevThrottle: 0 });
  let n = {};

  A.init = function () {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = A.ctx = new AC(); } catch (e) { return; }
    const master = ctx.createGain(); master.gain.value = A.muted ? 0 : 0.5;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);

    // engine: three detuned oscillators through a resonant low-pass and a soft clipper
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 3.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    shaper.curve = curve;
    const eng = ctx.createGain(); eng.gain.value = 0;
    const mk = (type, gain) => { const o = ctx.createOscillator(); o.type = type; const g = ctx.createGain(); g.gain.value = gain; o.connect(g); g.connect(lp); o.start(); return o; };
    const o1 = mk('sawtooth', 0.5), o2 = mk('square', 0.22), o3 = mk('sawtooth', 0.16);
    // a slow wobble gives the V16 its lumpy firing feel
    const wob = ctx.createGain(); wob.gain.value = 1;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lfoG = ctx.createGain(); lfoG.gain.value = 0.18;
    lfo.connect(lfoG); lfoG.connect(wob.gain); lfo.start();
    lp.connect(shaper); shaper.connect(wob); wob.connect(eng); eng.connect(master);

    // turbo whistle
    const tw = ctx.createOscillator(); tw.type = 'sine'; tw.frequency.value = 2000;
    const twg = ctx.createGain(); twg.gain.value = 0; tw.connect(twg); twg.connect(master); tw.start();

    // shared noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const loopNoise = (type, freq, q) => {
      const s = ctx.createBufferSource(); s.buffer = nb; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start();
      return g;
    };
    const skid = loopNoise('bandpass', 1150, 1.4);
    const wind = loopNoise('lowpass', 520, 0.7);
    const rumble = loopNoise('lowpass', 180, 1);
    const nitro = loopNoise('bandpass', 420, 0.8);
    // police siren: a wailing triangle wave
    const sir = ctx.createOscillator(); sir.type = 'triangle'; sir.frequency.value = 950;
    const sLfo = ctx.createOscillator(); sLfo.frequency.value = 0.42; const sDepth = ctx.createGain(); sDepth.gain.value = 360;
    sLfo.connect(sDepth); sDepth.connect(sir.frequency); sLfo.start();
    const sirG = ctx.createGain(); sirG.gain.value = 0; sir.connect(sirG); sirG.connect(master); sir.start();
    n = { master, lp, eng, o1, o2, o3, tw, twg, skid, wind, rumble, nitro, nb, sirG };
    A.master = master; // the song plays through the master volume, so mute covers it
  };

  A.siren = function (level) {
    if (!A.ctx) return;
    n.sirG.gain.setTargetAtTime(Math.max(0, Math.min(1, level)) * 0.075, A.ctx.currentTime, 0.15);
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (A.ctx) n.master.gain.setTargetAtTime(m ? 0 : 0.5, A.ctx.currentTime, 0.05);
  };

  A.silence = function () {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    [n.eng, n.twg, n.skid, n.wind, n.rumble, n.nitro, n.sirG].forEach(g => g.gain.setTargetAtTime(0, t, 0.1));
  };

  // p: { rpm, throttle, boost, speed, skid, offroad }
  A.update = function (p, dt) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    const f = 26 + (p.rpm / 60) * 2.3;
    n.o1.frequency.setTargetAtTime(f, t, 0.025);
    n.o2.frequency.setTargetAtTime(f * 0.5 + 1.3, t, 0.025);
    n.o3.frequency.setTargetAtTime(f * 2.02, t, 0.025);
    n.lp.frequency.setTargetAtTime(260 + p.throttle * 2100 + p.rpm * 0.22 + (p.boost ? 900 : 0), t, 0.05);
    n.eng.gain.setTargetAtTime(0.14 + p.throttle * 0.2 + (p.boost ? 0.07 : 0), t, 0.06);

    const target = Math.min(1, p.throttle * (p.rpm / 8500) * 1.25) + (p.boost ? 0.3 : 0);
    A.spool += (Math.min(1.3, target) - A.spool) * Math.min(1, dt * (target > A.spool ? 1.6 : 4));
    n.tw.frequency.setTargetAtTime(1700 + A.spool * 4300, t, 0.05);
    n.twg.gain.setTargetAtTime(A.spool * 0.028, t, 0.05);
    if (A.prevThrottle > 0.6 && p.throttle < 0.15 && A.spool > 0.55) { A.pssh(); A.spool *= 0.3; }
    A.prevThrottle = p.throttle;

    n.skid.gain.setTargetAtTime(Math.min(0.26, p.skid * 0.26), t, 0.04);
    n.wind.gain.setTargetAtTime(Math.min(0.16, (p.speed / 90) * 0.16), t, 0.1);
    n.rumble.gain.setTargetAtTime(p.offroad ? Math.min(0.35, p.speed / 40 * 0.35) : 0, t, 0.06);
    n.nitro.gain.setTargetAtTime(p.boost ? 0.22 : 0, t, 0.08);
  };

  function burst(dur, freq, q, gain, type) {
    if (!A.ctx) return;
    const ctx = A.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = n.nb;
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(n.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  A.pssh = () => burst(0.4, 2600, 0.9, 0.22);
  A.thud = (k) => { burst(0.25, 160, 0.8, Math.min(0.6, 0.15 + k * 0.05), 'lowpass'); burst(0.12, 900, 1, Math.min(0.25, k * 0.03)); };
  A.miniTurbo = () => burst(0.35, 1400, 2, 0.2);
  A.smash = (k) => { burst(0.3, 300, 0.8, 0.25 + k * 3, 'lowpass'); burst(0.16, 1900 + Math.random() * 900, 2.5, 0.18); };

  A.beep = function (freq, dur, vol) {
    if (!A.ctx) return;
    const ctx = A.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol || 0.16, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(n.master); o.start(t); o.stop(t + dur + 0.02);
  };
})();
