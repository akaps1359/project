// 게임 진행 제어: 루프, 저장, 화면 전환, 메타 기록
(function (RS) {
  'use strict';

  const STEP = 1 / 60;
  const MAX_STEPS = 12;
  const SAVE_KEY = 'rs_save_v2';
  const META_KEY = 'rs_meta_v1';
  const SPEED_KEY = 'rs_speed';

  function store(k, v) {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) {
      /* 개인 정보 보호 모드 등: 저장 없이 진행 */
    }
  }
  function load(k) {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  }

  const G = (RS.G = {
    run: null, battle: null, renderer: null,
    speed: 1, paused: false, modalOpen: false, hidden: false,
    meta: { runs: 0, wins: 0, bestAct: 0, bestFloor: 0, maxAsc: 0, wongo: 0, tut: {} },
    rotated: false,
    last: 0, acc: 0, hudT: 0, wake: null,
  });
  const UI = RS.UI;
  UI.G = G;

  function loadMeta() {
    try {
      const m = JSON.parse(load(META_KEY) || 'null');
      if (m) Object.assign(G.meta, m);
    } catch (e) {
      /* 손상된 기록은 무시 */
    }
    if (!G.meta.tut || typeof G.meta.tut !== 'object') G.meta.tut = {};
  }
  G.saveMeta = function () {
    store(META_KEY, JSON.stringify(G.meta));
  };

  function unlockState(m) {
    return { cmds: RS.COMMANDERS.filter((c) => RS.commanderUnlocked(c, m)).map((c) => c.id), asc: m.maxAsc || 0 };
  }
  function unlockMessages(before, m) {
    const out = [];
    for (const c of RS.COMMANDERS) {
      if (RS.commanderUnlocked(c, m) && before.cmds.indexOf(c.id) < 0) out.push(`지휘관 ${c.title} ${c.name}`);
    }
    if ((m.maxAsc || 0) > before.asc) out.push(`승천 ${m.maxAsc}`);
    return out;
  }
  // 클리어 기록: 3막 보스를 쓰러뜨리면(4막에 들어서면) 그 자리에서 센다
  function recordClear(run, m) {
    if (run.clearRecorded) return;
    run.clearRecorded = true;
    m.wins = (m.wins || 0) + 1;
    if (run.asc >= (m.maxAsc || 0)) m.maxAsc = Math.min(RS.MAX_ASC, run.asc + 1);
  }
  // 진행 기록: 새 막에 들어서는 순간 최고 기록과 해금을 남긴다 (모험이 끝나기 전에도)
  function recordProgress(run) {
    const m = G.meta;
    const before = unlockState(m);
    // 4막까지 갔다면 3막을 끝까지 오른 것으로 기록
    const act = Math.min(3, run.act);
    const floor = run.act > 3 ? RS.FLOORS_PER_ACT : run.floor;
    let changed = false;
    if (act > (m.bestAct || 0) || (act === m.bestAct && floor > (m.bestFloor || 0))) {
      m.bestAct = act;
      m.bestFloor = floor;
      changed = true;
    }
    if (run.act >= 4 && !run.clearRecorded) {
      recordClear(run, m);
      changed = true;
    }
    if (changed) G.saveMeta();
    const out = unlockMessages(before, m);
    if (out.length) {
      run.newUnlocks = (run.newUnlocks || []).concat(out);
      for (const u of out) UI.toast('해금 · ' + u, 'good');
    }
    return out;
  }

  // 모험이 끝날 때(또는 버릴 때) 기록하고, 이번 모험에서 새로 열린 것을 돌려준다
  function recordEnd(run, won) {
    const m = G.meta;
    recordProgress(run);
    const before = unlockState(m);
    if (won) recordClear(run, m);
    // 진 엔딩은 심장을 실제로 부쉈을 때만
    if (won && run.act === 4) m.heart = true;
    m.wongo = (m.wongo || 0) + Math.floor((run.stats.wongo || 0) / 10);
    G.saveMeta();
    const out = unlockMessages(before, m);
    if (out.length) run.newUnlocks = (run.newUnlocks || []).concat(out);
    return (run.newUnlocks || []).slice();
  }

  G.savedRun = function () {
    const s = load(SAVE_KEY);
    if (!s) return null;
    try {
      return RS.loadString(s);
    } catch (e) {
      return null;
    }
  };

  G.save = function () {
    const run = G.run;
    if (!run) return;
    if (run.phase === 'over' || run.phase === 'victory') store(SAVE_KEY, null);
    else {
      recordProgress(run);
      store(SAVE_KEY, RS.saveString(run));
    }
  };

  // 저장된 모험을 버리고 새로 시작할 때: 지금까지의 진행은 기록에 남긴다
  G.abandonSaved = function () {
    const run = G.savedRun();
    if (run && !run.recorded) {
      run.recorded = true;
      recordEnd(run, false);
    }
    store(SAVE_KEY, null);
  };

  function resetSelections() {
    UI.optSel = null;
    UI.choiceSel = null;
    UI.rewardSel = null;
    UI.shopSel = null;
    UI.restTrain = false;
    UI.mapArmed = null;
  }

  G.newRun = function (seed, opts) {
    resetSelections();
    G.run = RS.newRun(seed, opts);
    G.meta.runs++;
    G.saveMeta();
    G.save();
    G.route();
  };

  G.continueRun = function () {
    const run = G.savedRun();
    if (!run) return UI.showCommanders();
    resetSelections();
    G.run = run;
    G.route();
  };

  G.route = function () {
    const run = G.run;
    releaseWake();
    // 상황별 배경 음악 (고르기 화면은 이전 곡을 이어 간다)
    const BGM = { neow: 'event', map: 'map', reward: 'map', treasure: 'map', shop: 'shop', event: 'event', rest: 'rest', actStart: 'event', over: 'lose', victory: 'win' };
    if (BGM[run.phase]) RS.bgm(BGM[run.phase]);
    switch (run.phase) {
      case 'neow': UI.showNeow(); break;
      case 'map': UI.showMap(); break;
      case 'battle': G.startBattle(); break;
      case 'reward': UI.showReward(); break;
      case 'shop': UI.showShop(); break;
      case 'event': UI.showEvent(); break;
      case 'rest': UI.showRest(); break;
      case 'treasure': UI.showTreasure(); break;
      case 'actStart': UI.showActStart(); break;
      case 'choice': UI.showChoice(); break;
      case 'over':
      case 'victory': {
        if (!run.recorded) {
          run.recorded = true;
          recordEnd(run, run.phase === 'victory');
        }
        UI.showEnd(run.phase === 'victory', (run.newUnlocks || []).slice());
        break;
      }
    }
  };

  // 진행 한 걸음: 상태를 바꾸고, 쌓인 선택(증강 고르기 등)을 먼저 처리한 뒤 저장
  const step = (fn) => (...args) => {
    fn(...args);
    RS.flushQueue(G.run);
    G.save();
    G.route();
  };

  G.afterNeow = step(() => {
    G.run.phase = 'map';
    G.run.pending = null;
  });
  G.enterNode = step((f, lane, wing) => RS.enterNode(G.run, f, lane, wing));
  G.leaveNode = step(() => RS.advance(G.run));
  G.afterReward = step(() => {
    if (RS.rewardComplete(G.run)) RS.advance(G.run);
  });
  G.startAct = step(() => {
    G.run.phase = 'map';
    G.run.pending = null;
  });
  G.startEventFight = step(() => RS.startEventFight(G.run));
  G.finishChoice = function () {
    RS.popQueue(G.run);
    G.save();
    G.route();
  };

  G.startBattle = function () {
    const run = G.run;
    G.battle = new RS.Battle(run, run.pending.stage);
    RS.bgm(run.pending.stage.type === 'boss' ? 'boss' : 'battle');
    G.renderer.reset();
    G.renderer.setTheme(RS.actDef(run).theme);
    G.acc = 0;
    G.paused = false;
    UI.showBattle();
    requestWake();
  };

  G.endBattle = function () {
    const b = G.battle;
    G.battle = null;
    RS.finishBattle(G.run, b);
    G.save();
    G.route();
  };

  // 전투 중 나가면 전투 전 저장본으로 되돌린다
  G.quitToTitle = function () {
    G.battle = null;
    G.run = null;
    releaseWake();
    UI.showTitle();
  };

  G.setSpeed = function (s) {
    G.speed = s;
    store(SPEED_KEY, String(s));
    UI.updateHud(true);
  };
  G.setModal = function (open) {
    G.modalOpen = open;
  };

  // 화면 꺼짐 방지: 백그라운드에 다녀오면 브라우저가 풀어 버리므로 다시 잡는다
  function requestWake() {
    try {
      if (navigator.wakeLock && !G.wake) {
        navigator.wakeLock.request('screen').then((w) => {
          if (!G.battle) {
            w.release().catch(() => {});
            return;
          }
          G.wake = w;
          w.addEventListener('release', () => {
            if (G.wake === w) G.wake = null;
          });
        }).catch(() => {});
      }
    } catch (e) {
      /* 지원하지 않으면 무시 */
    }
  }
  function releaseWake() {
    if (G.wake) {
      G.wake.release().catch(() => {});
      G.wake = null;
    }
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = G.last ? Math.min(0.1, (ts - G.last) / 1000) : 0;
    G.last = ts;
    const b = G.battle;
    if (!b) return;
    // 가로 회전 안내가 떠 있는 동안에도 멈춘다
    const running = !G.paused && !G.modalOpen && !G.hidden && !G.rotated;
    if (running) {
      G.acc += dt * G.speed;
      let steps = 0;
      while (G.acc >= STEP && steps < MAX_STEPS) {
        b.update(STEP);
        G.acc -= STEP;
        steps++;
      }
      if (steps >= MAX_STEPS) G.acc = 0;
      for (let k = 0; k < b.fx.length; k++) UI.onFx(b.fx[k]);
      G.renderer.consume(b);
      G.hudT -= dt;
      if (G.hudT <= 0) {
        G.hudT = 0.1;
        UI.updateHud();
      }
      if (b.status === 'won' || b.status === 'lost') {
        G.endBattle();
        return;
      }
    }
    G.renderer.draw(b, running ? dt * Math.min(G.speed, 2) : 0);
  }

  function boot(hotData) {
    RS.bakeSprites();
    RS.bakeDigits();
    G.renderer = new RS.Renderer(document.getElementById('cv'));
    G.renderer.setTheme('forest');
    loadMeta();
    G.speed = Math.min(3, Math.max(1, parseInt(load(SPEED_KEY) || '1', 10) || 1));
    if (hotData && hotData.save && !load(SAVE_KEY)) store(SAVE_KEY, hotData.save);
    UI.initBattle();
    // 두 번 탭 방지: 화면이 막 바뀐 직후의 클릭은 버린다 (전투 조작 버튼·전장은 제외)
    document.addEventListener('click', (e) => {
      if (!UI.inputLocked()) return;
      const t = e.target;
      if (t && t.closest && t.closest('#controls,#itembar,#cv')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    // 툴팁 바깥을 누르면 닫기 (툴팁을 여는 요소는 자기 onclick 이 다시 그린다)
    const tipEl = document.getElementById('tip');
    document.addEventListener('pointerdown', (e) => {
      if (!tipEl || tipEl.hidden || tipEl.contains(e.target)) return;
      if (e.target.closest && e.target.closest('.chip,.node,.keys,.hud .stat,#bossbar,.islot.empty')) return;
      tipEl.hidden = true;
    }, true);
    // 툴팁 자체를 눌러도 닫힌다 (안의 버튼은 제 할 일을 한 뒤 닫는다)
    tipEl.addEventListener('click', (e) => {
      if (!e.target.closest('button')) tipEl.hidden = true;
    });
    // 스크롤하면 툴팁을 숨긴다 (가리키던 것이 움직이므로)
    document.addEventListener('scroll', () => UI.hideTip(), true);
    // 모달 바깥(어두운 배경)을 누르면 닫기
    const modalEl = document.getElementById('modal');
    modalEl.addEventListener('click', (e) => {
      if (e.target === modalEl) UI.closeModal();
    });
    // iOS 사파리는 touchend·click 안에서만 소리를 깨울 수 있다
    for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, () => RS.unlockAudio(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      G.hidden = document.hidden;
      // 앱을 내리면 음악도 멈춘다 (돌아오면 다음 터치에서 다시)
      if (RS.audioHidden) RS.audioHidden(document.hidden);
      if (document.hidden && G.battle && !G.modalOpen) UI.openPause();
      if (!document.hidden && G.battle) requestWake();
    });
    // 가로로 돌리면 전투를 멈추고 메뉴를 띄운다
    if (window.matchMedia) {
      const rot = window.matchMedia('(orientation: landscape) and (max-height: 500px)');
      const onRot = () => {
        G.rotated = rot.matches;
        if (rot.matches && G.battle && !G.modalOpen) UI.openPause();
      };
      if (rot.addEventListener) rot.addEventListener('change', onRot);
      else if (rot.addListener) rot.addListener(onRot);
      G.rotated = rot.matches;
    }
    UI.showTitle();
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) {
      try {
        // 전투 중 상태가 아니라 마지막 저장본(전투 전)을 넘긴다
        hot.snapshot(() => ({ save: load(SAVE_KEY) }));
      } catch (e) {
        /* 미리보기 환경 */
      }
    }
    requestAnimationFrame(frame);
  }

  function start() {
    const hot = window.claude && window.claude.hot;
    if (hot && hot.ready) hot.ready(boot);
    else boot((hot && hot.data) || {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})((globalThis.RS = globalThis.RS || {}));
