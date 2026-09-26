#!/usr/bin/env node
// 밸런스 시뮬레이터: 봇이 게임 로직을 그대로 돌려 여러 판을 플레이한다.
//   node tools/sim.js [판수=200] [봇=smart|random] [--seed=N] [--set key=value ...]
// 예) node tools/sim.js 300 smart --set hpGrowth=1.09
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', 'game', 'src');
const FILES = [
  'core/rng.js', 'data/units.js', 'data/content.js', 'data/events.js',
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
};

function makeBot(RS, kind, rng) {
  const random = kind === 'random';
  return {
    pickAug(run, ids) {
      if (random) return rng.pick(ids);
      let best = ids[0];
      for (const id of ids) if ((AUG_SCORE[id] || 3) > (AUG_SCORE[best] || 3)) best = id;
      return best;
    },
    pickRelic(run, ids) {
      return random ? rng.pick(ids) : ids[0];
    },
    pickNode(run, choices) {
      if (random) return rng.pick(choices);
      const low = run.life < run.maxLife * 0.45;
      const score = (c) => {
        const t = run.map.floors[c.f - 1][c.lane].type;
        if (t === 'elite') return low ? 0 : 3;
        if (t === 'shop') return run.gold > 150 ? 4 : 1;
        if (t === 'event') return 2;
        if (t === 'combat') return low ? 1 : 2.5;
        return 2;
      };
      let best = choices[0];
      for (const c of choices) if (score(c) > score(best)) best = c;
      return best;
    },
    eventOption(run, ev) {
      const opts = ev.options.map((o, i) => i).filter((i) => RS.optionEnabled(run, ev.options[i]));
      return random ? rng.pick(opts) : opts[0];
    },
    // 전투 중 조작 (0.25초마다)
    act(b) {
      const run = b.run;
      let i;
      while ((i = RS.firstMergeable(run.board)) >= 0) {
        const pick = b.M.mergeChoose ? b.mergeOptions()[0] : undefined;
        b.merge(i, pick);
      }
      // 아이템
      if (run.items.length) {
        const danger = b.enemies.length > b.cap * 0.6 || run.life <= 4 || (b.boss && b.bossTimer < 15);
        if (danger) {
          const idx = run.items.findIndex((id) => id === 'bomb' || id === 'freeze' || id === 'rage');
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
        const cost = RS.summonCost(run, b.M);
        if (run.gold >= cost && RS.hasEmptySlot(run.board)) {
          b.summon();
          continue;
        }
        if (!RS.hasEmptySlot(run.board) || (!random && cost > 40 && run.gold > cost)) {
          const cls = RS.mostCommonClass(run);
          if (run.gold >= RS.upgradeCost(run, cls, b.M) && run.gold >= cost) {
            b.upgrade(cls);
            continue;
          }
        }
        break;
      }
      if (!random && b.t % 5 < 0.25) b.arrange();
    },
  };
}

function playRun(RS, seed, kind) {
  const run = RS.newRun(seed);
  const bot = makeBot(RS, kind, new RS.Rng(seed ^ 0x9e3779b9));
  const log = { battles: [], death: null };
  let steps = 0;
  while (steps++ < 200) {
    switch (run.phase) {
      case 'map': {
        const ch = RS.nextChoices(run);
        const c = bot.pickNode(run, ch);
        RS.enterNode(run, c.f, c.lane);
        break;
      }
      case 'battle': {
        const b = new RS.Battle(run, run.pending.stage, { headless: true });
        const dt = 1 / 30;
        let acc = 0;
        while (b.status === 'running' && b.t < 600) {
          b.update(dt);
          acc += dt;
          if (acc >= 0.25) {
            acc = 0;
            bot.act(b);
          }
        }
        log.battles.push({ act: run.act, floor: run.floor, type: run.nodeType, won: b.result === 'won', t: Math.round(b.t), life: run.life, lost: b.stats.lifeStart - run.life, dps: Math.round(b.totalDps()), gold: Math.round(run.gold) });
        RS.finishBattle(run, b);
        if (run.phase === 'over') log.death = { act: run.act, floor: run.floor, type: run.nodeType, reason: b.reason };
        break;
      }
      case 'reward': {
        const r = run.pending.reward;
        if (!r.augDone) RS.rewardPickAug(run, bot.pickAug(run, r.aug));
        if (r.relics && r.relics.length && !r.relicDone) RS.rewardPickRelic(run, bot.pickRelic(run, r.relics));
        RS.advance(run);
        break;
      }
      case 'event': {
        const ev = RS.EVENT[run.pending.event];
        RS.eventChoose(run, bot.eventOption(run, ev));
        if (run.pending.aug && run.pending.aug.length) RS.pickAugment(run, bot.pickAug(run, run.pending.aug));
        RS.advance(run);
        break;
      }
      case 'shop': {
        const list = run.pending.shop.list;
        list.forEach((it, i) => {
          if ((it.kind === 'relic' || it.kind === 'curse') && run.gold >= it.price + 30) RS.shopBuy(run, i);
        });
        RS.advance(run);
        break;
      }
      case 'rest':
        if (run.life < run.maxLife * 0.6) RS.restHeal(run);
        else RS.restTrain(run, RS.mostCommonClass(run));
        RS.advance(run);
        break;
      case 'treasure':
        if (run.pending.relic) RS.addRelic(run, run.pending.relic);
        RS.advance(run);
        break;
      case 'actStart':
        run.phase = 'map';
        break;
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
  const seedArg = args.find((a) => a.startsWith('--seed='));
  const base = seedArg ? parseInt(seedArg.slice(7), 10) : 1000;
  const RS = loadRS();
  const setIdx = args.indexOf('--set');
  if (setIdx >= 0) {
    for (const kv of args.slice(setIdx + 1)) {
      const [k, v] = kv.split('=');
      RS.BAL[k] = JSON.parse(v);
    }
  }
  const t0 = Date.now();
  let wins = 0;
  const reach = {};
  const deaths = {};
  const byStage = {};
  const lifeAtBoss = { 1: [], 2: [], 3: [] };
  const dpsAt = {};
  const bTimes = [];
  const lossBy = {};
  const clsDmg = {};
  const clsDmgLate = {};
  for (let k = 0; k < n; k++) {
    const { run, log, won } = playRun(RS, base + k, kind);
    if (won) wins++;
    for (const c of RS.CLASSES) clsDmg[c] = (clsDmg[c] || 0) + run.stats.clsDmg[c] / Math.max(1, run.stats.dmg);
    if (run.act >= 3) for (const c of RS.CLASSES) clsDmgLate[c] = (clsDmgLate[c] || 0) + run.stats.clsDmg[c] / Math.max(1, run.stats.dmg);
    const key = won ? 'WIN' : `A${log.death ? log.death.act : run.act}`;
    reach[key] = (reach[key] || 0) + 1;
    if (log.death) {
      const dk = `A${log.death.act}F${log.death.floor} ${log.death.type} (${log.death.reason})`;
      deaths[dk] = (deaths[dk] || 0) + 1;
    }
    for (const b of log.battles) {
      const sk = `A${b.act}F${b.floor}`;
      const s = byStage[sk] || (byStage[sk] = { n: 0, won: 0, life: 0 });
      s.n++;
      if (b.won) s.won++;
      s.life += b.life;
      if (b.type === 'boss') lifeAtBoss[b.act].push(b.life);
      (dpsAt[sk] = dpsAt[sk] || []).push(b.dps);
      bTimes.push(b.t);
      const lk = `A${b.act} ${b.type}`;
      const l = lossBy[lk] || (lossBy[lk] = { n: 0, sum: 0, t: 0 });
      l.n++;
      l.sum += b.lost;
      l.t += b.t;
    }
  }
  const pct = (x) => ((100 * x) / n).toFixed(1) + '%';
  console.log(`bot=${kind} runs=${n} time=${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`승률 ${pct(wins)}`);
  console.log('도달(사망 막 / WIN):', Object.entries(reach).sort().map(([k, v]) => `${k} ${pct(v)}`).join(' | '));
  console.log('스테이지별 (전투 수, 승률, 평균 생명, 중앙 DPS):');
  for (const sk of Object.keys(byStage).sort((a, b) => {
    const pa = a.match(/A(\d)F(\d)/);
    const pb = b.match(/A(\d)F(\d)/);
    return pa[1] - pb[1] || pa[2] - pb[2];
  })) {
    const s = byStage[sk];
    const d = dpsAt[sk].sort((x, y) => x - y);
    console.log(`  ${sk}: ${s.n}회 승 ${((100 * s.won) / s.n).toFixed(0)}% 생명 ${(s.life / s.n).toFixed(1)} DPS ${d[d.length >> 1]}`);
  }
  for (const a of [1, 2, 3]) {
    const l = lifeAtBoss[a];
    if (l.length) console.log(`  보스${a} 후 평균 생명 ${(l.reduce((x, y) => x + y, 0) / l.length).toFixed(1)} (${l.length}회)`);
  }
  bTimes.sort((x, y) => x - y);
  console.log(`전투 시간 중앙값 ${bTimes[bTimes.length >> 1]}초`);
  console.log('유형별 평균 생명 손실 / 평균 전투 시간:');
  for (const k of Object.keys(lossBy).sort()) console.log(`  ${k}: -${(lossBy[k].sum / lossBy[k].n).toFixed(1)} / ${(lossBy[k].t / lossBy[k].n).toFixed(0)}초 (${lossBy[k].n})`);
  const share = (m) => RS.CLASSES.map((c) => `${RS.CLASS[c].name} ${((100 * m[c]) / RS.CLASSES.reduce((x, k) => x + (m[k] || 0), 0)).toFixed(0)}%`).join(' | ');
  console.log('클래스 피해 비중(전체):', share(clsDmg));
  if (Object.keys(clsDmgLate).length) console.log('클래스 피해 비중(3막 도달):', share(clsDmgLate));
  console.log('주요 사망 지점:');
  Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

if (require.main === module) main();
module.exports = { loadRS, playRun };
