// 전장 캔버스 렌더러
// 논리 해상도는 160×186 그대로 두고, 캔버스는 화면의 실제 픽셀(기기 해상도)로 그린다.
// 모든 사각형·스프라이트는 논리 좌표를 기기 픽셀로 반올림해서 그리므로(PixelCtx) 도트는 또렷하고,
// 움직이는 것은 논리 픽셀 한 칸보다 촘촘하게(부드럽게) 움직인다. 빛은 기기 해상도로 부드럽게 더한다.
(function (RS) {
  'use strict';

  const F = RS.FIELD;

  const THEMES = {
    forest: {
      ground: ['#3c7443', '#447f4a', '#356a3c'], speck: ['#5a9a55', '#2e5e36', '#7cb86a', '#e8d27a', '#e89aa8'],
      path: ['#a88455', '#9a7849', '#b8935f'], pathEdge: '#6e5234', pebble: '#c9a878',
      slot: '#4b4660', slotHi: '#6a6484', slotLo: '#322e44', inner: '#554f6d',
      tuft: ['#2a5a33', '#5fa35a'], amb: 'firefly',
    },
    grave: {
      ground: ['#3a3950', '#403f58', '#34334a'], speck: ['#525170', '#2b2a3d', '#6b6a88', '#8f8aa8', '#4f6b52'],
      path: ['#6f6a86', '#65607c', '#7a7592'], pathEdge: '#44405a', pebble: '#8c87a4',
      slot: '#3e3a55', slotHi: '#5b5676', slotLo: '#2a2740', inner: '#47425f',
      tuft: ['#2b2a3d', '#4f6b52'], amb: 'wisp',
    },
    rift: {
      ground: ['#2a1f3d', '#2f2344', '#251b36'], speck: ['#3d2c57', '#1c1429', '#7a3d8a', '#c050a0', '#4a2f66'],
      path: ['#4a3a5e', '#433555', '#524268'], pathEdge: '#2b203c', pebble: '#b04779',
      slot: '#3a2d50', slotHi: '#5a4776', slotLo: '#231a33', inner: '#43355c',
      tuft: ['#1c1429', '#7a3d8a'], amb: 'mote',
    },
    bog: {
      ground: ['#2f4a3c', '#355244', '#2a4236'], speck: ['#3f6450', '#22382c', '#5a7d5e', '#8fae7a', '#6b5a8a'],
      path: ['#5e5a3e', '#565236', '#686446'], pathEdge: '#3b3826', pebble: '#7d7856',
      slot: '#3f4a55', slotHi: '#5a6674', slotLo: '#29313a', inner: '#47525f',
      tuft: ['#22382c', '#5a7d5e'], amb: 'bubble',
    },
    harbor: {
      ground: ['#24445e', '#284b66', '#203d55'], speck: ['#3a6a8a', '#1a3148', '#5f93b5', '#a8d4e8', '#2f5a78'],
      path: ['#8a6a48', '#7d603f', '#977553'], pathEdge: '#4a3826', pebble: '#a88a64',
      slot: '#3a4458', slotHi: '#56627a', slotLo: '#262d3c', inner: '#434e66',
      tuft: null, amb: 'sparkle',
    },
    heart: {
      ground: ['#3a1422', '#421828', '#33101d'], speck: ['#5a1f33', '#260b15', '#8a2a44', '#e04a52', '#6b2440'],
      path: ['#5c2a3a', '#532433', '#663044'], pathEdge: '#2e0f1a', pebble: '#b04a5e',
      slot: '#43263a', slotHi: '#643a55', slotLo: '#2a1424', inner: '#4d2c44',
      tuft: ['#260b15', '#8a2a44'], amb: 'ember',
    },
  };

  // 적의 걸음걸이: 통통 튀기 / 날기 / 떠다니기 / 뒤뚱 걷기 / 묵직하게 걷기 / 종종걸음 / 맥동
  const GAIT = {
    slime: 'hop', bigSlime: 'hop', slimeKing: 'hop', frog: 'hop',
    bat: 'fly', ghost: 'float', lich: 'float', witch: 'float', bogQueen: 'float', riftLord: 'float',
    golem: 'heavy', ogre: 'heavy', darkKnight: 'heavy', captain: 'heavy', spireShield: 'heavy', spireSpear: 'heavy',
    crab: 'scuttle', riftHeart: 'pulse', dummy: 'still',
  };

  // ── 기기 픽셀에 맞춰 그리는 그리기 도구 ──
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const GLOW = {};
  function glowTex(col) {
    if (GLOW[col]) return GLOW[col];
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, hexA(col, 1));
    g.addColorStop(0.3, hexA(col, 0.5));
    g.addColorStop(1, hexA(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return (GLOW[col] = c);
  }

  class PixelCtx {
    constructor(raw) {
      this.raw = raw;
      this.S = 1;
      this.ox = 0;
      this.oy = 0;
    }
    set fillStyle(v) { this.raw.fillStyle = v; }
    get fillStyle() { return this.raw.fillStyle; }
    set globalAlpha(v) { this.raw.globalAlpha = v; }
    get globalAlpha() { return this.raw.globalAlpha; }
    X(x) { return Math.round((x + this.ox) * this.S); }
    Y(y) { return Math.round((y + this.oy) * this.S); }
    fillRect(x, y, w, h) {
      const x0 = this.X(x);
      const y0 = this.Y(y);
      const x1 = this.X(x + w);
      const y1 = this.Y(y + h);
      if (x1 > x0 && y1 > y0) this.raw.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    drawImage(img, x, y, w, h) {
      if (w === undefined) {
        w = img.width;
        h = img.height;
      }
      const x0 = this.X(x);
      const y0 = this.Y(y);
      const x1 = this.X(x + w);
      const y1 = this.Y(y + h);
      if (x1 > x0 && y1 > y0) this.raw.drawImage(img, x0, y0, x1 - x0, y1 - y0);
    }
    // 흔들림(평행 이동)만 쓴다
    setTransform(a, b, c, d, e, f) {
      this.ox = e;
      this.oy = f;
    }
    // 발밑(ax, ay)을 기준으로 늘이기·기울이기·뒤집기를 적용해 스프라이트를 그린다
    sprite(img, ax, ay, sx, sy, rot, flip) {
      if (!rot && sx === 1 && sy === 1 && !flip) {
        this.drawImage(img, ax - img.width / 2, ay - img.height);
        return;
      }
      const r = this.raw;
      const S = this.S;
      r.save();
      r.translate(Math.round((ax + this.ox) * S), Math.round((ay + this.oy) * S));
      if (rot) r.rotate(rot);
      r.scale((flip ? -1 : 1) * sx * S, sy * S);
      r.drawImage(img, -img.width / 2, -img.height);
      r.restore();
    }
    // 부드러운 빛 (더하기 합성)
    glow(x, y, rad, col, a) {
      if (a <= 0.01) return;
      const r = this.raw;
      const S = this.S;
      const R = rad * S;
      const pa = r.globalAlpha;
      r.globalCompositeOperation = 'lighter';
      r.imageSmoothingEnabled = true;
      r.globalAlpha = Math.min(1, a);
      r.drawImage(glowTex(col), (x + this.ox) * S - R, (y + this.oy) * S - R, 2 * R, 2 * R);
      r.globalAlpha = pa;
      r.imageSmoothingEnabled = false;
      r.globalCompositeOperation = 'source-over';
    }
  }

  const ease = {
    out: (k) => 1 - (1 - k) * (1 - k),
    inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  function Renderer(canvas) {
    this.canvas = canvas;
    canvas.width = F.W;
    canvas.height = F.H;
    this.raw = canvas.getContext('2d');
    this.raw.imageSmoothingEnabled = false;
    this.ctx = new PixelCtx(this.raw);
    this.bg = null;
    this.theme = null;
    this.shots = [];
    this.fxs = [];
    this.nums = [];
    this.parts = [];
    this.amb = [];
    // 유닛 칸마다 연출 상태
    this.atk = new Float32Array(F.SIZE); // 공격 모션 남은 시간
    this.atkDur = new Float32Array(F.SIZE);
    this.face = new Int8Array(F.SIZE).fill(1); // 1 오른쪽, -1 왼쪽
    this.lungeDir = [];
    for (let i = 0; i < F.SIZE; i++) this.lungeDir.push({ x: 1, y: 0 });
    this.pop = new Float32Array(F.SIZE); // 소환·합성 연출 남은 시간
    this.popMax = new Float32Array(F.SIZE);
    this.popKind = new Uint8Array(F.SIZE); // 1 소환(떨어짐), 2 합성(빛)
    this.popDust = new Uint8Array(F.SIZE);
    this.shake = 0;
    this.t = 0;
    this.sel = -1;
    this.drag = null;
    this.noReach = new Uint8Array(F.SIZE);
    this.vignette = null;
  }
  const P = Renderer.prototype;

  // 화면 크기에 맞춰 캔버스를 기기 해상도로 만든다. cssScale: 논리 픽셀 하나의 CSS 크기
  P.resize = function (cssScale, dpr) {
    const W = Math.max(F.W, Math.round(F.W * cssScale * dpr));
    const S = W / F.W;
    const H = Math.round(F.H * S);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.raw.imageSmoothingEnabled = false;
      this.vignette = null;
    }
    this.ctx.S = S;
    return { w: W / dpr, h: H / dpr };
  };

  P.setTheme = function (name) {
    if (this.theme === name && this.bg) return;
    this.theme = name;
    this.bg = buildBackground(THEMES[name] || THEMES.forest, name);
    this.amb.length = 0;
  };

  function onPath(px, py, o) {
    return px >= F.L - o && px < F.R + o && py >= F.T - o && py < F.B + o && !(px >= F.L + o && px < F.R - o && py >= F.T + o && py < F.B - o);
  }

  function buildBackground(th, name) {
    const c = document.createElement('canvas');
    c.width = F.W;
    c.height = F.H;
    const x = c.getContext('2d');
    const rng = new RS.Rng(name.length * 977 + 13);
    x.fillStyle = th.ground[0];
    x.fillRect(0, 0, F.W, F.H);
    for (let k = 0; k < 900; k++) {
      x.fillStyle = rng.pick(th.ground);
      x.fillRect(rng.int(F.W), rng.int(F.H), 1 + rng.int(2), 1);
    }
    for (let k = 0; k < 140; k++) {
      x.fillStyle = rng.pick(th.speck);
      x.fillRect(rng.int(F.W), rng.int(F.H), 1, 1);
    }
    // 길 (폭 18 사각 루프): 바깥 가장자리는 밝게, 안쪽 가장자리는 그늘지게
    const o = 9;
    x.fillStyle = th.pathEdge;
    x.fillRect(F.L - o - 1, F.T - o - 1, F.R - F.L + 2 * o + 2, F.B - F.T + 2 * o + 2);
    x.fillStyle = th.path[0];
    x.fillRect(F.L - o, F.T - o, F.R - F.L + 2 * o, F.B - F.T + 2 * o);
    x.fillStyle = th.path[2];
    x.fillRect(F.L - o, F.T - o, F.R - F.L + 2 * o, 1);
    x.fillRect(F.L - o, F.T - o, 1, F.B - F.T + 2 * o);
    // 안쪽 땅
    x.fillStyle = th.pathEdge;
    x.fillRect(F.L + o - 1, F.T + o - 1, F.R - F.L - 2 * o + 2, F.B - F.T - 2 * o + 2);
    x.fillStyle = th.ground[1];
    x.fillRect(F.L + o, F.T + o, F.R - F.L - 2 * o, F.B - F.T - 2 * o);
    x.fillStyle = th.path[1];
    x.fillRect(F.L + o - 2, F.T + o - 2, F.R - F.L - 2 * o + 4, 1);
    x.fillRect(F.L + o - 2, F.T + o - 2, 1, F.B - F.T - 2 * o + 4);
    for (let k = 0; k < 500; k++) {
      const px = rng.int(F.W);
      const py = rng.int(F.H);
      if (!onPath(px, py, o)) continue;
      x.fillStyle = rng.chance(0.2) ? th.pebble : rng.pick(th.path);
      x.fillRect(px, py, rng.chance(0.3) ? 2 : 1, 1);
    }
    // 돌멩이: 밝은 윗면 + 아래 그림자
    for (let k = 0; k < 60; k++) {
      const px = rng.int(F.W);
      const py = rng.int(F.H);
      if (!onPath(px, py, o - 1) || !onPath(px + 2, py + 2, o - 1)) continue;
      x.fillStyle = th.pathEdge;
      x.fillRect(px, py + 1, 2, 1);
      x.fillStyle = th.pebble;
      x.fillRect(px, py, 2, 1);
    }
    // 풀포기 (길 밖 땅)
    if (th.tuft) {
      for (let k = 0; k < 70; k++) {
        const px = rng.int(F.W - 2);
        const py = 2 + rng.int(F.H - 4);
        if (onPath(px, py, o + 2) || onPath(px + 2, py, o + 2)) continue;
        if (px > F.GX - 3 && px < F.GX + F.COLS * F.SLOT + 2 && py > F.GY - 3 && py < F.GY + F.ROWS * F.SLOT + 2) continue;
        x.fillStyle = th.tuft[0];
        x.fillRect(px, py, 1, 2);
        x.fillRect(px + 2, py, 1, 2);
        x.fillStyle = th.tuft[1];
        x.fillRect(px + 1, py - 1, 1, 3);
      }
    }
    // 칸
    for (let i = 0; i < F.SIZE; i++) {
      const cx = F.GX + (i % F.COLS) * F.SLOT;
      const cy = F.GY + Math.floor(i / F.COLS) * F.SLOT;
      const inner = RS.isInner(i);
      x.fillStyle = th.slotLo;
      x.fillRect(cx + 1, cy + 1, F.SLOT - 2, F.SLOT - 2);
      x.fillStyle = inner ? th.inner : th.slot;
      x.fillRect(cx + 2, cy + 2, F.SLOT - 4, F.SLOT - 4);
      x.fillStyle = th.slotHi;
      x.fillRect(cx + 2, cy + 2, F.SLOT - 4, 1);
      x.fillRect(cx + 2, cy + 2, 1, F.SLOT - 4);
    }
    // 안쪽 칸 2×3 둘레 점선 (원거리 유닛 자리)
    {
      const x0 = F.GX + F.SLOT - 1;
      const x1 = F.GX + 3 * F.SLOT;
      const y0 = F.GY + F.SLOT - 1;
      const y1 = F.GY + 4 * F.SLOT;
      x.fillStyle = th.slotHi;
      for (let px = x0; px <= x1; px += 2) {
        x.fillRect(px, y0, 1, 1);
        x.fillRect(px, y1, 1, 1);
      }
      for (let py = y0; py <= y1; py += 2) {
        x.fillRect(x0, py, 1, 1);
        x.fillRect(x1, py, 1, 1);
      }
    }
    // 균열 문 (적이 나오고, 한 바퀴를 돌면 들어가는 곳)
    const pr = 7;
    for (let dy = -pr; dy <= pr; dy++) {
      for (let dx = -pr; dx <= pr; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > pr + 0.4) continue;
        x.fillStyle = d > pr - 1 ? '#1d1428' : d > pr - 2 ? '#8a4fc9' : d > pr - 3.5 ? '#3b2160' : '#170d22';
        x.fillRect(F.L + dx, F.T + dy, 1, 1);
      }
    }
    return c;
  }

  // 가장자리를 살짝 어둡게 (기기 해상도로 부드럽게)
  P.buildVignette = function () {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.hypot(W, H) * 0.56);
    g.addColorStop(0, 'rgba(10,6,18,0)');
    g.addColorStop(1, 'rgba(10,6,18,0.42)');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    this.vignette = c;
  };

  // ── 파티클 ──
  // o: { sp:[최소,최대] 속도, ang: 중심 각, spread: 퍼짐, g: 중력, life:[최소,최대], cols:[], size, drag, glow }
  P.emit = function (x, y, n, o) {
    const parts = this.parts;
    for (let k = 0; k < n; k++) {
      if (parts.length >= 420) return;
      const a = (o.ang == null ? -Math.PI / 2 : o.ang) + (Math.random() - 0.5) * (o.spread == null ? Math.PI * 2 : o.spread);
      const sp = rnd(o.sp ? o.sp[0] : 10, o.sp ? o.sp[1] : 30);
      const life = rnd(o.life ? o.life[0] : 0.3, o.life ? o.life[1] : 0.6);
      parts.push({
        x: x + (o.jit ? rnd(-o.jit, o.jit) : 0), y: y + (o.jit ? rnd(-o.jit, o.jit) : 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: o.g || 0, drag: o.drag || 0,
        life, max: life, col: pick(o.cols || ['#ffffff']), size: o.size || 1, glow: o.glow || 0,
      });
    }
  };
  P.drawParts = function (ctx, dt) {
    const parts = this.parts;
    let w = 0;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      p.life -= dt;
      if (p.life <= 0) continue;
      parts[w++] = p;
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = Math.min(1, (p.life / p.max) * 1.8);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      if (p.glow) ctx.glow(p.x, p.y, p.glow, p.col, a * 0.35);
    }
    ctx.globalAlpha = 1;
    parts.length = w;
  };

  // ── 분위기: 막마다 떠다니는 것들 (반딧불·도깨비불·거품·물빛·균열 입자·불티) ──
  const AMB = {
    firefly: { n: 9, cols: ['#e6f58a', '#f5e27a'] },
    wisp: { n: 9, cols: ['#bfe0ff', '#9ab8ff'] },
    bubble: { n: 10, cols: ['#b8e8a0', '#8fcf8a'] },
    sparkle: { n: 12, cols: ['#ffffff', '#a8d4e8'] },
    mote: { n: 14, cols: ['#f07fb0', '#a061e8', '#d3a0f7'] },
    ember: { n: 14, cols: ['#ff9a3d', '#e04a52', '#ffe46b'] },
  };
  P.spawnAmb = function (kind, fresh) {
    const A = AMB[kind];
    const life = kind === 'sparkle' ? rnd(0.5, 1.2) : kind === 'bubble' ? rnd(1.2, 2.4) : rnd(3, 7);
    const m = {
      kind, col: pick(A.cols), x: rnd(2, F.W - 2), y: rnd(2, F.H - 2), vx: 0, vy: 0,
      life, max: life, ph: Math.random() * 6.28,
    };
    if (kind === 'wisp' || kind === 'mote') m.vy = -rnd(2, 5);
    if (kind === 'ember') {
      m.vy = -rnd(6, 12);
      if (!fresh) m.y = F.H + 2;
    }
    if (kind === 'bubble') m.vy = -rnd(1.5, 3.5);
    if (fresh) m.life = rnd(0, life); // 처음에는 수명이 제각각이게
    this.amb.push(m);
  };
  P.drawAmbient = function (ctx, dt) {
    const th = THEMES[this.theme] || THEMES.forest;
    const kind = th.amb;
    if (!kind) return;
    const A = AMB[kind];
    while (this.amb.length < A.n) this.spawnAmb(kind, this.amb.length < A.n && this.t < 0.1);
    const t = this.t;
    for (let k = 0; k < this.amb.length; k++) {
      const m = this.amb[k];
      m.life -= dt;
      if (m.life <= 0) {
        this.amb.splice(k--, 1);
        this.spawnAmb(kind, false);
        continue;
      }
      const age = m.max - m.life;
      const fade = Math.min(1, age / 0.6, m.life / 0.6);
      if (kind === 'firefly') {
        m.vx += rnd(-12, 12) * dt;
        m.vy += rnd(-12, 12) * dt;
        m.vx *= 0.98;
        m.vy *= 0.98;
        const blink = 0.45 + 0.55 * Math.max(0, Math.sin(t * 2.2 + m.ph));
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        ctx.globalAlpha = fade * blink;
        ctx.fillStyle = m.col;
        ctx.fillRect(m.x - 0.5, m.y - 0.5, 1, 1);
        ctx.glow(m.x, m.y, 4, m.col, fade * blink * 0.45);
      } else if (kind === 'wisp' || kind === 'mote') {
        m.y += m.vy * dt;
        const sx = m.x + Math.sin(t * 1.3 + m.ph) * (kind === 'mote' ? 3 : 1.5);
        ctx.globalAlpha = fade * 0.8;
        ctx.fillStyle = m.col;
        ctx.fillRect(sx - 0.5, m.y - 0.5, 1, 1);
        ctx.glow(sx, m.y, kind === 'mote' ? 3.5 : 5, m.col, fade * 0.35);
      } else if (kind === 'ember') {
        m.y += m.vy * dt;
        const sx = m.x + Math.sin(t * 2 + m.ph) * 2;
        const fl = 0.6 + 0.4 * Math.sin(t * 13 + m.ph);
        ctx.globalAlpha = fade * fl;
        ctx.fillStyle = m.col;
        ctx.fillRect(sx - 0.5, m.y - 0.5, 1, 1);
        ctx.glow(sx, m.y, 3, m.col, fade * fl * 0.4);
      } else if (kind === 'bubble') {
        m.y += m.vy * dt;
        ctx.globalAlpha = fade * 0.7;
        ctx.fillStyle = m.col;
        if (m.life > 0.15) {
          ctx.fillRect(m.x - 1, m.y, 1, 1);
          ctx.fillRect(m.x + 1, m.y, 1, 1);
          ctx.fillRect(m.x, m.y - 1, 1, 1);
          ctx.fillRect(m.x, m.y + 1, 1, 1);
        } else {
          // 톡 터진다
          ctx.fillRect(m.x - 2, m.y, 1, 1);
          ctx.fillRect(m.x + 2, m.y, 1, 1);
          ctx.fillRect(m.x, m.y - 2, 1, 1);
        }
      } else if (kind === 'sparkle') {
        const k2 = Math.sin((age / m.max) * Math.PI);
        ctx.globalAlpha = k2;
        ctx.fillStyle = m.col;
        ctx.fillRect(m.x, m.y, 1, 1);
        if (k2 > 0.6) {
          ctx.globalAlpha = (k2 - 0.6) * 1.8;
          ctx.fillRect(m.x - 1, m.y, 3, 1);
          ctx.fillRect(m.x, m.y - 1, 1, 3);
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  // ── 이벤트 수신 ──
  P.consume = function (b) {
    const list = b.fx;
    for (let k = 0; k < list.length; k++) {
      const ev = list[k];
      switch (ev.k) {
        case 'shot':
          this.addShot(ev);
          if (ev.cls === 'knight' && !ev.miss) {
            // 베기의 여파: 광역 베기 범위를 보여 주는 충격파, 치명타면 살짝 흔들림
            if (this.fxs.length < 60) this.fxs.push({ k: 'ring', x: ev.x2, y: ev.y2 - 3, r: RS.CLASS.knight.cleaveR, t: 0.18, max: 0.18, col: ev.crit ? '#ffe46b' : RS.TIER[ev.tier].light });
            if (ev.crit) this.shake = Math.max(this.shake, 0.08);
          }
          if (ev.slot >= 0) this.startAttack(b, ev);
          break;
        case 'num':
          // 숫자가 너무 많으면 치명타·큰 적 위주로만 띄운다
          if (this.nums.length < (ev.crit ? 16 : 7)) {
            const life = ev.crit ? 0.85 : 0.6;
            this.nums.push({ x: ev.x + rnd(-3, 3), y: ev.y - rnd(0, 4), vx: rnd(-10, 10), vy: ev.crit ? -34 : -26, s: RS.fmtNum(ev.v), c: ev.crit ? 'y' : 'w', t: life, max: life, big: ev.crit ? 1.9 : 1.45 });
          }
          break;
        case 'boom':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0.25, max: 0.25, col: RS.TIER[ev.tier].light, glow: true });
          this.emit(ev.x, ev.y, 6, { sp: [15, 40], life: [0.2, 0.45], cols: ['#ff9a3d', '#ffe46b', RS.TIER[ev.tier].light], g: 30, drag: 3, glow: 2.5 });
          break;
        case 'kill': {
          const cols = RS.SPR_COL[ev.type] || ['#ffffff', '#b8c2d3'];
          this.fxs.push({ k: 'pop', name: ev.type, x: ev.x, y: ev.y + 5, t: 0.2, max: 0.2 });
          this.emit(ev.x, ev.y, ev.big ? 20 : 8, { sp: [20, ev.big ? 70 : 45], life: [0.3, 0.6], cols: cols.concat(['#fff6e6']), g: 90, drag: 1.5, size: ev.big ? 1.5 : 1, jit: 2 });
          if (ev.gold >= 1) {
            this.nums.push({ x: ev.x, y: ev.y - 8, vx: 0, vy: -18, s: '+' + Math.floor(ev.gold), c: 'g', t: 0.75, max: 0.75, big: 1.3 });
            this.emit(ev.x, ev.y - 3, Math.min(4, 1 + Math.floor(ev.gold / 3)), { sp: [25, 45], ang: -Math.PI / 2, spread: 1.4, life: [0.35, 0.55], cols: ['#ffe46b', '#f5c44a'], g: 160, glow: 2 });
          }
          if (ev.big) this.shake = Math.max(this.shake, 0.25);
          break;
        }
        case 'leak':
          this.fxs.push({ k: 'leak', x: F.L, y: F.T, t: 0.5, max: 0.5 });
          this.nums.push({ x: F.L + 6, y: F.T + 4, vx: 6, vy: -16, s: '-' + Math.round(ev.v), c: 'r', t: 0.9, max: 0.9, big: 1.6 });
          this.emit(F.L, F.T, 12, { sp: [20, 55], life: [0.3, 0.6], cols: ['#e04a52', '#f07fb0', '#ffffff'], drag: 2.5, glow: 2 });
          this.shake = Math.max(this.shake, 0.18);
          break;
        case 'summon':
          this.startPop(ev.slot, 1, 0.38);
          if (ev.twin != null) this.startPop(ev.twin, 1, 0.38);
          if (ev.tier > 0) {
            const c = RS.slotCenter(ev.slot);
            this.fxs.push({ k: 'beam', x: c.x, y: c.y + 7, t: 0.5, max: 0.5, col: RS.TIER[ev.tier].light });
          }
          break;
        case 'merge':
          for (const r of ev.res.results) {
            this.startPop(r.slot, 2, 0.5);
            const c = RS.slotCenter(r.slot);
            const col = RS.TIER[r.tier].light;
            this.fxs.push({ k: 'star', x: c.x, y: c.y, t: 0.5, max: 0.5, col });
            this.fxs.push({ k: 'beam', x: c.x, y: c.y + 7, t: 0.55, max: 0.55, col });
            // 사방에서 빛 조각이 모여든다
            for (let j = 0; j < 10; j++) {
              const a = (j / 10) * Math.PI * 2;
              const d = 16;
              if (this.parts.length < 420) this.parts.push({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d, vx: -Math.cos(a) * d / 0.25, vy: -Math.sin(a) * d / 0.25, g: 0, drag: 0, life: 0.25, max: 0.25, col, size: 1, glow: 3 });
            }
            this.emit(c.x, c.y, 10, { sp: [25, 55], life: [0.3, 0.55], cols: [col, '#ffffff'], drag: 3, glow: 3 });
            if (r.tier >= 3) this.shake = Math.max(this.shake, 0.15);
          }
          break;
        case 'heal':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0.4, max: 0.4, col: '#62c35f', glow: true });
          break;
        case 'haste':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0.4, max: 0.4, col: '#a061e8', glow: true });
          break;
        case 'summonFx':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: 14, t: 0.4, max: 0.4, col: '#f07fb0', glow: true });
          break;
        case 'keg':
          this.fxs.push({ k: 'flash', t: 0.2, max: 0.2, col: '#ff9a3d' });
          this.emit(F.L, F.T, 16, { sp: [30, 80], life: [0.3, 0.6], cols: ['#ff9a3d', '#ffe46b', '#e04a52'], g: 40, drag: 2, glow: 3 });
          break;
        case 'bomb':
          this.fxs.push({ k: 'flash', t: 0.3, max: 0.3, col: '#ffe46b' });
          this.shake = 0.35;
          break;
        case 'freezeAll':
          this.fxs.push({ k: 'flash', t: 0.3, max: 0.3, col: '#a8ecff' });
          break;
        case 'rift':
          for (const c of ev.cells) this.fxs.push({ k: 'riftHit', i: c, t: 0.4, max: 0.4 });
          this.shake = Math.max(this.shake, 0.2);
          break;
        case 'mythic': {
          // 신화 스킬: 시전한 유닛 칸에서 빛기둥이 솟고, 스킬마다 다른 연출
          const T4 = RS.TIER[4];
          if (ev.cx != null) this.fxs.push({ k: 'pillar', x: ev.cx, y: ev.cy, t: 0.5, max: 0.5, col: ev.cls === 'frost' ? '#a8ecff' : ev.cls === 'mage' ? '#ff9a3d' : ev.cls === 'archer' ? '#ffe46b' : T4.light });
          if (ev.cls === 'knight') this.fxs.push({ k: 'quake', x: ev.x, y: ev.y, r: ev.r, t: 0.5, max: 0.5, seed: Math.random() * 6 });
          if (ev.cls === 'frost') this.fxs.push({ k: 'shards', x: ev.x, y: ev.y, r: ev.r, t: 0.6, max: 0.6, seed: Math.random() * 6 });
          if (ev.cls === 'archer') this.fxs.push({ k: 'flash', t: 0.15, max: 0.15, col: '#ffe46b' });
          if (ev.cls === 'knight') {
            this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0.35, max: 0.35, col: T4.light, glow: true });
            this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r * 0.6, t: 0.3, max: 0.3, col: '#ffffff' });
            this.emit(ev.x, ev.y + 4, 16, { sp: [30, 70], ang: -Math.PI / 2, spread: Math.PI * 1.6, life: [0.3, 0.6], cols: ['#b8a58a', '#8d7a60', '#fff6e6'], g: 140, drag: 1 });
            this.shake = Math.max(this.shake, 0.25);
          } else if (ev.cls === 'mage') {
            this.fxs.push({ k: 'meteor', x: ev.x, y: ev.y, r: ev.r, t: 0.45, max: 0.45 });
          } else if (ev.cls === 'frost') {
            this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0.45, max: 0.45, col: '#a8ecff', glow: true });
            this.fxs.push({ k: 'flash', t: 0.25, max: 0.25, col: '#a8ecff' });
          } else if (ev.cls === 'rogue') {
            this.fxs.push({ k: 'star', x: ev.x, y: ev.y, t: 0.35, max: 0.35, col: T4.light });
            this.emit(ev.x, ev.y, 8, { sp: [20, 45], life: [0.25, 0.45], cols: ['#2a1f3d', '#a061e8', T4.light], drag: 3 });
          }
          break;
        }
        case 'bossDown':
          this.shake = 0.5;
          this.fxs.push({ k: 'flash', t: 0.35, max: 0.35, col: '#ffffff' });
          break;
        case 'bossSkill':
          if (ev.id === 'glue') this.emit(ev.x, ev.y - 6, 10, { sp: [20, 50], ang: -Math.PI / 2, spread: 2.4, life: [0.3, 0.6], cols: ['#9ee06a', '#62c35f', '#5a9e3a'], g: 120, size: 1.5 });
          else if (ev.id === 'pulse') {
            // 심장 고동: 붉은 파동이 퍼지고 화면이 두근거린다
            this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 6, r: 40, t: 0.5, max: 0.5, col: '#e04a52', glow: true });
            this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 6, r: 24, t: 0.4, max: 0.4, col: '#f07fb0' });
            this.fxs.push({ k: 'flash', t: 0.25, max: 0.25, col: '#e04a52' });
            this.shake = Math.max(this.shake, 0.15);
          } else if (ev.id === 'shield') {
            this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 6, r: 16, t: 0.45, max: 0.45, col: '#a8ecff', glow: true });
            this.emit(ev.x, ev.y - 6, 10, { sp: [10, 25], life: [0.3, 0.5], cols: ['#a8ecff', '#ffffff'], drag: 2, glow: 2 });
          } else if (ev.id === 'rally') {
            this.fxs.push({ k: 'flash', t: 0.18, max: 0.18, col: '#a061e8' });
          }
          break;
        case 'castStart': {
          // 기술 준비: 보스 둘레에 기술 색의 고리가 조여든다
          const col = CAST_COL[ev.seal ? 'seal' : ev.id] || '#ffe46b';
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 6, r: 20, t: 0.35, max: 0.35, col, glow: true });
          break;
        }
        case 'plague':
          // 역병 확산: 쓰러진 자리에서 초록·주황 포자가 퍼진다
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 3, r: 20, t: 0.4, max: 0.4, col: '#9ee06a' });
          this.emit(ev.x, ev.y - 3, 8, { sp: [15, 35], life: [0.3, 0.55], cols: ['#9ee06a', '#62c35f', '#ff9a3d'], drag: 2, glow: 1.5 });
          break;
        case 'doze':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 6, r: 22, t: 0.6, max: 0.6, col: '#d7e6ff', glow: true });
          break;
        case 'wake':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 6, r: 26, t: 0.45, max: 0.45, col: '#e05ad0', glow: true });
          this.shake = Math.max(this.shake, 0.15);
          break;
        case 'crossWarn':
          // 돌진 경고: 가로지를 길에 붉은 화살표
          this.fxs.push({ k: 'crossLine', x1: ev.x1, y1: ev.y1, x2: ev.x2, y2: ev.y2, t: ev.t + 0.2, max: ev.t + 0.2 });
          break;
        case 'crossGo':
          this.shake = Math.max(this.shake, 0.15);
          break;
        case 'crossHit': {
          const cc = RS.slotCenter(ev.slot);
          this.emit(cc.x, cc.y + 4, 8, { sp: [20, 50], life: [0.25, 0.5], cols: ['#d8cbb0', '#a8987a', '#ffffff'], g: 60, drag: 2.5 });
          this.fxs.push({ k: 'ring', x: cc.x, y: cc.y, r: 12, t: 0.3, max: 0.3, col: '#ffe46b' });
          break;
        }
        case 'crossEnd':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: 16, t: 0.4, max: 0.4, col: '#d8cbb0' });
          this.emit(ev.x, ev.y + 3, 12, { sp: [25, 60], ang: -Math.PI / 2, spread: Math.PI * 1.5, life: [0.3, 0.55], cols: ['#d8cbb0', '#a8987a'], g: 120, drag: 1.5 });
          this.shake = Math.max(this.shake, 0.25);
          break;
        case 'seal':
          for (const i of ev.slots) {
            const cc = RS.slotCenter(i);
            this.fxs.push({ k: 'ring', x: cc.x, y: cc.y, r: 14, t: 0.5, max: 0.5, col: '#a061e8', glow: true });
            this.emit(cc.x, cc.y, 10, { sp: [10, 30], life: [0.3, 0.6], cols: ['#5e3593', '#a061e8', '#2a1f3d'], drag: 2, glow: 2 });
          }
          this.fxs.push({ k: 'flash', t: 0.25, max: 0.25, col: '#5e3593' });
          break;
        case 'unseal':
          for (const i of ev.slots) {
            const cc = RS.slotCenter(i);
            this.fxs.push({ k: 'ring', x: cc.x, y: cc.y, r: 14, t: 0.45, max: 0.45, col: '#ffe46b', glow: true });
            this.emit(cc.x, cc.y, 12, { sp: [20, 50], life: [0.3, 0.6], cols: ['#ffe46b', '#ffffff', '#a8ecff'], drag: 2, glow: 2.5 });
          }
          break;
        case 'shuffle':
          for (const i of ev.slots) {
            const cc = RS.slotCenter(i);
            this.fxs.push({ k: 'star', x: cc.x, y: cc.y, t: 0.45, max: 0.45, col: '#d3a0f7' });
          }
          this.fxs.push({ k: 'flash', t: 0.2, max: 0.2, col: '#a061e8' });
          break;
        case 'plunder':
          this.emit(ev.x, ev.y - 6, 10, { sp: [20, 50], ang: -Math.PI / 2, spread: 1.6, life: [0.4, 0.7], cols: ['#ffe46b', '#f5c44a'], g: 90, glow: 2 });
          this.nums.push({ x: ev.x, y: ev.y - 12, vx: 0, vy: -16, s: '-' + ev.g, c: 'g', t: 0.9, max: 0.9, big: 1.5 });
          break;
        case 'soul':
          // 리치가 영혼을 빨아들인다
          for (let j = 0; j < 5; j++) {
            const q = j / 5;
            if (this.parts.length < 400) this.parts.push({ x: ev.x1 + (ev.x2 - ev.x1) * q * 0.2, y: ev.y1 + (ev.y2 - ev.y1) * q * 0.2, vx: (ev.x2 - ev.x1) * 1.6, vy: (ev.y2 - ev.y1) * 1.6, g: 0, drag: 0, life: 0.5, max: 0.5, col: '#bfe0ff', size: 1, glow: 2 });
          }
          break;
        case 'slowCells':
          for (const c of ev.cells) {
            const cc = RS.slotCenter(c);
            if (ev.kind === 'glue') this.emit(cc.x, cc.y - 4, 3, { sp: [10, 25], ang: Math.PI / 2, spread: 2, life: [0.25, 0.45], cols: ['#9ee06a', '#62c35f'], g: 60, size: 1.5 });
          }
          break;
        case 'shieldBreak':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 6, r: 18, t: 0.35, max: 0.35, col: '#e8fbff', glow: true });
          this.emit(ev.x, ev.y - 6, 16, { sp: [30, 70], life: [0.3, 0.55], cols: ['#a8ecff', '#e8fbff', '#52b6e0'], g: 80, drag: 1.5, glow: 2 });
          this.shake = Math.max(this.shake, 0.15);
          break;
        case 'blink': {
          // 순간이동: 떠난 자리와 나타난 자리에 균열, 그 사이에 보랏빛 자취
          this.fxs.push({ k: 'ring', x: ev.x1, y: ev.y1, r: 14, t: 0.4, max: 0.4, col: '#a061e8', glow: true });
          this.fxs.push({ k: 'ring', x: ev.x2, y: ev.y2, r: 18, t: 0.45, max: 0.45, col: '#f07fb0', glow: true });
          for (let j = 0; j <= 12; j++) {
            const q = j / 12;
            this.emit(ev.x1 + (ev.x2 - ev.x1) * q, ev.y1 + (ev.y2 - ev.y1) * q, 1, { sp: [2, 8], life: [0.3, 0.6], cols: ['#a061e8', '#f07fb0', '#d3a0f7'], glow: 2 });
          }
          this.shake = Math.max(this.shake, 0.2);
          break;
        }
        case 'phase2':
          this.fxs.push({ k: 'flash', t: 0.4, max: 0.4, col: '#e04a52' });
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y - 6, r: 30, t: 0.6, max: 0.6, col: '#ff6b86', glow: true });
          this.shake = Math.max(this.shake, 0.45);
          break;
        case 'wave':
          // 새 웨이브: 균열 문이 크게 일렁인다
          this.fxs.push({ k: 'ring', x: F.L, y: F.T, r: 16, t: 0.45, max: 0.45, col: '#d3a0f7', glow: true });
          break;
        case 'boss':
          // 보스 등장: 문에서 붉은 빛이 터지고 화면이 흔들린다
          this.shake = Math.max(this.shake, 0.4);
          this.fxs.push({ k: 'flash', t: 0.3, max: 0.3, col: '#e04a52' });
          this.fxs.push({ k: 'ring', x: F.L, y: F.T, r: 26, t: 0.6, max: 0.6, col: '#e04a52', glow: true });
          this.emit(F.L, F.T, 24, { sp: [30, 80], life: [0.4, 0.8], cols: ['#e04a52', '#f07fb0', '#a061e8'], drag: 2, glow: 3 });
          break;
      }
    }
    list.length = 0;
    b.numCount = 0;
  };

  // 공격 모션 시작: 대상 쪽으로 몸을 돌리고, 직업마다 다른 동작
  const ATK_DUR = { knight: 0.26, archer: 0.22, mage: 0.3, rogue: 0.16, frost: 0.26 };
  P.startAttack = function (b, ev) {
    const i = ev.slot;
    const dx = ev.x2 - ev.x1;
    const dy = ev.y2 - ev.y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    if (Math.abs(dx) > 2) this.face[i] = dx < 0 ? -1 : 1;
    const D = ATK_DUR[ev.cls] || 0.2;
    // 연사하는 유닛은 모션이 거의 끝났을 때만 새로 시작한다 (덜덜 떨리지 않게)
    if (this.atk[i] > this.atkDur[i] * 0.35) return;
    this.atk[i] = D;
    this.atkDur[i] = D;
    this.lungeDir[i].x = dx / len;
    this.lungeDir[i].y = dy / len;
    if (ev.cls === 'frost') {
      const c = RS.slotCenter(i);
      this.emit(c.x, c.y - 2, 2, { sp: [6, 14], ang: -Math.PI / 2, spread: 1.2, life: [0.3, 0.5], cols: ['#a8ecff', '#ffffff'], glow: 2 });
    }
  };

  P.startPop = function (slot, kind, dur) {
    if (slot == null || slot < 0) return;
    this.pop[slot] = dur;
    this.popMax[slot] = dur;
    this.popKind[slot] = kind;
    this.popDust[slot] = 0;
  };

  P.addShot = function (ev) {
    if (this.shots.length > 90) return;
    const dur = ev.cls === 'knight' ? (ev.crit ? 0.26 : 0.2) : ev.cls === 'rogue' ? 0.1 : ev.cls === 'mage' ? 0.16 : 0.12;
    // 전사는 번갈아 가며 반대 방향으로 벤다
    this.slashFlip = !this.slashFlip;
    this.shots.push({ cls: ev.cls, tier: ev.tier, x1: ev.x1, y1: ev.y1 - 3, x2: ev.x2, y2: ev.y2, t: dur, max: dur, crit: ev.crit, flip: this.slashFlip, miss: ev.miss, rain: ev.rain, spin: Math.random() * 6 });
  };

  // ── 그리기 ──
  P.draw = function (b, dt) {
    const ctx = this.ctx;
    this.t += dt;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake -= dt;
      // 부드럽게 흔들리다 잦아든다
      const A = Math.min(2.2, this.shake * 7 + 0.4);
      sx = (Math.sin(this.t * 71) * 0.6 + Math.sin(this.t * 133) * 0.4) * A;
      sy = (Math.cos(this.t * 83) * 0.6 + Math.sin(this.t * 157) * 0.4) * A;
    }
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    this.raw.fillStyle = '#15111d';
    this.raw.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.bg, 0, 0);
    this.drawPortal(ctx, dt);
    if (b) {
      this.drawRift(ctx, b);
      this.drawSlots(ctx, b, dt);
      this.drawEnemies(ctx, b, dt);
      this.drawCasts(ctx, b, dt);
    }
    this.drawShots(ctx, dt);
    this.drawFx(ctx, dt);
    this.drawParts(ctx, dt);
    this.drawAmbient(ctx, dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette) this.buildVignette();
    this.raw.drawImage(this.vignette, 0, 0);
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    this.drawNums(ctx, dt);
    if (b) this.drawDrag(ctx, b);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  P.drawPortal = function (ctx, dt) {
    const cx = F.L;
    const cy = F.T;
    const t = this.t;
    ctx.glow(cx, cy, 13 + Math.sin(t * 2.4) * 1.5, '#a061e8', 0.5);
    const cols = ['#f07fb0', '#a061e8', '#5e3593'];
    for (let k = 0; k < 12; k++) {
      const a = t * 3 + (k * Math.PI * 2) / 12;
      const r = 2.5 + (k % 3) * 1.7;
      ctx.fillStyle = cols[k % 3];
      ctx.fillRect(cx + Math.cos(a) * r - 0.5, cy + Math.sin(a) * r - 0.5, 1, 1);
    }
    ctx.fillStyle = '#f7d9ff';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    // 주변 입자가 문으로 빨려 든다
    if (dt > 0 && Math.random() < dt * 6 && this.parts.length < 380) {
      const a = Math.random() * Math.PI * 2;
      const d = rnd(10, 15);
      this.parts.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.cos(a) * d * 1.6, vy: -Math.sin(a) * d * 1.6, g: 0, drag: 0, life: 0.55, max: 0.55, col: pick(cols), size: 1, glow: 0 });
    }
  };

  // 경고: 곧 기절(붉은 보라)·점액(초록)·고동(붉은) 칸
  const WARN_COL = { glue: [120, 200, 80], pulse: [224, 74, 82] };
  P.drawRift = function (ctx, b) {
    for (const w of b.riftWarn) {
      const blink = Math.floor(this.t * 10) % 2 === 0;
      const col = WARN_COL[w.kind] || [240, 60, 90];
      const a = w.kind === 'pulse' ? (blink ? 0.22 : 0.1) : blink ? 0.45 : 0.2;
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      for (const c of w.cells) {
        const x = F.GX + (c % F.COLS) * F.SLOT;
        const y = F.GY + Math.floor(c / F.COLS) * F.SLOT;
        ctx.fillRect(x + 1, y + 1, F.SLOT - 2, F.SLOT - 2);
      }
    }
  };

  // 룬: 칸을 룬 색으로 물들이고 네 귀퉁이 표시, 금 간 칸은 금을 그린다
  const CRACK = [[7, 4], [8, 5], [8, 6], [9, 7], [10, 8], [10, 9], [9, 10], [10, 11], [11, 12], [12, 13], [12, 14], [13, 15], [14, 16], [14, 17]];
  P.drawRune = function (ctx, R, x, y) {
    if (R.bad) {
      ctx.fillStyle = 'rgba(239,97,102,0.18)';
      ctx.fillRect(x + 1, y + 1, F.SLOT - 2, F.SLOT - 2);
      ctx.fillStyle = '#1d1428';
      for (const p of CRACK) ctx.fillRect(x + p[0], y + p[1], 1, 1);
      return;
    }
    const a = 2;
    const z = F.SLOT - 3;
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = R.color;
    ctx.fillRect(x + 1, y + 1, F.SLOT - 2, F.SLOT - 2);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x + 1, y + 1, F.SLOT - 2, 1);
    ctx.fillRect(x + 1, y + F.SLOT - 2, F.SLOT - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, F.SLOT - 2);
    ctx.fillRect(x + F.SLOT - 2, y + 1, 1, F.SLOT - 2);
    ctx.globalAlpha = 1;
    ctx.fillRect(x + 3, y + 2, 1, 1);
    ctx.fillRect(x + 2, y + 3, 3, 1);
    ctx.fillRect(x + 3, y + 4, 1, 1);
    const pulse = 0.75 + 0.25 * Math.sin(this.t * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = R.color;
    ctx.fillRect(x + a, y + a, 3, 1);
    ctx.fillRect(x + a, y + a, 1, 3);
    ctx.fillRect(x + z - 2, y + a, 3, 1);
    ctx.fillRect(x + z, y + a, 1, 3);
    ctx.fillRect(x + a, y + z, 3, 1);
    ctx.fillRect(x + a, y + z - 2, 1, 3);
    ctx.fillRect(x + z - 2, y + z, 3, 1);
    ctx.fillRect(x + z, y + z - 2, 1, 3);
    ctx.globalAlpha = 1;
    ctx.glow(x + 3.5, y + 3.5, 4, R.color, 0.25 * pulse);
  };

  // 칸 유닛 한 기: 숨쉬기 + 공격 모션 + 소환·합성 연출
  const TIER_GLOW = [null, null, ['#a65ee8', 0.16, 10], ['#f2a531', 0.24, 11], ['#ef4f6f', 0.34, 13]];
  P.unitPose = function (i, s, dt) {
    const t = this.t;
    const br = Math.sin(t * 2.1 + i * 1.7);
    const pose = { ox: 0, oy: 0, sx: 1 - 0.015 * br, sy: 1 + 0.03 * br, rot: 0, flash: 0, ghost: 0 };
    if (this.atk[i] > 0) {
      this.atk[i] = Math.max(0, this.atk[i] - dt);
      const D = this.atkDur[i] || 0.2;
      const p = 1 - this.atk[i] / D;
      const d = this.lungeDir[i];
      const f = this.face[i];
      let off = 0;
      switch (s.cls) {
        case 'knight':
          // 뒤로 젖혔다가 크게 내리친다
          if (p < 0.3) {
            const k = p / 0.3;
            off = -1.2 * ease.out(k);
            pose.rot = -0.2 * k * f;
          } else if (p < 0.55) {
            const k = (p - 0.3) / 0.25;
            off = -1.2 + 4.6 * ease.out(k);
            pose.rot = (-0.2 + 0.45 * k) * f;
            pose.sx *= 1 + 0.08 * k;
          } else {
            const k = (p - 0.55) / 0.45;
            off = 3.4 * (1 - ease.inOut(k));
            pose.rot = 0.25 * (1 - k) * f;
          }
          break;
        case 'archer':
          off = -1.5 * Math.sin(Math.PI * Math.min(1, p / 0.6));
          pose.sx *= 1 + 0.05 * Math.sin(Math.PI * p);
          break;
        case 'mage':
          pose.oy -= 2.2 * Math.sin(Math.PI * p);
          pose.sy *= 1 + 0.06 * Math.sin(Math.PI * p);
          break;
        case 'rogue':
          off = 3 * Math.sin(Math.PI * p);
          pose.rot = 0.12 * Math.sin(Math.PI * p) * f;
          pose.ghost = 0.35 * Math.sin(Math.PI * p);
          break;
        case 'frost':
          pose.oy -= 1.2 * Math.sin(Math.PI * p);
          break;
      }
      pose.ox += d.x * off;
      pose.oy += d.y * off;
    }
    if (this.pop[i] > 0) {
      this.pop[i] = Math.max(0, this.pop[i] - dt);
      const q = 1 - this.pop[i] / (this.popMax[i] || 0.3);
      if (this.popKind[i] === 1) {
        // 소환: 위에서 떨어져 착지하며 찌그러졌다 펴진다
        if (q < 0.5) {
          const k = q / 0.5;
          pose.oy -= 16 * (1 - k * k);
          pose.sy *= 1.12;
          pose.sx *= 0.9;
        } else {
          const k = (q - 0.5) / 0.5;
          const w = Math.sin(Math.PI * k) * (1 - k);
          pose.sy *= 1 - 0.22 * w;
          pose.sx *= 1 + 0.18 * w;
          if (!this.popDust[i]) {
            this.popDust[i] = 1;
            const c = RS.slotCenter(i);
            this.emit(c.x, c.y + 7, 7, { sp: [12, 28], ang: -Math.PI / 2, spread: Math.PI * 1.4, life: [0.25, 0.45], cols: ['#d8cbb0', '#a8987a'], g: 40, drag: 3 });
          }
        }
        pose.flash = Math.max(0, 1 - q * 2.2);
      } else {
        // 합성: 빛에 싸여 떠올랐다 내려앉는다
        pose.oy -= 3.5 * Math.sin(Math.PI * q);
        pose.flash = Math.max(0, 0.9 - q * 1.4);
        const w = Math.sin(Math.PI * Math.min(1, q * 1.4));
        pose.sx *= 1 + 0.1 * w;
        pose.sy *= 1 + 0.1 * w;
      }
    }
    return pose;
  };

  P.drawSlots = function (ctx, b, dt) {
    const board = b.run.board;
    const runes = b.run.runes;
    const t = this.t;
    for (let i = 0; i < F.SIZE; i++) {
      const x = F.GX + (i % F.COLS) * F.SLOT;
      const y = F.GY + Math.floor(i / F.COLS) * F.SLOT;
      const s = board[i];
      if (runes && runes[i]) this.drawRune(ctx, RS.RUNE[runes[i]], x, y);
      const dr = this.drag;
      if (dr && dr.moved && dr.over === i && dr.from !== i) {
        const bad = dr.overReach === false;
        ctx.fillStyle = bad ? 'rgba(239,97,102,0.35)' : 'rgba(255,228,107,0.25)';
        ctx.fillRect(x + 1, y + 1, F.SLOT - 2, F.SLOT - 2);
        ctx.fillStyle = bad ? '#ef6166' : '#ffe46b';
        ctx.fillRect(x, y, F.SLOT, 1);
        ctx.fillRect(x, y + F.SLOT - 1, F.SLOT, 1);
        ctx.fillRect(x, y, 1, F.SLOT);
        ctx.fillRect(x + F.SLOT - 1, y, 1, F.SLOT);
      }
      if (!s) {
        this.atk[i] = 0;
        this.pop[i] = 0;
        continue;
      }
      const T = RS.TIER[s.tier];
      // 등급 테두리
      ctx.fillStyle = T.dark;
      ctx.fillRect(x + 2, y + F.SLOT - 4, F.SLOT - 4, 2);
      if (s.tier > 0) {
        ctx.fillStyle = T.color;
        ctx.fillRect(x + 2, y + F.SLOT - 4, F.SLOT - 4, 1);
      }
      const spr = RS.SPR[s.cls + s.tier];
      const pose = this.unitPose(i, s, dt);
      const ax = x + 13;
      const ay = y + 20;
      let draggedAway = false;
      let alpha = 1;
      if (dr && dr.moved) {
        if (dr.from === i) {
          alpha = 0.35;
          draggedAway = true;
        } else if (dr.over === i) alpha = 0.35; // 자리를 내줄 유닛
      }
      // 그림자 (몸이 뜨면 작아진다)
      const lift = Math.min(1, Math.max(0, -pose.oy / 16));
      ctx.globalAlpha = 0.32 * alpha * (1 - lift * 0.6);
      ctx.fillStyle = '#0c0814';
      const sw = 10 - lift * 4;
      ctx.fillRect(ax - sw / 2 + pose.ox * 0.5, ay - 1, sw, 1);
      ctx.fillRect(ax - sw / 2 + 1 + pose.ox * 0.5, ay, sw - 2, 1);
      ctx.globalAlpha = 1;
      // 영웅 이상은 은은한 빛
      const tg = TIER_GLOW[s.tier];
      if (tg && !draggedAway) ctx.glow(ax, ay - 8, tg[2] + Math.sin(t * 2 + i) * 1, tg[0], tg[1] * (s.tier >= 4 ? 0.8 + 0.2 * Math.sin(t * 4 + i) : 1));
      const flip = this.face[i] < 0;
      if (pose.ghost > 0.02) {
        ctx.globalAlpha = pose.ghost * alpha;
        ctx.sprite(spr, ax + pose.ox * 0.45, ay + pose.oy * 0.45, pose.sx, pose.sy, pose.rot * 0.5, flip);
      }
      ctx.globalAlpha = alpha;
      ctx.sprite(spr, ax + pose.ox, ay + pose.oy, pose.sx, pose.sy, pose.rot, flip);
      if (pose.flash > 0.02) {
        ctx.globalAlpha = pose.flash * alpha;
        ctx.sprite(RS.SPR[s.cls + s.tier + '_w'], ax + pose.ox, ay + pose.oy, pose.sx, pose.sy, pose.rot, flip);
      }
      ctx.globalAlpha = 1;
      // 봉인: 어둡게 가라앉고 보랏빛 사슬이 X자로 묶는다
      if (s.sealed) {
        ctx.fillStyle = 'rgba(20,10,35,0.55)';
        ctx.fillRect(x + 2, y + 2, F.SLOT - 4, F.SLOT - 4);
        const pulse = 0.7 + 0.3 * Math.sin(t * 4 + i);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#a061e8';
        for (let k = 3; k < F.SLOT - 3; k += 2) {
          ctx.fillRect(x + k, y + k, 1.5, 1.5);
          ctx.fillRect(x + F.SLOT - 1 - k, y + k, 1.5, 1.5);
        }
        ctx.fillStyle = '#d3a0f7';
        ctx.fillRect(x + F.SLOT / 2 - 2, y + F.SLOT / 2 - 1, 4, 3);
        ctx.fillRect(x + F.SLOT / 2 - 1, y + F.SLOT / 2 - 3, 2, 2);
        ctx.globalAlpha = 1;
        ctx.glow(x + F.SLOT / 2, y + F.SLOT / 2, 9, '#a061e8', 0.25 * pulse);
      }
      // 마법사: 공격할 때 지팡이 끝에 빛
      if (s.cls === 'mage' && this.atk[i] > 0) {
        const p = 1 - this.atk[i] / (this.atkDur[i] || 0.3);
        ctx.glow(ax + (flip ? -6 : 6) + pose.ox, ay - 17 + pose.oy, 5, T.light, 0.6 * Math.sin(Math.PI * p));
      }
      // 신화: 유닛 둘레를 도는 반짝이
      if (s.tier >= 4 && !draggedAway) {
        const T4 = RS.TIER[s.tier];
        for (let k = 0; k < 3; k++) {
          const a = t * 2.4 + k * 2.094 + i;
          const px = x + F.SLOT / 2 + Math.cos(a) * 8;
          const py = y + F.SLOT / 2 - 1 + Math.sin(a) * 8;
          ctx.fillStyle = k === 0 ? '#ffffff' : T4.light;
          ctx.fillRect(px - 0.5, py - 0.5, 1, 1);
          ctx.glow(px, py, 2.5, T4.light, 0.35);
        }
      }
      if (draggedAway && dr.over >= 0 && dr.over !== i && board[dr.over]) {
        // 자리 바꿈 미리보기: 목표 칸의 유닛이 이 칸으로 온다
        const o = board[dr.over];
        ctx.globalAlpha = 0.5;
        ctx.drawImage(RS.SPR[o.cls + o.tier], x + 4, y + 2);
        ctx.globalAlpha = 1;
      }
      if (b.slotStun[i] > 0) {
        ctx.fillStyle = 'rgba(160,97,232,0.45)';
        ctx.fillRect(x + 2, y + 2, F.SLOT - 4, F.SLOT - 4);
        this.drawStars(ctx, x + 13, y + 4);
      }
      // 보스 기술로 느려진 칸: 점액은 초록 방울, 고동은 붉게 두근거린다
      if (b.slotSlowT && b.slotSlowT[i] > 0) {
        if (b.slotSlowKind[i] === 'glue') {
          ctx.fillStyle = 'rgba(120,200,80,0.28)';
          ctx.fillRect(x + 2, y + 2, F.SLOT - 4, F.SLOT - 4);
          ctx.fillStyle = '#9ee06a';
          for (let k = 0; k < 3; k++) {
            const dy = (t * 9 + k * 7 + i * 3) % 12;
            ctx.fillRect(x + 6 + k * 6, y + 3 + dy, 1, 2);
          }
        } else {
          const beat = Math.max(0, Math.sin(t * 7)) ** 3;
          ctx.fillStyle = `rgba(224,74,82,${0.12 + 0.25 * beat})`;
          ctx.fillRect(x + 2, y + 2, F.SLOT - 4, F.SLOT - 4);
        }
      }
      // 스택 수
      if (s.n > 1) {
        ctx.fillStyle = '#1d1428';
        ctx.fillRect(x + F.SLOT - 9, y + F.SLOT - 10, 7, 7);
        RS.drawNum(ctx, String(s.n), x + F.SLOT - 5.5, y + F.SLOT - 10, RS.canMerge(board, i) ? 'y' : 'w');
      }
      if (RS.canMerge(board, i)) {
        // 합성 가능: 위아래로 통통 튀는 화살표
        ctx.drawImage(RS.SPR.i_up, x + 1, y + 1 - Math.abs(Math.sin(t * 5)) * 1.5, 7, 7);
      }
      // 사거리가 길에 닿지 않는 칸: 오른쪽 위에 빨간 x (2Hz)
      if (this.noReach && this.noReach[i] && Math.floor(t * 4) % 2 === 0) {
        const qx = x + F.SLOT - 6;
        const qy = y + 2;
        ctx.fillStyle = '#1d1428';
        ctx.fillRect(qx - 1, qy - 1, 5, 5);
        ctx.fillStyle = '#ef6166';
        ctx.fillRect(qx, qy, 1, 1);
        ctx.fillRect(qx + 2, qy, 1, 1);
        ctx.fillRect(qx + 1, qy + 1, 1, 1);
        ctx.fillRect(qx, qy + 2, 1, 1);
        ctx.fillRect(qx + 2, qy + 2, 1, 1);
      }
    }
    // 선택 표시 + 사거리
    if (this.sel >= 0) {
      const i = this.sel;
      const x = F.GX + (i % F.COLS) * F.SLOT;
      const y = F.GY + Math.floor(i / F.COLS) * F.SLOT;
      const pulse = 0.75 + 0.25 * Math.sin(t * 6);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffe46b';
      ctx.fillRect(x, y, F.SLOT, 1);
      ctx.fillRect(x, y + F.SLOT - 1, F.SLOT, 1);
      ctx.fillRect(x, y, 1, F.SLOT);
      ctx.fillRect(x + F.SLOT - 1, y, 1, F.SLOT);
      ctx.globalAlpha = 1;
      const s = board[i];
      if (s && b.slotStats[i]) {
        const c = RS.slotCenter(i);
        const r = b.slotStats[i].range;
        const n = Math.max(24, Math.round(r * 1.2));
        ctx.fillStyle = 'rgba(255,228,107,0.8)';
        for (let k = 0; k < n; k++) {
          if (k % 2) continue;
          const a = (k / n) * Math.PI * 2 + t * 0.4;
          ctx.fillRect(c.x + Math.cos(a) * r - 0.5, c.y + Math.sin(a) * r - 0.5, 1, 1);
        }
      }
    }
  };

  // 끌고 있는 유닛은 손가락보다 조금 위에, 살짝 흔들리며
  P.drawDrag = function (ctx, b) {
    const dr = this.drag;
    if (!dr || !dr.moved) return;
    const s = b.run.board[dr.from];
    if (!s) return;
    const spr = RS.SPR[s.cls + s.tier];
    const vx = dr.x - (dr.px == null ? dr.x : dr.px);
    dr.px = dr.x;
    dr.tilt = (dr.tilt || 0) * 0.8 + Math.max(-0.3, Math.min(0.3, vx * 0.08)) * 0.2;
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#0c0814';
    ctx.fillRect(dr.x - 4, dr.y - 7, 8, 1);
    ctx.globalAlpha = 1;
    ctx.sprite(spr, dr.x, dr.y - 8, 1.08, 1.08, dr.tilt, false);
  };

  P.drawStars = function (ctx, x, y) {
    const k = (this.t * 8) % 4;
    ctx.fillStyle = '#ffe46b';
    ctx.fillRect(x - 4 + k, y, 1, 1);
    ctx.fillRect(x + 3 - k, y + 1, 1, 1);
  };

  // 적 한 마리의 걸음새 (속도가 느려지면 걸음도 느려지고, 기절하면 멈춘다)
  P.enemyPose = function (e, dt) {
    const gait = GAIT[e.type] || 'walk';
    const rate = e.stunT > 0 ? 0 : Math.max(0.25, 1 - (e.slow || 0));
    e._g = (e._g == null ? e.phase : e._g) + dt * rate;
    const g = e._g;
    const pose = { ox: 0, oy: 0, sx: 1, sy: 1, rot: 0, fly: 0 };
    switch (gait) {
      case 'hop': {
        const s = Math.sin(g * 7);
        pose.oy = -Math.max(0, s) * 1.6;
        pose.sy = 1 + 0.07 * s;
        pose.sx = 1 - 0.06 * s;
        break;
      }
      case 'fly':
        pose.fly = 3 + Math.sin(g * 5) * 1.5;
        break;
      case 'float':
        pose.fly = 2 + Math.sin(g * 2.6) * 1.4;
        pose.sx = 1 + 0.02 * Math.sin(g * 2.6 + 1);
        break;
      case 'heavy': {
        const s = Math.sin(g * 4.5);
        pose.oy = -Math.abs(s) * 0.8;
        pose.rot = s * 0.035;
        break;
      }
      case 'scuttle':
        pose.ox = Math.sin(g * 16) * 0.4;
        pose.oy = -Math.abs(Math.sin(g * 16)) * 0.4;
        break;
      case 'pulse': {
        const s = Math.sin(g * 4);
        pose.sx = pose.sy = 1 + 0.04 * s;
        break;
      }
      case 'still':
        break;
      default: {
        const s = Math.sin(g * 8);
        pose.oy = -Math.abs(s) * 0.9;
        pose.rot = s * 0.07;
      }
    }
    if (e.boss) {
      pose.rot *= 0.5;
      pose.oy *= 0.7;
    }
    // 균열 문에서 막 나온 적: 작게 시작해 부풀며 나타난다
    e._age = (e._age || 0) + dt;
    if (e._age < 0.3) {
      const k = ease.out(e._age / 0.3);
      pose.sx *= 0.3 + 0.7 * k;
      pose.sy *= 0.3 + 0.7 * k;
      pose.appear = 1 - k;
    }
    // 맞으면 움찔 (납작해지며 뒤로 살짝 밀린다)
    if (e.flash > 0) {
      const k = e.flash / 0.08;
      pose.sx *= 1 + 0.12 * k;
      pose.sy *= 1 - 0.1 * k;
      const back = e.dir === 0 ? -1 : e.dir === 2 ? 1 : 0;
      const backY = e.dir === 1 ? -1 : e.dir === 3 ? 1 : 0;
      pose.ox += back * 0.7 * k;
      pose.oy += backY * 0.7 * k;
    }
    // 돌진 준비: 웅크리며 떨린다 / 돌진 중: 앞으로 기울고 흙먼지
    if (e.crossWarn) {
      pose.sy *= 0.88;
      pose.sx *= 1.1;
      pose.ox += Math.sin(this.t * 60) * 0.5;
    } else if (e.cross) {
      pose.rot = (e.cross.x2 < e.cross.x1 ? -1 : 1) * 0.25;
      pose.oy -= 1;
      if (dt > 0 && Math.random() < dt * 30) this.emit(e.x, e.y + 5, 1, { sp: [5, 20], ang: -Math.PI / 2, spread: 2, life: [0.25, 0.45], cols: ['#d8cbb0', '#a8987a'], g: 30 });
    }
    // 가로로 움직일 때 가는 쪽을 본다
    if (e.dir === 0) e._f = 1;
    else if (e.dir === 2) e._f = -1;
    return pose;
  };

  // ── 보스 기술 예고 ──
  // 머리 위 ! 와 준비 막대, 그리고 기술마다 대상을 미리 보여 준다 (봉인될 유닛, 자리가 바뀔 칸 등)
  const CAST_COL = {
    seal: '#c58cf0', shield: '#a8ecff', shuffle: '#6be0d0', plunder: '#f5c44a', rally: '#ef6166', mend: '#9ee06a',
    spawn: '#c58cf0', doze: '#d7e6ff', pulse: '#e05ad0', glue: '#9ee06a', cross: '#ef6166', rift: '#a061e8',
    submerge: '#a8ecff', anchor: '#d8cbb0',
  };
  RS.CAST_COL = CAST_COL;
  const PAIR_COL = ['#6be0d0', '#f5c44a', '#ef8fd0', '#9ee06a', '#a8ecff'];
  // 칸 네 귀퉁이에 꺾쇠 (in: 안쪽으로 들어온 정도)
  function brackets(ctx, i, col, inset) {
    const x = F.GX + (i % F.COLS) * F.SLOT + inset;
    const y = F.GY + Math.floor(i / F.COLS) * F.SLOT + inset;
    const s = F.SLOT - inset * 2;
    const L = 5;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, L, 1);
    ctx.fillRect(x, y, 1, L);
    ctx.fillRect(x + s - L, y, L, 1);
    ctx.fillRect(x + s - 1, y, 1, L);
    ctx.fillRect(x, y + s - 1, L, 1);
    ctx.fillRect(x, y + s - L, 1, L);
    ctx.fillRect(x + s - L, y + s - 1, L, 1);
    ctx.fillRect(x + s - 1, y + s - L, 1, L);
  }
  function zGlyph(ctx, x, y, col, a) {
    ctx.globalAlpha = a;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, 4, 1);
    ctx.fillRect(x + 2, y + 1, 1, 1);
    ctx.fillRect(x + 1, y + 2, 1, 1);
    ctx.fillRect(x, y + 3, 4, 1);
    ctx.globalAlpha = 1;
  }
  RS.castOf = function (e) {
    if (e.cast) return { k: e.cast.s.k === 'shield' && e.cast.pre && e.cast.pre.seal && e.cast.pre.seal.length ? 'seal' : e.cast.s.k, name: e.cast.s.name, t: e.cast.t, T: e.cast.T, pre: e.cast.pre };
    return e.castInfo;
  };
  P.drawCasts = function (ctx, b, dt) {
    const t = this.t;
    const board = b.run.board;
    for (const e of b.enemies) {
      if (e.dead || e.subT > 0) continue;
      const top = e._top != null ? e._top : e.y - 10;
      // 잠든 고대신: Z가 피어오르고 남은 잠 시간 막대
      if (e.dozeT > 0) {
        for (let j = 0; j < 3; j++) {
          const q = (t * 0.7 + j / 3) % 1;
          const zx = e.x > F.W - 30 ? e.x - 12 - q * 6 - j : e.x + 6 + q * 6 + j;
          zGlyph(ctx, zx, Math.max(1, top - 2 - q * 12), '#d7e6ff', 1 - q);
        }
        const k = e.dozeT / (e.dozeT0 || 1);
        const by = Math.max(1, top - 5);
        ctx.fillStyle = '#15111d';
        ctx.fillRect(e.x - 8, by, 16, 3);
        ctx.fillStyle = '#9ee06a';
        ctx.fillRect(e.x - 7, by + 1, 14 * k, 1);
        ctx.glow(e.x, top + 8, 16, '#9ee06a', 0.12 + 0.05 * Math.sin(t * 3));
        if (dt > 0 && Math.random() < dt * 8) this.emit(e.x + rnd(-8, 8), e.y - 2, 1, { sp: [4, 10], ang: -Math.PI / 2, spread: 0.4, life: [0.5, 0.8], cols: ['#9ee06a', '#d7e6ff'], glow: 2 });
      }
      // 피해 한도에 걸렸다: 몸 둘레에 회색 결이 번쩍인다
      if (e.capped && e.def.dpsCap) {
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 20);
        ctx.fillStyle = '#d8d0e8';
        const r = 13;
        for (let j = 0; j < 12; j++) {
          if ((j + Math.floor(t * 10)) % 2) continue;
          const a2 = (j / 12) * Math.PI * 2 + t;
          ctx.fillRect(e.x + Math.cos(a2) * r, e.y - 6 + Math.sin(a2) * r * 0.8, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      const c = RS.castOf(e);
      if (!c || !(c.T > 0)) continue;
      const col = CAST_COL[c.k] || '#ffe46b';
      const p = Math.max(0, Math.min(1, 1 - c.t / c.T));
      const blink = Math.floor(t * (6 + p * 10)) % 2 === 0;
      // 머리 위 ! (끝나갈수록 빨리 깜빡인다)
      // 위쪽 길에서는 머리 위가 화면 밖이라 옆에 띄운다
      let gx = Math.round(e.x);
      let gy = Math.round(top - 13);
      if (gy < 2) {
        gx = Math.round(e.x > F.W - 30 ? e.x - 18 : e.x + 18);
        gy = Math.round(e.y - 8);
      }
      ctx.fillStyle = '#15111d';
      ctx.fillRect(gx - 3, gy - 1, 7, 11);
      ctx.fillStyle = blink ? '#ffffff' : col;
      ctx.fillRect(gx, gy + 1, 1, 5);
      ctx.fillRect(gx, gy + 7, 1, 1);
      ctx.fillStyle = col;
      ctx.fillRect(gx - 2, gy, 5, 1);
      ctx.fillRect(gx - 2, gy + 9, 5, 1);
      ctx.fillRect(gx - 3, gy, 1, 10);
      ctx.fillRect(gx + 3, gy, 1, 10);
      // 준비 막대
      ctx.fillStyle = '#15111d';
      ctx.fillRect(gx - 7, gy + 11, 15, 3);
      ctx.fillStyle = col;
      ctx.fillRect(gx - 6, gy + 12, 13 * p, 1);
      ctx.glow(gx, gy + 4, 7, col, 0.3 + 0.2 * (blink ? 1 : 0));
      const pre = c.pre;
      switch (c.k) {
        case 'seal':
          // 봉인될 유닛: 보랏빛 조준 꺾쇠가 좁혀 들어오고 자물쇠가 깜빡인다
          for (const u of pre.seal) {
            const i = board.indexOf(u);
            if (i < 0 || u.tier >= RS.TOP_TIER) continue;
            const ins = 1 + Math.round((1 - p) * 4);
            brackets(ctx, i, blink ? '#ffffff' : '#e0b0ff', ins);
            brackets(ctx, i, '#a061e8', ins + 1);
            const cc = RS.slotCenter(i);
            ctx.globalAlpha = 0.25 + 0.2 * p;
            ctx.fillStyle = '#5e3593';
            ctx.fillRect(cc.x - F.SLOT / 2 + 2, cc.y - F.SLOT / 2 + 2, F.SLOT - 4, F.SLOT - 4);
            ctx.globalAlpha = 1;
            ctx.fillStyle = col;
            ctx.fillRect(cc.x + 6, cc.y - 10, 4, 3);
            ctx.fillRect(cc.x + 7, cc.y - 12, 2, 2);
            ctx.glow(cc.x, cc.y, 10, '#a061e8', 0.2 + 0.25 * p);
            // 보스에서 대상까지 가는 사슬
            const n = 10;
            for (let j = 1; j < n; j++) {
              if ((j + Math.floor(t * 12)) % 3 === 0) continue;
              const q = j / n;
              ctx.fillStyle = '#a061e8';
              ctx.fillRect(e.x + (cc.x - e.x) * q, e.y - 6 + (cc.y - e.y + 6) * q, 1, 1);
            }
          }
          break;
        case 'shuffle':
          // 자리가 바뀔 두 칸: 짝마다 색이 다른 꺾쇠와 점선
          pre.pairs.forEach(([a, b2], j) => {
            const pc = PAIR_COL[j % PAIR_COL.length];
            brackets(ctx, a, blink ? '#ffffff' : pc, 2);
            brackets(ctx, b2, blink ? '#ffffff' : pc, 2);
            const ca = RS.slotCenter(a);
            const cb = RS.slotCenter(b2);
            const len = Math.hypot(cb.x - ca.x, cb.y - ca.y);
            const n = Math.max(3, Math.round(len / 3));
            ctx.fillStyle = pc;
            for (let k = 0; k <= n; k++) {
              if ((k + Math.floor(t * 10)) % 3 === 0) continue;
              const q = k / n;
              ctx.fillRect(ca.x + (cb.x - ca.x) * q, ca.y + (cb.y - ca.y) * q, 1, 1);
            }
          });
          break;
        case 'plunder':
          // 금화가 보스 둘레를 돈다
          for (let j = 0; j < 4; j++) {
            const a2 = t * 4 + (j * Math.PI) / 2;
            const x = e.x + Math.cos(a2) * 11;
            const y = e.y - 8 + Math.sin(a2) * 6;
            ctx.fillStyle = '#f5c44a';
            ctx.fillRect(x - 1, y - 1, 3, 3);
            ctx.fillStyle = '#ffe46b';
            ctx.fillRect(x - 1, y - 1, 1, 1);
          }
          ctx.glow(e.x, e.y - 8, 14, '#f5c44a', 0.2 + 0.2 * p);
          break;
        case 'rally':
        case 'pulse': {
          const r = 6 + 22 * ((t * 1.6) % 1);
          const n = Math.round(r * 2);
          ctx.globalAlpha = 0.7 * (1 - ((t * 1.6) % 1));
          ctx.fillStyle = col;
          for (let j = 0; j < n; j++) {
            const a2 = (j / n) * Math.PI * 2;
            ctx.fillRect(e.x + Math.cos(a2) * r, e.y - 6 + Math.sin(a2) * r * 0.85, 1, 1);
          }
          ctx.globalAlpha = 1;
          if (c.k === 'pulse') ctx.glow(e.x, e.y - 8, 10 + 8 * p, '#e05ad0', 0.3 + 0.3 * p);
          break;
        }
        case 'mend':
        case 'shield':
        case 'spawn':
        case 'doze': {
          // 힘을 모은다: 점이 둘레에서 몸으로 모여든다
          const r = 4 + 16 * (1 - ((t * 1.3) % 1));
          ctx.fillStyle = col;
          for (let j = 0; j < 8; j++) {
            const a2 = (j / 8) * Math.PI * 2 + t * 2;
            ctx.fillRect(e.x + Math.cos(a2) * r, e.y - 6 + Math.sin(a2) * r * 0.85, 1, 1);
          }
          if (c.k === 'spawn') {
            // 뒤쪽 길에 소환진
            ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 8);
            for (let j = 0; j < 14; j++) {
              const a2 = (j / 14) * Math.PI * 2 + t;
              ctx.fillRect(e.x + Math.cos(a2) * 8, e.y + 4 + Math.sin(a2) * 3, 1, 1);
            }
            ctx.globalAlpha = 1;
          }
          if (c.k === 'doze') for (let j = 0; j < 2; j++) zGlyph(ctx, e.x + 6 + j * 4, top - 4 - j * 4, '#d7e6ff', 0.5 + 0.5 * p);
          break;
        }
      }
    }
  };

  P.drawEnemies = function (ctx, b, dt) {
    const list = this.sorted || (this.sorted = []);
    list.length = 0;
    for (let k = 0; k < b.enemies.length; k++) list.push(b.enemies[k]);
    list.sort((a, c) => a.y - c.y);
    const t = this.t;
    const blind = !!b.M.blindfold;
    // 그림자 먼저 (모든 적 아래에)
    ctx.fillStyle = '#0c0814';
    for (const e of list) {
      if (e.subT > 0) continue;
      const spr = RS.SPR[e.type];
      const w = Math.max(6, Math.round(spr.width * 0.6));
      const fl = GAIT[e.type] === 'fly' || GAIT[e.type] === 'float';
      const sw = fl ? w * 0.7 : w;
      ctx.globalAlpha = fl ? 0.2 : 0.3;
      ctx.fillRect(e.x - sw / 2, e.y + 4, sw, 1);
      ctx.fillRect(e.x - sw / 2 + 1, e.y + 5, sw - 2, 1);
    }
    ctx.globalAlpha = 1;
    for (const e of list) {
      let name = e.type;
      const pose = this.enemyPose(e, dt);
      if (name === 'slime' || name === 'bat') {
        if (Math.floor(e._g * 4) % 2) name += '2';
      } else if (name === 'frog' && e.hopT !== undefined && (e.hopT < 0.25 || e.hopT > e.def.hop.every - 0.3)) {
        name = 'frog2'; // 뛰기 직전·직후 웅크린 모습
        if (e.hopT < 0.25) pose.oy -= Math.sin((e.hopT / 0.25) * Math.PI) * 3;
      }
      if (e.dozeT > 0 && RS.SPR[name + '_z']) name += '_z';
      const spr = RS.SPR[name];
      const w = spr.width;
      const h = spr.height;
      const ax = e.x + pose.ox;
      const ay = e.y + 5 + pose.oy - pose.fly;
      const flip = e._f === -1;
      // 물속에 잠긴 늪의 여왕: 흐릿한 모습과 물결만
      if (e.subT > 0) {
        ctx.globalAlpha = 0.28;
        ctx.sprite(spr, ax, ay, 1, 1, 0, flip);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#a8ecff';
        const k = (t * 6) % 3;
        for (let j = 0; j < w; j += 3) ctx.fillRect(ax - w / 2 + j + k, ay - 3, 2, 1);
        continue;
      }
      if (e.boss && b.enraged) {
        ctx.glow(ax, ay - h / 2, h * 0.8, '#e04a52', 0.35 + 0.15 * Math.sin(t * 10));
        ctx.sprite(RS.SPR[e.type + '_w'], ax - 1, ay, pose.sx, pose.sy, pose.rot, flip);
        ctx.sprite(RS.SPR[e.type + '_w'], ax + 1, ay, pose.sx, pose.sy, pose.rot, flip);
      }
      if (e.elite) {
        ctx.glow(ax, ay - h / 2, h * 0.7, '#f5c44a', 0.18 + 0.08 * Math.sin(t * 6));
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 6);
        ctx.sprite(RS.SPR[e.type + '_w'], ax, ay - 1, pose.sx, pose.sy, pose.rot, flip);
        ctx.globalAlpha = 1;
      }
      if (GAIT[e.type] === 'float' && e.type === 'ghost') ctx.globalAlpha = 0.82 + 0.18 * Math.sin(e._g * 3);
      ctx.sprite(spr, ax, ay, pose.sx, pose.sy, pose.rot, flip);
      ctx.globalAlpha = 1;
      if (pose.appear > 0) {
        ctx.globalAlpha = pose.appear;
        ctx.sprite(RS.SPR[e.type + '_w'], ax, ay, pose.sx, pose.sy, 0, flip);
        ctx.globalAlpha = 1;
        ctx.glow(ax, ay - h / 2, 8, '#a061e8', 0.5 * pose.appear);
      }
      if (e.flash > 0) {
        ctx.globalAlpha = 0.8;
        ctx.sprite(RS.SPR[e.type + '_w'], ax, ay, pose.sx, pose.sy, pose.rot, flip);
        ctx.globalAlpha = 1;
      } else if (e.slow > 0 || e.stunT > 0) {
        ctx.globalAlpha = e.stunT > 0 ? 0.6 : 0.35;
        ctx.sprite(RS.SPR[e.type + '_i'], ax, ay, pose.sx, pose.sy, pose.rot, flip);
        ctx.globalAlpha = 1;
      }
      const top = ay - h;
      // 보호막: 몸을 감싸는 하늘색 막
      if (e.shield > 0) {
        const r = Math.max(w, h) * 0.62;
        const n = Math.max(16, Math.round(r * 2));
        const k = Math.min(1, e.shield / Math.max(1, e.shieldMax || e.shield));
        ctx.globalAlpha = 0.45 + 0.35 * k;
        ctx.fillStyle = '#a8ecff';
        for (let j = 0; j < n; j++) {
          if ((j + Math.floor(t * 8)) % 3 === 0) continue;
          const a2 = (j / n) * Math.PI * 2;
          ctx.fillRect(ax + Math.cos(a2) * r - 0.5, ay - h / 2 + Math.sin(a2) * r * 0.9 - 0.5, 1, 1);
        }
        ctx.globalAlpha = 1;
        ctx.glow(ax, ay - h / 2, r * 1.1, '#a8ecff', 0.18 + 0.12 * k);
      }
      // 불·독: 불티와 거품이 피어오른다
      if (e.burnT > 0 && dt > 0 && Math.random() < dt * 10) this.emit(ax + rnd(-w / 3, w / 3), top + h * 0.4, 1, { sp: [6, 14], ang: -Math.PI / 2, spread: 0.8, life: [0.3, 0.5], cols: ['#ff9a3d', '#ffe46b'], glow: 2 });
      if (e.poisonT > 0 && dt > 0 && Math.random() < dt * 6) this.emit(ax + rnd(-w / 3, w / 3), top + h * 0.5, 1, { sp: [4, 9], ang: -Math.PI / 2, spread: 0.6, life: [0.4, 0.6], cols: ['#9ee06a', '#62c35f'] });
      if (e.stunT > 0) this.drawStars(ctx, ax, top - 2);
      // 성난 엘리트
      if (e.burning) {
        const fl = RS.SPR.i_flameE;
        const k = Math.sin(t * 16) * 0.8;
        ctx.drawImage(fl, ax - w / 2 - 2, top - 2 - k);
        ctx.drawImage(fl, ax + w / 2 - fl.width + 2, top - 3 + k);
        ctx.glow(ax, top + 2, 8, '#ff9a3d', 0.25);
      }
      e._top = top;
    }
    // 체력바는 모든 적을 그린 뒤에 (눈가리개를 하면 보이지 않는다). 방금 깎인 만큼은 잠시 밝게 남는다
    if (blind) return;
    for (const e of list) {
      if (e.boss || e.subT > 0) continue;
      const frac = Math.max(0, e.hp) / e.maxHp;
      if (e._hs == null || e._hs < frac) e._hs = frac;
      else e._hs = Math.max(frac, e._hs - dt * 1.2);
      if (e.hp >= e.maxHp) continue;
      const spr = RS.SPR[e.type];
      const w = spr.width;
      const top = e._top != null ? e._top : e.y - spr.height + 5;
      const bw = Math.max(8, w - 4);
      const bx = e.x - bw / 2;
      const by = top - 3;
      const fill = Math.max(0.5, bw * frac);
      const chip = bw * e._hs;
      if (e.elite) {
        ctx.fillStyle = '#1d1428';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 3);
        ctx.fillStyle = '#fff6e6';
        ctx.fillRect(bx, by, chip, 1);
        ctx.fillStyle = '#f5c44a';
        ctx.fillRect(bx, by, fill, 1);
      } else {
        ctx.fillStyle = '#3a1d2c';
        ctx.fillRect(bx, by, bw, 1);
        ctx.fillStyle = '#ffe0a0';
        ctx.fillRect(bx, by, chip, 1);
        ctx.fillStyle = '#e04a52';
        ctx.fillRect(bx, by, fill, 1);
      }
    }
  };

  // 투사체가 목표에 닿을 때 튀는 조각
  P.impact = function (s) {
    if (s.miss) {
      this.emit(s.x2, s.y2 - 2, 3, { sp: [8, 18], life: [0.2, 0.35], cols: ['#8a93a3', '#b8c2d3'], drag: 3 });
      return;
    }
    const T = RS.TIER[s.tier];
    switch (s.cls) {
      case 'archer':
        this.emit(s.x2, s.y2 - 2, s.rain ? 5 : 3, { sp: [15, 35], life: [0.15, 0.3], cols: s.rain ? ['#ffe46b', '#ffffff'] : ['#f6f1e8', '#8d5b3d', T.light], g: 60, drag: 2, glow: s.rain ? 2 : 0 });
        break;
      case 'frost':
        this.emit(s.x2, s.y2 - 2, 5, { sp: [12, 30], life: [0.25, 0.45], cols: ['#a8ecff', '#e8fbff', '#52b6e0'], g: 50, drag: 2, glow: 2 });
        break;
      case 'rogue':
        this.emit(s.x2, s.y2 - 2, s.crit ? 5 : 3, { sp: [20, 40], life: [0.12, 0.25], cols: s.crit ? ['#ffe46b', '#ffffff'] : ['#d3dbe6', '#ffffff'], drag: 4, glow: s.crit ? 2 : 0 });
        break;
      case 'knight':
        this.emit(s.x2, s.y2 - 3, s.crit ? 8 : 5, { sp: [25, 55], life: [0.15, 0.3], cols: s.crit ? ['#ffe46b', '#ff9a3d', '#ffffff'] : ['#ffffff', T.light], drag: 4, glow: s.crit ? 2.5 : 1.5 });
        break;
    }
  };

  P.drawShots = function (ctx, dt) {
    let w = 0;
    for (let k = 0; k < this.shots.length; k++) {
      const s = this.shots[k];
      s.t -= dt;
      if (s.t <= 0) {
        if (s.cls !== 'mage') this.impact(s); // 마법사는 폭발(boom)이 따로 있다
        continue;
      }
      this.shots[w++] = s;
      const p = 1 - s.t / s.max;
      const x = s.x1 + (s.x2 - s.x1) * p;
      const y = s.y1 + (s.y2 - s.y1) * p;
      const T = RS.TIER[s.tier];
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len = Math.max(1, Math.hypot(dx, dy));
      const ux = dx / len;
      const uy = dy / len;
      switch (s.cls) {
        case 'archer': {
          if (s.rain) {
            // 신화 화살비: 금빛 긴 화살 + 꼬리
            for (let k2 = 0; k2 < 7; k2++) {
              ctx.fillStyle = k2 === 0 ? '#ffffff' : k2 < 3 ? '#ffe46b' : T.light;
              ctx.globalAlpha = 1 - k2 * 0.12;
              ctx.fillRect(x - ux * k2 - 0.5, y - uy * k2 - 0.5, 1, 1);
            }
            ctx.globalAlpha = 1;
            ctx.glow(x, y, 4, '#ffe46b', 0.4);
            break;
          }
          // 화살: 촉·살·깃 + 옅은 꼬리
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#f6f1e8';
          ctx.fillRect(x - ux * 5 - 0.5, y - uy * 5 - 0.5, 1, 1);
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#f6f1e8';
          ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
          ctx.fillStyle = '#8d5b3d';
          ctx.fillRect(x - ux - 0.5, y - uy - 0.5, 1, 1);
          ctx.fillRect(x - ux * 2 - 0.5, y - uy * 2 - 0.5, 1, 1);
          ctx.fillStyle = T.light;
          ctx.fillRect(x - ux * 3 - 0.5, y - uy * 3 - 0.5, 1, 1);
          break;
        }
        case 'mage': {
          // 빛나는 마법 구슬 + 불똥 꼬리
          const pulse = 1 + 0.25 * Math.sin(this.t * 40 + s.spin);
          ctx.glow(x, y, 5 * pulse, T.color, 0.55);
          ctx.fillStyle = T.color;
          ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
          ctx.fillStyle = '#fff6e6';
          ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
          if (dt > 0 && this.parts.length < 400) this.parts.push({ x: x + rnd(-1, 1), y: y + rnd(-1, 1), vx: -ux * 8 + rnd(-6, 6), vy: -uy * 8 + rnd(-6, 6), g: 0, drag: 2, life: 0.25, max: 0.25, col: pick([T.light, T.color, '#ff9a3d']), size: 1, glow: 0 });
          break;
        }
        case 'frost': {
          // 얼음 결정: 빙글 돌며 반짝인다
          const r = (this.t * 12 + s.spin) % 2 < 1;
          ctx.glow(x, y, 4, '#a8ecff', 0.4);
          ctx.fillStyle = '#e8fbff';
          ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
          ctx.fillStyle = '#a8ecff';
          if (r) {
            ctx.fillRect(x - 1.5, y - 0.5, 3, 1);
            ctx.fillRect(x - 0.5, y - 1.5, 1, 3);
          } else {
            ctx.fillRect(x - 1.5, y - 1.5, 1, 1);
            ctx.fillRect(x + 0.5, y - 1.5, 1, 1);
            ctx.fillRect(x - 1.5, y + 0.5, 1, 1);
            ctx.fillRect(x + 0.5, y + 0.5, 1, 1);
          }
          break;
        }
        case 'rogue': {
          // 회전하며 날아가는 단검
          const a = this.t * 36 + s.spin;
          const cx = Math.cos(a);
          const cy = Math.sin(a);
          ctx.fillStyle = s.crit ? '#ffe46b' : '#d3dbe6';
          ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
          ctx.fillRect(x + cx * 1.2 - 0.5, y + cy * 1.2 - 0.5, 1, 1);
          ctx.fillStyle = s.crit ? '#ff9a3d' : '#8b97ab';
          ctx.fillRect(x - cx * 1.2 - 0.5, y - cy * 1.2 - 0.5, 1, 1);
          if (s.crit) ctx.glow(x, y, 3, '#ffe46b', 0.35);
          break;
        }
        case 'knight':
          this.drawSlash(ctx, s, p, T);
          if (!s.hit && p > 0.3) {
            s.hit = true;
            this.impact(s);
          }
          break;
      }
    }
    this.shots.length = w;
  };

  // 전사 베기: 표적을 가로지르는 굵은 사선 칼자국 + 맞는 순간 불꽃
  P.drawSlash = function (ctx, s, p, T) {
    const cx = s.x2;
    const cy = s.y2 - 3;
    const face = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
    const ang = face + (s.flip ? 1 : -1) * 1.05; // 공격 방향에 비스듬히
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const nx = -uy;
    const ny = ux;
    const L = s.crit ? 28 : 22;
    // 0~0.3: 한쪽 끝에서 반대쪽으로 그어지고, 이후 가늘어지며 사라진다
    const grow = Math.min(1, p / 0.3);
    const thin = p < 0.3 ? 1 : Math.max(0, 1 - (p - 0.3) / 0.7);
    // 빗나가면 흐린 회색 헛손질
    const edge = s.miss ? '#8a93a3' : s.crit ? '#ffe46b' : '#ffffff';
    const inner = s.miss ? '#5b6272' : s.crit ? '#ff9a3d' : T.light;
    const from = -L / 2;
    const to = from + L * grow;
    for (let d = from; d <= to; d += 0.5) {
      const tn = 1 - Math.abs(d) / (L / 2); // 가운데 1, 끝 0
      const w = Math.max(0, Math.round((tn * 2.2 + 0.4) * thin)); // 반폭
      const bx = cx + ux * d;
      const by = cy + uy * d;
      if (w >= 2) {
        ctx.fillStyle = '#1d1428';
        ctx.fillRect(Math.round(bx + nx * (w + 1)), Math.round(by + ny * (w + 1)), 1, 1);
        ctx.fillRect(Math.round(bx - nx * (w + 1)), Math.round(by - ny * (w + 1)), 1, 1);
      }
      for (let o = -w; o <= w; o++) {
        ctx.fillStyle = Math.abs(o) === w && w > 0 ? inner : edge;
        ctx.fillRect(Math.round(bx + nx * o), Math.round(by + ny * o), 1, 1);
      }
    }
    if (!s.miss && thin > 0.3) ctx.glow(cx, cy, s.crit ? 9 : 7, s.crit ? '#ffe46b' : T.light, 0.3 * thin);
    // 칼이 표적을 지나는 순간(중반) 튀는 불꽃
    if (p > 0.25 && p < 0.7 && !s.miss) {
      const q = (p - 0.25) / 0.45;
      const r = 1 + Math.round(q * (s.crit ? 5 : 3));
      ctx.fillStyle = q < 0.5 ? '#ffffff' : edge;
      ctx.fillRect(cx - r, cy, 1, 1);
      ctx.fillRect(cx + r, cy, 1, 1);
      ctx.fillRect(cx, cy - r, 1, 1);
      ctx.fillRect(cx, cy + r, 1, 1);
      if (s.crit || q < 0.4) {
        const d = Math.max(1, r - 1);
        ctx.fillRect(cx - d, cy - d, 1, 1);
        ctx.fillRect(cx + d, cy - d, 1, 1);
        ctx.fillRect(cx - d, cy + d, 1, 1);
        ctx.fillRect(cx + d, cy + d, 1, 1);
      }
      if (q < 0.3) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx - 1, cy - 1, 3, 3);
      }
    }
  };

  P.drawFx = function (ctx, dt) {
    let w = 0;
    for (let k = 0; k < this.fxs.length; k++) {
      const f = this.fxs[k];
      f.t -= dt;
      if (f.t <= 0) continue;
      this.fxs[w++] = f;
      const p = 1 - f.t / f.max;
      switch (f.k) {
        case 'ring': {
          const r = Math.max(2, f.r * (0.4 + 0.6 * ease.out(p)));
          const n = Math.max(10, Math.round(r * 1.6));
          ctx.globalAlpha = Math.min(1, (1 - p) * 1.6);
          ctx.fillStyle = f.col;
          for (let j = 0; j < n; j++) {
            const a = (j / n) * Math.PI * 2;
            ctx.fillRect(f.x + Math.cos(a) * r - 0.5, f.y + Math.sin(a) * r - 0.5, 1, 1);
          }
          ctx.globalAlpha = 1;
          if (f.glow) ctx.glow(f.x, f.y, r * 0.9, f.col, 0.18 * (1 - p));
          break;
        }
        case 'crossLine': {
          // 돌진할 길: 깜빡이는 붉은 점선과 화살촉
          const dx = f.x2 - f.x1;
          const dy = f.y2 - f.y1;
          const len = Math.max(1, Math.hypot(dx, dy));
          const ux = dx / len;
          const uy = dy / len;
          const on = Math.floor(this.t * 12) % 2 === 0;
          // 지나갈 칸을 붉게 깜빡여 미리 알려 준다
          if (!f.cells) {
            f.cells = [];
            for (let d = 0; d < len; d += 3) {
              const i = RS.slotAt(f.x1 + ux * d, f.y1 + uy * d);
              if (i >= 0 && f.cells.indexOf(i) < 0) f.cells.push(i);
            }
          }
          ctx.fillStyle = on ? 'rgba(255,90,90,0.3)' : 'rgba(255,90,90,0.12)';
          for (const i of f.cells) ctx.fillRect(F.GX + (i % F.COLS) * F.SLOT + 1, F.GY + Math.floor(i / F.COLS) * F.SLOT + 1, F.SLOT - 2, F.SLOT - 2);
          ctx.globalAlpha = on ? 0.9 : 0.5;
          ctx.fillStyle = '#ff6b6b';
          const off = (this.t * 40) % 6;
          for (let d = off; d < len; d += 6) {
            ctx.fillRect(f.x1 + ux * d - 1, f.y1 + uy * d - 1, 2, 2);
          }
          // 화살촉
          const hx = f.x2 - ux * 4;
          const hy = f.y2 - uy * 4;
          const nx = -uy;
          const ny = ux;
          for (let k2 = 0; k2 < 4; k2++) {
            ctx.fillRect(hx - ux * k2 + nx * k2 - 0.5, hy - uy * k2 + ny * k2 - 0.5, 1.5, 1.5);
            ctx.fillRect(hx - ux * k2 - nx * k2 - 0.5, hy - uy * k2 - ny * k2 - 0.5, 1.5, 1.5);
          }
          ctx.globalAlpha = 1;
          ctx.glow(f.x2, f.y2, 8, '#e04a52', 0.3);
          break;
        }
        case 'pop': {
          // 쓰러진 적: 하얗게 번쩍이며 부풀었다 사라진다
          const spr = RS.SPR[f.name + '_w'];
          if (!spr) break;
          const k2 = 1 + 0.4 * ease.out(p);
          ctx.globalAlpha = 1 - p;
          ctx.sprite(spr, f.x, f.y, k2, k2 * 0.9, 0, false);
          ctx.globalAlpha = 1;
          break;
        }
        case 'beam': {
          // 소환·합성 빛줄기
          const a = Math.sin(Math.PI * p);
          const h2 = 30 * Math.min(1, p * 4);
          ctx.globalAlpha = 0.5 * a;
          ctx.fillStyle = f.col;
          ctx.fillRect(f.x - 3, f.y - h2, 7, h2);
          ctx.globalAlpha = 0.8 * a;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(f.x - 1, f.y - h2, 3, h2);
          ctx.globalAlpha = 1;
          ctx.glow(f.x, f.y - 8, 12, f.col, 0.35 * a);
          break;
        }
        case 'leak':
          ctx.fillStyle = `rgba(240,60,90,${0.6 * (1 - p)})`;
          ctx.fillRect(F.L - 9, F.T - 9, 18, 18);
          ctx.glow(F.L, F.T, 14, '#e04a52', 0.5 * (1 - p));
          break;
        case 'star': {
          const r = 4 + 10 * ease.out(p);
          ctx.globalAlpha = 1 - p * 0.6;
          ctx.fillStyle = f.col;
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2 + p;
            ctx.fillRect(f.x + Math.cos(a) * r - 0.5, f.y + Math.sin(a) * r - 0.5, 1, 1);
          }
          ctx.globalAlpha = 1;
          ctx.glow(f.x, f.y, 10, f.col, 0.3 * (1 - p));
          break;
        }
        case 'pillar': {
          // 시전 유닛 위로 솟는 빛기둥
          const h = 26 * Math.min(1, p * 3);
          ctx.globalAlpha = 0.85 * (1 - p);
          ctx.fillStyle = f.col;
          ctx.fillRect(f.x - 2, f.y - h, 5, h + 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(f.x - 1, f.y - h, 3, h + 4);
          for (let j = 0; j < 6; j++) {
            const a = j * 1.047 + p * 5;
            ctx.fillStyle = f.col;
            ctx.fillRect(f.x + Math.cos(a) * (6 + 8 * p) - 0.5, f.y + Math.sin(a) * (6 + 8 * p) - 0.5, 1, 1);
          }
          ctx.globalAlpha = 1;
          ctx.glow(f.x, f.y - h / 2, 14, f.col, 0.45 * (1 - p));
          break;
        }
        case 'quake': {
          // 대지 가르기: 사방으로 갈라지는 균열
          ctx.globalAlpha = 1 - p;
          for (let j = 0; j < 8; j++) {
            const a = j * 0.785 + f.seed;
            const L = f.r * Math.min(1, p * 2.5);
            for (let d = 4; d < L; d += 1.5) {
              const w2 = Math.sin(d * 0.7 + j) * 1.5;
              ctx.fillStyle = d < L * 0.6 ? '#fff6e6' : '#ffb0c0';
              ctx.fillRect(Math.round(f.x + Math.cos(a) * d - Math.sin(a) * w2), Math.round(f.y + Math.sin(a) * d + Math.cos(a) * w2), 1, 1);
            }
          }
          ctx.globalAlpha = 1;
          ctx.glow(f.x, f.y, f.r * 0.8, '#ffb0c0', 0.3 * (1 - p));
          break;
        }
        case 'shards': {
          // 절대 영도: 사방에 솟는 얼음 결정
          ctx.globalAlpha = 1 - p * 0.8;
          for (let j = 0; j < 10; j++) {
            const a = j * 0.628 + f.seed;
            const d = f.r * (0.35 + 0.6 * ((j * 7) % 10) / 10);
            const px = Math.round(f.x + Math.cos(a) * d);
            const py = Math.round(f.y + Math.sin(a) * d);
            const hgt = Math.round(4 * Math.min(1, p * 4));
            ctx.fillStyle = '#e8fbff';
            ctx.fillRect(px, py - hgt, 1, hgt + 1);
            ctx.fillStyle = '#a8ecff';
            ctx.fillRect(px - 1, py - 1, 3, 1);
            ctx.glow(px, py - hgt / 2, 3, '#a8ecff', 0.3 * (1 - p));
          }
          ctx.globalAlpha = 1;
          break;
        }
        case 'meteor': {
          // 0~0.4: 불덩이가 떨어지고, 이후 폭발
          if (p < 0.4) {
            const q = p / 0.4;
            const mx = f.x + 30 * (1 - q);
            const my = f.y - 60 * (1 - q);
            ctx.glow(mx, my, 9, '#ff9a3d', 0.7);
            ctx.fillStyle = '#ffb347';
            ctx.fillRect(mx - 2.5, my - 2.5, 5, 5);
            ctx.fillStyle = '#fff6e6';
            ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
            ctx.fillStyle = '#ef4f6f';
            ctx.fillRect(mx + 2.5, my - 4.5, 2, 2);
            ctx.fillRect(mx + 5.5, my - 7.5, 1, 1);
            if (dt > 0) this.emit(mx, my, 2, { sp: [5, 15], ang: -Math.PI / 4, spread: 1, life: [0.2, 0.4], cols: ['#ff9a3d', '#ffe46b', '#ef4f6f'], glow: 2 });
          } else {
            if (!f.hit) {
              f.hit = true;
              this.shake = Math.max(this.shake, 0.3);
              this.fxs.push({ k: 'flash', t: 0.2, max: 0.2, col: '#ff9a3d' });
              this.emit(f.x, f.y, 24, { sp: [30, 90], life: [0.3, 0.7], cols: ['#ff9a3d', '#ffe46b', '#ef4f6f', '#fff6e6'], g: 60, drag: 2, glow: 3 });
            }
            const q = (p - 0.4) / 0.6;
            const r = Math.max(2, f.r * (0.3 + 0.7 * q));
            const n = Math.max(12, Math.round(r * 1.6));
            ctx.globalAlpha = 1 - q * 0.7;
            for (let j = 0; j < n; j++) {
              const a = (j / n) * Math.PI * 2;
              ctx.fillStyle = j % 3 ? '#ff9a3d' : '#ffe46b';
              ctx.fillRect(f.x + Math.cos(a) * r - 0.5, f.y + Math.sin(a) * r - 0.5, 1, 1);
            }
            ctx.globalAlpha = 1;
            ctx.glow(f.x, f.y, r, '#ff9a3d', 0.5 * (1 - q));
            if (q < 0.4) {
              ctx.fillStyle = '#fff6e6';
              ctx.fillRect(f.x - 3.5, f.y - 3.5, 7, 7);
            }
          }
          break;
        }
        case 'flash':
          ctx.globalAlpha = 0.35 * (1 - p);
          ctx.fillStyle = f.col;
          ctx.fillRect(-4, -4, F.W + 8, F.H + 8);
          ctx.globalAlpha = 1;
          break;
        case 'riftHit': {
          const x = F.GX + (f.i % F.COLS) * F.SLOT;
          const y = F.GY + Math.floor(f.i / F.COLS) * F.SLOT;
          ctx.fillStyle = `rgba(240,127,176,${0.7 * (1 - p)})`;
          ctx.fillRect(x, y, F.SLOT, F.SLOT);
          break;
        }
      }
    }
    this.fxs.length = w;
  };

  // 피해 숫자: 톡 튀어나오며 커졌다가 제자리 크기로, 위로 떠오르며 사라진다
  P.drawNums = function (ctx, dt) {
    let w = 0;
    for (let k = 0; k < this.nums.length; k++) {
      const n = this.nums[k];
      n.t -= dt;
      if (n.t <= 0) continue;
      this.nums[w++] = n;
      const age = n.max - n.t;
      n.vy = (n.vy || -14) * Math.max(0, 1 - dt * 3);
      n.vx = (n.vx || 0) * Math.max(0, 1 - dt * 4);
      n.x += n.vx * dt;
      n.y = Math.max(6, n.y + n.vy * dt);
      const sc = age < 0.1 ? (n.big || 1.4) - ((n.big || 1.4) - 1) * ease.out(age / 0.1) : 1;
      ctx.globalAlpha = Math.min(1, n.t / 0.18);
      RS.drawNum(ctx, n.s, n.x, n.y, n.c, sc);
      ctx.globalAlpha = 1;
    }
    this.nums.length = w;
  };

  P.reset = function () {
    this.shots.length = 0;
    this.fxs.length = 0;
    this.nums.length = 0;
    this.parts.length = 0;
    this.sel = -1;
    this.drag = null;
    this.shake = 0;
    this.atk.fill(0);
    this.pop.fill(0);
    this.face.fill(1);
    if (this.noReach) this.noReach.fill(0);
  };

  RS.Renderer = Renderer;
  RS.THEMES = THEMES;
})((globalThis.RS = globalThis.RS || {}));
