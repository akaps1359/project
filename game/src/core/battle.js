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
    // 상처는 전투를 시작할 때의 값으로 고정한다 (이번 전투에 맞은 강타는 다음 전투부터)
    this.dyn = { dmgPct: 0, aspdPct: 0, injMul: RS.injuryMul ? RS.injuryMul(run) : 1 };
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
    this.mcd = []; // 신화 스킬 대기 시간 (칸마다, 유닛마다)
    // 지난 전투에서 남은 봉인 표시는 지운다 (봉인은 전투 안에서만)
    for (const u of this.run.board) if (u && u.sealed) delete u.sealed;
    this.sealT = 0;
    this.slotStats = [];
    for (let i = 0; i < F.SIZE; i++) {
      // 한 칸에 최대 4기(전설)까지 쌓이므로 공격 대기 시간도 4칸
      this.cd.push([this.rng.next() * 0.4, this.rng.next() * 0.4, this.rng.next() * 0.4, this.rng.next() * 0.4]);
      this.slotStats.push(null);
    }
    this.slotStun = new Float32Array(F.SIZE);
    // 보스 기술로 느려진 칸 (남은 시간, 공격 속도 감소 비율, 종류: glue 점액 / pulse 고동)
    this.slotSlowT = new Float32Array(F.SIZE);
    this.slotSlowAmt = new Float32Array(F.SIZE);
    this.slotSlowKind = new Array(F.SIZE).fill(null);
    this.riftWarn = [];
    this.bosses = [];
    this.boss = null;
    this.bossTimer = 0;
    this.enraged = false;
    this.buffs = { rage: 0, watch: 0, surge: 0 };
    this.demon = 0; // 악마의 형상 누적
    this.itemUses = 0; // 이번 전투에서 쓴 소모품 수 (약사의 반지)
    this.critHasteT = new Array(F.SIZE).fill(0); // 피의 흥분: 치명타를 낸 칸이 잠깐 빨라진다
    this.dynT = 0;
    this.statsDirty = true;
    this.nextId = 1;
    this.targets = [];
    this.attackCount = 0; // 펜촉
    this.helixUsed = false;
    this.leakShield = M.leakShield || 0; // 되감기 모래
    // 벨벳 초커·메아리 형상: 준비 시간은 첫 웨이브와 같은 웨이브로 친다
    this.waveSummons = 0;
    this.echoLeft = M.echoForm || 0; // 메아리 형상: 전투마다 남은 메아리 수
    this.costMul = 1; // 뱀의 눈
    this.rollCost();
    const clsDmg = {};
    for (const c of RS.CLASSES) clsDmg[c] = 0;
    this.stats = { kills: 0, dmg: 0, leaks: 0, struck: 0, escaped: 0, staggers: 0, pressure: 0, clsDmg, goldEarned: 0, lifeStart: run.life, abil: 0 };
    // 지휘관 고유 능력 (자원·대기 시간)
    this.initAbility();
    this.pressure = 0; // 균열 게이지 (0~1)
    this.pressureW = 0;
    RS.migrateBoard(run, M); // 이전 버전 저장의 유닛에 들인 골드(v)를 매긴다

    if (M.battleStartGold) RS.addGold(run, M.battleStartGold * Math.min(3, run.act));
    if (M.battleStartLifeLoss) run.life = Math.max(1, run.life - M.battleStartLifeLoss);
    if (M.pantograph && this.kind === 'boss') RS.heal(run, M.pantograph);
    if (M.startRare && (M.startRare >= 1 || this.rng.chance(M.startRare))) this.freeSummon(1);
    if (M.doubt) {
      for (let k = 0; k < M.doubt; k++) this.slotStun[this.rng.int(F.SIZE)] = 999; // 첫 웨이브가 끝나면 풀린다
    }
  }

  const P = Battle.prototype;
  const PRESSURE_FROM = 0.25; // 한 바퀴의 이 지점(오른쪽 길)부터 균열 게이지를 채운다
  RS.FOCUS_SLOW = 0.4; // 강타 준비 중 시간 배속

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
    // 봉인은 장막을 깨면 풀리지만, 너무 오래가면(30초) 저절로 풀린다
    if (this.sealT > 0) {
      this.sealT -= dt;
      if (this.sealT <= 0) this.unsealAll('time');
    }
    if (this.buffs.rage > 0) this.buffs.rage -= dt;
    if (this.buffs.watch > 0) this.buffs.watch -= dt;
    if (this.buffs.surge > 0) this.buffs.surge -= dt;
    if (this.ab && this.ab.cd > 0) this.ab.cd -= dt;
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
    this.updatePressure(dt);
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
        for (const e of this.enemies) if (!e.dead && !(e.subT > 0) && (!best || e.d - e.nextLap > best.d - best.nextLap)) best = e;
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
    // 혼령 빙의: 적마다 어느 웨이브에서 나왔는지 기억한다 (스테이지 데이터는 건드리지 않게 복사)
    for (const sp of W.list) this.spawnQ.push(Object.assign({ wave: k + 1 }, sp));
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
    // 준비 시간과 첫 웨이브는 소환 제한·메아리를 함께 쓴다
    if (k > 0) this.waveSummons = 0;
    if (k === 1 && M.doubt) {
      for (let i = 0; i < F.SIZE; i++) if (this.slotStun[i] > 100) this.slotStun[i] = 0;
    }
    if (M.pocketWatch) this.buffs.watch = 4;
    if (M.demonForm) {
      this.demon += M.demonForm;
      this.dynT = 0;
    }
    const wf = M.waveFreeSummon || 0;
    let free = Math.floor(wf) + (wf % 1 > 0 && this.rng.chance(wf % 1) ? 1 : 0);
    for (let i = 0; i < free; i++) this.freeSummon(0);
    // 황금 인장: 소환이 된 때만 골드를 낸다
    if (M.sealSummon && run.gold >= M.sealSummon && this.freeSummon(0, M.sealSummon, true) >= 0) RS.addGold(run, -M.sealSummon);
    if (M.debt) RS.addGold(run, -M.debt);
    this.abilityOnWave();
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
      e.wave = sp.wave;
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
    if (def.boss) hp *= Math.max(0.2, 1 - M.bossHpPct) * (asc >= 7 ? 1.1 : 1);
    else if (def.elite) hp *= Math.max(0.2, 1 + (M.eliteHpPct || 0)) * (asc >= 1 ? 1.15 : 1);
    else if (asc >= 3) hp *= 1.1;
    // 일반 적: 놓쳐도 한 번만 아프므로(빠져나감) 아슬아슬한 세기로 맞춘다 (막마다)
    if (!def.boss && !def.elite) hp *= RS.BAL.normalHpMul[Math.min(4, this.run.act)] || 1;
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
  // wave: 부모가 나온 웨이브 (분열·소환된 적도 같은 웨이브로 친다)
  P.queueSpawn = function (type, L, d, nextLap, hpMul, wave) {
    this.pending.push({ type, L, d, nextLap, hpMul, wave });
  };
  P.flushPending = function () {
    if (!this.pending.length) return;
    for (const p of this.pending) this.spawnEnemy(p.type, p.L, p.d, p.nextLap, p.hpMul).wave = p.wave;
    this.pending.length = 0;
  };

  P.updateRift = function (dt) {
    for (let i = 0; i < F.SIZE; i++) {
      if (this.slotStun[i] > 0 && this.slotStun[i] < 100) this.slotStun[i] -= dt;
      if (this.slotSlowT[i] > 0) {
        this.slotSlowT[i] -= dt;
        if (this.slotSlowT[i] <= 0) {
          this.slotSlowAmt[i] = 0;
          this.slotSlowKind[i] = null;
        }
      }
    }
    if (!this.riftWarn.length) return;
    for (const w of this.riftWarn) {
      w.t -= dt;
      if (w.t <= 0) {
        if (w.slow) {
          // 느려지는 칸: 기절 대신 공격 속도가 떨어진다
          for (const c of w.cells) {
            this.slotSlowT[c] = Math.max(this.slotSlowT[c], w.dur);
            this.slotSlowAmt[c] = Math.max(this.slotSlowAmt[c], w.slow);
            this.slotSlowKind[c] = w.kind;
          }
          this.emit({ k: 'slowCells', cells: w.cells, kind: w.kind });
        } else {
          for (const c of w.cells) this.slotStun[c] = Math.max(this.slotStun[c], w.stun);
          this.emit({ k: 'rift', cells: w.cells });
        }
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
      // 도발: 받는 피해 증가
      if (e.vulnT > 0) {
        e.vulnT -= dt;
        if (e.vulnT <= 0) e.vuln = 0;
      }
      if (e.capT !== undefined && e.def.dpsCap) {
        e.capT += dt;
        if (e.capT >= 0.5) {
          e.capT -= 0.5;
          e.capLeft = e.maxHp * e.def.dpsCap * 0.5 * (e.dozeT > 0 ? e.dozeCap || 1 : 1);
          e.capped = false;
        }
      }
      if (e.burnT > 0) {
        e.burnT -= dt;
        this.damage(e, e.burn * (1 + M.dotAmp) * dt, null, false, true);
        if (e.dead) continue;
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        this.damage(e, e.poison * e.poisonN * (1 + M.dotAmp) * dt, null, false, true);
        if (e.poisonT <= 0) {
          e.poisonN = 0;
          e.poison = 0;
        }
        if (e.dead) continue;
      }
      if (e.burning === 'regen' && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.015 * dt);
      if (M.noxious) {
        this.damage(e, e.maxHp * M.noxious * (e.boss ? 0.34 : 1) * (1 + M.dotAmp) * dt, null, false, true);
        if (e.dead) continue;
      }
      const def = e.def;
      // 강타 준비 중에 기절·빙결되면 끊긴다
      if (e.stunT > 0 && e.cast && e.cast.s.k === 'strike') this.staggerStrike(e, 'stun');
      // 기절·빙결 중에는 기술 타이머도 멈춘다
      if (e.stunT <= 0 && (def.heal || def.haste || def.summon || def.rift || def.hop || def.submerge || def.anchor || def.skills)) this.enemySkill(e, def, dt);
      if (def.phase2 && !e.p2 && e.hp < e.maxHp * def.phase2.at) this.bossPhase2(e, def);
      // 보드를 가로지르는 중(또는 준비 중)이면 길을 따라 걷지 않는다
      if (e.crossWarn || e.cross) {
        this.updateCross(e, dt);
        continue;
      }
      if (e.castInfo) {
        e.castInfo.t -= dt;
        if (e.castInfo.t <= 0) e.castInfo = null;
      }
      // 잠든 고대신: 제자리에 멈춰 체력을 조금씩 회복한다 (대신 받는 피해 한도가 커진다)
      if (e.dozeT > 0) {
        e.dozeT -= dt;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * e.dozeHeal * dt);
        if (e.dozeT <= 0) {
          e.dozeT = 0;
          this.emit({ k: 'wake', x: e.x, y: e.y });
        }
        RS.pathPos(e.d, e);
        continue;
      }
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
        // 일반 적은 균열로 빠져나간다 (한 번만 생명을 앗아 간다). 엘리트·보스는 균열에서 다시 나와 계속 돈다.
        // 빠져나가는 적은 먼저 치워 둔다 → 가시 갑옷·화약통에 쓰러져 처치 골드를 주지 않는다
        const leaving = !e.boss && !e.elite;
        if (leaving) {
          e.dead = true;
          e.escaped = true;
        }
        this.leak(e);
        if (this.status !== 'running') return;
        if (leaving) continue;
      }
      RS.pathPos(e.d, e);
    }
  };

  P.enemySkill = function (e, def, dt) {
    e.timer += dt;
    if (def.skills) this.bossSkills(e, def, dt);
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
      if (!e.subWarned && e.subTimer >= def.submerge.every - 1.2) {
        e.subWarned = true;
        this.warnCast(e, 'submerge', '잠수', 1.2);
      }
      if (e.subTimer >= def.submerge.every) {
        e.subTimer = 0;
        e.subWarned = false;
        e.subT = def.submerge.dur;
        // 물속에서 상처를 조금 회복한다
        if (def.submerge.heal) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.submerge.heal);
        this.emit({ k: 'msg', text: `${def.name}이(가) 물속으로 숨었다!${def.submerge.heal ? ' (체력 회복)' : ''}` });
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
        this.warnCast(e, 'anchor', '닻 던지기', def.anchor.warn);
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
        this.queueSpawn(def.summon.type, e.L, e.d - 7 * (k + 1), e.nextLap, def.summon.hp, e.wave);
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

  // ── 보스 기술 (def.skills): 기술마다 따로 대기 시간을 센다. 2단계(phase2)에서는 더 자주 쓴다 ──
  // 기술 준비 시간(초). 이 동안 보스 머리 위의 ! 표시·보스 바·대상 표시로 무엇이 올지 미리 보여 준다.
  // 0이면 기술 자체의 경고(칸 표시·돌진 선)가 준비 시간 역할을 한다
  const WIND = { shield: 1.6, shuffle: 1.8, plunder: 2.4, rally: 1.4, mend: 1.6, spawn: 1.2, doze: 1.3 };
  RS.SKILL_WIND = WIND;
  P.bossSkills = function (e, def, dt) {
    const st = e.sk || (e.sk = def.skills.map((s, k) => (s.first != null ? s.first : s.every * (0.55 + 0.1 * k))));
    // 잠든 동안에는 기술도 멈춘다
    if (e.dozeT > 0) return;
    for (const s of def.skills) if (s.k === 'blink') this.skillBlink(e, s);
    // 준비 중인 기술이 있으면 그것부터 마친다 (한 번에 기술 하나)
    if (e.cast) {
      e.cast.t -= dt;
      if (e.cast.t > 0) return;
      const c = e.cast;
      e.cast = null;
      this.castBossSkill(e, c.s, c.pre);
      return;
    }
    const cdMul = e.p2 && def.phase2 ? def.phase2.cd || 1 : 1;
    for (let k = 0; k < def.skills.length; k++) {
      const s = def.skills[k];
      if (s.k === 'blink') continue;
      st[k] -= dt;
      if (st[k] > 0) continue;
      st[k] = s.every * cdMul;
      // 지금은 쓸 수 없는 자리(돌진할 수 없는 모서리 등)면 잠시 뒤 다시 시도
      if (this.beginSkill(e, s) === false) st[k] = 0.4;
      else if (e.cast) break;
    }
  };
  // 경고만 띄우는 오래된 기믹(잠수·닻)용
  P.warnCast = function (e, id, name, t) {
    e.castInfo = { k: id, name, t, T: t };
    this.emit({ k: 'castStart', id, name, boss: e.def.name, x: e.x, y: e.y, t, main: e === this.boss });
  };
  P.beginSkill = function (e, s) {
    const w = s.wind != null ? s.wind : WIND[s.k] || 0;
    let pre = null;
    if (w > 0) {
      pre = this.prepSkill(e, s);
      if (pre === false) return false;
      e.cast = { s, t: w, T: w, pre };
    } else {
      if (this.castBossSkill(e, s) === false) return false;
      if (s.warn) e.castInfo = { k: s.k, name: s.name, t: s.warn, T: s.warn };
    }
    this.emit({ k: 'castStart', id: s.k, name: s.name, boss: e.def.name, x: e.x, y: e.y, t: w || s.warn || 0, seal: pre && pre.seal ? pre.seal.length : 0, main: e === this.boss });
    return true;
  };
  // 준비를 시작할 때 대상을 미리 정해 둔다 (봉인할 유닛, 자리를 바꿀 칸)
  P.prepSkill = function (e, s) {
    const pre = {};
    switch (s.k) {
      case 'shuffle': {
        const board = this.run.board;
        const used = {};
        const occ = [];
        for (let i = 0; i < F.SIZE; i++) if (board[i]) occ.push(i);
        if (occ.length < 2) return false;
        pre.pairs = [];
        for (let k = 0; k < s.n && occ.length; k++) {
          const a = occ.splice(this.rng.int(occ.length), 1)[0];
          if (used[a]) continue;
          const free = [];
          for (let i = 0; i < F.SIZE; i++) if (i !== a && !used[i]) free.push(i);
          if (!free.length) break;
          const b2 = free[this.rng.int(free.length)];
          used[a] = used[b2] = 1;
          pre.pairs.push([a, b2]);
        }
        if (!pre.pairs.length) return false;
        break;
      }
      case 'shield':
        if (s.seal) pre.seal = this.pickSeal(s.seal + (e.p2 && e.def.phase2 && e.def.phase2.seal ? e.def.phase2.seal : 0));
        break;
      case 'mend':
        if (!(e.hp < e.maxHp * (s.below || 1))) return false;
        break;
      case 'strike': {
        // 늪의 여왕: 물속에 있거나 준비 도중 잠수하게 되면 끊을 틈이 없으니, 떠오른 뒤로 미룬다
        const sub = e.def.submerge;
        if (e.subT > 0 || (sub && (e.subTimer || 0) + (s.wind || 0) + 0.2 >= sub.every)) return false;
        // 강타: 준비하는 동안 체력의 brk 만큼 깎으면(또는 기절·빙결시키면) 끊긴다
        pre.need = e.maxHp * s.brk;
        pre.taken = 0;
        pre.dmg = this.strikeDmg(e, s);
        break;
      }
    }
    return pre;
  };
  P.castBossSkill = function (e, s, pre) {
    const said = (id) => this.emit({ k: 'bossSkill', id, x: e.x, y: e.y, name: s.name, boss: e.def.name });
    switch (s.k) {
      case 'glue': {
        // 무작위 칸 묶음의 공격 속도를 떨어뜨린다 (경고 후)
        const n = s.size || 2;
        const c0 = this.rng.int(F.COLS - n + 1);
        const r0 = this.rng.int(F.ROWS - n + 1);
        const cells = [];
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) cells.push((r0 + r) * F.COLS + c0 + c);
        this.riftWarn.push({ cells, t: s.warn, total: s.warn, slow: s.amt, dur: s.dur, kind: 'glue' });
        said('glue');
        break;
      }
      case 'pulse': {
        // 모든 칸의 공격 속도를 잠깐 떨어뜨린다
        const cells = [];
        for (let i = 0; i < F.SIZE; i++) cells.push(i);
        this.riftWarn.push({ cells, t: s.warn, total: s.warn, slow: s.amt, dur: s.dur, kind: 'pulse' });
        said('pulse');
        break;
      }
      case 'shield':
        e.shield = Math.max(e.shield || 0, e.maxHp * s.pct);
        e.shieldMax = Math.max(e.shieldMax || 0, e.maxHp * s.pct);
        said('shield');
        if (s.seal) this.sealUnits(e, pre && pre.seal ? pre.seal : this.pickSeal(s.seal));
        break;
      case 'cross': {
        // 보드를 가로질러 돌진: 위쪽 길이면 아래쪽 길로, 오른쪽 길이면 왼쪽 길로 (늘 앞으로 건너뛴다)
        const local = ((e.d % F.PERIM) + F.PERIM) % F.PERIM;
        const base = e.d - local;
        const x1 = e.x;
        const y1 = e.y;
        let x2;
        let y2;
        let dLocal;
        if (e.dir === 0 && e.x > F.GX + 4 && e.x < F.GX + F.COLS * F.SLOT - 4) {
          x2 = e.x;
          y2 = F.B;
          dLocal = F.TOPLEN + F.SIDELEN + (F.R - e.x);
        } else if (e.dir === 1 && e.y > F.GY + 4 && e.y < F.GY + F.ROWS * F.SLOT - 4) {
          x2 = F.L;
          y2 = e.y;
          dLocal = 2 * F.TOPLEN + F.SIDELEN + (F.B - e.y);
        } else return false;
        const dTo = base + dLocal;
        if (dTo >= e.nextLap - 4) return false;
        e.crossWarn = { x1, y1, x2, y2, dTo, t: s.warn, stun: s.stun, selfStun: s.selfStun, speed: s.speed || 110 };
        this.emit({ k: 'crossWarn', x1, y1, x2, y2, t: s.warn });
        said('cross');
        return true;
      }
      case 'shuffle': {
        // 표시해 둔 칸끼리 유닛 자리를 바꾼다 (빈칸으로 옮겨질 수도 있다)
        const moved = [];
        for (const [a, b2] of pre.pairs) {
          this.swap(a, b2);
          moved.push(a, b2);
        }
        this.emit({ k: 'shuffle', slots: moved });
        said('shuffle');
        break;
      }
      case 'plunder': {
        const g = Math.min(s.max, Math.floor(this.run.gold * s.pct));
        if (g <= 0) {
          this.emit({ k: 'msg', text: '빼앗을 골드가 없다! 약탈을 피했다' });
          break;
        }
        this.run.gold -= g;
        this.emit({ k: 'plunder', g, x: e.x, y: e.y });
        said('plunder');
        break;
      }
      case 'spawn':
        for (let k = 0; k < s.n; k++) this.queueSpawn(s.type, e.L, e.d - 8 * (k + 1), e.nextLap, s.hp, e.wave);
        this.emit({ k: 'summonFx', x: e.x, y: e.y });
        if (s.name) said('spawn');
        break;
      case 'rift': {
        const c0 = this.rng.int(F.COLS - 1);
        const r0 = this.rng.int(F.ROWS - 1);
        const cells = [r0 * F.COLS + c0, r0 * F.COLS + c0 + 1, (r0 + 1) * F.COLS + c0, (r0 + 1) * F.COLS + c0 + 1];
        this.riftWarn.push({ cells, t: s.warn, total: s.warn, stun: s.stun });
        break;
      }
      case 'rally':
        // 모든 적이 잠깐 빨라진다
        for (const o of this.enemies) {
          if (o.dead) continue;
          o.hasteP = Math.max(o.hasteP, s.pct);
          o.hasteT = Math.max(o.hasteT, s.dur);
        }
        this.emit({ k: 'haste', x: e.x, y: e.y, r: 60 });
        said('rally');
        break;
      case 'strike':
        this.strikeHit(e, s, pre);
        break;
      case 'doze':
        // 깊은 잠: 제자리에 멈춰 회복하지만, 그동안 받는 피해 한도가 커진다
        e.dozeT = s.dur;
        e.dozeT0 = s.dur;
        e.dozeHeal = s.heal;
        e.dozeCap = s.cap;
        e.capLeft = Math.max(e.capLeft, e.maxHp * e.def.dpsCap * 0.5 * s.cap);
        this.emit({ k: 'doze', x: e.x, y: e.y, dur: s.dur });
        said('doze');
        break;
      case 'mend':
        if (e.hp < e.maxHp * (s.below || 1)) {
          e.hp = Math.min(e.maxHp, e.hp + e.maxHp * s.pct);
          this.emit({ k: 'heal', x: e.x, y: e.y, r: 18 });
          said('mend');
        }
        break;
    }
  };
  // 순간이동: 체력이 기준 아래로 떨어질 때마다 길 앞쪽으로 건너뛴다 (균열 문 바로 앞까지는 가지 않는다)
  P.skillBlink = function (e, s) {
    e.blinkDone = e.blinkDone || 0;
    while (e.blinkDone < s.at.length && e.hp < e.maxHp * s.at[e.blinkDone]) {
      e.blinkDone++;
      const room = e.nextLap - e.d - 24;
      if (room <= 0) continue;
      const x1 = e.x;
      const y1 = e.y;
      e.d += Math.min(room, F.PERIM * s.dist);
      RS.pathPos(e.d, e);
      this.emit({ k: 'blink', x1, y1, x2: e.x, y2: e.y });
      this.emit({ k: 'msg', text: `${e.def.name}이(가) 균열을 건너 앞으로 순간이동했다!`, warn: true });
    }
  };
  // 가로지르기: 경고 → 돌진(지나가는 칸의 유닛 기절) → 도착해서 스스로 기절
  P.updateCross = function (e, dt) {
    if (e.crossWarn) {
      const w = e.crossWarn;
      w.t -= dt;
      if (w.t > 0) return;
      e.crossWarn = null;
      e.cross = Object.assign({}, w, { p: 0, dur: Math.max(0.3, Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / w.speed), hit: {} });
      this.emit({ k: 'crossGo', x: e.x, y: e.y });
      return;
    }
    const c = e.cross;
    c.p += dt / c.dur;
    const q = Math.min(1, c.p);
    e.x = c.x1 + (c.x2 - c.x1) * q;
    e.y = c.y1 + (c.y2 - c.y1) * q;
    e.dir = c.x2 < c.x1 ? 2 : c.y2 > c.y1 ? 1 : e.dir;
    const i = RS.slotAt(e.x, e.y);
    if (i >= 0 && !c.hit[i]) {
      c.hit[i] = 1;
      this.slotStun[i] = Math.max(this.slotStun[i], c.stun);
      this.emit({ k: 'crossHit', slot: i, x: e.x, y: e.y });
    }
    if (q >= 1) {
      e.cross = null;
      e.d = c.dTo;
      RS.pathPos(e.d, e);
      e.stunT = Math.max(e.stunT, c.selfStun);
      this.emit({ k: 'crossEnd', x: e.x, y: e.y });
    }
  };

  // 봉인: 높은 등급일수록 잘 걸린다 (신화는 봉인되지 않는다). 칸이 아니라 유닛에 붙어서 자리를 옮겨도 따라간다
  P.pickSeal = function (n) {
    const board = this.run.board;
    const cands = [];
    for (let i = 0; i < F.SIZE; i++) {
      const u = board[i];
      if (u && !u.sealed && u.tier < RS.TOP_TIER) cands.push(u);
    }
    const out = [];
    const w = (u) => Math.pow(u.tier + 1, 2) * u.n;
    for (let k = 0; k < n && cands.length; k++) {
      let tot = 0;
      for (const u of cands) tot += w(u);
      let r = this.rng.next() * tot;
      let pickIdx = cands.length - 1;
      for (let j = 0; j < cands.length; j++) {
        r -= w(cands[j]);
        if (r <= 0) {
          pickIdx = j;
          break;
        }
      }
      out.push(cands.splice(pickIdx, 1)[0]);
    }
    return out;
  };
  // 표시해 둔 유닛을 봉인한다. 그사이 합성으로 신화가 됐거나 사라진 유닛은 빠져나간다
  P.sealUnits = function (e, units) {
    const board = this.run.board;
    const slots = [];
    for (const u of units) {
      const i = board.indexOf(u);
      if (i < 0 || u.sealed || u.tier >= RS.TOP_TIER) continue;
      u.sealed = true;
      slots.push(i);
    }
    if (!slots.length) {
      if (units.length) this.emit({ k: 'msg', text: '봉인이 빗나갔다! 표시된 유닛이 빠져나갔다' });
      return;
    }
    this.sealT = 30;
    this.statsDirty = true;
    this.emit({ k: 'seal', slots, boss: e.def.name });
  };
  P.unsealAll = function (reason) {
    const slots = [];
    this.run.board.forEach((u, i) => {
      if (u && u.sealed) {
        delete u.sealed;
        slots.push(i);
      }
    });
    this.sealT = 0;
    if (slots.length) this.emit({ k: 'unseal', slots, reason });
  };

  // 2단계: 체력이 기준 아래로 떨어지면 빨라지고 기술을 더 자주 쓴다
  P.bossPhase2 = function (e, def) {
    e.p2 = true;
    e.speed *= def.phase2.speed || 1;
    if (def.phase2.shield) {
      e.shield = Math.max(e.shield || 0, e.maxHp * def.phase2.shield);
      e.shieldMax = Math.max(e.shieldMax || 0, e.maxHp * def.phase2.shield);
    }
    this.emit({ k: 'phase2', x: e.x, y: e.y });
    this.emit({ k: 'msg', text: def.phase2.msg || `${def.name}이(가) 각성했다!`, warn: true });
  };

  // 한 바퀴를 돈 적이 앗아 갈 생명 (생명 보호 전). laps: 이번이 몇 바퀴째인가
  P.lapBase = function (e, laps) {
    const M = this.M;
    let dmg = (e.def.leak + M.leakAdd) * M.leakMult;
    // 엘리트·보스는 처음엔 조금, 다시 돌 때마다 두 배로 (1 → 2 → 4 → 8 …)
    if (e.elite || e.boss) dmg *= Math.pow(2, Math.min(5, Math.max(0, laps - 1)));
    if ((e.elite || e.boss) && this.run.asc >= 5) dmg += 1;
    if (e.boss && this.enraged) dmg *= 2;
    // 쇠말뚝: -1 (최소 1). 원래 생명을 앗지 않는 적(허수아비)은 그대로 0
    if (M.leakReduce) dmg = Math.max(dmg > 0 ? 1 : 0, dmg - M.leakReduce);
    return Math.max(0, dmg);
  };
  // 지금 한 바퀴를 돌면 통할 생명 보호 (횟수는 쓰지 않고 보기만 한다)
  P.leakGuard = function (e) {
    if (this.ghostT > 0) return 'ghost';
    if (this.M.firstWaveNoLeak && e.wave === 1) return 'wraith';
    if (this.M.helix && !this.helixUsed) return 'helix';
    if (this.leakShield > 0) return 'shield';
    return null;
  };
  // e 가 다음 바퀴를 마치면 잃을 생명 (미리보기용 — leak() 와 같은 계산)
  RS.lapLoss = function (b, e) {
    const dmg = b.lapBase(e, e.laps + 1);
    if (!b.leakGuard(e)) return dmg;
    return e.boss || e.elite ? dmg * 0.5 : 0;
  };

  P.leak = function (e) {
    const M = this.M;
    const run = this.run;
    let dmg = this.lapBase(e, e.laps);
    // 생명 보호(유령 망토·혼령 빙의·철갑 소라·버팀 닻·되감기 모래)는 일반 적에게만 완전히 통한다.
    // 엘리트·보스는 막지 못하고 피해를 절반으로만 줄인다 (횟수가 있는 보호는 한 번 쓴다)
    const big = e.boss || e.elite;
    let blocked = false;
    const guard = this.leakGuard(e);
    if (guard === 'helix') this.helixUsed = true;
    else if (guard === 'shield') this.leakShield--;
    if (guard) {
      if (big) dmg *= 0.5;
      else blocked = true;
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

  // ── 균열 게이지 ──
  // 일반 적이 한 바퀴의 뒤쪽(오른쪽 길을 지나 균열로 돌아오는 길)에 머물수록 게이지가 찬다. 가득 차면 생명 -1.
  // 누수(한 바퀴를 다 돎)는 '놓쳤는가'만 보지만, 게이지는 '얼마나 가까이 오게 두었는가'를 본다 → 전투마다 조금씩 닳는다
  P.updatePressure = function (dt) {
    const fill = RS.BAL.pressureFill;
    if (!fill) return;
    let w = 0;
    for (const e of this.enemies) {
      if (e.dead || e.boss || e.elite || e.subT > 0 || !(e.def.leak > 0)) continue;
      const p = (e.d - (e.nextLap - F.PERIM)) / F.PERIM;
      if (p > PRESSURE_FROM) w += (p - PRESSURE_FROM) / (1 - PRESSURE_FROM);
    }
    this.pressureW = w;
    // 뒤쪽 길에 적이 없으면 게이지가 서서히 가라앉는다
    if (w <= 0) {
      if (this.pressure > 0) this.pressure = Math.max(0, this.pressure - dt * RS.BAL.pressureDecay);
      return;
    }
    // 유령 망토가 펼쳐진 동안은 게이지가 차지 않는다
    if (this.ghostT > 0) return;
    this.pressure += (w * dt) / fill;
    while (this.pressure >= 1 && this.status === 'running') {
      this.pressure -= 1;
      this.stats.pressure++;
      this.emit({ k: 'pressure', v: this.M.leakMult });
      this.loseLife(this.M.leakMult);
    }
  };

  // ── 강타 (적의 의도) ──
  // 엘리트는 막이 오를수록 세게 친다
  P.strikeDmg = function (e, s) {
    const elite = e.elite && !e.boss;
    return s.dmg + (elite ? Math.floor((Math.max(1, Math.min(3, this.run.act)) - 1) * (RS.BAL.eliteStrikeStep || 0)) + (this.run.asc >= 1 ? 1 : 0) : 0);
  };
  // 강타 s 가 지금 떨어지면 잃을 생명 (미리보기와 실제 강타가 같은 계산을 쓴다).
  // s 를 생략하면 e 가 준비 중인 강타. pre 를 생략하면 준비 중인 강타의 값(없으면 새로 계산)
  RS.strikeLoss = function (b, e, s, pre) {
    const M = b.M;
    if (!s) s = e.cast && e.cast.s;
    if (!s) return 0;
    if (!pre && e.cast && e.cast.s === s) pre = e.cast.pre;
    let dmg = (pre && pre.dmg != null ? pre.dmg : b.strikeDmg(e, s)) * M.leakMult;
    if (e.boss && b.enraged) dmg *= 2;
    if (M.strikeReduce) dmg = Math.max(0, dmg - M.strikeReduce);
    // 철벽 방진: 결의가 3개 이상이면 강타 피해 감소
    if (M.resolveGuard && b.ab && b.ab.id === 'charge' && b.ab.n >= 3) dmg = Math.max(0, dmg - M.resolveGuard);
    if (M.leakReduce) dmg = Math.max(dmg > 0 ? 1 : 0, dmg - M.leakReduce);
    return Math.max(0, dmg);
  };
  // 이 강타가 상처를 남기는가 (생명을 깎고, 아직 최대치가 아닐 때) — 미리보기와 strikeHit 이 같이 쓴다
  RS.strikeInjures = (run, loss) => loss > 0 && (run.injury || 0) < RS.BAL.injuryMax;
  P.strikeHit = function (e, s, pre) {
    const dmg = RS.strikeLoss(this, e, s, pre);
    this.stats.struck += dmg;
    this.emit({ k: 'strike', x: e.x, y: e.y, v: dmg, name: s.name, boss: e.def.name });
    this.loseLife(dmg);
    // 생명을 깎은 강타는 상처를 남긴다 (다음 전투부터 모든 유닛 피해 -injuryPer 씩)
    if (dmg > 0) {
      const run = this.run;
      const before = run.injury || 0;
      run.injury = Math.min(RS.BAL.injuryMax, before + 1);
      this.stats.injuries = (this.stats.injuries || 0) + 1;
      this.emit({ k: 'injury', v: run.injury, up: run.injury > before });
    }
  };
  P.staggerStrike = function (e, why) {
    if (!e.cast || e.cast.s.k !== 'strike') return;
    e.cast = null;
    e.stunT = Math.max(e.stunT, e.boss ? 0.8 : 1.2);
    this.stats.staggers++;
    if (why !== 'charge') this.abilityOnStagger();
    const M = this.M;
    // 반격: 끊을 때마다 생명 +1, 그 적에게 최대 체력의 5% 피해
    if (M.counterStrike) {
      RS.heal(this.run, M.counterStrike);
      this.damage(e, e.maxHp * 0.08, null, false, true);
    }
    this.emit({ k: 'stagger', x: e.x, y: e.y, why, heal: M.counterStrike || 0 });
  };
  // 지금 강타를 준비 중인 적 (없으면 null) — 화면 집중·슬로 모션용
  P.strikeFocus = function () {
    for (const e of this.enemies) if (!e.dead && e.cast && e.cast.s.k === 'strike') return e;
    return null;
  };
  // 누수·강타 공통: 생명을 잃고, 0이 되면 진다
  P.loseLife = function (dmg) {
    if (!(dmg > 0)) return;
    const run = this.run;
    run.life -= dmg;
    if (run.life <= 0 && this.status === 'running') {
      run.life = 0;
      this.finish('lost', 'life');
    }
  };

  // ── 유닛 ──
  P.updateDyn = function () {
    const M = this.M;
    const run = this.run;
    let dmg = this.demon;
    let aspd = 0;
    if (M.diversity || M.purity || M.eliteSquad || M.legendAura) {
      const kinds = {};
      const rareKinds = {};
      let cnt = 0;
      let legends = 0;
      for (const s of run.board) {
        if (!s) continue;
        kinds[s.cls] = 1;
        if (s.tier >= 1) rareKinds[s.cls] = 1;
        cnt += s.n;
        if (s.tier >= 3) legends += s.n * (s.tier >= 4 ? 4 : 1);
      }
      const k = Object.keys(kinds).length;
      // 다양성: 희귀 이상 유닛이 있는 클래스마다
      if (M.diversity) dmg += M.diversity * Object.keys(rareKinds).length;
      if (M.purity && k > 0 && k <= 3) dmg += M.purity;
      if (M.eliteSquad && cnt > 0 && cnt <= 12) dmg += M.eliteSquad;
      if (M.legendAura) dmg += M.legendAura * legends;
    }
    if (M.rich && run.gold >= 100) dmg += M.rich;
    // 광전사: 잃은 생명 1당 피해 +4%, 공격 속도 +1.2% (최대 +80% / +24%)
    if (M.berserk) {
      const miss = Math.max(0, run.maxLife - run.life);
      dmg += Math.min(0.8, 0.04 * miss * M.berserk);
      aspd += Math.min(0.24, 0.012 * miss * M.berserk);
    }
    if (M.lowLifeDmg && run.life <= run.maxLife / 2) dmg += M.lowLifeDmg;
    if (M.curseDmg) dmg += M.curseDmg * run.curses.length;
    if (M.curseAspd) aspd += M.curseAspd * run.curses.length;
    if (M.itemDmg) dmg += M.itemDmg * this.itemUses;
    const rst = run.relicState;
    if (rst.pumpkinCandle && rst.pumpkinCandle.charges > 0) dmg += 0.5;
    if (rst.waxToys) aspd += Math.max(0, 0.4 - 0.1 * Math.floor(rst.waxToys.fights / 6));
    if (this.kind === 'elite') dmg += (M.eliteBattleDmg || 0) + (M.bigBattleDmg || 0);
    if (this.kind === 'boss') dmg += M.bigBattleDmg || 0;
    if (this.buffs.rage > 0) aspd += 0.6;
    if (this.buffs.watch > 0) aspd += 0.6;
    // 고유 능력: 마력 역류 · 용맹의 서약(결의) · 별자리(별 5개 이상) · 천체 관측(이번 전투 별똥별 수)
    if (this.buffs.surge > 0) aspd += M.stanceHaste;
    const ab = this.ab;
    if (ab && ab.id === 'charge' && M.resolveDmg) dmg += M.resolveDmg * ab.n;
    if (ab && ab.id === 'star') {
      if (M.starHoard && ab.n >= 5) dmg += M.starHoard;
      if (M.starStack) dmg += M.starStack * ab.uses;
    }
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
    // 단련(run.permDmg)과 상처(dyn.injMul)는 더하는 피해% 묶음과 따로 곱한다
    const mul = (1 + (run.permDmg || 0)) * (dyn && dyn.injMul != null ? dyn.injMul : 1);
    st.dmg = C.dmg * T.dmg * lv * mul * Math.max(0.1, 1 + pct);
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
    st.stun = (C.stun ? C.stun[tier] : 0) + (cm.stun || 0);
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
      if (this.slotStun[i] > 0 || s.sealed) continue;
      const st = this.slotStats[i];
      // 전투 밖에서 보드가 바뀌어 수치가 없으면 다음 틱에 다시 계산한다
      if (!st) {
        this.statsDirty = true;
        continue;
      }
      const cds = this.cd[i];
      let udt = this.slotSlowT[i] > 0 ? dt * (1 - this.slotSlowAmt[i]) : dt;
      if (this.critHasteT[i] > 0) {
        this.critHasteT[i] -= dt;
        udt *= 1 + this.M.critHaste;
      }
      for (let u = 0; u < s.n; u++) {
        cds[u] -= udt;
        if (cds[u] > 0) continue;
        if (this.attack(i, s, st, u)) cds[u] = st.interval + Math.max(cds[u], -dt);
        else cds[u] = 0.1;
      }
      if (s.tier >= 4) this.updateMythic(i, s, st, dt);
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
      // 다음 누수에 가장 가까운 적부터. e.d 는 바퀴를 돌수록 쌓이므로 e.d - e.nextLap (클수록 가깝다)으로 비교한다
      const key = e.d - e.nextLap;
      let j = out.length;
      if (j < n) out.push(e);
      else if (key <= out[n - 1].d - out[n - 1].nextLap) continue;
      else j = n - 1;
      while (j > 0 && out[j - 1].d - out[j - 1].nextLap < key) {
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
    // 눈가리개: 일정 확률로 빗나간다 (공격 모션만 나고 피해·효과 없음)
    if (M.missChance && rng.next() < M.missChance) {
      if (this.fxOn) this.fx.push({ k: 'shot', cls: s.cls, tier: s.tier, slot: i, u, x1: c.x, y1: c.y, x2: e.x + (rng.next() < 0.5 ? -7 : 7), y2: e.y - 4, crit: false, miss: true });
      return;
    }
    const cls = s.cls;
    const C = RS.CLASS[cls];
    let dmg = st.dmg * (mul || 1);
    let crit = mul > 1;
    if (st.crit > 0 && rng.next() < st.crit) {
      dmg *= st.critMult;
      crit = true;
      if (M.critHaste) this.critHasteT[i] = 2;
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
            if (o.dead || o === e || o.subT > 0) continue;
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
        if (s.tier >= 4) this.shadowExecute(i, st, e, c, crit, dmg);
        if (M.poison && !e.dead) {
          // 중첩 하나 = 그 공격 피해의 50%를 3초에 걸쳐. 세기는 중첩들의 평균이라 치명타 한 번이 모든 중첩을 키우지 않는다
          const p = (dmg * M.poison) / 3;
          if (e.poisonN < 5) {
            e.poison = (e.poison * e.poisonN + p) / (e.poisonN + 1);
            e.poisonN++;
          } else e.poison = (e.poison * 4 + p) / 5;
          e.poisonT = 3;
        }
        break;
      default:
        this.damage(e, dmg, cls, crit);
        if (cls === 'archer' && M.burnArrow && !e.dead) this.applyBurn(e, dmg * M.burnArrow);
    }
    // 원소 전환: 화염 태세는 화상, 냉기 태세는 둔화 (원소 합일은 둘 다)
    const ab = this.ab;
    if (ab && ab.id === 'stance' && !e.dead) {
      if (ab.stance === 'fire' || M.unity) this.applyBurn(e, dmg * (ab.def.burn + M.stanceBurn));
      if (ab.stance === 'ice' || M.unity) {
        this.applySlow(e, ab.def.slow + M.stanceSlow, 1.2);
        if (M.stanceFreeze && !e.boss && rng.next() < M.stanceFreeze) e.stunT = Math.max(e.stunT, 0.6);
      }
    }
    if (st.runeSlow && !e.dead) this.applySlow(e, st.runeSlow, 1);
    if (M.shrapnel && cls !== 'mage' && cls !== 'frost') this.splash(ex, ey, 8, dmg * M.shrapnel, cls, e, false);
    if (M.freezeChance && !e.boss && rng.next() < M.freezeChance) e.stunT = Math.max(e.stunT, 0.8);
    this.lastSlot = -1;
    if (this.fxOn) this.fx.push({ k: 'shot', cls, tier: s.tier, slot: i, u, x1: c.x, y1: c.y, x2: ex, y2: ey, crit });
  };

  // ── 신화 스킬 ──
  P.updateMythic = function (i, s, st, dt) {
    const def = RS.MYTHIC[s.cls];
    if (!def || !def.cd) return;
    const mc = this.mcd[i] || (this.mcd[i] = [def.cd * 0.4, def.cd * 0.7, def.cd]);
    for (let u = 0; u < s.n && u < mc.length; u++) {
      mc[u] -= dt;
      if (mc[u] > 0) continue;
      mc[u] = this.castMythic(i, s, st) ? def.cd : 0.3;
    }
  };
  const alive = (e) => !e.dead && !(e.subT > 0);
  P.enemiesNear = function (x, y, r) {
    const r2 = r * r;
    return this.enemies.filter((e) => alive(e) && (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y) <= r2);
  };
  P.castMythic = function (i, s, st) {
    const c = RS.slotCenter(i);
    const cls = s.cls;
    this.lastSlot = i;
    let ok = false;
    if (cls === 'knight') {
      const r = st.range + 8;
      const list = this.enemiesNear(c.x, c.y, r);
      if (list.length) {
        for (const e of list) {
          this.damage(e, st.dmg * 2, cls, false);
          if (!e.dead && !e.boss) e.stunT = Math.max(e.stunT, 0.8);
        }
        this.emit({ k: 'mythic', cls, x: c.x, y: c.y, r, cx: c.x, cy: c.y });
        ok = true;
      }
    } else if (cls === 'archer') {
      const list = this.enemies.filter(alive);
      if (list.length) {
        for (let k = 0; k < 6 && list.length; k++) {
          const e = list.splice(this.rng.int(list.length), 1)[0];
          this.damage(e, st.dmg * 1.3, cls, false);
          if (this.fxOn) this.fx.push({ k: 'shot', cls, tier: 4, slot: -1, u: 0, x1: e.x - 6 + this.rng.next() * 12, y1: e.y - 44, x2: e.x, y2: e.y, crit: false, rain: true });
        }
        this.emit({ k: 'mythic', cls, x: c.x, y: c.y, r: 0, cx: c.x, cy: c.y });
        ok = true;
      }
    } else if (cls === 'mage') {
      const list = this.enemiesNear(c.x, c.y, st.range * 1.5);
      if (list.length) {
        let best = list[0];
        let bestN = -1;
        for (const e of list) {
          let n = 0;
          for (const o of list) if ((o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y) <= 28 * 28) n++;
          if (n > bestN) {
            bestN = n;
            best = e;
          }
        }
        this.splash(best.x, best.y, 28, st.dmg * 3.5, cls, null, false);
        this.emit({ k: 'mythic', cls, x: best.x, y: best.y, r: 28, cx: c.x, cy: c.y });
        ok = true;
      }
    } else if (cls === 'frost') {
      const list = this.enemiesNear(c.x, c.y, st.range);
      if (list.length) {
        for (const e of list) {
          this.damage(e, st.dmg * 1.5, cls, false);
          if (e.dead) continue;
          if (e.boss) this.applySlow(e, 0.6, 2);
          else e.stunT = Math.max(e.stunT, 1.2);
        }
        this.emit({ k: 'mythic', cls, x: c.x, y: c.y, r: st.range, cx: c.x, cy: c.y });
        ok = true;
      }
    }
    this.lastSlot = -1;
    return ok;
  };
  // 도적 신화: 약해진 일반 적은 한 번에 처치, 치명타는 가까운 다른 적에게 이어진다
  P.shadowExecute = function (i, st, e, c, crit, dmg) {
    if (!e.dead && !e.boss && !e.elite && e.hp <= e.maxHp * 0.1) {
      this.damage(e, e.hp * 20 + 1, 'rogue', true);
      this.emit({ k: 'mythic', cls: 'rogue', x: e.x, y: e.y, r: 6, quiet: true });
    }
    if (crit) {
      const near = this.enemiesNear(c.x, c.y, st.range).filter((o) => o !== e);
      if (near.length) {
        const o = near[this.rng.int(near.length)];
        this.damage(o, dmg, 'rogue', true);
        if (this.fxOn) this.fx.push({ k: 'shot', cls: 'rogue', tier: 4, slot: -1, u: 0, x1: e.x, y1: e.y, x2: o.x, y2: o.y, crit: true });
      }
    }
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

  // 화상: 초당 b 피해를 3초 동안 (더 센 화상이 덮어쓴다)
  P.applyBurn = function (e, b) {
    if (b > e.burn || e.burnT <= 0) e.burn = b;
    e.burnT = this.M.burnLong ? 8 : 3; // 꺼지지 않는 불
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
      if (burn && !e.dead) this.applyBurn(e, dmg * burn);
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
    if (e.vulnT > 0 && e.vuln) dm *= 1 + e.vuln;
    if (M.burnVuln && e.burnT > 0) dm *= 1 + M.burnVuln; // 업화
    // 얼음 깨기: 기절·빙결된 적은 크게, 둔화된 적은 조금 더 아프다
    if (M.shatter) {
      if (e.stunT > 0) dm *= 1 + M.shatter;
      else if (e.slow > 0) dm *= 1 + M.shatter * 0.4;
    }
    if (e.burning === 'armor') dm *= 0.75;
    // 고대신 옴네크: 0.5초마다 받을 수 있는 피해에 한도가 있다
    if (def.dpsCap) {
      if (dm > e.capLeft && !e.capped) {
        e.capped = true;
        if (!this.capSeen) {
          this.capSeen = true;
          this.emit({ k: 'capHit', x: e.x, y: e.y });
        }
      }
      dm = Math.min(dm, e.capLeft);
      e.capLeft -= dm;
    }
    // 강타 준비 중: 들어간 피해만큼 경직이 쌓인다
    // (끊기는 이 피해를 다 반영한 뒤에 한다 — 반격 피해가 이 피해 계산 안에 끼어들지 않게)
    let stagger = false;
    if (e.cast && e.cast.s.k === 'strike' && dm > 0) {
      const pre = e.cast.pre;
      pre.taken += dm;
      if (pre.taken >= pre.need) stagger = true;
    }
    // 보호막이 먼저 피해를 받는다
    if (e.shield > 0 && dm > 0) {
      const ab = Math.min(e.shield, dm);
      e.shield -= ab;
      dm -= ab;
      if (e.shield <= 0) {
        e.shield = 0;
        this.emit({ k: 'shieldBreak', x: e.x, y: e.y, boss: e.boss });
        if (e.boss) this.unsealAll('break');
      }
      if (dm <= 0) {
        if (!isDot) e.flash = 0.08;
        if (stagger) this.staggerStrike(e, 'dmg');
        return 0;
      }
    }
    const dealt = Math.min(dm, e.hp);
    e.hp -= dm;
    // 흡혈: 엘리트·보스에게 준 피해로 생명 회복 (최대 체력 100%를 깎을 때마다 leech 만큼)
    if (M.leech && (e.elite || e.boss) && dealt > 0) {
      e.leechAcc = (e.leechAcc || 0) + (dealt / e.maxHp) * M.leech;
      if (e.leechAcc >= 1) {
        const n = Math.floor(e.leechAcc);
        e.leechAcc -= n;
        if (this.run.life < this.run.maxLife) {
          // 띄우는 숫자는 화면의 생명(올림)이 실제로 오른 만큼 (반 칸 회복이 +0.5 로 보이지 않게)
          const before = this.run.life;
          RS.heal(this.run, n);
          const v = Math.ceil(this.run.life) - Math.ceil(before);
          if (v > 0) this.emit({ k: 'leech', x: e.x, y: e.y, v });
        }
      }
    }
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
        for (let j = 0; j < def.splitN; j++) this.queueSpawn('slime', e.L, e.d - 5 * (j + 1), e.nextLap, def.splitHp, e.wave);
        this.emit({ k: 'summonFx', x: e.x, y: e.y });
      }
    }
    if (e.hp <= 0) {
      e.dead = true;
      if (this.lastSlot >= 0 && this.slotStats[this.lastSlot] && this.slotStats[this.lastSlot].runeGold) e.runeGold = this.slotStats[this.lastSlot].runeGold;
    }
    if (stagger) this.staggerStrike(e, 'dmg');
    return dealt;
  };

  // 죽은 적 정리 + 보상
  // (목록을 먼저 다 정리한 뒤에 처치 효과를 낸다 — 역병 확산이 정리 중인 목록을 훑지 않게)
  P.reap = function () {
    const list = this.enemies;
    const dead = this._reapBuf || (this._reapBuf = []);
    dead.length = 0;
    let w = 0;
    for (let k = 0; k < list.length; k++) {
      const e = list[k];
      if (e.dead) dead.push(e);
      else list[w++] = e;
    }
    list.length = w;
    for (const e of dead) {
      if (e.escaped) {
        this.stats.escaped++;
        this.emit({ k: 'escape', x: e.x, y: e.y });
      } else this.onKill(e);
    }
    dead.length = 0;
    this.flushPending();
  };

  P.onKill = function (e) {
    const def = e.def;
    const run = this.run;
    const M = this.M;
    // 리치: 주변에서 쓰러진 적의 영혼을 흡수해 회복
    if (!e.boss) {
      for (const bz of this.bosses) {
        const fd = bz.def.feed;
        if (!fd || bz.dead) continue;
        if ((bz.x - e.x) * (bz.x - e.x) + (bz.y - e.y) * (bz.y - e.y) > fd.r * fd.r) continue;
        bz.hp = Math.min(bz.maxHp, bz.hp + bz.maxHp * fd.pct);
        this.emit({ k: 'soul', x1: e.x, y1: e.y, x2: bz.x, y2: bz.y });
      }
    }
    let g = def.gold * RS.BAL.killGoldMul[Math.min(3, run.act)] * (1 + M.killGoldPct);
    if (M.starLoot && this.starFalling) g *= 2; // 별의 선물
    if (e.runeGold) g += e.runeGold; // 황금 룬 골드는 처치 골드 배율(유령 젤리 등)을 받지 않는다
    RS.addGold(run, g);
    this.stats.goldEarned += g;
    this.stats.kills++;
    this.abilityOnKill(e);
    if (e.elite || e.boss) {
      if (M.eliteKillHeal) RS.heal(run, M.eliteKillHeal);
      if (M.eliteKillMaxLife) {
        RS.changeMaxLife(run, M.eliteKillMaxLife);
        RS.heal(run, M.eliteKillMaxLife);
      }
    }
    // 역병 확산: 화상·독에 걸린 채 쓰러지면 주변 적에게 옮는다
    if (M.contagion && ((e.burnT > 0 && e.burn > 0) || (e.poisonT > 0 && e.poisonN > 0))) {
      const r2 = 20 * 20;
      let spread = 0;
      for (const o of this.enemies) {
        if (o.dead || o === e || o.subT > 0) continue;
        if ((o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y) > r2) continue;
        if (e.burnT > 0 && e.burn > 0) this.applyBurn(o, e.burn);
        if (e.poisonT > 0 && e.poisonN > 0) {
          o.poison = Math.max(o.poison, e.poison);
          o.poisonN = Math.max(o.poisonN, Math.min(5, e.poisonN));
          o.poisonT = 3;
        }
        if (++spread >= 3) break;
      }
      if (spread) this.emit({ k: 'plague', x: e.x, y: e.y });
    }
    // 꺼지지 않는 불: 화상 입은 채 쓰러지면 가까운 적 2마리에게 옮겨 붙는다
    if (M.burnLong && e.burnT > 0 && e.burn > 0) {
      const near = [];
      for (const o of this.enemies) {
        if (o.dead || o === e || o.subT > 0) continue;
        const d2 = (o.x - e.x) * (o.x - e.x) + (o.y - e.y) * (o.y - e.y);
        if (d2 <= 28 * 28) near.push({ o, d2 });
      }
      near.sort((a, b) => a.d2 - b.d2);
      for (let k = 0; k < Math.min(2, near.length); k++) this.applyBurn(near[k].o, e.burn);
      if (near.length) this.emit({ k: 'plague', x: e.x, y: e.y });
    }
    if (def.split) {
      for (let j = 0; j < def.split.n; j++) this.queueSpawn(def.split.type, e.L, e.d - 4 * j, e.nextLap, def.split.hp, e.wave);
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
    for (const u of this.run.board) if (u && u.sealed) delete u.sealed;
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

  // 비용·횟수 없이 소환 (유물·증강 효과). worth: 이 유닛에 들인 골드 (생략하면 무료 유닛)
  // 자리가 없으면 그 유닛의 판매가만큼 골드로 돌려준다. keep 이면 돌려주지 않고 -1 만 알린다 (다시 시도하는 효과)
  P.freeSummon = function (tier, worth, keep) {
    const run = this.run;
    const cls = RS.pickClass(run, this.rng);
    const slot = RS.addUnit(run.board, cls, tier, -1, worth);
    if (slot < 0) {
      if (!keep) {
        const g = RS.worthToGold(worth == null ? RS.freeWorth(tier) : worth, this.M);
        if (g > 0) {
          RS.addGold(run, g);
          this.stats.goldEarned += g;
          this.emit({ k: 'msg', text: `빈자리가 없어 무료 소환 대신 골드 +${g}` });
        }
      }
      return -1;
    }
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
    // 빈칸이 없으면 굴리기 전에 멈춘다 (가득 찬 보드에서 원하는 유닛이 나올 때까지 공짜로 다시 굴리지 못하게)
    if (!RS.hasEmptySlot(run.board)) return { err: 'full' };
    if (run.gold < cost) return { err: 'gold' };
    const cls = RS.pickClass(run, this.rng);
    const tier = RS.rollSummonTier(this.rng, M);
    const slot = RS.addUnit(run.board, cls, tier, -1, cost);
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
    const echo = this.echoLeft > 0;
    if (echo) this.echoLeft--;
    if (echo || (M.twinChance && this.rng.chance(M.twinChance))) {
      // 따라온 유닛은 낸 비용을 나눠 갖는다 (둘 다 팔아도 낸 골드보다 적다)
      const s2 = RS.addUnit(run.board, cls, tier, -1, 0);
      if (s2 >= 0) {
        res.twin = s2;
        RS.moveWorth(run.board, slot, s2, cost / 2);
        this.resetCd(s2);
      }
    }
    this.statsDirty = true;
    this.emit({ k: 'summon', slot, cls, tier, twin: res.twin, clover: res.clover });
    return res;
  };

  P.resetCd = function (slot) {
    const cds = this.cd[slot];
    for (let u = 0; u < cds.length; u++) if (cds[u] < 0.05) cds[u] = 0.05 + this.rng.next() * 0.3;
  };

  // 합성: 결과 클래스는 늘 무작위 (지휘관 성향 가중치). 고르는 기능은 후반 가치가 너무 커서 없앴다
  P.merge = function (i) {
    const board = this.run.board;
    if (!RS.canMerge(board, i)) return null;
    const res = RS.mergeSlot(this.run, i, this.rng, this.M);
    if (!res) return null;
    for (const r of res.results) this.resetCd(r.slot);
    this.statsDirty = true;
    this.emit({ k: 'merge', slot: i, res });
    return res;
  };

  // 한 기 판매. 받는 골드는 RS.sellValueAt(run, i, M) 과 같다
  P.sell = function (i) {
    if (!this.run.board[i] || this.run.board[i].sealed) return 0;
    const v = RS.sellOne(this.run, i, this.M);
    this.statsDirty = true;
    this.emit({ k: 'sell', slot: i, v });
    return v;
  };

  P.swap = function (a, b) {
    if (a === b) return;
    RS.swapSlots(this.run.board, a, b);
    const t = this.cd[a];
    this.cd[a] = this.cd[b];
    this.cd[b] = t;
    const m = this.mcd[a];
    this.mcd[a] = this.mcd[b];
    this.mcd[b] = m;
    this.statsDirty = true;
  };


  P.upgradeCost = function (cls) {
    return Math.max(1, RS.upgradeCost(this.run, cls, this.M));
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
        // 빈칸이 없으면 굴리기 전에 멈춘다 (소환처럼 공짜로 다시 굴리지 못하게)
        if (!RS.hasEmptySlot(run.board)) return { err: 'full' };
        for (let k = 0; k < pot; k++) {
          const cls = RS.pickClass(run, this.rng);
          const slot = RS.addUnit(run.board, cls, 1);
          if (slot < 0) {
            RS.addGold(run, RS.worthToGold(RS.freeWorth(1), this.M)); // 두 번째 유닛을 놓을 자리가 없으면 골드로
            continue;
          }
          this.resetCd(slot);
          this.emit({ k: 'summon', slot, cls, tier: 1 });
        }
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
    this.itemUses++;
    if (this.M.itemDmg) this.dynT = 0;
    this.emit({ k: 'item', id });
    return { id };
  };

  // ── 지휘관 고유 능력 ──
  // 브론 결의·아스트라 별은 모아서 버튼으로 쓰고, 엘라 원소 전환은 대기 시간이 있다.
  // persist 인 자원(별)은 run.abil.n 에 남아 다음 전투로 이어진다
  const lapProg = (e) => 1 - (e.nextLap - e.d) / F.PERIM;
  // 엘리트·보스 (허수아비 시험의 허수아비도: 최대 체력 비율 피해로 시험을 공짜로 깎지 않게)
  const isBig = (e) => e.elite || e.boss || e.def === RS.ENEMY.dummy;
  P.initAbility = function () {
    const run = this.run;
    const M = this.M;
    const cmd = RS.COMMANDER[run.commander];
    const def = cmd && RS.ABILITY[cmd.ability];
    this.ab = null;
    if (!def) return;
    const ab = { id: cmd.ability, def, n: 0, max: 0, cost: 0, cd: 0, uses: 0, stance: 'fire' };
    if (def.max) {
      ab.max = def.max + M.abMax;
      ab.cost = Math.max(1, def.cost - M.abCostDown);
      if (def.persist) {
        if (!run.abil) run.abil = { n: 0 };
        ab.n = Math.min(ab.max, Math.max(0, Math.floor(run.abil.n) || 0));
      }
      ab.n = Math.min(ab.max, ab.n + (def.start || 0) + M.abStart);
    }
    this.ab = ab;
    this.syncAbil();
  };
  P.syncAbil = function () {
    const ab = this.ab;
    if (ab && ab.def.persist) this.run.abil.n = ab.n;
  };
  P.abGain = function (v) {
    const ab = this.ab;
    if (!ab || !ab.max || !(v > 0)) return;
    const before = ab.n;
    ab.n = Math.min(ab.max, ab.n + v);
    this.syncAbil();
    // 결의·별 수에 따라 강해지는 효과(용맹의 서약·별자리)는 바로 다시 계산한다
    if (ab.n !== before) this.dynT = 0;
  };
  P.abilityOnWave = function () {
    const ab = this.ab;
    if (ab && (ab.id === 'star' || ab.id === 'charge')) this.abGain(1);
  };
  // 별 부스러기: 적 N마리마다 별 +1. 별처럼 처치 수도 전투를 넘어 이어진다 (정수로 세서 30번째 처치에 정확히 준다)
  P.abilityOnKill = function () {
    const ab = this.ab;
    if (!ab || ab.id !== 'star' || !this.M.starKill) return;
    const per = Math.max(1, Math.round(1 / this.M.starKill));
    const st = this.run.abil;
    st.kills = (st.kills || 0) + 1;
    if (st.kills >= per) {
      st.kills -= per;
      this.abGain(1);
    }
  };
  // 강타를 끊으면 결의 +1 (방패 돌진이 들이받은 적의 강타는 빼고. 돌진의 기절로 옆의 적 강타가 끊기는 것은 센다)
  P.abilityOnStagger = function () {
    if (this.ab && this.ab.id === 'charge' && !this.abBusy) this.abGain(1);
  };
  P.canUseAbility = function () {
    const ab = this.ab;
    if (!ab || this.status !== 'running') return false;
    // 원소 전환은 준비 시간에도 태세만 미리 바꿀 수 있다
    if (ab.id === 'stance') return ab.cd <= 0;
    if (this.prep > 0 || !this.enemies.some((e) => !e.dead && !(e.subT > 0))) return false;
    return ab.n >= ab.cost;
  };
  // 지금 쓸 수 없는 이유 (화면 안내용). 쓸 수 있으면 null
  P.abilityBlock = function () {
    const ab = this.ab;
    if (!ab) return '고유 능력이 없다';
    if (this.canUseAbility()) return null;
    if (ab.id === 'stance') return `${Math.ceil(ab.cd)}초 뒤에 다시 바꿀 수 있어요`;
    if (ab.n < ab.cost) return `${ab.def.res}이(가) ${ab.cost}개 모여야 해요 (${ab.def.gain})`;
    return '적이 있을 때 쓸 수 있어요';
  };
  // 방패 돌진 대상: 강타 준비 중 → 엘리트·보스 → 한 바퀴를 가장 많이 돈 적
  P.chargeTarget = function () {
    let best = null;
    let bs = -Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.subT > 0) continue;
      const sc = (e.cast && e.cast.s.k === 'strike' ? 10 : 0) + (isBig(e) ? 5 : 0) + lapProg(e);
      if (sc > bs) {
        bs = sc;
        best = e;
      }
    }
    return best;
  };
  P.useAbility = function () {
    if (!this.canUseAbility()) return false;
    const ab = this.ab;
    const n0 = ab.n;
    // 비용을 먼저 낸다 (자원이 가득 찬 채로 써도 쓰는 동안 돌려받은 것이 최대치에 잘리지 않게: 연속 돌격)
    if (ab.max) ab.n = n0 - ab.cost;
    let ok = true;
    if (ab.id === 'charge') ok = this.abCharge();
    else if (ab.id === 'stance') this.abStance();
    else if (ab.id === 'star') this.abStar();
    if (!ok) {
      ab.n = n0;
      this.syncAbil();
      return false;
    }
    ab.uses++;
    this.stats.abil++;
    this.syncAbil();
    this.reap();
    this.dynT = 0;
    return true;
  };

  // 브론: 들이받아 강타를 끊고 큰 피해, 주변 적 기절
  P.abCharge = function () {
    const e = this.chargeTarget();
    if (!e) return false;
    const M = this.M;
    const A = RS.ABILITY.charge;
    const L = RS.levelHp(this.curL);
    const mul = M.chargeAoe ? 2 : 1;
    this.abBusy = true;
    // 도발: 맞거나 기절한 적은 8초 동안 받는 피해가 늘고 느려진다
    const taunt = (o) => {
      if (!M.chargeTaunt || o.dead) return;
      this.applySlow(o, 0.5, 8);
      o.vuln = Math.max(o.vuln || 0, M.chargeTaunt);
      o.vulnT = Math.max(o.vulnT || 0, 8);
    };
    const hit = (o) => {
      this.damage(o, (isBig(o) ? o.maxHp * A.bigPct + L * A.bigFlat : L * A.hit) * mul, null, true, false);
      taunt(o);
    };
    const casting = !!(e.cast && e.cast.s.k === 'strike');
    hit(e);
    if (casting && !e.dead && e.cast) this.staggerStrike(e, 'charge');
    for (const o of this.enemies) {
      if (o === e || o.dead || o.subT > 0) continue;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (M.chargeAoe && d2 <= 30 * 30) hit(o);
      if (!o.dead && !o.boss && d2 <= 20 * 20) {
        o.stunT = Math.max(o.stunT, 1);
        taunt(o);
      }
    }
    this.abBusy = false;
    // 되받아치기: 띄우는 숫자는 화면의 생명(올림)이 실제로 오른 만큼 (가득 찼거나 회복 불가 저주면 0)
    let healed = 0;
    if (casting && M.chargeHeal) {
      const before = this.run.life;
      RS.heal(this.run, M.chargeHeal);
      healed = Math.max(0, Math.ceil(this.run.life) - Math.ceil(before));
    }
    if (casting && M.chargeRefund) this.abGain(M.chargeRefund); // 연속 돌격: 강타를 끊으면 결의를 돌려받는다
    this.emit({ k: 'abil', id: 'charge', x: e.x, y: e.y, broke: casting, heal: healed });
    return true;
  };
  // 엘라: 태세를 바꾸고 원소 폭발
  P.abStance = function () {
    const ab = this.ab;
    const M = this.M;
    const to = ab.stance === 'fire' ? 'ice' : 'fire';
    ab.stance = to;
    ab.cd = Math.max(3, RS.ABILITY.stance.cd - M.stanceCd);
    if (M.stanceHaste) this.buffs.surge = 6; // 마력 역류
    const A = RS.ABILITY.stance;
    const amp = 1 + M.stanceBoom;
    let hit = 0;
    if (this.prep <= 0) {
      for (const e of this.enemies) {
        if (e.dead || e.subT > 0) continue;
        // 원소 폭발: 모든 적의 최대 체력 비율 (엘리트·보스는 조금만)
        let d = e.maxHp * (isBig(e) ? A.bigBoom : A.boom) * amp;
        if (M.thermal && to === 'fire' && e.slow > 0) d *= 3; // 열충격: 냉기 → 화염
        if (M.thermal && to === 'ice' && e.burnT > 0 && !e.boss) e.stunT = Math.max(e.stunT, 2.5); // 화염 → 냉기
        this.damage(e, d, null, false, true);
        hit++;
      }
    }
    this.emit({ k: 'abil', id: 'stance', stance: to, hit });
  };
  // 별똥별 한 번(mul: 유성우의 두 번째는 0.5)이 이 적에게 주는 피해 (피해 배율을 곱하기 전)
  // 보스: 레벨 피해의 bossMul 과 최대 체력의 bossPct 중 큰 쪽 (초신성은 레벨 피해 그대로, 체력 비율 ×2)
  P.starDmgTo = function (e, mul) {
    const M = this.M;
    const A = RS.ABILITY.star;
    const dmg = RS.levelHp(this.curL) * A.dmg * mul;
    if (!e.boss) return dmg;
    return Math.max(M.supernova ? dmg : dmg * A.bossMul, e.maxHp * (A.bossPct || 0) * mul * (M.supernova ? 2 : 1));
  };
  // 지금 능력을 쓰면 준비 중인 강타가 끊기는가 (능력 버튼 반짝임 · 봇이 같이 쓴다)
  // 방패 돌진은 강타를 준비하는 적부터 들이받아 늘 끊는다. 별똥별은 한 방 피해가 남은 경직을 넘거나 초신성(기절)일 때
  P.abilityBreaksStrike = function () {
    const ab = this.ab;
    if (!ab || (ab.id !== 'charge' && ab.id !== 'star') || !this.canUseAbility()) return false;
    for (const e of this.enemies) {
      if (e.dead || e.subT > 0 || !e.cast || e.cast.s.k !== 'strike') continue;
      if (ab.id === 'charge' || this.M.supernova) return true;
      if (this.starDmgTo(e, 1) >= e.cast.pre.need - e.cast.pre.taken) return true;
    }
    return false;
  };
  // 아스트라: 별똥별 — 모든 적에게 큰 피해 (보스는 35%)
  P.abStar = function () {
    const M = this.M;
    const fall = (mul) => {
      for (const e of this.enemies) {
        if (e.dead || e.subT > 0) continue;
        this.damage(e, this.starDmgTo(e, mul), null, false, true);
        if (e.dead) continue;
        if (M.starSlow) this.applySlow(e, M.starSlow, 4);
        if (M.supernova) e.stunT = Math.max(e.stunT, e.boss ? 0.5 : 1);
      }
    };
    // 별의 선물: 별똥별로 쓰러진 적의 처치 골드 ×2 (처치 정리까지 표시해 둔다)
    this.starFalling = true;
    fall(1);
    this.reap();
    if (M.starTwice) {
      fall(M.starTwice);
      this.reap();
    }
    this.starFalling = false;
    this.emit({ k: 'bomb' });
    this.emit({ k: 'abil', id: 'star' });
  };

  // 허수아비 시험처럼 제한 시간이 있는 전투의 남은 시간(초). 제한이 없으면 null
  P.trialLeft = function () {
    const lim = this.stage.spec && this.stage.spec.timeLimit;
    if (!lim) return null;
    return Math.max(0, lim - (this.trialT || 0));
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
