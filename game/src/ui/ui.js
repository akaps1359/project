// 화면(DOM) 구성과 입력 처리
(function (RS) {
  'use strict';

  const F = RS.FIELD;
  const UI = (RS.UI = {});
  let G = null;

  const $ = (sel) => document.querySelector(sel);

  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'style') el.style.cssText = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => append(el, x));
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  UI.h = h;

  const iconName = (icon) => (icon.startsWith('c_') ? icon.slice(2) + '3' : icon);
  const icon = (name, cls, scale) => h('img', { class: 'ic ' + (cls || ''), src: RS.iconURL(iconName(name), scale || 4), alt: '' });
  const unitImg = (cls, tier, extra) => h('img', { class: 'uimg ' + (extra || ''), src: RS.unitURL(cls, tier, 3), alt: '' });

  const fmt = (v) => Math.floor(v).toLocaleString('ko-KR');
  const fmtK = (v) => RS.fmtNum(v);
  const pct = (v) => Math.round(v * 100) + '%';

  function btn(label, onclick, cls, disabled) {
    return h('button', {
      class: 'btn ' + (cls || ''),
      disabled: !!disabled,
      onclick(e) {
        RS.sfx('click');
        onclick(e);
      },
    }, label);
  }

  function show(id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    UI.current = id;
  }

  // ── 초기화 ──
  UI.init = function (game) {
    G = game;
    for (const img of document.querySelectorAll('img[data-icon]')) img.src = RS.iconURL(img.dataset.icon, 3);
    $('#b-summon').addEventListener('click', () => UI.doSummon());
    $('#b-upg').addEventListener('click', () => {
      RS.sfx('click');
      UI.setPanel(UI.panelMode === 'upgrade' ? 'idle' : 'upgrade');
    });
    $('#b-arrange').addEventListener('click', () => {
      if (!G.battle) return;
      RS.sfx('click');
      G.battle.arrange();
      UI.select(-1);
      UI.toast('근접은 바깥, 원거리는 안쪽으로 정리했어요');
    });
    $('#b-speed').addEventListener('click', () => {
      RS.sfx('click');
      G.setSpeed(G.speed >= 3 ? 1 : G.speed + 1);
    });
    $('#b-pause').addEventListener('click', () => {
      RS.sfx('click');
      UI.openPause();
    });
    bindField();
    document.addEventListener('pointerdown', (e) => {
      const tip = $('#tip');
      if (!tip.hidden && !tip.contains(e.target)) tip.hidden = true;
    }, true);
    // iOS 핀치 확대 막기
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    window.addEventListener('resize', () => UI.fitCanvas());
  };

  UI.fitCanvas = function () {
    const box = $('#field');
    const cv = $('#cv');
    if (!box || box.clientWidth === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const avail = Math.min(box.clientWidth / F.W, box.clientHeight / F.H);
    let scale = avail;
    const phys = Math.floor(avail * dpr);
    if (phys >= 3) scale = phys / dpr; // 물리 픽셀 정수배로 맞춰 도트가 고르게
    cv.style.width = Math.floor(F.W * scale) + 'px';
    cv.style.height = Math.floor(F.H * scale) + 'px';
  };

  // ── 토스트·툴팁 ──
  UI.toast = function (text, kind) {
    const box = $('#toasts');
    if (!box) return;
    while (box.children.length >= 3) box.firstChild.remove();
    const t = h('div', { class: 'toast ' + (kind || '') }, text);
    box.appendChild(t);
    setTimeout(() => t.remove(), 1700);
  };

  UI.tip = function (anchor, title, desc, extra) {
    const tip = $('#tip');
    tip.innerHTML = '';
    append(tip, [h('b', null, title), h('p', null, desc), extra ? h('p', { class: 'cost' }, extra) : null]);
    tip.hidden = false;
    const r = anchor.getBoundingClientRect();
    const tw = Math.min(260, window.innerWidth - 24);
    tip.style.width = tw + 'px';
    const left = Math.max(12, Math.min(window.innerWidth - tw - 12, r.left + r.width / 2 - tw / 2));
    tip.style.left = left + 'px';
    const below = r.bottom + 8;
    const th = tip.offsetHeight;
    tip.style.top = (below + th > window.innerHeight - 12 ? Math.max(12, r.top - th - 8) : below) + 'px';
  };

  function relicChip(id, size) {
    const r = RS.REL[id];
    return h('button', {
      class: 'chip relic',
      onclick(e) {
        UI.tip(e.currentTarget, `${r.name} · ${RS.RARITY_NAME.relic[r.rarity]} 유물`, r.desc, r.cost ? '대가 · ' + r.cost : null);
      },
    }, icon(r.icon, '', size || 3));
  }

  // ── 타이틀 ──
  UI.showTitle = function () {
    const scr = $('#scr-title');
    scr.innerHTML = '';
    const meta = G.meta;
    const hasSave = !!G.savedRun();
    const parade = h('div', { class: 'parade' });
    RS.CLASSES.forEach((c, i) => parade.appendChild(unitImg(c, i % 4, 'bob')));
    append(scr, [
      h('div', { class: 'title-wrap' },
        h('p', { class: 'eyebrow' }, '랜덤 디펜스 × 로그라이크'),
        h('h1', { class: 'logo' }, h('span', null, '랜덤'), h('span', { class: 'l2' }, '스파이어')),
        parade,
        h('div', { class: 'title-foes' }, ['slime', 'bat', 'golem', 'ghost', 'imp'].map((n) => h('img', { class: 'foe', src: RS.iconURL(n, 3), alt: '' }))),
      ),
      h('div', { class: 'title-menu' },
        hasSave ? btn('이어하기', () => G.continueRun(), 'big gold') : null,
        btn('새 모험', () => (hasSave ? UI.confirmNew() : G.newRun()), hasSave ? 'big' : 'big gold'),
        h('div', { class: 'row2' },
          btn('게임 방법', () => UI.openHelp()),
          btn('도감', () => UI.openCodex()),
          btn(RS.isMuted() ? '소리 꺼짐' : '소리 켜짐', (e) => {
            RS.setMuted(!RS.isMuted());
            e.currentTarget.textContent = RS.isMuted() ? '소리 꺼짐' : '소리 켜짐';
          }),
        ),
        h('p', { class: 'record' }, meta.runs ? `모험 ${meta.runs}회 · 클리어 ${meta.wins}회 · 최고 기록 ${meta.bestAct}막 ${meta.bestFloor}층` : '3막 꼭대기의 균열의 군주를 쓰러뜨리세요'),
      ),
    ]);
    show('scr-title');
  };

  UI.confirmNew = function () {
    UI.modal('새 모험', h('div', null,
      h('p', null, '진행 중인 모험이 사라집니다. 새로 시작할까요?'),
      h('div', { class: 'row2' }, btn('취소', () => UI.closeModal()), btn('새로 시작', () => { UI.closeModal(); G.newRun(); }, 'gold')),
    ));
  };

  // ── 맵 ──
  const ROWH = 66;

  function topbar(run, title) {
    return h('div', { class: 'topbar' },
      h('div', { class: 'tb-title' }, title),
      h('div', { class: 'tb-stats' },
        h('span', { class: 'stat' }, icon('heart', '', 3), h('b', null, `${Math.ceil(run.life)}/${run.maxLife}`)),
        h('span', { class: 'stat' }, icon('coin', '', 3), h('b', null, fmt(run.gold))),
        btn('빌드', () => UI.openBuild(), 'sm'),
      ),
    );
  }

  function relicStrip(run) {
    if (!run.relics.length && !run.curses.length && !run.items.length) return null;
    return h('div', { class: 'strip scroll-x' },
      run.relics.map((id) => relicChip(id)),
      run.curses.map((id) => {
        const c = RS.CURSE[id];
        return h('button', { class: 'chip curse', onclick: (e) => UI.tip(e.currentTarget, `저주 · ${c.name}`, c.desc) }, icon('curse', '', 3));
      }),
      run.items.map((id) => {
        const it = RS.ITEM[id];
        return h('button', { class: 'chip item', onclick: (e) => UI.tip(e.currentTarget, `소모품 · ${it.name}`, it.desc + ' (전투 중 사용)') }, icon(it.icon, '', 3));
      }),
    );
  }

  UI.showMap = function () {
    const run = G.run;
    UI.rewardSel = null;
    UI.shopSel = null;
    UI.restTrain = false;
    const scr = $('#scr-map');
    scr.innerHTML = '';
    const act = RS.ACTS[run.act - 1];
    const box = h('div', { class: 'mapbox scroll' });
    append(scr, [
      topbar(run, `${run.act}막 · ${act.name}`),
      relicStrip(run),
      box,
      h('p', { class: 'hint' }, '반짝이는 칸으로 이동하세요. 칸을 누르면 설명이 나옵니다.'),
    ]);
    show('scr-map');
    const floors = run.map.floors;
    const avail = RS.nextChoices(run);
    const isAvail = (f, l) => avail.some((c) => c.f === f && c.lane === l);
    const pad = 44;
    const H = Math.max(box.clientHeight, 7 * 78 + pad * 2);
    const rowH = (H - pad * 2) / 7;
    const inner = h('div', { class: 'mapinner', style: `height:${H}px` });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'maplines');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(H));
    const laneX = (l) => [18, 50, 82][l];
    const rowY = (f) => Math.round(pad + (7 - f) * rowH + rowH / 2 - 8);
    for (let f = 1; f <= 6; f++) {
      for (let l = 0; l < 3; l++) {
        const n = floors[f - 1][l];
        if (!n) continue;
        for (const nl of n.next) {
          const line = document.createElementNS(svgNS, 'line');
          line.setAttribute('x1', laneX(l) + '%');
          line.setAttribute('y1', String(rowY(f)));
          line.setAttribute('x2', laneX(nl) + '%');
          line.setAttribute('y2', String(rowY(f + 1)));
          const target = floors[f][nl];
          let cls = 'ln';
          if (n.visited && target.visited) cls += ' done';
          else if (f === run.floor && l === run.lane) cls += ' open';
          line.setAttribute('class', cls);
          svg.appendChild(line);
        }
      }
    }
    inner.appendChild(svg);
    for (let f = 1; f <= 7; f++) {
      for (let l = 0; l < 3; l++) {
        const n = floors[f - 1][l];
        if (!n) continue;
        const info = RS.NODE_INFO[n.type];
        const here = f === run.floor && l === run.lane;
        const can = isAvail(f, l);
        inner.appendChild(h('button', {
          class: `node t-${n.type}${n.visited ? ' visited' : ''}${here ? ' here' : ''}${can ? ' avail' : ''}`,
          style: `left:${laneX(l)}%;top:${rowY(f)}px`,
          'aria-label': info.name,
          onclick(e) {
            if (can) {
              RS.sfx('click');
              G.enterNode(f, l);
            } else {
              UI.tip(e.currentTarget, info.name, nodeDesc(n.type));
            }
          },
        }, icon(info.icon, '', 3), h('span', { class: 'nlabel' }, info.name)));
      }
    }
    box.appendChild(inner);
    const targetY = rowY(Math.min(7, run.floor + 1));
    box.scrollTop = Math.max(0, targetY - box.clientHeight * 0.55);
  };

  function nodeDesc(type) {
    return {
      combat: '적 웨이브 3개. 이기면 골드와 증강 선택.',
      elite: '마지막 웨이브에 엘리트 등장. 좋은 증강과 유물 선택.',
      event: '무슨 일이 일어날지 모릅니다. 대가를 치르고 보상을 얻기도.',
      shop: '골드로 유물·소모품·증강을 사거나 저주를 없앱니다.',
      rest: '생명을 회복하거나 클래스를 수련합니다.',
      treasure: '유물이 든 상자.',
      boss: '막의 보스. 제한 시간 안에 쓰러뜨리세요.',
    }[type];
  }

  // ── 전투 ──
  UI.showBattle = function () {
    show('scr-battle');
    UI.fitCanvas();
    UI.select(-1);
    UI.setPanel('idle');
    UI.renderItems();
    UI.hudCache = {};
    UI.updateHud(true);
    const st = G.battle.stage;
    if (G.run.stats.battles === 0) {
      UI.toast('소환 버튼으로 유닛을 부르세요!');
      setTimeout(() => UI.toast('같은 유닛 3기가 모이면 합성할 수 있어요'), 1800);
    } else if (st.type === 'boss') {
      UI.toast(`보스전 · 마지막 웨이브에 ${RS.ENEMY[RS.ACTS[st.act - 1].boss].name} 등장`, 'warn');
    } else if (st.type === 'elite') {
      UI.toast('엘리트전 · 마지막 웨이브에 강적 등장', 'warn');
    }
  };

  function bindField() {
    const cv = $('#cv');
    const toLogical = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * F.W, y: ((e.clientY - r.top) / r.height) * F.H };
    };
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      if (!G.battle) return;
      e.preventDefault();
      const p = toLogical(e);
      const i = RS.slotAt(p.x, p.y);
      const board = G.run.board;
      if (i < 0) {
        UI.select(-1);
        return;
      }
      if (!board[i]) {
        // 선택된 유닛이 있으면 빈칸으로 이동
        if (UI.sel >= 0 && board[UI.sel]) {
          G.battle.swap(UI.sel, i);
          RS.sfx('click');
          UI.select(i);
        } else UI.select(-1);
        return;
      }
      drag = { from: i, over: i, moved: false, x0: p.x, y0: p.y, id: e.pointerId };
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
      if (!drag.moved && Math.hypot(p.x - drag.x0, p.y - drag.y0) > 5) drag.moved = true;
      drag.over = RS.slotAt(p.x, p.y);
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      G.renderer.drag = null;
      if (!G.battle) return;
      if (d.moved) {
        if (d.over >= 0 && d.over !== d.from) {
          G.battle.swap(d.from, d.over);
          RS.sfx('click');
          UI.select(d.over);
        }
      } else {
        UI.select(UI.sel === d.from ? -1 : d.from);
        RS.sfx('click');
      }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', (e) => {
      if (drag && e.pointerId === drag.id) {
        drag = null;
        G.renderer.drag = null;
      }
    });
  }

  UI.sel = -1;
  UI.select = function (i) {
    UI.sel = i;
    if (G.renderer) G.renderer.sel = i;
    if (i >= 0 && G.run && G.run.board[i]) UI.setPanel('unit');
    else if (UI.panelMode === 'unit') UI.setPanel('idle');
  };

  UI.doSummon = function () {
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
    } else {
      RS.sfx(res.tier > 0 ? 'rare' : 'summon');
      if (res.tier > 0) UI.toast(`${RS.TIER[res.tier].name} ${RS.CLASS[res.cls].name} 소환!`, 't' + res.tier);
      const s = G.run.board[res.slot];
      if (s && s.n === 3 && s.tier < 3 && (UI.mergeHints = (UI.mergeHints || 0) + 1) <= 2) {
        UI.toast('합성 가능! 반짝이는 칸을 누르세요', 'good');
      }
      if (res.clover) UI.toast('네잎클로버! 비용 반환', 'good');
      if (res.twin != null) UI.toast('쌍둥이 소환!', 'good');
    }
    UI.updateHud(true);
  };

  UI.doMerge = function (i, pick) {
    const b = G.battle;
    if (!b) return;
    if (b.M.mergeChoose && !pick) {
      UI.setPanel('mergeChoose', { slot: i, opts: b.mergeOptions() });
      return;
    }
    const tierFrom = G.run.board[i] ? G.run.board[i].tier : 0;
    const res = b.merge(i, pick);
    if (!res) return;
    if (res.fail) {
      RS.sfx('error');
      UI.toast('합성 실패…', 'warn');
    } else {
      const r = res.results[0];
      RS.sfx(r && r.tier === 3 ? 'legend' : 'merge');
      if (r) UI.toast(`${res.double ? '대성공! ' : ''}${RS.TIER[r.tier].name} ${RS.CLASS[r.cls].name}${res.results.length > 1 ? ' ×2' : ''}`, 't' + r.tier);
      if (res.refund) UI.toast('재활용: 재료 1기 반환', 'good');
    }
    const next = res.results.length ? res.results[0].slot : -1;
    UI.select(G.run.board[i] && G.run.board[i].tier === tierFrom ? i : next);
    UI.updateHud(true);
  };

  UI.doMergeAll = function () {
    const b = G.battle;
    if (!b) return;
    let count = 0;
    let i;
    let guard = 0;
    while ((i = RS.firstMergeable(G.run.board)) >= 0 && guard++ < 30) {
      const res = b.merge(i);
      if (res) count++;
    }
    if (count) {
      RS.sfx('merge');
      UI.toast(`${count}번 합성했어요`);
    }
    UI.select(-1);
    UI.updateHud(true);
  };

  UI.panelMode = 'idle';
  UI.setPanel = function (mode, data) {
    UI.panelMode = mode;
    UI.panelData = data || null;
    const p = $('#panel');
    p.innerHTML = '';
    p.className = 'panel-' + mode;
    UI.panelRefs = {};
    const b = G.battle;
    const run = G.run;
    if (!b) return;
    if (mode === 'idle') {
      const refs = UI.panelRefs;
      append(p, h('div', { class: 'pidle' },
        h('div', { class: 'pstat' }, h('span', null, '전체 DPS'), (refs.dps = h('b', null, '0'))),
        h('div', { class: 'pstat' }, h('span', null, '유닛'), (refs.units = h('b', null, '0'))),
        h('div', { class: 'pstat' }, h('span', null, '다음 이자'), (refs.int = h('b', null, '0'))),
        h('p', { class: 'phint' }, '칸을 눌러 정보 보기 · 끌어서 자리 바꾸기'),
      ));
    } else if (mode === 'unit') {
      const i = UI.sel;
      const s = run.board[i];
      if (!s) return UI.setPanel('idle');
      const C = RS.CLASS[s.cls];
      const T = RS.TIER[s.tier];
      const refs = UI.panelRefs;
      const canMerge = RS.canMerge(run.board, i);
      append(p, h('div', { class: 'punit' },
        unitImg(s.cls, s.tier, 'big'),
        h('div', { class: 'pinfo' },
          h('div', { class: 'pname' }, h('b', { class: 'tier' + s.tier }, `${T.name} ${C.name}`), ` ×${s.n}`, (refs.dps = h('span', { class: 'pdps' }))),
          (refs.stats = h('div', { class: 'pstats' })),
          h('p', { class: 'pdesc' }, `${C.role} · ${C.desc}`),
        ),
        h('div', { class: 'pbtns' },
          btn(s.tier >= 3 ? '최고 등급' : canMerge ? '합성' : `합성 ${s.n}/3`, () => UI.doMerge(i), canMerge ? 'gold' : '', !canMerge),
          (refs.sell = btn(`판매 +${RS.sellValue(run, s.tier, b.M)}`, () => {
            const v = b.sell(i);
            if (v) {
              RS.sfx('coin');
              UI.toast(`+${v}G`);
            }
            UI.select(G.run.board[i] ? i : -1);
            UI.updateHud(true);
          })),
        ),
      ));
      UI.refreshUnitStats();
    } else if (mode === 'upgrade') {
      const refs = (UI.panelRefs = { rows: {} });
      const grid = h('div', { class: 'upg-grid' });
      for (const c of RS.CLASSES) {
        const el = h('button', {
          class: 'upg',
          onclick() {
            const r = b.upgrade(c);
            if (r.err) {
              RS.sfx('error');
              UI.toast('골드가 부족해요', 'warn');
            } else {
              RS.sfx('upgrade');
            }
            UI.updateHud(true);
          },
        }, unitImg(c, 0), h('span', { class: 'un' }, RS.CLASS[c].name), h('b', { class: 'lv' }), h('span', { class: 'cost' }));
        refs.rows[c] = el;
        grid.appendChild(el);
      }
      append(p, h('div', { class: 'pupg' }, h('p', { class: 'phint' }, '클래스 강화 · 레벨당 피해 +15% (모든 등급에 적용)'), grid));
    } else if (mode === 'item') {
      const idx = data.idx;
      const it = RS.ITEM[run.items[idx]];
      if (!it) return UI.setPanel('idle');
      append(p, h('div', { class: 'pitem' },
        icon(it.icon, 'big', 4),
        h('div', { class: 'pinfo' }, h('b', null, it.name), h('p', { class: 'pdesc' }, it.desc)),
        h('div', { class: 'pbtns' },
          btn('사용', () => {
            const r = b.useItem(idx);
            if (r.err === 'full') {
              RS.sfx('error');
              UI.toast('빈자리가 없어요', 'warn');
              return;
            }
            RS.sfx(it.id === 'bomb' ? 'bomb' : it.id === 'freeze' ? 'freeze' : 'upgrade');
            UI.toast(`${it.name} 사용!`, 'good');
            UI.renderItems();
            UI.setPanel('idle');
            UI.updateHud(true);
          }, 'gold'),
          btn('닫기', () => UI.setPanel('idle')),
        ),
      ));
    } else if (mode === 'mergeChoose') {
      append(p, h('div', { class: 'pchoose' },
        h('p', { class: 'phint' }, '고대 두루마리: 합성 결과를 고르세요'),
        h('div', { class: 'row2' }, data.opts.map((c) => h('button', {
          class: 'btn choose',
          onclick() {
            UI.doMerge(data.slot, c);
          },
        }, unitImg(c, Math.min(3, (run.board[data.slot] ? run.board[data.slot].tier : 0) + 1)), RS.CLASS[c].name))),
      ));
    }
  };

  UI.refreshUnitStats = function () {
    const refs = UI.panelRefs;
    const b = G.battle;
    if (!refs || !refs.stats || !b) return;
    const i = UI.sel;
    const s = G.run.board[i];
    if (!s) return;
    if (b.statsDirty) b.computeSlotStats();
    const st = b.slotStats[i];
    if (!st) return;
    const parts = [`피해 ${fmtK(st.dmg)}`, `${(1 / st.interval).toFixed(1)}회/초`, `사거리 ${Math.round(st.range)}`];
    if (st.crit > 0) parts.push(`치명 ${pct(Math.min(1, st.crit))}`);
    if (st.splash) parts.push(`범위 ${st.splash}`);
    if (st.slow) parts.push(`둔화 ${pct(st.slow)}`);
    if (st.shots > 1) parts.push(`${st.shots}발`);
    const text = parts.join(' · ');
    if (refs.stats.textContent !== text) refs.stats.textContent = text;
    const dps = `DPS ${fmtK(st.dps * s.n)}`;
    if (refs.dps && refs.dps.textContent !== dps) refs.dps.textContent = dps;
    if (refs.sell) {
      const t = `판매 +${RS.sellValue(G.run, s.tier, b.M)}`;
      if (refs.sell.textContent !== t) refs.sell.textContent = t;
    }
  };

  UI.renderItems = function () {
    const bar = $('#itembar');
    bar.innerHTML = '';
    const run = G.run;
    const slots = RS.itemSlots(run);
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
        bar.appendChild(h('div', { class: 'islot empty' }));
      }
    }
    bar.appendChild(h('div', { class: 'spacer' }));
    bar.appendChild(btn('모두 합성', () => UI.doMergeAll(), 'sm', false));
    bar.appendChild(btn('빌드', () => UI.openBuild(), 'sm'));
  };

  const setText = (el, key, v) => {
    if (UI.hudCache[key] !== v) {
      UI.hudCache[key] = v;
      el.textContent = v;
    }
  };

  UI.updateHud = function (force) {
    const b = G.battle;
    const run = G.run;
    if (!b || !run) return;
    if (force) UI.hudCache = {};
    const c = UI.hudCache;
    setText($('#h-life-v'), 'life', `${Math.ceil(run.life)}/${run.maxLife}`);
    setText($('#h-gold-v'), 'gold', fmt(run.gold));
    const cap = RS.interestCap(b.M);
    const inter = Math.min(cap, Math.floor(run.gold / RS.BAL.interestPer));
    setText($('#h-int'), 'int', inter > 0 ? `+${inter + (b.M.interestBonus || 0)}` : '');
    setText($('#h-foe-v'), 'foe', `${b.enemies.length}/${b.cap}`);
    const danger = b.enemies.length >= b.cap * 0.7;
    if (c.danger !== danger) {
      c.danger = danger;
      $('#h-foe').classList.toggle('danger', danger);
    }
    const lowLife = run.life <= run.maxLife * 0.3;
    if (c.low !== lowLife) {
      c.low = lowLife;
      $('#h-life').classList.toggle('danger', lowLife);
    }
    const nW = b.stage.waves.length;
    if (b.prep > 0) {
      setText($('#h-wave-v'), 'wv', '준비');
      setText($('#h-wave-t'), 'wt', `${Math.ceil(b.prep)}초`);
    } else {
      setText($('#h-wave-v'), 'wv', `${b.waveIdx}/${nW}`);
      setText($('#h-wave-t'), 'wt', b.waveIdx < nW ? `${Math.max(0, Math.ceil(b.waveT))}초` : '마지막');
    }
    const cost = RS.summonCost(run, b.M);
    setText($('#summon-cost'), 'cost', `${cost}G`);
    const canSummon = run.gold >= cost;
    if (c.canS !== canSummon) {
      c.canS = canSummon;
      $('#b-summon').classList.toggle('off', !canSummon);
    }
    setText($('#b-speed'), 'spd', `x${G.speed}`);
    // 보스
    const bb = $('#bossbar');
    if (b.boss) {
      if (bb.hidden) {
        bb.hidden = false;
        $('#boss-name').textContent = b.boss.def.name;
      }
      const w = Math.max(0, (b.boss.hp / b.boss.maxHp) * 100).toFixed(1) + '%';
      if (c.bhp !== w) {
        c.bhp = w;
        $('#boss-hp').style.width = w;
      }
      setText($('#boss-t'), 'bt', b.enraged ? '폭주!' : `${Math.ceil(b.bossTimer)}초`);
      if (c.enr !== b.enraged) {
        c.enr = b.enraged;
        bb.classList.toggle('enraged', b.enraged);
      }
    } else if (!bb.hidden) bb.hidden = true;
    // 패널
    const refs = UI.panelRefs || {};
    if (UI.panelMode === 'idle' && refs.dps) {
      setText(refs.dps, 'pdps', fmtK(b.totalDps()));
      setText(refs.units, 'punits', `${RS.boardUnitCount(run.board)}/60`);
      setText(refs.int, 'pint', inter > 0 ? `+${inter + (b.M.interestBonus || 0)}G` : '10G당 1');
    } else if (UI.panelMode === 'unit') {
      if (!run.board[UI.sel]) UI.select(-1);
      else UI.refreshUnitStats();
    } else if (UI.panelMode === 'upgrade' && refs.rows) {
      for (const cl of RS.CLASSES) {
        const el = refs.rows[cl];
        const lv = run.classLv[cl];
        const cst = RS.upgradeCost(run, cl, b.M);
        setText(el.querySelector('.lv'), 'lv' + cl, `Lv ${lv}`);
        setText(el.querySelector('.cost'), 'uc' + cl, `${cst}G`);
        const ok = run.gold >= cst;
        if (c['uo' + cl] !== ok) {
          c['uo' + cl] = ok;
          el.classList.toggle('off', !ok);
        }
      }
    }
  };

  // 전투 이벤트 → 소리·토스트
  UI.onFx = function (ev) {
    switch (ev.k) {
      case 'wave':
        RS.sfx('wave');
        UI.toast(`웨이브 ${ev.n}/${ev.total} · +${ev.gold}G${ev.interest ? ` · 이자 +${ev.interest}` : ''}`);
        break;
      case 'boss':
        RS.sfx('boss');
        UI.toast(`${ev.name} 등장!`, 'warn');
        break;
      case 'bossDown':
        RS.sfx('big');
        UI.toast('보스 처치!', 'good');
        break;
      case 'msg':
        UI.toast(ev.text, ev.warn ? 'warn' : '');
        break;
      case 'kill':
        RS.sfx(ev.big ? 'big' : 'kill');
        break;
      case 'leak':
        RS.sfx('leak');
        break;
      case 'upgrade':
        break;
      case 'won':
        RS.sfx('win');
        UI.toast('승리!', 'good');
        break;
      case 'lost':
        RS.sfx('lose');
        UI.toast(ev.reason === 'cap' ? '적이 너무 많습니다!' : '생명이 다했습니다', 'warn');
        break;
    }
  };

  // ── 보상·상점·이벤트 등 페이지 ──
  function page(title, sub, body, footer) {
    const scr = $('#scr-page');
    scr.innerHTML = '';
    append(scr, [
      topbar(G.run, title),
      relicStrip(G.run),
      h('div', { class: 'page scroll' }, sub ? h('p', { class: 'page-sub' }, sub) : null, body),
      footer ? h('div', { class: 'page-foot' }, footer) : null,
    ]);
    show('scr-page');
    scr.querySelector('.page').scrollTop = 0;
  }

  function augCard(id, selected, onclick) {
    const a = RS.AUG[id];
    return h('button', { class: `card r${a.rarity}${selected ? ' sel' : ''}`, onclick },
      icon(a.icon, 'cic', 4),
      h('div', { class: 'cbody' },
        h('div', { class: 'ctop' }, h('span', { class: 'rar' }, RS.RARITY_NAME.aug[a.rarity]), h('b', null, a.name), a.unique ? null : h('small', { class: 'stack' }, '중첩 가능')),
        h('p', null, a.desc),
        a.cost ? h('p', { class: 'cost' }, '대가 · ' + a.cost) : null,
      ),
    );
  }

  function relicCard(id, selected, onclick, price) {
    const r = RS.REL[id];
    return h('button', { class: `card relic rr${r.rarity}${selected ? ' sel' : ''}`, onclick },
      icon(r.icon, 'cic', 4),
      h('div', { class: 'cbody' },
        h('div', { class: 'ctop' }, h('span', { class: 'rar' }, RS.RARITY_NAME.relic[r.rarity] + ' 유물'), h('b', null, r.name)),
        h('p', null, r.desc),
        r.cost ? h('p', { class: 'cost' }, '대가 · ' + r.cost) : null,
      ),
      price != null ? h('span', { class: 'price' }, icon('coin', '', 2), price) : null,
    );
  }

  UI.showReward = function () {
    const run = G.run;
    const r = run.pending.reward;
    // 이전 화면에서 남은 선택은 지금 목록에 있을 때만 유효
    const offered = !r.augDone ? r.aug : r.relics || [];
    const sel = offered.indexOf(UI.rewardSel) >= 0 ? UI.rewardSel : null;
    const body = h('div', { class: 'reward' });
    const summary = [`골드 +${r.gold}`];
    if (r.heal) summary.push(`생명 +${r.heal}`);
    let footer;
    if (!r.augDone) {
      body.appendChild(h('h2', null, '증강을 하나 고르세요'));
      const list = h('div', { class: 'cards' });
      for (const id of r.aug) {
        list.appendChild(augCard(id, sel === id, () => {
          RS.sfx('click');
          UI.rewardSel = id;
          UI.showReward();
        }));
      }
      body.appendChild(list);
      footer = [
        r.rerolls > 0 ? btn(`새로고침 ${r.rerolls}`, () => {
          RS.rewardReroll(run);
          UI.rewardSel = null;
          G.save();
          UI.showReward();
        }, 'sm') : null,
        btn(`건너뛰기 +${RS.BAL.skipGold[run.act]}G`, () => {
          RS.rewardSkipAug(run);
          UI.rewardSel = null;
          RS.sfx('coin');
          G.afterReward();
        }, 'sm'),
        btn(sel ? `${RS.AUG[sel].name} 선택` : '카드를 누르세요', () => {
          RS.rewardPickAug(run, sel);
          UI.rewardSel = null;
          RS.sfx('upgrade');
          G.afterReward();
        }, 'gold grow', !sel),
      ];
    } else if (r.relics && r.relics.length && !r.relicDone) {
      body.appendChild(h('h2', null, run.nodeType === 'boss' ? '보스의 유물 · 하나를 고르세요' : '엘리트의 유물 · 하나를 고르세요'));
      const list = h('div', { class: 'cards' });
      for (const id of r.relics) {
        list.appendChild(relicCard(id, sel === id, () => {
          RS.sfx('click');
          UI.rewardSel = id;
          UI.showReward();
        }));
      }
      body.appendChild(list);
      footer = [
        btn(sel ? `${RS.REL[sel].name} 가져가기` : '유물을 누르세요', () => {
          RS.rewardPickRelic(run, sel);
          UI.rewardSel = null;
          RS.sfx('upgrade');
          G.afterReward();
        }, 'gold grow', !sel),
      ];
    }
    page(run.nodeType === 'boss' ? '보스 격파!' : '승리!', summary.join(' · '), body, footer);
  };

  UI.showShop = function () {
    const run = G.run;
    const shop = run.pending.shop;
    const sel = UI.shopSel != null && shop.list[UI.shopSel] ? UI.shopSel : null;
    const list = h('div', { class: 'cards shop' });
    shop.list.forEach((it, idx) => {
      const selected = sel === idx;
      const onclick = () => {
        if (it.sold) return;
        RS.sfx('click');
        UI.shopSel = idx;
        UI.showShop();
      };
      let card;
      if (it.kind === 'relic') card = relicCard(it.id, selected, onclick, it.price);
      else if (it.kind === 'aug') {
        card = augCard(it.id, selected, onclick);
        card.appendChild(h('span', { class: 'price' }, icon('coin', '', 2), it.price));
      } else if (it.kind === 'item') {
        const d = RS.ITEM[it.id];
        card = h('button', { class: `card item${selected ? ' sel' : ''}`, onclick },
          icon(d.icon, 'cic', 4),
          h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, '소모품'), h('b', null, d.name)), h('p', null, d.desc)),
          h('span', { class: 'price' }, icon('coin', '', 2), it.price));
      } else {
        const c = RS.CURSE[it.id];
        card = h('button', { class: `card curse${selected ? ' sel' : ''}`, onclick },
          icon('curse', 'cic', 4),
          h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, '정화'), h('b', null, `저주 [${c.name}] 제거`)), h('p', null, c.desc)),
          h('span', { class: 'price' }, icon('coin', '', 2), it.price));
      }
      if (it.sold) card.classList.add('sold');
      else if (run.gold < it.price) card.classList.add('poor');
      list.appendChild(card);
    });
    const it = sel != null ? shop.list[sel] : null;
    const footer = [
      btn('떠나기', () => {
        UI.shopSel = null;
        G.leaveNode();
      }, 'sm'),
      btn(it && !it.sold ? `구매 · ${it.price}G` : '물건을 누르세요', () => {
        const r = RS.shopBuy(run, sel);
        if (r.err === 'gold') {
          RS.sfx('error');
          UI.toast2('골드가 부족해요');
        } else if (r.err === 'full') {
          RS.sfx('error');
          UI.toast2('소모품 칸이 가득 찼어요');
        } else if (r.ok) {
          RS.sfx('coin');
          UI.shopSel = null;
          G.save();
          UI.showShop();
        }
      }, 'gold grow', !it || it.sold || run.gold < (it ? it.price : 0)),
    ];
    page('상점', '떠돌이 상인이 물건을 펼쳐 놓았다.', list, footer);
  };

  // 페이지 화면용 토스트
  UI.toast2 = function (text) {
    const scr = $('#scr-page');
    const t = h('div', { class: 'toast page-toast warn' }, text);
    scr.appendChild(t);
    setTimeout(() => t.remove(), 1500);
  };

  UI.showEvent = function () {
    const run = G.run;
    const ev = RS.EVENT[run.pending.event];
    const res = run.pending.result;
    const body = h('div', { class: 'event' },
      h('div', { class: 'event-art' }, icon(ev.art, '', 6)),
      h('p', { class: 'event-text' }, ev.text),
    );
    let footer = null;
    if (!res) {
      const opts = h('div', { class: 'options' });
      ev.options.forEach((o, i) => {
        const ok = RS.optionEnabled(run, o);
        opts.appendChild(h('button', {
          class: 'btn option',
          disabled: !ok,
          onclick() {
            RS.sfx('click');
            RS.eventChoose(run, i);
            G.save();
            UI.showEvent();
          },
        }, h('b', null, o.label), h('small', null, RS.optionDesc(run, o))));
      });
      body.appendChild(opts);
    } else {
      body.appendChild(h('p', { class: 'event-result' }, res.text));
      if (run.pending.aug && run.pending.aug.length && !run.pending.augPicked) {
        const sel = run.pending.aug.indexOf(UI.rewardSel) >= 0 ? UI.rewardSel : null;
        body.appendChild(h('h2', null, '증강을 하나 고르세요'));
        const list = h('div', { class: 'cards' });
        for (const id of run.pending.aug) {
          list.appendChild(augCard(id, sel === id, () => {
            UI.rewardSel = id;
            UI.showEvent();
          }));
        }
        body.appendChild(list);
        footer = [btn(sel ? `${RS.AUG[sel].name} 선택` : '카드를 누르세요', () => {
          RS.pickAugment(run, sel);
          run.pending.augPicked = true;
          UI.rewardSel = null;
          G.save();
          UI.showEvent();
        }, 'gold grow', !sel)];
      } else {
        footer = [btn('계속', () => G.leaveNode(), 'gold grow')];
      }
    }
    page(ev.title, null, body, footer);
  };

  UI.showRest = function () {
    const run = G.run;
    const heal = RS.restHealAmount(run);
    const train = RS.restTrainAmount(run);
    const body = h('div', { class: 'rest' },
      h('div', { class: 'event-art' }, icon('n_rest', '', 6)),
      h('p', { class: 'event-text' }, '모닥불이 따뜻하게 타오른다. 잠시 쉬어 갈 수 있다.'),
    );
    if (!UI.restTrain) {
      body.appendChild(h('div', { class: 'options' },
        h('button', {
          class: 'btn option',
          onclick() {
            RS.sfx('upgrade');
            RS.restHeal(run);
            G.leaveNode();
          },
        }, h('b', null, '휴식한다'), h('small', null, `생명 +${heal} (${Math.ceil(run.life)}/${run.maxLife})`)),
        h('button', {
          class: 'btn option',
          onclick() {
            RS.sfx('click');
            UI.restTrain = true;
            UI.showRest();
          },
        }, h('b', null, '수련한다'), h('small', null, `클래스 하나를 골라 강화 +${train}`)),
      ));
    } else {
      const grid = h('div', { class: 'upg-grid wide' });
      for (const c of RS.CLASSES) {
        grid.appendChild(h('button', {
          class: 'upg',
          onclick() {
            RS.sfx('upgrade');
            RS.restTrain(run, c);
            UI.restTrain = false;
            G.leaveNode();
          },
        }, unitImg(c, 1), h('span', { class: 'un' }, RS.CLASS[c].name), h('b', { class: 'lv' }, `Lv ${run.classLv[c]} → ${run.classLv[c] + train}`)));
      }
      body.appendChild(h('h2', null, '어떤 클래스를 수련할까요?'));
      body.appendChild(grid);
      body.appendChild(btn('뒤로', () => {
        UI.restTrain = false;
        UI.showRest();
      }, 'sm'));
    }
    page('휴식처', null, body, null);
  };

  UI.showTreasure = function () {
    const run = G.run;
    const p = run.pending;
    const body = h('div', { class: 'rest' });
    let footer;
    if (!p.opened) {
      body.appendChild(h('div', { class: 'event-art' }, icon('n_treasure', '', 8)));
      body.appendChild(h('p', { class: 'event-text' }, '낡은 보물 상자가 놓여 있다.'));
      footer = [btn('상자를 연다', () => {
        RS.sfx('coin');
        p.opened = true;
        if (p.relic) RS.addRelic(run, p.relic);
        G.save();
        UI.showTreasure();
      }, 'gold grow')];
    } else {
      body.appendChild(h('h2', null, p.relic ? '유물을 얻었다!' : '상자는 비어 있었다'));
      if (p.relic) body.appendChild(relicCard(p.relic, false, () => {}));
      footer = [btn('계속', () => G.leaveNode(), 'gold grow')];
    }
    page('보물', null, body, footer);
  };

  UI.showActStart = function () {
    const run = G.run;
    const act = RS.ACTS[run.act - 1];
    const scr = $('#scr-page');
    scr.innerHTML = '';
    append(scr, h('div', { class: 'act-card' },
      h('p', { class: 'eyebrow' }, `${run.act}막`),
      h('h1', null, act.name),
      h('div', { class: 'boss-preview' }, h('img', { src: RS.iconURL(act.boss, 4), alt: '' })),
      h('p', null, `이 막의 보스: ${RS.ENEMY[act.boss].name}`),
      h('p', { class: 'dim' }, RS.ENEMY[act.boss].trait),
      h('p', { class: 'good' }, `막을 넘어오며 생명을 회복했습니다 (${Math.ceil(run.life)}/${run.maxLife})`),
      btn('출발', () => G.startAct(), 'big gold'),
    ));
    show('scr-page');
  };

  UI.showEnd = function (victory) {
    const run = G.run;
    const scr = $('#scr-page');
    scr.innerHTML = '';
    const st = run.stats;
    const tot = RS.CLASSES.reduce((s, c) => s + st.clsDmg[c], 0) || 1;
    const bars = h('div', { class: 'dmgbars' }, RS.CLASSES.map((c) => h('div', { class: 'dmgrow' },
      unitImg(c, 0),
      h('span', null, RS.CLASS[c].name),
      h('div', { class: 'bar' }, h('i', { style: `width:${((100 * st.clsDmg[c]) / tot).toFixed(1)}%` })),
      h('b', null, pct(st.clsDmg[c] / tot)),
    )));
    const reason = run.pending && run.pending.reason === 'cap' ? '필드의 적이 60마리에 도달했습니다.' : '생명이 모두 떨어졌습니다.';
    append(scr, h('div', { class: 'page scroll end' },
      h('p', { class: 'eyebrow' }, victory ? '모험 성공' : '모험 종료'),
      h('h1', { class: victory ? 'good' : 'bad' }, victory ? '균열을 닫았다!' : '쓰러졌다…'),
      h('p', { class: 'dim' }, victory ? '균열의 군주를 쓰러뜨렸습니다.' : `${run.act}막 ${run.floor}층 · ${reason}`),
      h('div', { class: 'endstats' },
        h('div', null, h('span', null, '처치'), h('b', null, fmt(st.kills))),
        h('div', null, h('span', null, '소환'), h('b', null, fmt(st.summons))),
        h('div', null, h('span', null, '합성'), h('b', null, fmt(st.merges))),
        h('div', null, h('span', null, '전투'), h('b', null, fmt(st.battles))),
      ),
      h('h2', null, '클래스별 피해'),
      bars,
      h('h2', null, `증강 ${run.augments.length} · 유물 ${run.relics.length}`),
      h('div', { class: 'strip wrap' },
        run.relics.map((id) => relicChip(id)),
        run.augments.map((id) => {
          const a = RS.AUG[id];
          return h('button', { class: 'chip aug r' + a.rarity, onclick: (e) => UI.tip(e.currentTarget, a.name, a.desc, a.cost ? '대가 · ' + a.cost : null) }, icon(a.icon, '', 3));
        }),
      ),
      h('p', { class: 'dim small' }, `시드 ${run.seed}`),
      h('div', { class: 'row2' }, btn('타이틀로', () => UI.showTitle()), btn('새 모험', () => G.newRun(), 'gold')),
    ));
    show('scr-page');
  };

  // ── 모달 ──
  UI.modal = function (title, body, onClose) {
    const m = $('#modal');
    const box = m.querySelector('.modal-box');
    box.innerHTML = '';
    append(box, [
      h('div', { class: 'modal-head' }, h('b', null, title), h('button', { class: 'btn sm x', onclick: () => UI.closeModal(), 'aria-label': '닫기' }, '닫기')),
      h('div', { class: 'modal-body scroll' }, body),
    ]);
    m.hidden = false;
    UI.onModalClose = onClose || null;
    G.setModal(true);
  };
  UI.closeModal = function () {
    $('#modal').hidden = true;
    G.setModal(false);
    const cb = UI.onModalClose;
    UI.onModalClose = null;
    if (cb) cb();
  };

  UI.openPause = function () {
    UI.modal('일시정지', h('div', { class: 'menu' },
      btn('계속하기', () => UI.closeModal(), 'gold'),
      btn('게임 방법', () => UI.openHelp()),
      btn('빌드 보기', () => UI.openBuild()),
      btn(RS.isMuted() ? '소리 켜기' : '소리 끄기', (e) => {
        RS.setMuted(!RS.isMuted());
        e.currentTarget.textContent = RS.isMuted() ? '소리 켜기' : '소리 끄기';
      }),
      btn('타이틀로 (이 전투는 처음부터)', () => {
        UI.closeModal();
        G.quitToTitle();
      }),
    ));
  };

  function buildTabs(tabs) {
    const head = h('div', { class: 'tabs' });
    const body = h('div', { class: 'tabbody' });
    const sel = (k) => {
      for (const b of head.children) b.classList.toggle('on', b.dataset.k === String(k));
      body.innerHTML = '';
      append(body, tabs[k].render());
    };
    tabs.forEach((t, k) => head.appendChild(h('button', { class: 'tab', 'data-k': String(k), onclick: () => sel(k) }, t.name)));
    sel(0);
    return h('div', null, head, body);
  }

  function augRow(id, count) {
    const a = RS.AUG[id];
    return h('div', { class: `lrow r${a.rarity}` }, icon(a.icon, '', 3),
      h('div', null, h('b', null, a.name + (count > 1 ? ` ×${count}` : '')), h('p', null, a.desc), a.cost ? h('p', { class: 'cost' }, '대가 · ' + a.cost) : null));
  }
  function relicRow(id) {
    const r = RS.REL[id];
    return h('div', { class: `lrow rr${r.rarity}` }, icon(r.icon, '', 3),
      h('div', null, h('b', null, r.name), h('p', null, r.desc), r.cost ? h('p', { class: 'cost' }, '대가 · ' + r.cost) : null));
  }

  UI.openBuild = function () {
    const run = G.run;
    if (!run) return;
    const counts = {};
    for (const id of run.augments) counts[id] = (counts[id] || 0) + 1;
    UI.modal('빌드', buildTabs([
      {
        name: `증강 ${run.augments.length}`,
        render: () => (Object.keys(counts).length ? Object.keys(counts).map((id) => augRow(id, counts[id])) : h('p', { class: 'dim' }, '아직 증강이 없습니다. 전투에서 이기면 고를 수 있어요.')),
      },
      {
        name: `유물 ${run.relics.length}`,
        render: () => (run.relics.length ? run.relics.map(relicRow) : h('p', { class: 'dim' }, '유물은 엘리트·보스·보물·상점에서 얻습니다.')),
      },
      {
        name: '강화·저주',
        render: () => [
          h('div', { class: 'lvgrid' }, RS.CLASSES.map((c) => h('div', { class: 'lvcell' }, unitImg(c, 0), h('b', null, RS.CLASS[c].name), h('span', null, `Lv ${run.classLv[c]} · +${Math.round(run.classLv[c] * RS.BAL.upgradePct * 100)}%`)))),
          run.curses.length ? run.curses.map((id) => h('div', { class: 'lrow curse' }, icon('curse', '', 3), h('div', null, h('b', null, '저주 · ' + RS.CURSE[id].name), h('p', null, RS.CURSE[id].desc)))) : h('p', { class: 'dim' }, '저주 없음'),
        ],
      },
    ]));
  };

  UI.openCodex = function () {
    const enemyRow = (id) => {
      const e = RS.ENEMY[id];
      return h('div', { class: 'lrow' }, h('img', { class: 'ic', src: RS.iconURL(id, 2), alt: '' }),
        h('div', null, h('b', null, e.name + (e.boss ? ' · 보스' : e.elite ? ' · 엘리트' : '')), h('p', null, `체력 ×${e.hp} · 속도 ${e.speed} · 누수 ${e.leak}`), e.trait ? h('p', { class: 'cost' }, e.trait) : null));
    };
    UI.modal('도감', buildTabs([
      { name: '유닛', render: () => RS.CLASSES.map((c) => h('div', { class: 'lrow' }, unitImg(c, 3), h('div', null, h('b', null, `${RS.CLASS[c].name} · ${RS.CLASS[c].role}`), h('p', null, RS.CLASS[c].desc)))) },
      { name: '증강', render: () => [1, 2, 3].map((r) => RS.AUGMENTS.filter((a) => a.rarity === r).map((a) => augRow(a.id, 1))) },
      { name: '유물', render: () => RS.RELICS.map((r) => relicRow(r.id)) },
      { name: '적', render: () => Object.keys(RS.ENEMY).map(enemyRow) },
    ]));
  };

  UI.openHelp = function () {
    const li = (t, d) => h('li', null, h('b', null, t), ' ', d);
    UI.modal('게임 방법', h('div', { class: 'help' },
      h('ol', null,
        li('소환', '골드로 무작위 유닛을 부릅니다. 같은 유닛은 한 칸에 3기까지 쌓입니다. 소환할수록 비용이 1씩 오릅니다.'),
        li('합성', '같은 칸의 같은 유닛 3기 → 다음 등급 무작위 유닛 1기. 일반 → 희귀 → 영웅 → 전설.'),
        li('배치', '유닛을 끌어서 옮깁니다. 전사·도적은 사거리가 짧아 길과 붙은 바깥 칸에, 궁수·마법사·서리술사는 안쪽 칸에 두세요. [정리] 버튼이 자동으로 해 줍니다.'),
        li('적', '적은 길을 따라 계속 돕니다. 한 바퀴를 돌 때마다 생명이 깎이고, 필드에 적이 60마리가 되면 즉시 패배합니다.'),
        li('골드', '처치할 때, 웨이브가 시작될 때 들어옵니다. 보유 골드 10당 이자 1(최대 5). 모아 두는 것도 전략입니다.'),
        li('강화', '클래스마다 레벨당 피해 +15%. 모든 등급에 적용됩니다.'),
        li('상성', '돌골렘·흑기사는 궁수·도적 피해를 절반만 받습니다. 유령·리치는 물리 피해에 강하니 마법사·서리술사로.'),
        li('모험', '맵에서 길을 골라 3막 보스까지. 전투에서 이기면 증강, 엘리트·보스는 유물을 줍니다. 보스는 제한 시간이 지나면 폭주합니다.'),
        li('저장', '칸을 이동할 때마다 자동 저장됩니다. 전투 도중 나가면 그 전투를 처음부터 다시 합니다.'),
      ),
    ));
  };
})((globalThis.RS = globalThis.RS || {}));
