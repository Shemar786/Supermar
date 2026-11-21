/* Supermar — title-screen song from a real recording.
   Browsers can't sing, so this plays an audio file of the song instead of synthesizing one.
   To add it: put the recording next to index.html (for example song.mp3) and set SONG_FILE below.
   It plays on the title and results screens only, never over the engine while driving.
   The lyrics are the songwriter's own words: keep them exactly as written. */
(function () {
  'use strict';
  const SM = window.SM;
  const $ = id => document.getElementById(id);

  const SONG_FILE = null; // e.g. 'song.mp3'

  // the words (verbatim)
  const VERSE = [
    'hey I am rich beacuse im blessed,',
    'and everyday i wake i think I am great,',
    'In this land of love and hate,',
    'whatever I can do i will do to make life,'
  ];
  const CHORUS = [
    'ohh yes, life give me love,',
    'i am a man but not a man without fun,',
    'i pray one day i can get the money riches,',
    'but for nowi am rich in God and patience.'
  ];
  // once the recording exists: the second each line starts in it, e.g. [{ at: 12.4, line: VERSE[0] }, ...]
  const TIMES = null;

  let el = null, node = null, on = true, driving = false, raf = 0;

  function lyricTick() {
    raf = requestAnimationFrame(lyricTick);
    if (!TIMES || !el) return;
    const t = el.currentTime;
    let cur = null;
    for (const x of TIMES) if (t >= x.at) cur = x;
    const box = $('lyric');
    if (!cur) { box.hidden = true; return; }
    if ($('lyricText').textContent !== cur.line) $('lyricText').textContent = cur.line;
    box.hidden = false;
  }

  function start() {
    if (!SONG_FILE || !on || driving || document.hidden || !SM.audio.ctx || !SM.audio.master) return;
    if (!el) {
      el = new Audio(SONG_FILE); el.loop = true; el.preload = 'auto';
      // route through the game's master volume so the Sound button mutes it too
      try { node = SM.audio.ctx.createMediaElementSource(el); node.connect(SM.audio.master); } catch (e) { node = null; }
    }
    const p = el.play(); if (p && p.catch) p.catch(() => {});
    if (!raf) lyricTick();
  }
  function stop() {
    if (el) el.pause();
    cancelAnimationFrame(raf); raf = 0;
    const box = $('lyric'); if (box) box.hidden = true;
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });

  SM.music = {
    available: !!SONG_FILE,
    setOn(v) { on = v; if (v) start(); else stop(); },
    // the song stays off while driving so it never fights the engine
    setDriving(v) { driving = v; if (v) stop(); else start(); },
    start, stop,
    lyrics: { verse: VERSE, chorus: CHORUS }
  };
})();
