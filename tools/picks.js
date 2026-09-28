// 실제 판에서 증강이 '제시된 횟수'와 '골라진 횟수' (봇의 모의 복제는 빼고)
// 사용법: node tools/picks.js [판수=100] [시드=1000]   (SETBAL='{"키":값}' 으로 RS.BAL 을 바꿔 볼 수 있다)
const { loadRS, playRun } = require('./sim.js');
const RS = loadRS();
if (process.env.SETBAL) Object.assign(RS.BAL, JSON.parse(process.env.SETBAL));
const cmds = RS.COMMANDERS.map((c) => c.id);
const n = +process.argv[2] || 100, seed = +process.argv[3] || 1000;
const real = new WeakSet();
const offer = {}, pick = {};
const oRoll = RS.rollAugments;
RS.rollAugments = function (run, ...a) { const out = oRoll.call(this, run, ...a); if (real.has(run)) for (const id of out) offer[id] = (offer[id] || 0) + 1; return out; };
const oPick = RS.pickAugment;
RS.pickAugment = function (run, id) { if (real.has(run)) { const k = RS.augDef(id).id; pick[k] = (pick[k] || 0) + 1; } return oPick.call(this, run, id); };
let wins = 0;
for (let k = 0; k < n; k++) { const r = playRun(RS, seed + k, 'smart', { commander: cmds[k % cmds.length], onStart: (run) => real.add(run) }); if (r.won) wins++; }
console.log('승률', (100 * wins / n).toFixed(1) + '%');
const RN = ['', '은', '금', '프'];
for (const r of [3, 2, 1]) {
  const list = RS.AUGMENTS.filter((a) => a.rarity === r).map((a) => ({ id: a.id, name: a.name, o: offer[a.id] || 0, p: pick[a.id] || 0 }));
  list.sort((x, y) => y.p / Math.max(1, y.o) - x.p / Math.max(1, x.o));
  console.log(`[${RN[r]}] ` + list.map((x) => `${x.name} ${x.o ? Math.round(100 * x.p / x.o) : '-'}%(${x.p}/${x.o})`).join(' · '));
}
