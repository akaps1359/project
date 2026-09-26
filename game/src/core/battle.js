// 전투 시뮬레이션. 화면과 분리된 순수 로직이라 Node 에서도 돈다(tools/sim.js).
(function (RS) {
  'use strict';

  const F = RS.FIELD;
  const MAX_NUMS = 40;

  function Battle(run, stage, opts) {
    opts = opts || {};
    this.run = run;
    this.stage = stage;
    this.fxOn = !opts.headless;
    this.rng = new RS.Rng(stage.seed);
    this.M = RS.collectMods(run);
    const M = this.M;
    this.kind = stage.type === 'eventFight' ? stage.spec.as || 'elite' : stage.type; // combat / elite / boss
    this.dyn = { dmgPct: 0, aspdPct: 0 };
    this.t = 0;
    this.status = 'running'; // running → ending → won / lost
    this.result = null;
    this.reason = null;
    this.endT = 0;
    this.prep = stage.prep;
    this.waveIdx = 0;
    this.waveT = 0;
    this.nextWaveDelay = -1;
    this.curL = stage.waves[0].L;
    this.spawnQ = [];
    this.spawnT = 0;
    this.enemies = [];
    this.pending = [];
    this.fx = [];
    this.numCount = 0;
    this.cap = RS.BAL.fieldCap + (M.capAdd || 0);
    this.cd = [];
    this.slotStats = [];
    for (let i = 0; i < F.SIZE; i++) {
      this.cd.push([this.rng.next() * 0.4, this.rng.next() * 0.4, this.rng.next() * 0.4]);
      this.slotStats.push(null);
    }
    this.slotStun = new Float32Array(F.SIZE);
    this.riftWarn = [];
    this.bosses = [];
    this.boss = null;
    this.bossTimer = 0;
    this.enraged = false;
    this.buffs = { rage: 0, watch: 0 };
    this.demon = 0; // 악마의 형상 누적
    this.dynT = 0;
    this.statsDirty = true;
    this.nextId = 1;
    this.targets = [];
    this.attackCount = 0; // 펜촉
    this.helixUsed = false;
    this.leakShield = M.leakShield || 0; // 되감기 모래
    this.stars = 0; // 별의 섭정
    this.waveSummons = 0; // 벨벳 초커
    this.echoUsed = false;
    this.costMul = 1; // 뱀의 눈
    this.rollCost();
    const clsDmg = {};
    for (const c of RS.CLASSES) clsDmg[c] = 0;
    this.stats = { kills: 0, dmg: 0, leaks: 0, clsDmg, goldEarned: 0, lifeStart: run.life };

    if (M.battleStartGold) RS.addGold(run, M.battleStartGold * Math.min(3, run.act));
    if (M.battleStartLifeLoss) run.life = Math.max(1, run.life - M.battleStartLifeLoss);
    if (M.pantograph && this.kind === 'boss') RS.heal(run, M.pantograph);
    for (let k = 0; k < (M.startSummons || 0); k++) this.freeSummon(0);
    if (M.startRare) this.freeSummon(1);
    if (M.doubt) {
      for (let k = 0; k < M.doubt; k++) this.slotStun[this.rng.int(F.SIZE)] = 999; // 첫 웨이브가 끝나면 풀린다
    }
  }

  const P = Battle.prototype;

  P.emit = function (ev) {
    if (this.fxOn) this.fx.push(ev);
  };

  // ── 매 프레임 ──
  P.update = function (dt) {
    if (this.status !== 'running') {
      if (this.status === 'ending') {
        this.endT -= dt;
        if (this.endT <= 0) this.status = this.result;
      }
      return;
    }
    this.t += dt;
    this.dynT -= dt;
    if (this.buffs.rage > 0) this.buffs.rage -= dt;
    if (this.buffs.watch > 0) this.buffs.watch -= dt;
    if (this.ghostT > 0) this.ghostT -= dt;
    if (this.dynT <= 0) {
      this.dynT = 0.25;
      this.updateDyn();
    }
    this.updateWaves(dt);
    this.updateSpawns(dt);
    this.updateRift(dt);
    this.updateEnemies(dt);
    if (this.status !== 'running') return;
    this.updateUnits(dt);
    this.flushPending();
    this.reap();
    this.updateBoss(dt);
    this.updateSpecial(dt);
    this.checkEnd();
  };

  // 아기 용 브레스, 허수아비 시험 제한 시간
  P.updateSpecial = function (dt) {
    const M = this.M;
    if (M.dragon && this.enemies.length) {
      this.dragonT = (this.dragonT || 0) + dt;
      if (this.dragonT >= 8) {
        this.dragonT = 0;
        let best = null;
        for (const e of this.enemies) if (!e.dead && !(e.subT > 0) && (!best || e.d > best.d)) best = e;
        if (best) {
          const dmg = RS.levelHp(this.curL) * 2;
          this.damage(best, best.boss ? dmg * 0.35 : dmg, null, true, false);
          this.emit({ k: 'boom', x: best.x, y: best.y, r: 12, tier: 3 });
        }
      }
    }
    const lim = this.stage.spec && this.stage.spec.timeLimit;
    if (lim && this.prep <= 0 && this.status === 'running') {
      this.trialT = (this.trialT || 0) + dt;
      if (this.trialT > lim) {
        this.trialFailed = true;
        for (const e of this.enemies) e.dead = true;
        this.enemies.length = 0;
        this.emit({ k: 'msg', text: '시간 초과! 시험 실패', warn: true });
        this.finish('won');
      }
    }
  };

  P.updateWaves = function (dt) {
    const nW = this.stage.waves.length;
    if (this.prep > 0) {
      this.prep -= dt;
      if (this.prep <= 0) this.startWave(0);
      return;
    }
    if (this.waveIdx >= nW) return;
    this.waveT -= dt;
    const cleared = this.spawnQ.length === 0 && this.enemies.length === 0;
    if (cleared) {
      if (this.nextWaveDelay < 0) {
        this.nextWaveDelay = 1.2;
        const bonus = RS.BAL.earlyBonus[Math.min(3, this.run.act)];
        RS.addGold(this.run, bonus);
        this.stats.goldEarned += bonus;
        this.emit({ k: 'msg', text: `빠른 정리 +${bonus}G` });
      }
      this.nextWaveDelay -= dt;
    }
    if (this.waveT <= 0 || (cleared && this.nextWaveDelay <= 0)) this.startWave(this.waveIdx);
  };

  P.startWave = function (k) {
    const W = this.stage.waves[k];
    const run = this.run;
    const M = this.M;
    this.curL = W.L;
    for (const sp of W.list) this.spawnQ.push(sp);
    if (this.spawnT < 0) this.spawnT = 0;
    // 문지기의 세금: 웨이브 시작 골드 없음
    const wg = run.tax > 0 ? 0 : RS.BAL.waveGold[Math.min(3, run.act)] * (1 + M.waveGoldPct);
    let interest = Math.min(RS.interestCap(M), Math.floor(run.gold / RS.BAL.interestPer));
    if (interest > 0) interest += M.interestBonus;
    RS.addGold(run, wg + interest);
    this.stats.goldEarned += wg + interest;
    this.waveIdx = k + 1;
    this.waveT = RS.BAL.waveTime * (1 - M.waveIntervalPct);
    this.nextWaveDelay = -1;
    this.waveSummons = 0;
    this.echoUsed = false;
    if (k === 1 && M.doubt) {
      for (let i = 0; i < F.SIZE; i++) if (this.slotStun[i] > 100) this.slotStun[i] = 0;
    }
    if (M.pocketWatch) this.buffs.watch = 4;
    if (M.demonForm) {
      this.demon += M.demonForm;
      this.dynT = 0;
    }
    let free = M.waveFreeSummon || 0;
    if (M.happyFlower) {
      const st = (run.relicState.happyFlower = run.relicState.happyFlower || { n: 0 });
      st.n++;
      if (st.n >= 3) {
        st.n = 0;
        free++;
      }
    }
    for (let i = 0; i < free; i++) this.freeSummon(0);
    if (M.sealSummon && run.gold >= M.sealSummon) {
      RS.addGold(run, -M.sealSummon);
      this.freeSummon(0);
    }
    if (M.debt) RS.addGold(run, -M.debt);
    if (M.stars) this.stars = Math.min(5, this.stars + 1);
    this.emit({ k: 'wave', n: k + 1, total: this.stage.waves.length, gold: Math.round(wg), interest });
  };

  P.updateSpawns = function (dt) {
    if (!this.spawnQ.length) {
      this.spawnT = 0;
      return;
    }
    this.spawnT -= dt;
    while (this.spawnQ.length && this.spawnT <= 0) {
      const sp = this.spawnQ.shift();
      const e = this.spawnEnemy(sp.type, sp.L, 0, F.PERIM, sp.hpMul);
      if (sp.one) e.hp = e.maxHp = 1;
      if (sp.burning) e.burning = sp.burning;
      this.spawnT += sp.gap;
    }
  };

  P.spawnEnemy = function (type, L, d, nextLap, hpMul) {
    const def = RS.ENEMY[type];
    const M = this.M;
    const asc = this.run.asc || 0;
    let hp = RS.levelHp(L) * def.hp * (1 + M.enemyHpPct) * (hpMul || 1);
    if (def.boss) hp *= Math.max(0.2, 1 - M.bossHpPct) * (asc >= 8 ? 1.15 : 1);
    else if (def.elite) hp *= Math.max(0.2, 1 + (M.eliteHpPct || 0)) * (asc >= 7 ? 1.15 : 1);
    else if (asc >= 6) hp *= 1.1;
    const e = {
      id: this.nextId++, type, def, L,
      hp, maxHp: hp,
      d, nextLap, laps: 0, x: 0, y: 0, dir: 0,
      speed: def.speed,
      slow: 0, slowT: 0, stunT: 0, hasteP: 0, hasteT: 0,
      burn: 0, burnT: 0, poison: 0, poisonN: 0, poisonT: 0,
      struck: false, flash: 0,
      timer: 0, splitDone: 0, capLeft: def.dpsCap ? hp * def.dpsCap : 0, capT: 0,
      boss: !!def.boss, elite: !!def.elite, dead: false, burning: false,
      phase: this.rng.next() * 6.28,
    };
    RS.pathPos(e.d, e);
    this.enemies.push(e);
    if (e.boss) {
      this.bosses.push(e);
      if (!this.boss) {
        this.boss = e;
        this.bossTimer = RS.BAL.bossTime + M.bossTimeAdd + (def.bossTimeAdd || 0);
      }
      this.emit({ k: 'boss', name: def.name });
    }
    return e;
  };

  // 적이 적을 소환·분열할 때는 반복문이 끝난 뒤에 넣는다
  P.queueSpawn = function (type, L, d, nextLap, hpMul) {
    this.pending.push({ type, L, d, nextLap, hpMul });
  };
  P.flushPending = function () {
    if (!this.pending.length) return;
    for (const p of this.pending) this.spawnEnemy(p.type, p.L, p.d, p.nextLap, p.hpMul);
    this.pending.length = 0;
  };

  P.updateRift = function (dt) {
    for (let i = 0; i < F.SIZE; i++) if (this.slotStun[i] > 0 && this.slotStun[i] < 100) this.slotStun[i] -= dt;
    if (!this.riftWarn.length) return;
    for (const w of this.riftWarn) {
      w.t -= dt;
      if (w.t <= 0) {
        for (const c of w.cells) this.slotStun[c] = Math.max(this.slotStun[c], w.stun);
        this.emit({ k: 'rift', cells: w.cells });
      }
    }
    this.riftWarn = this.riftWarn.filter((w) => w.t > 0);
  };

  P.updateEnemies = function (dt) {
    const M = this.M;
    const globalSpeed = Math.max(0.3, 1 - M.enemySpeedPct);
    const list = this.enemies;
    for (let i = 0, n = list.length; i < n; i++) {
      const e = list[i];
      if (e.dead) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.stunT > 0) e.stunT -= dt;
      if (e.slowT > 0) {
        e.slowT -= dt;
        if (e.slowT <= 0) e.slow = 0;
      }
      if (e.hasteT > 0) {
        e.hasteT -= dt;
        if (e.hasteT <= 0) e.hasteP = 0;
      }
      if (e.capT !== undefined && e.def.dpsCap) {
        e.capT += dt;
        if (e.capT >= 0.5) {
          e.capT -= 0.5;
          e.capLeft = e.maxHp * e.def.dpsCap * 0.5;
        }
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damage(e, e.burn * dt, null, false, true);
        if (e.dead) continue;
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        this.damage(e, e.poison * e.poisonN * dt, null, false, true);
        if (e.poisonT <= 0) e.poisonN = 0;
        if (e.dead) continue;
      }
      if (e.burning === 'regen' && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015 * dt);
      if (M.noxious) {
        this.damage(e, e.maxHp * M.noxious * (e.boss ? 0.34 : 1) * dt, null, false, true);
        if (e.dead) continue;
      }
      const def = e.def;
      if (def.heal || def.haste || def.summon || def.rift || def.hop || def.submerge || def.anchor) this.enemySkill(e, def, dt);
      if (e.subT > 0) e.subT -= dt;
      if (e.stunT > 0) continue;
      let sp = e.speed * globalSpeed * (1 - e.slow) * (1 + e.hasteP);
      if (e.burning === 'fast') sp *= 1.3;
      if (e.boss && this.enraged) sp *= 1.8;
      if (def.rage && e.hp < e.maxHp * def.rage) sp *= 1.5;
      e.d += sp * dt;
      if (e.d >= e.nextLap) {
        e.nextLap += F.PERIM;
        e.laps++;
        this.leak(e);
        if (this.status !== 'running') return;
      }
      RS.pathPos(e.d, e);
    }
  };

  P.enemySkill = function (e, def, dt) {
    e.timer += dt;
    // 개구리: 가끔 앞으로 크게 뛴다
    if (def.hop) {
      if (e.hopT === undefined) e.hopT = this.rng.next() * def.hop.every;
      e.hopT += dt;
      if (e.hopT >= def.hop.every && e.stunT <= 0) {
        e.hopT = 0;
        e.d += def.hop.dist;
      }
    }
    // 늪의 여왕: 물속에 잠기면 공격받지 않는다
    if (def.submerge) {
      e.subTimer = (e.subTimer || 0) + dt;
      if (e.subTimer >= def.submerge.every) {
        e.subTimer = 0;
        e.subT = def.submerge.dur;
        this.emit({ k: 'msg', text: `${def.name}이(가) 물속으로 숨었다!` });
      }
    }
    // 해골 선장: 닻을 던져 한 열을 기절
    if (def.anchor) {
      e.anchorT = (e.anchorT || 0) + dt;
      if (e.anchorT >= def.anchor.every) {
        e.anchorT = 0;
        const c = this.rng.int(F.COLS);
        const cells = [];
        for (let r = 0; r < F.ROWS; r++) cells.push(r * F.COLS + c);
        this.riftWarn.push({ cells, t: def.anchor.warn, total: def.anchor.warn, stun: def.anchor.stun });
      }
    }
    if (def.heal && e.timer >= def.heal.every) {
      e.timer = 0;
      const r2 = def.heal.r * def.heal.r;
      for (const o of this.enemies) {
        if (o.dead) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        if (dx * dx + dy * dy <= r2) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.heal.pct);
      }
      this.emit({ k: 'heal', x: e.x, y: e.y, r: def.heal.r });
    } else if (def.haste && e.timer >= def.haste.every) {
      e.timer = 0;
      const r2 = def.haste.r * def.haste.r;
      for (const o of this.enemies) {
        if (o.dead) continue;
        const dx = o.x - e.x;
        const dy = o.y - e.y;
        if (dx * dx + dy * dy <= r2) {
          o.hasteP = def.haste.pct;
          o.hasteT = def.haste.dur;
        }
      }
      this.emit({ k: 'haste', x: e.x, y: e.y, r: def.haste.r });
    } else if (def.summon && e.timer >= def.summon.every) {
      e.timer = 0;
      for (let k = 0; k < def.summon.n; k++) {
        this.queueSpawn(def.summon.type, e.L, e.d - 7 * (k + 1), e.nextLap, def.summon.hp);
      }
      this.emit({ k: 'summonFx', x: e.x, y: e.y });
    } else if (def.rift && e.timer >= def.rift.every) {
      e.timer = 0;
      const c0 = this.rng.int(F.COLS - 1);
      const r0 = this.rng.int(F.ROWS - 1);
      const cells = [r0 * F.COLS + c0, r0 * F.COLS + c0 + 1, (r0 + 1) * F.COLS + c0, (r0 + 1) * F.COLS + c0 + 1];
      this.riftWarn.push({ cells, t: def.rift.warn, total: def.rift.warn, stun: def.rift.stun });
    }
  };

  P.leak = function (e) {
    const M = this.M;
    const run = this.run;
    const nW = this.stage.waves.length;
    let dmg = (e.def.leak + M.leakAdd) * M.leakMult;
    if ((e.elite || e.boss) && run.asc >= 5) dmg += 1;
    if (e.boss && this.enraged) dmg *= 2;
    if (M.lastWaveLeakMult && this.waveIdx >= nW) dmg *= 2;
    if (M.leakReduce) dmg = Math.max(1, dmg - M.leakReduce);
    let blocked = false;
    if (this.ghostT > 0) blocked = true;
    else if (M.firstWaveNoLeak && this.waveIdx <= 1) blocked = true;
    else if (M.helix && !this.helixUsed) {
      this.helixUsed = true;
      blocked = true;
    } else if (this.leakShield > 0) {
      this.leakShield--;
      blocked = true;
    }
    if (!blocked) {
      run.life -= dmg;
      this.stats.leaks += dmg;
    }
    this.emit({ k: 'leak', x: e.x, y: e.y, v: blocked ? 0 : dmg });
    if (M.thorns) this.damage(e, e.maxHp * M.thorns, null, false, true);
    if (M.powderKeg) {
      const kd = RS.levelHp(this.curL) * 0.3;
      for (const o of this.enemies) if (!o.dead) this.damage(o, kd, null, false, true);
      this.emit({ k: 'keg', x: F.L, y: F.T });
    }
    if (run.life <= 0) {
      run.life = 0;
      this.finish('lost', 'life');
    }
  };

  // ── 유닛 ──
  P.updateDyn = function () {
    const M = this.M;
    const run = this.run;
    let dmg = this.demon + (run.permDmg || 0);
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
      if (M.diversity && k === 5) dmg += M.diversity;
      if (M.purity && k > 0 && k <= 3) dmg += M.purity;
      if (M.eliteSquad && cnt > 0 && cnt <= 12) dmg += M.eliteSquad;
      if (M.legendAura) dmg += M.legendAura * legends;
    }
    if (M.rich && run.gold >= 100) dmg += M.rich;
    if (M.berserk && run.life <= run.maxLife / 2) {
      dmg += 0.6;
      aspd += 0.25;
    }
    const rst = run.relicState;
    if (rst.pumpkinCandle && rst.pumpkinCandle.charges > 0) dmg += 0.4;
    if (rst.waxToys) aspd += Math.max(0, 0.3 - 0.1 * Math.floor(rst.waxToys.fights / 3));
    if (this.kind === 'elite') dmg += (M.eliteBattleDmg || 0) + (M.bigBattleDmg || 0);
    if (this.kind === 'boss') dmg += M.bigBattleDmg || 0;
    if (this.buffs.rage > 0) aspd += 0.6;
    if (this.buffs.watch > 0) aspd += 0.6;
    if (dmg !== this.dyn.dmgPct || aspd !== this.dyn.aspdPct) {
      this.dyn.dmgPct = dmg;
      this.dyn.aspdPct = aspd;
      this.statsDirty = true;
    }
  };

  P.computeSlotStats = function () {
    this.statsDirty = false;
    const run = this.run;
    const M = this.M;
    for (let i = 0; i < F.SIZE; i++) {
      const s = run.board[i];
      if (!s) {
        this.slotStats[i] = null;
        continue;
      }
      this.slotStats[i] = RS.unitStats(run, M, this.dyn, s.cls, s.tier, i, this.slotStats[i] || {});
    }
  };

  RS.unitStats = function (run, M, dyn, cls, tier, i, st) {
    st = st || {};
    const C = RS.CLASS[cls];
    const T = RS.TIER[tier];
    const cm = M.cls[cls];
    const corner = i >= 0 && RS.isCorner(i);
    const inner = i >= 0 && RS.isInner(i);
    const rune = i >= 0 && run.runes && run.runes[i] ? RS.RUNE[run.runes[i]].mods : null;
    const pct = M.dmgPct + cm.dmg + (dyn ? dyn.dmgPct : 0) + M.tierDmg[tier] + (corner ? M.cornerDmg : 0) + (inner ? M.innerDmg : 0) + (rune && rune.dmg ? rune.dmg : 0);
    const lv = 1 + run.classLv[cls] * RS.BAL.upgradePct;
    const aspd = Math.max(0.2, 1 + M.aspdPct + cm.aspd + (dyn ? dyn.aspdPct : 0) + (rune && rune.aspd ? rune.aspd : 0));
    st.dmg = C.dmg * T.dmg * lv * Math.max(0.1, 1 + pct);
    st.interval = (C.interval * T.spd) / aspd;
    st.range = C.range + 3 * tier + M.rangeAdd + cm.range + (inner ? M.innerRange : 0) + (rune && rune.range ? rune.range : 0);
    st.crit = (C.crit ? C.crit[tier] : 0) + M.critChance + cm.crit + (rune && rune.crit ? rune.crit : 0);
    st.critMult = (C.critMult ? C.critMult[tier] : 2) + M.critMult;
    st.splash = C.splash ? C.splash[tier] + cm.splash : 0;
    st.slow = C.slow ? Math.min(0.8, C.slow[tier] + cm.slow) : 0;
    st.runeSlow = rune && rune.slow ? rune.slow : 0;
    st.runeGold = rune && rune.killGold ? rune.killGold : 0;
    st.runeEcho = rune && rune.echo ? rune.echo : 0;
    st.frostSplash = C.frostSplash && C.frostSplash[tier] ? C.frostSplash[tier] + cm.splash : 0;
    st.freeze = C.freeze ? C.freeze[tier] : 0;
    st.stun = C.stun ? C.stun[tier] : 0;
    st.shots = C.shots ? C.shots[tier] : 1;
    st.dps = (st.dmg / st.interval) * (1 + Math.min(1, st.crit) * (st.critMult - 1)) * st.shots;
    return st;
  };

  P.updateUnits = function (dt) {
    if (this.statsDirty) this.computeSlotStats();
    const board = this.run.board;
    for (let i = 0; i < F.SIZE; i++) {
      const s = board[i];
      if (!s) continue;
      if (this.slotStun[i] > 0) continue;
      const st = this.slotStats[i];
      const cds = this.cd[i];
      for (let u = 0; u < s.n; u++) {
        cds[u] -= dt;
        if (cds[u] > 0) continue;
        if (this.attack(i, s, st, u)) cds[u] = st.interval + Math.max(cds[u], -dt);
        else cds[u] = 0.1;
      }
    }
  };

  P.findTargets = function (x, y, range, n) {
    const out = this.targets;
    out.length = 0;
    const r2 = range * range;
    const list = this.enemies;
    for (let k = 0, len = list.length; k < len; k++) {
      const e = list[k];
      if (e.dead || e.subT > 0) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy > r2) continue;
      // 가장 멀리 간 적(누수 직전)부터
      let j = out.length;
      if (j < n) out.push(e);
      else if (e.d <= out[n - 1].d) continue;
      else j = n - 1;
      while (j > 0 && out[j - 1].d < e.d) {
        out[j] = out[j - 1];
        j--;
      }
      out[j] = e;
    }
    return out;
  };

  P.attack = function (i, s, st, u) {
    const c = RS.slotCenter(i);
    const targets = this.findTargets(c.x, c.y, st.range, st.shots);
    if (!targets.length) return false;
    let mul = 1;
    if (this.M.penNib && ++this.attackCount % 10 === 0) mul = 2;
    for (let k = 0; k < targets.length; k++) this.hitWith(i, s, st, targets[k], c, u, mul);
    // 메아리 룬: 확률로 한 번 더
    if (st.runeEcho && targets[0] && !targets[0].dead && this.rng.next() < st.runeEcho) this.hitWith(i, s, st, targets[0], c, u, 1);
    return true;
  };

  P.hitWith = function (i, s, st, e, c, u, mul) {
    const M = this.M;
    const rng = this.rng;
    const cls = s.cls;
    const C = RS.CLASS[cls];
    let dmg = st.dmg * (mul || 1);
    let crit = mul > 1;
    if (st.crit > 0 && rng.next() < st.crit) {
      dmg *= st.critMult;
      crit = true;
    }
    const ex = e.x;
    const ey = e.y;
    this.lastSlot = i;
    switch (cls) {
      case 'knight':
        this.damage(e, dmg, cls, crit);
        this.splash(ex, ey, C.cleaveR + M.cls.knight.splash, dmg * C.cleave, cls, e, false);
        if (st.stun && !e.boss && rng.next() < st.stun) e.stunT = Math.max(e.stunT, C.stunDur);
        break;
      case 'mage':
        this.splash(ex, ey, st.splash, dmg, cls, null, crit);
        this.emit({ k: 'boom', x: ex, y: ey, r: st.splash, tier: s.tier });
        break;
      case 'frost':
        this.damage(e, dmg, cls, crit);
        this.applySlow(e, st.slow, C.slowDur);
        if (st.frostSplash) {
          const r2 = st.frostSplash * st.frostSplash;
          for (const o of this.enemies) {
            if (o.dead || o === e) continue;
            const dx = o.x - ex;
            const dy = o.y - ey;
            if (dx * dx + dy * dy <= r2) {
              this.damage(o, dmg * 0.5, cls, false);
              this.applySlow(o, st.slow, C.slowDur);
            }
          }
        }
        if (st.freeze && !e.boss && rng.next() < st.freeze) e.stunT = Math.max(e.stunT, 0.6);
        break;
      case 'rogue':
        this.damage(e, dmg, cls, crit);
        if (M.poison && !e.dead) {
          e.poison = Math.max(e.poison, (dmg * M.poison) / 3);
          e.poisonN = Math.min(5, e.poisonN + 1);
          e.poisonT = 3;
        }
        break;
      default:
        this.damage(e, dmg, cls, crit);
    }
    if (st.runeSlow && !e.dead) this.applySlow(e, st.runeSlow, 1);
    if (M.shrapnel && cls !== 'mage' && cls !== 'frost') this.splash(ex, ey, 8, dmg * M.shrapnel, cls, e, false);
    if (M.freezeChance && !e.boss && rng.next() < M.freezeChance) e.stunT = Math.max(e.stunT, 0.8);
    this.lastSlot = -1;
    if (this.fxOn) this.fx.push({ k: 'shot', cls, tier: s.tier, slot: i, u, x1: c.x, y1: c.y, x2: ex, y2: ey, crit });
  };

  P.applySlow = function (e, pct, dur) {
    if (e.boss) pct *= 0.5;
    if (pct >= e.slow) {
      e.slow = pct;
      e.slowT = dur;
    } else if (pct > 0 && e.slowT < dur * 0.5) {
      e.slowT = dur * 0.5;
    }
  };

  P.splash = function (x, y, r, dmg, cls, exclude, crit) {
    const r2 = r * r;
    const list = this.enemies;
    const burn = cls === 'mage' ? this.M.burn : 0;
    for (let k = 0, len = list.length; k < len; k++) {
      const e = list[k];
      if (e.dead || e === exclude || e.subT > 0) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      if (dx * dx + dy * dy > r2) continue;
      this.damage(e, dmg, cls, crit);
      if (burn && !e.dead) {
        const b = dmg * burn;
        if (b > e.burn || e.burnT <= 0) e.burn = b;
        e.burnT = 3;
      }
    }
  };

  P.damage = function (e, amount, cls, crit, isDot) {
    if (e.dead) return 0;
    let dm = amount;
    const def = e.def;
    const M = this.M;
    if (cls) {
      const t = RS.CLASS[cls].dmgType;
      if (def.armorLight && t === 'light') dm *= def.armorLight;
      if (def.physRes && t !== 'magic') dm *= 1 - def.physRes;
      if (!isDot && !e.struck) {
        e.struck = true;
        if (M.firstStrike) dm *= 1 + M.firstStrike;
      }
    }
    if ((e.elite || e.boss) && M.eliteDmgPct) dm *= 1 + M.eliteDmgPct;
    if (e.burning === 'armor') dm *= 0.75;
    // 균열의 심장: 0.5초마다 받을 수 있는 피해에 한도가 있다
    if (def.dpsCap) {
      dm = Math.min(dm, e.capLeft);
      e.capLeft -= dm;
    }
    const dealt = Math.min(dm, e.hp);
    e.hp -= dm;
    this.stats.dmg += dealt;
    if (cls) this.stats.clsDmg[cls] += dealt;
    if (!isDot) e.flash = 0.08;
    if (this.fxOn && !isDot && this.numCount < MAX_NUMS && dm > 0) {
      this.numCount++;
      this.fx.push({ k: 'num', x: e.x, y: e.y - 5, v: dm, crit });
    }
    if (def.splitAt && e.hp > 0) {
      for (let k = e.splitDone; k < def.splitAt.length; k++) {
        if (e.hp > e.maxHp * def.splitAt[k]) break;
        e.splitDone = k + 1;
        for (let j = 0; j < def.splitN; j++) this.queueSpawn('slime', e.L, e.d - 5 * (j + 1), e.nextLap, def.splitHp);
        this.emit({ k: 'summonFx', x: e.x, y: e.y });
      }
    }
    if (e.hp <= 0) {
      e.dead = true;
      if (this.lastSlot >= 0 && this.slotStats[this.lastSlot] && this.slotStats[this.lastSlot].runeGold) e.runeGold = this.slotStats[this.lastSlot].runeGold;
    }
    return dealt;
  };

  // 죽은 적 정리 + 보상
  P.reap = function () {
    const list = this.enemies;
    let w = 0;
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      if (e.dead) this.onKill(e);
      else list[w++] = e;
    }
    list.length = w;
    this.flushPending();
  };

  P.onKill = function (e) {
    const def = e.def;
    const run = this.run;
    const M = this.M;
    let g = M.noKillGold ? 0 : def.gold * RS.BAL.killGoldMul[Math.min(3, run.act)] * (1 + M.killGoldPct);
    if (e.runeGold) g += e.runeGold;
    RS.addGold(run, g);
    this.stats.goldEarned += g;
    this.stats.kills++;
    if (M.souls) {
      run.souls = (run.souls || 0) + 1;
      if (run.souls >= M.souls) {
        run.souls = 0;
        const tier = M.soulTier || 0;
        if (this.freeSummon(tier) >= 0) this.emit({ k: 'msg', text: `영혼이 모여 ${RS.TIER[tier].name} 유닛이 일어났다!` });
      }
    }
    if (e.elite || e.boss) {
      if (M.eliteKillHeal) RS.heal(run, M.eliteKillHeal);
      if (M.eliteKillMaxLife) {
        RS.changeMaxLife(run, M.eliteKillMaxLife);
        RS.heal(run, M.eliteKillMaxLife);
      }
    }
    if (def.split) {
      for (let j = 0; j < def.split.n; j++) this.queueSpawn(def.split.type, e.L, e.d - 4 * j, e.nextLap, def.split.hp);
    }
    if (e.boss) {
      const alive = this.bosses.filter((b) => !b.dead);
      this.boss = alive[0] || null;
      if (!this.boss) this.riftWarn.length = 0;
      this.emit({ k: 'bossDown' });
    }
    this.emit({ k: 'kill', x: e.x, y: e.y, type: e.type, gold: g, big: e.boss || e.elite });
  };

  P.updateBoss = function (dt) {
    if (!this.boss || this.enraged) return;
    this.bossTimer -= dt;
    if (this.bossTimer <= 0) {
      this.bossTimer = 0;
      this.enraged = true;
      this.emit({ k: 'msg', text: '보스 폭주! 속도·피해 증가', warn: true });
    }
  };

  P.checkEnd = function () {
    if (this.status !== 'running') return;
    if (this.enemies.length >= this.cap) {
      this.finish('lost', 'cap');
      return;
    }
    if (this.prep <= 0 && this.waveIdx >= this.stage.waves.length && !this.spawnQ.length && !this.enemies.length && !this.pending.length) {
      this.finish('won');
    }
  };

  P.finish = function (result, reason) {
    if (this.status !== 'running') return;
    this.result = result;
    this.reason = reason || null;
    this.status = this.fxOn ? 'ending' : result;
    this.endT = 1.4;
    this.emit({ k: result === 'won' ? 'won' : 'lost', reason });
  };

  // ── 플레이어 조작 ──
  P.rollCost = function () {
    this.costMul = this.M.snakeEye ? 0.5 + this.rng.next() * 1.5 : 1;
  };
  P.summonCost = function () {
    return Math.max(1, Math.round(RS.summonCost(this.run, this.M) * this.costMul));
  };
  P.summonLimit = function () {
    return this.M.summonCap ? Math.max(0, this.M.summonCap - this.waveSummons) : Infinity;
  };

  // 비용·횟수 없이 소환 (유물·증강 효과)
  P.freeSummon = function (tier) {
    const run = this.run;
    const cls = RS.pickClass(run, this.rng);
    const slot = RS.addUnit(run.board, cls, tier);
    if (slot < 0) return -1;
    this.resetCd(slot);
    this.statsDirty = true;
    this.emit({ k: 'summon', slot, cls, tier, free: true });
    return slot;
  };

  P.summon = function () {
    const run = this.run;
    const M = this.M;
    const cost = this.summonCost();
    if (M.prepLocked && this.prep > 0) return { err: 'locked' };
    if (this.summonLimit() <= 0) return { err: 'cap' };
    if (run.gold < cost) return { err: 'gold' };
    const cls = RS.pickClass(run, this.rng);
    const tier = RS.rollSummonTier(this.rng, M);
    const slot = RS.addUnit(run.board, cls, tier);
    if (slot < 0) return { err: 'full' };
    RS.addGold(run, -cost);
    run.summons++;
    run.stats.summons++;
    this.waveSummons++;
    this.rollCost();
    this.resetCd(slot);
    const res = { slot, cls, tier, cost };
    if (M.cloverChance && this.rng.chance(M.cloverChance)) {
      RS.addGold(run, cost);
      res.clover = true;
    }
    const echo = M.echoForm && !this.echoUsed;
    if (echo) this.echoUsed = true;
    if (echo || (M.twinChance && this.rng.chance(M.twinChance))) {
      const s2 = RS.addUnit(run.board, cls, tier);
      if (s2 >= 0) {
        res.twin = s2;
        this.resetCd(s2);
      }
    }
    this.statsDirty = true;
    this.emit({ k: 'summon', slot, cls, tier, twin: res.twin, clover: res.clover });
    return res;
  };

  P.resetCd = function (slot) {
    const cds = this.cd[slot];
    for (let u = 0; u < 3; u++) if (cds[u] < 0.05) cds[u] = 0.05 + this.rng.next() * 0.3;
  };

  P.mergeOptions = function () {
    return RS.mergeOptions(this.rng, this.run);
  };

  P.merge = function (i, pickCls) {
    const res = RS.mergeSlot(this.run, i, this.rng, this.M, pickCls);
    if (!res) return null;
    for (const r of res.results) this.resetCd(r.slot);
    this.statsDirty = true;
    this.emit({ k: 'merge', slot: i, res });
    return res;
  };

  P.sell = function (i) {
    const v = RS.sellOne(this.run, i, this.M);
    if (v) {
      this.statsDirty = true;
      this.emit({ k: 'sell', slot: i, v });
    }
    return v;
  };

  P.swap = function (a, b) {
    if (a === b) return;
    RS.swapSlots(this.run.board, a, b);
    const t = this.cd[a];
    this.cd[a] = this.cd[b];
    this.cd[b] = t;
    this.statsDirty = true;
  };

  P.arrange = function () {
    RS.autoArrange(this.run.board, this.run.runes);
    for (let i = 0; i < F.SIZE; i++) this.resetCd(i);
    this.statsDirty = true;
  };

  P.upgradeCost = function (cls) {
    return this.M.upgradeFree ? 0 : RS.upgradeCost(this.run, cls, this.M);
  };

  P.upgrade = function (cls) {
    const run = this.run;
    const cost = this.upgradeCost(cls);
    if (this.M.prepLocked && this.prep > 0) return { err: 'locked' };
    if (run.gold < cost) return { err: 'gold' };
    RS.addGold(run, -cost);
    run.classLv[cls] += this.M.upgradeDouble ? 2 : 1;
    run.stats.upgrades++;
    this.statsDirty = true;
    this.emit({ k: 'upgrade', cls });
    return { cls, lv: run.classLv[cls] };
  };

  P.useItem = function (idx) {
    const run = this.run;
    const id = run.items[idx];
    if (!id) return { err: 'none' };
    const pot = this.M.itemPotency ? 2 : 1;
    switch (id) {
      case 'bomb': {
        const dmg = RS.levelHp(this.curL) * 1.6 * pot;
        for (const e of this.enemies) if (!e.dead) this.damage(e, e.boss ? dmg * 0.25 : dmg, null, false, true);
        this.reap();
        this.emit({ k: 'bomb' });
        break;
      }
      case 'freeze':
        for (const e of this.enemies) e.stunT = Math.max(e.stunT, (e.boss ? 1.5 : 4) * pot);
        this.emit({ k: 'freezeAll' });
        break;
      case 'goldScroll':
        RS.addGold(run, 50 * Math.min(3, run.act) * pot);
        break;
      case 'summonScroll': {
        let ok = false;
        for (let k = 0; k < pot; k++) {
          const cls = RS.pickClass(run, this.rng);
          const slot = RS.addUnit(run.board, cls, 1);
          if (slot < 0) break;
          ok = true;
          this.resetCd(slot);
          this.emit({ k: 'summon', slot, cls, tier: 1 });
        }
        if (!ok) return { err: 'full' };
        this.statsDirty = true;
        break;
      }
      case 'anvilScroll': {
        const c = RS.mostCommonClass(run);
        run.classLv[c] += 2 * pot;
        this.statsDirty = true;
        this.emit({ k: 'upgrade', cls: c });
        break;
      }
      case 'potion':
        RS.heal(run, 6 * pot);
        break;
      case 'rage':
        this.buffs.rage = 10 * pot;
        this.dynT = 0;
        break;
      case 'ghostly':
        this.ghostT = 8 * pot;
        break;
    }
    run.items.splice(idx, 1);
    this.emit({ k: 'item', id });
    return { id };
  };

  // 별의 섭정: 별 3개로 별똥별 (모든 적에게 큰 피해)
  P.canStarfall = function () {
    return !!this.M.stars && this.stars >= 3;
  };
  P.starfall = function () {
    if (!this.canStarfall()) return false;
    this.stars -= 3;
    const dmg = RS.levelHp(this.curL) * 1.5;
    for (const e of this.enemies) if (!e.dead) this.damage(e, e.boss ? dmg * 0.35 : dmg, null, false, true);
    this.reap();
    this.emit({ k: 'bomb' });
    return true;
  };

  // 화면 표시용 요약
  P.totalDps = function () {
    if (this.statsDirty) this.computeSlotStats();
    let dps = 0;
    for (let i = 0; i < F.SIZE; i++) {
      const s = this.run.board[i];
      if (s) dps += this.slotStats[i].dps * s.n;
    }
    return dps;
  };

  RS.Battle = Battle;
})((globalThis.RS = globalThis.RS || {}));
