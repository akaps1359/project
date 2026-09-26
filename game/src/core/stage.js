// 스테이지(웨이브 묶음) 생성
(function (RS) {
  'use strict';

  // 막마다 10층(9층 + 보스). 진행도 d = (막-1)×10 + 층 (1~40)
  // 웨이브 레벨 L = 3×(d-1) + 웨이브 번호
  RS.FLOORS_PER_ACT = 10;
  RS.depth = (act, floor) => (act - 1) * RS.FLOORS_PER_ACT + floor;
  RS.waveLevel = (act, floor, k) => 3 * (RS.depth(act, floor) - 1) + k;

  // 막마다 성장률이 다르므로 레벨 L 까지 곱해 나간다 (한 막 = 30레벨)
  RS.levelHp = function (L) {
    const g = RS.BAL.hpGrowth;
    const per = RS.FLOORS_PER_ACT * 3;
    let hp = RS.BAL.hpBase;
    for (let a = 1; a <= 4; a++) {
      const n = Math.max(0, Math.min(per, L - per * (a - 1)));
      hp *= Math.pow(g[a], n);
    }
    return hp * Math.min(1, 0.6 + L / 15);
  };

  function buildGroup(type, count, L) {
    const def = RS.ENEMY[type];
    const list = [];
    for (let i = 0; i < count; i++) list.push({ type, L, gap: def.gap || RS.BAL.spawnGap });
    return list;
  }

  // 두 무리를 번갈아 섞는다
  function interleave(a, b) {
    if (!b.length) return a;
    const out = [];
    const step = a.length / (b.length + 1);
    let bi = 0;
    for (let i = 0; i < a.length; i++) {
      out.push(a[i]);
      if (bi < b.length && i + 1 >= step * (bi + 1)) out.push(b[bi++]);
    }
    while (bi < b.length) out.push(b[bi++]);
    return out;
  }

  // type: combat / elite / boss / eventFight(spec.as 로 전투 성격 지정)
  RS.makeStage = function (run, type, rng, spec) {
    spec = spec || {};
    const act = run.act;
    const floor = run.floor;
    const d = RS.depth(act, floor);
    const A = RS.actDef(run);
    const M = RS.collectMods(run);
    const kind = type === 'eventFight' ? spec.as || 'elite' : type;
    const pool = A.pool.filter((p) => d >= p[2]);
    const waves = [];
    if (spec.trial) {
      const L = RS.waveLevel(act, floor, 0);
      return {
        type, act, floor, d, spec, seed: rng.seed32(), prep: 4,
        waves: [{ L, list: [{ type: 'dummy', L, gap: 1, hpMul: [0, 10, 22, 45][spec.trial] }] }],
      };
    }
    const nW = RS.BAL.wavesPerStage;
    for (let k = 0; k < nW; k++) {
      const L = RS.waveLevel(act, floor, k);
      const eliteWave = kind === 'elite' && k === nW - 1;
      const bossWave = kind === 'boss' && k === nW - 1;
      const baseCount = 7 + Math.floor(Math.min(d, 30) * 0.42) + k + M.extraEnemies;
      const scale = eliteWave ? 0.6 : bossWave ? 0.45 : 1;
      const main = rng.weighted(pool, (p) => p[1])[0];
      let cnt = Math.max(3, Math.round(baseCount * (RS.ENEMY[main].countMul || 1) * scale));
      let second = [];
      if (pool.length > 1 && rng.chance(0.45)) {
        let other = main;
        while (other === main) other = rng.weighted(pool, (p) => p[1])[0];
        const c2 = Math.max(1, Math.round((cnt * 0.4 * (RS.ENEMY[other].countMul || 1)) / (RS.ENEMY[main].countMul || 1)));
        cnt = Math.max(2, cnt - Math.round(cnt * 0.4));
        second = buildGroup(other, c2, L);
      }
      let list = interleave(buildGroup(main, cnt, L), second);
      if (eliteWave) {
        const n = spec.elites || (act >= 2 ? 2 : 1);
        if (spec.burning && !spec.burnBuff) spec.burnBuff = rng.pick(['hp', 'fast', 'regen', 'armor']);
        const elites = [];
        for (let i = 0; i < n; i++) {
          const t = spec.elite || (act === 4 ? A.elites[i % A.elites.length] : rng.pick(A.elites));
          elites.push({ type: t, L, gap: 1.2, hpMul: (spec.hpMul || 1) * (spec.burnBuff === 'hp' ? 1.4 : spec.burning ? 1.1 : 1), burning: spec.burning ? spec.burnBuff : null });
        }
        const mid = Math.floor(list.length / 2);
        list = list.slice(0, mid).concat([elites[0]], list.slice(mid), elites.slice(1));
      }
      if (bossWave) {
        list.push({ type: spec.boss || A.boss, L, gap: 1, hpMul: spec.hpMul || 1 });
        // 승천 10: 3막 보스가 둘
        if (act === 3 && (run.asc || 0) >= 10 && type === 'boss') list.push({ type: 'lich', L, gap: 1, hpMul: 1 });
      }
      // 문지기의 탄식: 첫 웨이브 적 체력 1
      if (k === 0 && run.lament > 0) list = list.map((sp) => Object.assign({}, sp, { one: true }));
      waves.push({ L, list });
    }
    const first = run.stats.battles === 0;
    return {
      type, act, floor, d, spec,
      seed: rng.seed32(),
      waves,
      prep: first ? 8 : RS.BAL.prepTime,
    };
  };
})((globalThis.RS = globalThis.RS || {}));
