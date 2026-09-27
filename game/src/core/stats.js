// 증강·유물·저주의 효과를 하나의 수치 묶음(mods)으로 합친다.
(function (RS) {
  'use strict';

  RS.baseMods = function () {
    const cls = {};
    for (const c of RS.CLASSES) cls[c] = { dmg: 0, aspd: 0, range: 0, crit: 0, splash: 0, slow: 0 };
    return {
      dmgPct: 0, aspdPct: 0, rangeAdd: 0, critChance: 0, critMult: 0, cls,
      tierDmg: [0, 0, 0, 0], cornerDmg: 0, innerDmg: 0, innerRange: 0,
      killGoldPct: 0, waveGoldPct: 0, interestCap: 0, interestBonus: 0, combatGoldPct: 0,
      summonCostPct: 0, rareChance: 0, epicChance: 0, noRare: 0, twinChance: 0, cloverChance: 0,
      mergeRefund: 0, mergeDouble: 0, mergeFail: 0, mergeChoose: 0, mergeMirror: 0,
      sellPct: 0, upgradeCostPct: 0, shopDiscount: 0,
      leakMult: 1, leakAdd: 0, thorns: 0, powderKeg: 0,
      enemySpeedPct: 0, enemyHpPct: 0, bossHpPct: 0, extraEnemies: 0, waveIntervalPct: 0,
      freezeChance: 0, firstStrike: 0, shrapnel: 0, eliteDmgPct: 0, burn: 0,
      itemSlots: 0, bossTimeAdd: 0, battleStartGold: 0, battleStartLifeLoss: 0,
      winHeal: 0, eliteKillHeal: 0, eliteKillMaxLife: 0,
      augChoices: 0, augRerolls: 0, restTrainBonus: 0, pocketWatch: 0,
      diversity: 0, purity: 0, eliteSquad: 0, rich: 0, berserk: 0, legendAura: 0, missChance: 0,
    };
  };

  const MULTIPLY = { leakMult: true };

  function addInto(M, mods) {
    for (const k in mods) {
      const v = mods[k];
      if (k === 'cls') {
        for (const c in v) for (const s in v[c]) M.cls[c][s] += v[c][s];
      } else if (k === 'tierDmg') {
        for (let i = 0; i < 4; i++) M.tierDmg[i] += v[i] || 0;
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
