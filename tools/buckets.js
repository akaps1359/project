// 3막 보스전에서 가장 센 칸의 피해 배율을 칸(버킷)별로 나눠 보고, 피해%가 어디서 오는지 센다
// 사용법: node tools/buckets.js [판수=80] [시드=1000]
const { loadRS, playRun } = require('./sim.js');
const RS = loadRS();
const cmds = RS.COMMANDERS.map((c) => c.id);
const n = +process.argv[2] || 80, seed = +process.argv[3] || 1000;
const rows = [];
const P = RS.Battle.prototype;
const oldFinish = P.finish;
P.finish = function (result, reason) {
  if (!this._rec && this.run.act >= 3 && this.kind === 'boss') {
    this._rec = true;
    const M = this.M, run = this.run;
    // DPS 가장 큰 칸 기준
    let best = null;
    for (let i = 0; i < RS.FIELD.SIZE; i++) { const s = run.board[i]; const st = this.slotStats[i]; if (s && st && (!best || st.dps * s.n > best.v)) best = { s, st, v: st.dps * s.n, i }; }
    if (best) {
      const cm = M.cls[best.s.cls];
      const pct = M.dmgPct + cm.dmg + (this.dyn ? this.dyn.dmgPct : 0) + M.tierDmg[best.s.tier];
      const lv = 1 + run.classLv[best.s.cls] * RS.BAL.upgradePct;
      const aspd = M.aspdPct + cm.aspd + (this.dyn ? this.dyn.aspdPct : 0);
      const crit = best.st.crit, cm2 = best.st.critMult;
      const dyn = this.dyn ? this.dyn.dmgPct : 0;
      // 판 전체에서 각 증강·유물이 dmgPct 에 보탠 몫
      const src = {};
      const add = (k, v) => { if (v) src[k] = (src[k] || 0) + v; };
      for (const id of run.augments) { const d = RS.augDef(id); const m = RS.isUpgraded(id) ? (RS.upgradeScale(d.mods, 1.5) || d.mods) : d.mods; add('aug:' + d.id, (m.dmgPct || 0) + ((m.cls && m.cls[best.s.cls] && m.cls[best.s.cls].dmg) || 0) + ((m.tierDmg && m.tierDmg[best.s.tier]) || 0)); }
      for (const id of run.relics) { const m = RS.REL[id].mods; add('rel:' + id, (m.dmgPct || 0) + ((m.cls && m.cls[best.s.cls] && m.cls[best.s.cls].dmg) || 0) + ((m.tierDmg && m.tierDmg[best.s.tier]) || 0)); }
      for (const id of run.curses) add('cur:' + id, RS.CURSE[id].mods.dmgPct || 0);
      let legends = 0; for (const b of run.board) if (b && b.tier >= 3) legends += b.n * (b.tier >= 4 ? 4 : 1);
      add('dyn:분노의 뿔(웨이브 누적)', this.demon);
      add('dyn:전설의 위엄', M.legendAura ? M.legendAura * legends : 0);
      add('dyn:광전사', M.berserk ? Math.min(1, 0.05 * Math.max(0, run.maxLife - run.life) * M.berserk) : 0);
      add('dyn:나머지', dyn - this.demon - (M.legendAura ? M.legendAura * legends : 0) - (M.berserk ? Math.min(1, 0.05 * Math.max(0, run.maxLife - run.life) * M.berserk) : 0));
      // 단련(permDmg)·상처(injMul)는 피해% 묶음 밖에서 따로 곱한다
      const sep = (1 + (run.permDmg || 0)) * (this.dyn && this.dyn.injMul != null ? this.dyn.injMul : 1);
      rows.push({ src, won: result === 'won', pct, lv, sep, lvN: run.classLv[best.s.cls], aspd, critF: 1 + Math.min(1, crit) * (cm2 - 1), elite: M.eliteDmgPct, corr: run.augments.some((id) => RS.augDef(id).id === 'corruption'), augs: run.augments.length, tier: best.s.tier });
    }
  }
  return oldFinish.call(this, result, reason);
};
for (let k = 0; k < n; k++) playRun(RS, seed + k, 'smart', { commander: cmds[k % cmds.length] });
const q = (a, f) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(f * (s.length - 1))]; };
const show = (name, f) => { const a = rows.map(f); console.log(name.padEnd(22), 'p10', q(a, 0.1).toFixed(2), ' p50', q(a, 0.5).toFixed(2), ' p90', q(a, 0.9).toFixed(2), ' max', Math.max(...a).toFixed(2)); };
console.log('3막 보스전 도달', rows.length, '판 · 가장 센 칸 기준 배율');
show('피해% 합 (1+합)', (r) => 1 + r.pct);
show('강화 배율 (1+pct×Lv)', (r) => r.lv);
show('단련×상처 배율', (r) => r.sep);
show('강화 레벨', (r) => r.lvN);
show('공속% 합 (1+합)', (r) => 1 + r.aspd);
show('치명 기대 배율', (r) => r.critF);
show('곱 (피해×강화×단련상처×공속×치명)', (r) => (1 + r.pct) * r.lv * r.sep * (1 + r.aspd) * r.critF);
const agg = {};
for (const r of rows) for (const [k, v] of Object.entries(r.src)) { const a = agg[k] || (agg[k] = { n: 0, sum: 0 }); a.n++; a.sum += v; }
console.log('피해% 출처 (보유 판 수 · 보유 시 평균 +%) 상위:');
Object.entries(agg).sort((a, b) => b[1].sum - a[1].sum).slice(0, 16).forEach(([k, a]) => console.log('  ', k.padEnd(40), String(a.n).padStart(3), '판', ('+' + Math.round(100 * a.sum / a.n) + '%').padStart(7), ' 합계기여', Math.round(100 * a.sum / rows.length) + '%p/판'));
const cr = rows.filter((r) => r.corr), nc = rows.filter((r) => !r.corr);
console.log('검은 풀무 있음', cr.length, '강화 Lv 중앙', q(cr.map((r) => r.lvN), 0.5), '승', cr.filter((r) => r.won).length, '| 없음', nc.length, '강화 Lv 중앙', q(nc.map((r) => r.lvN), 0.5), '승', nc.filter((r) => r.won).length);
