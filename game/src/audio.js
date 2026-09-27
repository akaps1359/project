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

  RS.isMuted = () => muted;
  RS.setMuted = function (m) {
    muted = m;
    try {
      localStorage.setItem('rs_muted', m ? '1' : '0');
    } catch (e) {
      /* 무시 */
    }
    if (!m) RS.unlockAudio();
  };
})((globalThis.RS = globalThis.RS || {}));
