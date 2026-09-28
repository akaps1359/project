// 보스 유물·차원 방랑자 선택 통계: smart 봇이 실제 판에서 무엇을 보고 무엇을 골랐는지, 고른 판의 승률은 얼마인지.
// 사용법: node tools/relicpicks.js [판수=280] [--asc=N] [--seed=N] [--jobs=4] [--out=파일.json]
// 출력: 항목마다 제시 횟수, 고른 비율, 골랐을 때 승률(그 판 전체의 승률 · 고른 것이 원인이라는 뜻은 아니다)
'use strict';
const { fork } = require('child_process');
const fs = require('fs');

function track(RS) {
  let real = null;
  let log = null;
  const oPick = RS.rewardPickRelic;
  RS.rewardPickRelic = function (run, id) {
    const r = run.pending && run.pending.reward;
    if (run === real && r && !r.relicDone && run.nodeType === 'boss' && r.relics && r.relics.length) {
      log.boss.push({ act: run.act, offered: r.relics.slice(), picked: r.takeAll ? r.relics.slice() : [id] });
    }
    return oPick.apply(this, arguments);
  };
  const oRoll = RS.rollAncient;
  RS.rollAncient = function (run) {
    const a = oRoll.apply(this, arguments);
    if (run === real) log.anc.push({ act: run.act, who: a.id, offered: a.boons.slice(), picked: null });
    return a;
  };
  const oApply = RS.applyAncient;
  RS.applyAncient = function (run, id) {
    if (run === real) {
      const last = log.anc[log.anc.length - 1];
      if (last && !last.picked) last.picked = id;
    }
    return oApply.apply(this, arguments);
  };
  // 보물 더미(보스 유물 2개 중 하나)도 보스 유물 선택으로 센다
  return {
    start(run) { real = run; log = { boss: [], anc: [] }; },
    get log() { return log; },
  };
}

if (process.argv[2] === '--worker') {
  const { loadRS, playRun } = require('./sim.js');
  const RS = loadRS();
  const T = track(RS);
  const cmds = RS.COMMANDERS.map((c) => c.id);
  process.on('message', (job) => {
    if (job.quit) process.exit(0);
    const out = [];
    for (let k = job.from; k < job.to; k++) {
      const cmd = cmds[k % cmds.length];
      const { won, run } = playRun(RS, job.seed + k, 'smart', { commander: cmd, asc: job.asc, onStart: (r) => T.start(r) });
      out.push({ cmd, won: won ? 1 : 0, act: run.act, boss: T.log.boss, anc: T.log.anc });
    }
    process.send(out);
  });
} else {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) || '280', 10);
  const asc = parseInt(arg('asc') || '0', 10);
  const seed = parseInt(arg('seed') || '7000', 10);
  const jobsN = parseInt(arg('jobs') || '4', 10);
  const chunk = Math.ceil(n / (jobsN * 4));
  const jobs = [];
  for (let s = 0; s < n; s += chunk) jobs.push({ from: s, to: Math.min(n, s + chunk), seed, asc });
  const runs = [];
  const workers = [];
  let busy = 0;
  const t0 = Date.now();
  const report = () => {
    const { loadRS } = require('./sim.js');
    const RS = loadRS();
    const name = (id) => (RS.REL[id] ? RS.REL[id].name : (RS.ancientBoon(id) || {}).name || id);
    const stat = (kind) => {
      const m = {};
      for (const r of runs) {
        for (const e of r[kind]) {
          for (const id of e.offered) {
            const s = m[id] || (m[id] = { off: 0, pick: 0, wonPick: 0, wonSkip: 0 });
            s.off++;
            if (e.picked && e.picked.indexOf(id) >= 0) {
              s.pick++;
              s.wonPick += r.won;
            } else s.wonSkip += r.won;
          }
        }
      }
      return Object.entries(m).sort((a, b) => b[1].pick / b[1].off - a[1].pick / a[1].off);
    };
    const wins = runs.reduce((a, r) => a + r.won, 0);
    console.log(`판수 ${runs.length} · asc ${asc} · 승률 ${((100 * wins) / runs.length).toFixed(1)}% · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    const pr = (title, rows) => {
      console.log(`\n${title} (제시 · 고른 비율 · 고른 판 승률 · 안 고른 판 승률)`);
      for (const [id, s] of rows) {
        const wp = s.pick ? ((100 * s.wonPick) / s.pick).toFixed(0) + '%' : '-';
        const ws = s.off - s.pick ? ((100 * s.wonSkip) / (s.off - s.pick)).toFixed(0) + '%' : '-';
        console.log(`  ${id.padEnd(16)} ${name(id).padEnd(12)} ${String(s.off).padStart(4)} · ${((100 * s.pick) / s.off).toFixed(0).padStart(3)}% · ${wp.padStart(4)} · ${ws.padStart(4)}`);
      }
    };
    pr('보스 유물 (막 보스 보상)', stat('boss'));
    pr('차원 방랑자 선택지', stat('anc'));
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ n, asc, runs }, null, 0));
    for (const w of workers) w.send({ quit: true });
  };
  const feed = (w) => {
    const j = jobs.shift();
    if (!j) return;
    busy++;
    w.send(j);
  };
  for (let k = 0; k < jobsN; k++) {
    const w = fork(__filename, ['--worker']);
    workers.push(w);
    w.on('message', (m) => {
      runs.push(...m);
      busy--;
      process.stderr.write(`\r${runs.length}/${n}`);
      if (jobs.length) feed(w);
      else if (busy === 0) {
        process.stderr.write('\n');
        report();
      }
    });
    feed(w);
  }
}
