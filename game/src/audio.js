// 소리: 효과음·배경 음악은 CC0 음원 파일(assets/audio, 출처는 CREDITS.md)을 쓰고,
// 파일이 아직 안 왔거나 못 받으면 WebAudio 로 합성한 소리로 대신한다
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
    charge: () => { tone(90, 0.5, 'sawtooth', 0.12, 180); noise(0.4, 0.08, 'lowpass', 400, 1500); },
    seal: () => { tone(110, 0.4, 'square', 0.1, 70); tone(165, 0.4, 'triangle', 0.1, 104, 0.05); tone(233, 0.5, 'sine', 0.08, 147, 0.1); },
    cast: () => { tone(880, 0.06, 'square', 0.07); tone(880, 0.06, 'square', 0.07, null, 0.12); },
    doze: () => { tone(330, 0.3, 'sine', 0.1, 220); tone(247, 0.4, 'sine', 0.08, 165, 0.2); },
    unseal: () => { [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, null, i * 0.05)); },
  };
  const GAP = { kill: 0.06, leak: 0.12, coin: 0.05, summon: 0.04 };

  function play(name) {
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < (GAP[name] || 0.03)) return;
    last[name] = now;
    try {
      if (!playSample(name)) SFX[name] && SFX[name]();
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
      try {
        if (!playSample('crit')) crit();
      } catch (e) { /* 무시 */ }
    }
    if (now - atkAny < 0.05 || (atkLast[cls] && now - atkLast[cls] < 0.11)) return;
    atkAny = now;
    atkLast[cls] = now;
    try {
      const j = jit();
      if (!playSample('atk_' + cls, j)) ATK[cls](j);
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
      preloadSfx();
    }
  };
  let primed = false;

  // ── 음원 파일 ──
  const MAN = RS.AUDIO_MANIFEST || { bgm: {}, sfx: {} };
  const BASE = RS.AUDIO_BASE || 'assets/audio/';
  const THR = 1e-3;

  // mp3 는 디코더마다 앞에 빈 여백을 붙이기도 해서, 첫 소리 위치를 원본(lead)과 맞춰 시작점을 찾는다
  function firstSound(buf) {
    const d = buf.getChannelData(0);
    const lim = Math.min(d.length, Math.floor(buf.sampleRate * 0.3));
    for (let i = 0; i < lim; i++) if (d[i] > THR || d[i] < -THR) return i / buf.sampleRate;
    return 0;
  }
  function decode(bytes) {
    return new Promise((ok, bad) => {
      try {
        const p = ctx.decodeAudioData(bytes, ok, bad);
        if (p && p.catch) p.catch(bad);
      } catch (e) {
        bad(e);
      }
    });
  }
  function fetchBytes(url) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.arrayBuffer();
    });
  }

  // ── 효과음 ──
  const SFX_GAIN = {
    click: 0.3, error: 0.4, summon: 0.45, rare: 0.5, merge: 0.5, legend: 0.55, upgrade: 0.45, kill: 0.16, big: 0.5,
    leak: 0.5, coin: 0.3, wave: 0.35, boss: 0.5, bomb: 0.55, freeze: 0.35, lose: 0.45, glue: 0.35, shield: 0.35,
    shieldBreak: 0.5, blink: 0.35, charge: 0.4, seal: 0.45, cast: 0.3, doze: 0.3, unseal: 0.45, crit: 0.28,
    atk_knight: 0.2, atk_rogue: 0.18, atk_archer: 0.1, atk_mage: 0.18, atk_frost: 0.12,
  };
  const sfxBuf = {}; // 이름 → [{ buf, off, dur }]
  let sfxLoading = false;
  function preloadSfx() {
    if (sfxLoading || !ctx) return;
    sfxLoading = true;
    for (const name in MAN.sfx) {
      MAN.sfx[name].forEach((it) => {
        fetchBytes(BASE + 'sfx/' + it.f)
          .then(decode)
          .then((buf) => {
            const off = Math.max(0, firstSound(buf) - it.lead);
            (sfxBuf[name] = sfxBuf[name] || []).push({ buf, off, dur: Math.min(it.dur, buf.duration - off) });
          })
          .catch(() => {
            /* 합성음으로 대신 */
          });
      });
    }
  }
  let sfxBus = null;
  function playSample(name, rate) {
    const list = sfxBuf[name];
    if (!list || !list.length) return false;
    const it = list[(Math.random() * list.length) | 0];
    if (!sfxBus) {
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 1.6; // master(0.35) 뒤에서 합성음과 비슷한 크기
      sfxBus.connect(master);
    }
    const src = ctx.createBufferSource();
    src.buffer = it.buf;
    if (rate) src.playbackRate.value = rate;
    // (재생 속도를 흔들면 길이도 바뀌지만 짧은 소리라 괜찮다)
    const g = ctx.createGain();
    g.gain.value = SFX_GAIN[name] || 0.4;
    src.connect(g);
    g.connect(sfxBus);
    src.start(ctx.currentTime, it.off, it.dur + 0.02);
    return true;
  }

  // ── 배경 음악: 장면·막마다 곡을 고르고, 원본 루프 지점대로 끊김 없이 되풀이한다 ──
  const pickOf = (arr) => arr[(Math.random() * arr.length) | 0];
  function trackFor(scene, act) {
    const a = Math.max(1, Math.min(4, act || 1));
    switch (scene) {
      case 'battle': return a >= 4 ? pickOf(['a4', 'a4b']) : pickOf(['a' + a, 'a' + a + 'b']);
      case 'elite': return 'elite';
      case 'boss': return a >= 4 ? 'god' : a >= 3 ? 'boss3' : 'boss1';
      case 'map': return 'select';
      case 'win': return 'title';
      default: return MAN.bgm[scene] ? scene : null;
    }
  }
  // 다음에 나올 법한 곡을 미리 받아 둔다 (압축된 파일만. 풀어 두는 건 틀 때)
  function nextOf(scene, act) {
    const a = Math.max(1, Math.min(4, act || 1));
    if (scene === 'title') return ['select', 'a1', 'a1b'];
    if (scene === 'map' || scene === 'event' || scene === 'shop' || scene === 'rest') return a >= 4 ? ['a4', 'a4b', 'god'] : ['a' + a, 'a' + a + 'b', 'elite', a >= 3 ? 'boss3' : 'boss1'];
    if (scene === 'battle' || scene === 'elite') return ['select', a >= 4 ? 'god' : a >= 3 ? 'boss3' : 'boss1'];
    return ['select'];
  }

  const raw = {}; // 곡 id → 받은 mp3 (Promise<ArrayBuffer>)
  const decoded = new Map(); // 곡 id → { buf, off, dur } (최근 3곡만: 폰 메모리)
  function getRaw(id) {
    if (!raw[id]) raw[id] = fetchBytes(BASE + 'bgm/' + id + '.mp3').catch((e) => { delete raw[id]; throw e; });
    return raw[id];
  }
  function getTrack(id) {
    if (decoded.has(id)) {
      const v = decoded.get(id);
      decoded.delete(id);
      decoded.set(id, v); // 최근 사용으로
      return Promise.resolve(v);
    }
    const info = MAN.bgm[id];
    return getRaw(id)
      .then((bytes) => decode(bytes.slice(0)))
      .then((buf) => {
        // 한 채널로 합쳐 메모리를 반으로
        let b = buf;
        if (buf.numberOfChannels > 1) {
          b = ctx.createBuffer(1, buf.length, buf.sampleRate);
          const o = b.getChannelData(0);
          const l = buf.getChannelData(0);
          const r = buf.getChannelData(1);
          for (let i = 0; i < o.length; i++) o[i] = (l[i] + r[i]) * 0.5;
        }
        const off = Math.max(0, firstSound(b) - info.lead);
        const v = { buf: b, off, dur: Math.min(info.dur, b.duration - off) };
        decoded.set(id, v);
        while (decoded.size > 3) {
          const oldest = decoded.keys().next().value;
          if (cur && cur.id === oldest) break;
          decoded.delete(oldest);
        }
        return v;
      });
  }

  let bgmOff = false;
  try {
    bgmOff = localStorage.getItem('rs_bgm_off') === '1';
  } catch (e) {
    /* 기본값 */
  }
  let want = null; // { scene, act }
  let cur = null; // { scene, act, id, src, gain }
  let musicBus = null;
  let jingle = null;
  let reqSeq = 0;
  let pend = null; // 받는 중인 { scene, act }

  function stopCur(fade) {
    if (!cur) return;
    const { src, gain } = cur;
    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fade);
      src.stop(now + fade + 0.05);
    } catch (e) {
      /* 이미 멈춤 */
    }
    cur = null;
  }
  function startId(scene, act, id, delay) {
    const seq = ++reqSeq;
    pend = { scene, act };
    getTrack(id)
      .then((t) => {
        if (seq !== reqSeq || !ctx) return; // 그사이 다른 곡으로 바뀜
        pend = null;
        if (!musicBus) {
          musicBus = ctx.createGain();
          musicBus.gain.value = 0.75;
          musicBus.connect(master);
        }
        const src = ctx.createBufferSource();
        src.buffer = t.buf;
        src.loop = true;
        src.loopStart = t.off;
        src.loopEnd = t.off + t.dur;
        const gain = ctx.createGain();
        const t0 = ctx.currentTime + (delay || 0.05);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(1, t0 + 0.6);
        src.connect(gain);
        gain.connect(musicBus);
        src.start(t0, t.off);
        cur = { scene, act, id, src, gain };
      })
      .catch(() => {
        if (seq === reqSeq) pend = null; // 못 받으면 조용히 (효과음은 계속). 나중에 다시 시도
      });
  }
  function playJingle() {
    const info = MAN.bgm.winJingle;
    if (!info) return 0;
    getTrack('winJingle')
      .then((t) => {
        const src = ctx.createBufferSource();
        src.buffer = t.buf;
        const g = ctx.createGain();
        g.gain.value = 0.9;
        src.connect(g);
        g.connect(musicBus || master);
        src.start(ctx.currentTime + 0.05, t.off, t.dur);
        jingle = src;
      })
      .catch(() => {});
    return info.dur;
  }

  function apply() {
    if (!ctx || ctx.state !== 'running') return;
    const target = muted || bgmOff ? null : want;
    if (!target) {
      reqSeq++;
      pend = null;
      stopCur(0.4);
      return;
    }
    if (pend && pend.scene === target.scene && pend.act === target.act) return;
    // 같은 장면(같은 막)이면 틀던 곡을 그대로 둔다
    if (cur && cur.scene === target.scene && cur.act === target.act) return;
    const id = trackFor(target.scene, target.act);
    if (!id) return;
    stopCur(0.8);
    let delay = 0.05;
    if (target.scene === 'win') delay = playJingle() + 0.2;
    startId(target.scene, target.act, id, delay);
    for (const n of nextOf(target.scene, target.act)) if (MAN.bgm[n]) getRaw(n).catch(() => {});
  }

  // scene: title·map·battle·elite·boss·shop·rest·event·win·lose. act 로 막마다 곡이 바뀐다
  RS.bgm = function (scene, act) {
    want = scene ? { scene, act: act || (want && want.act) || 1 } : null;
    apply();
  };
  // 터치로 오디오가 깨어난 뒤에도 원하는 곡이 나오게 가끔 확인한다
  if (typeof setInterval === 'function') setInterval(() => {
    if (ctx && ctx.state === 'running' && want && !cur && !bgmOff && !muted) apply();
  }, 700);

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
  RS.bgmNow = () => (cur ? cur.id : null);
  // 점검용: 받아 둔 효과음 종류 수, 풀어 둔 곡, 루프 시작점
  RS.audioStats = () => ({ sfx: Object.keys(sfxBuf).length, decoded: [...decoded.keys()], off: cur ? decoded.get(cur.id) && decoded.get(cur.id).off : null, state: ctx ? ctx.state : 'none' });
  RS.setBgmOff = function (off) {
    bgmOff = off;
    try {
      localStorage.setItem('rs_bgm_off', off ? '1' : '0');
    } catch (e) {
      /* 무시 */
    }
    if (!off) RS.unlockAudio();
    apply();
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
    apply();
  };
})((globalThis.RS = globalThis.RS || {}));
