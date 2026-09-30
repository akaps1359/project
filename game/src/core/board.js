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
    for (const s of run.board) if (s) w[s.cls] += s.n * RS.tierUnits(s.tier);
    let best = RS.CLASSES[0];
    for (const c of RS.CLASSES) if (w[c] > w[best]) best = c;
    return best;
  };

  // 같은 유닛 칸 → 빈칸 순으로 찾는다. 자리가 없으면 -1 (봉인된 칸에는 보태지 않는다)
  RS.findSlotFor = function (board, cls, tier, prefer) {
    const order = RS.slotOrder(cls);
    for (const i of order) {
      const s = board[i];
      if (s && !s.sealed && s.cls === cls && s.tier === tier && s.n < RS.stackMax(tier)) return i;
    }
    if (prefer != null && prefer >= 0 && !board[prefer]) return prefer;
    for (const i of order) if (!board[i]) return i;
    return -1;
  };

  // ── 유닛 가치 ──
  // 칸마다 v = 그 칸 유닛들에 들인 골드의 합. 판매는 한 기 몫(v / n)의 일부만 돌려주므로
  // 소환 → 판매·합성을 어떻게 반복해도 골드가 늘지 않는다.
  RS.freeWorth = (tier) => RS.BAL.freeWorth * RS.tierUnits(tier);
  const validV = (s) => typeof s.v === 'number' && isFinite(s.v) && s.v >= 0;
  // v 가 없는 칸(이전 버전 저장): 문맥이 없으면 무료 유닛으로 본다
  function worthOf(s) {
    if (!validV(s)) s.v = s.n * RS.freeWorth(s.tier);
    return s.v;
  }
  // 이전 버전 저장의 유닛: 예전 판매가(현재 소환 비용 × 0.4 × 3^등급)와 같아지도록 한 번만 값을 매긴다
  RS.legacyWorth = function (run, tier, M) {
    return RS.summonCost(run, M || RS.baseMods()) * 0.8 * RS.tierUnits(tier);
  };
  RS.migrateBoard = function (run, M) {
    for (const s of run.board) if (s && !validV(s)) s.v = s.n * RS.legacyWorth(run, s.tier, M);
  };
  RS.stackWorth = function (run, s, M) {
    if (!validV(s)) s.v = s.n * (run ? RS.legacyWorth(run, s.tier, M) : RS.freeWorth(s.tier));
    return s.v;
  };

  // v: 이 유닛에 들인 골드. 생략하면 돈을 내지 않은 유닛(RS.freeWorth)
  RS.addUnit = function (board, cls, tier, prefer, v) {
    const i = RS.findSlotFor(board, cls, tier, prefer);
    if (i < 0) return -1;
    const w = v == null || !(v >= 0) ? RS.freeWorth(tier) : v;
    const s = board[i];
    if (s) {
      worthOf(s);
      s.n++;
      s.v += w;
    } else board[i] = { cls, tier, n: 1, v: w };
    return i;
  };

  // 한 기를 보드에서 빼고 그 몫의 가치를 돌려준다 (판매·제물 등)
  RS.takeUnit = function (board, i) {
    const s = board[i];
    if (!s) return 0;
    const share = worthOf(s) / s.n;
    s.n--;
    if (s.n <= 0) board[i] = null;
    else s.v = Math.max(0, s.v - share);
    return share;
  };

  // 두 칸 사이에서 가치를 옮긴다 (쌍둥이 소환이 다른 칸에 떨어졌을 때)
  RS.moveWorth = function (board, from, to, amount) {
    const a = board[from];
    const b = board[to];
    if (!a || !b || a === b) return;
    const m = Math.min(worthOf(a), amount);
    a.v -= m;
    b.v = worthOf(b) + m;
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

  RS.canMerge = function (board, i) {
    const s = board[i];
    return !!s && !s.sealed && s.tier < RS.TOP_TIER && s.n >= RS.mergeNeed(s.tier);
  };

  RS.firstMergeable = function (board) {
    for (let i = 0; i < board.length; i++) if (RS.canMerge(board, i)) return i;
    return -1;
  };

  // 합성: 같은 유닛 3기 → 다음 등급 무작위 클래스 1기. 재료 3기에 들인 골드가 결과로 옮겨 간다
  RS.mergeSlot = function (run, i, rng, M) {
    const board = run.board;
    const s = board[i];
    if (!RS.canMerge(board, i)) return null;
    const res = { from: s.tier, results: [], fail: false, refund: false, double: false, gold: 0 };
    const share = RS.stackWorth(run, s, M) / s.n;
    let used = RS.mergeNeed(s.tier);
    s.n -= used;
    // 재활용: 돌아온 재료 1기는 제 몫을 그대로 갖고, 결과는 나머지 2기 몫을 받는다
    if (M.mergeRefund && rng.chance(M.mergeRefund)) {
      s.n += 1;
      used -= 1;
      res.refund = true;
    }
    const moved = share * used;
    if (s.n <= 0) board[i] = null;
    else s.v = Math.max(0, s.v - moved);
    if (M.mergeFail && rng.chance(M.mergeFail)) {
      res.fail = true; // 재료에 들인 골드도 함께 사라진다
      return res;
    }
    let tier = s.tier + 1;
    if (M.mergeDouble && tier < 3 && rng.chance(M.mergeDouble)) {
      tier++;
      res.double = true;
    }
    const count = M.mergeMirror && rng.chance(M.mergeMirror) ? 2 : 1;
    const each = moved / count;
    for (let k = 0; k < count; k++) {
      const cls = RS.pickClass(run, rng);
      const slot = RS.addUnit(board, cls, tier, i, each);
      if (slot >= 0) res.results.push({ cls, tier, slot });
      else res.gold += RS.worthToGold(each, M); // 놓을 자리가 없으면 판매한 것처럼 골드로
    }
    if (res.gold) RS.addGold(run, res.gold);
    run.stats.merges++;
    return res;
  };

  // 판매 비율: 기본 50%, 미다스 등으로 올라도 80%를 넘지 않는다
  RS.sellRate = function (M) {
    return Math.max(0, Math.min(RS.BAL.sellRateMax, RS.BAL.sellRate * (1 + ((M && M.sellPct) || 0))));
  };
  RS.worthToGold = function (worth, M) {
    return Math.max(0, Math.floor(worth * RS.sellRate(M) + 1e-9));
  };

  // i 칸의 유닛 1기를 팔 때 받는 골드 (유닛 패널 표시와 실제 판매가 같은 값을 쓴다)
  RS.sellValueAt = function (run, i, M) {
    const s = run.board[i];
    if (!s) return 0;
    return RS.worthToGold(RS.stackWorth(run, s, M) / s.n, M);
  };

  // 돈을 내지 않고 얻은 tier 등급 유닛 1기의 판매가. 보상 유닛을 놓을 자리가 없을 때 대신 주는 골드이기도 하다
  // (놓고 곧바로 판 것과 같아서, 가득 찬 보드로 보상을 골드로 바꿔도 이득이 없다)
  RS.sellValue = function (run, tier, M) {
    return RS.worthToGold(RS.freeWorth(tier), M);
  };

  RS.sellOne = function (run, i, M) {
    const s = run.board[i];
    if (!s) return 0;
    const g = RS.sellValueAt(run, i, M);
    RS.takeUnit(run.board, i);
    RS.addGold(run, g);
    return g;
  };

  // 비용 할인의 하한 (여러 할인을 겹쳐도 이 배율 아래로는 내려가지 않는다). 증강 연마도 이 하한을 넘겨 늘리지 않는다
  RS.SUMMON_COST_FLOOR = 0.4;
  RS.UPGRADE_COST_FLOOR = 0.3;
  RS.summonCost = function (run, M) {
    const base = RS.BAL.summonBase + RS.BAL.summonStep * run.summons;
    return Math.max(1, Math.round(base * Math.max(RS.SUMMON_COST_FLOOR, 1 + M.summonCostPct)));
  };

  RS.upgradeCost = function (run, cls, M) {
    const base = RS.BAL.upgradeBase + RS.BAL.upgradeStep * run.classLv[cls];
    const asc = (run.asc || 0) >= 8 ? 1.2 : 1; // 승천 8: 강화 비용 +20%
    return Math.max(1, Math.round(base * Math.max(RS.UPGRADE_COST_FLOOR, 1 + M.upgradeCostPct) * asc));
  };

  // 소환 등급 굴림
  RS.rollSummonTier = function (rng, M) {
    if (M.noRare) return 0;
    const r = rng.next();
    const epic = RS.BAL.epicChance + (M.epicChance || 0);
    if (r < epic) return 2;
    if (r < epic + RS.BAL.rareChance + M.rareChance) return 1;
    return 0;
  };
})((globalThis.RS = globalThis.RS || {}));
