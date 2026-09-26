#!/usr/bin/env node
// 밸런스 시뮬레이터: 봇이 게임 로직을 그대로 돌려 여러 판을 플레이한다.
//   node tools/sim.js [판수=200] [봇=smart|random] [--seed=N] [--cmd=leon|all] [--asc=N] [--keys] [--set key=value ...]
// 예) node tools/sim.js 300 smart --cmd=all
//     node tools/sim.js 200 smart --keys --asc=5
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'game', 'src');
const FILES = [
  'core/rng.js', 'data/units.js', 'data/content.js', 'data/relics.js', 'data/ancients.js', 'data/meta.js', 'data/events.js',
  'core/stats.js', 'core/board.js', 'core/stage.js', 'core/battle.js', 'core/run.js',
];

function loadRS() {
  const ctx = { console, Math, JSON, Object, Array, Float32Array };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  return ctx.RS;
}

// ── 봇 ──
const AUG_SCORE = {
  sharp: 6, quick: 6, bloodPact: 8, glassCannon: 7, lastStand: 7, overdrive: 7, critMaster: 6,
  legendAura: 7, berserk: 5, timeWarp: 8, mud: 6, luckyMerge: 7, twinSummon: 8, diversity: 6,
  shrapnel: 6, giantSlayer: 5, bounty: 5, midas: 6, greed: 5, compound: 5, piggy: 4, discount: 5,
  massProduction: 5, luckySummon: 5, recycle: 5, promotion: 5, recruits: 4, goldRush: 3,
  eagle: 4, archmage: 6, drillKnight: 4, drillArcher: 4, drillMage: 4, drillRogue: 4, drillFrost: 3,
  wall: 3, firstStrike: 4, hastyWaves: 4, rich: 4, eliteSquad: 2, purity: 2, gamble: 4,
  vampRite: 3, smithDiscount: 3,
  demonForm: 8, echoForm: 6, apotheosis: 6, wraithForm: 6, corruption: 7, creativeAI: 5,
  noxious: 6, poisonBlade: 4, offering: 5, limitBreak: 5,
};
const ANC_SCORE = {
  bloodCrown: 8, spikedGauntlet: 8, whisperEarring: 7, twinStar: 7, luckyStar: 7, legend: 7, epic2: 7,
  prism2: 6, trainAll2: 6, dragonScale: 6, stoppedClock: 6, pumpkinCandle: 6, waxToys: 6, bossRelic: 6,
  rewindSand: 5, forgottenShelf: 5, forbiddenIndex: 5, upgrade2: 5, runes2: 5, gold400: 5, goldenEgg: 5,
  sealOfGold: 5, warHammerA: 5, bloodPactCup: 5, lordParasol: 4, loomingFruit: 4, maxLife15: 4, cleanse: 3,
};

function makeBot(RS, kind, rng, opts) {
  const random = kind === 'random';
  const keys = !!opts.keys;
  const augScore = (id) => (RS.isUpgraded(id) ? 1 : 0) + (AUG_SCORE[RS.augDef(id).id] || (RS.augDef(id).custom ? 5 : 3));
  const best = (list, score) => {
    let b = list[0];
    for (const x of list) if (score(x) > score(b)) b = x;
    return b;
  };
  const bot = {
    pickAug(run, ids) {
      return random ? rng.pick(ids) : best(ids, augScore);
    },
    pickRelic(run, ids) {
      return random ? rng.pick(ids) : ids[0];
    },
    pickNode(run, choices) {
      if (random) return rng.pick(choices);
      const low = run.life < run.maxLife * 0.45;
      const score = (c) => {
        const n = run.map.floors[c.f - 1][c.lane];
        const t = n.type;
        if (t === 'elite') return low ? 0 : n.burning && keys && !run.keys.emerald ? 5 : 3;
        if (t === 'shop') return run.gold > 150 ? 4 : 1;
        if (t === 'unknown') return 2.2;
        if (t === 'rest') return low ? 4 : 2;
        if (t === 'combat') return low ? 1 : 2.5;
        return 2;
      };
      return best(choices, score);
    },
    neow(run, list) {
      if (random) return rng.pick(list);
      // 대가가 가벼운 큰 축복 > 중간 축복
      const big = list.find((b) => b.kind === 'big');
      if (big && (big.cost === 'curse' || big.cost === 'loseMax' || big.cost === 'tax')) return big;
      return list.find((b) => b.kind === 'mid');
    },
    ancient(run, boons) {
      if (random) return rng.pick(boons);
      return best(boons, (b) => (b === 'cleanse' && run.curses.length ? 6 : ANC_SCORE[b] || 4));
    },
    eventOption(run, opts) {
      const ok = opts.map((o, i) => i).filter((i) => RS.optionEnabled(run, opts[i]));
      return random ? rng.pick(ok) : ok[0];
    },
    rest(run) {
      const opts = RS.restOptions(run).filter((o) => !o.off);
      if (random) return rng.pick(opts);
      const has = (id) => opts.find((o) => o.id === id);
      if (keys && has('recall') && run.life > run.maxLife * 0.7) return has('recall');
      if (has('heal') && run.life < run.maxLife * 0.55) return has('heal');
      for (const id of ['hatch', 'dig', 'lift', 'clone']) if (has(id)) return has(id);
      const candle = run.relicState.pumpkinCandle;
      if (candle && candle.charges === 0 && has('kindle')) return has('kindle');
      if (has('smith') && run.augments.some((id) => RS.canUpgradeAug(id) && augScore(id) >= 7)) return has('smith');
      return has('train') || has('heal') || opts[0];
    },
    // 선택 대기열 한 칸 처리
    handle(run, item) {
      switch (item.k) {
        case 'aug':
        case 'augList': {
          let ids = item.ids || RS.rollAugments(run, item.n || RS.augChoiceCount(run), item.w);
          for (let k = 0; k < (item.left || 1) && ids.length; k++) {
            const id = bot.pickAug(run, ids);
            RS.pickAugment(run, id);
            ids = ids.filter((x) => x !== id);
          }
          break;
        }
        case 'relicList':
          if (item.ids.length) RS.addRelic(run, bot.pickRelic(run, item.ids));
          break;
        case 'remove': {
          const ci = run.curses.findIndex((id) => !RS.CURSE[id].permanent);
          if (ci >= 0) run.curses.splice(ci, 1);
          else if (run.augments.length) {
            let wi = 0;
            run.augments.forEach((id, i) => { if (augScore(id) < augScore(run.augments[wi])) wi = i; });
            RS.removeAug(run, wi);
          }
          break;
        }
        case 'upgrade': {
          const idx = run.augments.map((id, i) => i).filter((i) => RS.canUpgradeAug(run.augments[i]));
          if (idx.length) RS.upgradeAug(run, random ? rng.pick(idx) : best(idx, (i) => augScore(run.augments[i])));
          break;
        }
        case 'transform': {
          const idx = run.augments.map((id, i) => i).filter((i) => !RS.augDef(run.augments[i]).onPick);
          if (idx.length) RS.transformAug(run, random ? rng.pick(idx) : best(idx, (i) => -augScore(run.augments[i])));
          break;
        }
        case 'runeChoice':
        case 'rune': {
          const rune = item.rune || item.runes[0];
          const free = [];
          for (let i = 0; i < run.board.length; i++) if (!run.runes[i] || RS.RUNE[run.runes[i]].bad) free.push(i);
          if (!free.length) break;
          // 가장 좋은 유닛이 선 칸, 없으면 안쪽 칸
          const slot = random ? rng.pick(free) : best(free, (i) => (run.board[i] ? run.board[i].tier * 10 + run.board[i].n : RS.isInner(i) ? 1 : 0));
          RS.setRune(run, slot, rune);
          break;
        }
        case 'unit': {
          const maxTier = item.maxTier == null ? 3 : item.maxTier;
          const slots = [];
          for (let i = 0; i < run.board.length; i++) if (run.board[i] && run.board[i].tier <= maxTier) slots.push(i);
          if (!slots.length) break;
          if (item.op === 'dup') {
            const i = best(slots, (k) => run.board[k].tier);
            RS.addUnit(run.board, run.board[i].cls, run.board[i].tier, i);
          } else if (item.op === 'sacrifice') {
            RS.sacrificeUnit(run, best(slots, (k) => (run.board[k].tier === 2 ? 10 : -run.board[k].tier)));
          }
          break;
        }
      }
    },
    shop(run) {
      const shop = run.pending.shop;
      const want = (it) => {
        if (it.sold || run.gold < it.price) return false;
        if (random) return rng.chance(0.3);
        if (it.kind === 'remove') return run.curses.some((id) => !RS.CURSE[id].permanent);
        if (it.kind === 'relic') return run.gold >= it.price + 30;
        if (it.kind === 'aug') return AUG_SCORE[it.id] >= 6 && run.gold >= it.price + 40;
        if (it.kind === 'item') return run.gold >= it.price + 150;
        if (it.kind === 'unit') return it.tier === 2 && run.gold >= it.price + 60;
        if (it.kind === 'rune') return run.gold >= it.price + 80;
        return false;
      };
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < shop.list.length; i++) {
          if (!want(shop.list[i])) continue;
          const r = RS.shopBuy(run, i);
          if (r.ok) {
            while (run.queue.length) {
              bot.handle(run, run.queue[0]);
              run.queue.shift();
            }
          }
        }
      }
    },
    // 전투 중 조작 (0.25초마다)
    act(b) {
      const run = b.run;
      let i;
      while ((i = RS.firstMergeable(run.board)) >= 0) {
        const pick = b.M.mergeChoose ? b.mergeOptions()[0] : undefined;
        if (!b.merge(i, pick)) break;
      }
      const danger = b.enemies.length > b.cap * 0.6 || run.life <= 4 || (b.boss && b.bossTimer < 15);
      if (b.canStarfall() && (danger || b.boss || b.stars >= 5)) b.starfall();
      if (run.items.length) {
        if (danger) {
          const idx = run.items.findIndex((id) => id === 'bomb' || id === 'freeze' || id === 'rage' || id === 'ghostly');
          if (idx >= 0) b.useItem(idx);
        }
        const heal = run.items.indexOf('potion');
        if (heal >= 0 && run.life <= run.maxLife - 6) b.useItem(heal);
        const other = run.items.findIndex((id) => id === 'goldScroll' || id === 'summonScroll' || id === 'anvilScroll');
        if (other >= 0) b.useItem(other);
      }
      // 소환 우선, 자리가 없으면 강화
      let guard = 0;
      while (guard++ < 20) {
        const cost = b.summonCost();
        if (run.gold >= cost && RS.hasEmptySlot(run.board) && b.summonLimit() > 0) {
          if (b.summon().err) break;
          continue;
        }
        if (!RS.hasEmptySlot(run.board) || b.summonLimit() <= 0 || (!random && cost > 40 && run.gold > cost)) {
          const cls = RS.mostCommonClass(run);
          if (run.gold >= b.upgradeCost(cls) && run.gold >= Math.min(cost, 200)) {
            if (b.upgrade(cls).err) break;
            continue;
          }
        }
        break;
      }
      if (!random && b.t % 5 < 0.25) b.arrange();
    },
  };
  return bot;
}

function playRun(RS, seed, kind, opts) {
  opts = opts || {};
  const run = RS.newRun(seed, { commander: opts.commander, asc: opts.asc || 0 });
  const bot = makeBot(RS, kind, new RS.Rng(seed ^ 0x9e3779b9), opts);
  const log = { battles: [], death: null, events: 0, ancients: [] };
  let steps = 0;
  while (steps++ < 400) {
    switch (run.phase) {
      case 'neow':
        RS.applyBlessing(run, bot.neow(run, run.pending.blessings));
        run.phase = 'map';
        run.pending = null;
        RS.flushQueue(run);
        break;
      case 'map': {
        const c = bot.pickNode(run, RS.nextChoices(run));
        RS.enterNode(run, c.f, c.lane);
        break;
      }
      case 'battle': {
        const b = new RS.Battle(run, run.pending.stage, { headless: true });
        const dt = 1 / 30;
        let acc = 0;
        while (b.status === 'running' && b.t < 900) {
          b.update(dt);
          acc += dt;
          if (acc >= 0.25) {
            acc = 0;
            bot.act(b);
          }
        }
        if (b.status === 'running') b.finish('lost', 'timeout');
        while (b.status === 'ending') b.update(dt);
        log.battles.push({ act: run.act, floor: run.floor, type: run.nodeType === 'eventFight' ? 'event' : run.nodeType, won: b.result === 'won', t: Math.round(b.t), life: run.life, lost: b.stats.lifeStart - run.life, dps: Math.round(b.totalDps()), gold: Math.round(run.gold) });
        RS.finishBattle(run, b);
        if (run.phase === 'over') log.death = { act: run.act, floor: run.floor, type: run.nodeType, reason: b.reason };
        break;
      }
      case 'reward': {
        const r = run.pending.reward;
        if (!r.augDone) {
          if (r.aug && r.aug.length) RS.rewardPickAug(run, bot.pickAug(run, r.aug));
          else RS.rewardSkipAug(run);
        }
        if (r.relics && r.relics.length && !r.relicDone) RS.rewardPickRelic(run, bot.pickRelic(run, r.relics));
        r.relicDone = true;
        RS.advance(run);
        break;
      }
      case 'choice':
        bot.handle(run, run.queue[0]);
        RS.popQueue(run);
        break;
      case 'event': {
        log.events++;
        let guard = 0;
        while (!run.pending.result && guard++ < 12) {
          const list = RS.eventOptions(run);
          const idx = guard > 8 ? list.length - 1 : bot.eventOption(run, list);
          if (idx == null || RS.eventChoose(run, idx) === null) break;
        }
        if (run.pending.fight) RS.startEventFight(run);
        else RS.advance(run);
        break;
      }
      case 'shop':
        bot.shop(run);
        RS.advance(run);
        break;
      case 'rest': {
        const o = bot.rest(run);
        if (o) RS.restDo(run, o.id, o.id === 'train' ? RS.mostCommonClass(run) : undefined);
        RS.advance(run);
        break;
      }
      case 'treasure':
        RS.openChest(run, !!opts.keys && run.act <= 3 && !run.keys.sapphire);
        RS.advance(run);
        break;
      case 'actStart': {
        const anc = run.pending && run.pending.ancient;
        if (anc && !anc.done) {
          const id = bot.ancient(run, anc.boons);
          log.ancients.push(id);
          RS.applyAncient(run, id);
          anc.done = true;
        }
        run.phase = 'map';
        run.pending = null;
        RS.flushQueue(run);
        break;
      }
      case 'over':
      case 'victory':
        return { run, log, won: run.phase === 'victory' };
    }
  }
  return { run, log, won: false };
}

function main() {
  const args = process.argv.slice(2);
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) || '200', 10);
  const kind = args.find((a) => a === 'smart' || a === 'random') || 'smart';
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const base = arg('seed') ? parseInt(arg('seed'), 10) : 1000;
  const cmdArg = arg('cmd') || 'leon';
  const asc = parseInt(arg('asc') || '0', 10);
  const keys = args.indexOf('--keys') >= 0;
  const RS = loadRS();
  const setIdx = args.indexOf('--set');
  if (setIdx >= 0) {
    for (const kv of args.slice(setIdx + 1)) {
      const [k, v] = kv.split('=');
      RS.BAL[k] = JSON.parse(v);
    }
  }
  const cmds = cmdArg === 'all' ? RS.COMMANDERS.map((c) => c.id) : [cmdArg];
  const t0 = Date.now();
  let wins = 0;
  let act4 = 0;
  let act4win = 0;
  const reach = {};
  const deaths = {};
  const byStage = {};
  const lifeAtBoss = { 1: [], 2: [], 3: [], 4: [] };
  const dpsAt = {};
  const bTimes = [];
  const lossBy = {};
  const clsDmg = {};
  const byCmd = {};
  const events = [];
  for (let k = 0; k < n; k++) {
    const commander = cmds[k % cmds.length];
    const { run, log, won } = playRun(RS, base + k, kind, { commander, asc, keys });
    if (won) wins++;
    if (run.act === 4) {
      act4++;
      if (won) act4win++;
    }
    const bc = byCmd[commander] || (byCmd[commander] = { n: 0, w: 0 });
    bc.n++;
    if (won) bc.w++;
    events.push(log.events);
    for (const c of RS.CLASSES) clsDmg[c] = (clsDmg[c] || 0) + run.stats.clsDmg[c] / Math.max(1, run.stats.dmg);
    const key = won ? 'WIN' : `A${log.death ? log.death.act : run.act}`;
    reach[key] = (reach[key] || 0) + 1;
    if (log.death) {
      const dk = `A${log.death.act}F${log.death.floor} ${log.death.type} (${log.death.reason})`;
      deaths[dk] = (deaths[dk] || 0) + 1;
    }
    for (const b of log.battles) {
      const sk = `A${b.act}F${String(b.floor).padStart(2, '0')}`;
      const s = byStage[sk] || (byStage[sk] = { n: 0, won: 0, life: 0 });
      s.n++;
      if (b.won) s.won++;
      s.life += b.life;
      if (b.type === 'boss') lifeAtBoss[b.act].push(b.life);
      (dpsAt[sk] = dpsAt[sk] || []).push(b.dps);
      bTimes.push(b.t);
      const lk = `A${b.act} ${b.type}`;
      const l = lossBy[lk] || (lossBy[lk] = { n: 0, sum: 0, t: 0, won: 0 });
      l.n++;
      l.sum += b.lost;
      l.t += b.t;
      if (b.won) l.won++;
    }
  }
  const pct = (x, of) => ((100 * x) / (of || n)).toFixed(1) + '%';
  console.log(`bot=${kind} runs=${n} cmd=${cmdArg} asc=${asc}${keys ? ' keys' : ''} time=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`승률 ${pct(wins)}${act4 ? ` · 4막 도달 ${act4}회, 심장 격파 ${act4win}회` : ''}`);
  if (cmds.length > 1) console.log('지휘관별 승률:', Object.entries(byCmd).map(([c, v]) => `${RS.COMMANDER[c].name} ${pct(v.w, v.n)}`).join(' | '));
  console.log('도달(사망 막 / WIN):', Object.entries(reach).sort().map(([k, v]) => `${k} ${pct(v)}`).join(' | '));
  console.log(`이벤트 평균 ${(events.reduce((a, b) => a + b, 0) / n).toFixed(1)}회/판`);
  console.log('스테이지별 (전투 수, 승률, 평균 생명, 중앙 DPS):');
  for (const sk of Object.keys(byStage).sort()) {
    const s = byStage[sk];
    const d = dpsAt[sk].sort((x, y) => x - y);
    console.log(`  ${sk}: ${s.n}회 승 ${((100 * s.won) / s.n).toFixed(0)}% 생명 ${(s.life / s.n).toFixed(1)} DPS ${d[d.length >> 1]}`);
  }
  for (const a of [1, 2, 3, 4]) {
    const l = lifeAtBoss[a];
    if (l.length) console.log(`  보스${a} 후 평균 생명 ${(l.reduce((x, y) => x + y, 0) / l.length).toFixed(1)} (${l.length}회)`);
  }
  bTimes.sort((x, y) => x - y);
  console.log(`전투 시간 중앙값 ${bTimes[bTimes.length >> 1]}초`);
  console.log('유형별 승률 / 평균 생명 손실 / 평균 전투 시간:');
  for (const k of Object.keys(lossBy).sort()) console.log(`  ${k}: 승 ${((100 * lossBy[k].won) / lossBy[k].n).toFixed(0)}% / -${(lossBy[k].sum / lossBy[k].n).toFixed(1)} / ${(lossBy[k].t / lossBy[k].n).toFixed(0)}초 (${lossBy[k].n})`);
  const share = (m) => RS.CLASSES.map((c) => `${RS.CLASS[c].name} ${((100 * m[c]) / RS.CLASSES.reduce((x, q) => x + (m[q] || 0), 0)).toFixed(0)}%`).join(' | ');
  console.log('클래스 피해 비중:', share(clsDmg));
  console.log('주요 사망 지점:');
  Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

if (require.main === module) main();
module.exports = { loadRS, playRun };
