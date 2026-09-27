// 전장 캔버스 렌더러 (논리 해상도 160×186, CSS 로 확대)
(function (RS) {
  'use strict';

  const F = RS.FIELD;

  const THEMES = {
    forest: {
      ground: ['#3c7443', '#447f4a', '#356a3c'], speck: ['#5a9a55', '#2e5e36', '#7cb86a', '#e8d27a', '#e89aa8'],
      path: ['#a88455', '#9a7849', '#b8935f'], pathEdge: '#6e5234', pebble: '#c9a878',
      slot: '#4b4660', slotHi: '#6a6484', slotLo: '#322e44', inner: '#554f6d',
    },
    grave: {
      ground: ['#3a3950', '#403f58', '#34334a'], speck: ['#525170', '#2b2a3d', '#6b6a88', '#8f8aa8', '#4f6b52'],
      path: ['#6f6a86', '#65607c', '#7a7592'], pathEdge: '#44405a', pebble: '#8c87a4',
      slot: '#3e3a55', slotHi: '#5b5676', slotLo: '#2a2740', inner: '#47425f',
    },
    rift: {
      ground: ['#2a1f3d', '#2f2344', '#251b36'], speck: ['#3d2c57', '#1c1429', '#7a3d8a', '#c050a0', '#4a2f66'],
      path: ['#4a3a5e', '#433555', '#524268'], pathEdge: '#2b203c', pebble: '#b04779',
      slot: '#3a2d50', slotHi: '#5a4776', slotLo: '#231a33', inner: '#43355c',
    },
    bog: {
      ground: ['#2f4a3c', '#355244', '#2a4236'], speck: ['#3f6450', '#22382c', '#5a7d5e', '#8fae7a', '#6b5a8a'],
      path: ['#5e5a3e', '#565236', '#686446'], pathEdge: '#3b3826', pebble: '#7d7856',
      slot: '#3f4a55', slotHi: '#5a6674', slotLo: '#29313a', inner: '#47525f',
    },
    harbor: {
      ground: ['#24445e', '#284b66', '#203d55'], speck: ['#3a6a8a', '#1a3148', '#5f93b5', '#a8d4e8', '#2f5a78'],
      path: ['#8a6a48', '#7d603f', '#977553'], pathEdge: '#4a3826', pebble: '#a88a64',
      slot: '#3a4458', slotHi: '#56627a', slotLo: '#262d3c', inner: '#434e66',
    },
    heart: {
      ground: ['#3a1422', '#421828', '#33101d'], speck: ['#5a1f33', '#260b15', '#8a2a44', '#e04a52', '#6b2440'],
      path: ['#5c2a3a', '#532433', '#663044'], pathEdge: '#2e0f1a', pebble: '#b04a5e',
      slot: '#43263a', slotHi: '#643a55', slotLo: '#2a1424', inner: '#4d2c44',
    },
  };

  function Renderer(canvas) {
    this.canvas = canvas;
    canvas.width = F.W;
    canvas.height = F.H;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.bg = null;
    this.theme = null;
    this.shots = [];
    this.fxs = [];
    this.nums = [];
    this.lunge = new Float32Array(F.SIZE);
    this.lungeBig = new Uint8Array(F.SIZE).fill(1);
    this.lungeDir = [];
    for (let i = 0; i < F.SIZE; i++) this.lungeDir.push({ x: 0, y: 0 });
    this.pop = new Float32Array(F.SIZE);
    this.shake = 0;
    this.t = 0;
    this.sel = -1;
    this.drag = null;
    this.hoverSlot = -1;
    this.flashRift = [];
    this.noReach = new Uint8Array(F.SIZE);
  }
  const P = Renderer.prototype;

  P.setTheme = function (name) {
    if (this.theme === name && this.bg) return;
    this.theme = name;
    this.bg = buildBackground(THEMES[name] || THEMES.forest, name);
  };

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
    // 길 (폭 18 사각 루프)
    const o = 9;
    x.fillStyle = th.pathEdge;
    x.fillRect(F.L - o - 1, F.T - o - 1, F.R - F.L + 2 * o + 2, F.B - F.T + 2 * o + 2);
    x.fillStyle = th.path[0];
    x.fillRect(F.L - o, F.T - o, F.R - F.L + 2 * o, F.B - F.T + 2 * o);
    // 안쪽 땅
    x.fillStyle = th.pathEdge;
    x.fillRect(F.L + o - 1, F.T + o - 1, F.R - F.L - 2 * o + 2, F.B - F.T - 2 * o + 2);
    x.fillStyle = th.ground[1];
    x.fillRect(F.L + o, F.T + o, F.R - F.L - 2 * o, F.B - F.T - 2 * o);
    for (let k = 0; k < 500; k++) {
      const px = rng.int(F.W);
      const py = rng.int(F.H);
      const onPath = px >= F.L - o && px < F.R + o && py >= F.T - o && py < F.B + o &&
        !(px >= F.L + o && px < F.R - o && py >= F.T + o && py < F.B - o);
      if (!onPath) continue;
      x.fillStyle = rng.chance(0.2) ? th.pebble : rng.pick(th.path);
      x.fillRect(px, py, rng.chance(0.3) ? 2 : 1, 1);
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
          if (ev.slot >= 0) {
            this.lunge[ev.slot] = ev.cls === 'knight' ? 0.14 : 0.09;
            this.lungeBig[ev.slot] = ev.cls === 'knight' ? 2 : 1;
            const d = this.lungeDir[ev.slot];
            const dx = ev.x2 - ev.x1;
            const dy = ev.y2 - ev.y1;
            const len = Math.max(1, Math.hypot(dx, dy));
            d.x = Math.round(dx / len);
            d.y = Math.round(dy / len);
          }
          break;
        case 'num':
          // 숫자가 너무 많으면 치명타·큰 적 위주로만 띄운다
          if (this.nums.length < (ev.crit ? 16 : 7)) {
            this.nums.push({ x: ev.x + (Math.random() * 8 - 4), y: ev.y - Math.random() * 5, s: RS.fmtNum(ev.v), c: ev.crit ? 'y' : 'w', t: ev.crit ? 0.8 : 0.55, max: ev.crit ? 0.8 : 0.55 });
          }
          break;
        case 'boom':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0.25, max: 0.25, col: RS.TIER[ev.tier].light });
          break;
        case 'kill':
          this.fxs.push({ k: 'puff', x: ev.x, y: ev.y, t: 0.35, max: 0.35, big: ev.big });
          if (ev.gold >= 1) this.nums.push({ x: ev.x, y: ev.y - 8, s: '+' + Math.floor(ev.gold), c: 'g', t: 0.7, max: 0.7 });
          if (ev.big) this.shake = Math.max(this.shake, 0.25);
          break;
        case 'leak':
          this.fxs.push({ k: 'leak', x: F.L, y: F.T, t: 0.5, max: 0.5 });
          this.nums.push({ x: F.L + 6, y: F.T + 4, s: '-' + Math.round(ev.v), c: 'r', t: 0.9, max: 0.9 });
          this.shake = Math.max(this.shake, 0.18);
          break;
        case 'summon':
          this.pop[ev.slot] = 0.3;
          if (ev.twin != null) this.pop[ev.twin] = 0.3;
          break;
        case 'merge':
          for (const r of ev.res.results) {
            this.pop[r.slot] = 0.45;
            const c = RS.slotCenter(r.slot);
            this.fxs.push({ k: 'star', x: c.x, y: c.y, t: 0.5, max: 0.5, col: RS.TIER[r.tier].light });
          }
          break;
        case 'heal':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0.4, max: 0.4, col: '#62c35f' });
          break;
        case 'haste':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: ev.r, t: 0.4, max: 0.4, col: '#a061e8' });
          break;
        case 'summonFx':
          this.fxs.push({ k: 'ring', x: ev.x, y: ev.y, r: 14, t: 0.4, max: 0.4, col: '#f07fb0' });
          break;
        case 'keg':
          this.fxs.push({ k: 'flash', t: 0.2, max: 0.2, col: '#ff9a3d' });
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
        case 'bossDown':
          this.shake = 0.5;
          this.fxs.push({ k: 'flash', t: 0.35, max: 0.35, col: '#ffffff' });
          break;
      }
    }
    list.length = 0;
    b.numCount = 0;
  };

  P.addShot = function (ev) {
    if (this.shots.length > 90) return;
    const dur = ev.cls === 'knight' ? (ev.crit ? 0.26 : 0.2) : ev.cls === 'rogue' ? 0.1 : ev.cls === 'mage' ? 0.16 : 0.12;
    // 전사는 번갈아 가며 반대 방향으로 벤다
    this.slashFlip = !this.slashFlip;
    this.shots.push({ cls: ev.cls, tier: ev.tier, x1: ev.x1, y1: ev.y1 - 3, x2: ev.x2, y2: ev.y2, t: dur, max: dur, crit: ev.crit, flip: this.slashFlip, miss: ev.miss });
  };

  // ── 그리기 ──
  P.draw = function (b, dt) {
    const ctx = this.ctx;
    this.t += dt;
    let sx = 0;
    let sy = 0;
    if (this.shake > 0) {
      this.shake -= dt;
      sx = Math.round((Math.random() - 0.5) * 3);
      sy = Math.round((Math.random() - 0.5) * 3);
    }
    ctx.setTransform(1, 0, 0, 1, sx, sy);
    ctx.drawImage(this.bg, 0, 0);
    this.drawPortal(ctx);
    if (b) {
      this.drawRift(ctx, b);
      this.drawSlots(ctx, b, dt);
      this.drawEnemies(ctx, b);
    }
    this.drawShots(ctx, dt);
    this.drawFx(ctx, dt);
    this.drawNums(ctx, dt);
    if (b) this.drawDrag(ctx, b);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  P.drawPortal = function (ctx) {
    const cx = F.L;
    const cy = F.T;
    const cols = ['#f07fb0', '#a061e8', '#5e3593'];
    for (let k = 0; k < 10; k++) {
      const a = this.t * 3 + (k * Math.PI * 2) / 10;
      const r = 3 + (k % 3) * 1.6;
      ctx.fillStyle = cols[k % 3];
      ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
    ctx.fillStyle = '#f7d9ff';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  };

  P.drawRift = function (ctx, b) {
    for (const w of b.riftWarn) {
      const blink = Math.floor(this.t * 10) % 2 === 0;
      for (const c of w.cells) {
        const x = F.GX + (c % F.COLS) * F.SLOT;
        const y = F.GY + Math.floor(c / F.COLS) * F.SLOT;
        ctx.fillStyle = blink ? 'rgba(240,60,90,0.45)' : 'rgba(240,60,90,0.2)';
        ctx.fillRect(x + 1, y + 1, F.SLOT - 2, F.SLOT - 2);
      }
    }
  };

  // 룬: 칸 네 귀퉁이에 룬 색 표시, 금 간 칸은 금을 그린다
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
    // 강화된 칸: 룬 색으로 칸을 물들이고 테두리를 두른 뒤, 왼쪽 위에 룬 문양
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
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.t * 3);
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
      if (this.lunge[i] > 0) this.lunge[i] -= dt;
      if (this.pop[i] > 0) this.pop[i] -= dt;
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
      if (!s) continue;
      const T = RS.TIER[s.tier];
      // 등급 테두리
      ctx.fillStyle = T.dark;
      ctx.fillRect(x + 2, y + F.SLOT - 4, F.SLOT - 4, 2);
      if (s.tier > 0) {
        ctx.fillStyle = T.color;
        ctx.fillRect(x + 2, y + F.SLOT - 4, F.SLOT - 4, 1);
      }
      const spr = RS.SPR[s.cls + s.tier];
      const bob = Math.sin(t * 3 + i) > 0.6 ? -1 : 0;
      let ox = 0;
      let oy = bob;
      if (this.lunge[i] > 0) {
        ox += this.lungeDir[i].x * this.lungeBig[i];
        oy += this.lungeDir[i].y * this.lungeBig[i];
      }
      if (this.pop[i] > 0) oy -= Math.round(this.pop[i] * 8);
      let draggedAway = false;
      if (dr && dr.moved) {
        if (dr.from === i) {
          ctx.globalAlpha = 0.35;
          draggedAway = true;
        } else if (dr.over === i) ctx.globalAlpha = 0.35; // 자리를 내줄 유닛
      }
      const stunned = b.slotStun[i] > 0;
      ctx.drawImage(spr, x + 4 + ox, y + 2 + oy);
      ctx.globalAlpha = 1;
      // 신화: 유닛 둘레를 도는 반짝이
      if (s.tier >= 4 && !draggedAway) {
        const T4 = RS.TIER[s.tier];
        for (let k = 0; k < 3; k++) {
          const a = t * 2.4 + k * 2.094 + i;
          ctx.fillStyle = k === 0 ? '#ffffff' : T4.light;
          ctx.fillRect(Math.round(x + F.SLOT / 2 + Math.cos(a) * 8), Math.round(y + F.SLOT / 2 - 1 + Math.sin(a) * 8), 1, 1);
        }
      }
      if (draggedAway && dr.over >= 0 && dr.over !== i && board[dr.over]) {
        // 자리 바꿈 미리보기: 목표 칸의 유닛이 이 칸으로 온다
        const o = board[dr.over];
        ctx.globalAlpha = 0.5;
        ctx.drawImage(RS.SPR[o.cls + o.tier], x + 4, y + 2);
        ctx.globalAlpha = 1;
      }
      if (stunned) {
        ctx.fillStyle = 'rgba(160,97,232,0.45)';
        ctx.fillRect(x + 2, y + 2, F.SLOT - 4, F.SLOT - 4);
        this.drawStars(ctx, x + 13, y + 4);
      }
      // 스택 수
      if (s.n > 1) {
        ctx.fillStyle = '#1d1428';
        ctx.fillRect(x + F.SLOT - 9, y + F.SLOT - 10, 7, 7);
        RS.drawNum(ctx, String(s.n), x + F.SLOT - 5.5, y + F.SLOT - 10, RS.canMerge(board, i) ? 'y' : 'w');
      }
      if (RS.canMerge(board, i) && Math.floor(t * 3) % 2 === 0) {
        ctx.drawImage(RS.SPR.i_up, x + 1, y + 1, 7, 7);
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
      ctx.fillStyle = '#ffe46b';
      ctx.fillRect(x, y, F.SLOT, 1);
      ctx.fillRect(x, y + F.SLOT - 1, F.SLOT, 1);
      ctx.fillRect(x, y, 1, F.SLOT);
      ctx.fillRect(x + F.SLOT - 1, y, 1, F.SLOT);
      const s = board[i];
      if (s && b.slotStats[i]) {
        const c = RS.slotCenter(i);
        const r = b.slotStats[i].range;
        const n = Math.max(24, Math.round(r * 1.2));
        ctx.fillStyle = 'rgba(255,228,107,0.8)';
        for (let k = 0; k < n; k++) {
          if (k % 2) continue;
          const a = (k / n) * Math.PI * 2 + t * 0.4;
          ctx.fillRect(Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r), 1, 1);
        }
      }
    }
  };

  // 끌고 있는 유닛은 손가락보다 조금 위에 그린다
  P.drawDrag = function (ctx, b) {
    const dr = this.drag;
    if (!dr || !dr.moved) return;
    const s = b.run.board[dr.from];
    if (!s) return;
    const spr = RS.SPR[s.cls + s.tier];
    ctx.drawImage(spr, Math.round(dr.x - spr.width / 2), Math.round(dr.y - 26));
  };

  P.drawStars = function (ctx, x, y) {
    const k = Math.floor(this.t * 8) % 4;
    ctx.fillStyle = '#ffe46b';
    ctx.fillRect(x - 4 + k, y, 1, 1);
    ctx.fillRect(x + 3 - k, y + 1, 1, 1);
  };

  P.drawEnemies = function (ctx, b) {
    const list = this.sorted || (this.sorted = []);
    list.length = 0;
    for (let k = 0; k < b.enemies.length; k++) list.push(b.enemies[k]);
    list.sort((a, c) => a.y - c.y);
    const t = this.t;
    const blind = !!b.M.blindfold;
    for (const e of list) {
      let name = e.type;
      if (name === 'slime' || name === 'bat') {
        if (Math.floor(t * 4 + e.phase) % 2) name += '2';
      } else if (name === 'frog' && e.hopT !== undefined && (e.hopT < 0.25 || e.hopT > e.def.hop.every - 0.3)) {
        name = 'frog2'; // 뛰기 직전·직후 웅크린 모습
      }
      const spr = RS.SPR[name];
      const w = spr.width;
      const h = spr.height;
      const bob = e.boss ? 0 : Math.round(Math.sin(t * 8 + e.phase));
      const x = Math.round(e.x - w / 2);
      const y = Math.round(e.y - h + 5 + bob);
      // 물속에 잠긴 늪의 여왕: 흐릿한 모습과 물결만
      if (e.subT > 0) {
        ctx.globalAlpha = 0.28;
        ctx.drawImage(spr, x, y);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#a8ecff';
        const k = Math.floor(t * 6) % 3;
        for (let j = 0; j < w; j += 3) ctx.fillRect(x + j + k, y + h - 3, 2, 1);
        continue;
      }
      if (e.boss && b.enraged) {
        ctx.drawImage(RS.SPR[e.type + '_w'], x - 1, y);
        ctx.drawImage(RS.SPR[e.type + '_w'], x + 1, y);
      }
      if (e.elite) {
        ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 6);
        ctx.drawImage(RS.SPR[e.type + '_w'], x, y - 1);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(spr, x, y);
      if (e.flash > 0) {
        ctx.globalAlpha = 0.8;
        ctx.drawImage(RS.SPR[e.type + '_w'], x, y);
        ctx.globalAlpha = 1;
      } else if (e.slow > 0 || e.stunT > 0) {
        ctx.globalAlpha = e.stunT > 0 ? 0.6 : 0.35;
        ctx.drawImage(RS.SPR[e.type + '_i'], x, y);
        ctx.globalAlpha = 1;
      }
      if (e.burnT > 0 && Math.floor(t * 10) % 2) {
        ctx.fillStyle = '#ff9a3d';
        ctx.fillRect(x + (e.id % w), y + 2, 1, 1);
      }
      if (e.stunT > 0) this.drawStars(ctx, Math.round(e.x), y - 2);
      // 불타는 엘리트
      if (e.burning) {
        const fl = RS.SPR.i_flameE;
        const k = Math.floor(t * 8) % 2;
        ctx.drawImage(fl, x - 2, y - 2 - k);
        ctx.drawImage(fl, x + w - fl.width + 2, y - 3 + k);
      }
    }
    // 체력바는 모든 적을 그린 뒤에 (눈가리개를 하면 보이지 않는다)
    if (blind) return;
    for (const e of list) {
      if (e.boss || e.subT > 0 || e.hp >= e.maxHp) continue;
      const spr = RS.SPR[e.type];
      const w = spr.width;
      const top = Math.round(e.y - spr.height + 5 + (e.boss ? 0 : Math.round(Math.sin(t * 8 + e.phase))));
      const bw = Math.max(8, w - 4);
      const bx = Math.round(e.x - bw / 2);
      const by = top - 3;
      const fill = Math.max(1, Math.round((bw * Math.max(0, e.hp)) / e.maxHp));
      if (e.elite) {
        ctx.fillStyle = '#1d1428';
        ctx.fillRect(bx - 1, by - 1, bw + 2, 3);
        ctx.fillStyle = '#f5c44a';
        ctx.fillRect(bx, by, fill, 1);
      } else {
        ctx.fillStyle = '#3a1d2c';
        ctx.fillRect(bx + fill, by, bw - fill, 1);
        ctx.fillStyle = '#e04a52';
        ctx.fillRect(bx, by, fill, 1);
      }
    }
  };

  P.drawShots = function (ctx, dt) {
    let w = 0;
    for (let k = 0; k < this.shots.length; k++) {
      const s = this.shots[k];
      s.t -= dt;
      if (s.t <= 0) continue;
      this.shots[w++] = s;
      const p = 1 - s.t / s.max;
      const x = Math.round(s.x1 + (s.x2 - s.x1) * p);
      const y = Math.round(s.y1 + (s.y2 - s.y1) * p);
      const T = RS.TIER[s.tier];
      switch (s.cls) {
        case 'archer': {
          const dx = s.x2 - s.x1;
          const dy = s.y2 - s.y1;
          const len = Math.max(1, Math.hypot(dx, dy));
          ctx.fillStyle = '#f6f1e8';
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = '#8d5b3d';
          ctx.fillRect(Math.round(x - (dx / len) * 2), Math.round(y - (dy / len) * 2), 1, 1);
          ctx.fillStyle = T.light;
          ctx.fillRect(Math.round(x - (dx / len) * 3), Math.round(y - (dy / len) * 3), 1, 1);
          break;
        }
        case 'mage':
          ctx.fillStyle = T.color;
          ctx.fillRect(x - 1, y - 1, 3, 3);
          ctx.fillStyle = '#fff6e6';
          ctx.fillRect(x, y, 1, 1);
          break;
        case 'frost':
          ctx.fillStyle = '#a8ecff';
          ctx.fillRect(x - 1, y, 3, 1);
          ctx.fillRect(x, y - 1, 1, 3);
          break;
        case 'rogue':
          ctx.fillStyle = s.crit ? '#ffe46b' : '#d3dbe6';
          ctx.fillRect(x, y, 2, 1);
          break;
        case 'knight':
          this.drawSlash(ctx, s, p, T);
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
          const r = Math.max(2, f.r * (0.4 + 0.6 * p));
          const n = Math.max(10, Math.round(r * 1.6));
          ctx.fillStyle = f.col;
          for (let j = 0; j < n; j++) {
            const a = (j / n) * Math.PI * 2;
            ctx.fillRect(Math.round(f.x + Math.cos(a) * r), Math.round(f.y + Math.sin(a) * r), 1, 1);
          }
          break;
        }
        case 'puff': {
          const r = (f.big ? 10 : 5) * p;
          ctx.fillStyle = p < 0.5 ? '#fff6e6' : '#b8c2d3';
          for (let j = 0; j < 6; j++) {
            const a = j * 1.047 + f.x;
            ctx.fillRect(Math.round(f.x + Math.cos(a) * r), Math.round(f.y - 3 + Math.sin(a) * r), 1, 1);
          }
          break;
        }
        case 'leak':
          ctx.fillStyle = `rgba(240,60,90,${0.6 * (1 - p)})`;
          ctx.fillRect(F.L - 9, F.T - 9, 18, 18);
          break;
        case 'star': {
          const r = 4 + 10 * p;
          ctx.fillStyle = f.col;
          for (let j = 0; j < 8; j++) {
            const a = (j / 8) * Math.PI * 2 + p;
            ctx.fillRect(Math.round(f.x + Math.cos(a) * r), Math.round(f.y + Math.sin(a) * r), 1, 1);
          }
          break;
        }
        case 'flash':
          ctx.globalAlpha = 0.35 * (1 - p);
          ctx.fillStyle = f.col;
          ctx.fillRect(0, 0, F.W, F.H);
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

  P.drawNums = function (ctx, dt) {
    let w = 0;
    for (let k = 0; k < this.nums.length; k++) {
      const n = this.nums[k];
      n.t -= dt;
      if (n.t <= 0) continue;
      this.nums[w++] = n;
      n.y = Math.max(6, n.y - dt * 14);
      RS.drawNum(ctx, n.s, n.x, n.y, n.c);
    }
    this.nums.length = w;
  };

  P.reset = function () {
    this.shots.length = 0;
    this.fxs.length = 0;
    this.nums.length = 0;
    this.sel = -1;
    this.drag = null;
    this.shake = 0;
    if (this.noReach) this.noReach.fill(0);
  };

  RS.Renderer = Renderer;
  RS.THEMES = THEMES;
})((globalThis.RS = globalThis.RS || {}));
