// 적 종류별 지표: 보스·엘리트 종류별 승률·잃은 생명·강타 맞음/끊음·몇 바퀴 돌았나,
// 일반 적 종류별 빠져나감 비율·균열 게이지 기여, 지역 변형별 사망률
// 사용법: node tools/enemystats.js [판수=100] [시드=1000] [심연=0] [--keys] [--json=파일]
//         node tools/enemystats.js --merge a.json b.json ...   (여러 조각을 합쳐 출력)
// (SETBAL='{"키":값}' 으로 RS.BAL 을, SETENEMY='{"적":{"키":값}}' 로 RS.ENEMY 를, PATCH=파일.js(module.exports = (RS) => {...}) 로 무엇이든 바꿔 볼 수 있다)
'use strict';
const fs = require('fs');
const { loadRS, playRun } = require('./sim.js');

const args = process.argv.slice(2);
const flag = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
};

function blank() {
  return { runs: 0, wins: 0, act4: 0, act4win: 0, battles: {}, elites: {}, bosses: {}, normals: {}, variants: {}, deaths: {}, killers: {}, combats: {} };
}
const add = (o, k, v) => (o[k] = (o[k] || 0) + v);

function collect(n, seed, asc, keys) {
  const RS = loadRS();
  if (process.env.SETBAL) Object.assign(RS.BAL, JSON.parse(process.env.SETBAL));
  if (process.env.PATCH) require(require('path').resolve(process.env.PATCH))(RS);
  if (process.env.SETENEMY) for (const [k, v] of Object.entries(JSON.parse(process.env.SETENEMY))) Object.assign(RS.ENEMY[k], v);
  const cmds = RS.COMMANDERS.map((c) => c.id);
  const S = blank();
  const P = RS.Battle.prototype;
  const FROM = 0.25; // battle.js PRESSURE_FROM
  const PERIM = RS.FIELD.PERIM;
  let cur = null; // 지금 전투의 기록

  const oldSpawn = P.spawnEnemy;
  P.spawnEnemy = function (type, ...a) {
    const e = oldSpawn.call(this, type, ...a);
    const r = this._es;
    if (r) {
      const t = r.types[type] || (r.types[type] = { n: 0, esc: 0, leak: 0, pr: 0, strikes: 0, stag: 0, laps: 0, kills: 0 });
      t.n++;
      if (e.boss && !r.boss) r.boss = type;
      if (e.elite && !e.boss) r.elites.push(type);
    }
    return e;
  };
  const oldLeak = P.leak;
  P.leak = function (e) {
    const r = this._es;
    const before = this.stats.leaks;
    const res = oldLeak.call(this, e);
    if (r) {
      const d = this.stats.leaks - before;
      r.types[e.type].leak += d;
      if (!e.boss && !e.elite) r.types[e.type].esc++;
      if (d > 0) r.last = e.type;
    }
    return res;
  };
  const oldHit = P.strikeHit;
  P.strikeHit = function (e, s, pre) {
    const r = this._es;
    if (r) {
      r.types[e.type].strikes++;
      r.last = e.type;
    }
    return oldHit.call(this, e, s, pre);
  };
  const oldStag = P.staggerStrike;
  P.staggerStrike = function (e, why) {
    const r = this._es;
    if (r && e.cast && e.cast.s.k === 'strike') r.types[e.type].stag++;
    return oldStag.call(this, e, why);
  };
  // 균열 게이지: 적 종류별로 채운 양(생명 1 = 1.0)을 나눠 센다
  const oldPr = P.updatePressure;
  P.updatePressure = function (dt) {
    const r = this._es;
    const fill = RS.BAL.pressureFill;
    const p0 = this.stats.pressure || 0;
    let top = null, topW = 0;
    if (r && fill && !(this.ghostT > 0)) {
      for (const e of this.enemies) {
        if (e.dead || e.boss || e.elite || e.subT > 0 || !(e.def.leak > 0)) continue;
        const p = (e.d - (e.nextLap - PERIM)) / PERIM;
        if (p > FROM) {
          const w = (p - FROM) / (1 - FROM);
          r.types[e.type].pr += (w * dt) / fill;
          if (w > topW) (topW = w), (top = e.type);
        }
      }
    }
    const res = oldPr.call(this, dt);
    // 게이지로 잃은 생명은 그때 가장 깊이 들어온 적 종류 탓으로 친다
    if (r && (this.stats.pressure || 0) > p0) r.last = `gauge:${top}`;
    return res;
  };
  const oldKill = P.onKill;
  P.onKill = function (e) {
    const r = this._es;
    if (r && (e.boss || e.elite)) {
      r.types[e.type].kills++;
      r.types[e.type].laps += e.laps;
    }
    return oldKill.call(this, e);
  };
  const oldFinish = P.finish;
  P.finish = function (result, reason) {
    const r = this._es;
    if (r && !r.done && this.status === 'running') {
      r.done = true;
      r.result = result;
      r.reason = reason;
      r.lost = this.stats.leaks + (this.stats.struck || 0) + (this.stats.pressure || 0);
      // 살아 있는 엘리트·보스의 바퀴 수도 센다
      for (const e of this.enemies) if (!e.dead && (e.boss || e.elite)) r.types[e.type].laps += e.laps;
      cur.push(r);
    }
    return oldFinish.call(this, result, reason);
  };
  const oldUpdate = P.update;
  P.update = function (dt) {
    if (!this._es) {
      this._es = { act: this.run.act, variant: RS.actDef(this.run).id, kind: this.kind, types: {}, elites: [], boss: null, last: null };
    }
    return oldUpdate.call(this, dt);
  };

  for (let k = 0; k < n; k++) {
    cur = [];
    const { run, log, won } = playRun(RS, seed + k, 'smart', { commander: cmds[k % cmds.length], asc, keys });
    S.runs++;
    if (won) S.wins++;
    if (run.act === 4) {
      S.act4++;
      if (won) S.act4win++;
    }
    const deathAct = won ? 0 : log.death ? log.death.act : run.act;
    // 지역 변형별: 들어간 판 / 그 막에서 죽은 판
    for (const a of [1, 2, 3, 4]) {
      if (a > run.act) break;
      const id = RS.ACT_VARIANTS[a - 1][(run.variants && run.variants[a]) || 0].id;
      const v = S.variants[id] || (S.variants[id] = { act: a, n: 0, died: 0, bossN: 0, bossWon: 0 });
      v.n++;
      if (deathAct === a) v.died++;
    }
    for (const r of cur) {
      const bk = `A${Math.min(4, r.act)} ${r.variant} ${r.kind}`;
      const b = S.battles[bk] || (S.battles[bk] = { n: 0, won: 0, lost: 0, fieldLoss: 0 });
      b.n++;
      if (r.result === 'won') {
        b.won++;
        b.lost += r.lost;
      } else if (r.reason !== 'life') b.fieldLoss++;
      if (r.kind === 'boss' && S.variants[r.variant]) {
        S.variants[r.variant].bossN++;
        if (r.result === 'won') S.variants[r.variant].bossWon++;
      }
      if (r.result !== 'won') {
        add(S.deaths, bk, 1);
        add(S.killers, `A${Math.min(4, r.act)} ${r.kind} ← ${r.last || r.reason}`, 1);
      }
      // 일반 전투: 가장 많이 나온 일반 적(주력)별
      if (r.kind === 'combat') {
        let main = null, mn = 0;
        for (const [t, ty] of Object.entries(r.types)) if (!RS.ENEMY[t].boss && !RS.ENEMY[t].elite && ty.n > mn) (mn = ty.n), (main = t);
        if (main) {
          const x = S.combats[`A${Math.min(4, r.act)} ${main}`] || (S.combats[`A${Math.min(4, r.act)} ${main}`] = { n: 0, won: 0, lost: 0 });
          x.n++;
          if (r.result === 'won') (x.won++), (x.lost += r.lost);
        }
      }
      // 엘리트·보스 종류별
      const bigs = r.kind === 'boss' && r.boss ? [[S.bosses, r.boss]] : r.kind === 'elite' ? [...new Set(r.elites)].map((t) => [S.elites, t]) : [];
      for (const [tab, t] of bigs) {
        const key = `A${Math.min(4, r.act)} ${t}`;
        const x = tab[key] || (tab[key] = { n: 0, won: 0, lost: 0, spawned: 0, kills: 0, laps: 0, leak: 0, strikes: 0, stag: 0, lostAll: 0 });
        const ty = r.types[t];
        x.n++;
        if (r.result === 'won') {
          x.won++;
          x.lost += r.lost;
        }
        x.lostAll += r.lost;
        x.spawned += ty.n;
        x.kills += ty.kills;
        x.laps += ty.laps;
        x.leak += ty.leak;
        x.strikes += ty.strikes;
        x.stag += ty.stag;
      }
      // 일반 적 종류별 (막별)
      for (const [t, ty] of Object.entries(r.types)) {
        const def = RS.ENEMY[t];
        if (def.boss || def.elite) continue;
        const key = `A${Math.min(4, r.act)} ${t}`;
        const x = S.normals[key] || (S.normals[key] = { n: 0, esc: 0, pr: 0, leak: 0 });
        x.n += ty.n;
        x.esc += ty.esc;
        x.pr += ty.pr;
        x.leak += ty.leak;
      }
    }
  }
  return S;
}

function merge(list) {
  const S = blank();
  const deep = (dst, src) => {
    for (const [k, v] of Object.entries(src)) {
      if (typeof v === 'number') dst[k] = (dst[k] || 0) + v;
      else if (v && typeof v === 'object') deep(dst[k] || (dst[k] = {}), v);
    }
  };
  for (const s of list) deep(S, s);
  // act 는 합치면 안 된다
  for (const v of Object.values(S.variants)) v.act = Math.round(v.act / Math.max(1, list.filter((s) => s.variants).length)) || v.act;
  return S;
}

function report(S) {
  const p = (a, b) => (b ? ((100 * a) / b).toFixed(0) + '%' : '-');
  const f = (a, b, d = 1) => (b ? (a / b).toFixed(d) : '-');
  console.log(`판 ${S.runs} · 승률 ${p(S.wins, S.runs)}${S.act4 ? ` · 4막 도달 ${S.act4}, 고대신 격파 ${S.act4win} (${p(S.act4win, S.act4)})` : ''}`);
  console.log('\n[지역 변형] 들어간 판 / 그 막에서 죽음 / 보스 승률');
  for (const [id, v] of Object.entries(S.variants).sort((a, b) => a[1].act - b[1].act)) console.log(`  ${id.padEnd(8)} ${String(v.n).padStart(5)}  사망 ${p(v.died, v.n).padStart(4)}  보스 ${p(v.bossWon, v.bossN).padStart(4)} (${v.bossN})`);
  console.log('\n[전투] 막 지역 종류: 판 · 승률 · 이긴 판 평균 잃은 생명');
  for (const [k, b] of Object.entries(S.battles).sort()) console.log(`  ${k.padEnd(22)} ${String(b.n).padStart(5)}  승 ${p(b.won, b.n).padStart(4)}  -${f(b.lost, b.won)}${b.fieldLoss ? `  (필드 초과 패배 ${b.fieldLoss})` : ''}`);
  const big = (title, tab) => {
    console.log(`\n[${title}] 전투 수 · 승률 · 잃은 생명(이긴 판) · 1기당 바퀴 · 1기당 누수 · 1기당 강타 맞음/끊음 · 처치율`);
    for (const [k, x] of Object.entries(tab).sort()) {
      console.log(`  ${k.padEnd(18)} ${String(x.n).padStart(5)}  승 ${p(x.won, x.n).padStart(4)}  -${f(x.lost, x.won).padStart(4)}  바퀴 ${f(x.laps, x.spawned, 2)}  누수 ${f(x.leak, x.spawned, 2)}  강타 ${f(x.strikes, x.spawned, 2)}/${f(x.stag, x.spawned, 2)}  처치 ${p(x.kills, x.spawned)}`);
    }
  };
  big('보스', S.bosses);
  big('엘리트', S.elites);
  console.log('\n[일반 적] 막 종류: 나온 수 · 빠져나감 비율 · 1000기당 균열 게이지(생명) · 1000기당 누수(생명)');
  for (const [k, x] of Object.entries(S.normals).sort()) {
    if (x.n < 50) continue;
    console.log(`  ${k.padEnd(14)} ${String(x.n).padStart(7)}  빠져나감 ${((100 * x.esc) / x.n).toFixed(2).padStart(5)}%  게이지 ${((1000 * x.pr) / x.n).toFixed(1).padStart(6)}  누수 ${((1000 * x.leak) / x.n).toFixed(1).padStart(6)}`);
  }
  console.log('\n[일반 전투] 막 주력 적: 전투 수 · 패배율 · 이긴 판 평균 잃은 생명');
  for (const [k, x] of Object.entries(S.combats || {}).sort()) if (x.n >= 20) console.log(`  ${k.padEnd(14)} ${String(x.n).padStart(6)}  패배 ${((100 * (x.n - x.won)) / x.n).toFixed(1).padStart(5)}%  -${f(x.lost, x.won, 2)}`);
  console.log('\n[패배한 전투]');
  for (const [k, v] of Object.entries(S.deaths).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${v}`);
  console.log('\n[마지막 생명을 앗아 간 것]');
  for (const [k, v] of Object.entries(S.killers).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${k.padEnd(30)} ${v}`);
}

if (args[0] === '--merge') {
  report(merge(args.slice(1).map((fn) => JSON.parse(fs.readFileSync(fn, 'utf8')))));
} else {
  const nums = args.filter((a) => /^\d+$/.test(a)).map(Number);
  const n = nums[0] || 100, seed = nums[1] || 1000, asc = nums[2] || 0;
  const S = collect(n, seed, asc, args.includes('--keys'));
  const out = flag('json');
  if (out) fs.writeFileSync(out, JSON.stringify(S));
  else report(S);
}
