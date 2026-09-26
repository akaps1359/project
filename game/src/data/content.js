// 증강, 유물, 소모품, 저주
// mods 의 퍼센트 값은 소수(0.12 = 12%)로 적는다. cost 가 있으면 대가가 있는 선택지다.
(function (RS) {
  'use strict';

  const A = (id, name, rarity, icon, desc, mods, extra) =>
    Object.assign({ id, name, rarity, icon, desc, mods: mods || {} }, extra || {});

  // rarity: 1 실버 / 2 골드 / 3 프리즘. unique 가 아니면 여러 번 고를 수 있다.
  RS.AUGMENTS = [
    // ── 실버 ──
    A('sharp', '날카로운 무기', 1, 'sword', '모든 유닛 피해 +12%', { dmgPct: 0.12 }),
    A('quick', '빠른 손놀림', 1, 'wing', '모든 유닛 공격 속도 +10%', { aspdPct: 0.1 }),
    A('eagle', '매의 눈', 1, 'eye', '모든 유닛 사거리 +6', { rangeAdd: 6 }),
    A('drillKnight', '전사 훈련', 1, 'c_knight', '전사 피해 +30%', { cls: { knight: { dmg: 0.3 } } }),
    A('drillArcher', '궁수 훈련', 1, 'c_archer', '궁수 공격 속도 +25%', { cls: { archer: { aspd: 0.25 } } }),
    A('drillMage', '마법 연구', 1, 'c_mage', '마법사 피해 +25%, 폭발 범위 +3', { cls: { mage: { dmg: 0.25, splash: 3 } } }),
    A('drillRogue', '암살 교본', 1, 'c_rogue', '도적 치명타 확률 +12%', { cls: { rogue: { crit: 0.12 } } }),
    A('drillFrost', '서리 결정', 1, 'c_frost', '서리술사 피해 +40%, 둔화 +8%', { cls: { frost: { dmg: 0.4, slow: 0.08 } } }),
    A('piggy', '저금통', 1, 'pig', '이자 한도 +2', { interestCap: 2 }),
    A('bounty', '현상금', 1, 'coin', '처치 골드 +20%', { killGoldPct: 0.2 }),
    A('discount', '소환 할인', 1, 'star', '소환 비용 -10%', { summonCostPct: -0.1 }),
    A('wall', '두꺼운 성벽', 1, 'heart', '최대 생명 +5, 생명 +5', {}, {
      onPick(run) { RS.changeMaxLife(run, 5); RS.heal(run, 5); },
    }),
    A('recruits', '신병 모집', 1, 'flag', '즉시 일반 유닛 3기 소환 (빈칸이 없으면 골드로 환급)', {}, {
      onPick(run) { RS.grantUnits(run, 0, 3); },
    }),
    A('goldRush', '골드 러시', 1, 'bag', '즉시 골드 +40×막', {}, {
      onPick(run) { RS.addGold(run, 40 * run.act); },
    }),
    A('smithDiscount', '대장간 할인', 1, 'anvil', '강화 비용 -20%', { upgradeCostPct: -0.2 }),
    A('firstStrike', '선제공격', 1, 'bolt', '각 적에게 가하는 첫 공격 피해 +150%', { firstStrike: 1.5 }, { unique: true }),
    A('massProduction', '대량 생산', 1, 'gear', '소환 비용 -30%', { summonCostPct: -0.3, noRare: 1 }, {
      unique: true, cost: '소환 시 희귀 이상 등급이 나오지 않음',
    }),
    A('hastyWaves', '속전속결', 1, 'clock', '웨이브 시작 골드 2배', { waveGoldPct: 1, waveIntervalPct: 0.25 }, {
      unique: true, cost: '웨이브 간격 25% 단축',
    }),

    // ── 골드 ──
    A('luckySummon', '행운의 소환', 2, 'clover', '소환 시 희귀 등급 확률 +10%', { rareChance: 0.1 }),
    A('recycle', '재활용', 2, 'recycle', '합성할 때 30% 확률로 재료 1기 반환', { mergeRefund: 0.3 }, { unique: true }),
    A('diversity', '다양성', 2, 'rainbow', '보드에 다섯 클래스가 모두 있으면 피해 +35%', { diversity: 0.35 }, { unique: true }),
    A('purity', '순수 혈통', 2, 'crest', '보드의 클래스가 3종 이하면 피해 +40%', { purity: 0.4 }, { unique: true }),
    A('eliteSquad', '정예주의', 2, 'medal', '보드 유닛이 12기 이하면 피해 +45%', { eliteSquad: 0.45 }, { unique: true }),
    A('rich', '부자의 여유', 2, 'crown', '골드를 100 이상 보유하면 피해 +25%', { rich: 0.25 }, { unique: true }),
    A('critMaster', '치명적 일격', 2, 'dagger', '치명타 확률 +8%, 치명타 피해 +50%', { critChance: 0.08, critMult: 0.5 }),
    A('shrapnel', '파편탄', 2, 'burst', '전사·궁수·도적의 공격이 주변 적에게 30% 피해', { shrapnel: 0.3 }, { unique: true }),
    A('mud', '끈적한 땅', 2, 'drop', '모든 적 이동 속도 -10%', { enemySpeedPct: 0.1 }),
    A('compound', '복리', 2, 'coins', '이자 한도 +3, 이자가 붙으면 +1 추가', { interestCap: 3, interestBonus: 1 }),
    A('giantSlayer', '거인 사냥꾼', 2, 'axe', '엘리트·보스에게 피해 +40%', { eliteDmgPct: 0.4 }),
    A('promotion', '승급', 2, 'up', '즉시 희귀 유닛 2기 소환', {}, {
      onPick(run) { RS.grantUnits(run, 1, 2); },
    }),
    A('vampRite', '흡혈 의식', 2, 'fang', '엘리트·보스를 처치하면 생명 +3', { eliteKillHeal: 3 }),
    A('bloodPact', '피의 계약', 2, 'blood', '모든 유닛 피해 +35%', { dmgPct: 0.35 }, {
      cost: '최대 생명 -5',
      onPick(run) { RS.changeMaxLife(run, -5); },
    }),
    A('gamble', '도박꾼의 주사위', 2, 'dice', '합성할 때 25% 확률로 2단계 상승', { mergeDouble: 0.25, mergeFail: 0.12 }, {
      unique: true, cost: '12% 확률로 합성 실패(결과 소멸)',
    }),
    A('greed', '탐욕', 2, 'bag', '처치 골드 +60%', { killGoldPct: 0.6, enemyHpPct: 0.15 }, {
      unique: true, cost: '적 체력 +15%',
    }),
    A('overdrive', '과부하', 2, 'bolt', '모든 유닛 공격 속도 +35%', { aspdPct: 0.35, battleStartLifeLoss: 2 }, {
      unique: true, cost: '전투를 시작할 때마다 생명 -2',
    }),

    // ── 프리즘 ──
    A('twinSummon', '쌍둥이 소환', 3, 'twin', '소환할 때 20% 확률로 같은 유닛 1기 추가', { twinChance: 0.2 }, { unique: true }),
    A('luckyMerge', '행운의 합성', 3, 'sparkle', '합성할 때 15% 확률로 2단계 상승', { mergeDouble: 0.15 }, { unique: true }),
    A('berserk', '광전사', 3, 'rage', '생명이 절반 이하면 피해 +60%, 공격 속도 +25%', { berserk: 1 }, { unique: true }),
    A('timeWarp', '시간 왜곡', 3, 'hourglass', '모든 적 이동 속도 -20%', { enemySpeedPct: 0.2 }, { unique: true }),
    A('legendAura', '전설의 위엄', 3, 'crown', '전설 유닛 1기당 모든 유닛 피해 +12%', { legendAura: 0.12 }, { unique: true }),
    A('midas', '미다스의 손', 3, 'coins', '처치 골드 +50%, 판매 가격 +50%', { killGoldPct: 0.5, sellPct: 0.5 }, { unique: true }),
    A('archmage', '대마법사', 3, 'c_mage', '마법사·서리술사 피해 +60%, 범위 +5 (서리술사는 영웅 등급부터)', {
      cls: { mage: { dmg: 0.6, splash: 5 }, frost: { dmg: 0.6, splash: 5 } },
    }, { unique: true }),
    A('glassCannon', '유리 대포', 3, 'cannon', '모든 유닛 피해 +80%', { dmgPct: 0.8, leakMult: 2 }, {
      unique: true, cost: '적이 한 바퀴 돌 때 잃는 생명 2배',
    }),
    A('lastStand', '배수의 진', 3, 'skull', '모든 유닛 피해 +50%, 공격 속도 +20%', { dmgPct: 0.5, aspdPct: 0.2 }, {
      unique: true, cost: '최대 생명 절반',
      onPick(run) { RS.changeMaxLife(run, -Math.floor(run.maxLife / 2)); },
    }),
    // ── 슬레이 더 스파이어의 '파워' 카드에서 착안 ──
    A('demonForm', '악마의 형상', 3, 'horns', '웨이브가 시작될 때마다 이번 전투 동안 모든 유닛 피해 +8% (누적)', { demonForm: 0.08 }, { unique: true }),
    A('echoForm', '메아리 형상', 3, 'echo', '웨이브마다 처음 소환하는 유닛이 같은 유닛 하나를 더 데려온다', { echoForm: 1 }, { unique: true }),
    A('apotheosis', '신격화', 3, 'halo', '즉시 보드의 모든 일반 유닛이 같은 클래스의 희귀 유닛이 된다', {}, {
      onPick(run) { RS.promoteTier(run, 0); },
    }),
    A('wraithForm', '망령 형상', 3, 'ghost2', '첫 웨이브 동안 한 바퀴를 돈 적에게 생명을 잃지 않고, 모든 유닛 피해 +20%', { firstWaveNoLeak: 1, dmgPct: 0.2, lastWaveLeakMult: 1 }, {
      unique: true, cost: '마지막 웨이브에는 잃는 생명 2배',
    }),
    A('corruption', '타락', 3, 'corrupt', '강화 비용 -50%', { upgradeCostPct: -0.5, summonCostPct: 0.3 }, {
      unique: true, cost: '소환 비용 +30%',
    }),
    A('creativeAI', '창조적 AI', 2, 'chip', '웨이브가 시작될 때 무작위 일반 유닛 1기 무료 소환', { waveFreeSummon: 1 }, { unique: true }),
    A('noxious', '유독 가스', 2, 'gas', '모든 적이 초당 최대 체력의 1.2% 피해 (보스는 0.4%)', { noxious: 0.012 }, { unique: true }),
    A('poisonBlade', '맹독 칼날', 2, 'vial', '도적 공격이 독을 건다 (피해의 50%를 3초간, 5번까지 중첩, 방어 무시)', { poison: 0.5 }, { unique: true }),
    A('offering', '제물', 2, 'altar', '즉시 희귀 유닛 3기 소환', {}, {
      cost: '최대 생명 -3',
      onPick(run) { RS.changeMaxLife(run, -3); RS.grantUnits(run, 1, 3); },
    }),
    A('limitBreak', '한계 돌파', 2, 'fist', '강화할 때 레벨이 2씩 오른다', { upgradeDouble: 1, upgradeCostPct: 0.6 }, {
      unique: true, cost: '강화 비용 +60%',
    }),
  ];

  RS.ITEMS = [
    { id: 'bomb', name: '폭탄', icon: 'bomb', desc: '모든 적에게 큰 피해 (보스는 1/4)' },
    { id: 'freeze', name: '서리 주문서', icon: 'snow', desc: '모든 적 4초 정지 (보스 1.5초)' },
    { id: 'goldScroll', name: '황금 주문서', icon: 'coins', desc: '골드 +50×막' },
    { id: 'summonScroll', name: '소환 주문서', icon: 'star', desc: '희귀 유닛 1기 소환 (빈칸이 있어야 한다)' },
    { id: 'anvilScroll', name: '강화 주문서', icon: 'anvil', desc: '보드에서 가장 강한 클래스 강화 +2 (높은 등급일수록 크게 친다)' },
    { id: 'potion', name: '회복 물약', icon: 'potion', desc: '생명 +6' },
    { id: 'rage', name: '광란의 북', icon: 'drum', desc: '10초간 공격 속도 +60%' },
    { id: 'ghostly', name: '유령 망토', icon: 'ghost', desc: '8초 동안 한 바퀴를 돈 적에게 생명을 잃지 않는다' },
  ];

  RS.CURSES = [
    { id: 'weak', name: '쇠약', icon: 'curse', desc: '모든 유닛 피해 -12%', mods: { dmgPct: -0.12 } },
    { id: 'taxed', name: '세금', icon: 'curse', desc: '소환 비용 +15%', mods: { summonCostPct: 0.15 } },
    { id: 'riftTaint', name: '균열 오염', icon: 'curse', desc: '매 웨이브 적 +2', mods: { extraEnemies: 2 } },
    { id: 'unlucky', name: '불운', icon: 'curse', desc: '합성할 때 8% 확률로 실패', mods: { mergeFail: 0.08 } },
    { id: 'fragile', name: '연약함', icon: 'curse', desc: '한 바퀴를 돈 적에게 잃는 생명 +1', mods: { leakAdd: 1 } },
    { id: 'regret', name: '후회', icon: 'curse', desc: '전투를 시작할 때 생명 -1', mods: { battleStartLifeLoss: 1 } },
    { id: 'doubt', name: '의심', icon: 'curse', desc: '첫 웨이브 동안 무작위 칸 2곳이 기절한다', mods: { doubt: 2 } },
    { id: 'parasite', name: '기생충', icon: 'curse', desc: '최대 생명 -3 (얻을 때 적용)', mods: {}, onGain(run) { RS.changeMaxLife(run, -3); } },
    { id: 'ascBurden', name: '승천자의 짐', icon: 'curse', desc: '모든 유닛 피해 -10%. 없앨 수 없다', mods: { dmgPct: -0.1 }, permanent: true },
    { id: 'guilt', name: '죄책감', icon: 'curse', desc: '전투를 시작할 때 생명 -1. 전투 5번 뒤 저절로 사라진다', mods: { battleStartLifeLoss: 1 }, fades: 5 },
    { id: 'debt', name: '빚', icon: 'curse', desc: '웨이브가 시작될 때마다 골드 -5', mods: { debt: 5 } },
    { id: 'bloomMark', name: '피어남의 표식', icon: 'curse', desc: '생명을 회복할 수 없다. 없앨 수 없다', mods: {}, permanent: true },
  ];

  const index = (list) => {
    const m = {};
    for (const x of list) m[x.id] = x;
    return m;
  };
  RS.AUG = index(RS.AUGMENTS);
  RS.ITEM = index(RS.ITEMS);
  RS.CURSE = index(RS.CURSES);

  RS.RARITY_NAME = { aug: ['', '실버', '골드', '프리즘'], relic: ['', '일반', '희귀', '보스', '고대', '시작', '이벤트'] };

  RS.randomItemId = function (rng) {
    return rng.pick(RS.ITEMS).id;
  };
})((globalThis.RS = globalThis.RS || {}));
