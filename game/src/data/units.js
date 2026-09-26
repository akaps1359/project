// 밸런스 상수, 유닛·등급·적·막(Act) 데이터
(function (RS) {
  'use strict';

  // 밸런스 조정은 여기서. tools/sim.js 가 이 값을 그대로 사용한다.
  RS.BAL = {
    startGold: 60,
    startLife: 20,
    fieldCap: 60, // 필드 위 적이 이 수에 도달하면 즉시 패배
    summonBase: 10, // 소환 비용 = base + step × (지금까지 소환 횟수)
    summonStep: 1,
    rareChance: 0.05, // 소환 시 희귀 등급 기본 확률
    epicChance: 0.005,
    hpBase: 64, // 웨이브 레벨 0의 슬라임 체력 (첫 몇 레벨은 60%부터 완만하게)
    hpGrowth: [0, 1.1097, 1.077, 1.0649, 1.0518], // [막] 웨이브 레벨당 체력 배율 (한 막 = 30레벨). 후반엔 플레이어 성장도 느려진다
    waveTime: 16, // 다음 웨이브까지 시간(초)
    prepTime: 5,
    spawnGap: 0.55,
    wavesPerStage: 3,
    waveGold: [0, 6, 10, 14], // [막] 웨이브 시작 골드
    killGoldMul: [0, 1, 1.6, 2.2], // [막] 처치 골드 배율
    earlyBonus: [0, 2, 3, 4], // [막] 웨이브를 일찍 정리하면 받는 골드
    interestPer: 10, // 보유 골드 10당 이자 1
    interestCap: 5,
    clearGold: { combat: [0, 20, 30, 40], elite: [0, 35, 50, 65], boss: [0, 60, 80, 0] },
    skipGold: [0, 25, 40, 55], // 증강 건너뛰기 골드
    upgradeBase: 30, // 강화 비용 = base + step × 레벨
    upgradeStep: 20,
    upgradePct: 0.15, // 강화 1레벨당 해당 클래스 피해 +15%
    bossTime: 75, // 보스 제한 시간. 넘기면 폭주
    restHealPct: 0.3,
    trainLevels: 2,
    actHealPct: 0.25, // 막을 넘어갈 때 회복
    // 판매가 = 그 유닛에 들인 골드 × 0.5 (미다스 등으로 올라도 최대 0.8). 합성하면 재료에 들인 골드가 결과로 옮겨 간다.
    // 돈을 내지 않고 얻은 유닛(보상·무료 소환)은 freeWorth × 3^등급 만큼 들인 것으로 친다.
    sellRate: 0.5,
    sellRateMax: 0.8,
    freeWorth: 6,
  };

  RS.CLASSES = ['knight', 'archer', 'mage', 'rogue', 'frost'];

  // dmgType: heavy(무거운 물리) / light(가벼운 물리) / magic(마법)
  RS.CLASS = {
    knight: {
      name: '전사', role: '근접 · 휘두르기', dmgType: 'heavy', melee: true,
      dmg: 16, interval: 1.1, range: 34,
      cleave: 0.4, cleaveR: 12,
      stun: [0, 0.06, 0.1, 0.14], stunDur: 0.5,
      desc: '묵직한 한 방. 대상 주변 적에게 40% 휘두르기 피해. 희귀 등급부터 기절.',
    },
    archer: {
      name: '궁수', role: '원거리 · 연사', dmgType: 'light',
      dmg: 8, interval: 0.6, range: 66,
      shots: [1, 1, 2, 3],
      desc: '가장 긴 사거리. 영웅 등급은 2발, 전설 등급은 3발을 동시에 쏜다.',
    },
    mage: {
      name: '마법사', role: '광역 · 폭발', dmgType: 'magic',
      dmg: 13, interval: 1.5, range: 60,
      splash: [14, 16, 19, 23],
      desc: '느리지만 폭발 범위 안의 모든 적에게 같은 피해.',
    },
    rogue: {
      name: '도적', role: '근접 · 치명타', dmgType: 'light', melee: true,
      dmg: 6, interval: 0.4, range: 36,
      crit: [0.2, 0.25, 0.3, 0.35], critMult: [2, 2, 2.2, 2.5],
      desc: '매우 빠른 공격. 높은 확률로 치명타.',
    },
    frost: {
      name: '서리술사', role: '보조 · 둔화', dmgType: 'magic',
      dmg: 6, interval: 1.0, range: 60,
      slow: [0.25, 0.3, 0.35, 0.4], slowDur: 1.4,
      frostSplash: [0, 0, 10, 14], freeze: [0, 0, 0, 0.1],
      desc: '맞은 적을 느리게 만든다. 영웅 등급부터 주변까지, 전설 등급은 빙결.',
    },
  };

  RS.TIER = [
    { name: '일반', color: '#aab3bf', dark: '#6b7383', light: '#dfe4ea', dmg: 1, spd: 1 },
    { name: '희귀', color: '#4f8fe6', dark: '#2b5aa6', light: '#94c1f7', dmg: 3.5, spd: 0.93 },
    { name: '영웅', color: '#a65ee8', dark: '#6a33a3', light: '#d3a0f7', dmg: 12, spd: 0.86 },
    { name: '전설', color: '#f2a531', dark: '#b1680f', light: '#ffd98a', dmg: 40, spd: 0.8 },
  ];

  // hp: 웨이브 레벨 체력 대비 배율, leak: 한 바퀴 돌 때 잃는 생명
  RS.ENEMY = {
    slime: { name: '슬라임', hp: 1, speed: 26, gold: 1, leak: 1 },
    bat: { name: '박쥐', hp: 0.6, speed: 44, gold: 1, leak: 1, countMul: 1.3, gap: 0.4 },
    golem: { name: '돌골렘', hp: 2.4, speed: 17, gold: 2, leak: 1, armorLight: 0.5, countMul: 0.6, gap: 0.8, trait: '궁수·도적 피해 50% 감소' },
    ghost: { name: '유령', hp: 1.2, speed: 30, gold: 1, leak: 1, physRes: 0.4, trait: '물리 피해 40% 감소' },
    skeleton: { name: '해골 병사', hp: 0.9, speed: 28, gold: 1, leak: 1, countMul: 1.1 },
    imp: { name: '임프', hp: 0.8, speed: 36, gold: 1, leak: 1, countMul: 1.1 },
    shaman: { name: '고블린 주술사', hp: 1.5, speed: 24, gold: 2, leak: 1, countMul: 0.5, gap: 0.9, heal: { every: 3, pct: 0.06, r: 32 }, trait: '주변 적 체력 회복' },
    // 엘리트
    ogre: { name: '오우거', hp: 9, speed: 20, gold: 8, leak: 3, elite: true },
    darkKnight: { name: '흑기사', hp: 7, speed: 22, gold: 8, leak: 3, elite: true, armorLight: 0.5, trait: '궁수·도적 피해 50% 감소' },
    witch: { name: '마녀', hp: 6, speed: 26, gold: 8, leak: 3, elite: true, haste: { every: 5, pct: 0.4, dur: 2, r: 44 }, trait: '주변 적 가속' },
    bigSlime: { name: '왕슬라임', hp: 6, speed: 20, gold: 8, leak: 3, elite: true, split: { type: 'slime', n: 3, hp: 0.5 }, trait: '죽으면 분열' },
    // 보스
    slimeKing: { name: '슬라임 킹', hp: 7.5, speed: 13, gold: 40, leak: 6, boss: true, splitAt: [0.66, 0.33], splitN: 4, splitHp: 0.5, trait: '체력이 줄면 슬라임을 뱉는다' },
    lich: { name: '리치', hp: 7, speed: 14, gold: 40, leak: 6, boss: true, physRes: 0.25, summon: { every: 8, type: 'skeleton', n: 2, hp: 0.6 }, trait: '물리 피해 25% 감소, 해골 소환' },
    // 대체 막 (안개 늪 · 가라앉은 항구)
    frog: { name: '늪 개구리', hp: 0.9, speed: 24, gold: 1, leak: 1, hop: { every: 3.5, dist: 26 }, trait: '가끔 앞으로 크게 뛴다' },
    crab: { name: '철갑 게', hp: 2, speed: 19, gold: 2, leak: 1, armorLight: 0.5, countMul: 0.7, gap: 0.7, trait: '궁수·도적 피해 50% 감소' },
    bogQueen: { name: '늪의 여왕', hp: 7.5, speed: 14, gold: 40, leak: 6, boss: true, summon: { every: 6, type: 'frog', n: 2, hp: 0.6 }, submerge: { every: 8, dur: 2 }, trait: '개구리를 부르고, 가끔 물속에 잠겨 공격받지 않는다' },
    captain: { name: '해골 선장', hp: 7, speed: 14, gold: 40, leak: 6, boss: true, physRes: 0.15, summon: { every: 9, type: 'skeleton', n: 3, hp: 0.5 }, anchor: { every: 7, warn: 1.2, stun: 2 }, trait: '닻을 던져 한 줄의 유닛을 기절시키고 해골 선원을 부른다' },
    dummy: { name: '낡은 허수아비', hp: 1, speed: 11, gold: 0, leak: 0, trait: '시간 안에 쓰러뜨려야 하는 시험 대상' },
    // 4막
    spireShield: { name: '균열 방패병', hp: 7.5, speed: 16, gold: 10, leak: 4, elite: true, armorLight: 0.5, physRes: 0.2, trait: '궁수·도적 피해 50%, 모든 물리 피해 20% 감소' },
    spireSpear: { name: '균열 창병', hp: 6, speed: 30, gold: 10, leak: 4, elite: true, haste: { every: 4, pct: 0.35, dur: 2, r: 50 }, trait: '빠르고 주변 적을 가속' },
    riftHeart: { name: '균열의 심장', hp: 28, speed: 12, gold: 0, leak: 12, boss: true, dpsCap: 0.03, bossTimeAdd: 30, summon: { every: 6, type: 'imp', n: 2, hp: 0.5 }, trait: '1초에 최대 체력의 3%까지만 피해를 받는다. 임프를 부른다' },
    riftLord: { name: '균열의 군주', hp: 10, speed: 14, gold: 40, leak: 6, boss: true, rift: { every: 9, warn: 1.3, stun: 2.5 }, rage: 0.5, trait: '균열로 유닛을 기절시킨다. 체력 절반에서 가속' },
  };

  // pool: [적, 가중치, 등장 진행도(d)]. 1막·2막은 슬레이 더 스파이어 2처럼 두 지역 중 하나가 무작위로 나온다
  RS.ACT_VARIANTS = [
    [
      {
        id: 'forest', name: '슬라임 숲', boss: 'slimeKing', theme: 'forest',
        pool: [['slime', 5, 1], ['bat', 3, 2], ['golem', 2, 3]],
        elites: ['bigSlime', 'ogre'],
      },
      {
        id: 'bog', name: '안개 늪', boss: 'bogQueen', theme: 'bog',
        pool: [['frog', 5, 1], ['slime', 2, 1], ['bat', 3, 2], ['crab', 1, 4]],
        elites: ['bigSlime', 'witch'],
      },
    ],
    [
      {
        id: 'grave', name: '망자의 묘지', boss: 'lich', theme: 'grave',
        pool: [['slime', 1, 1], ['bat', 3, 1], ['golem', 2, 1], ['ghost', 3, 1], ['skeleton', 3, 1], ['imp', 2, 14]],
        elites: ['darkKnight', 'witch', 'ogre'],
      },
      {
        id: 'harbor', name: '가라앉은 항구', boss: 'captain', theme: 'harbor',
        pool: [['crab', 3, 1], ['skeleton', 3, 1], ['ghost', 2, 1], ['frog', 2, 1], ['imp', 2, 14]],
        elites: ['darkKnight', 'ogre', 'bigSlime'],
      },
    ],
    [
      {
        id: 'rift', name: '균열의 첨탑', boss: 'riftLord', theme: 'rift',
        pool: [['bat', 2, 1], ['golem', 3, 1], ['ghost', 3, 1], ['imp', 3, 1], ['skeleton', 2, 1], ['shaman', 2, 23]],
        elites: ['darkKnight', 'witch', 'bigSlime', 'ogre'],
      },
    ],
    [
      {
        id: 'heart', name: '균열의 심장부', boss: 'riftHeart', theme: 'heart',
        pool: [['imp', 3, 1], ['ghost', 3, 1], ['golem', 2, 1], ['shaman', 2, 1]],
        elites: ['spireShield', 'spireSpear'],
      },
    ],
  ];
  // 예전 코드 호환: 각 막의 첫 번째 지역
  RS.ACTS = RS.ACT_VARIANTS.map((v) => v[0]);
  RS.actDef = (run) => {
    const vs = RS.ACT_VARIANTS[run.act - 1];
    return vs[(run.variants && run.variants[run.act]) || 0] || vs[0];
  };
})((globalThis.RS = globalThis.RS || {}));
