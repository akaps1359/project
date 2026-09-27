// 밸런스 시뮬레이터의 봇들 (tools/sim.js 가 쓴다).
//   smart  : 잘하는 사람처럼 두는 봇. 모든 판단을 하나의 가치 함수(단위: 지금 골드)로 잰다.
//            - 전투: 소환 한 번과 클래스별 강화 한 번이 골드당 힘을 얼마나 올리는지 비교해 나은 쪽을 산다.
//              이자 한도만큼 골드를 남기고(위험하면 다 쓴다), 합성·배치·소모품·별똥별도 쓴다.
//            - 이벤트·상점·휴식·보상·고대 존재·문지기·대기열: 모험을 복제(saveString/loadString)해 그 선택을
//              실제로 적용하고, 이어지는 선택과 이벤트 전투까지 굴린 뒤 가치를 잰다. 무작위 결과는 시드를 바꿔
//              여러 번 굴린 평균이라 미래를 훔쳐보지 않는다.
//            - 길: 보스까지의 모든 길을 훑어, 칸 가치(평균 증강 하나 단위) − 죽을 확률 × 죽음의 비용이 가장 큰 길.
//              죽을 확률은 측정한 '한 판 생명 손실 분포'와 보드 DPS(이 깊이의 보통 DPS 대비)로 추정한다.
//   basic  : 예전 smart 봇 (비교용으로 그대로 둔다)
//   random : 모든 선택을 무작위로
// 게임 코드는 공개 함수만 쓴다: RS.saveString/loadString/attachRng, eventOptions/eventChoose/optionEnabled,
// shopBuy, restOptions/restDo, pickAugment/addRelic/applyBlessing/applyAncient, unitStats, 전투의
// summon/merge/mergeOptions/upgrade/upgradeCost/summonCost/summonLimit/useItem/arrange/starfall/canStarfall 등.
// 있으면 쓰는 것: RS.cancelChoice(건너뛴 대기열 항목 환불), RS.skipGoldAmount(건너뛰기 골드), b.starMax.
'use strict';

// ── 공용 ──
function best(list, score) {
  let b = list[0];
  let bs = b === undefined ? -Infinity : score(b);
  for (let k = 1; k < list.length; k++) {
    const s = score(list[k]);
    if (s > bs) {
      bs = s;
      b = list[k];
    }
  }
  return b;
}

// 전투 한 판을 봇 조작과 함께 끝까지 돌린다 (0.25초마다 조작)
function fightBattle(RS, run, bot) {
  const b = new RS.Battle(run, run.pending.stage, { headless: true });
  const dt = 1 / 30;
  let acc = 0;
  while (b.status === 'running' && b.t < 900) {
    b.update(dt);
    acc += dt;
    if (acc >= 0.25) {
      acc = 0;
      bot.act(b);
    }
  }
  if (b.status === 'running') b.finish('lost', 'timeout');
  while (b.status === 'ending') b.update(dt);
  return b;
}

// ─────────────────────────────────────────────────────────────
// basic 봇 (예전 smart) · random 봇 — 동작을 바꾸지 않는다
// ─────────────────────────────────────────────────────────────
const AUG_SCORE = {
  sharp: 6, quick: 6, bloodPact: 8, glassCannon: 7, lastStand: 7, overdrive: 7, critMaster: 6,
  legendAura: 7, berserk: 5, timeWarp: 8, mud: 6, luckyMerge: 7, twinSummon: 8, diversity: 6,
  shrapnel: 6, giantSlayer: 5, bounty: 5, midas: 6, greed: 5, compound: 5, piggy: 4, discount: 5,
  massProduction: 5, luckySummon: 5, recycle: 5, promotion: 5, recruits: 4, goldRush: 3,
  eagle: 4, archmage: 6, drillKnight: 4, drillArcher: 4, drillMage: 4, drillRogue: 4, drillFrost: 3,
  wall: 3, firstStrike: 4, hastyWaves: 4, rich: 4, eliteSquad: 2, purity: 2, gamble: 4,
  vampRite: 3, smithDiscount: 3,
  demonForm: 8, echoForm: 6, apotheosis: 6, wraithForm: 6, corruption: 5, creativeAI: 5,
  noxious: 6, poisonBlade: 4, offering: 5, limitBreak: 5,
};
const ANC_SCORE = {
  bloodCrown: 8, spikedGauntlet: 8, whisperEarring: 7, twinStar: 7, luckyStar: 7, legend: 7, epic2: 7,
  prism2: 6, trainAll2: 6, dragonScale: 6, stoppedClock: 6, pumpkinCandle: 6, waxToys: 6, bossRelic: 6,
  rewindSand: 5, forgottenShelf: 5, forbiddenIndex: 5, upgrade2: 5, runes2: 5, gold400: 5, goldenEgg: 5,
  sealOfGold: 5, warHammerA: 5, bloodPactCup: 5, lordParasol: 4, loomingFruit: 4, maxLife15: 4, cleanse: 3, relicPair: 5,
};

function makeBasicBot(RS, kind, rng, opts) {
  const random = kind === 'random';
  const keys = !!opts.keys;
  const augScore = (id) => (RS.isUpgraded(id) ? 1 : 0) + (AUG_SCORE[RS.augDef(id).id] || (RS.augDef(id).custom ? 5 : 3));
  const bot = {
    kind,
    pickAug(run, ids) {
      return random ? rng.pick(ids) : best(ids, augScore);
    },
    pickRelic(run, ids) {
      return random ? rng.pick(ids) : ids[0];
    },
    pickNode(run, choices) {
      if (random) return rng.pick(choices);
      const low = run.life < run.maxLife * 0.45;
      const score = (c) => {
        const n = run.map.floors[c.f - 1][c.lane];
        const t = n.type;
        if (t === 'elite') return low ? 0 : n.burning && keys && !run.keys.emerald ? 5 : 3;
        if (t === 'shop') return run.gold > 150 ? 4 : 1;
        if (t === 'unknown') return 2.2;
        if (t === 'rest') return low ? 4 : 2;
        if (t === 'combat') return low ? 1 : 2.5;
        return 2;
      };
      return best(choices, score);
    },
    neow(run, list) {
      if (random) return rng.pick(list);
      // 대가가 가벼운 큰 축복 > 중간 축복
      const big = list.find((b) => b.kind === 'big');
      if (big && (big.cost === 'curse' || big.cost === 'loseMax' || big.cost === 'tax')) return big;
      return list.find((b) => b.kind === 'mid');
    },
    ancient(run, boons) {
      if (random) return rng.pick(boons);
      return best(boons, (b) => (b === 'cleanse' && run.curses.length ? 6 : ANC_SCORE[b] || 4));
    },
    eventOption(run, opts) {
      const ok = opts.map((o, i) => i).filter((i) => RS.optionEnabled(run, opts[i]));
      return random ? rng.pick(ok) : ok[0];
    },
    rest(run) {
      const opts = RS.restOptions(run).filter((o) => !o.off);
      if (random) return rng.pick(opts);
      const has = (id) => opts.find((o) => o.id === id);
      if (keys && has('recall') && run.life > run.maxLife * 0.7) return has('recall');
      if (has('heal') && run.life < run.maxLife * 0.55) return has('heal');
      for (const id of ['hatch', 'dig', 'lift', 'clone']) if (has(id)) return has(id);
      const candle = run.relicState.pumpkinCandle;
      if (candle && candle.charges === 0 && has('kindle')) return has('kindle');
      if (has('smith') && run.augments.some((id) => RS.canUpgradeAug(id) && augScore(id) >= 7)) return has('smith');
      return has('train') || has('heal') || opts[0];
    },
    // 선택 대기열 한 칸 처리
    handle(run, item) {
      switch (item.k) {
        case 'aug':
        case 'augList': {
          let ids = item.ids || RS.rollAugments(run, item.n || RS.augChoiceCount(run), item.w);
          for (let k = 0; k < (item.left || 1) && ids.length; k++) {
            const id = bot.pickAug(run, ids);
            RS.pickAugment(run, id);
            ids = ids.filter((x) => x !== id);
          }
          break;
        }
        case 'relicList':
          if (item.ids.length) RS.addRelic(run, bot.pickRelic(run, item.ids));
          break;
        case 'remove': {
          const ci = run.curses.findIndex((id) => !RS.CURSE[id].permanent);
          if (ci >= 0) run.curses.splice(ci, 1);
          else if (run.augments.length) {
            let wi = 0;
            run.augments.forEach((id, i) => { if (augScore(id) < augScore(run.augments[wi])) wi = i; });
            RS.removeAug(run, wi);
          }
          break;
        }
        case 'upgrade': {
          const idx = run.augments.map((id, i) => i).filter((i) => RS.canUpgradeAug(run.augments[i]));
          if (idx.length) RS.upgradeAug(run, random ? rng.pick(idx) : best(idx, (i) => augScore(run.augments[i])));
          break;
        }
        case 'transform': {
          const idx = run.augments.map((id, i) => i).filter((i) => !RS.augDef(run.augments[i]).onPick);
          if (idx.length) RS.transformAug(run, random ? rng.pick(idx) : best(idx, (i) => -augScore(run.augments[i])));
          break;
        }
        case 'runeChoice':
        case 'rune': {
          const rune = item.rune || item.runes[0];
          const free = [];
          for (let i = 0; i < run.board.length; i++) if (!run.runes[i] || RS.RUNE[run.runes[i]].bad) free.push(i);
          if (!free.length) break;
          // 가장 좋은 유닛이 선 칸, 없으면 안쪽 칸
          const slot = random ? rng.pick(free) : best(free, (i) => (run.board[i] ? run.board[i].tier * 10 + run.board[i].n : RS.isInner(i) ? 1 : 0));
          RS.setRune(run, slot, rune);
          break;
        }
        case 'unit': {
          const maxTier = item.maxTier == null ? 3 : item.maxTier;
          const slots = [];
          for (let i = 0; i < run.board.length; i++) if (run.board[i] && run.board[i].tier <= maxTier) slots.push(i);
          if (!slots.length) break;
          if (item.op === 'dup') {
            const i = best(slots, (k) => run.board[k].tier);
            RS.addUnit(run.board, run.board[i].cls, run.board[i].tier, i);
          } else if (item.op === 'sacrifice') {
            RS.sacrificeUnit(run, best(slots, (k) => (run.board[k].tier === 2 ? 10 : -run.board[k].tier)));
          }
          break;
        }
      }
    },
    shop(run) {
      const shop = run.pending.shop;
      const want = (it) => {
        if (it.sold || run.gold < it.price) return false;
        if (random) return rng.chance(0.3);
        if (it.kind === 'remove') return run.curses.some((id) => !RS.CURSE[id].permanent);
        if (it.kind === 'relic') return run.gold >= it.price + 30;
        if (it.kind === 'aug') return AUG_SCORE[it.id] >= 6 && run.gold >= it.price + 40;
        if (it.kind === 'item') return run.gold >= it.price + 150;
        if (it.kind === 'unit') return it.tier === 2 && run.gold >= it.price + 60;
        if (it.kind === 'rune') return run.gold >= it.price + 80;
        return false;
      };
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < shop.list.length; i++) {
          if (!want(shop.list[i])) continue;
          const r = RS.shopBuy(run, i);
          if (r.ok) {
            while (run.queue.length) {
              bot.handle(run, run.queue[0]);
              run.queue.shift();
            }
          }
        }
      }
    },
    // 전투 중 조작 (0.25초마다)
    act(b) {
      const run = b.run;
      let i;
      while ((i = RS.firstMergeable(run.board)) >= 0) {
        const pick = b.M.mergeChoose ? b.mergeOptions(i)[0] : undefined;
        if (!b.merge(i, pick)) break;
      }
      const danger = b.enemies.length > b.cap * 0.6 || run.life <= 4 || (b.boss && b.bossTimer < 15);
      if (b.canStarfall() && (danger || b.boss || b.stars >= 5)) b.starfall();
      if (run.items.length) {
        if (danger) {
          const idx = run.items.findIndex((id) => id === 'bomb' || id === 'freeze' || id === 'rage' || id === 'ghostly');
          if (idx >= 0) b.useItem(idx);
        }
        const heal = run.items.indexOf('potion');
        if (heal >= 0 && run.life <= run.maxLife - 6) b.useItem(heal);
        const other = run.items.findIndex((id) => id === 'goldScroll' || id === 'summonScroll' || id === 'anvilScroll');
        if (other >= 0) b.useItem(other);
      }
      // 소환 우선, 자리가 없으면 강화
      let guard = 0;
      while (guard++ < 20) {
        const cost = b.summonCost();
        if (run.gold >= cost && RS.hasEmptySlot(run.board) && b.summonLimit() > 0) {
          if (b.summon().err) break;
          continue;
        }
        if (!RS.hasEmptySlot(run.board) || b.summonLimit() <= 0 || (!random && cost > 40 && run.gold > cost)) {
          const cls = RS.mostCommonClass(run);
          if (run.gold >= b.upgradeCost(cls) && run.gold >= Math.min(cost, 200)) {
            if (b.upgrade(cls).err) break;
            continue;
          }
        }
        break;
      }
      if (!random && b.t % 5 < 0.25) b.arrange();
    },
  };
  return bot;
}

// ─────────────────────────────────────────────────────────────
// smart 봇
// ─────────────────────────────────────────────────────────────

// 조정할 수 있는 값 (node tools/sim.js ... --bp=이름=값 으로 바꿔 볼 수 있다)
const SMART_DEFAULTS = {
  lambda: 0.35, // 앞으로 벌 골드(와 그 골드로 살 힘)의 현재 가치 비율
  lifeC: 180, // 생명 가치 계수 (1막 골드 기준, 막마다 goldScale 배): lifeC·ln(1 + 생명/lifeK)
  lifeK: 4,
  maxLifeC: 5, // 최대 생명 1의 가치
  deathW: 1.2, // 죽음의 비용 = deathW × (지금 판의 힘·경제 가치) + deathBase
  deathBase: 300,
  hazScale: 1, // 한 판에서 죽을 확률(측정표)의 배율. 승천이 낮으면 자동으로 줄인다
  dpsRiskPow: 1.2, // 보드 DPS 가 보통보다 낮을 때 위험이 커지는 정도
  lifeFlowW: 0.6, // 앞으로의 생명 증감(흡혈·누수 배율 등)의 가치 비율
  augAvg: 0.06, // 평균적인 증강 하나 = 힘 전체의 이만큼
  relAvg: 0.07, // 평균적인 유물 하나
  rewardPerBattle: 30, // 남은 전투 하나가 주는 보상(증강·유물)의 기본 가치 (1막 골드)
  // 전투 중 소비
  upgFuture: 1.0, // 강화 가치 = 증가율 × (그 클래스의 현재 힘 + upgFuture × 전체 힘 × 앞으로의 비중)
  upgBias: 0.5, // 강화 가치에 곱하는 값. 승천 10 에서 0.4~0.6 이 1 보다 4~6%p 낫다 (1.6 이상은 초반에 약해져 크게 떨어진다)
  summonMerge: 0.35, // 소환한 유닛이 합성으로 이어지는 덤
  reserve: 1, // 1: 이자 한도만큼 골드를 남긴다 (위험할 땐 다 쓴다), 0: 남기지 않는다
  reserveAct1: 1, // 1막에서도 남길지
  saveFor: 0, // >0 이면: 가장 효율 좋은 강화 비용의 이 비율 이상을 모았을 때 덜 좋은 소환 대신 기다린다 (기다리지 않는 쪽이 낫다)
  // 이벤트 등 복제 평가
  samples: 6, // 이벤트 선택지 하나를 굴려 보는 횟수 (다른 시드)
  fightSamples: 2, // 전투가 나는 선택지는 이만큼만
  maxDepth: 1,
  skipMargin: 0, // 증강을 건너뛰려면 건너뛰기 가치가 최고 증강보다 이만큼 커야 한다
  banAugs: [], // 절대 고르지 않을 증강 (예: ["corruption"] 으로 특정 증강을 뺀 밸런스 보기)
  // 길 고르기: 칸의 기대 가치 (단위: 평균 증강 하나). 가치 함수로 잰 칸별 평균 변화에서 가져왔다
  vCombat: 2.4, // 일반 전투 (엘리트는 막마다 2.2·1.7·1.5배)
  vEvent: 0.7, // ? 칸이 이벤트일 때
  vTreasure: 0.6,
  vShopBase: 0.3, // + 가진 골드에 비례
  vRest: 1.7, // 휴식처에서 쉬지 않고 수련·연마할 때
  eliteRisk: 1, // 엘리트 사망 위험 배율
  pathLife: 1, // 길 끝에 남는 생명의 가치 배율
};

const GOLD_SCALE = [1, 1, 1.6, 2.2, 2.2];
const LEAK_L = [0, 0.5, 1.2, 1.6, 3]; // 막별 전투 한 판의 평균 생명 손실(엘리트·보스 포함)
const KILL_B = [0, 32, 80, 145, 160]; // 막별 전투 한 판의 처치 골드 (보정 전)
const EARLY_B = [0, 4, 6, 8, 8];
const CLEAR_B = [0, 27, 39, 38, 30];
const LOSS_C = [0, 0.3, 0.8, 1.1, 2]; // 막별 일반 전투 생명 손실
const LOSS_E = [0, 1.3, 2.2, 1.9, 3]; // 엘리트
const LOSS_B = [0, 1.8, 2.6, 3.2, 4]; // 보스
// 한 판에서 생명을 x 이상 잃을 확률(%) — smart 봇 승천 10, 210판 측정. 죽음은 '모두 잃음'으로 셌다.
// 누수는 대개 1~2지만, 무너지면 엘리트·보스가 한 바퀴마다 크게 깎아 끝까지 간다 (꼬리가 두껍다)
const LOSS_X = [1, 2, 3, 4, 5, 6, 8, 10, 12];
// 깊이(막-1)×10+층 마다 smart 봇의 전투 끝 DPS 중앙값 (승천 0·10 이 거의 같다)
const REF_DPS = [110, 110, 196, 293, 455, 560, 676, 789, 1132, 1450, 1816, 4166, 5187, 6061, 7226, 8000, 8853, 10033, 12053, 13900, 15853,
  29149, 34591, 36834, 45681, 49000, 52342, 61857, 71749, 82000, 92234];
const CCDF = {
  combat: [null, [13.9, 10.7, 2.4, 1.5, 1.3, 1.2, 0.9, 0.4, 0.3], [32.7, 28.5, 2.1, 0.9, 0.7, 0.6, 0.4, 0.4, 0.4], [56.6, 49, 5.3, 0.6, 0.1, 0.1, 0.1, 0.1, 0.1]],
  elite: [null, [50, 45.8, 35.8, 32.3, 15.8, 13.5, 7.3, 3.8, 3.1], [42.7, 38.2, 16.3, 15.7, 9.6, 9.6, 9, 7.9, 6.7], [37.1, 32.3, 6.6, 4.8, 3.6, 3.6, 3, 3, 2.4]],
  boss: [null, [41.6, 37.6, 19.8, 17.8, 15.8, 15.8, 13.9, 11.4, 10.9], [33.3, 29.2, 5.4, 3.6, 3.6, 3.6, 3, 2.4, 2.4], [36.5, 34, 6.9, 4.4, 3.1, 3.1, 2.5, 1.9, 1.9]],
};
const TIER_MIX = [null, [[0, 0.6], [1, 0.4]], [[1, 0.6], [2, 0.4]], [[2, 0.6], [3, 0.4]], [[2, 0.5], [3, 0.5]]];
const DEATH = -1e6;

function makeSmartBot(RS, rng, opts) {
  const P = Object.assign({}, SMART_DEFAULTS, opts.params || {});
  const basicPart = (k) => !!P.basicParts && P.basicParts.indexOf(k) >= 0;
  const keysMode = !!opts.keys;
  const BAL = RS.BAL;
  const CL = RS.CLASSES;
  const st0 = {};
  const has = (x) => typeof x === 'function';
  const gs = (a) => GOLD_SCALE[Math.max(1, Math.min(4, a || 1))];
  const act3 = (run) => Math.min(3, run.act);
  const stats = { upgrades: 0, summons: 0, shopSpend: 0, shopBuys: {}, skips: 0, rests: {}, evalClones: 0, evSamples: 0, evalErrors: 0 };
  // --bp=debug=true: 실제 판의 판단과 그 가치를 출력한다
  const dbg = (...a) => {
    if (P.debug && !depth) console.log(...a);
  };
  const r0f = (x) => (x == null || !isFinite(x) ? String(x) : Math.round(x));
  let depth = 0; // 복제 평가 중첩 깊이
  let warned = false;
  let seedCtr = 1;
  const mem = { loss: {} }; // 막별 일반 전투 생명 손실 기록 (길 고르기용)

  // ── 복제 ──
  function clone(run, reseed) {
    stats.evalClones++;
    const c = RS.loadString(RS.saveString(run));
    if (reseed != null) {
      c.rngS = reseed | 0;
      RS.attachRng(c);
    }
    return c;
  }
  const nextSeed = () => (Math.imul(seedCtr++, 0x9e3779b1) ^ 0x5bd1e995) | 0;

  // ── 힘 모델 ──
  function unitStats(run, M, dyn, cls, tier, i) {
    if (has(RS.unitStats)) return RS.unitStats(run, M, dyn, cls, tier, i, st0);
    const C = RS.CLASS[cls];
    const T = RS.TIER[tier];
    const lv = 1 + (run.classLv[cls] || 0) * BAL.upgradePct;
    st0.dps = (C.dmg * T.dmg * lv * (1 + M.dmgPct + (dyn ? dyn.dmgPct : 0))) / ((C.interval * T.spd) / (1 + M.aspdPct));
    st0.range = C.range + 3 * tier;
    st0.splash = C.splash ? C.splash[tier] : 0;
    return st0;
  }
  function slotPower(run, M, dyn, cls, tier, i) {
    const s = unitStats(run, M, dyn, cls, tier, i);
    return (s.dps || 0) * classFactor(cls, tier, s, M);
  }
  // 유닛 한 기의 DPS 에 곱하는 역할 배율 (휘두르기·폭발·둔화·사거리·룬)
  function classFactor(cls, tier, s, M) {
    const C = RS.CLASS[cls] || {};
    let f = 1;
    if (C.cleave) f = 1 + C.cleave * 0.8;
    if (C.splash) f = (1 + (s.splash || 0) / 14) * (1 + (M.burn || 0) * 1.6);
    if (C.slow) f = 1.8 * (1 + (s.frostSplash || 0) / 20);
    if (C.crit && M.poison) f *= 1 + M.poison * 0.8;
    if (!C.splash && !C.slow && M.shrapnel) f *= 1 + M.shrapnel * 0.7;
    const baseR = (C.range || 60) + 3 * tier;
    if (s.range) f *= Math.sqrt(Math.max(0.5, s.range / baseR));
    if (s.runeEcho) f *= 1 + s.runeEcho;
    if (s.runeSlow) f *= 1 + s.runeSlow * 0.5;
    return f;
  }
  // 전투 밖에서 추정하는 동적 보너스 (battle.updateDyn 과 같은 규칙)
  function dynFor(run, M, future) {
    let dmg = run.permDmg || 0;
    let aspd = 0;
    if (M.diversity || M.purity || M.eliteSquad || M.legendAura) {
      const kinds = {};
      let cnt = 0;
      let legends = 0;
      for (const s of run.board) {
        if (!s) continue;
        kinds[s.cls] = 1;
        cnt += s.n;
        if (s.tier === 3) legends += s.n;
      }
      const k = Object.keys(kinds).length;
      if (M.diversity) dmg += M.diversity * (k === 5 ? 1 : future ? 0.6 : 0);
      if (M.purity) dmg += M.purity * (k > 0 && k <= 3 ? (future ? 0.4 : 1) : future ? 0.1 : 0);
      if (M.eliteSquad) dmg += M.eliteSquad * (cnt > 0 && cnt <= 12 ? (future ? 0.2 : 1) : 0);
      if (M.legendAura) dmg += M.legendAura * (legends + (future ? 1 : 0));
    }
    if (M.rich) dmg += M.rich * 0.8;
    if (M.berserk) {
      const on = run.life <= run.maxLife / 2 ? 1 : 0.2;
      dmg += 0.6 * on;
      aspd += 0.25 * on;
    }
    const rst = run.relicState || {};
    if (rst.pumpkinCandle && rst.pumpkinCandle.charges > 0) dmg += 0.4 * (future ? Math.min(1, rst.pumpkinCandle.charges / 10) : 1);
    if (rst.waxToys) aspd += Math.max(0, 0.3 - 0.1 * Math.floor(rst.waxToys.fights / 3)) * (future ? 0.4 : 1);
    if (M.demonForm) dmg += M.demonForm * 2;
    if (M.pocketWatch) aspd += 0.15;
    return { dmgPct: dmg, aspdPct: aspd };
  }
  // 유닛 스탯에 안 잡히는 전투 효과를 전체 배율로
  function globalFactor(M) {
    let f = 1;
    f /= Math.pow(1 - Math.min(0.6, M.enemySpeedPct || 0), 0.7);
    f /= 1 + Math.max(-0.5, M.enemyHpPct || 0);
    f *= 1 - Math.min(0.9, M.missChance || 0);
    f *= 1 + (M.firstStrike || 0) * 0.06;
    f *= 1 + (M.freezeChance || 0) * 1.5;
    f *= 1 + (M.noxious || 0) * 30;
    if (M.penNib) f *= 1.1;
    f *= 1 + (M.thorns || 0) * 0.12;
    if (M.powderKeg) f *= 1.05;
    f *= 1 - (M.waveIntervalPct || 0) * 0.3;
    f *= Math.max(0.5, 1 - (M.extraEnemies || 0) * 0.04);
    f *= 1 + (M.eliteDmgPct || 0) * 0.25;
    f *= 1 + (M.eliteBattleDmg || 0) * 0.12 + (M.bigBattleDmg || 0) * 0.22;
    f *= 1 - (M.doubt || 0) * 0.015;
    if (M.capAdd) f *= Math.max(0.5, 1 + M.capAdd * 0.006);
    if (M.dragon) f *= 1.08;
    if (M.stars) f *= 1.1;
    if (M.mergeChoose) f *= 1.03;
    return f;
  }
  function boardPower(run, M, dyn) {
    let p = 0;
    for (let i = 0; i < run.board.length; i++) {
      const s = run.board[i];
      if (s) p += slotPower(run, M, dyn, s.cls, s.tier, i) * s.n;
    }
    return p * globalFactor(M);
  }
  function classPowers(run, M, dyn) {
    const out = {};
    for (const c of CL) out[c] = 0;
    for (let i = 0; i < run.board.length; i++) {
      const s = run.board[i];
      if (s && out[s.cls] != null) out[s.cls] += slotPower(run, M, dyn, s.cls, s.tier, i) * s.n;
    }
    return out;
  }
  function cmdWeights(run) {
    const cmd = RS.COMMANDER[run.commander];
    const w = {};
    let t = 0;
    for (const c of CL) t += (cmd && cmd.weights ? cmd.weights[c] : 1) || 0;
    for (const c of CL) w[c] = ((cmd && cmd.weights ? cmd.weights[c] : 1) || 0) / (t || 1);
    return w;
  }
  // 앞으로 쓸 클래스 비중: 지휘관 가중치 반, 지금 보드 반
  function futureShare(run) {
    const cw = cmdWeights(run);
    const bw = {};
    let t = 0;
    for (const c of CL) bw[c] = 0;
    for (const s of run.board) {
      if (s && bw[s.cls] != null) {
        bw[s.cls] += s.n * Math.pow(3, s.tier);
        t += s.n * Math.pow(3, s.tier);
      }
    }
    const out = {};
    for (const c of CL) out[c] = t > 0 ? 0.5 * cw[c] + (0.5 * bw[c]) / t : cw[c];
    return out;
  }
  // 앞으로의 유닛(지휘관 가중치 + 막별 등급 구성)에 대한 힘: 오래 가는 배율의 가치를 잰다
  function refPower(run, M, dyn, share) {
    const mix = TIER_MIX[Math.max(1, Math.min(4, run.act))];
    let p = 0;
    for (const c of CL) {
      if (!share[c]) continue;
      for (const [t, tw] of mix) p += share[c] * tw * slotPower(run, M, dyn, c, t, -1) / Math.pow(3.3, t);
    }
    return p * globalFactor(M);
  }
  // 소환 한 번의 기대 힘
  function summonPower(run, M, dyn) {
    const cw = cmdWeights(run);
    const pr = M.noRare ? 0 : BAL.rareChance + (M.rareChance || 0);
    const pe = M.noRare ? 0 : BAL.epicChance + (M.epicChance || 0);
    let p = 0;
    for (const c of CL) {
      if (!cw[c]) continue;
      p += cw[c] * ((1 - pr - pe) * slotPower(run, M, dyn, c, 0, -1) + pr * slotPower(run, M, dyn, c, 1, -1) + pe * slotPower(run, M, dyn, c, 2, -1));
    }
    return p * (1 + (M.twinChance || 0)) * globalFactor(M);
  }
  const upRel = (run, M, c) => (BAL.upgradePct * (M.upgradeDouble ? 2 : 1)) / (1 + (run.classLv[c] || 0) * BAL.upgradePct);
  const upCost = (run, M, c) => (M.upgradeFree ? 0 : RS.upgradeCost(run, c, M));

  // ── 골드 흐름 ──
  // 마지막 막 (열쇠를 모으는 봇이면 4막까지)
  const lastAct = () => (keysMode ? 4 : 3);
  // 남은 전투 수 (막별)
  function remBattles(run) {
    const out = [0, 0, 0, 0, 0];
    const a = run.act;
    const floors = run.map ? run.map.floors.length : 10;
    const left = Math.max(0, floors - (run.floor || 0));
    if (a === 4) {
      // 4막은 일직선: 남은 엘리트·보스 칸을 센다
      for (let f = (run.floor || 0) + 1; f <= floors; f++) {
        const n = run.map && run.map.floors[f - 1].find((x) => x);
        if (n && (n.type === 'elite' || n.type === 'boss' || n.type === 'combat')) out[4]++;
      }
    } else out[a] = left > 0 ? (left - 1) * 0.72 + 1 : 0;
    for (let k = a + 1; k <= lastAct(); k++) out[k] = k === 4 ? 2 : 7.5;
    return out;
  }
  function incomePerBattle(run, M, a, holdInt) {
    const wave = (BAL.waveGold[Math.min(3, a)] || 0) * 3 * (1 + (M.waveGoldPct || 0));
    const cap = RS.interestCap(M);
    const intr = 3 * (Math.min(cap, holdInt ? cap * 0.8 : 1.5) + (M.interestBonus || 0));
    const kill = M.noKillGold ? 0 : KILL_B[a] * (1 + (M.killGoldPct || 0));
    const clear = CLEAR_B[a] * (1 + (M.combatGoldPct || 0)) + (M.winGold || 0) * Math.min(3, a);
    const start = (M.battleStartGold || 0) * Math.min(3, a) - (M.debt || 0) * 3 - (M.sealSummon || 0) * 3;
    const S = summonCostAt(run, M, a);
    const free = ((M.waveFreeSummon || 0) * 3 + (M.startSummons || 0) + (M.startRare ? 3 : 0) + (M.happyFlower ? 1 : 0) + (M.sealSummon ? 3 : 0) + (M.echoForm ? 2.5 : 0) + (M.souls ? 40 / M.souls : 0)) * S;
    const fish = (M.ceramicFish || 0) * 1.1;
    return wave + intr + kill + EARLY_B[a] + clear + start + free + fish;
  }
  function summonCostAt(run, M, a) {
    const extra = Math.max(0, a - run.act) * 25;
    return (BAL.summonBase + BAL.summonStep * (run.summons + extra)) * Math.max(0.4, 1 + (M.summonCostPct || 0));
  }
  function futureGold(run, M, rem) {
    let g = 0;
    const hold = P.reserve > 0;
    for (let a = 1; a <= 4; a++) if (rem[a]) g += rem[a] * incomePerBattle(run, M, a, hold);
    if (run.tax > 0) g -= Math.min(run.tax, rem[run.act] + 3) * (BAL.waveGold[act3(run)] || 0) * 3;
    return Math.max(0, g);
  }
  // 골드 1의 구매력 (소환 효율 · 강화 효율)
  function purchasePower(M) {
    const pr = M.noRare ? 0 : BAL.rareChance + (M.rareChance || 0);
    const pe = M.noRare ? 0 : BAL.epicChance + (M.epicChance || 0);
    const units = (1 - pr - pe) + 3.2 * pr + 9 * pe;
    const merge = 1 + (M.mergeRefund || 0) * 0.33 + (M.mergeDouble || 0) * 0.9 + (M.mergeMirror || 0) * 0.9 - (M.mergeFail || 0) * 1.0;
    const cost = Math.max(0.4, 1 + (M.summonCostPct || 0)) * (1 - (M.cloverChance || 0)) * (M.snakeEye ? 1.15 : 1);
    let es = (units * (1 + (M.twinChance || 0)) * merge) / cost;
    if (M.summonCap) es *= 0.85;
    const es0 = 1 - BAL.rareChance - BAL.epicChance + 3.2 * BAL.rareChance + 9 * BAL.epicChance;
    const eu = M.upgradeFree ? 5 : (M.upgradeDouble ? 2 : 1) / Math.max(0.4, 1 + (M.upgradeCostPct || 0));
    return 0.55 * (es / es0) + 0.45 * eu;
  }

  // ── 생명 ──
  function lifeCore(life, maxLife, a) {
    const g = gs(a);
    if (life <= 0) return DEATH;
    return P.lifeC * g * Math.log(1 + life / P.lifeK) + P.maxLifeC * g * maxLife;
  }
  // 한 판에서 생명을 L 이상 잃을 확률 (= 생명이 L 일 때 죽을 확률)
  function hazard(type, a, L, scale) {
    if (L <= 0) return 1;
    const tab = (CCDF[type] || CCDF.combat)[Math.max(1, Math.min(3, a))];
    let p;
    if (L <= LOSS_X[0]) p = tab[0];
    else if (L >= LOSS_X[LOSS_X.length - 1]) p = tab[tab.length - 1] * Math.exp(-(L - LOSS_X[LOSS_X.length - 1]) / 8);
    else {
      let k = 0;
      while (LOSS_X[k + 1] <= L) k++;
      const t = (L - LOSS_X[k]) / (LOSS_X[k + 1] - LOSS_X[k]);
      p = tab[k] + (tab[k + 1] - tab[k]) * t;
    }
    if (a >= 4) p *= 1.5;
    return Math.min(0.95, (p / 100) * scale);
  }
  function hazScale(run) {
    return P.hazScale * (0.5 + 0.05 * Math.min(10, run.asc || 0)) * Math.max(0.6, Math.min(2.5, strength(run)));
  }
  // 이번 막이 끝날 때까지 죽을 확률 (남은 층: 전투·엘리트 섞임, 보스 앞 휴식처, 보스)
  function deathRisk(run, life, maxLife) {
    if (!run.map) return 0;
    const a = run.act;
    const sc = hazScale(run);
    const floors = run.map.floors.length;
    let L = life;
    let surv = 1;
    if (a >= 4) {
      for (let f = run.floor + 1; f <= floors; f++) {
        const t = run.map.floors[f - 1][2] && run.map.floors[f - 1][2].type;
        if (t === 'elite') surv *= 1 - hazard('elite', 4, L, sc);
        else if (t === 'boss') surv *= 1 - hazard('boss', 4, L, sc);
        else if (t === 'rest' && L < maxLife * 0.6) L = Math.min(maxLife, L + Math.ceil(maxLife * BAL.restHealPct));
      }
      return 1 - surv;
    }
    for (let f = run.floor + 1; f < floors; f++) {
      if (f === floors - 1) {
        // 보스 앞 휴식처: 생명이 낮으면 쉰다고 본다
        if (L < maxLife * 0.6) L = Math.min(maxLife, L + Math.ceil(maxLife * BAL.restHealPct));
        continue;
      }
      if (f === 5) continue; // 보물 층
      surv *= (1 - 0.62 * hazard('combat', a, L, sc)) * (1 - 0.13 * hazard('elite', a, L, sc));
      L -= 0.62 * LOSS_C[a] + 0.13 * LOSS_E[a];
    }
    if (run.floor < floors) surv *= 1 - hazard('boss', a, L, sc);
    return 1 - surv;
  }
  function lifeValue(run, M, rem, remTot, restsRem) {
    const a = run.act;
    const g = gs(a);
    let v = lifeCore(run.life, run.maxLife, a);
    const mu = ((P.lifeC * g) / (P.lifeK + run.maxLife * 0.6)) * P.lifeFlowW;
    let flow = 0;
    let maxFlow = 0;
    for (let k = 1; k <= 4; k++) {
      if (!rem[k]) continue;
      const L = LEAK_L[k];
      const fac = (M.leakMult || 1) * (1 + (M.leakAdd || 0) * 0.7) * (M.leakReduce ? 0.8 : 1) * (M.firstWaveNoLeak ? 0.92 : 1) * (M.lastWaveLeakMult ? 1.4 : 1);
      let loss = L * fac - L;
      if (M.helix) loss -= Math.min(1, L) * 0.8;
      if (M.leakShield) loss -= Math.min(M.leakShield, L * 1.5) * 0.7;
      if (loss > 0) loss *= 1.5; // 누수가 커지면 한 판에 무너질 위험도 커진다
      const start = M.battleStartLifeLoss || 0;
      const heal = Math.min(M.winHeal || 0, 2.5) * 0.7 + (M.eliteKillHeal || 0) * 0.35 + (M.meatBone ? 1 : 0) + (M.pantograph || 0) / 7;
      flow += rem[k] * (heal - loss - start);
      maxFlow += rem[k] * ((M.winMaxLife || 0) + (M.eliteKillMaxLife || 0) * 0.3);
    }
    if (M.restHealAdd) flow += restsRem * M.restHealAdd * 0.3;
    if (M.noRestHeal) flow -= restsRem * 4;
    if (run.curses.indexOf('bloomMark') >= 0) flow -= remTot * 1.2 + 6;
    v += mu * flow + P.maxLifeC * g * maxFlow;
    return v;
  }

  // ── 소모품 ──
  function itemValue(run, M, id, E) {
    const a = run.act;
    const g = gs(a);
    const pot = M.itemPotency ? 2 : 1;
    switch (id) {
      case 'bomb':
      case 'freeze':
        return 30 * g * pot;
      case 'rage':
        return 25 * g * pot;
      case 'ghostly':
        return 35 * g * pot;
      case 'potion':
        return 6 * pot * E.lifeMu * 0.8;
      case 'goldScroll':
        return 50 * Math.min(3, a) * pot * 0.95;
      case 'summonScroll':
        return (pot * E.rareUnit) / E.r0;
      case 'anvilScroll':
        return 2 * pot * E.lvMain;
      default:
        return 20 * g;
    }
  }

  // ── 가치 함수: 모든 판단의 기준 (단위: 지금 골드) ──
  function makeEval(run) {
    const a = run.act;
    const g = gs(a);
    const M0 = RS.collectMods(run);
    const dyn0 = dynFor(run, M0, false);
    const dynF0 = dynFor(run, M0, true);
    const share = futureShare(run);
    const ref0 = Math.max(1e-6, refPower(run, M0, dynF0, share));
    const P0 = boardPower(run, M0, dyn0);
    // 지금 골드 1로 살 수 있는 힘 (소환과 강화 중 나은 쪽)
    const sp = summonPower(run, M0, dyn0);
    const sc = Math.max(1, RS.summonCost(run, M0));
    let r0 = (sp * (1 + P.summonMerge)) / sc;
    const cp = classPowers(run, M0, dyn0);
    const gf = globalFactor(M0);
    let lvMain = 0;
    for (const c of CL) {
      const uc = Math.max(1, upCost(run, M0, c));
      const rate = (upRel(run, M0, c) * cp[c] * gf) / uc;
      if (rate > r0) r0 = rate;
    }
    r0 = Math.max(r0, 1e-3);
    const rem0 = remBattles(run);
    const PP0 = purchasePower(M0);
    const F0 = P.lambda * futureGold(run, M0, rem0) * PP0;
    const stake = F0 + P0 / r0;
    const deathCost = P.deathW * stake + P.deathBase * g;
    for (const c of CL) lvMain = Math.max(lvMain, upRel(run, M0, c) * (cp[c] * gf / r0 + F0 * share[c]));
    const E = {
      r0, F0, P0, stake, share, lvMain, deathCost,
      augV: P.augAvg * stake + 10 * g,
      relV: P.relAvg * stake + 30 * g,
      rareUnit: (() => {
        const cw = cmdWeights(run);
        let p = 0;
        for (const c of CL) p += cw[c] * slotPower(run, M0, dyn0, c, 1, -1);
        return p * gf;
      })(),
      lifeMu: (P.lifeC * g) / (P.lifeK + run.life),
    };
    // parts 를 넘기면 항목별 값을 채운다 (디버그용)
    E.value = function (s, parts) {
      if (!s || s.phase === 'over' || s.life <= 0) return DEATH;
      const M = RS.collectMods(s);
      const dyn = dynFor(s, M, false);
      const dynF = dynFor(s, M, true);
      const rem = remBattles(s);
      let remTot = 0;
      for (let k = 1; k <= 4; k++) remTot += rem[k];
      const actsLeft = lastAct() - s.act + (s.floor < (s.map ? s.map.floors.length : 10) ? 1 : 0);
      const restsRem = Math.max(0, actsLeft * 1.4);
      let v = s.gold;
      const pBoard = boardPower(s, M, dyn) / r0;
      const pFut = P.lambda * futureGold(s, M, rem) * purchasePower(M) * (refPower(s, M, dynF, share) / ref0);
      const pLife = lifeValue(s, M, rem, remTot, restsRem);
      const pDeath = -E.deathCost * deathRisk(s, s.life, s.maxLife);
      const pRew = remTot * P.rewardPerBattle * gs(s.act);
      if (parts) Object.assign(parts, { gold: s.gold, board: pBoard, future: pFut, life: pLife, death: pDeath, rewards: pRew });
      v += pBoard + pFut + pLife + pDeath + pRew;
      // 룬: 앞으로 그 칸에 설 유닛들
      for (let i = 0; i < s.runes.length; i++) {
        const r = s.runes[i];
        if (!r) continue;
        if (RS.RUNE[r] && RS.RUNE[r].bad) v -= 0.015 * F0;
        else v += 0.02 * F0 + (r === 'cloneR' ? restsRem * 0.3 * E.relV * 0.5 : 0);
      }
      // 소모품
      for (const id of s.items) v += itemValue(s, M, id, E);
      // 저주 하나하나의 번거로움
      v -= s.curses.length * 8 * g;
      // 증강 선택·휴식·상점·보스 관련 효과
      const picks = remTot * 1.1;
      v += picks * E.augV * ((M.augChoices || 0) * 0.12 + (M.augRerolls || 0) * 0.06 + (M.augUpChance || 0) * 0.35);
      if (M.prayerWheel) v += remTot * 0.75 * E.augV * 0.8;
      const elitesRem = actsLeft * 1.2;
      v += (M.eliteUpgrade || 0) * elitesRem * E.augV * 0.25;
      if (M.blackStar) v += elitesRem * E.relV * 0.8;
      if (M.shovel) v += restsRem * E.relV * 0.4;
      if (M.girya && s.relicState.girya) v += Math.min(3 - s.relicState.girya.lifts, restsRem) * 0.06 * F0 * 0.5;
      if (M.dreamCatcher) v += restsRem * E.augV * 0.3;
      if (M.peacePipe) v += 15 * g;
      if (M.noSmith) v -= restsRem * 25 * g;
      if (M.restTrainBonus) v += M.restTrainBonus * restsRem * 0.4 * E.lvMain;
      const shopsRem = actsLeft * 1.3;
      v += (M.shopDiscount || 0) * shopsRem * 120 * g + (M.freeFirstBuy ? shopsRem * 60 * g : 0) + (M.courier ? shopsRem * 15 * g : 0);
      v += ((M.itemSlots || 0) + ((s.relicState && s.relicState.ghostSlots) || 0)) * 12 * g;
      v += (M.itemDropBonus || 0) * remTot * 30 * g * 0.8;
      if (M.noItems) v -= remTot * 0.4 * 30 * g + 20 * g;
      v += (M.bossTimeAdd || 0) * actsLeft * 1.2 * g;
      v += (M.bossHpPct || 0) * actsLeft * 200 * g;
      if (M.eliteHpPct < 0) v -= M.eliteHpPct * elitesRem * 120 * g;
      if (M.tinyChest) v += actsLeft * 0.6 * E.relV * 0.5;
      if (M.cursedKey) v -= actsLeft * 60 * g;
      if (M.prepLocked) v -= 10 * g;
      const rs = s.relicState || {};
      if (rs.mawBank && rs.mawBank.active) v += 12 * remTot * 0.6;
      if (rs.omamori) v += rs.omamori.charges * 35 * g;
      if (rs.matryoshka) v += rs.matryoshka.count * E.relV * 0.5;
      if (rs.wingBoots) v += rs.wingBoots.uses * 8 * g;
      const q = s.quests || {};
      if (q.egg) v += 250 * g;
      if (q.wongo && q.wongo.left > 0) v += 3 * E.relV * (q.wongo.left <= remTot ? 1 : 0.3);
      if (q.spoilsAct && q.spoilsAct > s.act) v += 330;
      if (s.lament > 0) v += s.lament * 8 * g;
      if (keysMode && s.keys) v += ((s.keys.ruby ? 1 : 0) + (s.keys.emerald ? 1 : 0) + (s.keys.sapphire ? 1 : 0)) * 450 * g;
      if (parts) parts.rest = v - (s.gold + pBoard + pFut + pLife + pDeath + pRew);
      return v;
    };
    return E;
  }

  // ── 복제해서 굴려 보기 ──
  // fn(c) 로 복제본을 바꾼 뒤 대기열·이벤트·전투를 봇 판단으로 끝까지 처리하고 가치를 잰다
  function settle(c) {
    let guard = 0;
    while (c.queue && c.queue.length && guard++ < 12) {
      const item = c.queue[0];
      bot.handle(c, item);
      c.queue.shift();
    }
  }
  // 무작위 결과는 시드를 바꿔 samples 번 굴린 평균 (미래를 훔쳐보지 않는다)
  function simulateOutcome(run, E, fn, samples) {
    let tot = 0;
    let n = 0;
    const n0 = samples || 1;
    for (let k = 0; k < n0; k++) {
      const c = clone(run, nextSeed());
      depth++;
      let v;
      try {
        const ok = fn(c);
        if (ok === false) v = null;
        else {
          settle(c);
          v = E.value(c);
        }
      } catch (err) {
        // 게임 코드가 바뀌어 복제본에서 오류가 나면 그 선택지만 빼고 계속한다 (처음 한 번만 알림)
        stats.evalErrors++;
        if (!warned) {
          warned = true;
          console.error('[simbot] 복제 평가 중 오류, 그 선택지는 건너뜀:', err && err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : err);
        }
        v = null;
      } finally {
        depth--;
      }
      if (v === null) return null;
      tot += v;
      n++;
    }
    stats.evSamples += n;
    return tot / n;
  }

  // 이벤트: 선택지 idx 를 고른 뒤의 기대 가치 (다음 단계·전투까지)
  // d: 내다보는 깊이. 0 은 실제 선택, 1 이상은 복제본 안에서의 가정 (표본 1개)
  function eventOutcome(run, E, idx, d) {
    const samples = d === 0 ? P.samples : 1;
    let fightSeen = false;
    const f = (c) => {
      const res = RS.eventChoose(c, idx);
      if (res === null) return false;
      if (finishEventOnClone(c, E, d + 1)) fightSeen = true;
      return true;
    };
    // 먼저 한 번 굴려 전투가 나오는지 본다. 전투면 표본을 줄인다
    let tot = 0;
    let n = 0;
    const maxN = samples;
    for (let k = 0; k < maxN; k++) {
      const v = simulateOutcome(run, E, f, 1);
      if (v === null) return null;
      tot += v;
      n++;
      // 결과가 몇 갈래로 나뉘는 선택(상자·도박)은 두 표본이 우연히 같을 수 있어, 표본을 줄이지 않는다
      if (fightSeen && n >= P.fightSamples) break;
    }
    return tot / n;
  }
  function finishEventOnClone(c, E, d) {
    let guard = 0;
    while (c.phase === 'event' && c.pending && !c.pending.result && guard++ < 10) {
      // 더 깊은 단계는 한 걸음만 보고 고른다
      const idx = d > P.maxDepth ? greedyEventOption(c, E) : chooseEventOption(c, E, d);
      if (idx == null || idx < 0 || RS.eventChoose(c, idx) === null) break;
    }
    return runEventFight(c);
  }
  function runEventFight(c) {
    if (c.phase !== 'event' || !c.pending || !c.pending.fight) return false;
    RS.startEventFight(c);
    const b = fightBattle(RS, c, bot);
    RS.finishBattle(c, b);
    if (c.phase === 'reward') bot.reward(c);
    return true;
  }
  function greedyEventOption(run, E) {
    const list = RS.eventOptions(run);
    let bi = -1;
    let bv = -Infinity;
    for (let i = 0; i < list.length; i++) {
      if (!RS.optionEnabled(run, list[i])) continue;
      const v = simulateOutcome(run, E, (c) => {
        if (RS.eventChoose(c, i) === null) return false;
        runEventFight(c);
        return true;
      }, 1);
      if (v !== null && v > bv) {
        bv = v;
        bi = i;
      }
    }
    return bi;
  }
  function chooseEventOption(run, E, d) {
    const list = RS.eventOptions(run);
    let bi = -1;
    let bv = -Infinity;
    const shown = [];
    const v0 = P.debug && !depth ? E.value(run) : 0;
    for (let i = 0; i < list.length; i++) {
      if (!RS.optionEnabled(run, list[i])) continue;
      const v = eventOutcome(run, E, i, d);
      if (v === null) continue;
      if (P.debug && !depth) shown.push(`${RS.optionLabel(run, list[i])}=${r0f(v - v0)}`);
      if (v > bv) {
        bv = v;
        bi = i;
      }
    }
    if (shown.length) dbg(`  [이벤트 ${run.pending.event}] ${shown.join(' | ')} → ${bi >= 0 ? RS.optionLabel(run, list[bi]) : '-'}`);
    return bi;
  }

  // ── 증강 고르기 ──
  function augValues(run, ids, E) {
    const out = {};
    if (depth >= 2) {
      // 깊은 복제 안에서는 점수표만 본다
      for (const id of ids) out[id] = (AUG_SCORE[RS.augDef(id).id] || 4) * E.augV * 0.18;
      return out;
    }
    const v0 = E.value(run);
    for (const id of ids) {
      const v = simulateOutcome(run, E, (c) => {
        RS.pickAugment(c, id);
      }, RS.augDef(id).onPick ? 2 : 1);
      out[id] = v === null ? -Infinity : v - v0;
    }
    return out;
  }
  function skipGoldNow(run) {
    if (has(RS.skipGoldAmount)) return RS.skipGoldAmount(run);
    const M = RS.collectMods(run);
    return BAL.skipGold[Math.min(3, run.act)] * (1 + (M.skipGoldMul || 0));
  }
  function skipValue(run, E, withGold) {
    const M = RS.collectMods(run);
    let v = withGold ? skipGoldNow(run) : 0;
    if (M.singingBowl) v += 2 * P.maxLifeC * gs(run.act) + 2 * E.lifeMu * 0.5;
    return v;
  }
  // 고를 증강 id (또는 건너뛰면 null)
  function chooseAug(run, ids, skipGold) {
    if (P.banAugs && P.banAugs.length) ids = ids.filter((id) => P.banAugs.indexOf(RS.augDef(id).id) < 0);
    if (!ids.length) return null;
    if (basicPart('aug')) return best(ids, (id) => (RS.isUpgraded(id) ? 1 : 0) + (AUG_SCORE[RS.augDef(id).id] || (RS.augDef(id).custom ? 5 : 3)));
    const E = makeEval(run);
    const vals = augValues(run, ids, E);
    const id = best(ids, (x) => vals[x]);
    const sv = skipValue(run, E, skipGold);
    dbg(`  [증강] ${ids.map((x) => `${RS.augDef(x).name}${RS.isUpgraded(x) ? '+' : ''}=${r0f(vals[x])}`).join(' | ')} · 건너뛰기=${r0f(sv)}`);
    if (vals[id] < sv - P.skipMargin) {
      if (!depth) stats.skips++;
      return null;
    }
    return id;
  }

  function chooseRelic(run, ids) {
    if (ids.length <= 1) return ids[0];
    if (depth >= 2) return ids[0];
    const E = makeEval(run);
    return best(ids, (id) => {
      const v = simulateOutcome(run, E, (c) => { RS.addRelic(c, id); }, RS.REL[id] && RS.REL[id].onPick ? 2 : 1);
      return v === null ? -Infinity : v;
    });
  }

  // 복제 없이 잠깐 바꿨다가 되돌리며 재기 (보드·룬·증강 목록 같은 단순 상태)
  function tryValue(run, E, apply, undo) {
    apply();
    const v = E.value(run);
    undo();
    return v;
  }

  const bot = {
    kind: 'smart',
    stats,
    params: P,

    // ── 전투 ──
    act(b) {
      const run = b.run;
      const M = b.M;
      let i;
      while ((i = RS.firstMergeable(run.board)) >= 0) {
        let pick;
        if (M.mergeChoose && has(b.mergeOptions)) pick = chooseMergeClass(run, b.mergeOptions(i), run.board[i].tier + 1);
        if (!b.merge(i, pick)) break;
      }
      const danger = b.enemies.length > b.cap * 0.6 || run.life <= 4 || (b.boss && b.bossTimer < 15);
      const starMax = typeof b.starMax === 'number' ? b.starMax : 5;
      if (b.canStarfall() && (danger || b.boss || b.stars >= starMax || b.enemies.length > b.cap * 0.4)) b.starfall();
      if (run.items.length) useItems(b, danger);
      spend(b, danger);
      if (b.t % 5 < 0.25) b.arrange();
    },

    // ── 보상 화면 ──
    reward(run) {
      const r = run.pending.reward;
      if (!r.augDone) {
        let pick = null;
        if (r.aug && r.aug.length) {
          pick = chooseAug(run, r.aug, true);
          // 새로고침: 건너뛸 만큼 약하면 한 번 더 본다
          if (!pick && r.rerolls > 0 && has(RS.rewardReroll) && RS.rewardReroll(run)) pick = chooseAug(run, r.aug, true);
        }
        if (pick) RS.rewardPickAug(run, pick);
        else RS.rewardSkipAug(run);
      }
      if (r.relics && r.relics.length && !r.relicDone) RS.rewardPickRelic(run, chooseRelic(run, r.relics));
      r.relicDone = true;
    },

    // ── 선택 대기열 ──
    handle(run, item) {
      // 처리하는 동안은 대기열에서 빼 둔다 (평가용 복제본이 같은 항목을 또 처리하지 않게)
      const q = run.queue || [];
      const at = q.indexOf(item);
      if (at >= 0) q.splice(at, 1);
      try {
        handleItem(run, item);
      } finally {
        if (at >= 0) q.splice(at, 0, item);
      }
    },

    // ── 이벤트: 선택지마다 복제해 굴려 본 기대 가치가 가장 큰 것 ──
    eventOption(run, list) {
      const idx = chooseEventOption(run, makeEval(run), 0);
      if (idx >= 0) return idx;
      for (let i = 0; i < list.length; i++) if (RS.optionEnabled(run, list[i])) return i;
      return list.length - 1;
    },
    evaluator(run) {
      return makeEval(run);
    },
  };

  // 고르지 않고 넘기는 항목은 RS.cancelChoice 로 알린다 (돈을 낸 서비스면 환불)
  function handleItem(run, item) {
    const cancel = () => {
      if (has(RS.cancelChoice)) RS.cancelChoice(run, item);
    };
    switch (item.k) {
      case 'aug':
      case 'augList': {
        let ids = item.ids || RS.rollAugments(run, item.n || RS.augChoiceCount(run), item.w);
        let picked = 0;
        for (let k = 0; k < (item.left || 1) && ids.length; k++) {
          const id = chooseAug(run, ids, false);
          if (!id) break;
          RS.pickAugment(run, id);
          picked++;
          ids = ids.filter((x) => x !== id);
        }
        if (!picked) cancel();
        break;
      }
      case 'relicList':
        if (item.ids && item.ids.length) RS.addRelic(run, chooseRelic(run, item.ids));
        break;
      case 'remove':
        if (!doRemove(run)) cancel();
        break;
      case 'upgrade':
        if (!doUpgradeAug(run)) cancel();
        break;
      case 'transform':
        if (!doTransform(run)) cancel();
        break;
      case 'runeChoice':
      case 'rune':
        if (!doRune(run, item.rune ? [item.rune] : item.runes || [])) cancel();
        break;
      case 'unit':
        if (!doUnit(run, item)) cancel();
        break;
      default:
        cancel();
    }
  }

  Object.assign(bot, {
    // ── 상점: 가치가 값보다 큰 물건부터 ──
    shop(run) {
      const shop = run.pending.shop;
      for (let round = 0; round < 8; round++) {
        const E = makeEval(run);
        const v0 = E.value(run);
        let bi = -1;
        let bv = 0;
        const shown = [];
        for (let i = 0; i < shop.list.length; i++) {
          const it = shop.list[i];
          if (!it || it.sold || run.gold < it.price) continue;
          if (it.kind === 'remove' && !RS.removableCount(run)) continue;
          if (it.kind === 'item' && run.items.length >= RS.itemSlots(run)) continue;
          if (it.kind === 'unit' && !RS.hasEmptySlot(run.board)) continue;
          if (it.kind === 'aug' && P.banAugs && P.banAugs.indexOf(RS.augDef(it.id).id) >= 0) continue;
          const v = simulateOutcome(run, E, (c) => {
            const r = RS.shopBuy(c, i);
            return !!(r && r.ok);
          }, 1);
          if (v === null) continue;
          const gain = v - v0;
          if (P.debug) shown.push(`${it.kind}:${it.id || it.tier || ''}(${it.price}g)=${r0f(gain)}`);
          if (gain > bv) {
            bv = gain;
            bi = i;
          }
        }
        dbg(`  [상점 ${run.gold}g] ${shown.join(' | ')}`);
        if (bi < 0 || bv < 3 * gs(run.act)) break;
        const it = shop.list[bi];
        const g0 = run.gold;
        const r = RS.shopBuy(run, bi);
        if (!r || !r.ok) break;
        stats.shopSpend += g0 - run.gold;
        stats.shopBuys[it.kind] = (stats.shopBuys[it.kind] || 0) + 1;
        let guard = 0;
        while (run.queue.length && guard++ < 10) {
          bot.handle(run, run.queue[0]);
          run.queue.shift();
        }
      }
    },

    // ── 휴식처 ──
    rest(run) {
      const opts = RS.restOptions(run).filter((o) => !o.off);
      if (!opts.length) return null;
      const E = makeEval(run);
      const v0 = E.value(run);
      const shown = [];
      let bo = null;
      let bv = -Infinity;
      for (const o of opts) {
        const args = o.id === 'train' ? CL : [undefined];
        for (const arg of args) {
          const v = simulateOutcome(run, E, (c) => { RS.restDo(c, o.id, arg); }, o.id === 'dig' ? 2 : 1);
          if (P.debug) shown.push(`${o.id}${arg ? ':' + arg : ''}=${r0f(v - v0)}`);
          if (v !== null && v > bv) {
            bv = v;
            bo = { id: o.id, arg };
          }
        }
      }
      if (bo) stats.rests[bo.id] = (stats.rests[bo.id] || 0) + 1;
      dbg(`  [휴식 생명 ${run.life}/${run.maxLife}] ${shown.join(' | ')} → ${bo && bo.id}`);
      return bo;
    },

    treasure(run) {
      const canKey = keysMode && run.act <= 3 && run.keys && !run.keys.sapphire;
      if (!canKey) return false;
      const E = makeEval(run);
      const vKey = simulateOutcome(run, E, (c) => { RS.openChest(c, true); }, 1);
      const vRel = simulateOutcome(run, E, (c) => { RS.openChest(c, false); }, 1);
      return vKey >= vRel;
    },

    neow(run, list) {
      const E = makeEval(run);
      const v0 = E.value(run);
      const vals = list.map((b) => {
        const v = simulateOutcome(run, E, (c) => { RS.applyBlessing(c, b); }, P.samples);
        return v === null ? -Infinity : v;
      });
      const bi = best(list.map((b, i) => i), (i) => vals[i]);
      dbg(`  [문지기] ${list.map((b, i) => `${b.kind}:${b.id || ''}${b.cost ? '/' + b.cost : ''}=${r0f(vals[i] - v0)}`).join(' | ')}`);
      return list[bi];
    },

    ancient(run, boons) {
      const E = makeEval(run);
      const v0 = E.value(run);
      const vals = boons.map((id) => {
        const v = simulateOutcome(run, E, (c) => { RS.applyAncient(c, id); }, 2);
        return v === null ? -Infinity : v;
      });
      dbg(`  [고대 존재] ${boons.map((id, i) => `${id}=${r0f(vals[i] - v0)}`).join(' | ')}`);
      return boons[best(boons.map((b, i) => i), (i) => vals[i])];
    },

    // ── 길 고르기 ──
    pickNode(run, choices) {
      return pickPath(run, choices);
    },

    // 전투 결과 기록 (길 고르기의 위험 추정)
    afterBattle(run, b) {
      dbg(`[전투 ${run.act}막 ${run.floor}층 ${b.kind}] ${b.result} 생명 ${b.stats ? b.stats.lifeStart : '?'}→${run.life} 골드 ${Math.round(run.gold)} DPS ${Math.round(b.totalDps())} 강화Lv ${CL.map((c) => run.classLv[c]).join('/')} 소환 ${run.summons}`);
      const k = run.act + ':' + (b.kind || 'combat');
      const m = mem.loss[k] || (mem.loss[k] = { n: 0, sum: 0 });
      m.n++;
      m.sum += Math.max(0, (b.stats ? b.stats.lifeStart : run.life) - run.life);
    },
  });

  // ── 전투 중 소비: 골드당 힘이 가장 많이 오르는 쪽 ──
  function reserveFor(b) {
    if (!P.reserve) return 0;
    const run = b.run;
    if (run.act === 1 && !P.reserveAct1) return 0;
    let r = RS.interestCap(b.M) * BAL.interestPer;
    if (b.M.rich) r = Math.max(r, 100);
    // 첫 전투 초반처럼 보드가 빈약하면 먼저 채운다
    if (RS.boardUnitCount(run.board) < 6) return 0;
    return r;
  }
  function spend(b, danger) {
    const run = b.run;
    const M = b.M;
    if (M.prepLocked && b.prep > 0) return;
    const reserve = danger ? 0 : reserveFor(b);
    let guard = 0;
    let cache = null;
    let freeUps = 0; // 공짜 강화(타락)는 사람 손 속도처럼 한 번 조작에 한 번만
    while (guard++ < 12) {
      const avail = run.gold - reserve;
      if (avail < 1) return;
      const sc = b.summonCost();
      // 빈칸이 있을 때만 소환한다 (빈칸 없이 누르면 공짜로 다시 굴리는 셈이라 쓰지 않는다)
      const canSummon = b.summonLimit() > 0 && RS.hasEmptySlot(run.board);
      let cheapest = canSummon ? sc : Infinity;
      const ucs = {};
      for (const c of CL) {
        ucs[c] = b.upgradeCost(c);
        if (ucs[c] < cheapest) cheapest = ucs[c];
      }
      if (avail < cheapest) return;
      if (!cache) {
        cache = { cp: battleClassPowers(b), sp: battleSummonPower(b), share: futureShare(run) };
        let tot = 0;
        for (const c of CL) tot += cache.cp[c];
        cache.tot = tot * globalFactor(M);
      }
      const gf = globalFactor(M);
      // 후보: 소환 / 클래스별 강화
      let bestOpt = null;
      let bestRate = 0;
      let bestAff = null;
      let bestAffRate = 0;
      const consider = (opt, rate, cost) => {
        if (rate > bestRate) {
          bestRate = rate;
          bestOpt = opt;
        }
        if (cost <= avail && rate > bestAffRate) {
          bestAffRate = rate;
          bestAff = opt;
        }
      };
      if (canSummon) {
        const val = cache.sp * (1 + P.summonMerge);
        consider({ k: 's', cost: sc }, val / Math.max(1, sc), sc);
      }
      for (const c of CL) {
        const cost = ucs[c];
        if (cost <= 0 && freeUps >= 1) continue;
        const rel = upRel(run, M, c);
        const val = P.upgBias * rel * (cache.cp[c] * gf + P.upgFuture * cache.tot * cache.share[c]);
        if (val <= 0) continue;
        consider({ k: 'u', c, cost }, val / Math.max(1, cost), cost);
      }
      if (!bestAff) return;
      // 더 좋은 강화를 위해 모으는 중이면 기다린다 (위험할 땐 바로 쓴다)
      if (P.saveFor > 0 && !danger && bestOpt !== bestAff && bestOpt.k === 'u' && run.gold >= bestOpt.cost * P.saveFor && bestAffRate < bestRate * 0.8) return;
      if (bestAff.k === 's') {
        const r = b.summon();
        if (r.err) return;
        if (!depth) stats.summons++;
      } else {
        const r = b.upgrade(bestAff.c);
        if (r.err) return;
        if (bestAff.cost <= 0) freeUps++;
        if (!depth) stats.upgrades++;
      }
      cache = null;
    }
  }
  // 전투가 이미 계산해 둔 칸별 스탯으로 클래스별 힘을 잰다 (다시 계산하지 않는다)
  function battleClassPowers(b) {
    const run = b.run;
    const out = {};
    for (const c of CL) out[c] = 0;
    if (has(b.totalDps)) b.totalDps(); // 스탯이 낡았으면 전투가 새로 계산한다
    const ss = b.slotStats;
    if (!ss) return classPowers(run, b.M, b.dyn || { dmgPct: 0, aspdPct: 0 });
    for (let i = 0; i < run.board.length; i++) {
      const s = run.board[i];
      const st = ss[i];
      if (s && st && out[s.cls] != null) out[s.cls] += (st.dps || 0) * classFactor(s.cls, s.tier, st, b.M) * s.n;
    }
    return out;
  }
  // 소환 한 번의 기대 힘: 강화 레벨·전투 중 버프가 바뀔 때만 다시 잰다
  let spMemo = null;
  function battleSummonPower(b) {
    const run = b.run;
    const dyn = b.dyn || { dmgPct: 0, aspdPct: 0 };
    let key = dyn.dmgPct + '|' + dyn.aspdPct;
    for (const c of CL) key += '|' + run.classLv[c];
    if (spMemo && spMemo.b === b && spMemo.key === key) return spMemo.v;
    const v = summonPower(run, b.M, dyn);
    spMemo = { b, key, v };
    return v;
  }
  function useItems(b, danger) {
    const run = b.run;
    const M = b.M;
    const pot = M.itemPotency ? 2 : 1;
    const idx = (id) => run.items.indexOf(id);
    if (danger) {
      const k = run.items.findIndex((id) => id === 'bomb' || id === 'freeze' || id === 'rage' || id === 'ghostly');
      if (k >= 0) b.useItem(k);
    }
    if (idx('potion') >= 0 && (run.life <= run.maxLife - 6 * pot || run.life <= 4)) b.useItem(idx('potion'));
    if (idx('goldScroll') >= 0) b.useItem(idx('goldScroll'));
    if (idx('summonScroll') >= 0 && RS.hasEmptySlot(run.board)) b.useItem(idx('summonScroll'));
    if (idx('anvilScroll') >= 0 && RS.boardUnitCount(run.board) >= 5) b.useItem(idx('anvilScroll'));
  }
  // 고대 두루마리: 이미 모으는 중인 클래스·강화된 클래스 쪽으로
  function chooseMergeClass(run, opts, tier) {
    if (!opts || !opts.length) return undefined;
    const share = futureShare(run);
    return best(opts, (c) => {
      let s = (run.classLv[c] || 0) * 2 + share[c] * 10;
      for (const x of run.board) if (x && x.cls === c && x.tier === tier && x.n < 3) s += 6 + x.n * 2;
      return s;
    });
  }

  // ── 대기열 처리 ──
  function doRemove(run) {
    const cands = [];
    run.curses.forEach((id, i) => { if (RS.CURSE[id] && !RS.CURSE[id].permanent) cands.push({ c: i }); });
    run.augments.forEach((id, i) => cands.push({ a: i }));
    if (!cands.length) return false;
    if (depth >= 2) {
      const c = cands[0];
      if (c.c != null) run.curses.splice(c.c, 1);
      else {
        let wi = 0;
        run.augments.forEach((id, i) => { if ((AUG_SCORE[RS.augDef(id).id] || 4) < (AUG_SCORE[RS.augDef(run.augments[wi]).id] || 4)) wi = i; });
        RS.removeAug(run, wi);
      }
      return true;
    }
    const E = makeEval(run);
    const v0 = E.value(run);
    let bc = null;
    let bv = -Infinity;
    for (const c of cands) {
      let v;
      if (c.c != null) {
        const saved = run.curses.slice();
        v = tryValue(run, E, () => run.curses.splice(c.c, 1), () => { run.curses = saved; });
      } else {
        const saved = run.augments.slice();
        v = tryValue(run, E, () => RS.removeAug(run, c.a), () => { run.augments = saved; });
      }
      if (v > bv) {
        bv = v;
        bc = c;
      }
    }
    // 없애서 손해면 그만둔다 (저주·나쁜 증강이 없을 때)
    if (!bc || bv < v0 - 1) return false;
    if (bc.c != null) run.curses.splice(bc.c, 1);
    else RS.removeAug(run, bc.a);
    return true;
  }
  function doUpgradeAug(run) {
    const idx = run.augments.map((id, i) => i).filter((i) => RS.canUpgradeAug(run.augments[i]));
    if (!idx.length) return false;
    if (depth >= 2) {
      RS.upgradeAug(run, best(idx, (i) => AUG_SCORE[RS.augDef(run.augments[i]).id] || 4));
      return true;
    }
    const E = makeEval(run);
    const i = best(idx, (k) => {
      const saved = run.augments[k];
      return tryValue(run, E, () => RS.upgradeAug(run, k), () => { run.augments[k] = saved; });
    });
    RS.upgradeAug(run, i);
    return true;
  }
  function doTransform(run) {
    const idx = run.augments.map((id, i) => i).filter((i) => !RS.augDef(run.augments[i]).onPick);
    if (!idx.length) return false;
    const E = depth >= 2 ? null : makeEval(run);
    // 가장 쓸모없는 증강을 바꾼다 (없앴을 때 손해가 가장 적은 것)
    const i = best(idx, (k) => {
      if (!E) return -(AUG_SCORE[RS.augDef(run.augments[k]).id] || 4);
      const saved = run.augments.slice();
      return tryValue(run, E, () => RS.removeAug(run, k), () => { run.augments = saved; });
    });
    RS.transformAug(run, i);
    return true;
  }
  function doRune(run, runes) {
    const free = [];
    for (let i = 0; i < run.board.length; i++) if (!run.runes[i] || (RS.RUNE[run.runes[i]] && RS.RUNE[run.runes[i]].bad)) free.push(i);
    if (!free.length || !runes.length) return false;
    const E = makeEval(run);
    // 좋은 룬: 가장 강한 유닛이 선 칸 (배치 정리가 같은 구역의 강한 유닛을 룬 칸으로 옮긴다)
    let bestPick = null;
    let bv = -Infinity;
    for (const rune of runes) {
      for (const i of free) {
        const old = run.runes[i];
        const v = tryValue(run, E, () => { run.runes[i] = rune; }, () => { run.runes[i] = old; });
        const tie = run.board[i] ? run.board[i].tier * 0.01 : RS.isInner(i) ? 0.001 : 0;
        if (v + tie > bv) {
          bv = v + tie;
          bestPick = { rune, i };
        }
      }
    }
    RS.setRune(run, bestPick.i, bestPick.rune);
    return true;
  }
  function doUnit(run, item) {
    const maxTier = item.maxTier == null ? 3 : item.maxTier;
    const slots = [];
    for (let i = 0; i < run.board.length; i++) if (run.board[i] && run.board[i].tier <= maxTier) slots.push(i);
    if (!slots.length) return false;
    if (depth >= 2) {
      // 깊은 복제 안에서는 간단히: 복제는 가장 높은 등급, 제물은 영웅 > 희귀
      if (item.op === 'dup') {
        const i = best(slots, (k) => run.board[k].tier);
        RS.addUnit(run.board, run.board[i].cls, run.board[i].tier, i);
        return true;
      }
      if (item.op === 'sacrifice') {
        const i = best(slots, (k) => (run.board[k].tier === 2 ? 10 : run.board[k].tier === 1 ? 5 : -run.board[k].tier));
        if (run.board[i].tier === 0 || run.board[i].tier === 3) return false;
        RS.sacrificeUnit(run, i);
        return true;
      }
      return false;
    }
    const E = makeEval(run);
    if (item.op === 'dup') {
      const i = best(slots, (k) => {
        const saved = run.board.map((s) => (s ? Object.assign({}, s) : null));
        return tryValue(run, E, () => RS.addUnit(run.board, run.board[k].cls, run.board[k].tier, k), () => { run.board = saved; });
      });
      RS.addUnit(run.board, run.board[i].cls, run.board[i].tier, i);
      return true;
    }
    if (item.op === 'sacrifice') {
      const v0 = E.value(run);
      let bi = -1;
      let bv = -Infinity;
      for (const k of slots) {
        const v = simulateOutcome(run, E, (c) => { RS.sacrificeUnit(c, k); }, run.board[k].tier === 3 ? 2 : 1);
        if (v !== null && v > bv) {
          bv = v;
          bi = k;
        }
      }
      if (bi < 0 || bv < v0) return false;
      RS.sacrificeUnit(run, bi);
      return true;
    }
    return false;
  }

  // ── 길 고르기: 보스까지의 모든 길을 훑어 기대 가치가 가장 큰 길의 다음 칸 ──
  // 칸 가치는 '평균 증강 하나'(E.augV) 단위. 전투 칸은 죽을 확률 × 죽음의 비용을 뺀다.
  // 약함 (1 = 보통, 클수록 위험): 보드 DPS 가 이 깊이의 보통 DPS 보다 낮으면 커진다.
  // 이번 막 일반 전투에서 예상보다 생명을 많이 잃었다면(상성 등) 조금 더 키운다
  function boardDps(run) {
    const M = RS.collectMods(run);
    const dyn = dynFor(run, M, false);
    let p = 0;
    for (let i = 0; i < run.board.length; i++) {
      const s = run.board[i];
      if (s) p += (unitStats(run, M, dyn, s.cls, s.tier, i).dps || 0) * s.n;
    }
    return p * globalFactor(M);
  }
  function strength(run) {
    const a = Math.min(4, run.act);
    const d = Math.max(1, Math.min(30, (Math.min(3, a) - 1) * 10 + (a >= 4 ? 10 : run.floor || 1)));
    const ref = REF_DPS[d] * (a >= 4 ? 1.4 : 1);
    let wk = Math.pow(Math.max(0.03, boardDps(run) / ref), -P.dpsRiskPow);
    const m = mem.loss[a + ':combat'];
    if (m && m.n >= 2) wk *= Math.pow(Math.max(0.5, Math.min(3, (m.sum / m.n + 0.2) / (LOSS_C[a] + 0.2))), 0.3);
    return Math.max(0.4, Math.min(4, wk));
  }
  const ELITE_MUL = [0, 2.2, 1.7, 1.5, 1.5];
  // 칸 하나를 지난 뒤의 (가치, 상태) 후보들. 휴식처는 '쉰다'와 '수련·연마' 두 갈래
  function nodeOptions(ctx, node, st) {
    const a = ctx.a;
    const t = node.type;
    const wk = ctx.wk;
    const risk = (type, life) => (ctx.deathCost / ctx.unit) * hazard(type, a, life, ctx.sc);
    const next = (v, life, gold) => ({ v, st: { life, gold, maxLife: st.maxLife } });
    const life = st.life;
    const gold = st.gold;
    if (t === 'combat') {
      const v = P.vCombat - risk('combat', life);
      return [next(v, life - LOSS_C[a] * wk, gold + ctx.income)];
    }
    if (t === 'elite') {
      let v = P.vCombat * ELITE_MUL[a] - risk('elite', life) * P.eliteRisk;
      if (node.burning) v += ctx.keysEmerald ? 8 : 0.5;
      return [next(v, life - LOSS_E[a] * wk * (node.burning ? 1.3 : 1), gold + ctx.income * 1.3)];
    }
    if (t === 'unknown') {
      const u = ctx.unknown;
      const pe = Math.max(0, 1 - u.combat - u.shop - u.treasure);
      const v = u.combat * (P.vCombat - risk('combat', life)) + u.shop * P.vShopBase + u.treasure * P.vTreasure + pe * P.vEvent;
      return [next(v, life - u.combat * LOSS_C[a] * wk - pe * 0.3, gold + u.combat * ctx.income)];
    }
    if (t === 'shop') {
      const v = P.vShopBase + (0.35 * Math.max(0, gold - 90 * ctx.g)) / ctx.unit + (ctx.cursed ? 0.4 : 0);
      return [next(v, life, Math.min(gold, 60 * ctx.g))];
    }
    if (t === 'rest') {
      const heal = Math.ceil(st.maxLife * BAL.restHealPct);
      const out = [next(P.vRest + (ctx.keysRuby ? 8 : 0), life, gold)];
      if (ctx.canHeal && life < st.maxLife) out.push(next(0, Math.min(st.maxLife, life + heal), gold));
      return out;
    }
    if (t === 'treasure') return [next(P.vTreasure, life, gold)];
    if (t === 'boss') return [next(-risk('boss', life), life - LOSS_B[a] * wk, gold)];
    return [next(0.3, life, gold)];
  }
  function pickPath(run, choices) {
    if (choices.length <= 1) return choices[0];
    const floors = run.map.floors;
    const E = makeEval(run);
    const M = RS.collectMods(run);
    const g = gs(run.act);
    const ctx = {
      a: Math.min(4, run.act),
      g,
      wk: strength(run),
      sc: hazScale(run),
      unit: Math.max(1, E.augV),
      deathCost: E.deathCost,
      income: 40 * g,
      unknown: run.unknown || { combat: 0.1, shop: 0.03, treasure: 0.02 },
      cursed: run.curses.some((id) => RS.CURSE[id] && !RS.CURSE[id].permanent),
      canHeal: !M.noRestHeal && run.curses.indexOf('bloomMark') < 0,
      keysEmerald: keysMode && run.keys && !run.keys.emerald,
      keysRuby: keysMode && run.keys && !run.keys.ruby,
    };
    let budget = 6000;
    const endValue = (st) => (P.pathLife * (lifeCore(Math.max(0.1, st.life), st.maxLife, ctx.a) - lifeCore(run.life, run.maxLife, ctx.a))) / ctx.unit;
    const bestFrom = (f, lane, st) => {
      const node = floors[f - 1][lane];
      const opts = nodeOptions(ctx, node, st);
      let bv = -Infinity;
      for (const o of opts) {
        let v = o.v;
        if (node.next && node.next.length && f < floors.length && budget-- > 0) {
          let nb = -Infinity;
          for (const n of node.next) {
            if (!floors[f] || !floors[f][n]) continue;
            const x = bestFrom(f + 1, n, o.st);
            if (x > nb) nb = x;
          }
          v += nb === -Infinity ? endValue(o.st) : nb;
        } else v += endValue(o.st);
        if (v > bv) bv = v;
      }
      return bv;
    };
    const st = { life: run.life, gold: run.gold, maxLife: run.maxLife };
    const vals = choices.map((c) => bestFrom(c.f, c.lane, st));
    const bi = best(choices.map((c, i) => i), (i) => vals[i]);
    dbg(`  [길 ${run.act}막 ${run.floor}층 생명 ${run.life}/${run.maxLife} ${Math.round(run.gold)}g 약함 ${ctx.wk.toFixed(2)} 단위 ${Math.round(ctx.unit)} 죽음 ${Math.round(ctx.deathCost)}] ${choices.map((c, i) => `${floors[c.f - 1][c.lane].type}=${vals[i].toFixed(2)}`).join(' | ')}`);
    return choices[bi];
  }
  // 비교 실험: 판단 일부를 basic 봇에게 맡긴다 (--bp=basicParts='["path","spend"]')
  // path 길 · spend 전투 중 조작 · rest 휴식처 · event 이벤트 · shop 상점 · neow 문지기 · ancient 고대 존재 · aug 증강(점수표, 건너뛰기 없음) · handle 대기열
  if (P.basicParts && P.basicParts.length) {
    const basic = makeBasicBot(RS, 'basic', rng, opts);
    if (basicPart('path')) bot.pickNode = basic.pickNode;
    if (basicPart('spend')) bot.act = basic.act;
    if (basicPart('rest')) bot.rest = basic.rest;
    if (basicPart('event')) bot.eventOption = basic.eventOption;
    if (basicPart('shop')) bot.shop = basic.shop;
    if (basicPart('neow')) bot.neow = basic.neow;
    if (basicPart('ancient')) bot.ancient = basic.ancient;
    if (basicPart('handle')) bot.handle = basic.handle;
  }

  return bot;
}

function makeBot(RS, kind, rng, opts) {
  opts = opts || {};
  if (kind === 'smart') return makeSmartBot(RS, rng, opts);
  return makeBasicBot(RS, kind === 'random' ? 'random' : 'basic', rng, opts);
}

module.exports = { makeBot, fightBattle, AUG_SCORE, ANC_SCORE, SMART_DEFAULTS };
