// 증강·유물 가치 측정: 같은 시드 묶음을 '아무것도 없이' 한 번, '그것을 들고 시작'해서 한 번씩 돌려 차이를 본다.
// 사용법: node tools/itemval.js [판수=120] [--asc=N] [--seed=N] [--only=aug|relic] [--ids=a,b] [--jobs=4] [--out=파일.json]
// 출력: 승률 차이(%p)와 평균 도달 깊이 차이(층). 시작부터 쥐여 주므로 '판 전체에 걸친 가치'의 상한에 가깝다.
'use strict';
const { fork } = require('child_process');
const fs = require('fs');

function playOne(RS, playRun, item, seed, asc, cmds, k) {
  const onStart = item ? (run, R) => {
    if (item.kind === 'aug') R.pickAugment(run, item.id);
    else R.addRelic(run, item.id);
  } : null;
  const { run, won } = playRun(RS, seed, 'smart', { commander: cmds[k % cmds.length], asc, onStart });
  const nF = RS.MAP_FLOORS + 1;
  const depth = won ? 3 * nF + 5 : (run.act - 1) * nF + Math.max(0, run.floor);
  return { won: won ? 1 : 0, depth };
}

if (process.argv[2] === '--worker') {
  const { loadRS, playRun } = require('./sim.js');
  const RS = loadRS();
  const cmds = RS.COMMANDERS.map((c) => c.id);
  process.on('message', (job) => {
    if (job.quit) process.exit(0);
    const out = { key: job.key, won: 0, depth: 0, n: job.n };
    const item = job.item;
    for (let k = 0; k < job.n; k++) {
      const r = playOne(RS, playRun, item, job.seed + k, job.asc, cmds, k);
      out.won += r.won;
      out.depth += r.depth;
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
  const only = arg('only');
  const ids = arg('ids') ? arg('ids').split(',') : null;
  const { loadRS } = require('./sim.js');
  const RS = loadRS();
  const items = [{ key: 'BASE', item: null, name: '(없음)', rarity: 0, kind: '' }];
  if (only !== 'relic') for (const a of RS.AUGMENTS) items.push({ key: 'aug:' + a.id, item: { kind: 'aug', id: a.id }, name: a.name, rarity: a.rarity, kind: 'aug' });
  // 시작 유물(지휘관)·이벤트 유물은 뺀다
  if (only !== 'aug') for (const r of RS.RELICS) if (r.rarity <= 4) items.push({ key: 'rel:' + r.id, item: { kind: 'relic', id: r.id }, name: r.name, rarity: r.rarity, kind: 'relic' });
  const list = ids ? items.filter((x) => x.key === 'BASE' || ids.includes(x.item.id)) : items;
  const queue = list.slice();
  const res = {};
  let busy = 0;
  const t0 = Date.now();
  const workers = [];
  const done = () => {
    const base = res.BASE;
    const bw = base.won / base.n;
    const bd = base.depth / base.n;
    const rows = list.filter((x) => x.key !== 'BASE').map((x) => {
      const r = res[x.key];
      return { key: x.key, name: x.name, kind: x.kind, rarity: x.rarity, win: r.won / r.n, dWin: r.won / r.n - bw, dDepth: r.depth / r.n - bd };
    });
    rows.sort((a, b) => b.dDepth - a.dDepth);
    const RN = { aug: ['', '은', '금', '프'], relic: ['', '일반', '희귀', '보스', '방랑'] };
    console.log(`판수 ${n} · asc ${asc} · 기준 승률 ${(bw * 100).toFixed(1)}% · 기준 깊이 ${bd.toFixed(2)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    for (const r of rows) console.log(`${(r.dDepth >= 0 ? '+' : '') + r.dDepth.toFixed(2).padStart(5)}층  ${(r.dWin >= 0 ? '+' : '') + (r.dWin * 100).toFixed(1).padStart(5)}%p  ${RN[r.kind][r.rarity].padEnd(2)} ${r.key.padEnd(24)} ${r.name}`);
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ n, asc, base: { win: bw, depth: bd }, rows }, null, 1));
    for (const w of workers) w.send({ quit: true });
  };
  const feed = (w) => {
    const x = queue.shift();
    if (!x) return;
    busy++;
    w.send({ key: x.key, item: x.item, n, asc, seed });
  };
  for (let j = 0; j < jobsN; j++) {
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
