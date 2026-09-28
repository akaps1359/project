// 전투당 잃은 생명(누수+강타+균열 게이지) 분포, 강타 맞음/끊음, 빠져나간 적, 사망 위치
// 사용법: node tools/lifedist.js [판수=100] [시드=1000] [심연=0]   (SETBAL='{"키":값}' 으로 RS.BAL 을 바꿔 볼 수 있다)
const { loadRS, playRun } = require('./sim.js');
const RS = loadRS();
if (process.env.SETBAL) Object.assign(RS.BAL, JSON.parse(process.env.SETBAL));
const cmds = RS.COMMANDERS.map((c) => c.id);
const n = +process.argv[2] || 100, seed = +process.argv[3] || 1000, asc = +(process.argv[4] || 0);
const recs = [];
const P = RS.Battle.prototype;
const oldFinish = P.finish;
P.finish = function (result, reason) {
  if (!this._rec) {
    this._rec = true;
    recs.push({ act: this.run.act, kind: this.kind, leaks: this.stats.leaks, struck: this.stats.struck || 0, pr: this.stats.pressure || 0, esc: this.stats.escaped || 0, stag: this.stats.staggers || 0, strikes: this._strikes || 0, result });
  }
  return oldFinish.call(this, result, reason);
};
if (P.strikeHit) { const o = P.strikeHit; P.strikeHit = function (...a) { this._strikes = (this._strikes || 0) + 1; return o.apply(this, a); }; }
let wins = 0, low = 0, low3 = 0; const deathBy = {};
for (let k = 0; k < n; k++) {
  const { run, log, won } = playRun(RS, seed + k, 'smart', { commander: cmds[k % cmds.length], asc });
  if (won) wins++;
  let mn = 1;
  for (const b of log.battles) if (b.won) mn = Math.min(mn, b.life / run.maxLife);
  if (mn <= 0.5) low++;
  if (mn <= 0.3) low3++;
  if (!won && log.death) { const kk = `A${log.death.act} ${log.death.type}`; deathBy[kk] = (deathBy[kk] || 0) + 1; }
}
console.log(`판 ${n} · 승률 ${(100 * wins / n).toFixed(1)}% · 생명 절반 이하를 겪은 판 ${(100 * low / n).toFixed(0)}% · 30% 이하 ${(100 * low3 / n).toFixed(0)}%`);
console.log('사망 위치', JSON.stringify(Object.entries(deathBy).sort((a, b) => b[1] - a[1])));
const B = [[0, 0], [0.01, 1], [1.01, 3], [3.01, 6], [6.01, 10], [10.01, 1e9]];
const lab = ['0', '1', '2-3', '4-6', '7-10', '11+'];
const g = {};
for (const r of recs) {
  const key = `A${Math.min(4, r.act)} ${r.kind}`;
  const h = g[key] || (g[key] = { n: 0, c: new Array(B.length).fill(0), lost: 0, sum: 0, st: 0, sk: 0, stag: 0, esc: 0, pr: 0 });
  h.n++;
  const tot = r.leaks + r.struck + r.pr;
  if (r.result === 'lost') h.lost++;
  else h.sum += tot;
  h.c[B.findIndex(([a, z]) => tot >= a && tot <= z)]++;
  h.sk += r.strikes; h.stag += r.stag; h.esc += r.esc; h.st += r.struck; h.pr += r.pr;
}
console.log('전투당 잃은 생명'.padEnd(12), lab.map((l) => l.padStart(6)).join(''), ' 패배  평균  강타(맞음/끊음)  빠져나감  게이지');
for (const key of Object.keys(g).sort()) {
  const h = g[key];
  console.log(key.padEnd(12), h.c.map((v) => ((100 * v) / h.n).toFixed(0).padStart(5) + '%').join(''), String(h.lost).padStart(5), (h.sum / Math.max(1, h.n - h.lost)).toFixed(2).padStart(6), `  ${(h.sk / h.n).toFixed(1)}/${(h.stag / h.n).toFixed(1)}`.padStart(12), (h.esc / h.n).toFixed(1).padStart(8), (h.pr / h.n).toFixed(2).padStart(7));
}
