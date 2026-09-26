// 전투 화면: HUD, 유닛 패널, 소모품, 전장 입력
(function (RS) {
  'use strict';

  const F = RS.FIELD;
  const UI = RS.UI;
  const { h, append, $, btn, icon, unitImg, fmt, fmtK, pct } = UI;

  UI.initBattle = function () {
    for (const img of document.querySelectorAll('img[data-icon]')) img.src = RS.iconURL(img.dataset.icon, 3);
    $('#b-summon').addEventListener('click', () => UI.doSummon());
    $('#b-upg').addEventListener('click', () => {
      RS.sfx('click');
      UI.setPanel(UI.panelMode === 'upgrade' ? 'idle' : 'upgrade');
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
      UI.openPause();
    });
    bindField();
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

  UI.showBattle = function () {
    const G = UI.G;
    UI.show('scr-battle');
    UI.fitCanvas();
    UI.select(-1);
    UI.setPanel('idle');
    UI.renderItems();
    UI.hudCache = {};
    UI.updateHud(true);
    const b = G.battle;
    const st = b.stage;
    if (G.run.stats.battles === 0) {
      UI.toast('소환 버튼으로 유닛을 부르세요!');
      setTimeout(() => UI.toast('같은 유닛 3기가 모이면 합성할 수 있어요'), 1800);
    } else if (b.kind === 'boss') {
      const boss = st.spec && st.spec.boss ? st.spec.boss : RS.actDef(G.run).boss;
      UI.toast(`보스전 · 마지막 웨이브에 ${RS.ENEMY[boss].name} 등장`, 'warn');
    } else if (b.kind === 'elite') {
      const BUFF = { hp: '체력 +40%', fast: '속도 +30%', regen: '재생', armor: '받는 피해 -25%' };
      UI.toast(G.run.burning ? `불타는 엘리트(${BUFF[st.spec.burnBuff] || '강화'}) · 이기면 에메랄드 열쇠` : '엘리트전 · 마지막 웨이브에 강적 등장', 'warn');
    }
    if (G.run.lament > 0) setTimeout(() => UI.toast('문지기의 탄식: 첫 웨이브 적 체력 1', 'good'), 900);
    if (G.run.tax > 0) setTimeout(() => UI.toast(`문지기의 세금: 웨이브 골드 없음 (${G.run.tax}번 남음)`, 'warn'), 1400);
  };

  function bindField() {
    const cv = $('#cv');
    const toLogical = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * F.W, y: ((e.clientY - r.top) / r.height) * F.H };
    };
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      const G = UI.G;
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
      const G = UI.G;
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
        UI.G.renderer.drag = null;
      }
    });
  }

  UI.sel = -1;
  UI.select = function (i) {
    const G = UI.G;
    UI.sel = i;
    if (G.renderer) G.renderer.sel = i;
    if (i >= 0 && G.run && G.run.board[i]) UI.setPanel('unit');
    else if (UI.panelMode === 'unit') UI.setPanel('idle');
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
      UI.toast('벨벳 초커: 이번 웨이브에는 더 소환할 수 없어요', 'warn');
    } else if (res.err === 'locked') {
      RS.sfx('error');
      UI.toast('속삭이는 귀걸이: 준비 시간에는 소환할 수 없어요', 'warn');
    } else {
      RS.sfx(res.tier > 0 ? 'rare' : 'summon');
      if (res.tier > 0) UI.toast(`${RS.TIER[res.tier].name} ${RS.CLASS[res.cls].name} 소환!`, 't' + res.tier);
      if (res.clover) UI.toast('네잎클로버! 비용 반환', 'good');
      if (res.twin != null) UI.toast('한 기가 더 따라왔다!', 'good');
      const s = G.run.board[res.slot];
      if (s && s.n === 3 && s.tier < 3 && (UI.mergeHints = (UI.mergeHints || 0) + 1) <= 2) {
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
    const G = UI.G;
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
    const G = UI.G;
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
        h('div', { class: 'pstat' }, h('span', null, b.M.summonCap ? '남은 소환' : '다음 이자'), (refs.int = h('b', null, '0'))),
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
      const rune = run.runes[i] ? RS.RUNE[run.runes[i]] : null;
      append(p, h('div', { class: 'punit' },
        unitImg(s.cls, s.tier, 'big'),
        h('div', { class: 'pinfo' },
          h('div', { class: 'pname' }, h('b', { class: 'tier' + s.tier }, `${T.name} ${C.name}`), ` ×${s.n}`, (refs.dps = h('span', { class: 'pdps' }))),
          (refs.stats = h('div', { class: 'pstats' })),
          h('p', { class: 'pdesc' }, rune ? `${rune.name}: ${rune.desc}` : `${C.role} · ${C.desc}`),
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
              UI.toast(r.err === 'locked' ? '속삭이는 귀걸이: 준비 시간에는 강화할 수 없어요' : '골드가 부족해요', 'warn');
            } else {
              RS.sfx('upgrade');
            }
            UI.updateHud(true);
          },
        }, unitImg(c, 0), h('span', { class: 'un' }, RS.CLASS[c].name), h('b', { class: 'lv' }), h('span', { class: 'cost' }));
        refs.rows[c] = el;
        grid.appendChild(el);
      }
      append(p, h('div', { class: 'pupg' }, h('p', { class: 'phint' }, `클래스 강화 · 레벨당 피해 +15%${b.M.upgradeDouble ? ' · 한계 돌파: 한 번에 +2' : ''}`), grid));
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
    const G = UI.G;
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
    UI.starBtn = null;
    const b = G.battle;
    if (b && b.M.stars) {
      // 별의 섭정: 별 3개로 별똥별
      UI.starBtn = btn('별 0', () => {
        if (!G.battle || !G.battle.starfall()) {
          RS.sfx('error');
          UI.toast('별이 3개 모여야 해요 (웨이브마다 1개)', 'warn');
          return;
        }
        RS.sfx('bomb');
        UI.toast('별똥별!', 'good');
        UI.updateHud(true);
      }, 'sm star');
      bar.appendChild(UI.starBtn);
    }
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
    const G = UI.G;
    const b = G.battle;
    const run = G.run;
    if (!b || !run) return;
    if (force) UI.hudCache = {};
    const c = UI.hudCache;
    const blind = !!b.M.blindfold;
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
      setText($('#h-wave-t'), 'wt', blind ? '?' : `${Math.ceil(b.prep)}초`);
    } else {
      setText($('#h-wave-v'), 'wv', `${b.waveIdx}/${nW}`);
      setText($('#h-wave-t'), 'wt', b.waveIdx < nW ? (blind ? '?' : `${Math.max(0, Math.ceil(b.waveT))}초`) : '마지막');
    }
    const cost = b.summonCost();
    setText($('#summon-cost'), 'cost', b.summonLimit() <= 0 ? '제한' : `${cost}G`);
    const canSummon = run.gold >= cost && b.summonLimit() > 0;
    if (c.canS !== canSummon) {
      c.canS = canSummon;
      $('#b-summon').classList.toggle('off', !canSummon);
    }
    setText($('#b-speed'), 'spd', `x${G.speed}`);
    if (UI.starBtn) {
      setText(UI.starBtn, 'star', `별똥별 ${b.stars}/3`);
      const on = b.canStarfall();
      if (c.star !== on) {
        c.star = on;
        UI.starBtn.classList.toggle('off', !on);
      }
    }
    // 보스
    const bb = $('#bossbar');
    if (b.boss) {
      if (bb.hidden) {
        bb.hidden = false;
        $('#boss-name').textContent = b.boss.def.name + (b.bosses.length > 1 ? ` 외 ${b.bosses.filter((x) => !x.dead).length - 1}` : '');
      }
      const w = blind ? '100%' : Math.max(0, (b.boss.hp / b.boss.maxHp) * 100).toFixed(1) + '%';
      if (c.bhp !== w) {
        c.bhp = w;
        $('#boss-hp').style.width = w;
      }
      setText($('#boss-t'), 'bt', b.enraged ? '폭주!' : blind ? '??' : `${Math.ceil(b.bossTimer)}초`);
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
      if (b.M.summonCap) setText(refs.int, 'pint', `${b.summonLimit()}회`);
      else setText(refs.int, 'pint', inter > 0 ? `+${inter + (b.M.interestBonus || 0)}G` : '10G당 1');
    } else if (UI.panelMode === 'unit') {
      if (!run.board[UI.sel]) UI.select(-1);
      else UI.refreshUnitStats();
    } else if (UI.panelMode === 'upgrade' && refs.rows) {
      for (const cl of RS.CLASSES) {
        const el = refs.rows[cl];
        const lv = run.classLv[cl];
        const cst = b.upgradeCost(cl);
        setText(el.querySelector('.lv'), 'lv' + cl, `Lv ${lv}`);
        setText(el.querySelector('.cost'), 'uc' + cl, cst ? `${cst}G` : '무료');
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
      case 'summon':
        if (ev.free) RS.sfx('summon');
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
})((globalThis.RS = globalThis.RS || {}));
