// 전장 좌표와 유닛 보드(4×5 칸, 한 칸에 같은 유닛 3기까지)
(function (RS) {
  'use strict';

  // 논리 해상도 160×186. 적은 격자 바깥의 사각 루프를 시계 방향으로 돈다.
  const F = (RS.FIELD = {
    W: 160, H: 186, COLS: 4, ROWS: 5, SLOT: 26, GX: 28, GY: 28,
    L: 15, T: 15, R: 145, B: 171,
  });
  F.SIZE = F.COLS * F.ROWS;
  F.TOPLEN = F.R - F.L;
  F.SIDELEN = F.B - F.T;
  F.PERIM = 2 * (F.TOPLEN + F.SIDELEN);

  RS.pathPos = function (d, out) {
    d %= F.PERIM;
    if (d < 0) d += F.PERIM;
    if (d < F.TOPLEN) {
      out.x = F.L + d; out.y = F.T; out.dir = 0;
    } else if ((d -= F.TOPLEN) < F.SIDELEN) {
      out.x = F.R; out.y = F.T + d; out.dir = 1;
    } else if ((d -= F.SIDELEN) < F.TOPLEN) {
      out.x = F.R - d; out.y = F.B; out.dir = 2;
    } else {
      d -= F.TOPLEN;
      out.x = F.L; out.y = F.B - d; out.dir = 3;
    }
    return out;
  };

  const CENTERS = [];
  for (let i = 0; i < F.SIZE; i++) {
    CENTERS.push({
      x: F.GX + (i % F.COLS) * F.SLOT + F.SLOT / 2,
      y: F.GY + Math.floor(i / F.COLS) * F.SLOT + F.SLOT / 2,
    });
  }
  RS.slotCenter = (i) => CENTERS[i];

  RS.slotAt = function (x, y) {
    const c = Math.floor((x - F.GX) / F.SLOT);
    const r = Math.floor((y - F.GY) / F.SLOT);
    if (c < 0 || r < 0 || c >= F.COLS || r >= F.ROWS) return -1;
    return r * F.COLS + c;
  };

  const CORNERS = [0, 3, 16, 19];
  const INNER = [5, 6, 9, 10, 13, 14];
  RS.isCorner = (i) => CORNERS.indexOf(i) >= 0;
  RS.isInner = (i) => INNER.indexOf(i) >= 0;

  // 근접 유닛은 바깥 칸(모서리 우선), 원거리 유닛은 안쪽 칸부터 채운다.
  const MELEE_ORDER = [0, 3, 16, 19, 1, 2, 17, 18, 4, 7, 8, 11, 12, 15, 5, 6, 9, 10, 13, 14];
  const RANGED_ORDER = [5, 6, 9, 10, 13, 14, 1, 2, 17, 18, 4, 7, 8, 11, 12, 15, 0, 3, 16, 19];
  RS.slotOrder = (cls) => (RS.CLASS[cls].melee ? MELEE_ORDER : RANGED_ORDER);

  RS.newBoard = function () {
    const b = [];
    for (let i = 0; i < F.SIZE; i++) b.push(null);
    return b;
  };

  RS.boardUnitCount = function (board) {
    let n = 0;
    for (const s of board) if (s) n += s.n;
    return n;
  };

  RS.bestUnit = function (board) {
    let best = null;
    for (const s of board) if (s && (!best || s.tier > best.tier)) best = s;
    return best;
  };

  RS.mostCommonClass = function (run) {
    const w = {};
    for (const c of RS.CLASSES) w[c] = 0;
    for (const s of run.board) if (s) w[s.cls] += s.n * Math.pow(3, s.tier);
    let best = RS.CLASSES[0];
    for (const c of RS.CLASSES) if (w[c] > w[best]) best = c;
    return best;
  };

  // 같은 유닛 칸 → 빈칸 순으로 찾는다. 자리가 없으면 -1
  RS.findSlotFor = function (board, cls, tier, prefer) {
    const order = RS.slotOrder(cls);
    for (const i of order) {
      const s = board[i];
      if (s && s.cls === cls && s.tier === tier && s.n < 3) return i;
    }
    if (prefer != null && prefer >= 0 && !board[prefer]) return prefer;
    for (const i of order) if (!board[i]) return i;
    return -1;
  };

  RS.addUnit = function (board, cls, tier, prefer) {
    const i = RS.findSlotFor(board, cls, tier, prefer);
    if (i < 0) return -1;
    if (board[i]) board[i].n++;
    else board[i] = { cls, tier, n: 1 };
    return i;
  };

  RS.hasRoomFor = function (board, cls, tier) {
    return RS.findSlotFor(board, cls, tier) >= 0;
  };

  RS.hasEmptySlot = function (board) {
    for (const s of board) if (!s) return true;
    return false;
  };

  RS.swapSlots = function (board, a, b) {
    const t = board[a];
    board[a] = board[b];
    board[b] = t;
  };

  // 같은 유닛을 한 칸에 모으고, 근접은 바깥·원거리는 안쪽으로 다시 배치한다.
  RS.autoArrange = function (board) {
    const groups = {};
    for (const s of board) {
      if (!s) continue;
      const key = s.cls + ':' + s.tier;
      groups[key] = (groups[key] || 0) + s.n;
    }
    const stacks = [];
    for (const key in groups) {
      const parts = key.split(':');
      let n = groups[key];
      while (n > 0) {
        const take = Math.min(3, n);
        stacks.push({ cls: parts[0], tier: +parts[1], n: take });
        n -= take;
      }
    }
    stacks.sort((a, b) => b.tier - a.tier || b.n - a.n);
    for (let i = 0; i < board.length; i++) board[i] = null;
    const leftovers = [];
    for (const st of stacks) {
      const order = RS.slotOrder(st.cls);
      // 근접은 바깥 14칸, 원거리는 안쪽 6칸 + 바깥 비모서리까지만 1차 배치
      const limit = RS.CLASS[st.cls].melee ? 14 : 16;
      let placed = false;
      for (let k = 0; k < limit; k++) {
        const i = order[k];
        if (!board[i]) {
          board[i] = st;
          placed = true;
          break;
        }
      }
      if (!placed) leftovers.push(st);
    }
    for (const st of leftovers) {
      for (let i = 0; i < board.length; i++) {
        if (!board[i]) {
          board[i] = st;
          break;
        }
      }
    }
  };

  RS.canMerge = function (board, i) {
    const s = board[i];
    return !!s && s.n >= 3 && s.tier < 3;
  };

  RS.firstMergeable = function (board) {
    for (let i = 0; i < board.length; i++) if (RS.canMerge(board, i)) return i;
    return -1;
  };

  // 두 개의 서로 다른 클래스 후보 (고대 두루마리)
  RS.mergeOptions = function (rng) {
    const a = rng.pick(RS.CLASSES);
    let b = rng.pick(RS.CLASSES);
    while (b === a) b = rng.pick(RS.CLASSES);
    return [a, b];
  };

  // 합성: 같은 유닛 3기 → 다음 등급 무작위 클래스 1기
  RS.mergeSlot = function (run, i, rng, M, pickCls) {
    const board = run.board;
    const s = board[i];
    if (!RS.canMerge(board, i)) return null;
    const res = { from: s.tier, results: [], fail: false, refund: false, double: false, gold: 0 };
    s.n -= 3;
    if (M.mergeRefund && rng.chance(M.mergeRefund)) {
      s.n += 1;
      res.refund = true;
    }
    if (s.n <= 0) board[i] = null;
    if (M.mergeFail && rng.chance(M.mergeFail)) {
      res.fail = true;
      return res;
    }
    let tier = s.tier + 1;
    if (M.mergeDouble && tier < 3 && rng.chance(M.mergeDouble)) {
      tier++;
      res.double = true;
    }
    const count = M.mergeMirror && rng.chance(M.mergeMirror) ? 2 : 1;
    for (let k = 0; k < count; k++) {
      const cls = pickCls || rng.pick(RS.CLASSES);
      const slot = RS.addUnit(board, cls, tier, i);
      if (slot >= 0) res.results.push({ cls, tier, slot });
      else res.gold += RS.sellValue(run, tier, M);
    }
    if (res.gold) RS.addGold(run, res.gold);
    run.stats.merges++;
    return res;
  };

  RS.sellValue = function (run, tier, M) {
    return Math.round(RS.summonCost(run, M) * RS.BAL.sellRate * Math.pow(3, tier) * (1 + M.sellPct));
  };

  RS.sellOne = function (run, i, M) {
    const s = run.board[i];
    if (!s) return 0;
    const v = RS.sellValue(run, s.tier, M);
    s.n--;
    if (s.n <= 0) run.board[i] = null;
    RS.addGold(run, v);
    return v;
  };

  RS.summonCost = function (run, M) {
    const base = RS.BAL.summonBase + RS.BAL.summonStep * run.summons;
    return Math.max(1, Math.round(base * Math.max(0.4, 1 + M.summonCostPct)));
  };

  RS.upgradeCost = function (run, cls, M) {
    const base = RS.BAL.upgradeBase + RS.BAL.upgradeStep * run.classLv[cls];
    return Math.max(1, Math.round(base * Math.max(0.4, 1 + M.upgradeCostPct)));
  };

  // 소환 등급 굴림
  RS.rollSummonTier = function (rng, M) {
    if (M.noRare) return 0;
    const r = rng.next();
    if (r < RS.BAL.epicChance) return 2;
    if (r < RS.BAL.epicChance + RS.BAL.rareChance + M.rareChance) return 1;
    return 0;
  };
})((globalThis.RS = globalThis.RS || {}));
