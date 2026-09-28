// 지휘관 승률 측정 (여러 코어로 나눠 돌림) + 유물 값 임시 바꿔 보기.
// 사용법: node tools/cmdval.js [판수=150] --cmd=mira[,kai|all] [--asc=N] [--seed=N] [--jobs=4]
//         [--patch='{"alchemyPot":{"mods":{"itemSlots":2}}}']   (유물 정의를 덮어쓴다. mods 는 통째로 바뀐다)
// 판수는 지휘관마다. 같은 시드로 돌리므로 --patch 없이 한 번, 있이 한 번 돌려 비교하면 된다.
'use strict';
const { fork } = require('child_process');

function applyPatch(RS, patch) {
  if (!patch) return;
  for (const id in patch) Object.assign(RS.REL[id], patch[id]);
}

if (process.argv[2] === '--worker') {
  const { loadRS, playRun } = require('./sim.js');
  const RS = loadRS();
  let patched = false;
  process.on('message', (job) => {
    if (job.quit) process.exit(0);
    if (!patched) {
      applyPatch(RS, job.patch);
      patched = true;
    }
    let won = 0;
    for (let k = job.from; k < job.to; k++) if (playRun(RS, job.seed + k, 'smart', { commander: job.cmd, asc: job.asc }).won) won++;
    process.send({ cmd: job.cmd, n: job.to - job.from, won });
  });
} else {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) || '150', 10);
  const asc = parseInt(arg('asc') || '0', 10);
  const seed = parseInt(arg('seed') || '20000', 10);
  const jobsN = parseInt(arg('jobs') || '4', 10);
  const patch = arg('patch') ? JSON.parse(arg('patch')) : null;
  const { loadRS } = require('./sim.js');
  const RS = loadRS();
  const cmds = !arg('cmd') || arg('cmd') === 'all' ? RS.COMMANDERS.map((c) => c.id) : arg('cmd').split(',');
  const chunk = Math.max(5, Math.ceil(n / 6));
  const jobs = [];
  for (const cmd of cmds) for (let s = 0; s < n; s += chunk) jobs.push({ cmd, from: s, to: Math.min(n, s + chunk), seed, asc, patch });
  const res = {};
  let busy = 0;
  const t0 = Date.now();
  const workers = [];
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
      const r = res[m.cmd] || (res[m.cmd] = { n: 0, won: 0 });
      r.n += m.n;
      r.won += m.won;
      busy--;
      if (jobs.length) feed(w);
      else if (busy === 0) {
        let tn = 0;
        let tw = 0;
        for (const c of cmds) {
          tn += res[c].n;
          tw += res[c].won;
        }
        console.log(`asc ${asc} · 지휘관당 ${n}판 · 전체 ${((100 * tw) / tn).toFixed(1)}% · ${((Date.now() - t0) / 1000).toFixed(0)}초${patch ? ' · patch ' + JSON.stringify(patch) : ''}`);
        console.log(cmds.map((c) => `${RS.COMMANDER[c].name} ${((100 * res[c].won) / res[c].n).toFixed(1)}%`).join(' | '));
        for (const x of workers) x.send({ quit: true });
      }
    });
    feed(w);
  }
}
