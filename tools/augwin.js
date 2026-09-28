// 증강 수치 A/B: content.js 를 고치지 않고 증강 mods 를 덮어써서 전체 승률(smart 봇, 지휘관 순환)을 비교한다.
// 사용법: node tools/augwin.js [판수=200] [--seed=N] [--asc=N] [--jobs=4] --variants='{"이름":{"증강id":{mods}}, ...}'
//   변형마다 같은 시드 묶음을 돌린다. 빈 객체 {} 는 현재 content.js 그대로. mods 는 통째로 바뀐다(onPick 은 그대로).
// 출력: 변형별 승률과 평균 도달 깊이, 첫 변형 대비 차이
'use strict';
const { fork } = require('child_process');

if (process.argv[2] === '--worker') {
  const { loadRS, playRun } = require('./sim.js');
  const RS = loadRS();
  const orig = {};
  for (const a of RS.AUGMENTS) orig[a.id] = a.mods;
  const cmds = RS.COMMANDERS.map((c) => c.id);
  const nF = RS.MAP_FLOORS + 1;
  process.on('message', (job) => {
    if (job.quit) process.exit(0);
    for (const a of RS.AUGMENTS) a.mods = orig[a.id];
    for (const id in job.patch) RS.AUG[id].mods = job.patch[id];
    const out = { key: job.key, part: job.part, won: 0, depth: 0, n: 0 };
    for (let k = job.from; k < job.to; k++) {
      const { run, won } = playRun(RS, job.seed + k, 'smart', { commander: cmds[k % cmds.length], asc: job.asc });
      out.won += won ? 1 : 0;
      out.depth += won ? 3 * nF + 5 : (run.act - 1) * nF + Math.max(0, run.floor);
      out.n++;
    }
    process.send(out);
  });
} else {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) || '200', 10);
  const asc = parseInt(arg('asc') || '0', 10);
  const seed = parseInt(arg('seed') || '5000', 10);
  const jobsN = parseInt(arg('jobs') || '4', 10);
  const variants = JSON.parse(arg('variants') || '{"현재":{}}');
  const keys = Object.keys(variants);
  const CH = 25; // 한 일감의 판수
  const queue = [];
  for (const key of keys) for (let f = 0; f < n; f += CH) queue.push({ key, patch: variants[key], from: f, to: Math.min(n, f + CH), seed, asc });
  const total = queue.length;
  const res = {};
  for (const k of keys) res[k] = { won: 0, depth: 0, n: 0 };
  let got = 0;
  const workers = [];
  const t0 = Date.now();
  const done = () => {
    const b = res[keys[0]];
    console.log(`판수 ${n} · asc ${asc} · seed ${seed} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    for (const k of keys) {
      const r = res[k];
      const w = r.won / r.n, d = r.depth / r.n;
      console.log(`${(w * 100).toFixed(1).padStart(5)}%  깊이 ${d.toFixed(2)}  (${((w - b.won / b.n) * 100 >= 0 ? '+' : '') + ((w - b.won / b.n) * 100).toFixed(1)}%p, ${(d - b.depth / b.n >= 0 ? '+' : '') + (d - b.depth / b.n).toFixed(2)}층)  ${k}`);
    }
    for (const w of workers) w.send({ quit: true });
  };
  for (let j = 0; j < Math.min(jobsN, queue.length); j++) {
    const w = fork(__filename, ['--worker']);
    workers.push(w);
    w.on('message', (m) => {
      const r = res[m.key];
      r.won += m.won; r.depth += m.depth; r.n += m.n;
      got++;
      process.stderr.write(`\r${got}/${total}`);
      if (queue.length) w.send(queue.shift());
      else if (got === total) {
        process.stderr.write('\n');
        done();
      }
    });
    w.send(queue.shift());
  }
}
