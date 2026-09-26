// 유물. mods 는 전투·진행 수치에 합산되고, onPick 은 얻는 순간 한 번 실행된다.
// state 가 있으면 run.relicState[id] 에 복사돼 횟수·충전 등을 기억한다.
(function (RS) {
  'use strict';

  const R = (id, name, rarity, icon, desc, mods, extra) =>
    Object.assign({ id, name, rarity, icon, desc, mods: mods || {} }, extra || {});

  // rarity: 1 일반 · 2 희귀 · 3 보스 · 4 고대(막 시작의 고대 존재) · 5 시작(지휘관)
  RS.RELICS = [
    // ── 일반 ──
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
    R('lens', '확대경', 1, 'lens', '안쪽 6칸 유닛 사거리 +8, 피해 +12%', { innerRange: 8, innerDmg: 0.12 }),
    R('anvil', '대장장이 모루', 1, 'anvil', '휴식처에서 수련하면 강화 +1 추가', { restTrainBonus: 1 }),
    R('coinPurse', '동전 지갑', 1, 'bag', '전투 보상 골드 +50%', { combatGoldPct: 0.5 }),
    R('vampFang', '흡혈 송곳니', 1, 'fang', '엘리트·보스를 처치하면 최대 생명 +1', { eliteKillMaxLife: 1 }),
    R('rerollDice', '운명의 주사위', 1, 'dice', '증강을 고를 때 새로고침 1회', { augRerolls: 1 }),
    R('ancientCoin', '고대 주화', 1, 'coin', '이자 한도 +4', { interestCap: 4 }),
    R('anchor', '닻', 1, 'anchor', '전투마다 처음 한 번은 한 바퀴를 돈 적에게 생명을 잃지 않는다', { leakShield: 1 }),
    R('bagPrep', '준비 가방', 1, 'pack', '전투를 시작할 때 무료 소환 1회', { startSummons: 1 }),
    R('lantern', '등불', 1, 'lantern', '전투를 시작할 때 골드 +15×막', { battleStartGold: 15 }),
    R('strawberry', '딸기', 1, 'berry', '최대 생명 +4', {}, {
      onPick(run) { RS.changeMaxLife(run, 4); RS.heal(run, 4); },
    }),
    R('penNib', '펜촉', 1, 'pen', '유닛 공격 10번째마다 그 공격의 피해 2배', { penNib: 1 }),
    R('happyFlower', '행복한 꽃', 1, 'flower', '웨이브 3번마다 무료 소환 1회 (전투를 넘어 이어짐)', { happyFlower: 1 }),
    R('meatBone', '뼈 고기', 1, 'meat', '전투가 끝날 때 생명이 절반 이하면 생명 +5', { meatBone: 5 }),
    R('regalPillow', '왕의 베개', 1, 'pillow', '휴식할 때 생명 +5 추가', { restHealAdd: 5 }),
    R('mawBank', '돼지 저금통', 1, 'pig', '칸을 이동할 때마다 골드 +12. 상점에서 물건을 사면 깨진다', {}, { state: { active: true } }),
    R('omamori', '부적', 1, 'charm', '다음에 받는 저주 2개를 막는다', {}, { state: { charges: 2 } }),
    R('smilingMask', '웃는 가면', 1, 'mask', '상점의 제거 서비스가 항상 50골드', { fixedRemoveCost: 50 }),
    R('juzu', '염주 팔찌', 1, 'beads', '? 칸에서 전투가 나오지 않는다', { juzu: 1 }),
    R('tinyChest', '작은 상자', 1, 'chest', '? 칸에 4번째로 들어갈 때마다 보물이 나온다', { tinyChest: 1 }),
    R('ceramicFish', '도자기 물고기', 1, 'fish', '증강을 얻을 때마다 골드 +15', { ceramicFish: 15 }),
    R('tungsten', '텅스텐 막대', 1, 'rod', '한 바퀴를 돈 적에게 잃는 생명 -1 (최소 1)', { leakReduce: 1 }),

    // ── 희귀 ──
    R('scroll', '고대 두루마리', 2, 'scroll', '합성 결과를 두 클래스 중에서 고른다', { mergeChoose: 1 }),
    R('powderKeg', '화약통', 2, 'keg', '적이 한 바퀴 돌 때마다 모든 적에게 폭발 피해', { powderKeg: 1 }),
    R('sageStone', '현인의 보석', 2, 'gem', '전설 유닛 피해 +50%', { tierDmg: [0, 0, 0, 0.5] }),
    R('ember', '불씨', 2, 'flame', '마법사 공격이 3초간 화상(초당 피해의 25%)', { burn: 0.25 }),
    R('crystalBall', '수정 구슬', 2, 'orb', '증강 선택지 +1', { augChoices: 1 }),
    R('mirror', '거울', 2, 'mirror', '합성할 때 8% 확률로 결과 유닛 2기', { mergeMirror: 0.08 }),
    R('mango', '망고', 2, 'mango', '최대 생명 +8', {}, {
      onPick(run) { RS.changeMaxLife(run, 8); RS.heal(run, 8); },
    }),
    R('slingCourage', '용기의 새총', 2, 'sling', '엘리트전에서 모든 유닛 피해 +25%', { eliteBattleDmg: 0.25 }),
    R('preservedInsect', '보존된 곤충', 2, 'insect', '엘리트 체력 -25%', { eliteHpPct: -0.25 }),
    R('prayerWheel', '기도 바퀴', 2, 'wheel', '일반 전투에서 4번 이길 때마다 증강을 한 번 더 고른다', { prayerWheel: 1 }, { state: { n: 0 } }),
    R('singingBowl', '노래하는 그릇', 2, 'bowl', '증강을 건너뛰면 최대 생명 +2 (골드도 받는다)', { singingBowl: 1 }),
    R('dreamCatcher', '드림캐처', 2, 'dream', '휴식처에서 휴식하면 증강 하나를 고른다', { dreamCatcher: 1 }),
    R('peacePipe', '평화의 파이프', 2, 'pipe', '휴식처에서 [명상]: 증강이나 저주 하나를 없앤다', { peacePipe: 1 }),
    R('shovel', '삽', 2, 'shovel', '휴식처에서 [발굴]: 유물을 하나 얻는다', { shovel: 1 }),
    R('girya', '기랴', 2, 'kettle', '휴식처에서 [단련]: 모든 유닛 피해 +6% (최대 3번)', { girya: 1 }, { state: { lifts: 0 } }),
    R('matryoshka', '마트료시카', 2, 'doll', '다음 보물 상자 2번은 유물을 하나 더 준다', {}, { state: { count: 2 } }),
    R('membership', '회원 카드', 2, 'card', '상점 가격 50% 할인', { shopDiscount: 0.5 }),
    R('courier', '택배원', 2, 'box', '상점 가격 20% 할인, 산 자리에 새 물건이 들어온다', { shopDiscount: 0.2, courier: 1 }),
    R('wingBoots', '날개 장화', 2, 'boots', '길을 무시하고 다음 층 아무 칸으로 이동 (3회)', {}, { state: { uses: 3 } }),
    R('pantograph', '팬터그래프', 2, 'compass', '보스전을 시작할 때 생명 +6', { pantograph: 6 }),
    R('helix', '화석 나선', 2, 'shell', '전투마다 처음 한 번은 한 바퀴를 돈 적에게 생명을 잃지 않는다', { helix: 1 }),

    // ── 보스 (강력하지만 대가가 따르는 것이 많다) ──
    R('cursedCrown', '저주받은 왕관', 3, 'crown', '전투를 시작할 때 골드 +30×막', { battleStartGold: 30 }, {
      cost: '최대 생명 -4',
      onPick(run) { RS.changeMaxLife(run, -4); },
    }),
    R('riftShard', '균열 파편', 3, 'shard', '보스 체력 -20%', { bossHpPct: 0.2 }),
    R('warHorn', '전쟁 나팔', 3, 'horn', '모든 유닛 공격 속도 +15%, 사거리 +4', { aspdPct: 0.15, rangeAdd: 4 }),
    R('ectoHeart', '엑토 심장', 3, 'ecto', '웨이브가 시작될 때마다 무료 소환 1회', { waveFreeSummon: 1, noKillGold: 1 }, {
      cost: '적을 처치해도 골드를 얻지 못한다',
    }),
    R('stimulant', '각성제', 3, 'cup', '모든 유닛 공격 속도 +30%', { aspdPct: 0.3, noRestHeal: 1 }, {
      cost: '휴식처에서 휴식할 수 없다',
    }),
    R('fusionHammer', '융합 망치', 3, 'hammer', '합성할 때 15% 확률로 2단계 상승', { mergeDouble: 0.15, noSmith: 1 }, {
      cost: '휴식처에서 수련·연마를 할 수 없다',
    }),
    R('sealedGourd', '봉인된 호리병', 3, 'gourd', '강화 비용 -50%, 얻을 때 모든 클래스 강화 +2', { upgradeCostPct: -0.5, noItems: 1 }, {
      onPick(run) { for (const c of RS.CLASSES) run.classLv[c] += 2; },
      cost: '소모품을 더 얻을 수 없다',
    }),
    R('brokenCrown', '깨진 왕관', 3, 'crown2', '전투를 시작할 때 50% 확률로 희귀 유닛 1기 소환', { startRare: 0.5, augChoices: -1 }, {
      cost: '증강 선택지 -1',
    }),
    R('blindfold', '눈가리개', 3, 'blind', '모든 유닛 피해 +35%', { dmgPct: 0.35, blindfold: 1 }, {
      cost: '적 체력바, 보스 체력·시간, 웨이브 시간이 보이지 않는다',
    }),
    R('philStone', '현자의 돌', 3, 'redgem', '소환 비용 -35%', { summonCostPct: -0.35, enemyHpPct: 0.15 }, {
      cost: '모든 적 체력 +15%',
    }),
    R('velvetChoker', '벨벳 초커', 3, 'choker', '소환 비용 -40%', { summonCostPct: -0.4, upgradeCostPct: 0.5 }, {
      cost: '강화 비용 +50%',
    }),
    R('snakeEye', '뱀의 눈', 3, 'snake', '소환 시 희귀 확률 +25%, 영웅 확률 +3%', { rareChance: 0.25, epicChance: 0.03, snakeEye: 1 }, {
      cost: '소환 비용이 매번 50~200% 사이에서 무작위',
    }),
    R('cursedKey', '저주받은 열쇠', 3, 'key', '웨이브 시작 골드 2배', { waveGoldPct: 1, cursedKey: 1 }, {
      cost: '보물 상자를 열 때마다 저주를 받는다',
    }),
    R('markPain', '고통의 낙인', 3, 'brand', '모든 유닛 공격 속도 +30%', { aspdPct: 0.3, capAdd: -15 }, {
      cost: '필드 상한 60 → 45',
    }),
    R('slaverCollar', '노예의 목걸이', 3, 'collar', '엘리트·보스전에서 모든 유닛 피해 +60%', { bigBattleDmg: 0.6 }),
    R('blackStar', '검은 별', 3, 'blackstar', '엘리트가 주는 유물 2개를 모두 얻는다', { blackStar: 1 }),
    R('callingBell', '부름의 종', 3, 'bell', '즉시 일반 유물 1개, 희귀 유물 2개', {}, {
      cost: '저주 [후회]',
      onPick(run) {
        RS.grantRandomRelic(run, [1]);
        RS.grantRandomRelic(run, [2]);
        RS.grantRandomRelic(run, [2]);
        RS.addCurse(run, 'regret');
      },
    }),
    R('pandoraBox', '판도라의 상자', 3, 'pandora', '보드의 일반 유닛을 모두 같은 수의 무작위 희귀 유닛으로 바꾼다', {}, {
      onPick(run) { RS.transformTier(run, 0, 1); },
    }),
    R('tinyHouse', '작은 집', 3, 'house', '골드 +50, 최대 생명 +5, 소모품 1개, 희귀 유닛 1기, 무작위 은빛 증강 1개', {}, {
      onPick(run) {
        RS.addGold(run, 50);
        RS.changeMaxLife(run, 5);
        RS.heal(run, 5);
        RS.addItem(run, RS.randomItemId(run.rng));
        RS.grantUnits(run, 1, 1);
        const a = RS.rollAugments(run, 1, [0, 1, 0, 0]);
        if (a.length) RS.pickAugment(run, a[0]);
      },
    }),
    R('orrery', '천구의', 3, 'planet', '증강을 3번 연달아 고른다', {}, {
      onPick(run) { for (let k = 0; k < 3; k++) RS.enqueue(run, { k: 'aug', w: [0, 40, 45, 15], title: '천구의' }); },
    }),
    R('sacredBark', '성스러운 나무껍질', 3, 'bark', '소모품 효과 2배', { itemPotency: 1 }),
    R('emptyCage', '빈 새장', 3, 'cage', '증강·저주를 2개까지 골라 없앤다', {}, {
      onPick(run) { for (let k = 0; k < 2; k++) RS.enqueue(run, { k: 'remove', title: '빈 새장' }); },
    }),

    // ── 시작 유물 (지휘관) ──
    R('mercContract', '용병 계약서', 5, 'scroll', '전투에서 이기면 골드 +15×막', { winGold: 15 }),
    R('ironCrest', '강철 문장', 5, 'crest', '전사·도적 피해 +30%', { cls: { knight: { dmg: 0.3 }, rogue: { dmg: 0.3 } } }),
    R('manaSpring', '마나의 샘', 5, 'orb', '마법사·서리술사 피해 +40%, 범위 +2 (서리술사는 영웅 등급부터)', { cls: { mage: { dmg: 0.4, splash: 2 }, frost: { dmg: 0.4, splash: 2 } } }),
    R('hawkFeather', '매의 깃털', 5, 'wing', '궁수 사거리 +8, 공격 속도 +15%', { cls: { archer: { range: 8, aspd: 0.15 } } }),
    R('alchemyPot', '연금 솥', 5, 'potion', '소모품 칸 +1, 전투 후 소모품이 나올 확률 +30%', { itemSlots: 1, itemDropBonus: 0.3 }),
    R('soulJar', '영혼 항아리', 5, 'vial', '적을 50마리 처치할 때마다 유닛 1기가 무료로 일어난다 (소환 비용이 오르지 않는다)', { souls: 50 }),
    R('starScepter', '별의 왕홀', 5, 'star', '웨이브마다 별 +1 (전투가 끝나도 남고, 최대 5). 별 3개로 [별똥별]: 모든 적에게 큰 피해', { stars: 1 }, { state: { n: 0 } }),

    // ── 이벤트 전용 ──
    R('cheese', '치즈 조각', 6, 'berry', '전투에서 이기면 최대 생명 +1', { winMaxLife: 1 }),
    R('babyDragon', '아기 용', 6, 'egg', '8초마다 가장 앞선 적에게 불꽃 (큰 피해)', { dragon: 1 }),
  ];

  RS.REL = {};
  for (const r of RS.RELICS) RS.REL[r.id] = r;
})((globalThis.RS = globalThis.RS || {}));
