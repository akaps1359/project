// 증강 중첩 측정: 증강 묶음(같은 증강 여러 장, 연마본, 조합)을 시작부터 쥐여 주고 같은 시드 기준선과 비교한다.
// 사용법: node tools/augstack.js [판수=120] --sets="sharp;sharp,sharp;sharp,sharp,sharp" [--asc=N] [--seed=N] [--jobs=4] [--out=파일.json]
//   묶음은 ; 로 나누고, 묶음 안의 증강은 , 로 나눈다. id 뒤에 + 를 붙이면 연마본이다. 'x3' 줄임: sharp*3
// 출력: itemval.js 와 같은 형식 (평균 도달 깊이 차이 '층', 승률 차이 %p). unique 증강도 억지로 여러 장 넣을 수 있으니 주의.
'use strict';
const { fork } = require('child_process');
const fs = require('fs');

const expand = (set) => {
  const out = [];
  for (const tok of set.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(.+?)\*(\d+)$/.exec(tok);
    if (m) for (let i = 0; i < +m[2]; i++) out.push(m[1]);
    else out.push(tok);
  }
  return out;
};

if (process.argv[2] === '--worker') {
  const { loadRS, playRun } = require('./sim.js');
  const RS = loadRS();
  const cmds = RS.COMMANDERS.map((c) => c.id);
  const nF = RS.MAP_FLOORS + 1;
  process.on('message', (job) => {
    if (job.quit) process.exit(0);
    const out = { key: job.key, won: 0, depth: 0, n: job.n };
    const ids = job.ids;
    for (let k = 0; k < job.n; k++) {
      const onStart = ids.length ? (run, R) => { for (const id of ids) R.pickAugment(run, id); } : null;
      const { run, won } = playRun(RS, job.seed + k, 'smart', { commander: cmds[k % cmds.length], asc: job.asc, onStart });
      out.won += won ? 1 : 0;
      out.depth += won ? 3 * nF + 5 : (run.act - 1) * nF + Math.max(0, run.floor);
    }
    process.send(out);
  });
} else {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) || '120', 10);
  const asc = parseInt(arg('asc') || '0', 10);
  const seed = parseInt(arg('seed') || '5000', 10);
  const jobsN = parseInt(arg('jobs') || '4', 10);
  const sets = (arg('sets') || '').split(';').map((s) => s.trim()).filter(Boolean);
  const list = [{ key: 'BASE', ids: [] }].concat(sets.map((s) => ({ key: s, ids: expand(s) })));
  const queue = list.slice();
  const res = {};
  let busy = 0;
  const t0 = Date.now();
  const workers = [];
  const done = () => {
    const b = res.BASE;
    const bw = b.won / b.n, bd = b.depth / b.n;
    console.log(`판수 ${n} · asc ${asc} · seed ${seed} · 기준 승률 ${(bw * 100).toFixed(1)}% · 기준 깊이 ${bd.toFixed(2)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    const rows = list.filter((x) => x.key !== 'BASE').map((x) => {
      const r = res[x.key];
      return { key: x.key, win: r.won / r.n, dWin: r.won / r.n - bw, dDepth: r.depth / r.n - bd };
    });
    for (const r of rows) console.log(`${(r.dDepth >= 0 ? '+' : '') + r.dDepth.toFixed(2).padStart(5)}층  ${(r.dWin >= 0 ? '+' : '') + (r.dWin * 100).toFixed(1).padStart(5)}%p  ${r.key}`);
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ n, asc, seed, base: { win: bw, depth: bd }, rows }, null, 1));
    for (const w of workers) w.send({ quit: true });
  };
  const feed = (w) => {
    const x = queue.shift();
    if (!x) return;
    busy++;
    w.send({ key: x.key, ids: x.ids, n, asc, seed });
  };
  for (let j = 0; j < Math.min(jobsN, list.length); j++) {
    const w = fork(__filename, ['--worker']);
    workers.push(w);
    w.on('message', (m) => {
      res[m.key] = m;
      busy--;
      process.stderr.write(`\r${Object.keys(res).length}/${list.length}`);
      if (queue.length) feed(w);
      else if (busy === 0) {
        process.stderr.write('\n');
        done();
      }
    });
    feed(w);
  }
}
