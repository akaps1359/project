// 간단한 효과음 합성 (파일 없이 WebAudio 로 만든다)
(function (RS) {
  'use strict';

  let ctx = null;
  let master = null;
  let muted = false;
  const last = {};

  try {
    muted = localStorage.getItem('rs_muted') === '1';
  } catch (e) {
    /* 저장소를 못 쓰면 기본값 */
  }

  // 무음 스위치를 켜 둔 아이폰에서도 효과음이 나게 오디오 세션을 '재생'으로 둔다 (iOS 17+)
  function setSession() {
    try {
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback';
    } catch (e) {
      /* 지원하지 않으면 무시 */
    }
  }
  setSession();

  // 옛 iOS: HTML 오디오를 한 번 재생하면 세션이 '재생'으로 바뀌어 무음 스위치를 무시한다
  const SILENT = 'data:audio/wav;base64,UklGRkQDAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YSADAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
  let htmlKicked = false;
  function kickHtmlAudio() {
    if (htmlKicked) return;
    htmlKicked = true;
    try {
      const a = new Audio(SILENT);
      a.setAttribute('playsinline', '');
      a.muted = false;
      a.volume = 0.01;
      const p = a.play();
      if (p && p.catch) p.catch(() => (htmlKicked = false));
    } catch (e) {
      htmlKicked = false;
    }
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        return null;
      }
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
    }
    // iOS 는 백그라운드·전화 뒤에 'interrupted' 로 멈출 수 있다
    if (ctx.state !== 'running' && ctx.state !== 'closed') {
      try {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        /* 다음 터치에서 다시 */
      }
    }
    return ctx;
  }

  // 터치 안에서 아주 짧은 무음 버퍼를 재생해야 옛 iOS 가 오디오를 연다
  function primeBuffer(c) {
    try {
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch (e) {
      /* 무시 */
    }
  }

  function tone(freq, dur, type, vol, slide, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
    g.gain.setValueAtTime(vol || 0.2, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  // 짧은 잡음 (칼바람·폭발). 버퍼는 한 번 만들어 재사용한다
  let noiseBuf = null;
  function noise(dur, vol, filter, freq, freqTo, delay, q) {
    const t0 = ctx.currentTime + (delay || 0);
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter || 'bandpass';
    f.Q.value = q || 1.2;
    f.frequency.setValueAtTime(freq, t0);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0, Math.random() * 0.3);
    src.stop(t0 + dur + 0.02);
  }

  // 공격음: 클래스마다 다른 소리, 음높이를 조금씩 흔들어 반복이 덜 거슬리게
  const jit = () => 0.93 + Math.random() * 0.14;
  const ATK = {
    knight: (j) => { noise(0.09, 0.16, 'bandpass', 2200 * j, 700, 0, 0.9); tone(150 * j, 0.06, 'square', 0.05, 90, 0.03); },
    archer: (j) => { tone(1500 * j, 0.05, 'triangle', 0.07, 700); noise(0.04, 0.06, 'highpass', 4000, null, 0.01); },
    mage: (j) => { tone(260 * j, 0.14, 'sine', 0.13, 70); noise(0.16, 0.1, 'lowpass', 1400, 200, 0.02, 0.7); },
    rogue: (j) => { noise(0.035, 0.12, 'highpass', 3200 * j, null, 0, 0.8); tone(900 * j, 0.03, 'square', 0.04, 1300, 0.02); },
    frost: (j) => { tone(1900 * j, 0.1, 'triangle', 0.06, 1200); tone(2850 * j, 0.07, 'sine', 0.04, null, 0.03); },
  };
  const crit = () => { tone(1760, 0.05, 'square', 0.05); tone(2350, 0.08, 'square', 0.04, null, 0.04); };

  const SFX = {
    click: () => tone(660, 0.05, 'square', 0.08),
    summon: () => { tone(520, 0.07, 'square', 0.1, 780); tone(780, 0.08, 'square', 0.08, 1040, 0.06); },
    rare: () => { tone(660, 0.08, 'square', 0.1); tone(880, 0.08, 'square', 0.1, null, 0.07); tone(1320, 0.12, 'square', 0.1, null, 0.14); },
    merge: () => { tone(440, 0.07, 'triangle', 0.18); tone(660, 0.07, 'triangle', 0.18, null, 0.06); tone(990, 0.14, 'triangle', 0.18, null, 0.12); },
    legend: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.1, null, i * 0.07)); },
    upgrade: () => { tone(330, 0.06, 'square', 0.1, 660); tone(660, 0.1, 'square', 0.08, 990, 0.06); },
    kill: () => tone(220, 0.05, 'square', 0.04, 110),
    big: () => { tone(160, 0.25, 'sawtooth', 0.15, 50); tone(90, 0.3, 'square', 0.1, 40, 0.05); },
    leak: () => { tone(180, 0.15, 'sawtooth', 0.14, 90); },
    coin: () => { tone(988, 0.05, 'square', 0.07); tone(1319, 0.08, 'square', 0.07, null, 0.05); },
    wave: () => { tone(392, 0.08, 'triangle', 0.12); tone(523, 0.12, 'triangle', 0.12, null, 0.08); },
    boss: () => { tone(110, 0.5, 'sawtooth', 0.18, 70); tone(82, 0.6, 'square', 0.1, 55, 0.1); },
    bomb: () => { tone(120, 0.4, 'sawtooth', 0.2, 40); },
    freeze: () => { tone(1400, 0.2, 'triangle', 0.1, 700); },
    win: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'square', 0.1, null, i * 0.1)); },
    lose: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'triangle', 0.14, null, i * 0.14)); },
    error: () => tone(140, 0.08, 'square', 0.08),
    // 보스 기술
    heartbeat: () => { tone(70, 0.14, 'sine', 0.35, 45); tone(62, 0.16, 'sine', 0.3, 40, 0.18); },
    glue: () => { tone(220, 0.18, 'triangle', 0.14, 90); noise(0.12, 0.06, 'lowpass', 600, 200, 0.02); },
    shield: () => { tone(520, 0.1, 'triangle', 0.1, 780); tone(780, 0.16, 'sine', 0.08, 1040, 0.08); },
    shieldBreak: () => { noise(0.22, 0.16, 'bandpass', 3000, 600, 0, 0.8); tone(900, 0.12, 'square', 0.06, 300, 0.02); },
    blink: () => { tone(1200, 0.12, 'sine', 0.1, 300); tone(300, 0.14, 'sine', 0.08, 1200, 0.1); },
  };
  const GAP = { kill: 0.06, leak: 0.12, coin: 0.05, summon: 0.04 };

  function play(name) {
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < (GAP[name] || 0.03)) return;
    last[name] = now;
    try {
      SFX[name] && SFX[name]();
    } catch (e) {
      /* 소리는 실패해도 게임은 계속 */
    }
  }

  // 전투 공격음. 한꺼번에 쏟아지면 시끄러우니 클래스별·전체 간격을 둔다
  const atkLast = {};
  let atkAny = 0;
  let critLast = 0;
  RS.sfxAttack = function (cls, isCrit) {
    if (muted || !ctx || ctx.state !== 'running' || !ATK[cls]) return;
    const now = ctx.currentTime;
    if (isCrit && now - critLast > 0.18) {
      critLast = now;
      try { crit(); } catch (e) { /* 무시 */ }
    }
    if (now - atkAny < 0.05 || (atkLast[cls] && now - atkLast[cls] < 0.11)) return;
    atkAny = now;
    atkLast[cls] = now;
    try {
      ATK[cls](jit());
    } catch (e) {
      /* 소리는 실패해도 게임은 계속 */
    }
  };

  RS.sfx = function (name) {
    if (muted) return;
    const c = ensure();
    if (!c) return;
    if (c.state === 'running') play(name);
    // 막 깨우는 중이면 깨어난 뒤 한 번 재생 (첫 탭 소리가 사라지지 않게)
    else if (c.state !== 'closed' && !pending) {
      pending = name;
      const p = c.resume();
      const done = () => {
        const n = pending;
        pending = null;
        if (c.state === 'running' && n) play(n);
      };
      if (p && p.then) p.then(done, () => (pending = null));
      else pending = null;
    }
  };
  let pending = null;

  // iOS 는 사용자 터치 안에서 오디오를 깨워야 한다
  RS.unlockAudio = function () {
    if (muted) return;
    setSession();
    kickHtmlAudio();
    const c = ensure();
    if (c && !primed) {
      primed = true;
      primeBuffer(c);
    }
  };
  let primed = false;

  // ── 배경 음악: 파일 없이 칩튠을 실시간으로 연주한다 ──
  // 곡 = 템포 + 마디별 화음 + 베이스·아르페지오·드럼 한 마디 패턴 + 멜로디(한 칸 = 한 스텝)
  const TRACKS = {
    title: {
      bpm: 76, sub: 2, chords: ['Am', 'F', 'C', 'E'],
      bass: '1---5---', arp: '13585313', lead: 'triangle',
      mel: 'E5 - - - C5 - D5 - | C5 - A4 - - - . . | G4 - C5 - E5 - D5 - | B4 - - - G#4 - - -',
    },
    map: {
      bpm: 104, sub: 2, chords: ['Dm', 'C', 'Bb', 'C', 'Dm', 'C', 'Bb', 'A'],
      bass: '1-5-8-5-', drum: 'k.h.s.h.', lead: 'square',
      mel: 'D5 - F5 - A5 - G5 - | E5 - - - C5 - . . | D5 - F5 - Bb5 - A5 - | G5 - - - - - . . |' +
        'A5 - G5 - F5 - E5 - | D5 - E5 - C5 - . . | D5 - - - F5 - E5 - | C#5 - - - A4 - - -',
    },
    battle: {
      bpm: 148, sub: 4, chords: ['Em', 'C', 'D', 'B'],
      bass: '1.1.8.1.1.1.8.5.', drum: 'k.h.s.h.k.hks.h.', lead: 'square',
      mel: 'E5 - - - B4 - E5 - G5 - F#5 - E5 - D5 - | E5 - - - - - . . C5 - D5 - E5 - G5 - |' +
        'F#5 - - - D5 - F#5 - A5 - G5 - F#5 - E5 - | D#5 - - - - - - - B4 - C5 - D#5 - F#5 -',
    },
    boss: {
      bpm: 160, sub: 4, chords: ['Cm', 'Db', 'Cm', 'G'],
      bass: '1.1.8.1.1.1.8.1.', drum: 'k.hsk.h.k.hsk.ss', lead: 'sawtooth',
      mel: 'C5 - Eb5 - G5 - - - F5 - Eb5 - D5 - Eb5 - | F5 - - - Ab5 - - - G5 - F5 - Db5 - - - |' +
        'Eb5 - G5 - C6 - - - Bb5 - G5 - Eb5 - G5 - | B4 - D5 - F5 - - - Ab5 - G5 - F5 - D5 -',
    },
    shop: {
      bpm: 116, sub: 2, chords: ['F', 'Dm', 'Gm', 'C'],
      bass: '1.5.8.5.', drum: 'k.h.s.h.', lead: 'triangle',
      mel: 'A5 - C6 - A5 - F5 - | F5 - A5 - D5 - - - | Bb4 - D5 - G5 - F5 - | E5 - G5 - C5 - - -',
    },
    rest: {
      bpm: 66, sub: 2, chords: ['C', 'Am', 'F', 'G'],
      bass: '1-------', arp: '13581358', lead: 'sine',
      mel: 'E5 - - - G5 - - - | A5 - - - E5 - - - | F5 - - - A5 - C6 - | B5 - - - G5 - - -',
    },
    event: {
      bpm: 88, sub: 2, chords: ['Em', 'C', 'Am', 'B'],
      bass: '1---5---', arp: '1358', lead: 'triangle',
      mel: 'G5 - - - F#5 - E5 - | E5 - - - G5 - - - | C6 - B5 - A5 - E5 - | D#5 - - - F#5 - - -',
    },
    win: {
      bpm: 120, sub: 2, chords: ['C', 'F', 'G', 'C'],
      bass: '1.5.8.5.', drum: 'k.h.s.h.', lead: 'square',
      mel: 'C5 - E5 - G5 - C6 - | A5 - - - F5 - A5 - | G5 - B5 - D6 - B5 - | C6 - - - - - . .',
    },
    lose: {
      bpm: 64, sub: 2, chords: ['Am', 'Dm', 'E', 'Am'],
      bass: '1-------', arp: '1358', lead: 'sine',
      mel: 'E5 - - - C5 - - - | D5 - - - F5 - - - | E5 - - - G#4 - B4 - | A4 - - - - - - -',
    },
  };

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const midiOf = (n) => {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
    if (!m) return null;
    return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  };
  const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  // 'Am' → [A2, C3, E3, A3] (베이스 음역의 근음·3도·5도·옥타브)
  function chordTones(name) {
    const m = /^([A-G])([#b]?)(m?)/.exec(name);
    const root = 45 + ((NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) - 9 + 12) % 12);
    return { 1: root, 3: root + (m[3] ? 3 : 4), 5: root + 7, 8: root + 12 };
  }
  // 멜로디 문자열 → 스텝별 {midi, len}
  function parseMel(str) {
    const toks = str.replace(/\|/g, ' ').trim().split(/\s+/);
    const out = new Array(toks.length).fill(null);
    let last = -1;
    toks.forEach((t, i) => {
      if (t === '-') {
        if (last >= 0) out[last].len++;
      } else if (t === '.') last = -1;
      else {
        out[i] = { midi: midiOf(t), len: 1 };
        last = i;
      }
    });
    return out;
  }
  for (const k in TRACKS) {
    const T = TRACKS[k];
    T.notes = parseMel(T.mel);
    T.bar = T.sub * 4;
    T.len = T.notes.length;
    T.tones = T.chords.map(chordTones);
  }

  let bgmOff = false;
  try {
    bgmOff = localStorage.getItem('rs_bgm_off') === '1';
  } catch (e) {
    /* 기본값 */
  }
  let want = null; // 지금 틀어야 할 곡
  let cur = null; // { name, T, bus, step, t }
  let timer = null;

  function voice(bus, type, f, t0, dur, vol, slide) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(vol * 0.55, t0 + Math.min(dur, 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  function drumHit(bus, ch, t0) {
    if (ch === 'k') voice(bus, 'triangle', 220, t0, 0.12, 0.45, 55);
    else if (ch === 's' || ch === 'h') {
      if (!noiseBuf) noise(0.01, 0.0001, 'highpass', 5000); // 잡음 버퍼 준비
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = ch === 's' ? 'bandpass' : 'highpass';
      f.frequency.value = ch === 's' ? 1800 : 7000;
      const g = ctx.createGain();
      const v = ch === 's' ? 0.28 : 0.08;
      const d = ch === 's' ? 0.12 : 0.035;
      g.gain.setValueAtTime(v, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      src.connect(f);
      f.connect(g);
      g.connect(bus);
      src.start(t0, Math.random() * 0.3);
      src.stop(t0 + d + 0.02);
    }
  }

  function playStep(c, st, t0) {
    const T = c.T;
    const sd = 60 / T.bpm / T.sub;
    const inBar = st % T.bar;
    const barIdx = Math.floor(st / T.bar) % T.tones.length;
    const tones = T.tones[barIdx];
    const n = T.notes[st % T.len];
    if (n && n.midi) voice(c.bus, T.lead, hz(n.midi), t0, n.len * sd * 0.95, T.lead === 'sawtooth' ? 0.1 : T.lead === 'square' ? 0.13 : 0.22);
    const b = T.bass[inBar % T.bass.length];
    if (tones[b]) {
      let len = 1;
      while (T.bass[(inBar + len) % T.bass.length] === '-' && len < T.bass.length) len++;
      // 폰 스피커에서도 들리게 한 옥타브 올린 베이스
      voice(c.bus, 'triangle', hz(tones[b] + 12), t0, len * sd * 0.9, 0.3);
    }
    if (T.arp) {
      const a = T.arp[st % T.arp.length];
      if (tones[a]) voice(c.bus, 'square', hz(tones[a] + 24), t0, sd * 0.8, 0.045);
    }
    if (T.drum) drumHit(c.bus, T.drum[inBar % T.drum.length], t0);
  }

  function startTrack(name) {
    if (cur) {
      // 이전 곡은 짧게 줄이며 끊는다
      const old = cur.bus;
      const now = ctx.currentTime;
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0, now + 0.35);
      setTimeout(() => old.disconnect(), 600);
      cur = null;
    }
    if (!name || !TRACKS[name]) return;
    const bus = ctx.createGain();
    bus.gain.value = 0.2; // 효과음보다 한 발 뒤에
    bus.connect(master);
    cur = { name, T: TRACKS[name], bus, step: 0, t: ctx.currentTime + 0.4 };
  }

  function tick() {
    if (!ctx || ctx.state !== 'running') return;
    const target = muted || bgmOff ? null : want;
    if ((cur ? cur.name : null) !== target) startTrack(target);
    if (!cur) return;
    const now = ctx.currentTime;
    if (cur.t < now - 0.2) cur.t = now + 0.05; // 멈췄다 돌아오면 밀린 음을 몰아 치지 않는다
    const sd = 60 / cur.T.bpm / cur.T.sub;
    while (cur.t < now + 0.3) {
      try {
        playStep(cur, cur.step, cur.t);
      } catch (e) {
        /* 음 하나 실패는 무시 */
      }
      cur.step++;
      cur.t += sd;
    }
  }

  RS.bgm = function (name) {
    want = name || null;
    if (!timer && typeof setInterval === 'function') timer = setInterval(tick, 80);
    tick();
  };
  RS.audioHidden = function (hidden) {
    if (!ctx) return;
    try {
      const p = hidden ? ctx.suspend() : ctx.resume();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* 무시 */
    }
  };
  RS.isBgmOff = () => bgmOff;
  RS.bgmNow = () => (cur ? cur.name : null);
  RS.setBgmOff = function (off) {
    bgmOff = off;
    try {
      localStorage.setItem('rs_bgm_off', off ? '1' : '0');
    } catch (e) {
      /* 무시 */
    }
    if (!off) RS.unlockAudio();
    tick();
  };

  RS.isMuted = () => muted;
  RS.setMuted = function (m) {
    muted = m;
    try {
      localStorage.setItem('rs_muted', m ? '1' : '0');
    } catch (e) {
      /* 무시 */
    }
    if (!m) RS.unlockAudio();
    if (RS.bgm) RS.bgm(want);
  };
})((globalThis.RS = globalThis.RS || {}));
