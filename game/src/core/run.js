// 로그라이크 진행: 맵, 보상, 상점, 이벤트, 휴식, 저장
(function (RS) {
  'use strict';

  const BAL = RS.BAL;

  // ── 공용 헬퍼 ──
  RS.addGold = function (run, g) {
    run.gold = Math.max(0, run.gold + g);
  };
  RS.heal = function (run, v) {
    run.life = Math.min(run.maxLife, run.life + v);
  };
  RS.damageLife = function (run, v) {
    run.life = Math.max(1, run.life - v);
  };
  RS.changeMaxLife = function (run, d) {
    run.maxLife = Math.max(1, run.maxLife + d);
    run.life = Math.min(run.life, run.maxLife);
  };
  RS.addItem = function (run, id) {
    if (run.items.length >= RS.itemSlots(run)) return false;
    run.items.push(id);
    return true;
  };
  RS.addCurse = function (run, id) {
    run.curses.push(id);
  };
  RS.grantUnits = function (run, tier, n) {
    const M = RS.collectMods(run);
    for (let k = 0; k < n; k++) {
      const cls = run.rng.pick(RS.CLASSES);
      if (RS.addUnit(run.board, cls, tier) < 0) RS.addGold(run, RS.sellValue(run, tier, M));
    }
  };
  RS.addRelic = function (run, id) {
    run.relics.push(id);
    const def = RS.REL[id];
    if (def.onPick) def.onPick(run);
  };
  RS.pickAugment = function (run, id) {
    run.augments.push(id);
    const def = RS.AUG[id];
    if (def.onPick) def.onPick(run);
  };

  RS.attachRng = function (run) {
    Object.defineProperty(run, 'rng', { value: new RS.Rng(run.rngS), enumerable: false, writable: true, configurable: true });
    return run;
  };

  RS.newRun = function (seed) {
    seed = seed == null ? RS.randomSeed() : seed >>> 0;
    const classLv = {};
    const clsDmg = {};
    for (const c of RS.CLASSES) {
      classLv[c] = 0;
      clsDmg[c] = 0;
    }
    const run = {
      v: 1, seed, rngS: seed | 0,
      act: 1, floor: 0, lane: -1, nodeType: null, map: null,
      life: BAL.startLife, maxLife: BAL.startLife, gold: BAL.startGold,
      board: RS.newBoard(), classLv,
      augments: [], relics: [], curses: [], items: [],
      summons: 0, seenEvents: [],
      stats: { kills: 0, merges: 0, summons: 0, upgrades: 0, battles: 0, elites: 0, bosses: 0, dmg: 0, clsDmg },
      phase: 'map', pending: null,
    };
    RS.attachRng(run);
    run.map = RS.genMap(run);
    return run;
  };

  RS.saveString = function (run) {
    run.rngS = run.rng.s;
    return JSON.stringify(run);
  };
  RS.loadString = function (str) {
    const run = JSON.parse(str);
    if (!run || run.v !== 1) return null;
    return RS.attachRng(run);
  };

  // ── 맵 ──
  const TYPE_W = {
    2: [['combat', 70], ['event', 30]],
    3: [['combat', 40], ['event', 25], ['elite', 15], ['shop', 20]],
    5: [['combat', 35], ['event', 20], ['elite', 30], ['shop', 15]],
  };

  RS.NODE_INFO = {
    combat: { name: '전투', icon: 'n_combat' },
    elite: { name: '엘리트', icon: 'n_elite' },
    event: { name: '이벤트', icon: 'n_event' },
    shop: { name: '상점', icon: 'n_shop' },
    rest: { name: '휴식처', icon: 'n_rest' },
    treasure: { name: '보물', icon: 'n_treasure' },
    boss: { name: '보스', icon: 'n_boss' },
  };

  RS.genMap = function (run) {
    const rng = run.rng;
    const floors = [];
    for (let f = 1; f <= 7; f++) {
      const row = [];
      for (let lane = 0; lane < 3; lane++) {
        let type;
        if (f === 7) type = lane === 1 ? 'boss' : null;
        else if (f === 1) type = 'combat';
        else if (f === 4) type = 'treasure';
        else if (f === 6) type = 'rest';
        else type = rng.weighted(TYPE_W[f], (p) => p[1])[0];
        row.push(type ? { type, next: [], visited: false } : null);
      }
      // 2·3·5층은 가끔 한 칸을 비워 길 모양을 바꾼다
      if ((f === 2 || f === 3 || f === 5) && rng.chance(0.35)) row[rng.int(3)] = null;
      floors.push(row);
    }
    // 막마다 상점 최소 1개
    let hasShop = false;
    for (const row of floors) for (const n of row) if (n && n.type === 'shop') hasShop = true;
    if (!hasShop) {
      const cands = [];
      for (const f of [2, 4]) for (const n of floors[f]) if (n && (n.type === 'combat' || n.type === 'event')) cands.push(n);
      if (cands.length) rng.pick(cands).type = 'shop';
    }
    for (let f = 1; f <= 6; f++) {
      const row = floors[f - 1];
      const nextRow = floors[f];
      for (let lane = 0; lane < 3; lane++) {
        const node = row[lane];
        if (!node) continue;
        if (f === 6) {
          node.next = [1];
          continue;
        }
        const cands = [lane - 1, lane, lane + 1].filter((l) => l >= 0 && l < 3 && nextRow[l]);
        rng.shuffle(cands);
        const k = Math.min(cands.length, rng.chance(0.55) ? 2 : 1);
        node.next = cands.slice(0, k).sort((a, b) => a - b);
      }
      if (f === 6) continue;
      for (let l = 0; l < 3; l++) {
        if (!nextRow[l]) continue;
        if (row.some((n) => n && n.next.indexOf(l) >= 0)) continue;
        let best = -1;
        for (let p = 0; p < 3; p++) {
          if (row[p] && (best < 0 || Math.abs(p - l) < Math.abs(best - l))) best = p;
        }
        if (best >= 0) {
          row[best].next.push(l);
          row[best].next.sort((a, b) => a - b);
        }
      }
    }
    return { floors };
  };

  RS.nextChoices = function (run) {
    const floors = run.map.floors;
    const out = [];
    if (run.floor === 0) {
      floors[0].forEach((n, l) => {
        if (n) out.push({ f: 1, lane: l });
      });
      return out;
    }
    const node = floors[run.floor - 1][run.lane];
    for (const l of node.next) out.push({ f: run.floor + 1, lane: l });
    return out;
  };

  RS.enterNode = function (run, f, lane) {
    const node = run.map.floors[f - 1][lane];
    node.visited = true;
    run.floor = f;
    run.lane = lane;
    run.nodeType = node.type;
    const rng = run.rng;
    switch (node.type) {
      case 'combat':
      case 'elite':
      case 'boss':
        run.phase = 'battle';
        run.pending = { stage: RS.makeStage(run, node.type, rng) };
        break;
      case 'event':
        run.phase = 'event';
        run.pending = { event: RS.pickEvent(run), result: null };
        break;
      case 'shop':
        run.phase = 'shop';
        run.pending = { shop: RS.genShop(run) };
        break;
      case 'rest':
        run.phase = 'rest';
        run.pending = {};
        break;
      case 'treasure': {
        const ids = RS.rollRelics(run, 1, [1, 2], [65, 35]);
        run.phase = 'treasure';
        run.pending = { relic: ids[0] || null, opened: false };
        break;
      }
    }
  };

  // ── 보상 ──
  const AUG_W = [null, [0, 70, 27, 3], [0, 58, 35, 7], [0, 48, 40, 12]];

  RS.rollAugments = function (run, n, rarityW, exclude) {
    const rng = run.rng;
    const owned = {};
    for (const id of run.augments) owned[id] = true;
    const taken = {};
    if (exclude) for (const id of exclude) taken[id] = true;
    const avail = RS.AUGMENTS.filter((a) => !(a.unique && owned[a.id]));
    const out = [];
    for (let k = 0; k < n; k++) {
      const rar = rng.weighted([1, 2, 3], (r) => rarityW[r]);
      let pool = avail.filter((a) => a.rarity === rar && !taken[a.id]);
      if (!pool.length) pool = avail.filter((a) => !taken[a.id]);
      if (!pool.length) break;
      const a = rng.pick(pool);
      taken[a.id] = true;
      out.push(a.id);
    }
    return out;
  };

  RS.rollRelics = function (run, n, rarities, weights) {
    const rng = run.rng;
    const owned = {};
    for (const id of run.relics) owned[id] = true;
    const out = [];
    for (let k = 0; k < n; k++) {
      const pools = rarities.map((r) => RS.RELICS.filter((x) => x.rarity === r && !owned[x.id] && out.indexOf(x.id) < 0));
      const idx = rng.weighted([0, 1, 2].slice(0, rarities.length), (i) => (pools[i].length ? weights[i] : 0));
      const pool = pools[idx].length ? pools[idx] : [].concat(...pools);
      if (!pool.length) break;
      out.push(rng.pick(pool).id);
    }
    return out;
  };

  RS.grantRandomRelic = function (run, rarities) {
    const ids = RS.rollRelics(run, 1, rarities, rarities.map(() => 1));
    if (!ids.length) return null;
    RS.addRelic(run, ids[0]);
    return ids[0];
  };

  RS.finishBattle = function (run, battle) {
    const st = battle.stats;
    run.stats.battles++;
    run.stats.kills += st.kills;
    run.stats.dmg += st.dmg;
    for (const c of RS.CLASSES) run.stats.clsDmg[c] += st.clsDmg[c];
    if (battle.result !== 'won') {
      run.phase = 'over';
      run.pending = { reason: battle.reason };
      return;
    }
    const M = RS.collectMods(run);
    const type = run.nodeType;
    const act = run.act;
    const gold = BAL.clearGold[type][act] * (1 + M.combatGoldPct);
    RS.addGold(run, gold);
    if (M.winHeal) RS.heal(run, M.winHeal);
    if (type === 'elite') run.stats.elites++;
    if (type === 'boss') run.stats.bosses++;
    const w = type === 'boss' ? [0, 0, 0, 1] : type === 'elite' ? [0, 15, 60, 25] : AUG_W[act];
    const reward = {
      gold: Math.round(gold),
      heal: M.winHeal,
      aug: RS.rollAugments(run, 3 + M.augChoices, w),
      augW: w,
      augDone: false,
      rerolls: M.augRerolls,
      relics: null,
      relicDone: false,
    };
    if (type === 'elite') reward.relics = RS.rollRelics(run, 2, [1, 2], [70, 30]);
    if (type === 'boss') reward.relics = RS.rollRelics(run, 3, [2, 3], [50, 50]);
    run.phase = 'reward';
    run.pending = { reward };
  };

  RS.rewardPickAug = function (run, id) {
    const r = run.pending.reward;
    if (r.augDone) return;
    RS.pickAugment(run, id);
    r.augDone = true;
  };
  RS.rewardSkipAug = function (run) {
    const r = run.pending.reward;
    if (r.augDone) return 0;
    const g = BAL.skipGold[run.act];
    RS.addGold(run, g);
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
    if (id) RS.addRelic(run, id);
    r.relicDone = true;
  };
  RS.rewardComplete = function (run) {
    const r = run.pending && run.pending.reward;
    return !!r && r.augDone && (!r.relics || !r.relics.length || r.relicDone);
  };

  // 노드를 마치고 다음으로
  RS.advance = function (run) {
    if (run.nodeType === 'boss') {
      if (run.act >= 3) {
        run.phase = 'victory';
        run.pending = null;
        return;
      }
      run.act++;
      run.floor = 0;
      run.lane = -1;
      run.map = RS.genMap(run);
      RS.heal(run, Math.ceil(run.maxLife * BAL.actHealPct));
      run.phase = 'actStart';
      run.pending = null;
      return;
    }
    run.phase = 'map';
    run.pending = null;
  };

  // ── 이벤트 ──
  RS.pickEvent = function (run) {
    let pool = RS.EVENTS.filter((e) => run.seenEvents.indexOf(e.id) < 0);
    if (!pool.length) pool = RS.EVENTS;
    const e = run.rng.pick(pool);
    run.seenEvents.push(e.id);
    return e.id;
  };

  RS.optionDesc = function (run, opt) {
    return typeof opt.desc === 'function' ? opt.desc(run) : opt.desc;
  };
  RS.optionEnabled = function (run, opt) {
    return !opt.cond || opt.cond(run);
  };

  RS.eventChoose = function (run, idx) {
    const ev = RS.EVENT[run.pending.event];
    const opt = ev.options[idx];
    if (!opt || !RS.optionEnabled(run, opt) || run.pending.result) return null;
    let res = opt.apply(run, run.rng);
    if (typeof res === 'string') res = { text: res };
    run.pending.result = res;
    if (res.augRarity) {
      const w = [0, 0, 0, 0];
      w[res.augRarity] = 1;
      run.pending.aug = RS.rollAugments(run, 3, w);
    }
    return res;
  };

  // ── 상점 ──
  const PRICE_MUL = [0, 1, 1.35, 1.7];

  RS.genShop = function (run) {
    const rng = run.rng;
    const mul = PRICE_MUL[run.act];
    const list = [];
    for (const id of RS.rollRelics(run, 2, [1, 2], [65, 35])) {
      list.push({ kind: 'relic', id, price: Math.round((RS.REL[id].rarity === 2 ? 190 : 130) * mul), sold: false });
    }
    for (let k = 0; k < 3; k++) {
      list.push({ kind: 'item', id: RS.randomItemId(rng), price: Math.round((45 + rng.int(26)) * mul), sold: false });
    }
    const aug = RS.rollAugments(run, 1, [0, 0, 1, 0]);
    if (aug.length) list.push({ kind: 'aug', id: aug[0], price: Math.round(110 * mul), sold: false });
    if (run.curses.length) list.push({ kind: 'curse', id: run.curses[0], price: Math.round(80 * mul), sold: false });
    return { list };
  };

  RS.shopBuy = function (run, idx) {
    const it = run.pending.shop.list[idx];
    if (!it || it.sold) return { err: 'sold' };
    if (run.gold < it.price) return { err: 'gold' };
    if (it.kind === 'item' && run.items.length >= RS.itemSlots(run)) return { err: 'full' };
    if (it.kind === 'curse' && run.curses.indexOf(it.id) < 0) return { err: 'sold' };
    RS.addGold(run, -it.price);
    it.sold = true;
    if (it.kind === 'relic') RS.addRelic(run, it.id);
    else if (it.kind === 'item') RS.addItem(run, it.id);
    else if (it.kind === 'aug') RS.pickAugment(run, it.id);
    else if (it.kind === 'curse') run.curses.splice(run.curses.indexOf(it.id), 1);
    return { ok: true };
  };

  // ── 휴식처 ──
  RS.restHealAmount = (run) => Math.ceil(run.maxLife * BAL.restHealPct);
  RS.restTrainAmount = (run) => BAL.trainLevels + RS.collectMods(run).restTrainBonus;
  RS.restHeal = function (run) {
    RS.heal(run, RS.restHealAmount(run));
  };
  RS.restTrain = function (run, cls) {
    run.classLv[cls] += RS.restTrainAmount(run);
  };
})((globalThis.RS = globalThis.RS || {}));
