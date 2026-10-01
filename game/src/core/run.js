// 로그라이크 진행: 맵, 보상, 상점, 이벤트, 휴식, 열쇠, 저장
(function (RS) {
  'use strict';

  const BAL = RS.BAL;

  // ── 공용 헬퍼 ──
  RS.addGold = function (run, g) {
    run.gold = Math.max(0, run.gold + g);
  };
  // 시든 꽃의 낙인이 있으면 생명을 회복할 수 없다
  RS.canHeal = (run) => run.curses.indexOf('bloomMark') < 0;
  // 실제로 회복한 양을 돌려준다
  RS.heal = function (run, v) {
    if (!RS.canHeal(run)) return 0;
    const before = run.life;
    run.life = Math.min(run.maxLife, run.life + v);
    return Math.max(0, run.life - before);
  };
  // 이벤트로는 죽지 않는다 (생명 1에서 멈춤). 실제로 잃은 양을 돌려준다
  RS.damageLife = function (run, v) {
    const before = run.life;
    run.life = Math.max(1, run.life - v);
    return Math.max(0, before - run.life);
  };
  // 상처: 하나당 모든 유닛 피해 -BAL.injuryPer (따로 곱한다). 전투는 시작할 때의 값을 쓴다
  RS.injuryMul = (run) => Math.max(0.1, 1 - BAL.injuryPer * (run.injury || 0));
  RS.changeMaxLife = function (run, d) {
    run.maxLife = Math.max(1, run.maxLife + d);
    run.life = Math.min(run.life, run.maxLife);
  };
  RS.addItem = function (run, id) {
    const M = RS.collectMods(run);
    if (M.noItems) return false;
    if (run.items.length >= RS.itemSlots(run)) return false;
    run.items.push(id);
    return true;
  };
  RS.randomCurseId = function (rng) {
    return rng.pick(RS.CURSES.filter((c) => !c.permanent)).id;
  };
  // 액막이 매듭이 있으면 막는다. 실제로 받았으면 true
  RS.addCurse = function (run, id) {
    const st = run.relicState.omamori;
    if (st && st.charges > 0) {
      st.charges--;
      return false;
    }
    const def = RS.CURSE[id];
    if (def.fades) syncCurseTimers(run);
    run.curses.push(id);
    if (def.fades) run.curseTimers.push({ id, at: run.stats.battles });
    if (def.onGain) def.onGain(run);
    RS.curseGained(run, id);
    return true;
  };
  // 저주가 실제로 붙은 뒤 (RS.addCurse 를 거치지 않고 붙이는 곳도 이것을 부른다): 업보
  RS.curseGained = function (run, id) {
    const M = RS.collectMods(run);
    if (M.karmaGold) RS.addGold(run, Math.round(M.karmaGold * (run.act || 1)));
  };

  // 사라지는 저주(찜찜함)의 수명은 저주 하나하나가 생긴 시점(그때까지 치른 전투 수)으로 센다.
  // 저주 목록은 여러 곳(제거 서비스, 정화 등)에서 직접 지워지므로, 쓸 때마다 개수를 맞춘다.
  // justFought: 방금 전투 수를 올렸지만 아직 나이를 세지 않았다 (battleUpkeep)
  function syncCurseTimers(run, justFought) {
    const now = run.stats.battles;
    if (!Array.isArray(run.curseTimers)) {
      // 예전 저장본: 'id@칸' 키로 센 나이를 옮겨 온다
      const age = run.curseAge || {};
      const base = now - (justFought ? 1 : 0);
      run.curseTimers = [];
      run.curses.forEach((id, i) => {
        const def = RS.CURSE[id];
        if (def && def.fades) run.curseTimers.push({ id, at: base - (age[id + '@' + i] || 0) });
      });
      delete run.curseAge;
      return run.curseTimers;
    }
    const have = {};
    for (const id of run.curses) have[id] = (have[id] || 0) + 1;
    // 지워진 저주의 기록은 버린다. 같은 저주가 여럿이면 먼저 생긴 것(곧 사라질 것)을 남긴다
    const kept = {};
    const out = [];
    const sorted = run.curseTimers.slice().sort((a, b) => a.at - b.at);
    for (const t of sorted) {
      if ((kept[t.id] || 0) < (have[t.id] || 0)) {
        out.push(t);
        kept[t.id] = (kept[t.id] || 0) + 1;
      }
    }
    // 기록 없이 들어온 저주는 지금부터 센다
    for (const id of Object.keys(have)) {
      const def = RS.CURSE[id];
      if (!def || !def.fades) continue;
      for (let k = kept[id] || 0; k < have[id]; k++) out.push({ id, at: now - (justFought ? 1 : 0) });
    }
    run.curseTimers = out;
    return out;
  }
  // 사라지는 저주가 사라지기까지 남은 전투 수 (목록 순서대로, 사라지지 않는 저주는 null)
  RS.curseBattlesLeft = function (run) {
    const timers = syncCurseTimers(run).slice().sort((a, b) => a.at - b.at);
    const used = {};
    return run.curses.map((id) => {
      const def = RS.CURSE[id];
      if (!def || !def.fades) return null;
      const list = timers.filter((t) => t.id === id);
      const t = list[used[id] || 0];
      used[id] = (used[id] || 0) + 1;
      return t ? Math.max(1, def.fades - (run.stats.battles - t.at)) : def.fades;
    });
  };
  RS.enqueue = function (run, item) {
    run.queue.push(item);
  };

  // 지휘관에 따라 잘 나오는 클래스가 다르다
  // 모든 지휘관이 다섯 클래스를 고르게 부른다 (지휘관의 개성은 고유 능력과 전용 증강에서)
  RS.pickClass = function (run, rng) {
    return rng.pick(RS.CLASSES);
  };
  // 이 모험에서 나올 수 있는 증강인가 (지휘관 전용 증강은 그 지휘관만)
  RS.augAllowed = (run, a) => !a.cmd || a.cmd === run.commander;
  // 보드에 자리가 없으면 판매 가격만큼 골드로 돌려준다. { placed, gold } 를 돌려준다
  // worth: 이 유닛에 들인 골드 (상점 용병). 생략하면 무료 유닛
  RS.grantUnits = function (run, tier, n, worth) {
    const M = RS.collectMods(run);
    const out = { placed: 0, gold: 0 };
    for (let k = 0; k < n; k++) {
      const cls = RS.pickClass(run, run.rng);
      if (RS.addUnit(run.board, cls, tier, undefined, worth) < 0) {
        const g = typeof RS.sellValue === 'function' ? RS.sellValue(run, tier, M) || 0 : 0;
        RS.addGold(run, g);
        out.gold += g;
      } else out.placed++;
    }
    return out;
  };
  // 한 등급의 유닛을 모두 무작위 클래스의 다른 등급으로 (뒤죽박죽 상자)
  RS.transformTier = function (run, from, to) {
    let n = 0;
    for (let i = 0; i < run.board.length; i++) {
      const s = run.board[i];
      if (s && s.tier === from) {
        n += s.n;
        run.board[i] = null;
      }
    }
    RS.grantUnits(run, to, n);
    return n;
  };
  // 클래스는 그대로 두고 등급만 올린다 (빛의 세례)
  RS.promoteTier = function (run, from) {
    for (const s of run.board) if (s && s.tier === from) s.tier = from + 1;
  };

  RS.addRelic = function (run, id) {
    run.relics.push(id);
    const def = RS.REL[id];
    if (def.state) run.relicState[id] = JSON.parse(JSON.stringify(def.state));
    if (def.onPick) def.onPick(run);
  };
  RS.hasRelic = (run, id) => run.relics.indexOf(id) >= 0;

  // ── 증강 (연마된 증강은 id 뒤에 + 가 붙는다) ──
  RS.augDef = (id) => RS.AUG[id.charAt(id.length - 1) === '+' ? id.slice(0, -1) : id];
  RS.isUpgraded = (id) => id.charAt(id.length - 1) === '+';
  RS.pickAugment = function (run, id) {
    const M0 = RS.collectMods(run);
    if (M0.augUpChance && RS.canUpgradeAug(id) && run.rng.chance(M0.augUpChance)) id += '+';
    run.augments.push(id);
    const def = RS.augDef(id);
    const M = RS.collectMods(run);
    if (M.ceramicFish) RS.addGold(run, M.ceramicFish);
    if (def.onPick) def.onPick(run);
  };
  RS.canUpgradeAug = function (id) {
    return !RS.isUpgraded(id) && RS.upgradeScale(RS.augDef(id).mods, 1.5) !== null;
  };
  RS.upgradeAug = function (run, idx) {
    const id = run.augments[idx];
    if (!id || !RS.canUpgradeAug(id)) return false;
    run.augments[idx] = id + '+';
    return true;
  };
  RS.removeAug = function (run, idx) {
    run.augments.splice(idx, 1);
  };
  function transformPool(run, idx) {
    const old = RS.augDef(run.augments[idx]);
    const owned = {};
    for (const id of run.augments) owned[RS.augDef(id).id] = true;
    return RS.AUGMENTS.filter((a) => a.rarity === old.rarity && a.id !== old.id && !(a.unique && owned[a.id]) && !a.onPick && RS.augAllowed(run, a));
  }
  // 즉시 효과 증강(onPick)은 바꿀 수 없다
  RS.canTransformAug = function (run, idx) {
    const id = run.augments[idx];
    if (!id || RS.augDef(id).onPick) return false;
    return transformPool(run, idx).length > 0;
  };
  RS.transformableCount = (run) => run.augments.filter((id, i) => RS.canTransformAug(run, i)).length;
  RS.transformAug = function (run, idx) {
    if (!run.augments[idx]) return null;
    const pool = transformPool(run, idx);
    if (!pool.length) return null;
    const a = run.rng.pick(pool);
    run.augments[idx] = a.id;
    return a.id;
  };

  RS.attachRng = function (run) {
    Object.defineProperty(run, 'rng', { value: new RS.Rng(run.rngS), enumerable: false, writable: true, configurable: true });
    return run;
  };

  RS.newRun = function (seed, opts) {
    opts = opts || {};
    seed = seed == null ? RS.randomSeed() : seed >>> 0;
    const classLv = {};
    const clsDmg = {};
    for (const c of RS.CLASSES) {
      classLv[c] = 0;
      clsDmg[c] = 0;
    }
    const cmd = RS.COMMANDER[opts.commander] || RS.COMMANDERS[0];
    const asc = Math.max(0, Math.min(RS.MAX_ASC, opts.asc || 0));
    const run = {
      v: 2, seed, rngS: seed | 0, commander: cmd.id, asc,
      act: 1, floor: 0, lane: -1, nodeType: null, map: null,
      life: BAL.startLife, maxLife: BAL.startLife, gold: BAL.startGold,
      board: RS.newBoard(), runes: RS.newBoard(), classLv, permDmg: 0, injury: 0, abil: { n: 0 },
      augments: [], relics: [], curses: [], items: [], relicState: {},
      keys: { ruby: false, emerald: false, sapphire: false },
      queue: [], afterQueue: null,
      summons: 0, seenEvents: [], unknown: { combat: 0.1, shop: 0.03, treasure: 0.02, count: 0 },
      itemChance: 0.4, prismPity: 0, removeCount: 0, lament: 0, tax: 0,
      stats: { kills: 0, merges: 0, summons: 0, upgrades: 0, battles: 0, elites: 0, bosses: 0, dmg: 0, clsDmg },
      phase: 'neow', pending: null, variants: {}, quests: {},
    };
    RS.attachRng(run);
    run.variants[1] = run.rng.int(RS.ACT_VARIANTS[0].length);
    RS.addRelic(run, cmd.relic);
    for (let k = 0; k < (cmd.startItems || 0); k++) RS.addItem(run, RS.randomItemId(run.rng));
    if (asc >= 6) {
      run.maxLife -= 4;
      run.life = run.maxLife;
    }
    if (asc >= 9) run.curses.push('ascBurden');
    run.map = RS.genMap(run);
    run.pending = { blessings: RS.rollBlessings(run) };
    return run;
  };

  RS.saveString = function (run) {
    run.rngS = run.rng.s;
    return JSON.stringify(run);
  };
  const okRelic = (id) => !!RS.REL[id];
  const okAug = (id) => typeof id === 'string' && !!RS.augDef(id);
  const okShopEntry = (it) => {
    if (!it) return false;
    if (it.kind === 'relic') return okRelic(it.id);
    if (it.kind === 'aug') return okAug(it.id);
    if (it.kind === 'item') return !!RS.ITEM[it.id];
    if (it.kind === 'rune') return !!RS.RUNE[it.id];
    return true;
  };
  function purgePending(run, p) {
    if (!p) return;
    if (Array.isArray(p.relics)) p.relics = p.relics.filter(okRelic);
    if (Array.isArray(p.got)) p.got = p.got.filter(okRelic);
    if (p.curse && !RS.CURSE[p.curse]) p.curse = null;
    const r = p.reward;
    if (r) {
      if (Array.isArray(r.relics)) r.relics = r.relics.filter(okRelic);
      if (Array.isArray(r.aug)) {
        const n = r.aug.length;
        r.aug = r.aug.filter(okAug);
        // 모두 빠졌으면 같은 가중치로 다시 굴린다
        if (n && !r.aug.length && !r.augDone) {
          if (r.augW) r.aug = RS.rollAugments(run, RS.augChoiceCount(run), r.augW);
          if (!r.aug.length) r.augDone = true;
        }
      }
      if (r.item && !RS.ITEM[r.item]) r.item = null;
    }
    const shop = p.shop;
    if (shop && Array.isArray(shop.list) && !shop.list.every(okShopEntry)) {
      // 빠진 물건은 목록에서 없앤다 (팔린 칸도 카드로 그려지므로 'sold' 표시로는 부족하다).
      // 대기열의 구매 취소 기록(undo.shopIdx)도 새 위치로 옮긴다
      const map = [];
      const list = [];
      shop.list.forEach((it, i) => {
        if (okShopEntry(it)) {
          map[i] = list.length;
          list.push(it);
        } else map[i] = -1;
      });
      shop.list = list;
      for (const q of run.queue || []) {
        if (q && q.undo && q.undo.shopIdx != null) q.undo.shopIdx = q.undo.shopIdx >= 0 && q.undo.shopIdx < map.length ? map[q.undo.shopIdx] : -1;
      }
    }
  }
  function purgeMissing(run) {
    purgePending(run, run.pending);
    purgePending(run, run.afterPending);
    for (const q of run.queue || []) {
      if (!q || !Array.isArray(q.ids)) continue;
      if (q.k === 'relicList') q.ids = q.ids.filter(okRelic); // 비면 pruneQueue 가 건너뛴다
      else if (q.k === 'aug' || q.k === 'augList') {
        q.ids = q.ids.filter(okAug);
        if (q.k === 'aug' && !q.ids.length) delete q.ids; // 보여 줄 때 다시 굴린다
      }
    }
  }
  RS.loadString = function (str) {
    const run = JSON.parse(str);
    if (!run || run.v !== 2) return null;
    RS.attachRng(run);
    RS.registerCustomAugs(run);
    run.injury = run.injury || 0;
    // 빠진 지휘관(레온·벨·카이·미라)으로 저장된 모험은 가까운 지휘관으로 이어 간다
    const migrated = !RS.COMMANDER[run.commander];
    if (migrated) run.commander = (RS.COMMANDER_ALIAS && RS.COMMANDER_ALIAS[run.commander]) || RS.COMMANDERS[0].id;
    // 고유 능력 자원 (예전 저장본: 별의 왕홀이 모아 둔 별을 옮긴다)
    if (!run.abil) run.abil = { n: 0 };
    if (run.relicState && run.relicState.starScepter) {
      if (run.commander === 'astra') run.abil.n = Math.max(run.abil.n || 0, Math.floor(run.relicState.starScepter.n) || 0);
      delete run.relicState.starScepter;
    }
    // 게임에서 빠진 유물·증강·저주(예: 고대 두루마리)는 조용히 뺀다
    if (Array.isArray(run.relics)) run.relics = run.relics.filter((id) => RS.REL[id]);
    if (Array.isArray(run.augments)) run.augments = run.augments.filter((id) => RS.augDef(id));
    if (Array.isArray(run.curses)) run.curses = run.curses.filter((id) => RS.CURSE[id]);
    if (Array.isArray(run.curses) && run.stats) syncCurseTimers(run);
    if (Array.isArray(run.items)) run.items = run.items.filter((id) => RS.ITEM[id]);
    // 바뀐 지휘관은 그 지휘관의 시작 유물을 받는다 (빠진 시작 유물 대신)
    if (migrated && Array.isArray(run.relics)) {
      const st = RS.COMMANDER[run.commander].relic;
      if (st && RS.REL[st] && run.relics.indexOf(st) < 0) run.relics.unshift(st);
    }
    // 칸이 줄어 넘친 소모품(예: 연금 솥이 빠짐)은 골드로 바꾼다
    if (Array.isArray(run.items) && run.items.length > RS.itemSlots(run)) {
      const extra = run.items.splice(RS.itemSlots(run));
      run.gold = (run.gold || 0) + 25 * extra.length;
    }
    // 보물·상점·보상 화면이나 대기열에 남은 빠진 id 도 뺀다 (그대로 두면 화면을 그리다 멈춘다)
    purgeMissing(run);
    // 예전 저장본: 마지막 보스를 이기고 보상 화면에 멈춰 있었다면 그대로 끝낸다
    if (run.phase === 'reward' && run.nodeType === 'boss' && typeof RS.isFinalBoss === 'function' && RS.isFinalBoss(run)) {
      run.phase = 'victory';
      run.pending = null;
    }
    // 이전 버전 저장의 유닛에 판매 가치를 매긴다
    if (Array.isArray(run.board) && typeof RS.migrateBoard === 'function') RS.migrateBoard(run, RS.collectMods(run));
    return run;
  };

  // ── 맵 (슬레이 더 스파이어식: 경로 6개를 겹쳐 그린다) ──
  RS.MAP_W = 5;
  RS.MAP_FLOORS = 17; // + 보스 층 (막마다 18층)
  RS.ELITE_FLOOR = 6; // 엘리트·휴식처가 나오기 시작하는 층

  // 막마다 무작위로 정해지는 지형: 방 종류의 비율이 달라져 막마다 길의 성격이 바뀐다
  RS.MAP_TRAITS = [
    { id: 'plain', name: '평범한 길', desc: '특별한 것 없는 길', mul: {} },
    { id: 'market', name: '장터 길', desc: '상점이 자주 나와요', mul: { shop: 2.4, unknown: 0.9 } },
    { id: 'camp', name: '야영지 숲', desc: '휴식처가 자주 나와요', mul: { rest: 1.8, elite: 1.2 } },
    { id: 'fog', name: '안개 낀 길', desc: '? 칸이 자주 나와요', mul: { unknown: 1.9, combat: 0.8 } },
    { id: 'war', name: '격전지', desc: '엘리트가 자주 나와요 (보상도 많아요)', mul: { elite: 2, combat: 1.1, rest: 1.2 } },
    { id: 'hoard', name: '보물 사냥터', desc: '보물 칸이 곳곳에 있어요', mul: { treasure: 1 } },
    { id: 'quiet', name: '고요한 길', desc: '전투가 적고 이벤트가 많아요', mul: { combat: 0.7, unknown: 1.5, rest: 1.2 } },
  ];

  RS.NODE_INFO = {
    combat: { name: '전투', icon: 'n_combat' },
    elite: { name: '엘리트', icon: 'n_elite' },
    unknown: { name: '?', icon: 'n_event' },
    event: { name: '이벤트', icon: 'n_event' },
    shop: { name: '상점', icon: 'n_shop' },
    rest: { name: '휴식처', icon: 'n_rest' },
    treasure: { name: '보물', icon: 'n_treasure' },
    boss: { name: '보스', icon: 'n_boss' },
  };

  function roomWeights(run, f, H, trait) {
    const w = [['combat', 45], ['unknown', 22], ['shop', 5]];
    if (f >= RS.ELITE_FLOOR) w.push(['elite', run.asc >= 1 ? 13 : 8]);
    if (f >= RS.ELITE_FLOOR && f < H - 1) w.push(['rest', 10]);
    if (trait && trait.mul.treasure && f >= 3) w.push(['treasure', 4]);
    const mul = (trait && trait.mul) || {};
    return w.map((x) => [x[0], x[1] * (x[0] === 'treasure' ? 1 : mul[x[0]] || 1)]);
  }

  RS.genMap = function (run) {
    if (run.act === 4) return genAct4Map();
    const rng = run.rng;
    const W = RS.MAP_W;
    const H = RS.MAP_FLOORS;
    // 지형은 막마다 무작위 (1막에는 격전지가 나오지 않는다)
    const trait = rng.pick(RS.MAP_TRAITS.filter((t) => run.act >= 2 || t.id !== 'war'));
    // 보물 층도 막마다 7~10층 사이 어딘가
    const tFloor = 7 + rng.int(4);
    const floors = [];
    for (let f = 0; f < H; f++) floors.push(new Array(W).fill(null));
    const edge = {};
    const starts = [];
    for (let p = 0; p < 6; p++) {
      let c = rng.int(W);
      if (p === 1) while (c === starts[0]) c = rng.int(W);
      starts.push(c);
      for (let f = 1; f <= H; f++) {
        if (!floors[f - 1][c]) floors[f - 1][c] = { type: null, next: [], visited: false };
        if (f === H) break;
        // 다른 경로와 X자로 엇갈리지 않게
        const opts = [c - 1, c, c + 1].filter((n) => n >= 0 && n < W && !(n === c + 1 && edge[`${f}:${c + 1}>${c}`]) && !(n === c - 1 && edge[`${f}:${c - 1}>${c}`]));
        const n = rng.pick(opts);
        edge[`${f}:${c}>${n}`] = true;
        const node = floors[f - 1][c];
        if (node.next.indexOf(n) < 0) node.next.push(n);
        c = n;
      }
    }
    for (const row of floors) for (const n of row) if (n) n.next.sort((a, b) => a - b);
    const parents = (f, c) => (f <= 1 ? [] : floors[f - 2].filter((p) => p && p.next.indexOf(c) >= 0));
    // 방 종류: 1층 전투(2막부터는 ?도), 보물 층(7~10층 중 하나), 마지막 층 휴식처. 나머지는 가중치(지형 반영) + 연속 금지 규칙
    for (let f = 1; f <= H; f++) {
      for (let c = 0; c < W; c++) {
        const n = floors[f - 1][c];
        if (!n) continue;
        if (f === 1) n.type = run.act >= 2 && rng.chance(0.3) ? 'unknown' : 'combat';
        else if (f === tFloor) n.type = 'treasure';
        else if (f === H) n.type = 'rest';
        else {
          const ps = parents(f, c);
          const banned = {};
          for (const p of ps) {
            if (p.type === 'elite' || p.type === 'rest' || p.type === 'shop') banned[p.type] = true;
            // 같은 부모를 둔 형제 칸과 같은 특수 방은 피한다
            for (const sc of p.next) {
              const sib = floors[f - 1][sc];
              if (sib && sib !== n && sib.type && sib.type !== 'combat') banned[sib.type] = true;
            }
          }
          if (f === tFloor - 1 || f === tFloor + 1) banned.treasure = true;
          const w = roomWeights(run, f, H, trait).filter((x) => !banned[x[0]]);
          n.type = rng.weighted(w.length ? w : [['combat', 1]], (x) => x[1])[0];
        }
      }
    }
    const all = [];
    floors.forEach((row, fi) => row.forEach((n) => n && all.push({ n, f: fi + 1 })));
    // 막마다 엘리트 하나는 보장하고, 그중 하나가 '성난 엘리트'(초록 봉인석)
    let elites = all.filter((x) => x.n.type === 'elite');
    if (!elites.length) {
      const cands = all.filter((x) => x.f >= RS.ELITE_FLOOR && x.f < H && x.n.type === 'combat');
      if (cands.length) {
        rng.pick(cands).n.type = 'elite';
        elites = all.filter((x) => x.n.type === 'elite');
      }
    }
    if (elites.length) rng.pick(elites).n.burning = true;
    // 상점이 하나도 없으면 하나 만든다
    if (!all.some((x) => x.n.type === 'shop')) {
      const cands = all.filter((x) => x.f >= 3 && x.f < H && x.f !== tFloor && (x.n.type === 'combat' || x.n.type === 'unknown'));
      if (cands.length) rng.pick(cands).n.type = 'shop';
    }
    // 긴 막이라 중간 휴식처도 몇 개는 둔다 (마지막 층 제외)
    let rests = all.filter((x) => x.n.type === 'rest' && x.f < H).length;
    for (let tries = 0; rests < 2 && tries < 20; tries++) {
      const cands = all.filter((x) => x.f >= 7 && x.f <= H - 3 && x.f !== tFloor && x.n.type === 'combat');
      if (!cands.length) break;
      rng.pick(cands).n.type = 'rest';
      rests++;
    }
    for (const n of floors[H - 1]) if (n) n.next = [2];
    const bossRow = new Array(W).fill(null);
    bossRow[2] = { type: 'boss', next: [], visited: false };
    floors.push(bossRow);
    return { floors, trait: trait.id, treasureFloor: tFloor };
  };
  RS.mapTrait = (run) => RS.MAP_TRAITS.find((t) => run.map && t.id === run.map.trait) || null;

  // 4막: 휴식처 → 상점 → 엘리트(사도 둘) → 휴식처 → 고대신 (일직선)
  function genAct4Map() {
    const row = (type) => {
      const r = new Array(RS.MAP_W).fill(null);
      r[2] = { type, next: [2], visited: false };
      return r;
    };
    const floors = ['rest', 'shop', 'elite', 'rest', 'boss'].map(row);
    floors[floors.length - 1][2].next = [];
    return { floors };
  }

  RS.bossFloor = (run) => run.map.floors.length;

  RS.nextChoices = function (run) {
    const floors = run.map.floors;
    const out = [];
    if (run.floor >= floors.length) return out;
    if (run.floor === 0) {
      floors[0].forEach((n, l) => n && out.push({ f: 1, lane: l }));
      return out;
    }
    const node = floors[run.floor - 1][run.lane];
    for (const l of node.next) out.push({ f: run.floor + 1, lane: l });
    return out;
  };

  // 축지 장화: 다음 층 아무 칸
  RS.wingChoices = function (run) {
    const st = run.relicState.wingBoots;
    if (!st || st.uses <= 0 || run.floor === 0 || run.floor >= run.map.floors.length) return [];
    const normal = RS.nextChoices(run);
    const out = [];
    run.map.floors[run.floor].forEach((n, l) => {
      if (n && !normal.some((c) => c.lane === l)) out.push({ f: run.floor + 1, lane: l, wing: true });
    });
    return out;
  };

  // ? 칸: 전투·상점·보물 확률이 이벤트가 나올 때마다 오른다
  function resolveUnknown(run) {
    const u = run.unknown;
    const M = RS.collectMods(run);
    u.count++;
    // 고요의 구슬: ? 칸에 들어설 때마다 마음이 가라앉아 생명 +2 (꼬마 궤짝이 보물로 바꿔도)
    if (M.juzu) RS.heal(run, 2);
    // 꼬마 궤짝: 얻은 뒤부터 센다 (유물마다 따로 센다)
    if (M.tinyChest) {
      const st = run.relicState.tinyChest || (run.relicState.tinyChest = { n: 0 });
      st.n++;
      if (st.n % 3 === 0) return 'treasure';
    }
    const r = run.rng.next();
    const combat = M.juzu ? 0 : u.combat;
    if (r < combat) {
      u.combat = 0.1;
      // 가끔은 엘리트가 숨어 있다 (1막 5층 이후)
      if (!M.juzu && run.floor >= RS.ELITE_FLOOR && run.rng.chance(run.act >= 2 ? 0.25 : 0.15)) return 'elite';
      return 'combat';
    }
    // 숨은 야영지: 드물게 휴식처
    if (r > 0.96 && run.floor < RS.bossFloor(run) - 1) return 'rest';
    if (r < combat + u.shop) {
      u.shop = 0.03;
      return 'shop';
    }
    if (r < combat + u.shop + u.treasure) {
      u.treasure = 0.02;
      return 'treasure';
    }
    u.combat += 0.1;
    u.shop += 0.03;
    u.treasure += 0.02;
    return 'event';
  }

  RS.enterNode = function (run, f, lane, useWing) {
    const node = run.map.floors[f - 1][lane];
    if (useWing) run.relicState.wingBoots.uses--;
    node.visited = true;
    run.floor = f;
    run.lane = lane;
    const bank = run.relicState.mawBank;
    if (bank && bank.active) RS.addGold(run, 12);
    let type = node.type;
    if (type === 'unknown') {
      type = resolveUnknown(run);
      node.resolved = type;
    }
    run.nodeType = type;
    run.burning = !!node.burning;
    const rng = run.rng;
    switch (type) {
      case 'combat':
      case 'elite':
      case 'boss':
        run.phase = 'battle';
        run.pending = { stage: RS.makeStage(run, type, rng, { burning: run.burning }) };
        break;
      case 'event':
        run.phase = 'event';
        run.pending = { event: RS.pickEvent(run), result: null, step: 0 };
        break;
      case 'shop':
        run.phase = 'shop';
        run.pending = { shop: RS.genShop(run) };
        break;
      case 'rest':
        run.phase = 'rest';
        run.pending = { done: false };
        break;
      case 'treasure':
        run.phase = 'treasure';
        run.pending = { relics: RS.rollRelics(run, 1, [1, 2], [65, 35]), opened: false };
        break;
    }
  };

  // ── 보상 ──
  const AUG_W = [null, [0, 70, 27, 3], [0, 58, 35, 7], [0, 48, 40, 12], [0, 30, 45, 25]];

  // 슬더스의 희귀 카드 보정처럼, 프리즘이 안 나올수록 확률이 오른다
  RS.rollAugments = function (run, n, rarityW, exclude, usePity) {
    const rng = run.rng;
    const owned = {};
    for (const id of run.augments) owned[RS.augDef(id).id] = true;
    const taken = {};
    if (exclude) for (const id of exclude) taken[id] = true;
    const avail = RS.AUGMENTS.filter((a) => !(a.unique && owned[a.id]) && RS.augAllowed(run, a));
    // 지휘관 전용 증강: 첫 장은 25% 확률로 전용 증강에서 (그 등급이 남아 있으면)
    const cmdPull = n >= 2 && rng.chance(0.25);
    // 빌드 쪽으로 당기기: 태그가 있는 증강·유물을 가졌으면, 마지막 한 장은 50% 확률로
    // 가장 많이 가진 태그 두 개 중 하나와 겹치는 증강에서 뽑는다 (등급 확률은 그대로, 없으면 평소대로)
    let pull = null;
    if (n >= 2) {
      const cnt = RS.synCounts(run, true);
      const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 2);
      if (top.length && rng.chance(0.5)) pull = top;
    }
    const out = [];
    for (let k = 0; k < n; k++) {
      const w = rarityW.slice();
      if (usePity) w[3] += run.prismPity * 100;
      const rar = rng.weighted([1, 2, 3], (r) => w[r]);
      if (usePity) {
        if (rar === 3) run.prismPity = 0;
        else if (rar === 1) run.prismPity = Math.min(0.4, run.prismPity + 0.01);
      }
      let pool = [];
      if (cmdPull && k === 0) pool = avail.filter((a) => a.cmd && a.rarity === rar && !taken[a.id]);
      if (!pool.length && pull && k === n - 1) pool = avail.filter((a) => a.rarity === rar && !taken[a.id] && RS.synTags(a).some((t) => pull.indexOf(t) >= 0));
      if (!pool.length) pool = avail.filter((a) => a.rarity === rar && !taken[a.id]);
      if (!pool.length) pool = avail.filter((a) => !taken[a.id]);
      if (!pool.length) break;
      const a = rng.pick(pool);
      taken[a.id] = true;
      out.push(a.id);
    }
    return out;
  };

  // exclude: 가진 유물 말고도 빼 둘 것 (상점에 이미 놓인 유물 등)
  RS.rollRelics = function (run, n, rarities, weights, exclude) {
    const rng = run.rng;
    const owned = {};
    for (const id of run.relics) owned[id] = true;
    if (exclude) for (const id of exclude) owned[id] = true;
    const out = [];
    for (let k = 0; k < n; k++) {
      const pools = rarities.map((r) => RS.RELICS.filter((x) => x.rarity === r && !owned[x.id] && out.indexOf(x.id) < 0));
      const idx = rng.weighted(rarities.map((r, i) => i), (i) => (pools[i].length ? weights[i] : 0));
      const pool = pools[idx].length ? pools[idx] : [].concat(...pools);
      if (!pool.length) break;
      out.push(rng.pick(pool).id);
    }
    return out;
  };

  // 아직 얻을 수 있는 유물이 남았는지 (rng 를 쓰지 않는다)
  RS.relicsLeft = function (run, rarities, exclude) {
    return RS.RELICS.some((x) => rarities.indexOf(x.rarity) >= 0 && run.relics.indexOf(x.id) < 0 && !(exclude && exclude.indexOf(x.id) >= 0));
  };

  RS.grantRandomRelic = function (run, rarities, exclude) {
    const ids = RS.rollRelics(run, 1, rarities, rarities.map(() => 1), exclude);
    if (!ids.length) return null;
    RS.addRelic(run, ids[0]);
    return ids[0];
  };

  RS.augChoiceCount = function (run) {
    return Math.max(1, 3 + RS.collectMods(run).augChoices);
  };

  // 모험을 끝내는 보스: 4막 심장, 또는 열쇠 셋이 없을 때의 3막 보스
  RS.isFinalBoss = function (run) {
    if (run.nodeType !== 'boss') return false;
    const k = run.keys || {};
    return run.act === 4 || (run.act === 3 && !(k.ruby && k.emerald && k.sapphire));
  };

  RS.finishBattle = function (run, battle) {
    const st = battle.stats;
    const stage0 = battle.stage;
    const trial = !!(stage0.spec && stage0.spec.trial);
    run.stats.battles++;
    run.stats.kills += st.kills;
    run.stats.dmg += st.dmg;
    for (const c of RS.CLASSES) run.stats.clsDmg[c] += st.clsDmg[c];
    // 졸음의 별은 허수아비 시험에는 걸리지 않으니 횟수도 쓰지 않는다
    if (run.lament > 0 && !trial) run.lament--;
    if (run.tax > 0 && !trial) run.tax--; // 세금도 허수아비 시험에는 걸리지 않는다
    RS.battleUpkeep(run);
    if (trial) {
      // 허수아비 시험: 실패해도 모험은 계속된다
      RS.trialReward(run, battle);
      return;
    }
    if (battle.result !== 'won') {
      run.phase = 'over';
      run.pending = { reason: battle.reason };
      return;
    }
    // 마지막 보스: 쓸 수 없는 보상을 고르게 하지 않고 곧장 승리
    if (RS.isFinalBoss(run)) {
      run.stats.bosses++;
      run.phase = 'victory';
      run.pending = null;
      return;
    }
    const M = RS.collectMods(run);
    const stage = battle.stage;
    const type = stage.type === 'eventFight' ? stage.spec.as || 'elite' : run.nodeType;
    const act = Math.min(3, run.act);
    const rng = run.rng;
    let gold = BAL.clearGold[type === 'boss' ? 'boss' : type === 'elite' ? 'elite' : 'combat'][act];
    // 이벤트 보스전(소원의 꽃)은 골드 대신 유물을 준다
    if (type === 'boss' && stage.type === 'eventFight') gold = 0;
    gold = Math.round(gold * (0.85 + rng.next() * 0.3) * (1 + M.combatGoldPct)) + (M.winGold || 0) * act;
    if (run.burning && type === 'elite') gold += 30 * act;
    RS.addGold(run, gold);
    // 일반 전투를 이기면 상처가 조금 아문다 (엘리트·보스전은 아니다)
    const injury0 = run.injury || 0;
    if (type === 'combat' && injury0 > 0) run.injury = Math.max(0, injury0 - BAL.injuryDecay);
    // 보상 화면에는 실제로 회복한 양을 보여 준다 (가득 찼거나 시든 꽃의 낙인이면 0).
    // 생명은 반 칸이 될 수 있으니 화면에 보이는 값(올림)의 차이로 센다
    const life0 = run.life;
    if (M.winHeal) RS.heal(run, M.winHeal);
    if (M.winMaxLife) {
      RS.changeMaxLife(run, M.winMaxLife);
      RS.heal(run, M.winMaxLife);
    }
    if (M.meatBone && run.life <= run.maxLife / 2) RS.heal(run, M.meatBone);
    const healed = Math.max(0, Math.ceil(run.life) - Math.ceil(life0));
    if (M.eliteUpgrade && type === 'elite') {
      const idxs = run.augments.map((id, i) => i).filter((i) => RS.canUpgradeAug(run.augments[i]));
      rng.shuffle(idxs);
      for (const i of idxs.slice(0, M.eliteUpgrade)) RS.upgradeAug(run, i);
    }
    if (type === 'elite') run.stats.elites++;
    if (type === 'boss' && run.nodeType === 'boss') run.stats.bosses++;
    const reward = { gold, heal: healed, mend: injury0 - (run.injury || 0), augDone: false, rerolls: M.augRerolls, relics: null, relicDone: false, item: null, key: null };
    // 소모품: 기본 40%, 나오면 -10%p, 안 나오면 +10%p
    if (!M.noItems && type !== 'boss') {
      if (rng.chance(run.itemChance + (M.itemDropBonus || 0))) {
        const id = RS.randomItemId(rng);
        if (RS.addItem(run, id)) reward.item = id;
        else reward.lostItem = id; // 가방이 가득 차 두고 왔다
        run.itemChance = Math.max(0, run.itemChance - 0.1);
      } else run.itemChance = Math.min(1, run.itemChance + 0.1);
    }
    const w = type === 'boss' ? [0, 0, 0, 1] : type === 'elite' ? [0, 15, 60, 25] : AUG_W[Math.min(4, run.act)];
    reward.augW = w;
    reward.aug = RS.rollAugments(run, RS.augChoiceCount(run), w, null, type === 'combat');
    if (type === 'elite') {
      reward.relics = RS.rollRelics(run, 2, [1, 2], [70, 30]);
      if (M.blackStar && stage.type !== 'eventFight') reward.takeAll = true;
      if (run.burning && !run.keys.emerald) {
        run.keys.emerald = true;
        reward.key = 'emerald';
      }
    }
    if (type === 'boss') reward.relics = RS.rollRelics(run, 3, [3], [1]);
    if (stage.type === 'eventFight' && stage.spec.relic) reward.relics = RS.rollRelics(run, stage.spec.relicChoices || 1, stage.spec.relic, stage.spec.relic.map(() => 1));
    if (type === 'combat' && M.prayerWheel) {
      // 소원 물레: 일반 전투 6번마다 증강 한 번 더
      const st = (run.relicState.prayerWheel = run.relicState.prayerWheel || { n: 0 });
      st.n = (st.n || 0) + 1;
      if (st.n % 6 === 0) RS.enqueue(run, { k: 'aug', w, title: '소원 물레' });
    }
    run.phase = 'reward';
    run.pending = { reward };
  };

  RS.rewardPickAug = function (run, id) {
    const r = run.pending.reward;
    if (r.augDone) return;
    RS.pickAugment(run, id);
    r.augDone = true;
  };
  // 전투 보상에서 증강을 건너뛸 때 받는 골드 (망각의 서가 포함). 보상 화면 버튼도 이 값을 쓴다
  RS.skipGoldAmount = function (run) {
    const M = RS.collectMods(run);
    return Math.round(BAL.skipGold[Math.min(3, run.act)] * (1 + (M.skipGoldMul || 0)));
  };
  // 증강을 건너뛸 때의 공통 효과 (울림 사발). 늘어난 최대 생명을 돌려준다
  RS.skipAugBonus = function (run) {
    const M = RS.collectMods(run);
    if (!M.singingBowl) return 0;
    RS.changeMaxLife(run, 2);
    RS.heal(run, 2);
    return 2;
  };
  RS.rewardSkipAug = function (run) {
    const r = run.pending.reward;
    if (r.augDone) return 0;
    const g = RS.skipGoldAmount(run);
    RS.addGold(run, g);
    RS.skipAugBonus(run);
    r.augDone = true;
    return g;
  };
  RS.rewardReroll = function (run) {
    const r = run.pending.reward;
    if (r.rerolls <= 0 || r.augDone) return false;
    r.rerolls--;
    r.aug = RS.rollAugments(run, r.aug.length, r.augW, r.aug);
    return true;
  };
  RS.rewardPickRelic = function (run, id) {
    const r = run.pending.reward;
    if (r.relicDone) return;
    if (r.takeAll) for (const x of r.relics) RS.addRelic(run, x);
    else if (id) RS.addRelic(run, id);
    r.relicDone = true;
  };
  RS.rewardComplete = function (run) {
    const r = run.pending && run.pending.reward;
    return !!r && r.augDone && (!r.relics || !r.relics.length || r.relicDone);
  };

  // 노드를 마치고 다음으로. 쌓인 선택(증강 고르기 등)이 있으면 먼저 처리한다
  RS.advance = function (run) {
    if (run.nodeType === 'boss') {
      // (예전 저장본이 마지막 보스 보상 화면에 멈춰 있어도 여기서 끝난다)
      if (RS.isFinalBoss(run)) {
        run.phase = 'victory';
        run.pending = null;
        return;
      }
      run.act++;
      run.variants[run.act] = run.rng.int(RS.ACT_VARIANTS[run.act - 1].length);
      run.floor = 0;
      run.lane = -1;
      run.nodeType = null;
      run.map = RS.genMap(run);
      // 막을 넘어가면 잃은 생명을 회복한다 (슬더스처럼 막 하나가 생명 관리의 한 판. 심연 4부터 75%만)
      const cut = Math.min(0.9, RS.collectMods(run).actHealCut || 0);
      RS.heal(run, Math.ceil(Math.max(0, run.maxLife - run.life) * BAL.actHealPct * (run.asc >= 4 ? 0.75 : 1) * (1 - cut)));
      // 새 막에서는 상처가 모두 사라진다
      run.injury = 0;
      run.phase = 'actStart';
      run.pending = run.act <= 3 ? { ancient: RS.rollAncient(run) } : null;
    } else {
      // 상점·이벤트(전투 없이 끝난 것)도 길 위의 발견으로 증강 하나를 고른다: 전투만 고르는 길이 정답이 되지 않게
      if ((run.nodeType === 'shop' || run.nodeType === 'event') && run.phase !== 'over') {
        RS.enqueue(run, { k: 'aug', w: AUG_W[Math.min(4, run.act)], title: '길 위의 발견' });
      }
      run.phase = 'map';
      run.pending = null;
    }
    RS.flushQueue(run);
  };

  RS.flushQueue = function (run) {
    if (run.phase === 'victory' || run.phase === 'over') return;
    if (run.phase !== 'choice') pruneQueue(run);
    if (run.queue.length && run.phase !== 'choice') {
      run.afterQueue = run.phase;
      run.afterPending = run.pending;
      run.phase = 'choice';
      run.pending = null;
    }
  };
  RS.popQueue = function (run) {
    run.queue.shift();
    pruneQueue(run);
    if (!run.queue.length) {
      run.phase = run.afterQueue || 'map';
      run.pending = run.afterPending || null;
      run.afterQueue = null;
      run.afterPending = null;
    }
  };

  // 대기열 항목을 지금 처리할 수 있는지 (고를 대상이 하나라도 있는지)
  RS.choiceActionable = function (run, item) {
    switch (item && item.k) {
      case 'remove':
        return RS.removableCount(run) > 0;
      case 'upgrade':
        return run.augments.some((id) => RS.canUpgradeAug(id));
      case 'transform':
        return RS.transformableCount(run) > 0;
      case 'rune':
      case 'runeChoice':
        return run.runes.some((r) => !r || RS.RUNE[r].bad);
      case 'unit': {
        const maxTier = item.maxTier == null ? 3 : item.maxTier;
        if (item.op === 'dup') return run.board.some((s) => s && s.tier <= maxTier && RS.hasRoomFor(run.board, s.cls, s.tier));
        return run.board.some((s) => s && s.tier <= maxTier);
      }
      case 'relicList':
        return !!(item.ids && item.ids.length);
      default:
        return true;
    }
  };
  // 앞에서부터, 고를 대상이 없어진 항목은 건너뛴다 (값을 치른 항목이면 돌려준다)
  function pruneQueue(run) {
    let guard = 0;
    while (run.queue.length && guard++ < 50 && !RS.choiceActionable(run, run.queue[0])) {
      const it = run.queue[0];
      if (it.undo || it.refund || it.refundLife || it.undoCurse || it.undoKarma || it.undoCharm) RS.cancelChoice(run, it);
      run.queue.shift();
    }
  }

  // 플레이어가 대기열 선택을 그만두거나 건너뛸 때 (UI 가 popQueue 바로 앞에서 부른다).
  // 값을 치른 서비스는 되돌려 주고, 증강 건너뛰기는 전투 보상과 같은 효과(울림 사발)를 준다.
  RS.cancelChoice = function (run, item) {
    const out = { refund: 0, text: null };
    if (!item) return out;
    const texts = [];
    if (item.undo) {
      // 상점 구매 취소: 판매 전 상태로 되돌린다
      const u = item.undo;
      item.undo = null;
      const p = run.phase === 'choice' ? run.afterPending : run.pending;
      const shop = p && p.shop;
      if (shop && shop.list && u.entry && u.shopIdx >= 0 && u.shopIdx < shop.list.length) {
        const e = JSON.parse(JSON.stringify(u.entry));
        e.sold = false;
        shop.list[u.shopIdx] = e;
        shop.boughtAny = !!u.boughtAny;
      }
      if (u.removeCount != null) run.removeCount = u.removeCount;
      const bank = run.relicState.mawBank;
      if (bank && u.mawBank != null) bank.active = u.mawBank;
      if (u.gold > 0) RS.addGold(run, u.gold);
      out.refund += u.gold || 0;
      if (shop) RS.repriceShop(run, shop);
      texts.push(u.gold > 0 ? `구매를 취소했다. 골드 +${u.gold}` : '구매를 취소했다.');
    }
    if (item.refund || item.refundLife || item.undoCurse || item.undoKarma || item.undoCharm) {
      // 이벤트에서 값을 치른 서비스
      const g = item.refund || 0;
      if (g > 0) {
        RS.addGold(run, g);
        out.refund += g;
        texts.push(`골드 ${g}을(를) 돌려받았다.`);
      }
      if (item.refundLife > 0) {
        run.life = Math.min(run.maxLife, run.life + item.refundLife);
        texts.push(`생명 ${item.refundLife}을(를) 돌려받았다.`);
      }
      if (item.undoCurse) {
        const i = run.curses.lastIndexOf(item.undoCurse);
        if (i >= 0) {
          run.curses.splice(i, 1);
          texts.push(`저주 [${RS.CURSE[item.undoCurse].name}]도 사라졌다.`);
          // 그 저주로 받은 업보 골드도 돌려놓는다
          if (item.undoKarma > 0) {
            RS.addGold(run, -item.undoKarma);
            texts.push(`업보 골드 ${item.undoKarma}도 돌려놓았다.`);
          }
        }
      }
      if (item.undoCharm && run.relicState.omamori) run.relicState.omamori.charges += item.undoCharm;
      item.refund = 0;
      item.refundLife = 0;
      item.undoCurse = null;
      item.undoKarma = 0;
      item.undoCharm = 0;
      // 한 번에 산 묶음(제거 + 연마 등)의 나머지도 함께 취소
      if (item.group) {
        for (let i = run.queue.length - 1; i >= 0; i--) if (run.queue[i] !== item && run.queue[i].group === item.group) run.queue.splice(i, 1);
      }
    } else if ((item.k === 'aug' || item.k === 'augList') && item.ids && item.ids.length) {
      const life = RS.skipAugBonus(run);
      if (life) texts.push(`울림 사발: 최대 생명 +${life}`);
    }
    out.text = texts.length ? texts.join(' ') : null;
    return out;
  };

  // 대기열의 증강 선택지: 처음 보여 줄 때 굴린다. 'aug' 항목은 운명의 주사위 새로고침을 쓸 수 있다
  RS.choiceAugIds = function (run, item) {
    if (!item.ids) item.ids = RS.rollAugments(run, item.n || RS.augChoiceCount(run), item.w);
    if (item.rerolls == null) item.rerolls = item.k === 'aug' && item.w ? RS.collectMods(run).augRerolls || 0 : 0;
    return item.ids;
  };
  RS.choiceReroll = function (run, item) {
    if (!item || !item.w || !item.ids || !(item.rerolls > 0)) return false;
    item.rerolls--;
    item.ids = RS.rollAugments(run, item.ids.length, item.w, item.ids);
    return true;
  };

  // ── 이벤트 ──
  RS.pickEvent = function (run) {
    const actOk = (e) => !e.acts || e.acts.indexOf(Math.min(3, run.act)) >= 0;
    let pool = RS.EVENTS.filter((e) => actOk(e) && run.seenEvents.indexOf(e.id) < 0 && (!e.cond || e.cond(run)));
    if (!pool.length) pool = RS.EVENTS.filter((e) => actOk(e) && (!e.cond || e.cond(run)));
    const e = run.rng.pick(pool);
    run.seenEvents.push(e.id);
    return e.id;
  };

  RS.optionDesc = function (run, opt) {
    return typeof opt.desc === 'function' ? opt.desc(run) : opt.desc;
  };
  RS.optionLabel = function (run, opt) {
    return typeof opt.label === 'function' ? opt.label(run) : opt.label;
  };
  RS.optionEnabled = function (run, opt) {
    return !opt.cond || opt.cond(run);
  };
  // 안전장치: 어떤 이유로든 고를 수 있는 선택지가 하나도 없으면 '떠난다'를 붙인다
  const SAFE_LEAVE = { label: '떠난다', desc: '아무 일도 일어나지 않는다', safeLeave: true, apply: () => '발걸음을 돌렸다.' };
  RS.eventOptions = function (run) {
    const ev = RS.EVENT[run.pending.event];
    const step = run.pending.step || 0;
    const opts = ev.steps ? ev.steps[step].options : ev.options;
    if (opts.some((o) => RS.optionEnabled(run, o))) return opts;
    return opts.concat([SAFE_LEAVE]);
  };
  RS.eventText = function (run) {
    const ev = RS.EVENT[run.pending.event];
    const step = run.pending.step || 0;
    const t = ev.steps ? ev.steps[step].text : ev.text;
    return typeof t === 'function' ? t(run) : t;
  };

  // 결과: 문장 또는 { text, augRarity, fight, next(단계 이동), again(같은 단계 반복) }
  RS.eventChoose = function (run, idx) {
    const opt = RS.eventOptions(run)[idx];
    if (!opt || !RS.optionEnabled(run, opt) || run.pending.result) return null;
    let res = opt.apply(run, run.rng);
    if (typeof res === 'string') res = { text: res };
    res = res || { text: '' };
    if (res.next != null) {
      run.pending.step = res.next;
      run.pending.log = res.text;
      return res;
    }
    if (res.again) {
      run.pending.log = res.text;
      return res;
    }
    run.pending.result = res;
    if (res.augRarity) {
      const w = [0, 0, 0, 0];
      w[res.augRarity] = 1;
      RS.enqueue(run, { k: 'aug', w, title: RS.EVENT[run.pending.event].title });
    }
    if (res.fight) {
      run.pending.fight = res.fight;
    }
    return res;
  };

  // 이벤트 전투: 끝나면 보상 화면으로
  RS.startEventFight = function (run) {
    const spec = run.pending.fight;
    run.nodeType = 'eventFight';
    run.burning = false;
    run.phase = 'battle';
    run.pending = { stage: RS.makeStage(run, 'eventFight', run.rng, spec) };
  };

  // ── 상점 ──
  RS.priceMul = function (run) {
    const M = RS.collectMods(run);
    return [0, 1, 1.2, 1.4, 1.4][run.act] * (run.asc >= 2 ? 1.15 : 1) * Math.max(0.3, 1 - M.shopDiscount);
  };
  RS.removeCost = function (run) {
    const M = RS.collectMods(run);
    if (M.fixedRemoveCost) return M.fixedRemoveCost;
    // 상점 할인 유물은 제거 서비스에도 적용된다 (막 배율은 적용하지 않는다)
    return Math.round((75 + 25 * run.removeCount) * (run.asc >= 2 ? 1.15 : 1) * Math.max(0.3, 1 - M.shopDiscount));
  };

  // 상점에는 황금 주문서(골드로 사서 골드를 얻는 것)를 놓지 않는다
  const shopItemId = (rng) => rng.pick(RS.ITEMS.filter((x) => x.id !== 'goldScroll')).id;
  const relicEntry = (id) => ({ kind: 'relic', id, base: RS.REL[id].rarity === 2 ? 170 : 120 });

  RS.genShop = function (run) {
    const rng = run.rng;
    const list = [];
    // 한 번에 굴려야 서로 겹치지 않는다 (유물 3개)
    for (const id of RS.rollRelics(run, 3, [1, 2], [65, 35])) list.push(relicEntry(id));
    for (let k = 0; k < 3; k++) list.push({ kind: 'item', id: shopItemId(rng), base: 45 + rng.int(26) });
    const augs = RS.rollAugments(run, 2, [0, 30, 55, 15]);
    augs.forEach((id, k) => list.push({ kind: 'aug', id, base: [0, 80, 110, 160][RS.AUG[id].rarity], sale: k === 0 }));
    list.push({ kind: 'unit', tier: 1, base: 120 });
    list.push({ kind: 'unit', tier: 2, base: 330 });
    list.push({ kind: 'rune', id: RS.randomRune(rng), base: 100 });
    list.push({ kind: 'remove' });
    for (const it of list) it.sold = false;
    RS.repriceShop(run, { list });
    return { list };
  };

  RS.repriceShop = function (run, shop) {
    const mul = RS.priceMul(run);
    const free = RS.collectMods(run).freeFirstBuy && !shop.boughtAny;
    for (const it of shop.list) {
      if (free) it.price = 0;
      else if (it.kind === 'remove') it.price = RS.removeCost(run);
      else it.price = Math.round(it.base * mul * (it.sale ? 0.5 : 1));
    }
  };

  // 제거/룬처럼 대상을 골라야 하는 것은 구매 후 선택 대기열로 보낸다
  RS.shopBuy = function (run, idx) {
    const shop = run.pending.shop;
    const it = shop.list[idx];
    if (!it || it.sold) return { err: 'sold' };
    if (run.gold < it.price) return { err: 'gold' };
    if (it.kind === 'item' && (run.items.length >= RS.itemSlots(run) || RS.collectMods(run).noItems)) return { err: 'full' };
    if (it.kind === 'unit' && !RS.hasEmptySlot(run.board)) return { err: 'board' };
    if (it.kind === 'remove' && !RS.removableCount(run)) return { err: 'none' };
    if (it.kind === 'rune' && !run.runes.some((r) => !r || RS.RUNE[r].bad)) return { err: 'noslot' };
    const bank = run.relicState.mawBank;
    // 대상을 고르는 서비스(제거·룬)는 선택 화면에서 그만두면 되돌릴 수 있게 기록해 둔다 (RS.cancelChoice)
    const undo = { gold: it.price, shopIdx: idx, entry: JSON.parse(JSON.stringify(it)), removeCount: run.removeCount, boughtAny: !!shop.boughtAny, mawBank: bank ? bank.active : null };
    RS.addGold(run, -it.price);
    shop.boughtAny = true;
    if (bank) bank.active = false;
    it.sold = true;
    if (it.kind === 'relic') RS.addRelic(run, it.id);
    else if (it.kind === 'item') RS.addItem(run, it.id);
    else if (it.kind === 'aug') RS.pickAugment(run, it.id);
    else if (it.kind === 'unit') RS.grantUnits(run, it.tier, 1, it.price > 0 ? it.price : undefined);
    else if (it.kind === 'rune') RS.enqueue(run, { k: 'rune', rune: it.id, title: '룬 새기기', undo });
    else if (it.kind === 'remove') {
      run.removeCount++;
      RS.enqueue(run, { k: 'remove', title: '제거 서비스', undo });
    }
    if (RS.collectMods(run).courier && it.kind !== 'remove') {
      // 보부상: 빈자리에 같은 종류의 새 물건
      let fresh = null;
      if (it.kind === 'relic') {
        const ids = RS.rollRelics(run, 1, [1, 2], [65, 35], shop.list.filter((x) => x.kind === 'relic').map((x) => x.id));
        if (ids.length) fresh = relicEntry(ids[0]);
      } else if (it.kind === 'item') fresh = { kind: 'item', id: shopItemId(run.rng), base: 45 + run.rng.int(26) };
      else if (it.kind === 'aug') {
        const a = RS.rollAugments(run, 1, [0, 30, 55, 15], shop.list.filter((x) => x.kind === 'aug').map((x) => x.id));
        if (a.length) fresh = { kind: 'aug', id: a[0], base: [0, 80, 110, 160][RS.AUG[a[0]].rarity] };
      } else if (it.kind === 'unit') fresh = { kind: 'unit', tier: it.tier, base: it.base };
      else if (it.kind === 'rune') fresh = { kind: 'rune', id: RS.randomRune(run.rng), base: 100 };
      if (fresh) {
        fresh.sold = false;
        shop.list[idx] = fresh;
      }
    }
    RS.repriceShop(run, shop);
    return { ok: true, kind: it.kind };
  };

  RS.removableCount = function (run) {
    return run.augments.length + run.curses.filter((id) => !RS.CURSE[id].permanent).length;
  };

  // ── 휴식처 ──
  RS.restHealAmount = (run) => {
    const M = RS.collectMods(run);
    return Math.ceil(run.maxLife * BAL.restHealPct * (1 - Math.min(0.9, M.restHealCut || 0))) + (M.restHealAdd || 0);
  };
  RS.restTrainAmount = (run) => BAL.trainLevels + RS.collectMods(run).restTrainBonus;

  // 복제의 룬 위 유닛 중 실제로 복제할 수 있는 칸 (같은 유닛 칸이나 빈칸이 있어야 한다)
  RS.cloneTargets = function (run) {
    const out = [];
    run.runes.forEach((r, i) => {
      const s = run.board[i];
      if (r === 'cloneR' && s && RS.hasRoomFor(run.board, s.cls, s.tier)) out.push(i);
    });
    return out;
  };
  // 고른 칸이 없으면 가장 높은 등급 유닛을 복제한다
  RS.cloneTarget = function (run, prefer) {
    const list = RS.cloneTargets(run);
    if (prefer != null && list.indexOf(prefer) >= 0) return prefer;
    let best = -1;
    for (const i of list) if (best < 0 || run.board[i].tier > run.board[best].tier) best = i;
    return best;
  };

  RS.restOptions = function (run) {
    const M = RS.collectMods(run);
    const opts = [];
    const bloom = !RS.canHeal(run);
    const dream = M.dreamCatcher ? ' · 증강 선택' : '';
    const inj = run.injury > 0 && !bloom ? ` · 상처 ${run.injury} 치료` : '';
    opts.push({
      id: 'heal', label: '휴식',
      desc: bloom ? `회복할 수 없다 (시든 꽃의 낙인)${dream}` : `생명 +${RS.restHealAmount(run)}${inj}${dream}`,
      off: M.noRestHeal ? '각성제 때문에 잠들 수 없다' : bloom && !M.dreamCatcher ? '시든 꽃의 낙인 때문에 회복할 수 없다' : null,
    });
    opts.push({ id: 'train', label: '수련', desc: `클래스 하나 강화 +${RS.restTrainAmount(run)}`, off: M.noSmith ? '벼락 망치 때문에 할 수 없다' : null });
    const up = run.augments.some((id) => RS.canUpgradeAug(id));
    opts.push({ id: 'smith', label: '연마', desc: '증강 하나를 연마 (효과 ×1.5)', off: M.noSmith ? '벼락 망치 때문에 할 수 없다' : !up ? '연마할 수 있는 증강이 없다' : null });
    if (M.peacePipe) opts.push({ id: 'toke', label: '명상', desc: '증강이나 저주 하나를 없앤다', off: RS.removableCount(run) ? null : '없앨 것이 없다' });
    if (M.shovel) opts.push({ id: 'dig', label: '발굴', desc: '유물 하나를 얻는다', off: RS.relicsLeft(run, [1, 2]) ? null : '남은 유물이 없다' });
    if (M.girya) {
      const lifts = run.relicState.girya.lifts;
      opts.push({ id: 'lift', label: '단련', desc: `모든 유닛 피해 ×1.08 (${lifts}/3)`, off: lifts >= 3 ? '더 단련할 수 없다' : null });
    }
    const candle = run.relicState.pumpkinCandle;
    if (candle && candle.charges < 12) opts.push({ id: 'kindle', label: '불 붙이기', desc: `박 등잔을 다시 켠다 (남은 ${candle.charges}번 → 12번)` });
    if (run.quests && run.quests.egg) opts.push({ id: 'hatch', label: '부화', desc: '용의 알을 부화시킨다: 전설 유닛 1기 + 유물 [아기 용]' });
    const onRune = run.runes.some((r, i) => r === 'cloneR' && run.board[i]);
    if (onRune) {
      const ci = RS.cloneTarget(run);
      const s = ci >= 0 ? run.board[ci] : null;
      opts.push({ id: 'clone', label: '복제', desc: s ? `복제의 룬 위 유닛 1기를 복제 (${RS.TIER[s.tier].name} ${RS.CLASS[s.cls].name})` : '복제의 룬 위 유닛 1기를 복제', off: s ? null : '보드에 자리가 없다' });
    }
    if (run.act <= 3 && !run.keys.ruby) opts.push({ id: 'recall', label: '회수', desc: '붉은 봉인석을 얻는다 (휴식·수련 대신)' });
    return opts;
  };

  // 결과 문장을 돌려준다 (없으면 null)
  RS.restDo = function (run, id, arg) {
    let text = null;
    switch (id) {
      case 'heal':
        RS.heal(run, RS.restHealAmount(run));
        // 실제로 잠들어 회복할 때만 상처가 낫는다 (시든 꽃의 낙인·각성제면 낫지 않는다)
        if (RS.canHeal(run) && !RS.collectMods(run).noRestHeal) run.injury = 0;
        if (RS.collectMods(run).dreamCatcher) RS.enqueue(run, { k: 'aug', w: [0, 50, 42, 8], title: '꿈 그물' });
        break;
      case 'train':
        run.classLv[arg] += RS.restTrainAmount(run);
        break;
      case 'smith':
        RS.enqueue(run, { k: 'upgrade', title: '연마' });
        break;
      case 'toke':
        RS.enqueue(run, { k: 'remove', title: '명상' });
        break;
      case 'dig':
        RS.grantRandomRelic(run, [1, 2]);
        break;
      case 'lift':
        run.relicState.girya.lifts++;
        // 단련은 한 번마다 ×1.08 을 곱한다 (세 번이면 ×1.26)
        run.permDmg = (1 + (run.permDmg || 0)) * 1.08 - 1;
        break;
      case 'recall':
        run.keys.ruby = true;
        break;
      case 'kindle':
        run.relicState.pumpkinCandle.charges = 12;
        break;
      case 'hatch':
        run.quests.egg = false;
        RS.grantUnits(run, 3, 1);
        if (!RS.hasRelic(run, 'babyDragon')) RS.addRelic(run, 'babyDragon');
        break;
      case 'clone': {
        const i = RS.cloneTarget(run, arg);
        if (i >= 0) {
          const s = run.board[i];
          if (RS.addUnit(run.board, s.cls, s.tier, i) >= 0) text = `${RS.TIER[s.tier].name} ${RS.CLASS[s.cls].name} 복제!`;
        }
        break;
      }
    }
    if (run.pending) run.pending.done = true;
    return text;
  };

  // ── 보물 ──
  RS.openChest = function (run, takeKey) {
    const p = run.pending;
    p.opened = true;
    const M = RS.collectMods(run);
    if (takeKey) {
      run.keys.sapphire = true;
      p.gotKey = true;
    } else {
      p.got = [];
      for (const id of p.relics) {
        RS.addRelic(run, id);
        p.got.push(id);
      }
      const doll = run.relicState.matryoshka;
      if (doll && doll.count > 0) {
        doll.count--;
        const extra = RS.grantRandomRelic(run, [1, 2]);
        if (extra) p.got.push(extra);
      }
    }
    if (M.cursedKey && !takeKey && run.floor !== (run.map.treasureFloor || 5)) {
      const c = RS.randomCurseId(run.rng);
      if (RS.addCurse(run, c)) p.curse = c;
    }
    // 보물 지도: 지도를 산 다음 막의 첫 보물 상자
    if (run.quests && run.quests.spoilsAct === run.act) {
      RS.addGold(run, 400);
      p.spoils = 400;
      run.quests.spoilsAct = null;
    }
  };

  // 전투가 끝날 때마다: 녹는 유물, 사라지는 저주, 퀘스트 카운트
  RS.battleUpkeep = function (run) {
    const st = run.relicState;
    if (st.pumpkinCandle && st.pumpkinCandle.charges > 0) st.pumpkinCandle.charges--;
    if (st.waxToys) st.waxToys.fights++;
    // 사라지는 저주: 생긴 뒤 전투를 정해진 횟수만큼 치르면 사라진다
    const timers = syncCurseTimers(run, true);
    const now = run.stats.battles;
    for (let k = timers.length - 1; k >= 0; k--) {
      const t = timers[k];
      if (now - t.at < RS.CURSE[t.id].fades) continue;
      timers.splice(k, 1);
      const i = run.curses.indexOf(t.id);
      if (i >= 0) run.curses.splice(i, 1);
    }
    const w = run.quests && run.quests.wongo;
    if (w && w.left > 0) {
      w.left--;
      if (w.left === 0) {
        for (let k = 0; k < 3; k++) RS.grantRandomRelic(run, [1, 2]);
        run.quests.wongo = null;
        run.quests.wongoDone = true;
      }
    }
  };

  // 허수아비 시험 보상 (시간 안에 쓰러뜨렸는지에 따라)
  // 보상을 줄 수 없으면(가방이 가득 참 등) 골드로 대신 주고, trial.text 에 실제로 받은 것을 적는다
  RS.trialReward = function (run, battle) {
    const tier = battle.stage.spec.trial;
    const ok = battle.result === 'won' && !battle.trialFailed;
    const reward = { gold: 0, augDone: true, relics: null, relicDone: true, trial: { tier, ok, text: null } };
    // 시험은 전투 보상 증강이 없으니, 성공·실패와 상관없이 지나칠 때처럼 길 위의 발견을 준다
    RS.enqueue(run, { k: 'aug', w: AUG_W[Math.min(4, run.act)], title: '길 위의 발견' });
    if (ok) {
      const a = Math.min(3, run.act);
      const fallback = (g, why) => {
        reward.gold = g;
        RS.addGold(run, g);
        reward.trial.text = `${why} 대신 골드 +${g}`;
      };
      if (tier === 1) {
        const id = RS.randomItemId(run.rng);
        if (RS.addItem(run, id)) {
          reward.item = id;
          reward.trial.text = `소모품 [${RS.ITEM[id].name}]`;
        } else fallback(30 * a, '소모품을 가질 수 없어');
      } else if (tier === 2) {
        const n = Math.min(2, run.augments.filter((id) => RS.canUpgradeAug(id)).length);
        for (let k = 0; k < n; k++) RS.enqueue(run, { k: 'upgrade', title: '허수아비 시험' });
        if (n) reward.trial.text = `증강 ${n}개 연마`;
        else fallback(60 * a, '연마할 증강이 없어');
      } else {
        const ids = RS.rollRelics(run, 1, [2], [1]);
        if (ids.length) {
          reward.relics = ids;
          reward.relicDone = false;
          reward.trial.text = '희귀 유물';
        } else fallback(100 * a, '남은 희귀 유물이 없어');
      }
    }
    run.phase = 'reward';
    run.pending = { reward };
  };

  // 도깨비 화롯불에 바친 유닛 등급에 따라 보상
  RS.sacrificeUnit = function (run, i) {
    const s = run.board[i];
    if (!s) return '';
    const tier = s.tier;
    RS.takeUnit(run.board, i);
    const bloom = !RS.canHeal(run);
    if (tier === 0) return '도깨비들이 시큰둥하다. 아무 일도 없었다.';
    if (tier === 1) {
      const h = RS.heal(run, 5);
      return bloom ? '도깨비들이 기뻐하지만, 시든 꽃의 낙인 때문에 회복하지 못했다.' : `도깨비들이 기뻐한다. 생명 +${h}`;
    }
    if (tier === 2) {
      RS.changeMaxLife(run, 5);
      RS.heal(run, run.maxLife);
      return bloom ? '도깨비들이 춤춘다! 최대 생명 +5 (시든 꽃의 낙인 때문에 회복은 못 했다)' : '도깨비들이 춤춘다! 최대 생명 +5, 생명 모두 회복';
    }
    RS.changeMaxLife(run, 10);
    RS.heal(run, 10);
    const id = RS.grantRandomRelic(run, [2]);
    return `도깨비들이 환호한다! 최대 생명 +10${id ? `, 유물 [${RS.REL[id].name}]` : ''}`;
  };

  // 땜장이 공방: 직접 조립한 증강 (런마다 등록)
  RS.registerCustomAugs = function (run) {
    for (const id in run.customAugs || {}) {
      const c = run.customAugs[id];
      RS.AUG[id] = { id, name: c.name, rarity: 2, icon: 'gear', desc: c.desc, mods: c.mods, unique: true, custom: true };
    }
  };

  RS.buildTinker = function (run, extra) {
    const base = run.pending.tinker ? run.pending.tinker.base : 'dmg';
    const mods = {};
    const parts = [];
    if (base === 'dmg') { mods.dmgPct = 0.15; parts.push('모든 유닛 피해 +15%'); }
    if (base === 'aspd') { mods.aspdPct = 0.12; parts.push('모든 유닛 공격 속도 +12%'); }
    if (base === 'range') { mods.rangeAdd = 7; parts.push('모든 유닛 사거리 +7'); }
    if (extra === 'crit') { mods.critChance = 0.06; parts.push('치명타 확률 +6%'); }
    if (extra === 'gold') { mods.killGoldPct = 0.12; parts.push('처치 골드 +12%'); }
    if (extra === 'slow') { mods.enemySpeedPct = 0.05; parts.push('모든 적 이동 속도 -5%'); }
    run.customAugs = run.customAugs || {};
    const n = Object.keys(run.customAugs).length + 1;
    const id = 'tinker' + n;
    run.customAugs[id] = { name: `괴짜 발명품 ${n}호`, desc: parts.join(', '), mods };
    RS.registerCustomAugs(run);
    RS.pickAugment(run, id);
    return `[괴짜 발명품 ${n}호] 완성! (${parts.join(', ')})`;
  };

  RS.wongoSpend = function (run, g) {
    run.stats.wongo = (run.stats.wongo || 0) + g;
  };

  // 안개 구슬: 9칸 중 정해진 횟수만큼 들여다본다
  RS.initSphere = function (run, n) {
    run.pending.sphere = { left: n, pool: run.rng.shuffle(['gold', 'gold', 'gold', 'item', 'item', 'aug', 'relic', 'curse', 'empty']) };
  };
  RS.revealSphere = function (run) {
    const s = run.pending.sphere;
    const r = s.pool.shift();
    s.left--;
    const a = Math.min(3, run.act);
    let text;
    if (r === 'gold') {
      RS.addGold(run, 40 * a);
      text = `골드 +${40 * a}`;
    } else if (r === 'item') text = RS.addItem(run, RS.randomItemId(run.rng)) ? '소모품을 찾았다' : '소모품이 있었지만 가질 수 없었다';
    else if (r === 'aug') {
      RS.enqueue(run, { k: 'aug', w: [0, 50, 40, 10], title: '안개 구슬' });
      text = '증강의 환영이 보인다 (나중에 고른다)';
    } else if (r === 'relic') {
      const id = RS.grantRandomRelic(run, [1, 2]);
      text = `유물 [${id ? RS.REL[id].name : '먼지'}]!`;
    } else if (r === 'curse') text = RS.addCurse(run, RS.randomCurseId(run.rng)) ? '저주가 튀어나왔다!' : '저주가 튀어나왔지만 액막이 매듭이 막았다';
    else text = '아무것도 없다';
    if (s.left > 0 && s.pool.length) return { text, again: true };
    return text + ' · 구슬 속에 다시 안개가 낀다.';
  };

  // ── 룬 (보드 칸에 새기는 인챈트) ──
  RS.randomRune = function (rng) {
    return rng.pick(RS.RUNES.filter((r) => !r.bad)).id;
  };
  RS.setRune = function (run, slot, id) {
    run.runes[slot] = id;
  };
})((globalThis.RS = globalThis.RS || {}));
