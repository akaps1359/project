#!/usr/bin/env node
// 밸런스 시뮬레이터: 봇이 게임 로직을 그대로 돌려 여러 판을 플레이한다.
//   node tools/sim.js [판수=200] [봇=smart|basic|random] [--bot=smart|basic|random] [--seed=N] [--cmd=bron|ella|astra|all] [--asc=N] [--keys]
//                     [--bp=이름=값 ...] [--trace] [--relic=id,id] [--set key=value ...]   (key 에 점이 있으면 RS 아래 경로: ABILITY.stance.boom=0.25)
// 봇: smart  = 가치 함수로 판단 (강화·소환 효율 비교, 이벤트·상점·휴식을 복제해 미리 굴려 봄, 길 계획)
//     basic  = 예전 smart 봇 (비교용)
//     random = 모든 선택을 무작위로
// --bp=이름=값 : smart 봇 조정값 (tools/simbot.js 의 SMART_DEFAULTS)
// --trace      : 칸 종류별 가치 변화(smart 봇의 가치 함수 기준)도 출력
// 예) node tools/sim.js 300 smart --cmd=all
//     node tools/sim.js 280 --bot=basic --cmd=all --seed=1000
//     node tools/sim.js 200 smart --keys --asc=5
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeBot, fightBattle } = require('./simbot.js');

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

// opts: { commander, asc, keys, params(smart 봇 조정값), trace }
function playRun(RS, seed, kind, opts) {
  opts = opts || {};
  const run = RS.newRun(seed, { commander: opts.commander, asc: opts.asc || 0 });
  // 실험용: 시작할 때 증강·유물을 쥐여 주는 등 (밸런스 측정 도구에서 쓴다)
  if (typeof opts.onStart === 'function') opts.onStart(run, RS);
  const bot = makeBot(RS, kind, new RS.Rng(seed ^ 0x9e3779b9), opts);
  const log = { battles: [], death: null, events: 0, ancients: [], nodes: [], shops: [], rests: [] };
  let open = null; // 추적 중인 칸 (가치 변화 측정)
  const closeNode = () => {
    if (!open) return;
    // 죽은 칸은 가치 변화 평균에서 뺀다 (사망 = -1e6)
    if (open.E && run.phase !== 'over') open.dv = open.E.value(run) - open.v0;
    open.dLife = run.life - open.life0;
    open.dGold = run.gold - open.gold0;
    open = null;
  };
  let steps = 0;
  while (steps++ < 400) {
    switch (run.phase) {
      case 'neow':
        log.neow = bot.neow(run, run.pending.blessings);
        RS.applyBlessing(run, log.neow);
        run.phase = 'map';
        run.pending = null;
        RS.flushQueue(run);
        break;
      case 'map': {
        closeNode();
        const c = bot.pickNode(run, RS.nextChoices(run));
        const node = run.map.floors[c.f - 1][c.lane];
        const rec = { act: run.act, floor: c.f, type: node.type, life0: run.life, gold0: run.gold };
        if (opts.trace && bot.evaluator && node.type !== 'boss') {
          rec.E = bot.evaluator(run);
          rec.v0 = rec.E.value(run);
        }
        RS.enterNode(run, c.f, c.lane, c.wing);
        rec.resolved = run.nodeType;
        log.nodes.push(rec);
        open = node.type === 'boss' ? null : rec;
        break;
      }
      case 'battle': {
        const b = fightBattle(RS, run, bot);
        log.battles.push({ act: run.act, floor: run.floor, type: run.nodeType === 'eventFight' ? 'event' : run.nodeType, won: b.result === 'won', t: Math.round(b.t), life: run.life, lost: b.stats.lifeStart - run.life, dps: Math.round(b.totalDps()), gold: Math.round(run.gold) });
        RS.finishBattle(run, b);
        if (bot.afterBattle) bot.afterBattle(run, b);
        if (run.phase === 'over') log.death = { act: run.act, floor: run.floor, type: run.nodeType, reason: b.reason };
        break;
      }
      case 'reward': {
        if (bot.reward) bot.reward(run);
        else {
          const r = run.pending.reward;
          if (!r.augDone) {
            if (r.aug && r.aug.length) RS.rewardPickAug(run, bot.pickAug(run, r.aug));
            else RS.rewardSkipAug(run);
          }
          if (r.relics && r.relics.length && !r.relicDone) RS.rewardPickRelic(run, bot.pickRelic(run, r.relics));
          r.relicDone = true;
        }
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
      case 'shop': {
        const g0 = run.gold;
        bot.shop(run);
        log.shops.push({ act: run.act, gold: g0, spent: g0 - run.gold });
        RS.advance(run);
        break;
      }
      case 'rest': {
        const o = bot.rest(run);
        if (o) RS.restDo(run, o.id, o.arg !== undefined ? o.arg : o.id === 'train' ? RS.mostCommonClass(run) : undefined);
        log.rests.push(o ? o.id : null);
        RS.advance(run);
        break;
      }
      case 'treasure':
        RS.openChest(run, bot.treasure ? bot.treasure(run) : !!opts.keys && run.act <= 3 && !run.keys.sapphire);
        RS.advance(run);
        break;
      case 'actStart': {
        closeNode();
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
        closeNode();
        return { run, log, won: run.phase === 'victory', bot };
    }
  }
  return { run, log, won: false, bot };
}

function main() {
  const args = process.argv.slice(2);
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) || '200', 10);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const kind = arg('bot') || args.find((a) => a === 'smart' || a === 'basic' || a === 'random') || 'smart';
  const base = arg('seed') ? parseInt(arg('seed'), 10) : 1000;
  const cmdArg = arg('cmd') || 'bron';
  const asc = parseInt(arg('asc') || '0', 10);
  const keys = args.indexOf('--keys') >= 0;
  const trace = args.indexOf('--trace') >= 0;
  const RS = loadRS();
  const setIdx = args.indexOf('--set');
  if (setIdx >= 0) {
    for (const kv of args.slice(setIdx + 1)) {
      if (kv.startsWith('--')) continue;
      const [k, v] = kv.split('=');
      // 점이 있으면 RS 아래 경로 (예: ABILITY.stance.boom=0.25), 없으면 RS.BAL
      if (k.indexOf('.') >= 0) {
        const path = k.split('.');
        let o = RS;
        for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
        o[path[path.length - 1]] = JSON.parse(v);
      } else RS.BAL[k] = JSON.parse(v);
    }
  }
  const params = {};
  for (const a of args) {
    if (!a.startsWith('--bp=')) continue;
    const kv = a.slice(5);
    const eq = kv.indexOf('=');
    params[kv.slice(0, eq)] = JSON.parse(kv.slice(eq + 1));
  }
  // --relic=a,b : 시작할 때 유물을 쥐여 준다 (유물 가치 측정용)
  const startRelics = arg('relic') ? arg('relic').split(',').filter(Boolean) : [];
  const onStart = startRelics.length ? (run, R) => { for (const id of startRelics) R.addRelic(run, id); } : null;
  const cmds = cmdArg === 'all' ? RS.COMMANDERS.map((c) => c.id) : [cmdArg];
  if (cmds.some((c) => !RS.COMMANDER[c])) {
    console.error(`알 수 없는 지휘관: ${cmdArg} (있는 것: ${RS.COMMANDERS.map((c) => c.id).join(', ')}, all)`);
    process.exit(1);
  }
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
  const extra = { upgrades: 0, summons: 0, upgRuns: 0, shopVisits: 0, shopSpend: 0, shopGold: 0, rests: {}, nodes: {}, dv: {}, skips: 0, corr: 0, corrWon: 0 };
  for (let k = 0; k < n; k++) {
    const commander = cmds[k % cmds.length];
    const { run, log, won, bot } = playRun(RS, base + k, kind, { commander, asc, keys, params, trace, onStart });
    if (won) wins++;
    if (run.act === 4) {
      act4++;
      if (won) act4win++;
    }
    const bc = byCmd[commander] || (byCmd[commander] = { n: 0, w: 0 });
    bc.n++;
    if (won) bc.w++;
    events.push(log.events);
    extra.upgrades += run.stats.upgrades;
    extra.summons += run.stats.summons;
    if (run.stats.upgrades > 0) extra.upgRuns++;
    for (const s of log.shops) {
      extra.shopVisits++;
      extra.shopSpend += s.spent;
      extra.shopGold += s.gold;
    }
    for (const r of log.rests) extra.rests[r] = (extra.rests[r] || 0) + 1;
    for (const nd of log.nodes) {
      const key = nd.type === 'unknown' ? `?→${nd.resolved}` : nd.type;
      extra.nodes[key] = (extra.nodes[key] || 0) + 1;
      if (nd.dv != null) {
        const dk = `A${Math.min(3, nd.act)} ${key}`;
        const d = extra.dv[dk] || (extra.dv[dk] = { n: 0, dv: 0, life: 0, gold: 0 });
        d.n++;
        d.dv += nd.dv;
        d.life += nd.dLife;
        d.gold += nd.dGold;
      }
    }
    if (bot && bot.stats) extra.skips += bot.stats.skips;
    // 타락(강화 비용 0)을 가진 판은 따로 센다: 공짜 강화가 무제한이면 승률을 크게 흔든다
    if (run.augments.some((id) => RS.augDef(id).id === 'corruption')) {
      extra.corr++;
      if (won) extra.corrWon++;
    }
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
  const secs = (Date.now() - t0) / 1000;
  const pct = (x, of) => ((100 * x) / (of || n)).toFixed(1) + '%';
  console.log(`bot=${kind} runs=${n} cmd=${cmdArg} asc=${asc}${keys ? ' keys' : ''}${Object.keys(params).length ? ' bp=' + JSON.stringify(params) : ''} time=${secs.toFixed(1)}s (${(secs / n).toFixed(3)}s/판)`);
  console.log(`승률 ${pct(wins)}${act4 ? ` · 4막 도달 ${act4}회, 고대신 격파 ${act4win}회` : ''}${extra.corr ? ` · 검은 풀무를 가진 판 ${extra.corr}회(승 ${extra.corrWon}), 뺀 승률 ${pct(wins - extra.corrWon, n - extra.corr)}` : ''}`);
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
  console.log(`전투 중 강화 ${(extra.upgrades / n).toFixed(1)}회/판 (강화한 판 ${pct(extra.upgRuns)}) · 소환 ${(extra.summons / n).toFixed(1)}회/판${extra.skips ? ` · 증강 건너뛰기 ${(extra.skips / n).toFixed(2)}회/판` : ''}`);
  if (extra.shopVisits) console.log(`상점 ${(extra.shopVisits / n).toFixed(2)}회/판 · 들어갈 때 평균 골드 ${(extra.shopGold / extra.shopVisits).toFixed(0)} · 평균 지출 ${(extra.shopSpend / extra.shopVisits).toFixed(0)}`);
  console.log('휴식처 선택:', Object.entries(extra.rests).map(([k, v]) => `${k} ${v}`).join(' | '));
  console.log('칸 종류(판당):', Object.entries(extra.nodes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / n).toFixed(2)}`).join(' | '));
  if (Object.keys(extra.dv).length) {
    console.log('칸 종류별 평균 가치 변화 (smart 가치 함수, 골드 환산 · 생명 · 골드):');
    for (const k of Object.keys(extra.dv).sort()) {
      const d = extra.dv[k];
      if (d.n >= 5) console.log(`  ${k}: ${(d.dv / d.n).toFixed(0)} · ${(d.life / d.n).toFixed(2)} · ${(d.gold / d.n).toFixed(0)} (${d.n})`);
    }
  }
  console.log('주요 사망 지점:');
  Object.entries(deaths).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
}

if (require.main === module) main();
module.exports = { loadRS, playRun };
