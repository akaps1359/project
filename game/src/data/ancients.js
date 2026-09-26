// 고대 존재: 2막·3막을 시작할 때 만나 셋 중 하나를 고른다 (건너뛸 수 없음).
// 슬레이 더 스파이어 2의 '고대 존재'처럼 존재마다 세 갈래 풀이 있어, 선택지 세 개는 늘 성격이 다르다.
(function (RS) {
  'use strict';

  const R = (id, name, icon, desc, mods, extra) => Object.assign({ id, name, rarity: 4, icon, desc, mods: mods || {} }, extra || {});

  // 고대 유물 (보스 유물처럼 강력하고, 대가가 있는 것이 많다)
  const ANCIENT_RELICS = [
    R('forgottenShelf', '망각의 서가', 'scroll', '증강 선택지 +1, 증강을 건너뛸 때 골드 2배', { augChoices: 1, skipGoldMul: 1 }),
    R('forbiddenIndex', '금단의 색인', 'lens', '앞으로 얻는 증강이 30% 확률로 연마된 채 들어온다', { augUpChance: 0.3 }),
    R('stoppedClock', '멈춘 시계', 'watch', '모든 적 이동 속도 -12%, 보스 제한 시간 +20초', { enemySpeedPct: 0.12, bossTimeAdd: 20 }),
    R('rewindSand', '되감기 모래', 'hourglass', '전투마다 처음 세 번은 한 바퀴를 돈 적에게 생명을 잃지 않는다', { leakShield: 3 }),
    R('dragonScale', '용비늘 금화', 'coins', '웨이브 시작 골드 +100%, 이자 한도 +5', { waveGoldPct: 1, interestCap: 5 }),
    R('goldenEgg', '황금 알', 'egg', '전투에서 이기면 골드 +25×막', { winGold: 25 }),
    R('bloodPactCup', '혈맹의 잔', 'chalice', '최대 생명 +10, 전투에서 이기면 생명 +4', { winHeal: 4 }, {
      onPick(run) { RS.changeMaxLife(run, 10); RS.heal(run, 10); },
    }),
    R('bloodCrown', '피의 왕관', 'crown', '모든 유닛 피해 +30%', { dmgPct: 0.3, battleStartLifeLoss: 2 }, { cost: '전투를 시작할 때 생명 -2' }),
    R('twinStar', '쌍둥이 별', 'twin', '합성할 때 25% 확률로 결과 유닛 2기', { mergeMirror: 0.25 }),
    R('luckyStar', '행운의 별', 'star', '소환 시 희귀 확률 +15%, 영웅 확률 +3%', { rareChance: 0.15, epicChance: 0.03 }),
    R('sealOfGold', '황금 인장', 'coin', '웨이브가 시작될 때마다 골드 3을 내고 무료 소환 1회', { sealSummon: 3 }, { cost: '웨이브마다 골드 -3' }),
    R('pumpkinCandle', '호박 양초', 'lantern', '다음 5번의 전투 동안 모든 유닛 피해 +40%. 휴식처에서 다시 켤 수 있다', {}, { state: { charges: 5 } }),
    R('waxToys', '밀랍 장난감 상자', 'box', '모든 유닛 공격 속도 +30%. 전투 3번마다 녹아 10%p씩 줄어든다', {}, { state: { fights: 0 } }),
    R('lordParasol', '영주의 양산', 'crown2', '상점에서 첫 번째로 사는 물건은 공짜', { freeFirstBuy: 1 }),
    R('whisperEarring', '속삭이는 귀걸이', 'charm', '모든 유닛 공격 속도 +45%', { aspdPct: 0.45, prepLocked: 1 }, { cost: '준비 시간 동안 소환·강화를 할 수 없다' }),
    R('spikedGauntlet', '가시 건틀릿', 'fist', '모든 유닛 피해 +45%', { dmgPct: 0.45, upgradeCostPct: 0.5 }, { cost: '강화 비용 +50%' }),
    R('warHammerA', '전쟁 망치', 'hammer', '엘리트를 처치하면 무작위 증강 2개 연마', { eliteUpgrade: 2 }),
    R('loomingFruit', '어렴풋한 열매', 'mango', '최대 생명 +12', {}, {
      onPick(run) { RS.changeMaxLife(run, 12); RS.heal(run, 12); },
    }),
  ];
  for (const r of ANCIENT_RELICS) RS.RELICS.push(r);
  for (const r of ANCIENT_RELICS) RS.REL[r.id] = r;

  // 즉시 효과형 축복
  const BOONS = {
    upgrade2: { name: '연마의 손길', desc: '증강 2개를 골라 강화', apply(run) { RS.enqueue(run, { k: 'upgrade', title: '고대의 손길' }); RS.enqueue(run, { k: 'upgrade', title: '고대의 손길' }); } },
    cleanse: { name: '정화', desc: '저주를 모두 없애고 생명을 모두 회복', apply(run) { run.curses = run.curses.filter((id) => RS.CURSE[id].permanent); RS.heal(run, run.maxLife); } },
    legend: { name: '전설의 부름', desc: '무작위 전설 유닛 1기', apply(run) { RS.grantUnits(run, 3, 1); } },
    gold400: { name: '황금 비', desc: '골드 +400', apply(run) { RS.addGold(run, 400); } },
    epic2: { name: '영웅 둘', desc: '무작위 영웅 유닛 2기', apply(run) { RS.grantUnits(run, 2, 2); } },
    maxLife15: { name: '생명의 샘', desc: '최대 생명 +15, 생명 모두 회복', apply(run) { RS.changeMaxLife(run, 15); RS.heal(run, run.maxLife); } },
    prism2: { name: '프리즘 계시', desc: '프리즘 증강을 두 번 고른다', apply(run) { RS.enqueue(run, { k: 'aug', w: [0, 0, 0, 1], title: '프리즘 계시' }); RS.enqueue(run, { k: 'aug', w: [0, 0, 0, 1], title: '프리즘 계시' }); } },
    runes2: { name: '룬 각인', desc: '룬 두 개를 골라 보드에 새긴다', apply(run) { for (let k = 0; k < 2; k++) RS.enqueue(run, { k: 'runeChoice', runes: pick2(run), title: '룬 각인' }); } },
    trainAll2: { name: '고대 수련', desc: '모든 클래스 강화 +2', apply(run) { for (const c of RS.CLASSES) run.classLv[c] += 2; } },
    bossRelic: { name: '보물 더미', desc: '보스 유물 2개 중 하나를 고른다', apply(run) { const ids = RS.rollRelics(run, 2, [3], [1]); if (ids.length) RS.enqueue(run, { k: 'relicList', ids, title: '보물 더미' }); } },
    relicPair: { name: '도전자의 배낭', desc: '무작위 희귀 유물 1개와 일반 유물 1개', apply(run) { RS.grantRandomRelic(run, [2]); RS.grantRandomRelic(run, [1]); } },
  };
  function pick2(run) {
    const a = RS.randomRune(run.rng);
    let b = a;
    while (b === a) b = RS.randomRune(run.rng);
    return [a, b];
  }

  // 존재마다 풀 세 개. 선택지는 풀마다 하나씩
  RS.ANCIENTS = [
    {
      id: 'orven', name: '망각의 사서 오르벤', icon: 'scroll', acts: [2],
      text: '"기억은 무겁지. 몇 가지를 덜어 주고, 몇 가지를 더 새겨 주마."',
      pools: [['forgottenShelf', 'forbiddenIndex'], ['upgrade2', 'cleanse'], ['runes2', 'prism2']],
    },
    {
      id: 'chrono', name: '시간의 파수꾼 크로노', icon: 'hourglass', acts: [2, 3],
      text: '"시간은 강물이야. 조금만 비틀면 너에게 유리하게 흐르지."',
      pools: [['stoppedClock', 'rewindSand'], ['pumpkinCandle', 'waxToys'], ['legend', 'trainAll2']],
    },
    {
      id: 'varga', name: '탐욕의 용 바르가', icon: 'egg', acts: [2],
      text: '"반짝이는 걸 좋아하나? 나도 그래. 나눠 줄 수도 있지… 대가만 맞으면."',
      pools: [['dragonScale', 'goldenEgg'], ['sealOfGold', 'lordParasol'], ['gold400', 'bossRelic']],
    },
    {
      id: 'sera', name: '혈맹의 여왕 세라', icon: 'chalice', acts: [3],
      text: '"피로 맺은 약속은 깨지지 않아. 너도 그 맛을 보겠느냐?"',
      pools: [['bloodPactCup', 'loomingFruit'], ['bloodCrown', 'spikedGauntlet'], ['maxLife15', 'epic2']],
    },
    {
      id: 'gemi', name: '쌍둥이 별 제미', icon: 'twin', acts: [3],
      text: '"하나보다는 둘! 둘보다는… 음, 셋은 욕심이려나?"',
      pools: [['twinStar', 'luckyStar'], ['whisperEarring', 'warHammerA'], ['epic2', 'prism2']],
    },
    {
      id: 'dar', name: '수집가 다르', icon: 'bag', acts: [2, 3],
      text: '"예전 도전자들이 두고 간 것들이야. 하나쯤 가져가도 되겠지."',
      pools: [['bossRelic'], ['relicPair'], ['legend', 'gold400']],
    },
  ];
  RS.ANCIENT = {};
  for (const a of RS.ANCIENTS) RS.ANCIENT[a.id] = a;

  RS.rollAncient = function (run) {
    const rng = run.rng;
    const seen = run.seenAncients || (run.seenAncients = []);
    let pool = RS.ANCIENTS.filter((a) => a.acts.indexOf(run.act) >= 0 && seen.indexOf(a.id) < 0);
    if (!pool.length) pool = RS.ANCIENTS.filter((a) => a.acts.indexOf(run.act) >= 0);
    const A = rng.pick(pool);
    seen.push(A.id);
    const owned = {};
    for (const id of run.relics) owned[id] = true;
    const boons = [];
    const fresh = (b) => !owned[b] && boons.indexOf(b) < 0;
    for (const p of A.pools) {
      let opts = p.filter(fresh);
      // 풀이 다 떨어졌으면 다른 풀에서 아직 안 나온 것을 고른다 (같은 선택지가 두 번 나오지 않게)
      if (!opts.length) opts = [].concat(...A.pools).filter(fresh);
      if (!opts.length) opts = Object.keys(BOONS).filter(fresh);
      if (opts.length) boons.push(rng.pick(opts));
    }
    return { id: A.id, boons, done: false };
  };

  RS.ancientBoon = function (id) {
    if (RS.REL[id]) {
      const r = RS.REL[id];
      return { name: r.name + ' (고대 유물)', desc: r.desc, cost: r.cost };
    }
    return BOONS[id];
  };

  RS.applyAncient = function (run, id) {
    if (RS.REL[id]) RS.addRelic(run, id);
    else BOONS[id].apply(run);
  };
})((globalThis.RS = globalThis.RS || {}));
