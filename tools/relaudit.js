// itemval.js --out 결과 여러 개(시드별)를 합쳐 유물별 평균을 등급별로 보여 준다.
// 사용법: node tools/relaudit.js a.json b.json [...] [--md]
// 등급마다 중앙값과 기대 범위(중앙값 ±0.8층)를 계산해, 위로 벗어나면 '사기?', 아래로 벗어나면 '약함?'을 붙인다.
// --md 를 주면 보고서에 붙일 마크다운 표를 찍는다.
'use strict';
const args = process.argv.slice(2);
const md = args.includes('--md');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.log('사용법: node tools/relaudit.js a.json b.json [...] [--md]');
  process.exit(1);
}
const all = {};
const bases = [];
for (const f of files) {
  const j = JSON.parse(require('fs').readFileSync(f, 'utf8'));
  bases.push(j.base);
  for (const r of j.rows) {
    const x = (all[r.key] = all[r.key] || { key: r.key, name: r.name, rarity: r.rarity, d: [], w: [] });
    x.d.push(r.dDepth);
    x.w.push(r.dWin);
  }
}
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const rows = Object.values(all).map((x) => ({ ...x, dd: avg(x.d), ww: avg(x.w) }));
const RN = ['', '일반', '희귀', '보스', '방랑'];
const band = 0.8;
console.log(`파일 ${files.length}개 · 기준 승률 ${bases.map((b) => (b.win * 100).toFixed(1) + '%').join(' / ')} · 기준 깊이 ${bases.map((b) => b.depth.toFixed(2)).join(' / ')}`);
for (const rar of [...new Set(rows.map((r) => r.rarity))].sort()) {
  const g = rows.filter((r) => r.rarity === rar).sort((a, b) => b.dd - a.dd);
  const med = g[Math.floor(g.length / 2)].dd;
  console.log(`\n── ${RN[rar]} (${g.length}종) · 중앙값 ${med.toFixed(2)}층 · 평균 ${avg(g.map((r) => r.dd)).toFixed(2)}층 · 기대 범위 ${(med - band).toFixed(2)} ~ ${(med + band).toFixed(2)}`);
  if (md) console.log('| 유물 | id | 층 | 승률 %p | 시드별 층 |\n|---|---|---:|---:|---|');
  for (const r of g) {
    const flag = r.dd > med + band ? '사기?' : r.dd < med - band ? '약함?' : '';
    const per = r.d.map((v) => (v >= 0 ? '+' : '') + v.toFixed(2)).join(' / ');
    const id = r.key.replace(/^rel:/, '');
    if (md) console.log(`| ${r.name} | ${id} | ${(r.dd >= 0 ? '+' : '') + r.dd.toFixed(2)} | ${(r.ww >= 0 ? '+' : '') + (r.ww * 100).toFixed(1)} | ${per} ${flag} |`);
    else console.log(`${(r.dd >= 0 ? '+' : '') + r.dd.toFixed(2).padStart(5)}층 ${(r.ww >= 0 ? '+' : '') + (r.ww * 100).toFixed(1).padStart(5)}%p  ${id.padEnd(16)} ${r.name.padEnd(8)} [${per}] ${flag}`);
  }
}
