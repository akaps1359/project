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
      summonCostPct: 0, rareChance: 0, noRare: 0, twinChance: 0, cloverChance: 0,
      mergeRefund: 0, mergeDouble: 0, mergeFail: 0, mergeChoose: 0, mergeMirror: 0,
      sellPct: 0, upgradeCostPct: 0,
      leakMult: 1, leakAdd: 0, thorns: 0, powderKeg: 0,
      enemySpeedPct: 0, enemyHpPct: 0, bossHpPct: 0, extraEnemies: 0, waveIntervalPct: 0,
      freezeChance: 0, firstStrike: 0, shrapnel: 0, eliteDmgPct: 0, burn: 0,
      itemSlots: 0, bossTimeAdd: 0, battleStartGold: 0, battleStartLifeLoss: 0,
      winHeal: 0, eliteKillHeal: 0, eliteKillMaxLife: 0,
      augChoices: 0, augRerolls: 0, restTrainBonus: 0, pocketWatch: 0,
      diversity: 0, purity: 0, eliteSquad: 0, rich: 0, berserk: 0, legendAura: 0,
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
        M[k] += v;
      }
    }
  }

  RS.collectMods = function (run) {
    const M = RS.baseMods();
    for (const id of run.augments) addInto(M, RS.AUG[id].mods);
    for (const id of run.relics) addInto(M, RS.REL[id].mods);
    for (const id of run.curses) addInto(M, RS.CURSE[id].mods);
    return M;
  };

  RS.itemSlots = function (run) {
    return 3 + RS.collectMods(run).itemSlots;
  };

  RS.interestCap = function (M) {
    return RS.BAL.interestCap + M.interestCap;
  };
})((globalThis.RS = globalThis.RS || {}));
