// 증강·유물·저주의 효과를 하나의 수치 묶음(mods)으로 합친다.
(function (RS) {
  'use strict';

  RS.baseMods = function () {
    const cls = {};
    for (const c of RS.CLASSES) cls[c] = { dmg: 0, aspd: 0, range: 0, crit: 0, splash: 0, slow: 0, stun: 0 };
    return {
      dmgPct: 0, aspdPct: 0, rangeAdd: 0, critChance: 0, critMult: 0, cls,
      tierDmg: [0, 0, 0, 0, 0], cornerDmg: 0, innerDmg: 0, innerRange: 0,
      killGoldPct: 0, waveGoldPct: 0, interestCap: 0, interestBonus: 0, combatGoldPct: 0,
      summonCostPct: 0, rareChance: 0, epicChance: 0, noRare: 0, twinChance: 0, cloverChance: 0,
      mergeRefund: 0, mergeDouble: 0, mergeFail: 0, mergeMirror: 0,
      sellPct: 0, upgradeCostPct: 0, shopDiscount: 0,
      leakMult: 1, leakAdd: 0, thorns: 0, powderKeg: 0,
      enemySpeedPct: 0, enemyHpPct: 0, bossHpPct: 0, extraEnemies: 0, waveIntervalPct: 0,
      freezeChance: 0, firstStrike: 0, shrapnel: 0, eliteDmgPct: 0, burn: 0,
      itemSlots: 0, bossTimeAdd: 0, battleStartGold: 0, battleStartLifeLoss: 0,
      winHeal: 0, eliteKillHeal: 0, eliteKillMaxLife: 0,
      augChoices: 0, augRerolls: 0, restTrainBonus: 0, pocketWatch: 0,
      diversity: 0, purity: 0, eliteSquad: 0, rich: 0, berserk: 0, legendAura: 0, missChance: 0,
      // 시너지 연결 고리 (키워드 보상)
      shatter: 0, critHaste: 0, burnArrow: 0, dotAmp: 0, contagion: 0, lowLifeDmg: 0, curseDmg: 0, itemDmg: 0,
      strikeReduce: 0, counterStrike: 0, leech: 0, actHealCut: 0, restHealCut: 0,
    };
  };

  const MULTIPLY = { leakMult: true };

  function addInto(M, mods) {
    for (const k in mods) {
      const v = mods[k];
      if (k === 'cls') {
        for (const c in v) for (const s in v[c]) M.cls[c][s] += v[c][s];
      } else if (k === 'tierDmg') {
        for (let i = 0; i < M.tierDmg.length; i++) M.tierDmg[i] += v[i] || 0;
      } else if (MULTIPLY[k]) {
        M[k] *= v;
      } else {
        M[k] = (M[k] || 0) + v;
      }
    }
  }

  // 증강 강화(연마): 이로운 수치만 1.5배. 이로운 수치가 없으면 null (강화 불가)
  // 판매 가격(sellPct)은 소환 → 판매로 골드가 불어나지 않도록 강화하지 않는다
  const GOOD_UP = [
    'dmgPct', 'aspdPct', 'rangeAdd', 'critChance', 'critMult', 'killGoldPct', 'waveGoldPct', 'interestCap', 'interestBonus',
    'rareChance', 'twinChance', 'mergeRefund', 'mergeDouble', 'mergeMirror', 'enemySpeedPct', 'eliteDmgPct',
    'firstStrike', 'shrapnel', 'freezeChance', 'diversity', 'purity', 'eliteSquad', 'rich', 'legendAura', 'demonForm',
    'noxious', 'poison', 'eliteKillHeal', 'sellPct',
    'shatter', 'critHaste', 'burnArrow', 'dotAmp', 'lowLifeDmg', 'curseDmg', 'itemDmg', 'burn',
  ];
  // 정수여야 하는 수치 (생명·골드·사거리)
  const INT_KEYS = { interestCap: true, interestBonus: true, rangeAdd: true, eliteKillHeal: true };
  const GOOD_DOWN = ['summonCostPct', 'upgradeCostPct'];
  RS.upgradeScale = function (mods, f) {
    const out = {};
    let any = false;
    for (const k in mods) {
      const v = mods[k];
      if (k === 'cls') {
        out.cls = {};
        for (const c in v) {
          out.cls[c] = {};
          for (const s in v[c]) {
            out.cls[c][s] = v[c][s] > 0 ? v[c][s] * f : v[c][s];
            if (v[c][s] > 0) any = true;
          }
        }
      } else if (GOOD_UP.indexOf(k) >= 0 && v > 0) {
        out[k] = INT_KEYS[k] ? Math.round(v * f) : v * f;
        any = true;
      } else if (GOOD_DOWN.indexOf(k) >= 0 && v < 0) {
        out[k] = Math.max(-0.9, v * f);
        any = true;
      } else out[k] = v;
    }
    return any ? out : null;
  };

  RS.collectMods = function (run) {
    const M = RS.baseMods();
    for (const id of run.augments) {
      const def = RS.augDef(id);
      addInto(M, RS.isUpgraded(id) ? RS.upgradeScale(def.mods, 1.5) || def.mods : def.mods);
    }
    for (const id of run.relics) addInto(M, RS.REL[id].mods);
    for (const id of run.curses) addInto(M, RS.CURSE[id].mods);
    return M;
  };

  RS.itemSlots = function (run) {
    return 3 + RS.collectMods(run).itemSlots + ((run.relicState && run.relicState.ghostSlots) || 0);
  };

  RS.interestCap = function (M) {
    return RS.BAL.interestCap + M.interestCap;
  };

  // ── 시너지 키워드 ──
  // 증강·유물마다 어떤 빌드에 들어가는지 태그를 붙인다 (효과 수치에서 자동으로 뽑고, 즉시 효과·대가는 따로 적는다).
  // 선택 화면에서 이미 가진 것과 겹치는 태그를 보여 줘서 '덱'을 짜는 감각을 준다.
  RS.SYN = {
    crit: { name: '치명타', col: '#f07fb0', desc: '치명타 확률·배율을 올리고, 치명타가 날 때 보상을 받는다' },
    control: { name: '기절·빙결', col: '#a8ecff', desc: '적을 멈춰 세운다. 얼음 깨기로 멈춘 적을 크게 때린다' },
    slow: { name: '둔화', col: '#52b6e0', desc: '적을 느리게. 한 바퀴를 늦게 돌아 누수가 줄고, 얼음 깨기와 이어진다' },
    dot: { name: '화상·독', col: '#ff9a3d', desc: '지속 피해. 역병 확산으로 주변에 옮긴다' },
    knight: { name: '전사', col: '#dfe4ea', desc: '휘두르기·기절' },
    archer: { name: '궁수', col: '#94c1f7', desc: '긴 사거리·연사' },
    mage: { name: '마법사', col: '#d3a0f7', desc: '폭발·화상' },
    rogue: { name: '도적', col: '#f07fb0', desc: '치명타·독' },
    frost: { name: '서리술사', col: '#a8ecff', desc: '둔화·빙결' },
    high: { name: '고등급', col: '#f2a531', desc: '적은 수의 강한 유닛 (전설·신화)' },
    low: { name: '물량', col: '#aab3bf', desc: '많은 일반·희귀 유닛' },
    merge: { name: '합성', col: '#d3a0f7', desc: '합성 결과를 늘리거나 한 번에 두 단계 올린다' },
    summon: { name: '소환', col: '#94c1f7', desc: '소환을 싸게·자주·공짜로' },
    gold: { name: '골드', col: '#f5c44a', desc: '골드를 모으고, 모은 골드를 힘으로 바꾼다' },
    life: { name: '생명', col: '#e04a52', desc: '생명을 대가로 힘을 얻거나, 생명이 적을 때 강해진다' },
    curse: { name: '저주', col: '#a061e8', desc: '저주를 막거나 없애거나, 저주를 힘으로 바꾼다' },
    item: { name: '소모품', col: '#9ee06a', desc: '소모품을 더 얻고, 쓸 때마다 강해진다' },
    elite: { name: '엘리트·보스', col: '#ffd98a', desc: '엘리트·보스전에 강하고, 잡으면 보상' },
    wave: { name: '웨이브 누적', col: '#ff6b86', desc: '전투가 길어질수록 강해진다' },
    leak: { name: '누수 방어', col: '#b8c2d3', desc: '한 바퀴를 돈 적에게 잃는 생명을 줄인다' },
    pos: { name: '자리', col: '#74d86d', desc: '특정 칸에 둔 유닛이 강해진다' },
    upg: { name: '강화', col: '#ffb870', desc: '클래스 강화를 싸게·많이' },
    aug: { name: '증강 수집', col: '#e0e0ff', desc: '증강 선택지·연마를 늘린다' },
    route: { name: '탐험', col: '#c9b28a', desc: '? 칸·보물·휴식처·상점에서 이득' },
    comp: { name: '클래스 조합', col: '#ffffff', desc: '보드의 클래스 구성에 따라 강해진다' },
  };
  const AUTO = {
    crit: ['critChance', 'critMult', 'critHaste'],
    control: ['freezeChance', 'shatter', 'counterStrike'],
    slow: ['enemySpeedPct', 'shatter'],
    dot: ['burn', 'burnArrow', 'poison', 'noxious', 'dotAmp', 'contagion'],
    gold: ['killGoldPct', 'waveGoldPct', 'interestCap', 'interestBonus', 'combatGoldPct', 'rich', 'battleStartGold', 'winGold', 'ceramicFish', 'sellPct', 'skipGoldMul', 'freeFirstBuy', 'shopDiscount'],
    life: ['berserk', 'lowLifeDmg', 'winHeal', 'eliteKillHeal', 'eliteKillMaxLife', 'restHealAdd', 'meatBone', 'pantograph', 'winMaxLife', 'battleStartLifeLoss', 'strikeReduce', 'counterStrike', 'leech'],
    curse: ['curseDmg'],
    item: ['itemSlots', 'itemPotency', 'itemDmg', 'itemDropBonus'],
    elite: ['eliteDmgPct', 'eliteBattleDmg', 'bigBattleDmg', 'eliteHpPct', 'eliteKillMaxLife', 'eliteKillHeal', 'blackStar', 'eliteUpgrade', 'bossHpPct', 'strikeReduce', 'counterStrike', 'leech'],
    merge: ['mergeDouble', 'mergeRefund', 'mergeMirror'],
    summon: ['twinChance', 'cloverChance', 'waveFreeSummon', 'startSummons', 'happyFlower', 'echoForm', 'sealSummon', 'startRare', 'souls'],
    high: ['legendAura', 'eliteSquad', 'epicChance'],
    low: ['noRare'],
    wave: ['demonForm', 'pocketWatch', 'stars'],
    leak: ['leakShield', 'helix', 'thorns', 'powderKeg', 'leakReduce', 'firstWaveNoLeak'],
    pos: ['cornerDmg', 'innerDmg', 'innerRange'],
    upg: ['restTrainBonus', 'girya', 'upgradeDouble'],
    aug: ['augChoices', 'augRerolls', 'augUpChance', 'prayerWheel', 'singingBowl', 'dreamCatcher', 'ceramicFish', 'eliteUpgrade'],
    route: ['juzu', 'tinyChest', 'shovel', 'peacePipe', 'fixedRemoveCost', 'courier'],
    comp: ['diversity', 'purity'],
  };
  // 수치로 드러나지 않는 것 (즉시 효과·대가)
  const EXTRA = {
    bloodPact: ['life'], lastStand: ['life'], glassCannon: ['life'], overdrive: ['life'], offering: ['life', 'summon'], wall: ['life'],
    strawberry: ['life'], mango: ['life'], loomingFruit: ['life'], bloodPactCup: ['life'], bloodCrown: ['life'], cursedCrown: ['life'],
    recruits: ['low', 'summon'], promotion: ['summon'], apotheosis: ['low'], pandoraBox: ['low'], luckySummon: ['high'], snakeEye: ['high'],
    callingBell: ['curse'], cursedKey: ['curse'], omamori: ['curse'], peacePipe: ['curse'], emptyCage: ['curse'],
    potionBelt: ['item'], sacredBark: ['item'], alchemyPot: ['item'], sealedGourd: ['item'],
    iceHeart: ['control'], ember: ['mage'], powderKeg: ['leak'], fusionHammer: ['merge', 'high'], gamble: ['merge', 'high'], luckyMerge: ['high'],
    twinStar: ['merge'], mirror: ['merge'], scroll: ['merge'], massProduction: ['summon'], discount: ['summon'], philStone: ['summon'], velvetChoker: ['summon'],
    goldRush: ['gold'], shrapnel: ['knight', 'archer', 'rogue'], mawBank: ['gold', 'route'], wingBoots: ['route'], matryoshka: ['route'],
    orrery: ['aug'], tinyHouse: ['aug', 'life'], forbiddenIndex: ['aug'], crystalBall: ['aug'], sealedGourd: ['upg'], limitBreak: ['upg'],
    anvil: ['upg'], girya: ['upg'], corruption: ['upg'], smithDiscount: ['upg'], eliteSquad: ['high', 'comp'],
    shatter: ['frost', 'knight'], burnArrow: ['archer'], fireArrow: ['archer', 'dot'], bloodRush: ['rogue'],
  };
  const tagCache = new WeakMap();
  RS.synTags = function (def) {
    if (!def) return [];
    if (tagCache.has(def)) return tagCache.get(def);
    const out = [];
    const add = (t) => { if (out.indexOf(t) < 0) out.push(t); };
    const m = def.mods || {};
    if (m.cls) {
      for (const c in m.cls) {
        const v = m.cls[c];
        if (Object.keys(v).some((k) => v[k] > 0)) add(c);
        if (v.crit > 0) add('crit');
        if (v.stun > 0) add('control');
        if (v.slow > 0) add('slow');
      }
    }
    if (m.tierDmg) {
      if (m.tierDmg.some((v, i) => i >= 3 && v > 0)) add('high');
      if (m.tierDmg.some((v, i) => i <= 1 && v > 0)) add('low');
    }
    if (m.summonCostPct < 0) add('summon');
    if (m.upgradeCostPct < 0) add('upg');
    if (m.rareChance > 0) add('high');
    if (m.poison) add('rogue');
    if (m.burn) add('mage');
    for (const t in AUTO) for (const k of AUTO[t]) if (m[k]) add(t);
    for (const t of EXTRA[def.id] || []) add(t);
    tagCache.set(def, out);
    return out;
  };
  // 지금 가진 증강·유물의 태그별 개수
  RS.synCounts = function (run) {
    const c = {};
    const seen = {};
    const count = (def) => {
      if (!def || seen[def.id]) return;
      seen[def.id] = 1;
      for (const t of RS.synTags(def)) c[t] = (c[t] || 0) + 1;
    };
    for (const id of run.augments) count(RS.augDef(id));
    for (const id of run.relics) count(RS.REL[id]);
    return c;
  };

  // ── 룬: 보드 칸에 새기는 인챈트 (슬레이 더 스파이어 2의 인챈트에서 착안) ──
  RS.RUNES = [
    { id: 'might', name: '힘의 룬', color: '#ef6166', desc: '이 칸 유닛 피해 +40%', mods: { dmg: 0.4 } },
    { id: 'swift', name: '신속의 룬', color: '#74d86d', desc: '이 칸 유닛 공격 속도 +30%', mods: { aspd: 0.3 } },
    { id: 'hawk', name: '매의 룬', color: '#7cc4ff', desc: '이 칸 유닛 사거리 +12', mods: { range: 12 } },
    { id: 'greed', name: '황금 룬', color: '#f5c44a', desc: '이 칸 유닛이 적을 처치하면 골드 +2', mods: { killGold: 2 } },
    { id: 'frostR', name: '서리 룬', color: '#a8ecff', desc: '이 칸 유닛 공격이 적을 15% 둔화', mods: { slow: 0.15 } },
    { id: 'fury', name: '분노의 룬', color: '#f07fb0', desc: '이 칸 유닛 치명타 확률 +15%', mods: { crit: 0.15 } },
    { id: 'echoR', name: '메아리의 룬', color: '#d3a0f7', desc: '이 칸 유닛 공격이 20% 확률로 한 번 더', mods: { echo: 0.2 } },
    { id: 'cloneR', name: '복제의 룬', color: '#ffd98a', desc: '휴식처에서 [복제]: 이 칸 유닛 1기를 복제', mods: {}, clone: true },
    { id: 'crack', name: '금 간 칸', color: '#6b6280', desc: '이 칸 유닛 피해 -30% (고통)', mods: { dmg: -0.3 }, bad: true },
  ];
  RS.RUNE = {};
  for (const r of RS.RUNES) RS.RUNE[r.id] = r;
})((globalThis.RS = globalThis.RS || {}));
