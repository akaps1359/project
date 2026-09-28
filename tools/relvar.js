// 유물 수치 '변형'을 relics.js 를 고치지 않고 한꺼번에 재 본다 (itemval.js 와 같은 방식: 시작부터 쥐여 주고 같은 시드 기준선과 비교).
// 사용법: node tools/relvar.js 변형.json [판수=120] [--asc=N] [--seed=N] [--jobs=4] [--out=파일.json]
// 변형.json: [{ "key": "lens-r5", "id": "lens", "mods": { "innerRange": 5 } }, ...]
//   mods 는 원래 mods 위에 덮어쓴다 (값이 null 이면 그 키를 지운다). mods 가 없으면 지금 값 그대로 잰다.
// 출력 형식은 itemval.js --out 과 같아서 tools/relaudit.js 로 합칠 수 있다.
'use strict';
const { fork } = require('child_process');
const fs = require('fs');

if (process.argv[2] === '--worker') {
  const { loadRS, playRun } = require('./sim.js');
  const RS = loadRS();
  const cmds = RS.COMMANDERS.map((c) => c.id);
  process.on('message', (job) => {
    if (job.quit) process.exit(0);
    const v = job.v;
    let orig = null;
    if (v) {
      const def = RS.REL[v.id];
      orig = def.mods;
      const m = JSON.parse(JSON.stringify(orig));
      for (const k in v.mods || {}) {
        if (v.mods[k] === null) delete m[k];
        else m[k] = v.mods[k];
      }
      def.mods = m;
    }
    const out = { key: job.key, won: 0, depth: 0, n: job.n };
    const nF = RS.MAP_FLOORS + 1;
    for (let k = 0; k < job.n; k++) {
      const onStart = v ? (run, R) => R.addRelic(run, v.id) : null;
      const { run, won } = playRun(RS, job.seed + k, 'smart', { commander: cmds[k % cmds.length], asc: job.asc, onStart });
      out.won += won ? 1 : 0;
      out.depth += won ? 3 * nF + 5 : (run.act - 1) * nF + Math.max(0, run.floor);
    }
    if (v) RS.REL[v.id].mods = orig;
    process.send(out);
  });
} else {
  const args = process.argv.slice(2);
  const arg = (name) => {
    const a = args.find((x) => x.startsWith(`--${name}=`));
    return a ? a.slice(name.length + 3) : null;
  };
  const file = args.find((a) => a.endsWith('.json') && !a.startsWith('--'));
  const n = parseInt(args.find((a) => /^\d+$/.test(a)) || '120', 10);
  const asc = parseInt(arg('asc') || '0', 10);
  const seed = parseInt(arg('seed') || '5000', 10);
  const jobsN = parseInt(arg('jobs') || '4', 10);
  const vars = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { loadRS } = require('./sim.js');
  const RS = loadRS();
  const list = [{ key: 'BASE', v: null }].concat(vars.map((v) => ({ key: 'rel:' + v.key, v })));
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
      const def = RS.REL[x.v.id];
      return { key: x.key, name: def.name + (x.v.mods ? '*' : ''), kind: 'relic', rarity: x.v.rarity || def.rarity, win: r.won / r.n, dWin: r.won / r.n - bw, dDepth: r.depth / r.n - bd, mods: x.v.mods || null };
    });
    rows.sort((a, b) => b.dDepth - a.dDepth);
    console.log(`판수 ${n} · asc ${asc} · 시드 ${seed} · 기준 승률 ${(bw * 100).toFixed(1)}% · 기준 깊이 ${bd.toFixed(2)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    for (const r of rows) console.log(`${(r.dDepth >= 0 ? '+' : '') + r.dDepth.toFixed(2).padStart(5)}층  ${(r.dWin >= 0 ? '+' : '') + (r.dWin * 100).toFixed(1).padStart(5)}%p  ${r.key.padEnd(24)} ${r.name} ${r.mods ? JSON.stringify(r.mods) : ''}`);
    if (arg('out')) fs.writeFileSync(arg('out'), JSON.stringify({ n, asc, seed, base: { win: bw, depth: bd }, rows }, null, 1));
    for (const w of workers) w.send({ quit: true });
  };
  const feed = (w) => {
    const x = queue.shift();
    if (!x) return;
    busy++;
    w.send({ key: x.key, v: x.v, n, asc, seed });
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
