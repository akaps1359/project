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
    meta: { runs: 0, wins: 0, bestAct: 0, bestFloor: 0, maxAsc: 0, wongo: 0 },
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
  }
  G.saveMeta = function () {
    store(META_KEY, JSON.stringify(G.meta));
  };

  // 모험이 끝날 때 기록하고, 새로 열린 것을 돌려준다
  function recordEnd(run, won) {
    const m = G.meta;
    const unlockedBefore = RS.COMMANDERS.filter((c) => RS.commanderUnlocked(c, m)).map((c) => c.id);
    const ascBefore = m.maxAsc || 0;
    // 4막까지 갔다면 3막을 끝까지 오른 것으로 기록
    const act = Math.min(3, run.act);
    const floor = run.act > 3 ? RS.FLOORS_PER_ACT : run.floor;
    if (act > m.bestAct || (act === m.bestAct && floor > m.bestFloor)) {
      m.bestAct = act;
      m.bestFloor = floor;
    }
    if (won) {
      m.wins++;
      if (run.asc >= ascBefore) m.maxAsc = Math.min(RS.MAX_ASC, run.asc + 1);
      if (run.act === 4) m.heart = true;
    }
    m.wongo = (m.wongo || 0) + Math.floor((run.stats.wongo || 0) / 10);
    G.saveMeta();
    const out = [];
    for (const c of RS.COMMANDERS) {
      if (RS.commanderUnlocked(c, m) && unlockedBefore.indexOf(c.id) < 0) out.push(`지휘관 ${c.title} ${c.name}`);
    }
    if ((m.maxAsc || 0) > ascBefore) out.push(`승천 ${m.maxAsc}`);
    return out;
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
    else store(SAVE_KEY, RS.saveString(run));
  };

  G.newRun = function (seed, opts) {
    G.run = RS.newRun(seed, opts);
    G.meta.runs++;
    G.saveMeta();
    G.save();
    G.route();
  };

  G.continueRun = function () {
    const run = G.savedRun();
    if (!run) return UI.showCommanders();
    G.run = run;
    G.route();
  };

  G.route = function () {
    const run = G.run;
    releaseWake();
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
        let unlocks = null;
        if (!run.recorded) {
          run.recorded = true;
          unlocks = recordEnd(run, run.phase === 'victory');
        }
        UI.showEnd(run.phase === 'victory', unlocks);
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

  function requestWake() {
    try {
      if (navigator.wakeLock && !G.wake) {
        navigator.wakeLock.request('screen').then((w) => (G.wake = w)).catch(() => {});
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
    const running = !G.paused && !G.modalOpen && !G.hidden;
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
    // 툴팁 바깥을 누르면 닫기
    document.addEventListener('pointerdown', (e) => {
      const tip = document.getElementById('tip');
      if (tip && !tip.hidden && !tip.contains(e.target) && !e.target.closest('.chip,.node,.keys')) tip.hidden = true;
    }, true);
    // iOS 사파리는 touchend·click 안에서만 소리를 깨울 수 있다
    for (const ev of ['pointerdown', 'touchend', 'click']) document.addEventListener(ev, () => RS.unlockAudio(), { passive: true });
    document.addEventListener('visibilitychange', () => {
      G.hidden = document.hidden;
      if (document.hidden && G.battle && !G.modalOpen) UI.openPause();
    });
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
