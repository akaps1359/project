// 밸런스 상수, 유닛·등급·적·막(Act) 데이터
(function (RS) {
  'use strict';

  // 밸런스 조정은 여기서. tools/sim.js 가 이 값을 그대로 사용한다.
  RS.BAL = {
    startGold: 60,
    startLife: 25,
    fieldCap: 60, // 필드 위 적이 이 수에 도달하면 즉시 패배
    normalHpMul: [0, 1.2, 1.2, 1, 1], // [막] 일반 적 체력 배율 (엘리트·보스 제외)
    pressureDecay: 0.05, // 뒤쪽 길에 적이 없을 때 게이지가 초당 줄어드는 양 (20초면 다 빠진다)
    pressureFill: 25, // 균열 게이지: 한 바퀴 뒤쪽에 머문 적의 가중 시간(초)이 이만큼 쌓이면 생명 -1
    eliteStrikeStep: 0.5, // 엘리트 강타가 막마다 세지는 정도 (0.5면 3막에서 +1)
    summonBase: 10, // 소환 비용 = base + step × (지금까지 소환 횟수)
    summonStep: 1,
    rareChance: 0.05, // 소환 시 희귀 등급 기본 확률
    epicChance: 0.005,
    hpBase: 64, // 웨이브 레벨 0의 슬라임 체력 (첫 몇 레벨은 60%부터 완만하게)
    hpGrowth: [0, 1.1472, 1.1048, 1.0882, 1.0523], // [막] 웨이브 레벨당 체력 배율 (한 막 = 30레벨). 후반엔 플레이어 성장도 느려진다
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
    actHealPct: 1, // 막을 넘어갈 때 잃은 생명 중 이만큼 회복 (1 = 모두)
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
      stun: [0, 0.06, 0.1, 0.14, 0.2], stunDur: 0.5,
      desc: '묵직한 한 방. 대상 주변 적에게 40% 휘두르기 피해. 희귀 등급부터 기절.',
    },
    archer: {
      name: '궁수', role: '원거리 · 연사', dmgType: 'light',
      dmg: 8, interval: 0.6, range: 66,
      shots: [1, 1, 2, 3, 3],
      desc: '가장 긴 사거리. 영웅 등급은 2발, 전설·신화 등급은 3발을 동시에 쏜다.',
    },
    mage: {
      name: '마법사', role: '광역 · 폭발', dmgType: 'magic',
      dmg: 13, interval: 1.5, range: 60,
      splash: [14, 16, 19, 23, 27],
      desc: '느리지만 폭발 범위 안의 모든 적에게 같은 피해.',
    },
    rogue: {
      name: '도적', role: '근접 · 치명타', dmgType: 'light', melee: true,
      dmg: 6, interval: 0.4, range: 36,
      crit: [0.2, 0.25, 0.3, 0.35, 0.4], critMult: [2, 2, 2.2, 2.5, 2.8],
      desc: '매우 빠른 공격. 높은 확률로 치명타.',
    },
    frost: {
      name: '서리술사', role: '보조 · 둔화', dmgType: 'magic',
      dmg: 6, interval: 1.0, range: 60,
      slow: [0.25, 0.3, 0.35, 0.4, 0.45], slowDur: 1.4,
      frostSplash: [0, 0, 10, 14, 18], freeze: [0, 0, 0, 0.1, 0.16],
      desc: '맞은 적을 느리게 만든다. 영웅 등급부터 주변까지, 전설 등급은 빙결.',
    },
  };

  RS.TIER = [
    { name: '일반', color: '#aab3bf', dark: '#6b7383', light: '#dfe4ea', dmg: 1, spd: 1 },
    { name: '희귀', color: '#4f8fe6', dark: '#2b5aa6', light: '#94c1f7', dmg: 3.5, spd: 0.93 },
    { name: '영웅', color: '#a65ee8', dark: '#6a33a3', light: '#d3a0f7', dmg: 12, spd: 0.86 },
    { name: '전설', color: '#f2a531', dark: '#b1680f', light: '#ffd98a', dmg: 40, spd: 0.8 },
    // 신화: 전설 4기를 합성해야 나온다 (기본 공격은 전설 4기와 비슷하고, 힘은 신화 스킬과 봉인 면역에서 나온다)
    { name: '신화', color: '#ef4f6f', dark: '#9e2340', light: '#ffb0c0', dmg: 150, spd: 0.74 },
  ];
  RS.TOP_TIER = RS.TIER.length - 1;
  // 신화 등급 전용 스킬 (cd: 초마다 발동, 없으면 늘 켜져 있는 효과). 같은 칸에 여러 기면 각자 발동한다
  RS.MYTHIC = {
    knight: { name: '대지 가르기', cd: 5, short: '5초마다 주변 모든 적 200% 피해·기절', desc: '5초마다 사거리 안 모든 적에게 200% 피해, 보스가 아닌 적은 0.8초 기절' },
    archer: { name: '화살비', cd: 4, short: '4초마다 필드의 적 6명에게 130% 화살', desc: '4초마다 필드 위 무작위 적 6명에게 화살 (각 130% 피해, 사거리 무시)' },
    mage: { name: '운석 낙하', cd: 6, short: '6초마다 적이 몰린 곳에 운석 350%', desc: '6초마다 적이 가장 많이 모인 곳에 운석 (넓은 범위 350% 피해)' },
    rogue: { name: '그림자 처형', short: '체력 10% 이하 일반 적 즉사 · 치명타 연쇄', desc: '체력 10% 이하인 일반 적을 한 번에 처치. 치명타가 나면 가까운 다른 적도 한 번 더 벤다' },
    frost: { name: '절대 영도', cd: 7, short: '7초마다 주변 적 1.2초 빙결 + 150%', desc: '7초마다 사거리 안 모든 적을 1.2초 얼리고 150% 피해 (보스는 2초 동안 60% 둔화)' },
  };
  // 합성에 필요한 수: 전설부터는 4기
  RS.mergeNeed = (tier) => (tier >= 3 ? 4 : 3);
  // 한 칸에 쌓을 수 있는 수 (합성에 필요한 만큼. 신화는 3기)
  RS.stackMax = (tier) => (tier >= RS.TOP_TIER ? 3 : RS.mergeNeed(tier));
  // 일반 유닛 몇 기 분량인가 (골드 가치·힘 비교용): 1, 3, 9, 27, 108
  RS.tierUnits = (tier) => {
    let u = 1;
    for (let t = 0; t < tier; t++) u *= RS.mergeNeed(t);
    return u;
  };

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
    ogre: { name: '오우거', hp: 12, speed: 20, gold: 8, leak: 1, elite: true, skills: [{ k: 'strike', name: '몽둥이 찍기', every: 8, wind: 2.4, dmg: 1, brk: 0.08, first: 5 }], trait: '몽둥이 찍기: 경고 뒤 생명을 친다 (막마다 세진다). 준비 중에 체력 8%를 깎거나 기절시키면 끊긴다' },
    darkKnight: { name: '흑기사', hp: 9.5, speed: 22, gold: 8, leak: 1, elite: true, armorLight: 0.5, skills: [{ k: 'strike', name: '흑검 베기', every: 9, wind: 2.0, dmg: 1, brk: 0.07, first: 6 }], trait: '궁수·도적 피해 50% 감소. 흑검 베기: 경고 뒤 생명을 친다 (준비 중 체력 7% 또는 기절로 끊김)' },
    witch: { name: '마녀', hp: 8, speed: 26, gold: 8, leak: 1, elite: true, haste: { every: 5, pct: 0.4, dur: 2, r: 44 }, skills: [{ k: 'strike', name: '저주 화살', every: 10, wind: 2.2, dmg: 1, brk: 0.08, first: 6 }], trait: '주변 적 가속. 저주 화살: 경고 뒤 생명을 친다 (준비 중 체력 8% 또는 기절로 끊김)' },
    bigSlime: { name: '왕슬라임', hp: 8, speed: 20, gold: 8, leak: 1, elite: true, split: { type: 'slime', n: 3, hp: 0.5 }, skills: [{ k: 'strike', name: '산성 뱉기', every: 8, wind: 2.4, dmg: 1, brk: 0.1, first: 5 }], trait: '죽으면 분열. 산성 뱉기: 경고 뒤 생명을 친다 (준비 중 체력 10% 또는 기절로 끊김)' },
    // 보스
    slimeKing: {
      name: '슬라임 킹', hp: 13, speed: 13, gold: 40, leak: 3, boss: true, splitAt: [0.75, 0.5, 0.25], splitN: 3, splitHp: 0.5,
      skills: [{ k: 'glue', name: '끈적한 점액', every: 9, warn: 1.1, dur: 4, amt: 0.5, size: 2 }, { k: 'strike', name: '짓누르기', every: 15, wind: 2.5, dmg: 2, brk: 0.04, first: 8 }],
      trait: '체력이 줄 때마다 슬라임을 뱉고, 점액을 뿌려 2×2 칸의 공격을 4초 동안 절반으로 늦춘다. 짓누르기: 경고 뒤 생명 -2 (준비 중 체력 4%를 깎으면 끊김)',
    },
    lich: {
      name: '리치', hp: 12.5, speed: 14, gold: 40, leak: 3, boss: true, physRes: 0.25, summon: { every: 8, type: 'skeleton', n: 2, hp: 0.6 },
      skills: [{ k: 'shield', name: '뼈 방벽', every: 13, pct: 0.12 }, { k: 'strike', name: '영혼 착취', every: 14, wind: 2.5, dmg: 3, brk: 0.05, first: 9 }],
      feed: { r: 44, pct: 0.012 },
      phase2: { at: 0.4, speed: 1.2, cd: 0.7, msg: '리치가 죽음의 힘을 끌어올린다! (더 빨라지고 방벽을 자주 친다)' },
      trait: '물리 피해 25% 감소. 해골을 부르고, 13초마다 체력 12%만큼의 뼈 방벽을 두른다. 주변에서 적이 쓰러질 때마다 영혼을 흡수해 체력 1.2% 회복. 영혼 착취: 경고 뒤 생명 -3 (준비 중 체력 5%를 깎으면 끊김). 체력 40%에서 각성',
    },
    // 대체 막 (안개 늪 · 가라앉은 항구)
    frog: { name: '늪 개구리', hp: 0.9, speed: 24, gold: 1, leak: 1, hop: { every: 3.5, dist: 26 }, trait: '가끔 앞으로 크게 뛴다' },
    crab: { name: '철갑 게', hp: 2, speed: 19, gold: 2, leak: 1, armorLight: 0.5, countMul: 0.7, gap: 0.7, trait: '궁수·도적 피해 50% 감소' },
    bogQueen: {
      name: '늪의 여왕', hp: 13, speed: 14, gold: 40, leak: 3, boss: true, summon: { every: 6, type: 'frog', n: 2, hp: 0.6 }, submerge: { every: 8, dur: 2, heal: 0.04 },
      skills: [{ k: 'glue', name: '늪 진흙', every: 11, warn: 1.1, dur: 3.5, amt: 0.45, size: 2 }, { k: 'strike', name: '늪 물기', every: 15, wind: 2.5, dmg: 2, brk: 0.04, first: 8 }],
      trait: '개구리를 부르고, 물속에 잠겨 공격받지 않으며 체력 4%를 회복한다. 진흙으로 칸의 공격을 늦춘다. 늪 물기: 경고 뒤 생명 -2 (준비 중 체력 4%를 깎으면 끊김)',
    },
    captain: {
      name: '해골 선장', hp: 12.5, speed: 14, gold: 40, leak: 3, boss: true, physRes: 0.15, summon: { every: 9, type: 'skeleton', n: 3, hp: 0.5 }, anchor: { every: 7, warn: 1.2, stun: 2 },
      skills: [{ k: 'rally', name: '럼 한 모금', every: 12, pct: 0.35, dur: 3 }, { k: 'plunder', name: '약탈', every: 14, pct: 0.15, max: 40 }, { k: 'strike', name: '대포 사격', every: 12, wind: 2.5, dmg: 3, brk: 0.05, first: 7 }],
      trait: '닻을 던져 한 줄의 유닛을 기절시키고 해골 선원을 부른다. 12초마다 모든 적이 3초 동안 35% 빨라지고, 14초마다 가진 골드의 15%(최대 40)를 약탈한다. 대포 사격: 경고 뒤 생명 -3 (준비 중 체력 5%를 깎으면 끊김)',
    },
    dummy: { name: '낡은 허수아비', hp: 1, speed: 11, gold: 0, leak: 0, trait: '시간 안에 쓰러뜨려야 하는 시험 대상' },
    // 4막
    spireShield: {
      name: '방패 사도', hp: 10.5, speed: 16, gold: 10, leak: 1, elite: true, armorLight: 0.5, physRes: 0.2,
      skills: [{ k: 'cross', name: '돌진', every: 8, warn: 1.0, stun: 2.2, selfStun: 2.2, speed: 100, first: 5 }],
      trait: '궁수·도적 피해 50%, 물리 20% 감소. 8초마다 보드를 가로질러 돌진해 지나간 칸을 2.2초 기절시키고, 도착하면 스스로 2.2초 기절',
    },
    spireSpear: {
      name: '창 사도', hp: 8.5, speed: 30, gold: 10, leak: 1, elite: true, haste: { every: 4, pct: 0.35, dur: 2, r: 50 },
      skills: [{ k: 'cross', name: '꿰뚫기', every: 6, warn: 0.8, stun: 1.6, selfStun: 1.8, speed: 140, first: 4 }],
      trait: '빠르고 주변 적을 가속. 6초마다 보드를 가로질러 꿰뚫어 지나간 칸을 1.6초 기절시키고, 도착하면 스스로 1.8초 기절',
    },
    riftHeart: {
      name: '고대신 옴네크', hp: 34, speed: 14, gold: 0, leak: 9, boss: true, dpsCap: 0.028, bossTimeAdd: 25,
      skills: [
        { k: 'pulse', name: '광기의 시선', every: 9, warn: 0.9, dur: 2.5, amt: 0.35 },
        { k: 'spawn', every: 6, type: 'imp', n: 2, hp: 0.6, wind: 0 },
        { k: 'spawn', name: '사도 부르기', every: 20, type: 'spireSpear', n: 1, hp: 0.3, first: 10 },
        { k: 'shield', name: '봉인의 장막', every: 18, pct: 0.08, first: 8, seal: 2 },
        { k: 'shuffle', name: '혼돈의 속삭임', every: 13, n: 4, first: 15 },
        { k: 'rift', every: 12, warn: 1.2, stun: 2.5 },
        { k: 'doze', name: '깊은 잠', every: 17, first: 13, dur: 4.5, heal: 0.01, cap: 1.5 },
        { k: 'strike', name: '신의 손길', every: 15, wind: 2.8, dmg: 4, brk: 0.05, first: 20 },
      ],
      phase2: { at: 0.5, speed: 1.5, cd: 0.7, shield: 0.06, seal: 1, msg: '고대신이 완전히 눈을 떴다! (빨라지고 기술을 더 자주 쓴다)' },
      trait: '고대의 몸: 1초에 최대 체력의 2.8%까지만 피해를 받는다. 17초마다 4.5초 동안 깊은 잠에 빠져 제자리에 멈추고 초당 1%씩 회복하지만, 그동안은 초당 4.2%까지 피해를 받는다. 광기의 시선으로 모든 유닛을 늦추고, 하수인·사도를 부르고, 봉인의 장막을 두를 때마다 높은 등급 유닛을 봉인한다(장막을 깨면 풀림, 신화는 봉인 불가). 유닛 자리를 뒤섞는다. 신의 손길: 경고 뒤 생명 -4 (준비 중 체력 5%를 깎으면 끊김, 잠든 틈을 노려라). 체력 절반에서 완전히 깨어난다',
    },
    riftLord: {
      name: '균열의 군주', hp: 18, speed: 14, gold: 40, leak: 3, boss: true, rift: { every: 9, warn: 1.3, stun: 2.5 }, rage: 0.5,
      skills: [{ k: 'blink', at: [0.7, 0.4], dist: 0.2 }, { k: 'shield', name: '균열 장막', every: 16, pct: 0.1 }, { k: 'shuffle', name: '차원 뒤섞기', every: 15, n: 3, first: 9 }, { k: 'strike', name: '균열 폭발', every: 13, wind: 2.5, dmg: 3, brk: 0.05, first: 6 }],
      trait: '균열로 유닛을 기절시키고 16초마다 장막을 두르며, 15초마다 유닛 3기의 자리를 뒤섞는다. 체력 70%·40%에서 앞으로 순간이동, 절반부터 가속. 균열 폭발: 경고 뒤 생명 -3 (준비 중 체력 5%를 깎으면 끊김)',
    },
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
        id: 'heart', name: '잠든 신의 제단', boss: 'riftHeart', theme: 'heart',
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
