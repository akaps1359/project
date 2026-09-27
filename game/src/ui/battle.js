// 전투 화면: HUD, 유닛 패널, 소모품, 전장 입력, 첫 전투 코치
(function (RS) {
  'use strict';

  const F = RS.FIELD;
  const UI = RS.UI;
  const { h, append, $, btn, icon, unitImg, fmt, fmtK, pct } = UI;

  // 슬롯 중심에서 적이 도는 길(사각 루프)까지의 거리. 바깥 칸 26, 안쪽 칸 52
  const PATH_D = [];
  for (let i = 0; i < F.SIZE; i++) {
    const c = RS.slotCenter(i);
    PATH_D.push(Math.min(c.x - F.L, F.R - c.x, c.y - F.T, F.B - c.y));
  }
  UI.pathDist = (i) => PATH_D[i];
  UI.reaches = (st, i) => !!st && st.range >= PATH_D[i];

  // 길에 닿는 칸만 더한 전체 DPS
  UI.effDps = function (b) {
    if (b.statsDirty) b.computeSlotStats();
    let dps = 0;
    const board = b.run.board;
    for (let i = 0; i < F.SIZE; i++) {
      const s = board[i];
      const st = b.slotStats[i];
      if (s && st && UI.reaches(st, i)) dps += st.dps * s.n;
    }
    return dps;
  };

  UI.sellValueAt = function (b, i) {
    const run = b.run;
    const s = run.board[i];
    if (!s) return 0;
    if (typeof RS.sellValueAt === 'function') return RS.sellValueAt(run, i, b.M);
    return RS.sellValue(run, s.tier, b.M);
  };

  UI.starMax = (b) => (typeof b.starMax === 'number' && b.starMax > 0 ? b.starMax : 3);

  // 고대 두루마리: 합성 후보는 칸의 스택이 바뀔 때까지 고정
  UI.mergeOptsFor = function (b, i) {
    if (typeof b.mergeOptions !== 'function') return null;
    if (b.mergeOptions.length >= 1) return b.mergeOptions(i); // 코어가 칸별로 기억한다
    // 예전 코어: 부를 때마다 새로 굴리므로 여기서 기억한다
    const s = b.run.board[i];
    if (!s) return null;
    const cache = b.uiMergeOpts || (b.uiMergeOpts = {});
    const key = i + ':' + s.cls + ':' + s.tier;
    return cache[key] || (cache[key] = b.mergeOptions(i));
  };
  function forgetMergeOpts(b, i) {
    if (!b.uiMergeOpts) return;
    for (const k of Object.keys(b.uiMergeOpts)) if (k.split(':')[0] === String(i)) delete b.uiMergeOpts[k];
  }

  UI.initBattle = function () {
    for (const img of document.querySelectorAll('img[data-icon]')) img.src = RS.iconURL(img.dataset.icon, 3);
    $('#b-summon').addEventListener('click', () => UI.doSummon());
    $('#b-upg').addEventListener('click', () => {
      RS.sfx('click');
      if (UI.panelMode === 'upgrade') UI.closePanel();
      else {
        UI.setPanel('upgrade');
        UI.tutDone('upgrade');
      }
    });
    $('#b-arrange').addEventListener('click', () => {
      const G = UI.G;
      if (!G.battle) return;
      RS.sfx('click');
      G.battle.arrange();
      UI.select(-1);
      UI.toast('근접은 바깥, 원거리는 안쪽으로 정리했어요');
    });
    $('#b-speed').addEventListener('click', () => {
      RS.sfx('click');
      UI.G.setSpeed(UI.G.speed >= 3 ? 1 : UI.G.speed + 1);
    });
    $('#b-pause').addEventListener('click', () => {
      RS.sfx('click');
      UI.openMenu();
    });
    // HUD 항목을 누르면 설명
    const hudTip = (id, fn) => $(id).addEventListener('click', (e) => {
      const G = UI.G;
      if (!G.battle) return;
      const t = fn(G.battle, G.run);
      UI.tip(e.currentTarget, t[0], t[1], t[2] || null);
    });
    hudTip('#h-life', () => ['생명', '적이 길을 한 바퀴 돌아 균열로 들어갈 때마다 줄어요. 0이 되면 모험이 끝나요.']);
    hudTip('#h-gold', (b) => ['골드', `처치·웨이브마다 들어와요. 웨이브 시작 때 보유 10G당 1G 이자 (최대 ${RS.interestCap(b.M)}).`]);
    hudTip('#h-foe', (b) => ['적', `지금 필드에 있는 적 수. ${b.cap}마리가 되면 즉시 패배.`]);
    hudTip('#h-wave', (b) => ['웨이브', '준비: 첫 웨이브까지 남은 시간 · n/3: 현재 웨이브와 다음 웨이브까지 남은 시간', trialLimit(b) ? `허수아비 시험: ${trialLimit(b)}초 안에 쓰러뜨려야 해요` : null]);
    $('#bossbar').addEventListener('click', (e) => {
      const G = UI.G;
      const b = G.battle;
      if (!b) return;
      const id = b.boss ? b.boss.type : bossIdOf(b);
      const def = id && RS.ENEMY[id];
      if (!def) return;
      const t = RS.BAL.bossTime + (b.M.bossTimeAdd || 0) + (def.bossTimeAdd || 0);
      const marks = bossMarks(def);
      const mk = marks.length ? ` · 체력바 노란 눈금: ${marks.map((m) => `${Math.round(m[0] * 100)}% ${m[1]}`).join(', ')}` : '';
      UI.tip(e.currentTarget, `${def.name} · 보스`, def.trait || '', `제한 시간 ${t}초 · 지나면 폭주: 속도 ×1.8, 잃는 생명 ×2${mk} · 기술을 쓰기 전에 머리 위 ! 와 이 바 아래에 예고가 떠요`);
    });
    bindField();
    window.addEventListener('resize', () => UI.fitCanvas());
    if (window.ResizeObserver) new ResizeObserver(() => UI.fitCanvas()).observe($('#field'));
  };

  function trialLimit(b) {
    return (b.stage.spec && b.stage.spec.timeLimit) || 0;
  }
  function trialLeft(b) {
    if (typeof b.trialLeft === 'function') return b.trialLeft();
    const lim = trialLimit(b);
    return lim ? Math.max(0, lim - (b.trialT || 0)) : null;
  }
  // 체력바 눈금: 이 체력 아래로 떨어지면 무언가 일어난다
  function bossMarks(def) {
    const m = [];
    if (def.phase2) m.push([def.phase2.at, '각성']);
    if (def.splitAt) for (const a of def.splitAt) m.push([a, '분열']);
    for (const s of def.skills || []) if (s.k === 'blink') for (const a of s.at) m.push([a, '순간이동']);
    return m;
  }
  UI.bossMarks = bossMarks;
  function bossIdOf(b) {
    const st = b.stage;
    if (st.spec && st.spec.boss) return st.spec.boss;
    if (b.kind === 'boss') return RS.actDef(UI.G.run).boss;
    return null;
  }

  UI.fitCanvas = function () {
    const box = $('#field');
    const cv = $('#cv');
    if (!box || box.clientWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const avail = Math.min(box.clientWidth / F.W, box.clientHeight / F.H);
    let scale = avail;
    const phys = Math.floor(avail * dpr);
    // 물리 픽셀 정수배로 맞춰 도트가 고르게. 다만 그 때문에 조금이라도(2% 넘게) 작아지면(보스 체력바가 생길 때 등)
    // 고해상도 화면에서는 그냥 가득 채운다 (2% 기준) (도트 차이가 눈에 띄지 않는다)
    if (phys >= 3 && (phys / dpr >= avail * 0.98 || dpr < 2)) scale = phys / dpr;
    // 캔버스는 화면의 실제 픽셀 크기로 만들고(렌더러가 논리 좌표를 기기 픽셀에 맞춰 그린다) CSS 크기는 그 1:1
    const R = UI.G && UI.G.renderer;
    let cw = Math.floor(F.W * scale);
    let ch = Math.floor(F.H * scale);
    if (R && R.resize) {
      const sz = R.resize(scale, dpr);
      cw = sz.w;
      ch = sz.h;
    }
    const w = cw.toFixed(2) + 'px';
    const hh = ch.toFixed(2) + 'px';
    if (cv.style.width !== w) cv.style.width = w;
    if (cv.style.height !== hh) cv.style.height = hh;
  };

  UI.showBattle = function () {
    const G = UI.G;
    const b = G.battle;
    const st = b.stage;
    UI.show('scr-battle');
    $('#toasts').innerHTML = '';
    UI.select(-1);
    UI.dropWarned = UI.dropWarned || 0;
    // 보스전은 처음부터 보스 바 자리를 잡아 둔다 (캔버스 크기가 전투 중 바뀌지 않게)
    const bb = $('#bossbar');
    const bossId = bossIdOf(b);
    UI.bossReserved = !!bossId;
    bb.classList.remove('enraged');
    $('#boss-cast').classList.add('idle');
    $('#boss-cast b').textContent = bossId ? '특성' : '';
    $('#boss-cast span').textContent = bossId ? RS.ENEMY[bossId].trait || '' : '';
    $('#boss-ticks').innerHTML = '';
    if (bossId) {
      bb.hidden = false;
      bb.classList.add('wait');
      $('#boss-name').textContent = RS.ENEMY[bossId].name;
      $('#boss-hp').style.width = '100%';
      $('#boss-ticks').innerHTML = bossMarks(RS.ENEMY[bossId]).map((m) => `<b style="left:${m[0] * 100}%" title="${m[1]}"></b>`).join('');
      $('#boss-t').textContent = '마지막 웨이브';
    } else {
      bb.hidden = true;
    }
    UI.setPanel('idle');
    UI.renderItems();
    UI.hudCache = {};
    UI.fitCanvas();
    UI.updateHud(true);
    const run = G.run;
    if (trialLimit(b)) {
      UI.toast(`${trialLimit(b)}초 안에 허수아비를 쓰러뜨리세요`, 'warn');
    } else if (b.kind === 'boss' && bossId) {
      UI.toast(`보스전 · 마지막 웨이브에 ${RS.ENEMY[bossId].name} 등장`, 'warn');
    } else if (b.kind === 'elite') {
      const BUFF = { hp: '체력 +40%', fast: '속도 +30%', regen: '재생', armor: '받는 피해 -25%' };
      UI.toast(run.burning ? `성난 엘리트(${BUFF[st.spec && st.spec.burnBuff] || '강화'}) · 이기면 초록 봉인석` : '엘리트전 · 마지막 웨이브에 강적 등장', 'warn');
    }
    if (run.lament > 0) setTimeout(() => UI.toast('졸음의 별: 첫 웨이브 적 체력 1', 'good'), 900);
    if (run.tax > 0) setTimeout(() => UI.toast(`빈 주머니 별: 웨이브 골드 없음 (${run.tax}번 남음)`, 'warn'), 1400);
  };

  // 전장에서 탭한 자리에 가장 가까운 적
  function enemyAt(b, p) {
    let best = null;
    let bd = 12 * 12;
    for (const e of b.enemies) {
      if (e.dead || e.subT > 0) continue;
      const dx = e.x - p.x;
      const dy = e.y - 4 - p.y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }
  function enemyTip(b, e, cx, cy) {
    const def = e.def;
    const M = b.M;
    let leak = (def.leak + (M.leakAdd || 0)) * (M.leakMult || 1);
    if ((e.elite || e.boss) && b.run.asc >= 5) leak += 1;
    if (e.boss && b.enraged) leak *= 2;
    if (M.leakReduce) leak = Math.max(1, leak - M.leakReduce);
    const hp = M.blindfold ? '?' : Math.max(1, Math.ceil((100 * Math.max(0, e.hp)) / e.maxHp));
    UI.tipAt(cx, cy, def.name + (e.boss ? ' · 보스' : e.elite ? ' · 엘리트' : ''), `체력 ${hp}${hp === '?' ? '' : '%'} · 한 바퀴당 생명 -${Math.round(leak * 10) / 10}`, def.trait || null);
  }

  function bindField() {
    const cv = $('#cv');
    const toLogical = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * F.W, y: ((e.clientY - r.top) / r.height) * F.H };
    };
    let drag = null;
    const tmpSt = {};
    const reachAt = (s, i) => {
      const G = UI.G;
      const b = G.battle;
      if (!b || i < 0 || !s) return true;
      const st = RS.unitStats(G.run, b.M, b.dyn, s.cls, s.tier, i, tmpSt);
      return st.range >= PATH_D[i];
    };
    cv.addEventListener('pointerdown', (e) => {
      const G = UI.G;
      if (!G.battle) return;
      e.preventDefault();
      // 모달을 닫은 탭이 그대로 전장에 들어가 유닛을 옮기지 않게
      if (G.modalOpen || (UI.inputLocked && UI.inputLocked())) return;
      const p = toLogical(e);
      const i = RS.slotAt(p.x, p.y);
      const board = G.run.board;
      if (i < 0) {
        const foe = enemyAt(G.battle, p);
        if (foe) enemyTip(G.battle, foe, e.clientX, e.clientY);
        else UI.select(-1);
        return;
      }
      if (!board[i]) {
        // 선택된 유닛이 있으면 빈칸으로 이동
        if (UI.sel >= 0 && board[UI.sel]) {
          const s = board[UI.sel];
          G.battle.swap(UI.sel, i);
          RS.sfx('click');
          UI.select(i);
          if (!reachAt(s, i)) warnDrop();
        } else {
          UI.select(-1);
          // 룬이 새겨진 빈칸을 누르면 룬 설명
          const rid = G.run.runes && G.run.runes[i];
          if (rid && RS.RUNE[rid]) {
            const R = RS.RUNE[rid];
            UI.tipAt(e.clientX, e.clientY, R.bad ? R.name : `${R.name} (강화된 칸)`, R.desc, R.bad ? '상점의 [룬]으로 덮어 새기면 없어져요' : '이 칸에 놓인 유닛이 효과를 받아요. 유닛을 옮겨도 룬은 칸에 남아요');
          }
        }
        return;
      }
      drag = { from: i, over: i, moved: false, x0: p.x, y0: p.y, x: p.x, y: p.y, id: e.pointerId, overReach: true, lastOver: i };
      G.renderer.drag = drag;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) {
        /* 일부 브라우저 */
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = toLogical(e);
      drag.x = p.x;
      drag.y = p.y;
      if (!drag.moved && Math.hypot(p.x - drag.x0, p.y - drag.y0) > 5) drag.moved = true;
      drag.over = RS.slotAt(p.x, p.y);
      if (drag.over !== drag.lastOver) {
        drag.lastOver = drag.over;
        const G = UI.G;
        drag.overReach = drag.over < 0 || drag.over === drag.from ? true : reachAt(G.run.board[drag.from], drag.over);
      }
    });
    const end = (e) => {
      const G = UI.G;
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      G.renderer.drag = null;
      if (!G.battle) return;
      const board = G.run.board;
      if (d.moved) {
        if (d.over >= 0 && d.over !== d.from) {
          G.battle.swap(d.from, d.over);
          RS.sfx('click');
          UI.select(d.over);
          if (!d.overReach) warnDrop();
        }
      } else {
        // 합성할 수 있는 선택된 칸을 다시 누르면 선택을 풀지 않는다
        if (UI.sel === d.from && !RS.canMerge(board, d.from)) UI.select(-1);
        else UI.select(d.from);
        RS.sfx('click');
      }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', (e) => {
      if (drag && e.pointerId === drag.id) {
        drag = null;
        UI.G.renderer.drag = null;
      }
    });
  }

  function warnDrop() {
    if ((UI.dropWarned = (UI.dropWarned || 0) + 1) <= 3) UI.toast('이 칸에선 적에게 닿지 않아요', 'warn');
  }

  UI.sel = -1;
  UI.select = function (i) {
    const G = UI.G;
    UI.sel = i;
    if (G.renderer) G.renderer.sel = i;
    if (i >= 0 && G.run && G.run.board[i]) UI.setPanel('unit');
    else if (UI.panelMode === 'unit' || UI.panelMode === 'mergeChoose') UI.setPanel('idle');
  };

  // 강화·소모품·두루마리 패널을 닫으면 선택한 유닛이 있을 때 그 정보로 돌아간다
  UI.closePanel = function () {
    const G = UI.G;
    if (UI.sel >= 0 && G.run && G.run.board[UI.sel]) UI.setPanel('unit');
    else {
      UI.sel = -1;
      if (G.renderer) G.renderer.sel = -1;
      UI.setPanel('idle');
    }
  };

  // ── 첫 전투 코치 (메타 기록에 진행 상황 저장) ──
  function tut() {
    const meta = UI.G.meta;
    if (!meta.tut || typeof meta.tut !== 'object') meta.tut = {};
    return meta.tut;
  }
  UI.tutDone = function (k) {
    const t = tut();
    if (t.off || t[k]) return;
    t[k] = true;
    if (t.summon && t.merge && t.upgrade && t.leak && t.cap) t.off = true;
    UI.G.saveMeta();
  };
  UI.coach = function (b, mergeable) {
    const G = UI.G;
    const t = tut();
    let text = null;
    let pulse = null;
    if (!t.off && (G.meta.runs || 0) > 2) {
      t.off = true;
      G.saveMeta();
    }
    if (!t.off) {
      const run = G.run;
      if (!t.summon) {
        text = '① 금색 [소환]을 눌러 유닛을 부르세요 (부를수록 1G씩 비싸져요)';
        pulse = 'summon';
      } else if (!t.merge && mergeable > 0) {
        text = '② 반짝이는 칸을 누르고 [합성] → 다음 등급 무작위 유닛';
      } else if (!t.upgrade && b.waveIdx >= 2) {
        let min = Infinity;
        for (const c of RS.CLASSES) min = Math.min(min, b.upgradeCost(c));
        if (run.gold >= min) {
          text = '③ [강화]: 골드로 한 클래스의 피해를 레벨당 +15%';
          pulse = 'upg';
        }
      }
      if (!t.cap && b.enemies.length >= b.cap * 0.5) {
        UI.toast(`적이 ${b.cap}마리 쌓이면 패배! 화력을 늘리세요`, 'warn');
        UI.tutDone('cap');
      }
    }
    const c = UI.hudCache;
    if (c.pulse !== pulse) {
      c.pulse = pulse;
      $('#b-summon').classList.toggle('pulse', pulse === 'summon');
      $('#b-upg').classList.toggle('pulse', pulse === 'upg');
    }
    const refs = UI.panelRefs || {};
    if (UI.panelMode === 'idle' && refs.hint) {
      setText(refs.hint, 'coach', text || '칸을 눌러 정보 보기 · 끌어서 자리 바꾸기');
      if (c.coachOn !== !!text) {
        c.coachOn = !!text;
        refs.hint.classList.toggle('coach', !!text);
        if (refs.hint.parentElement) refs.hint.parentElement.classList.toggle('coaching', !!text);
      }
    }
  };

  UI.doSummon = function () {
    const G = UI.G;
    const b = G.battle;
    if (!b) return;
    RS.unlockAudio();
    const res = b.summon();
    if (res.err === 'gold') {
      RS.sfx('error');
      UI.toast('골드가 부족해요', 'warn');
    } else if (res.err === 'full') {
      RS.sfx('error');
      UI.toast('빈자리가 없어요. 합성하거나 판매하세요', 'warn');
    } else if (res.err === 'cap') {
      RS.sfx('error');
      UI.toast('비단 목띠: 이번 웨이브에는 더 소환할 수 없어요', 'warn');
    } else if (res.err === 'locked') {
      RS.sfx('error');
      UI.toast('홀림 귀고리: 준비 시간에는 소환할 수 없어요', 'warn');
    } else if (res.err) {
      RS.sfx('error');
    } else {
      RS.sfx(res.tier > 0 ? 'rare' : 'summon');
      UI.tutDone('summon');
      if (res.tier > 0) UI.toast(`${RS.TIER[res.tier].name} ${RS.CLASS[res.cls].name} 소환!`, 't' + res.tier);
      if (res.clover) UI.toast('네잎클로버! 비용 반환', 'good');
      if (res.twin != null) UI.toast('한 기가 더 따라왔다!', 'good');
      const s = G.run.board[res.slot];
      if (s && RS.canMerge(G.run.board, res.slot) && (tut().off || tut().merge || UI.panelMode !== 'idle') && (UI.mergeHints = (UI.mergeHints || 0) + 1) <= 2) {
        UI.toast('합성 가능! 반짝이는 칸을 누르세요', 'good');
      }
    }
    UI.updateHud(true);
  };

  UI.doMerge = function (i, pick) {
    const G = UI.G;
    const b = G.battle;
    if (!b) return;
    if (b.M.mergeChoose && !pick) {
      const opts = UI.mergeOptsFor(b, i);
      if (opts && opts.length) {
        UI.sel = i;
        if (G.renderer) G.renderer.sel = i;
        UI.setPanel('mergeChoose', { slot: i, opts });
        return;
      }
    }
    const tierFrom = G.run.board[i] ? G.run.board[i].tier : 0;
    const res = b.merge(i, pick);
    if (!res) {
      // 고른 후보가 코어의 후보와 다르면(스택이 바뀐 사이 등) 후보를 다시 받아 패널을 연다
      forgetMergeOpts(b, i);
      if (pick && b.M.mergeChoose && RS.canMerge(G.run.board, i)) {
        const opts = UI.mergeOptsFor(b, i);
        if (opts && opts.length) {
          UI.setPanel('mergeChoose', { slot: i, opts });
          return;
        }
      }
      UI.select(G.run.board[i] ? i : -1);
      UI.updateHud(true);
      return;
    }
    forgetMergeOpts(b, i);
    UI.tutDone('merge');
    if (res.fail) {
      RS.sfx('error');
      UI.toast('합성 실패…', 'warn');
    } else {
      const r = res.results[0];
      RS.sfx(r && r.tier >= 3 ? 'legend' : 'merge');
      if (r) UI.toast(`${res.double ? '대성공! ' : ''}${RS.TIER[r.tier].name} ${RS.CLASS[r.cls].name}${res.results.length > 1 ? ' ×2' : ''}`, 't' + r.tier);
      if (res.refund) UI.toast('재활용: 재료 1기 반환', 'good');
    }
    const next = res.results.length ? res.results[0].slot : -1;
    UI.select(G.run.board[i] && G.run.board[i].tier === tierFrom ? i : next);
    UI.updateHud(true);
  };

  UI.doMergeAll = function () {
    const G = UI.G;
    const b = G.battle;
    if (!b) return;
    if (RS.firstMergeable(G.run.board) < 0) {
      RS.sfx('error');
      UI.toast('합성할 칸이 없어요 (같은 칸에 같은 유닛 3기)', 'warn');
      return;
    }
    // 고대 두루마리: 칸마다 결과를 골라야 하므로 첫 칸의 선택 패널을 연다
    if (b.M.mergeChoose) {
      const i = RS.firstMergeable(G.run.board);
      UI.doMerge(i);
      return;
    }
    let count = 0;
    let i;
    let guard = 0;
    while ((i = RS.firstMergeable(G.run.board)) >= 0 && guard++ < 30) {
      const res = b.merge(i);
      if (res) count++;
      else break;
    }
    if (count) {
      RS.sfx('merge');
      UI.tutDone('merge');
      UI.toast(`${count}번 합성했어요`);
    }
    UI.select(-1);
    UI.updateHud(true);
  };

  function doSell(i) {
    const G = UI.G;
    const b = G.battle;
    if (!b) return;
    if (G.run.board[i] && G.run.board[i].sealed) {
      RS.sfx('error');
      UI.toast('봉인된 유닛은 팔거나 합성할 수 없어요 (장막을 깨면 풀려요)', 'warn');
      return;
    }
    const v = b.sell(i);
    if (v) {
      RS.sfx('coin');
      UI.toast(`+${v}G`);
    }
    UI.select(G.run.board[i] ? i : -1);
    UI.updateHud(true);
  }

  UI.panelMode = 'idle';
  UI.setPanel = function (mode, data) {
    const G = UI.G;
    // 사용·닫기 버튼 자리에 합성·판매 버튼이 바로 그려지므로 연타가 새 버튼을 누르지 않게 잠깐 막는다
    if (UI.panelMode !== mode && (UI.panelMode === 'item' || UI.panelMode === 'mergeChoose' || UI.panelMode === 'upgrade') && UI.lockInput) UI.lockInput(250);
    UI.panelMode = mode;
    UI.panelData = data || null;
    UI.panelSig = null;
    const p = $('#panel');
    p.innerHTML = '';
    p.className = 'panel-' + mode;
    UI.panelRefs = {};
    if (UI.hudCache) {
      UI.hudCache.coach = null;
      UI.hudCache.coachOn = null;
    }
    const b = G.battle;
    const run = G.run;
    if (!b) return;
    if (mode === 'idle') {
      const refs = UI.panelRefs;
      append(p, h('div', { class: 'pidle' },
        h('div', { class: 'pstat' }, h('span', null, '전체 DPS'), (refs.dps = h('b', null, '0'))),
        h('div', { class: 'pstat' }, h('span', null, '유닛'), (refs.units = h('b', null, '0'))),
        h('div', { class: 'pstat' }, h('span', null, b.M.summonCap ? '남은 소환' : '다음 이자'), (refs.int = h('b', null, '0'))),
        (refs.hint = h('p', { class: 'phint' }, '칸을 눌러 정보 보기 · 끌어서 자리 바꾸기')),
      ));
    } else if (mode === 'unit') {
      const i = UI.sel;
      const s = run.board[i];
      if (!s) return UI.setPanel('idle');
      const C = RS.CLASS[s.cls];
      const T = RS.TIER[s.tier];
      const refs = UI.panelRefs;
      const canMerge = RS.canMerge(run.board, i);
      UI.panelSig = unitSig(run, i);
      const sv = UI.sellValueAt(b, i);
      const sellBtn = s.tier >= 2
        ? UI.btn2(`판매 +${sv}`, `한 번 더: 판매 +${sv}`, () => doSell(i))
        : btn(`판매 +${sv}`, () => doSell(i));
      append(p, h('div', { class: 'punit' },
        unitImg(s.cls, s.tier, 'big'),
        h('div', { class: 'pinfo' },
          h('div', { class: 'pname' }, h('b', { class: 'tier' + s.tier }, `${T.name} ${C.name}`), ` ×${s.n}`,
            run.runes[i] && RS.RUNE[run.runes[i]] ? h('span', { class: 'runebadge' + (RS.RUNE[run.runes[i]].bad ? ' bad' : ''), style: `--rune:${RS.RUNE[run.runes[i]].color}` }, RS.RUNE[run.runes[i]].name) : null,
            (refs.dps = h('span', { class: 'pdps' }))),
          (refs.stats = h('div', { class: 'pstats' })),
          (refs.desc = h('p', { class: 'pdesc' })),
        ),
        h('div', { class: 'pbtns' },
          btn(s.tier >= RS.TOP_TIER ? '최고 등급' : canMerge ? '합성' : `합성 ${s.n}/${RS.mergeNeed(s.tier)}`, () => UI.doMerge(i), canMerge ? 'gold' : '', !canMerge),
          (refs.sell = sellBtn),
        ),
      ));
      refs.baseDesc = s.sealed
        ? '봉인됨: 싸우지 못해요. 보스의 장막을 깨면 풀려나요'
        : s.tier >= 4 && RS.MYTHIC[s.cls]
        ? `[${RS.MYTHIC[s.cls].name}] ${RS.MYTHIC[s.cls].short}`
        : run.runes[i] && RS.RUNE[run.runes[i]] ? `${RS.RUNE[run.runes[i]].name}: ${RS.RUNE[run.runes[i]].desc}` : `${C.role} · ${C.desc}`;
      UI.refreshUnitStats();
    } else if (mode === 'upgrade') {
      const refs = (UI.panelRefs = { rows: {} });
      const grid = h('div', { class: 'upg-grid' });
      for (const c of RS.CLASSES) {
        const el = h('button', {
          class: 'upg',
          'aria-label': `${RS.CLASS[c].name} 강화`,
          title: `${RS.CLASS[c].name} 강화`,
          onclick() {
            const r = b.upgrade(c);
            if (r.err) {
              RS.sfx('error');
              UI.toast(r.err === 'locked' ? '홀림 귀고리: 준비 시간에는 강화할 수 없어요' : r.err === 'gold' ? '골드가 부족해요' : '지금은 강화할 수 없어요', 'warn');
            } else {
              RS.sfx('upgrade');
            }
            UI.updateHud(true);
          },
        }, unitImg(c, 0), h('b', { class: 'lv' }), h('span', { class: 'cost' }));
        refs.rows[c] = el;
        grid.appendChild(el);
      }
      append(p, h('div', { class: 'pupg' }, grid));
    } else if (mode === 'item') {
      const idx = data.idx;
      const it = RS.ITEM[run.items[idx]];
      if (!it) return UI.setPanel('idle');
      append(p, h('div', { class: 'pitem' },
        icon(it.icon, 'big', 4),
        h('div', { class: 'pinfo' }, h('b', null, it.name), h('p', { class: 'pdesc' }, it.desc + (b.M.itemPotency ? ' (효과 2배)' : ''))),
        h('div', { class: 'pbtns' },
          btn('사용', () => {
            const r = b.useItem(idx);
            if (r.err) {
              RS.sfx('error');
              UI.toast(r.err === 'full' ? '빈자리가 없어요' : '쓸 수 없어요', 'warn');
              return;
            }
            RS.sfx(it.id === 'bomb' ? 'bomb' : it.id === 'freeze' ? 'freeze' : 'upgrade');
            UI.toast(`${it.name} 사용!`, 'good');
            UI.renderItems();
            UI.closePanel();
            UI.updateHud(true);
          }, 'gold'),
          btn('닫기', () => UI.closePanel()),
        ),
      ));
    } else if (mode === 'mergeChoose') {
      const tier = Math.min(3, (run.board[data.slot] ? run.board[data.slot].tier : 0) + 1);
      append(p, h('div', { class: 'pchoose' },
        h('p', { class: 'phint' }, '고대 두루마리: 합성 결과를 고르세요'),
        h('div', { class: 'row2' },
          data.opts.map((c) => h('button', {
            class: 'btn choose',
            onclick() {
              RS.sfx('click');
              UI.doMerge(data.slot, c);
            },
          }, unitImg(c, tier), RS.CLASS[c].name)),
          btn('닫기', () => UI.closePanel(), 'sm'),
        ),
      ));
    }
  };

  function unitSig(run, i) {
    const s = run.board[i];
    return s ? `${i}/${s.cls}/${s.tier}/${s.n}/${RS.canMerge(run.board, i)}/${run.runes[i] || ''}/${s.sealed ? 1 : 0}` : '';
  }

  UI.refreshUnitStats = function () {
    const G = UI.G;
    const refs = UI.panelRefs;
    const b = G.battle;
    if (!refs || !refs.stats || !b) return;
    const i = UI.sel;
    const s = G.run.board[i];
    if (!s) return;
    if (b.statsDirty) b.computeSlotStats();
    const st = b.slotStats[i];
    if (!st) return;
    const reach = UI.reaches(st, i);
    const parts = [`피해 ${fmtK(st.dmg)}`, `${(1 / st.interval).toFixed(1)}회/초`, `사거리 ${Math.round(st.range)}`];
    if (st.crit > 0) parts.push(`치명 ${pct(Math.min(1, st.crit))}`);
    if (st.splash) parts.push(`범위 ${st.splash}`);
    if (st.slow) parts.push(`둔화 ${pct(st.slow)}`);
    if (st.shots > 1) parts.push(`${st.shots}발`);
    const text = parts.join(' · ');
    if (refs.stats.textContent !== text) refs.stats.textContent = text;
    const dps = reach ? `DPS ${fmtK(st.dps * s.n)}` : 'DPS 0';
    if (refs.dps && refs.dps.textContent !== dps) refs.dps.textContent = dps;
    if (refs.dps && refs.reach !== reach) {
      refs.reach = reach;
      refs.dps.classList.toggle('bad', !reach);
      refs.desc.classList.toggle('bad', !reach);
      refs.desc.textContent = reach ? refs.baseDesc : '사거리가 길에 닿지 않아요 · 바깥 칸으로 옮기거나 [정리]';
    }
    if (refs.sell && !refs.sell.classList.contains('arm')) {
      const t = `판매 +${UI.sellValueAt(b, i)}`;
      if (refs.sell.textContent !== t) refs.sell.textContent = t;
    }
  };

  UI.renderItems = function () {
    const G = UI.G;
    const bar = $('#itembar');
    bar.innerHTML = '';
    const run = G.run;
    const b = G.battle;
    const slots = RS.itemSlots(run);
    // 칸이 많으면(보급 허리띠·연금 솥·별) 칸과 버튼을 조금 줄인다
    UI.itemTight = slots + (b && b.M.stars ? 2 : 0) >= 6;
    bar.classList.toggle('tight', UI.itemTight);
    for (let k = 0; k < slots; k++) {
      const id = run.items[k];
      if (id) {
        const it = RS.ITEM[id];
        bar.appendChild(h('button', {
          class: 'islot',
          'aria-label': it.name,
          onclick() {
            RS.sfx('click');
            UI.setPanel('item', { idx: k });
          },
        }, icon(it.icon, '', 3)));
      } else {
        bar.appendChild(h('button', {
          class: 'islot empty',
          'aria-label': '빈 소모품 칸',
          onclick(e) {
            UI.tip(e.currentTarget, '소모품 칸', '상점·보상에서 얻은 소모품(폭탄·얼음 등)을 전투 중에 눌러 씁니다.');
          },
        }));
      }
    }
    bar.appendChild(h('div', { class: 'spacer' }));
    UI.starBtn = null;
    if (b && b.M.stars) {
      // 별의 섭정: 별을 모아 별똥별
      UI.starBtn = btn('★ 0/3', () => {
        const bb = G.battle;
        if (!bb || !bb.starfall()) {
          RS.sfx('error');
          UI.toast(bb && bb.stars >= (bb.starCost || 3) ? '적이 있을 때 쓸 수 있어요' : `별이 ${(bb && bb.starCost) || 3}개 모여야 해요 (웨이브마다 1개, 최대 ${bb ? UI.starMax(bb) : 5}개)`, 'warn');
          return;
        }
        RS.sfx('bomb');
        UI.toast('별똥별!', 'good');
        UI.updateHud(true);
      }, 'sm star');
      UI.starBtn.setAttribute('aria-label', '별똥별');
      bar.appendChild(UI.starBtn);
    }
    UI.mergeAllBtn = btn(UI.itemTight ? '합성' : '모두 합성', () => UI.doMergeAll(), 'sm mall off');
    UI.mergeAllBtn.setAttribute('aria-label', '모두 합성');
    bar.appendChild(UI.mergeAllBtn);
    // 칸이 많으면 '빌드'는 뺀다 (일시정지 메뉴에 있다)
    if (slots <= 3 && !(b && b.M.stars)) bar.appendChild(btn('빌드', () => UI.openBuild(), 'sm'));
  };

  const setText = (el, key, v) => {
    if (UI.hudCache[key] !== v) {
      UI.hudCache[key] = v;
      el.textContent = v;
    }
  };
  const setCls = (el, key, cls, on) => {
    if (UI.hudCache[key] !== on) {
      UI.hudCache[key] = on;
      el.classList.toggle(cls, on);
    }
  };

  UI.updateHud = function (force) {
    const G = UI.G;
    const b = G.battle;
    const run = G.run;
    if (!b || !run) return;
    if (force || !UI.hudCache) UI.hudCache = {};
    const c = UI.hudCache;
    const blind = !!b.M.blindfold;
    setText($('#h-life-v'), 'life', `${Math.ceil(run.life)}/${run.maxLife}`);
    // 좁은 화면(360px 이하)에서는 네 자리부터 줄여 쓴다
    setText($('#h-gold-v'), 'gold', run.gold >= (window.innerWidth <= 360 ? 1000 : 10000) ? fmtK(run.gold) : fmt(run.gold));
    const cap = RS.interestCap(b.M);
    const inter = Math.min(cap, Math.floor(run.gold / RS.BAL.interestPer));
    setText($('#h-foe-v'), 'foe', `${b.enemies.length}/${b.cap}`);
    setCls($('#h-foe'), 'danger', 'danger', b.enemies.length >= b.cap * 0.7);
    setCls($('#h-life'), 'low', 'danger', run.life <= run.maxLife * 0.3);
    const nW = b.stage.waves.length;
    const tl = b.prep > 0 ? null : trialLeft(b);
    if (b.prep > 0) {
      setText($('#h-wave-v'), 'wv', '준비');
      setText($('#h-wave-t'), 'wt', blind ? '?' : `${Math.ceil(b.prep)}초`);
    } else if (tl != null) {
      setText($('#h-wave-v'), 'wv', '시험');
      setText($('#h-wave-t'), 'wt', `${Math.max(0, Math.ceil(tl))}초`);
    } else {
      setText($('#h-wave-v'), 'wv', `${b.waveIdx}/${nW}`);
      setText($('#h-wave-t'), 'wt', b.waveIdx < nW ? (blind ? '?' : `${Math.max(0, Math.ceil(b.waveT))}초`) : '마지막');
    }
    setCls($('#h-wave'), 'urgent', 'urgent', tl != null && tl <= 10);
    const cost = b.summonCost();
    setText($('#summon-cost'), 'cost', b.summonLimit() <= 0 ? '제한' : `${cost}G`);
    setCls($('#b-summon'), 'canS', 'off', !(run.gold >= cost && b.summonLimit() > 0));
    setText($('#b-speed'), 'spd', `x${G.speed}`);
    if (UI.starBtn) {
      setText(UI.starBtn, 'star', `★ ${b.stars}/${b.starCost || 3}`);
      setCls(UI.starBtn, 'starOn', 'off', !b.canStarfall());
    }
    // 합성 가능한 칸 수 + 길에 닿지 않는 칸 (0.1초마다 20칸)
    let mergeable = 0;
    if (b.statsDirty) b.computeSlotStats();
    const R = G.renderer;
    const noReach = R && (R.noReach || (R.noReach = new Uint8Array(F.SIZE)));
    for (let i = 0; i < F.SIZE; i++) {
      const s = run.board[i];
      if (s && RS.canMerge(run.board, i)) mergeable++;
      if (noReach) noReach[i] = s && b.slotStats[i] && !UI.reaches(b.slotStats[i], i) ? 1 : 0;
    }
    if (UI.mergeAllBtn) {
      setText(UI.mergeAllBtn, 'mall', `${UI.itemTight ? '합성' : '모두 합성'}${mergeable ? ' ' + mergeable : ''}`);
      if (c.mallOn !== mergeable > 0) {
        c.mallOn = mergeable > 0;
        UI.mergeAllBtn.classList.toggle('gold', mergeable > 0);
        UI.mergeAllBtn.classList.toggle('off', !mergeable);
      }
    }
    // 보스
    updateBossBar(b, c, blind);
    // 패널
    const refs = UI.panelRefs || {};
    if (UI.panelMode === 'idle' && refs.dps) {
      setText(refs.dps, 'pdps', fmtK(UI.effDps(b)));
      setText(refs.units, 'punits', `${RS.boardUnitCount(run.board)}/60`);
      if (b.M.summonCap) setText(refs.int, 'pint', `${b.summonLimit()}회`);
      else setText(refs.int, 'pint', inter > 0 ? `+${inter + (b.M.interestBonus || 0)}G` : '10G당 1');
    } else if (UI.panelMode === 'unit') {
      if (!run.board[UI.sel]) UI.select(-1);
      else if (unitSig(run, UI.sel) !== UI.panelSig) UI.setPanel('unit');
      else UI.refreshUnitStats();
    } else if (UI.panelMode === 'mergeChoose') {
      if (!UI.panelData || !RS.canMerge(run.board, UI.panelData.slot)) UI.closePanel();
    } else if (UI.panelMode === 'upgrade' && refs.rows) {
      const step = b.M.upgradeDouble ? 2 : 1;
      for (const cl of RS.CLASSES) {
        const el = refs.rows[cl];
        const lv = run.classLv[cl];
        const cst = b.upgradeCost(cl);
        setText(el.querySelector('.lv'), 'lv' + cl, `Lv ${lv}→${lv + step}`);
        setText(el.querySelector('.cost'), 'uc' + cl, cst ? `${cst}G` : '무료');
        setCls(el, 'uo' + cl, 'off', run.gold < cst);
      }
    }
    UI.coach(b, mergeable);
  };

  function updateBossBar(b, c, blind) {
    const bb = $('#bossbar');
    if (b.boss) {
      if (bb.hidden || c.bwait !== false) {
        c.bwait = false;
        bb.classList.remove('wait');
        if (bb.hidden) {
          bb.hidden = false;
          UI.bossReserved = true;
          UI.fitCanvas();
        }
      }
      const alive = b.bosses.filter((x) => !x.dead).length;
      setText($('#boss-name'), 'bname', b.boss.def.name + (alive > 1 ? ` 외 ${alive - 1}` : ''));
      const w = blind ? '100%' : Math.max(0, (b.boss.hp / b.boss.maxHp) * 100).toFixed(1) + '%';
      if (c.bhp !== w) {
        c.bhp = w;
        $('#boss-hp').style.width = w;
      }
      // 보호막은 체력바 위에 하늘색으로 (최대 체력 대비)
      const sh = blind || !(b.boss.shield > 0) ? '0%' : Math.min(100, (b.boss.shield / b.boss.maxHp) * 100).toFixed(1) + '%';
      if (c.bsh !== sh) {
        c.bsh = sh;
        $('#boss-sh').style.width = sh;
      }
      setText($('#boss-t'), 'bt', b.enraged ? '폭주!' : blind ? '??' : `${Math.ceil(b.bossTimer)}초`);
      setCls(bb, 'enr', 'enraged', !!b.enraged);
      const fr = b.boss.hp / b.boss.maxHp;
      const ticks = $('#boss-ticks').children;
      for (let j = 0; j < ticks.length; j++) setCls(ticks[j], 'tk' + j, 'done', fr < parseFloat(ticks[j].style.left) / 100);
      updateCastBar(b, c);
    } else if (!bb.hidden && b.bosses && b.bosses.length) {
      // 보스를 쓰러뜨렸다: 바는 그대로 두어 캔버스 크기가 바뀌지 않게 한다
      setText($('#boss-t'), 'bt', '처치!');
      if (c.bhp !== '0%') {
        c.bhp = '0%';
        $('#boss-hp').style.width = '0%';
      }
      setCls(bb, 'enr', 'enraged', false);
    }
  }

  // 보스 바 아래 기술 예고: 무엇을·언제 쓰는지 (잠든 동안은 남은 시간)
  const CAST_TXT = {
    glue: '표시된 칸이 느려져요',
    pulse: '모든 유닛이 느려져요',
    shield: '보호막을 둘러요 · 먼저 깨야 체력이 깎여요',
    seal: '보호막 + 표시된 유닛 봉인 · 장막을 깨면 풀려요',
    spawn: '부하를 불러요',
    rally: '모든 적이 빨라져요',
    mend: '체력을 회복해요',
    cross: '붉은 선을 따라 돌진! 지나는 칸 기절',
    shuffle: '같은 색 칸끼리 유닛 자리가 바뀌어요',
    plunder: '골드를 빼앗아요 · 지금 써 버리면 안 뺏겨요!',
    doze: '곧 잠들어요: 멈추고 회복하지만 피해를 더 받아요',
    rift: '표시된 칸이 기절해요',
    submerge: '물속에 숨어 공격을 피해요',
    anchor: '표시된 열이 기절해요',
  };
  const CAST_NAME = { rift: '균열', spawn: '소환', glue: '점액' };
  function updateCastBar(b, c) {
    const el = $('#boss-cast');
    const e = b.boss;
    let cast = null;
    let k = '';
    let name = '';
    let txt = '';
    let frac = 0;
    let col = '';
    if (e.dozeT > 0) {
      k = 'dozing';
      name = `깊은 잠 ${e.dozeT.toFixed(1)}`;
      txt = `멈춰서 회복 중 · 지금은 피해를 ${e.dozeCap || 1}배 받아요!`;
      frac = e.dozeT / (e.dozeT0 || 1);
      col = '#9ee06a';
    } else if ((cast = RS.castOf && RS.castOf(e)) && cast.T > 0) {
      k = cast.k;
      name = `${cast.name || CAST_NAME[k] || '기술'} ${Math.max(0, cast.t).toFixed(1)}`;
      txt = CAST_TXT[k] || '';
      frac = 1 - cast.t / cast.T;
      col = RS.CAST_COL[k] || '#ffe46b';
    }
    if (!k) {
      // 쉬는 동안: 다음에 쓸 기술과 남은 시간 (이름 있는 기술만)
      const sk = e.def.skills;
      let best = -1;
      if (sk && e.sk) for (let j = 0; j < sk.length; j++) if (sk[j].name && sk[j].k !== 'blink' && (best < 0 || e.sk[j] < e.sk[best])) best = j;
      if (best >= 0) {
        name = '다음';
        txt = `${sk[best].name} · ${Math.max(0, Math.ceil(e.sk[best]))}초`;
      } else if (e.def.trait) {
        name = '특성';
        txt = e.def.trait;
      }
    }
    setCls(el, 'cidle', 'idle', !k);
    let plw = false;
    for (const o of b.bosses) if (!o.dead && o.cast && o.cast.s.k === 'plunder') plw = true;
    setCls($('#h-gold'), 'plw', 'plunder', plw);
    setText(el.querySelector('b'), 'cn', name);
    setText(el.querySelector('span'), 'ct', txt);
    if (c.ccol !== col) {
      c.ccol = col;
      el.style.setProperty('--cc', col);
    }
    if (!k) return;
    const w = (Math.max(0, Math.min(1, frac)) * 100).toFixed(0) + '%';
    if (c.cw !== w) {
      c.cw = w;
      el.querySelector('i').style.width = w;
    }
    setCls(el, 'cnow', 'now', k !== 'dozing' && frac > 0.65);
  }

  // 전투 이벤트 → 소리·토스트
  // 보스 기술 이름 옆에 붙는 짧은 설명 (전투마다 기술별로 처음 한 번만 띄운다)
  const SKILL_HINT = {
    glue: '표시된 칸의 공격이 곧 느려져요',
    cross: '붉은 선을 따라 곧 보드를 가로질러요! 지나가는 칸의 유닛은 기절, 도착한 사도도 잠시 기절',
    shuffle: '같은 색으로 표시된 칸끼리 곧 유닛 자리가 바뀌어요',
    plunder: '곧 골드를 빼앗아요. 그 전에 소환·강화로 써 버리면 덜 뺏겨요!',
    pulse: '곧 모든 유닛이 잠깐 느려져요',
    shield: '보호막을 두르면 먼저 깨야 체력이 깎여요',
    seal: '보랏빛으로 조준된 유닛이 곧 봉인돼요(높은 등급일수록 잘 걸림, 신화는 면역). 장막을 깨면 풀려요',
    spawn: '부하를 불러요',
    rally: '곧 모든 적이 잠깐 빨라져요',
    mend: '곧 체력을 회복해요',
    doze: '곧 잠들어 멈춰 서서 회복해요. 대신 그동안은 피해를 훨씬 많이 받아요. 몰아칠 때!',
    rift: '표시된 칸이 곧 기절해요',
    submerge: '곧 물속에 숨어 잠시 공격받지 않아요',
    anchor: '표시된 열이 곧 기절해요',
  };
  const SKILL_SFX = { glue: 'glue', pulse: 'heartbeat', shield: 'shield', spawn: 'boss', rally: 'wave', mend: 'coin', cross: 'charge', shuffle: 'blink', plunder: 'error' };
  UI.onFx = function (ev) {
    switch (ev.k) {
      case 'bossSkill':
        RS.sfx(SKILL_SFX[ev.id] || 'boss');
        break;
      case 'castStart': {
        // 기술 예고: 처음 보는 기술이면 무엇이 오는지 한 번 설명한다
        const b = UI.G.battle;
        if (ev.t > 0.6 && ev.id !== 'cross') RS.sfx('cast');
        const nm = ev.name || CAST_NAME[ev.id];
        const key = ev.seal ? 'seal' : ev.id;
        if (b && nm && ev.id !== 'spawn') {
          b.skillSeen = b.skillSeen || {};
          if (!b.skillSeen[nm]) {
            b.skillSeen[nm] = true;
            UI.toast(`${ev.boss} · ${nm}: ${SKILL_HINT[key] || CAST_TXT[key] || ''}`, 'warn');
          }
        } else if (b && ev.name && ev.id === 'spawn') {
          b.skillSeen = b.skillSeen || {};
          if (!b.skillSeen[nm]) {
            b.skillSeen[nm] = true;
            UI.toast(`${ev.boss} · ${nm}: ${SKILL_HINT.spawn}`, 'warn');
          }
        }
        break;
      }
      case 'doze':
        RS.sfx('doze');
        break;
      case 'wake':
        RS.sfx('heartbeat');
        break;
      case 'capHit':
        UI.toast('고대의 몸: 1초에 최대 체력의 3%까지만 피해가 들어가요. 잠들었을 때 몰아치세요!', 'warn');
        break;
      case 'shieldBreak':
        RS.sfx('shieldBreak');
        if (ev.boss) UI.toast('보호막을 깼다!', 'good');
        break;
      case 'seal':
        RS.sfx('seal');
        UI.toast(`${ev.boss}이(가) 유닛 ${ev.slots.length}칸을 봉인했다! 장막을 깨면 풀려나요`, 'warn');
        break;
      case 'unseal':
        RS.sfx('unseal');
        UI.toast(ev.reason === 'break' ? '장막이 깨져 봉인이 풀렸다! 유닛이 다시 싸워요' : '봉인이 저절로 풀렸다', 'good');
        break;
      case 'plunder':
        UI.hudFloat($('#h-gold'), `-${ev.g}G`, 'bad');
        break;
      case 'crossGo':
        RS.sfx('big');
        break;
      case 'blink':
        RS.sfx('blink');
        break;
      case 'phase2':
        RS.sfx('boss');
        break;
      case 'wave': {
        RS.sfx('wave');
        const g = (ev.gold || 0) + (ev.interest || 0);
        if (g > 0) UI.hudFloat($('#h-gold'), `+${g}G`, 'good');
        break;
      }
      case 'boss':
        RS.sfx('boss');
        RS.bgm('boss');
        UI.toast(`${ev.name} 등장!`, 'warn');
        break;
      case 'bossDown':
        RS.sfx('big');
        UI.toast('보스 처치!', 'good');
        break;
      case 'msg':
        UI.toast(ev.text, ev.warn ? 'warn' : '');
        break;
      case 'shot':
        if (RS.sfxAttack) RS.sfxAttack(ev.cls, ev.crit);
        break;
      case 'mythic': {
        if (ev.quiet) break;
        RS.sfx(ev.cls === 'mage' ? 'bomb' : ev.cls === 'frost' ? 'freeze' : ev.cls === 'archer' ? 'rare' : 'big');
        // 전투마다 클래스별로 처음 한 번만 이름을 띄운다
        const b = UI.G.battle;
        if (b) {
          b.mythicSeen = b.mythicSeen || {};
          if (!b.mythicSeen[ev.cls]) {
            b.mythicSeen[ev.cls] = true;
            UI.toast(`신화 스킬 · ${RS.MYTHIC[ev.cls].name}!`, 't4');
          }
        }
        break;
      }
      case 'kill':
        RS.sfx(ev.big ? 'big' : 'kill');
        break;
      case 'leak':
        RS.sfx('leak');
        if (ev.v > 0) {
          const el = $('#h-life');
          el.classList.remove('hit');
          void el.offsetWidth;
          el.classList.add('hit');
          clearTimeout(UI.hitTimer);
          UI.hitTimer = setTimeout(() => el.classList.remove('hit'), 300);
          UI.hudFloat(el, '-' + Math.round(ev.v * 10) / 10, 'bad');
          const t = tut();
          if (!t.off && !t.leak) {
            UI.toast('적이 한 바퀴 돌아 균열로 들어가면 생명이 줄어요', 'warn');
            UI.tutDone('leak');
          }
        }
        break;
      case 'summon':
        if (ev.free) RS.sfx('summon');
        break;
      case 'won':
        RS.bgm(null);
        if (UI.G.battle && UI.G.battle.trialFailed) {
          RS.sfx('lose');
          break;
        }
        RS.sfx('win');
        UI.toast('승리!', 'good');
        break;
      case 'lost':
        RS.bgm(null);
        RS.sfx('lose');
        UI.toast(ev.reason === 'cap' ? '적이 너무 많습니다!' : '생명이 다했습니다', 'warn');
        break;
    }
  };
})((globalThis.RS = globalThis.RS || {}));
