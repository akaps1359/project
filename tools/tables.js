#!/usr/bin/env node
// 게임 데이터에서 기획서용 마크다운 표를 뽑는다: node tools/tables.js > /tmp/tables.md
'use strict';

const { loadRS } = require('./sim.js');
const RS = loadRS();
const out = [];
const p = (s) => out.push(s);
const pct = (v) => `${Math.round(v * 100)}%`;

p('### 유닛 (일반 등급 기준)\n');
p('| 클래스 | 역할 | 피해 유형 | 피해 | 공격 간격 | 사거리 | 특수 |');
p('|---|---|---|---:|---:|---:|---|');
const TYPE = { heavy: '무거운 물리', light: '가벼운 물리', magic: '마법' };
for (const id of RS.CLASSES) {
  const c = RS.CLASS[id];
  const sp = [];
  if (c.cleave) sp.push(`휘두르기 ${pct(c.cleave)} (반경 ${c.cleaveR})`);
  if (c.stun) sp.push(`기절 ${c.stun.map(pct).join('/')}`);
  if (c.shots) sp.push(`발사 수 ${c.shots.join('/')}`);
  if (c.splash) sp.push(`폭발 반경 ${c.splash.join('/')}`);
  if (c.crit) sp.push(`치명 ${c.crit.map(pct).join('/')} ×${c.critMult.join('/')}`);
  if (c.slow) sp.push(`둔화 ${c.slow.map(pct).join('/')}, 영웅+ 주변, 전설 빙결 ${pct(c.freeze[3])}`);
  p(`| ${c.name} | ${c.role} | ${TYPE[c.dmgType]} | ${c.dmg} | ${c.interval}초 | ${c.range} | ${sp.join(' · ')} |`);
}
p('\n등급별 배율: ' + RS.TIER.map((t) => `${t.name} 피해 ×${t.dmg}, 공격 간격 ×${t.spd}`).join(' / ') + '. 사거리는 등급마다 +3.\n');

p('### 적\n');
p('| 이름 | 구분 | 체력 배율 | 속도 | 처치 골드 | 누수 피해 | 특성 |');
p('|---|---|---:|---:|---:|---:|---|');
for (const id in RS.ENEMY) {
  const e = RS.ENEMY[id];
  p(`| ${e.name} | ${e.boss ? '보스' : e.elite ? '엘리트' : '일반'} | ×${e.hp} | ${e.speed} | ${e.gold} | ${e.leak} | ${e.trait || '-'} |`);
}

p('\n### 증강 (' + RS.AUGMENTS.length + '종)\n');
p('| 등급 | 이름 | 효과 | 대가 | 중첩 |');
p('|---|---|---|---|---|');
for (const a of RS.AUGMENTS) p(`| ${RS.RARITY_NAME.aug[a.rarity]} | ${a.name} | ${a.desc} | ${a.cost || '-'} | ${a.unique ? '1회' : '가능'} |`);

p('\n### 유물 (' + RS.RELICS.length + '종)\n');
p('| 등급 | 이름 | 효과 | 대가 |');
p('|---|---|---|---|');
for (const r of RS.RELICS) p(`| ${RS.RARITY_NAME.relic[r.rarity]} | ${r.name} | ${r.desc} | ${r.cost || '-'} |`);

p('\n### 소모품\n');
p('| 이름 | 효과 |');
p('|---|---|');
for (const it of RS.ITEMS) p(`| ${it.name} | ${it.desc} |`);

p('\n### 저주\n');
p('| 이름 | 효과 |');
p('|---|---|');
for (const c of RS.CURSES) p(`| ${c.name} | ${c.desc} |`);

p('\n### 이벤트 (' + RS.EVENTS.length + '종)\n');
p('| 이벤트 | 막 | 선택지 |');
p('|---|---|---|');
const fake = RS.newRun(1, {});
const txt = (v) => {
  try {
    return typeof v === 'function' ? v(fake) : v;
  } catch (e) {
    return '(상황에 따라)';
  }
};
for (const e of RS.EVENTS) {
  const opts = (e.steps ? e.steps[0].options : e.options).map((o) => `**${txt(o.label)}**: ${txt(o.desc)}`).join('<br>');
  p(`| ${e.title}${e.steps ? ' (여러 단계)' : ''} | ${e.acts ? e.acts.join('·') : '전체'} | ${opts} |`);
}

p('\n### 지휘관\n');
p('| 지휘관 | 시작 유물 | 특징 | 해금 |');
p('|---|---|---|---|');
for (const c of RS.COMMANDERS) p(`| ${c.title} ${c.name} | ${RS.REL[c.relic].name}: ${RS.REL[c.relic].desc} | ${c.desc} | ${c.unlock ? c.unlock.text : '처음부터'} |`);

p('\n### 차원 방랑자 (2·3막 시작)\n');
p('| 방랑자 | 막 | 선택지 풀 1 | 풀 2 | 풀 3 |');
p('|---|---|---|---|---|');
const boon = (id) => {
  const b = RS.ancientBoon(id);
  return `${b.name.replace(' (방랑자 유물)', '')}: ${b.desc}${b.cost ? ` (대가: ${b.cost})` : ''}`;
};
for (const a of RS.ANCIENTS) p(`| ${a.name} | ${a.acts.join('·')} | ${a.pools.map((pool) => pool.map(boon).join('<br>')).join(' | ')} |`);

p('\n### 룬\n');
p('| 룬 | 효과 |');
p('|---|---|');
for (const r of RS.RUNES) p(`| ${r.name} | ${r.desc} |`);

p('\n### 심연\n');
p('| 단계 | 추가 효과 |');
p('|---:|---|');
RS.ASCENSION.forEach((t, i) => i && p(`| ${i} | ${t} |`));

console.log(out.join('\n'));
