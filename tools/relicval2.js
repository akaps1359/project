// 유물 가치 측정 (중간 획득판): itemval.js 와 같지만 유물을 '시작'이 아니라 N막 시작(차원 방랑자를 만난 직후)에 쥐여 준다.
// 보스 유물은 1막 보스 뒤, 방랑자 유물은 2·3막 시작에 얻으므로 이쪽이 실제 가치에 더 가깝다.
// 사용법: node tools/relicval2.js [판수=120] [--act=2] [--asc=N] [--seed=N] [--ids=a,b] [--rarity=3,4] [--jobs=4] [--out=파일.json]
//         [--patch='{"ectoHeart":{"mods":{...}}}'] (유물 정의를 덮어써서 값 후보를 미리 재 본다)
// 출력: 승률 차이(%p)와 평균 도달 깊이 차이(층). 기준선은 같은 시드에서 아무것도 받지 않은 판이다.
// 판 결과가 1막에서 끝나는 판은 두 쪽이 똑같으므로, '2막 도달 판' 기준 승률 차이도 함께 보여 준다.
'use strict';
const { fork } = require('child_process');
const fs = require('fs');

function playOne(RS, playRun, id, seed, asc, act, cmd) {
  const orig = RS.rollAncient;
  let reached = false;
  RS.rollAncient = function (run) {
    const r = orig.apply(this, arguments);
    if (run.act === act && !run._given) {
      run._given = true;
      reached = true;
      if (id) RS.addRelic(run, id);
    }
    return r;
  };
  try {
    const { run, won } = playRun(RS, seed, 'smart', { commander: cmd, asc });
    const nF = RS.MAP_FLOORS + 1;
    const depth = won ? 3 * nF + 5 : (run.act - 1) * nF + Math.max(0, run.floor);
    return { won: won ? 1 : 0, depth, reached: reached ? 1 : 0 };
  } finally {
    RS.rollAncient = orig;
  }
}

if (process.argv[2] === '--worker') {
  const { loadRS, playRun } = require('./sim.js');
  const RS = loadRS();
  const cmds = RS.COMMANDERS.map((c) => c.id);
  let patched = false;
  process.on('message', (job) => {
    if (job.quit) process.exit(0);
    if (!patched && job.patch) for (const id in job.patch) Object.assign(RS.REL[id], job.patch[id]);
    patched = true;
    const out = { key: job.key, won: 0, depth: 0, n: job.n, reached: 0, wonReached: 0 };
    for (let k = 0; k < job.n; k++) {
      const r = playOne(RS, playRun, job.id, job.seed + k, job.asc, job.act, cmds[k % cmds.length]);
      out.won += r.won;
      out.depth += r.depth;
      out.reached += r.reached;
      if (r.reached) out.wonReached += r.won;
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
  const act = parseInt(arg('act') || '2', 10);
  const jobsN = parseInt(arg('jobs') || '4', 10);
  const rar = (arg('rarity') || '3,4').split(',').map(Number);
  const ids = arg('ids') ? arg('ids').split(',') : null;
  const patch = arg('patch') ? JSON.parse(arg('patch')) : null;
  const { loadRS } = require('./sim.js');
  const RS = loadRS();
  const list = [{ key: 'BASE', id: null, name: '(없음)', rarity: 0 }];
  for (const r of RS.RELICS) {
    if (ids ? ids.includes(r.id) : rar.includes(r.rarity)) list.push({ key: r.id, id: r.id, name: r.name, rarity: r.rarity });
  }
  const queue = list.slice();
  const res = {};
  let busy = 0;
  const t0 = Date.now();
  const workers = [];
  const done = () => {
    const b = res.BASE;
    const bw = b.won / b.n;
    const bd = b.depth / b.n;
    const bwr = b.wonReached / Math.max(1, b.reached);
    const rows = list.filter((x) => x.key !== 'BASE').map((x) => {
      const r = res[x.key];
      return { id: x.id, name: x.name, rarity: x.rarity, win: r.won / r.n, dWin: r.won / r.n - bw, dDepth: r.depth / r.n - bd, dWinReached: r.wonReached / Math.max(1, r.reached) - bwr };
    });
    rows.sort((p, q) => q.dDepth - p.dDepth);
    const RN = ['', '일반', '희귀', '보스', '방랑', '시작'];
    console.log(`판수 ${n} · ${act}막 시작에 획득 · asc ${asc} · 기준 승률 ${(bw * 100).toFixed(1)}% · 기준 깊이 ${bd.toFixed(2)} · ${act}막 도달 ${b.reached}판(그중 승률 ${(bwr * 100).toFixed(1)}%) · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    for (const r of rows) console.log(`${(r.dDepth >= 0 ? '+' : '') + r.dDepth.toFixed(2).padStart(5)}층  ${(r.dWin >= 0 ? '+' : '') + (r.dWin * 100).toFixed(1).padStart(5)}%p  (도달 판 ${(r.dWinReached >= 0 ? '+' : '') + (r.dWinReached * 100).toFixed(1)}%p)  ${RN[r.rarity].padEnd(2)} ${r.id.padEnd(16)} ${r.name}`);
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ n, act, asc, base: { win: bw, depth: bd, reached: b.reached }, rows }, null, 1));
    for (const w of workers) w.send({ quit: true });
  };
  const feed = (w) => {
    const x = queue.shift();
    if (!x) return;
    busy++;
    w.send({ key: x.key, id: x.id, n, asc, seed, act, patch });
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
