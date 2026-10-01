// 전장 바닥 (막마다 다른 땅·길·소품·빛). 한 번만 구워 두고 매 프레임 한 장으로 그린다.
// 바닥은 논리 160×186 의 두 배 (320×372) 도트로 굽는다: 길 타일·소품이 더 촘촘하고, 빛(등불·문·가장자리 그늘)도 여기에 구워 넣는다.
// 그래서 실시간 조명·비네트 캔버스가 따로 없다 (매 프레임 전체 화면 합성 0번).
(function (RS) {
  'use strict';

  const F = RS.FIELD;
  const A = 2; // 논리 픽셀 하나 = 도트 2칸
  const W = F.W * A;
  const H = F.H * A;
  const O = 9; // 길 반폭 (논리)

  const hex = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  // ground: 땅 / path: 길 [기본, 줄눈(어둡게), 밝게] / style: 길 타일 / amb: 떠다니는 것 / light: 바닥 조명
  //  - 길은 그 막에 많이 나오는 적과 색이 겹치지 않게: 묘지·균열은 차가운 회청색, 심장은 뼈빛 회색
  const THEMES = {
    forest: {
      ground: ['#3a7142', '#447f4a', '#30623a'], speck: ['#5a9a55', '#2a5631', '#7cb86a'],
      path: ['#9a7a50', '#7d6040', '#b39062'], edge: '#5e4630', style: 'dirt', stone: ['#8f8a7c', '#b5ae9a', '#6a665b'],
      slot: '#4b4660', slotHi: '#6c6688', slotLo: '#2e2a40', inner: '#57506f',
      amb: 'firefly', ambient: [1.0, 0.98, 0.9], vig: 0.42, props: 'forest', tint: '#f5e27a',
    },
    grave: {
      ground: ['#33384a', '#3a4053', '#2c3040'], speck: ['#485066', '#262a38', '#4f6b52'],
      path: ['#59606f', '#4d5362', '#6a7182'], edge: '#2e3240', style: 'flag',
      slot: '#3c3a54', slotHi: '#5c5878', slotLo: '#25233a', inner: '#48445f',
      amb: 'wisp', ambient: [0.84, 0.88, 1.0], vig: 0.5, props: 'grave', tint: '#9ab8ff',
    },
    rift: {
      ground: ['#2a1f3d', '#31254a', '#231a34'], speck: ['#3d2c57', '#1c1429', '#4a2f66'],
      path: ['#3c4256', '#33384a', '#4a5168'], edge: '#1e2130', style: 'obsidian', vein: '#e070c0',
      slot: '#3a2d50', slotHi: '#5c4a7a', slotLo: '#211830', inner: '#45375e',
      amb: 'mote', ambient: [0.86, 0.8, 1.0], vig: 0.52, props: 'rift', tint: '#d070ff',
    },
    bog: {
      ground: ['#2a4438', '#2f4c3f', '#243c31'], speck: ['#3d5f4c', '#1d3328', '#55785a'],
      path: ['#7a6544', '#5c4a30', '#927a54'], edge: '#2a2418', style: 'boards',
      slot: '#3f4a55', slotHi: '#5c6878', slotLo: '#272f38', inner: '#48545f',
      amb: 'bubble', ambient: [0.86, 0.96, 0.88], vig: 0.48, props: 'bog', tint: '#b8f080',
    },
    harbor: {
      ground: ['#21405a', '#264a66', '#1c3850'], speck: ['#3a6a8a', '#18304a', '#5f93b5'],
      path: ['#6e6258', '#574c43', '#857868'], edge: '#2c241d', style: 'dock',
      slot: '#3a4458', slotHi: '#58647e', slotLo: '#232a3a', inner: '#444f68',
      amb: 'sparkle', ambient: [0.88, 0.94, 1.0], vig: 0.46, props: 'harbor', tint: '#ffd27a',
    },
    heart: {
      ground: ['#3a1422', '#45182a', '#30101c'], speck: ['#5a1f33', '#240a14', '#7a2440'],
      path: ['#4f4652', '#423a46', '#625868'], edge: '#1e121c', style: 'cobble', vein: '#ff4d5a',
      slot: '#43263a', slotHi: '#663c58', slotLo: '#281322', inner: '#4f2d46',
      amb: 'ember', ambient: [1.0, 0.84, 0.86], vig: 0.52, props: 'heart', tint: '#ff6b5a',
    },
  };

  // 결정적 해시 잡음
  function h2(x, y, s) {
    let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const a = h2(xi, yi, s);
    const b = h2(xi + 1, yi, s);
    const c = h2(xi, yi + 1, s);
    const d = h2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

  // 도트 그림 (소품): 글자 = 색
  const PROP = {
    mush: { rows: ['.rrr.', 'rwrrr', 'rrrwr', '.oso.', '..s..'], pal: { r: '#e04a52', w: '#f6f1e8', s: '#e8dcc0', o: '#1d1428' } },
    flower: { rows: ['.y.', 'yoy', '.y.', '.g.'], pal: { y: '#f5e27a', o: '#e89aa8', g: '#2f7a3e' } },
    flower2: { rows: ['.p.', 'pwp', '.p.', '.g.'], pal: { p: '#e89aa8', w: '#fff6e6', g: '#2f7a3e' } },
    tuft: { rows: ['g.g.g', '.gGg.', 'GgGgG'], pal: { g: '#5fa35a', G: '#2a5a33' } },
    rock: { rows: ['.hhh.', 'hHhhd', 'ddddd'], pal: { h: '#a8a294', H: '#cfc8b4', d: '#5e5a50' } },
    tomb: { rows: ['.ccc.', 'cCCCc', 'cC.Cc', 'cCCCc', 'cCCCc', 'ddddd'], pal: { c: '#6e7488', C: '#8a90a4', d: '#262a38' } },
    cross: { rows: ['.c.', 'ccc', '.c.', '.c.', 'ddd'], pal: { c: '#8a90a4', d: '#262a38' } },
    candle: { rows: ['.f.', '.y.', '.w.', '.w.', 'ddd'], pal: { f: '#ffb347', y: '#ffe46b', w: '#e8dcc0', d: '#3a3040' }, light: ['#ffb347', 15] },
    deadgrass: { rows: ['h.h.h', '.hHh.', 'HhHhH'], pal: { h: '#6b6a58', H: '#4a4a3c' } },
    crystal: { rows: ['..c..', '.cCc.', '.cCc.', 'cCWCc', 'dCCCd'], pal: { c: '#a061e8', C: '#e070c0', W: '#ffd0f0', d: '#2a1f3d' }, light: ['#c050e0', 14] },
    shard: { rows: ['.c.', 'cWc', 'cCc', 'ddd'], pal: { c: '#6be0d0', C: '#3aa8b0', W: '#e8fff8', d: '#1c1429' }, light: ['#6be0d0', 10] },
    reed: { rows: ['b.b..', 'b.b.b', 'g.g.b', 'g.ggg', 'ggggg'], pal: { b: '#7a5a3a', g: '#5a7d5e' } },
    lily: { rows: ['.gg.', 'gGgg', '.gg.'], pal: { g: '#5a9e3a', G: '#9ee06a' } },
    gshroom: { rows: ['.ccc.', 'cCCCc', '.oso.', '..s..'], pal: { c: '#62c35f', C: '#b8f080', s: '#c8d8b0', o: '#1d3328' }, light: ['#9ee06a', 12] },
    crate: { rows: ['dddddd', 'dbBbbd', 'dbdBbd', 'dbbdBd', 'dddddd'], pal: { d: '#4f2d20', b: '#a87848', B: '#c89868' } },
    post: { rows: ['.hh.', 'hHHh', '.hh.', '.hh.', '.hh.', 'dddd'], pal: { h: '#6e5a48', H: '#8a7660', d: '#1c2a38' } },
    lantern: { rows: ['.d.', 'dyd', 'yYy', 'dyd', '.h.', '.h.', 'ddd'], pal: { d: '#2c241d', y: '#ffd27a', Y: '#fff6e6', h: '#6e5a48' }, light: ['#ffc060', 20] },
    pustule: { rows: ['.rr.', 'rRWr', 'rRRr', '.dd.'], pal: { r: '#c03a52', R: '#ff6b6b', W: '#ffd0d0', d: '#240a14' }, light: ['#ff4d5a', 11] },
    bone: { rows: ['w...w', '.www.', 'w...w'], pal: { w: '#d8cbb0' } },
    spike: { rows: ['..w..', '..w..', '.wWw.', '.wWw.', 'ddddd'], pal: { w: '#d8cbb0', W: '#a8987a', d: '#240a14' } },
  };
  const PROPSET = {
    forest: [['mush', 4], ['flower', 6], ['flower2', 5], ['tuft', 14], ['rock', 4]],
    grave: [['tomb', 4], ['cross', 4], ['candle', 3], ['deadgrass', 10], ['rock', 3]],
    rift: [['crystal', 4], ['shard', 5], ['rock', 5]],
    bog: [['reed', 8], ['lily', 8], ['gshroom', 4]],
    harbor: [['crate', 3], ['post', 5], ['lantern', 2]],
    heart: [['pustule', 5], ['bone', 4], ['spike', 4]],
  };

  function onPathL(px, py, o) {
    return px >= F.L - o && px < F.R + o && py >= F.T - o && py < F.B + o && !(px >= F.L + o && px < F.R - o && py >= F.T + o && py < F.B - o);
  }
  function overSlots(px, py, m) {
    return px > F.GX - m && px < F.GX + F.COLS * F.SLOT + m && py > F.GY - m && py < F.GY + F.ROWS * F.SLOT + m;
  }

  function buildBackground(name) {
    const th = THEMES[name] || THEMES.forest;
    const seed = name.length * 977 + name.charCodeAt(0) * 31 + 13;
    const rng = new RS.Rng(seed);
    const buf = new Float32Array(W * H * 3);
    const set = (x, y, c, a) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 3;
      if (a == null || a >= 1) {
        buf[i] = c[0];
        buf[i + 1] = c[1];
        buf[i + 2] = c[2];
      } else {
        buf[i] += (c[0] - buf[i]) * a;
        buf[i + 1] += (c[1] - buf[i + 1]) * a;
        buf[i + 2] += (c[2] - buf[i + 2]) * a;
      }
    };
    const mul = (x, y, k) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return;
      const i = (y * W + x) * 3;
      buf[i] *= k;
      buf[i + 1] *= k;
      buf[i + 2] *= k;
    };
    const rect = (x, y, w, h, c, a) => {
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(xx, yy, c, a);
    };
    const G = th.ground.map(hex);
    const SP = th.speck.map(hex);
    const P = th.path.map(hex);
    const E = hex(th.edge);
    const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

    // 1) 땅: 큰 얼룩 + 잔 점
    const isWater = th.props === 'harbor' || th.props === 'bog';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = vnoise(x / 22, y / 22, seed) * 0.65 + vnoise(x / 7, y / 7, seed + 1) * 0.35;
        let c = n < 0.38 ? G[2] : n > 0.62 ? G[1] : G[0];
        const r = h2(x, y, seed + 2);
        if (r < 0.035) c = SP[(r * 1000) % SP.length | 0];
        if (isWater) {
          // 물결: 가로로 짧은 밝은 줄
          const wv = Math.sin(x * 0.35 + Math.floor(y / 5) * 1.7 + vnoise(x / 9, y / 3, seed + 3) * 5);
          if (wv > 0.93 && (y % 5) === 0) c = lerp(c, SP[2], 0.55);
        }
        set(x, y, c);
      }
    }

    // 2) 길 (타일 무늬)
    const L0 = (F.L - O) * A;
    const T0 = (F.T - O) * A;
    const R0 = (F.R + O) * A;
    const B0 = (F.B + O) * A;
    const L1 = (F.L + O) * A;
    const T1 = (F.T + O) * A;
    const R1 = (F.R - O) * A;
    const B1 = (F.B - O) * A;
    const PW = O * 2 * A; // 길 폭 (도트)
    // 자갈 (숲): 납작한 디딤돌 목록
    const stones = [];
    if (th.style === 'dirt') {
      for (let k = 0; k < 90; k++) {
        const sx = rng.int(W);
        const sy = rng.int(H);
        if (!onPathL(sx / A, sy / A, O - 2)) continue;
        stones.push([sx, sy, 3 + rng.int(4), 2 + rng.int(2), rng.next()]);
      }
    }
    // 조약돌 (심장): 지터 격자 보로노이
    const cellPt = (cx, cy) => [cx * 9 + 1 + h2(cx, cy, seed + 7) * 7, cy * 9 + 1 + h2(cx, cy, seed + 8) * 7];
    const vor = (x, y) => {
      const cx = Math.floor(x / 9);
      const cy = Math.floor(y / 9);
      let d1 = 1e9;
      let d2 = 1e9;
      let id = 0;
      for (let j = -1; j <= 1; j++) {
        for (let i = -1; i <= 1; i++) {
          const p = cellPt(cx + i, cy + j);
          const d = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = (cx + i) * 131 + (cy + j);
          } else if (d < d2) d2 = d;
        }
      }
      return [Math.sqrt(d2) - Math.sqrt(d1), id, Math.sqrt(d1)];
    };
    const inRing = (x, y) => x >= L0 && x < R0 && y >= T0 && y < B0 && !(x >= L1 && x < R1 && y >= T1 && y < B1);
    for (let y = T0; y < B0; y++) {
      for (let x = L0; x < R0; x++) {
        if (!inRing(x, y)) continue;
        // 가로 구간(위·아래)인지 세로 구간인지, 그리고 길을 가로지르는 위치 v (0~PW)
        const horiz = y < T1 || y >= B1;
        const v = horiz ? (y < T1 ? y - T0 : y - B1) : x < L1 ? x - L0 : x - R1;
        const u = horiz ? x : y;
        let c = P[0];
        const nz = vnoise(x / 5, y / 5, seed + 4);
        switch (th.style) {
          case 'dirt': {
            c = lerp(P[0], nz > 0.5 ? P[2] : P[1], Math.abs(nz - 0.5) * 0.7);
            const r = h2(x, y, seed + 5);
            if (r < 0.05) c = P[1];
            else if (r > 0.97) c = P[2];
            break;
          }
          case 'flag': {
            // 닳은 판석: 줄눈은 8% 만 어둡게 (적이 묻히지 않게)
            const tw = 12;
            const tv = 9;
            const row = Math.floor(v / tv);
            const uu = u + (row % 2) * 6;
            const tile = Math.floor(uu / tw) * 17 + row;
            const tint = 0.97 + h2(tile, row, seed + 6) * 0.06;
            c = scale(P[0], tint);
            if (uu % tw === 0 || v % tv === 0) c = scale(P[0], 0.92);
            else if (uu % tw === 1 || v % tv === 1) c = scale(P[0], tint * 1.03);
            if (h2(x, y, seed + 9) < 0.03) c = scale(c, 0.94);
            break;
          }
          case 'obsidian': {
            // 금 간 흑요석 판: 큰 판 + 잔금, 잔금 일부가 빛난다 (빛은 아래에서 따로)
            const vv = vor(x * 0.55, y * 0.55);
            c = lerp(P[0], P[2], Math.max(0, nz - 0.45) * 0.6);
            if (vv[0] < 0.5) c = scale(P[1], 0.85);
            else if (vv[0] < 1.1) c = scale(c, 1.05);
            break;
          }
          case 'boards': {
            // 늪 위 판자길: 길을 가로지르는 판자, 판자마다 색이 조금씩 다르다
            const pw = 6;
            const plank = Math.floor(u / pw);
            const tint = 0.9 + h2(plank, 3, seed) * 0.18;
            c = scale(lerp(P[0], P[2], vnoise(u / 3, v / 14, seed + plank) * 0.5), tint);
            if (u % pw === 0) c = scale(E, 1.1);
            else if (u % pw === 1) c = scale(c, 1.08);
            if ((v === 4 || v === PW - 5) && u % pw === 3) c = [40, 34, 28];
            if (h2(plank, 7, seed) < 0.06 && v > 10 && v < PW - 10) c = scale(G[2], 0.8); // 빠진 판자 틈
            break;
          }
          case 'dock': {
            // 부두 널판: 길 방향으로 긴 판, 이음매가 엇갈린다
            const pw = 6;
            const lane = Math.floor(v / pw);
            const joint = (u + lane * 23) % 46;
            const tint = 0.92 + h2(lane, Math.floor((u + lane * 23) / 46), seed) * 0.14;
            c = scale(lerp(P[0], P[2], vnoise(u / 12, v / 2, seed + lane) * 0.45), tint);
            if (v % pw === 0) c = scale(E, 1.2);
            else if (v % pw === 1) c = scale(c, 1.07);
            if (joint === 0) c = scale(E, 1.3);
            if ((joint === 2 || joint === 44) && v % pw === 3) c = [200, 190, 170];
            break;
          }
          case 'cobble': {
            const vv = vor(x, y);
            const tint = 0.9 + h2(vv[1], 1, seed) * 0.16;
            c = scale(P[0], tint);
            if (vv[0] < 1.0) c = scale(P[1], 0.9);
            else if (vv[2] < 2.2) c = scale(P[2], tint);
            break;
          }
        }
        // 가장자리로 갈수록 살짝 어둡게 (길이 가운데로 볼록)
        const ev = Math.min(v, PW - 1 - v);
        if (ev < 2) c = E;
        else if (ev < 4) c = scale(c, 0.88);
        else if (ev < 6) c = scale(c, 0.95);
        set(x, y, c);
      }
    }
    if (th.style === 'dirt') {
      const S0 = hex(th.stone[0]);
      const S1 = hex(th.stone[1]);
      const S2 = hex(th.stone[2]);
      for (const [sx, sy, rw, rh] of stones) {
        for (let y = -rh; y <= rh; y++) {
          for (let x = -rw; x <= rw; x++) {
            const d = (x * x) / (rw * rw) + (y * y) / (rh * rh);
            if (d > 1) continue;
            set(sx + x, sy + y, y < -rh * 0.3 && d < 0.8 ? S1 : d > 0.7 && y > 0 ? S2 : S0);
          }
        }
        for (let x = -rw + 1; x < rw; x++) mul(sx + x, sy + rh + 1, 0.75);
      }
    }
    // 흑요석·살덩이 길의 빛나는 실금
    const glowPts = [];
    if (th.vein) {
      const V = hex(th.vein);
      for (let k = 0; k < (th.style === 'obsidian' ? 9 : 6); k++) {
        let x = rng.int(W);
        let y = rng.int(H);
        if (!inRing(x, y)) continue;
        let dir = rng.int(4);
        const len = 10 + rng.int(18);
        for (let j = 0; j < len; j++) {
          if (!inRing(x, y)) break;
          set(x, y, V, 0.85);
          if (j % 7 === 3) glowPts.push([x, y]);
          if (rng.chance(0.3)) dir = (dir + (rng.chance(0.5) ? 1 : 3)) % 4;
          x += [1, 0, -1, 0][dir];
          y += [0, 1, 0, -1][dir];
        }
      }
    }
    // 심장 막: 땅에도 붉은 핏줄
    if (th.props === 'heart') {
      const V = hex('#7a2440');
      for (let k = 0; k < 40; k++) {
        let x = rng.int(W);
        let y = rng.int(H);
        let dir = rng.int(4);
        for (let j = 0; j < 14; j++) {
          if (!inRing(x, y)) set(x, y, V, 0.8);
          if (rng.chance(0.35)) dir = (dir + (rng.chance(0.5) ? 1 : 3)) % 4;
          x += [1, 0, -1, 0][dir];
          y += [0, 1, 0, -1][dir];
        }
      }
    }

    // 3) 칸: 바깥 그늘 → 테두리 → 비스듬한 빛 → 안쪽 판
    const SL = hex(th.slot);
    const SH = hex(th.slotHi);
    const SLo = hex(th.slotLo);
    const SI = hex(th.inner);
    for (let i = 0; i < F.SIZE; i++) {
      const cx = (F.GX + (i % F.COLS) * F.SLOT) * A;
      const cy = (F.GY + Math.floor(i / F.COLS) * F.SLOT) * A;
      const Z = F.SLOT * A;
      const plate = RS.isInner(i) ? SI : SL;
      for (let y = 0; y < Z; y++) {
        for (let x = 0; x < Z; x++) {
          let c;
          if (x < 2 || y < 2 || x >= Z - 2 || y >= Z - 2) {
            mul(cx + x, cy + y, 0.62); // 칸 사이 홈 (바닥이 비친다)
            continue;
          }
          if (x < 3 || y < 3 || x >= Z - 3 || y >= Z - 3) c = scale(SLo, 0.8);
          else if (y < 5 || x < 5) c = SH; // 위·왼쪽 비스듬한 빛
          else if (y >= Z - 5 || x >= Z - 5) c = SLo;
          else {
            // 안쪽 판: 위가 살짝 밝고 아래로 어두워지는 판, 미세한 결
            const k = 1.04 - (y / Z) * 0.1 + (h2(x + cx, y + cy, seed + 11) - 0.5) * 0.035;
            c = scale(plate, k);
            if (y === 5 || x === 5) c = scale(plate, 1.12);
          }
          set(cx + x, cy + y, c);
        }
      }
    }
    // 안쪽 칸 2×3 둘레 점선 (원거리 유닛 자리)
    {
      const x0 = (F.GX + F.SLOT - 1) * A;
      const x1 = (F.GX + 3 * F.SLOT) * A;
      const y0 = (F.GY + F.SLOT - 1) * A;
      const y1 = (F.GY + 4 * F.SLOT) * A;
      for (let px = x0; px <= x1; px += 4) {
        rect(px, y0, 2, 2, SH);
        rect(px, y1, 2, 2, SH);
      }
      for (let py = y0; py <= y1; py += 4) {
        rect(x0, py, 2, 2, SH);
        rect(x1, py, 2, 2, SH);
      }
    }

    // 4) 소품: 길·칸을 피해 가장자리 띠에
    const lights = [];
    const set2 = PROPSET[th.props] || [];
    for (const [pn, cnt] of set2) {
      const pr = PROP[pn];
      const ph = pr.rows.length;
      const pw = pr.rows[0].length;
      let placed = 0;
      for (let tries = 0; tries < cnt * 40 && placed < cnt; tries++) {
        const x = rng.int(W - pw);
        const y = rng.int(H - ph);
        let ok = true;
        for (const [qx, qy] of [[x, y], [x + pw, y], [x, y + ph], [x + pw, y + ph]]) {
          if (onPathL(qx / A, qy / A, O + 0.5) || overSlots(qx / A, qy / A, 1) || Math.hypot(qx / A - F.L, qy / A - F.T) < 12) ok = false;
        }
        if (!ok) continue;
        placed++;
        const flip = rng.chance(0.5);
        // 그림자
        for (let xx = 0; xx < pw; xx++) mul(x + xx, y + ph, 0.7);
        for (let yy = 0; yy < ph; yy++) {
          const row = pr.rows[yy];
          for (let xx = 0; xx < pw; xx++) {
            const ch = row[flip ? pw - 1 - xx : xx];
            if (ch === '.') continue;
            set(x + xx, y + yy, hex(pr.pal[ch]));
          }
        }
        if (pr.light) lights.push([x + pw / 2, y + ph / 2, hex(pr.light[0]), pr.light[1] * A, 0.55]);
      }
    }

    // 5) 균열 문 (적이 나오고, 한 바퀴를 돌면 들어가는 곳)
    {
      const pr = 7 * A;
      const cx = F.L * A;
      const cy = F.T * A;
      const C = [hex('#1d1428'), hex('#8a4fc9'), hex('#3b2160'), hex('#170d22')];
      for (let dy = -pr - 1; dy <= pr + 1; dy++) {
        for (let dx = -pr - 1; dx <= pr + 1; dx++) {
          const d = Math.sqrt((dx + 0.5) * (dx + 0.5) + (dy + 0.5) * (dy + 0.5));
          if (d > pr + 0.6) continue;
          const c = d > pr - 1.5 ? C[0] : d > pr - 3.5 ? C[1] : d > pr - 6.5 ? C[2] : C[3];
          set(cx + dx, cy + dy, c);
        }
      }
      lights.push([cx, cy, hex('#b070f0'), 34 * A, 0.6]);
    }
    for (const [x, y] of glowPts) lights.push([x, y, hex(th.vein), 7 * A, 0.5]);

    // 6) 구운 빛: 막 분위기색 × 가장자리 그늘(비네트) × 보드 가운데 스포트라이트 + 등불·문·실금의 빛. 4×4 디더로 계단지게
    const amb = th.ambient;
    const cxm = W / 2;
    const cym = H / 2;
    const rMax = Math.hypot(cxm, cym);
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const d = Math.hypot((x - cxm) * 1.05, (y - cym) * 0.95) / rMax;
        const vg = 1 - th.vig * Math.min(1, Math.max(0, (d - 0.45) / 0.55)) ** 1.6;
        let lr = amb[0] * vg;
        let lg = amb[1] * vg;
        let lb = amb[2] * vg;
        for (let k = 0; k < lights.length; k++) {
          const L = lights[k];
          const dd = Math.hypot(x - L[0], y - L[1]);
          if (dd >= L[3]) continue;
          const f = (1 - dd / L[3]) ** 2 * L[4];
          lr += (L[2][0] / 255) * f;
          lg += (L[2][1] / 255) * f;
          lb += (L[2][2] / 255) * f;
        }
        const bd = BAYER[(y & 3) * 4 + (x & 3)];
        const q = (v) => Math.floor(v * 14 + bd) / 14;
        const o = (y * W + x) * 4;
        out[o] = buf[i] * q(lr);
        out[o + 1] = buf[i + 1] * q(lg);
        out[o + 2] = buf[i + 2] * q(lb);
        out[o + 3] = 255;
      }
    }
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const x2 = c.getContext('2d');
    x2.putImageData(new ImageData(out, W, H), 0, 0);
    c.lw = F.W;
    c.lh = F.H;
    c.u = A;
    return c;
  }

  RS.World = { THEMES, buildBackground, ART: A };
  RS.THEMES = THEMES;
})((globalThis.RS = globalThis.RS || {}));
