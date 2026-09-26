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
    A('midas', '미다스의 손', 3, 'coins', '처치 골드 +50%, 판매 가격 +100%', { killGoldPct: 0.5, sellPct: 1 }, { unique: true }),
    A('archmage', '대마법사', 3, 'c_mage', '마법사·서리술사 피해 +60%, 범위 +5', {
      cls: { mage: { dmg: 0.6, splash: 5 }, frost: { dmg: 0.6, splash: 5 } },
    }, { unique: true }),
    A('glassCannon', '유리 대포', 3, 'cannon', '모든 유닛 피해 +80%', { dmgPct: 0.8, leakMult: 2 }, {
      unique: true, cost: '적이 한 바퀴 돌 때 잃는 생명 2배',
    }),
    A('lastStand', '배수의 진', 3, 'skull', '모든 유닛 피해 +50%, 공격 속도 +20%', { dmgPct: 0.5, aspdPct: 0.2 }, {
      unique: true, cost: '최대 생명 절반',
      onPick(run) { RS.changeMaxLife(run, -Math.floor(run.maxLife / 2)); },
    }),
  ];

  const R = (id, name, rarity, icon, desc, mods, extra) =>
    Object.assign({ id, name, rarity, icon, desc, mods: mods || {} }, extra || {});

  // rarity: 1 일반 / 2 희귀 / 3 보스
  RS.RELICS = [
    R('hourglass', '모래시계', 1, 'hourglass', '보스 제한 시간 +25초', { bossTimeAdd: 25 }),
    R('bloodChalice', '피의 성배', 1, 'chalice', '전투에서 이기면 생명 +3', { winHeal: 3 }),
    R('goldIdol', '황금 우상', 1, 'idol', '처치 골드 +25%', { killGoldPct: 0.25 }),
    R('clover', '네잎클로버', 1, 'clover', '소환할 때 10% 확률로 비용 반환', { cloverChance: 0.1 }),
    R('iceHeart', '얼음 심장', 1, 'iceheart', '모든 공격이 4% 확률로 적을 0.8초 빙결', { freezeChance: 0.04 }),
    R('thornArmor', '가시 갑옷', 1, 'armor', '한 바퀴를 돈 적은 최대 체력의 35% 피해', { thorns: 0.35 }),
    R('potionBelt', '물약 벨트', 1, 'belt', '소모품 칸 +1, 무작위 소모품 1개', { itemSlots: 1 }, {
      onPick(run) { RS.addItem(run, RS.randomItemId(run.rng)); },
    }),
    R('whetstone', '숫돌', 1, 'whetstone', '일반·희귀 유닛 피해 +30%', { tierDmg: [0.3, 0.3, 0, 0] }),
    R('pocketWatch', '회중시계', 1, 'watch', '웨이브 시작 후 4초간 공격 속도 +60%', { pocketWatch: 1 }),
    R('banner', '전쟁 깃발', 1, 'flag', '네 모서리 칸 유닛 피해 +40%', { cornerDmg: 0.4 }),
    R('lens', '확대경', 1, 'lens', '안쪽 6칸 유닛 사거리 +10, 피해 +15%', { innerRange: 10, innerDmg: 0.15 }),
    R('anvil', '대장장이 모루', 1, 'anvil', '휴식처에서 수련하면 강화 +1 추가', { restTrainBonus: 1 }),
    R('coinPurse', '동전 지갑', 1, 'bag', '전투 보상 골드 +50%', { combatGoldPct: 0.5 }),
    R('vampFang', '흡혈 송곳니', 1, 'fang', '엘리트·보스를 처치하면 최대 생명 +1', { eliteKillMaxLife: 1 }),
    R('rerollDice', '운명의 주사위', 1, 'dice', '증강을 고를 때 새로고침 1회', { augRerolls: 1 }),
    R('ancientCoin', '고대 주화', 1, 'coin', '이자 한도 +4', { interestCap: 4 }),
    R('scroll', '고대 두루마리', 2, 'scroll', '합성 결과를 두 클래스 중에서 고른다', { mergeChoose: 1 }),
    R('powderKeg', '화약통', 2, 'keg', '적이 한 바퀴 돌 때마다 모든 적에게 폭발 피해', { powderKeg: 1 }),
    R('sageStone', '현자의 돌', 2, 'gem', '전설 유닛 피해 +50%', { tierDmg: [0, 0, 0, 0.5] }),
    R('ember', '불씨', 2, 'flame', '마법사 공격이 3초간 화상(초당 피해의 25%)', { burn: 0.25 }),
    R('crystalBall', '수정 구슬', 2, 'orb', '증강 선택지 +1', { augChoices: 1 }),
    R('mirror', '거울', 2, 'mirror', '합성할 때 12% 확률로 결과 유닛 2기', { mergeMirror: 0.12 }),
    R('cursedCrown', '저주받은 왕관', 3, 'crown', '전투를 시작할 때 골드 +30×막', { battleStartGold: 30 }, {
      cost: '최대 생명 -4',
      onPick(run) { RS.changeMaxLife(run, -4); },
    }),
    R('riftShard', '균열 파편', 3, 'shard', '보스 체력 -20%', { bossHpPct: 0.2 }),
    R('warHorn', '전쟁 나팔', 3, 'horn', '모든 유닛 공격 속도 +15%, 사거리 +4', { aspdPct: 0.15, rangeAdd: 4 }),
  ];

  RS.ITEMS = [
    { id: 'bomb', name: '폭탄', icon: 'bomb', desc: '모든 적에게 큰 피해 (보스는 1/4)' },
    { id: 'freeze', name: '서리 주문서', icon: 'snow', desc: '모든 적 4초 정지 (보스 1.5초)' },
    { id: 'goldScroll', name: '황금 주문서', icon: 'coins', desc: '골드 +50×막' },
    { id: 'summonScroll', name: '소환 주문서', icon: 'star', desc: '희귀 유닛 1기 소환' },
    { id: 'anvilScroll', name: '강화 주문서', icon: 'anvil', desc: '보드에 가장 많은 클래스 강화 +2' },
    { id: 'potion', name: '회복 물약', icon: 'potion', desc: '생명 +6' },
    { id: 'rage', name: '광란의 북', icon: 'drum', desc: '10초간 공격 속도 +60%' },
  ];

  RS.CURSES = [
    { id: 'weak', name: '쇠약', icon: 'curse', desc: '모든 유닛 피해 -12%', mods: { dmgPct: -0.12 } },
    { id: 'taxed', name: '세금', icon: 'curse', desc: '소환 비용 +15%', mods: { summonCostPct: 0.15 } },
    { id: 'riftTaint', name: '균열 오염', icon: 'curse', desc: '매 웨이브 적 +2', mods: { extraEnemies: 2 } },
    { id: 'unlucky', name: '불운', icon: 'curse', desc: '합성할 때 8% 확률로 실패', mods: { mergeFail: 0.08 } },
    { id: 'fragile', name: '연약함', icon: 'curse', desc: '한 바퀴를 돈 적에게 잃는 생명 +1', mods: { leakAdd: 1 } },
  ];

  const index = (list) => {
    const m = {};
    for (const x of list) m[x.id] = x;
    return m;
  };
  RS.AUG = index(RS.AUGMENTS);
  RS.REL = index(RS.RELICS);
  RS.ITEM = index(RS.ITEMS);
  RS.CURSE = index(RS.CURSES);

  RS.RARITY_NAME = { aug: ['', '실버', '골드', '프리즘'], relic: ['', '일반', '희귀', '보스'] };

  RS.randomItemId = function (rng) {
    return rng.pick(RS.ITEMS).id;
  };
})((globalThis.RS = globalThis.RS || {}));
