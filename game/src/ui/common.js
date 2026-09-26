// 화면 공용 도구: DOM 만들기, 아이콘, 버튼, 토스트, 툴팁, 모달, 상단 바, 확인, 획득 요약
(function (RS) {
  'use strict';

  const UI = (RS.UI = RS.UI || {});

  const $ = (sel) => document.querySelector(sel);
  UI.$ = $;

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
  UI.append = append;

  const iconName = (icon) => (icon.startsWith('c_') ? icon.slice(2) + '3' : icon);
  UI.icon = (name, cls, scale) => h('img', { class: 'ic ' + (cls || ''), src: RS.iconURL(iconName(name), scale || 4), alt: '' });
  UI.unitImg = (cls, tier, extra) => h('img', { class: 'uimg ' + (extra || ''), src: RS.unitURL(cls, tier, 3), alt: '' });

  UI.fmt = (v) => Math.floor(v).toLocaleString('ko-KR');
  UI.fmtK = (v) => RS.fmtNum(v);
  UI.pct = (v) => Math.round(v * 100) + '%';

  // ── 두 번 탭 방지 ──
  // 화면이 바뀐 직후의 탭은 버린다. 빠른 두 번 탭이 새 화면의 같은 자리를 누르지 않게 한다.
  UI.lockUntil = 0;
  UI.lockInput = function (ms) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    UI.lockUntil = Math.max(UI.lockUntil, now + (ms == null ? 300 : ms));
  };
  UI.inputLocked = function () {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return now < UI.lockUntil;
  };

  UI.btn = function (label, onclick, cls, disabled) {
    return h('button', {
      class: 'btn ' + (cls || ''),
      disabled: !!disabled,
      onclick(e) {
        RS.sfx('click');
        onclick(e);
      },
    }, label);
  };

  // 되돌릴 수 없는 동작: 첫 탭은 글자만 바뀌고, 2초 안에 한 번 더 누르면 실행
  UI.btn2 = function (label, armedLabel, onConfirm, cls, disabled) {
    let timer = 0;
    const el = h('button', {
      class: 'btn ' + (cls || ''),
      disabled: !!disabled,
      onclick(e) {
        if (el.classList.contains('arm')) {
          clearTimeout(timer);
          el.classList.remove('arm');
          RS.sfx('click');
          onConfirm(e);
          return;
        }
        RS.sfx('click');
        el.classList.add('arm');
        el.dataset.label = el.textContent;
        el.textContent = armedLabel;
        timer = setTimeout(() => {
          if (!el.classList.contains('arm')) return;
          el.classList.remove('arm');
          el.textContent = el.dataset.label || label;
        }, 2000);
      },
    }, label);
    return el;
  };

  // 한 번만 눌려야 하는 버튼 묶음: 하나를 누르면 모두 잠근다
  UI.lockAll = function (root) {
    if (!root) return;
    for (const b of root.querySelectorAll('button')) b.disabled = true;
  };

  UI.hideTip = function () {
    const tip = $('#tip');
    if (tip) tip.hidden = true;
  };

  UI.show = function (id) {
    UI.hideTip();
    if (UI.current !== id) UI.lockInput();
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    UI.current = id;
    const pt = $('#ptoasts');
    if (pt) {
      pt.classList.toggle('battle', id === 'scr-battle');
      // 전투 화면에서는 전장 위에 페이지 토스트를 남기지 않는다
      if (id === 'scr-battle') pt.innerHTML = '';
    }
  };

  // ── 토스트·툴팁 ──
  UI.toast = function (text, kind) {
    const inBattle = UI.current === 'scr-battle';
    const box = inBattle ? $('#toasts') : $('#ptoasts');
    if (!box || !text) return;
    const max = inBattle ? 2 : 3;
    while (box.children.length >= max) box.firstChild.remove();
    const t = h('div', { class: 'toast ' + (kind || '') }, text);
    let dur = 1700;
    if (inBattle && UI.G && UI.G.speed >= 2) {
      dur = 1100;
      t.style.animationDuration = '1.1s';
    } else if (!inBattle) {
      dur = 2400;
      t.style.animationDuration = '2.4s';
    }
    box.appendChild(t);
    setTimeout(() => t.remove(), dur);
  };

  // 숫자가 잠깐 떠오르는 표시 (HUD 옆)
  UI.hudFloat = function (anchor, text, kind) {
    if (!anchor) return;
    const f = h('span', { class: 'hudfloat ' + (kind || '') }, text);
    anchor.appendChild(f);
    setTimeout(() => f.remove(), 700);
  };

  UI.tip = function (anchor, title, desc, extra, action) {
    const tip = $('#tip');
    tip.innerHTML = '';
    append(tip, [
      h('b', null, title),
      desc ? h('p', null, desc) : null,
      extra ? h('p', { class: 'cost' }, extra) : null,
      action ? h('div', { class: 'tip-act' }, UI.btn(action.label, (e) => {
        e.stopPropagation();
        tip.hidden = true;
        action.onClick();
      }, 'gold sm')) : null,
    ]);
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
  // 화면 좌표에 툴팁 (전장의 적처럼 DOM 요소가 없는 대상)
  UI.tipAt = function (x, y, title, desc, extra, action) {
    const rect = { left: x - 10, right: x + 10, top: y - 14, bottom: y + 14, width: 20, height: 28 };
    UI.tip({ getBoundingClientRect: () => rect }, title, desc, extra, action);
  };

  // ── 카드·칩 ──
  UI.relicTitle = (r) => `${r.name} · ${RS.RARITY_NAME.relic[r.rarity]} 유물`;

  UI.relicChip = function (id, run) {
    const r = RS.REL[id];
    let extra = r.cost ? '대가 · ' + r.cost : null;
    const st = run && run.relicState[id];
    if (st && st.uses != null) extra = `남은 횟수 ${st.uses}`;
    else if (st && st.charges != null) extra = `남은 충전 ${st.charges}`;
    else if (st && st.count != null) extra = `남은 횟수 ${st.count}`;
    else if (st && st.active === false) extra = '깨짐';
    return h('button', {
      class: 'chip relic r' + r.rarity,
      'aria-label': r.name,
      onclick(e) {
        UI.tip(e.currentTarget, UI.relicTitle(r), r.desc, extra);
      },
    }, UI.icon(r.icon, '', 3));
  };

  UI.augCard = function (id, selected, onclick, extra) {
    const a = RS.augDef(id);
    const up = RS.isUpgraded(id);
    return h('button', { class: `card r${a.rarity}${selected ? ' sel' : ''}`, onclick },
      UI.icon(a.icon, 'cic', 4),
      h('div', { class: 'cbody' },
        h('div', { class: 'ctop' }, h('span', { class: 'rar' }, RS.RARITY_NAME.aug[a.rarity]), h('b', null, a.name + (up ? '+' : '')), a.unique ? null : h('small', { class: 'stack' }, '중첩 가능')),
        h('p', null, a.desc + (up ? ' (연마: 효과 ×1.5)' : '')),
        a.cost ? h('p', { class: 'cost' }, '대가 · ' + a.cost) : null,
        extra || null,
      ),
    );
  };

  UI.relicCard = function (id, selected, onclick, price) {
    const r = RS.REL[id];
    return h('button', { class: `card relic rr${r.rarity}${selected ? ' sel' : ''}`, onclick },
      UI.icon(r.icon, 'cic', 4),
      h('div', { class: 'cbody' },
        h('div', { class: 'ctop' }, h('span', { class: 'rar' }, RS.RARITY_NAME.relic[r.rarity] + ' 유물'), h('b', null, r.name)),
        h('p', null, r.desc),
        r.cost ? h('p', { class: 'cost' }, '대가 · ' + r.cost) : null,
      ),
      price != null ? h('span', { class: 'price' }, UI.icon('coin', '', 2), price) : null,
    );
  };

  // ── 상단 바 ──
  UI.keysEl = function (run) {
    if (run.act > 3 && !run.keys.ruby) return null;
    const k = run.keys;
    if (!k.ruby && !k.emerald && !k.sapphire && run.act === 1 && run.floor < 2) return null;
    const one = (name, has, label) => h('span', { class: 'keyic' + (has ? ' on' : ''), title: label }, UI.icon(name, '', 2));
    return h('button', {
      class: 'keys',
      'aria-label': '열쇠',
      onclick(e) {
        UI.tip(e.currentTarget, '균열의 열쇠', '루비(휴식처에서 회수), 에메랄드(불타는 엘리트 처치), 사파이어(보물 상자에서 유물 대신) 세 개를 모으면 3막 보스 뒤에 4막이 열린다.');
      },
    }, one('key_ruby', k.ruby, '루비'), one('key_emerald', k.emerald, '에메랄드'), one('key_sapphire', k.sapphire, '사파이어'));
  };

  UI.topbar = function (run, title) {
    return h('div', { class: 'topbar' },
      h('div', { class: 'tb-title' }, title),
      h('div', { class: 'tb-stats' },
        UI.keysEl(run),
        h('span', { class: 'stat' }, UI.icon('heart', '', 3), h('b', null, `${Math.ceil(run.life)}/${run.maxLife}`)),
        h('span', { class: 'stat' }, UI.icon('coin', '', 3), h('b', null, UI.fmt(run.gold))),
        UI.btn('빌드', () => UI.openBuild(), 'sm tb-build'),
        h('button', { class: 'btn sm menu-btn', 'aria-label': '메뉴', onclick() { RS.sfx('click'); UI.openMenu(); } }, '≡'),
      ),
    );
  };

  UI.relicStrip = function (run) {
    if (!run.relics.length && !run.curses.length && !run.items.length) return null;
    return h('div', { class: 'strip scroll-x' },
      run.relics.map((id) => UI.relicChip(id, run)),
      run.curses.map((id) => {
        const c = RS.CURSE[id];
        return h('button', { class: 'chip curse', 'aria-label': c.name, onclick: (e) => UI.tip(e.currentTarget, `저주 · ${c.name}`, c.desc) }, UI.icon('curse', '', 3));
      }),
      run.items.map((id) => {
        const it = RS.ITEM[id];
        return h('button', { class: 'chip item', 'aria-label': it.name, onclick: (e) => UI.tip(e.currentTarget, `소모품 · ${it.name}`, it.desc + ' (전투 중 사용)') }, UI.icon(it.icon, '', 3));
      }),
    );
  };

  // 보상·상점·이벤트 같은 페이지 화면.
  // 카드를 고르는 것처럼 같은 화면을 다시 그릴 때는 UI.keepScroll = true 로 스크롤을 지킨다.
  UI.page = function (title, sub, body, footer) {
    const scr = $('#scr-page');
    const run = UI.G.run;
    const prev = scr.querySelector('.page');
    const keep = UI.keepScroll && prev && UI.current === 'scr-page' ? prev.scrollTop : 0;
    const selOnly = !!UI.keepScroll && UI.current === 'scr-page';
    UI.keepScroll = false;
    scr.innerHTML = '';
    delete scr.dataset.view;
    append(scr, [
      run ? UI.topbar(run, title) : h('div', { class: 'topbar' }, h('div', { class: 'tb-title' }, title)),
      run ? UI.relicStrip(run) : null,
      h('div', { class: 'page scroll' }, sub ? h('p', { class: 'page-sub' }, sub) : null, body),
      footer ? h('div', { class: 'page-foot' }, footer) : null,
    ]);
    UI.show('scr-page');
    // 같은 화면을 다시 그려도(이벤트 다음 단계 등) 두 번 탭이 새 버튼을 누르지 않게
    UI.lockInput(selOnly ? 120 : 300);
    const pg = scr.querySelector('.page');
    pg.scrollTop = keep;
    if (keep) {
      const s = pg.querySelector('.card.sel, .bcell.sel, .btn.option.sel');
      if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
    }
  };

  // ── 모달 ──
  UI.modal = function (title, body, onClose) {
    UI.hideTip();
    const m = $('#modal');
    const box = m.querySelector('.modal-box');
    box.innerHTML = '';
    append(box, [
      h('div', { class: 'modal-head' }, h('b', null, title), h('button', { class: 'btn sm x', onclick: () => UI.closeModal(), 'aria-label': '닫기' }, '닫기')),
      h('div', { class: 'modal-body scroll' }, body),
    ]);
    m.hidden = false;
    UI.lockInput(250);
    UI.onModalClose = onClose || null;
    UI.G.setModal(true);
  };
  UI.closeModal = function () {
    UI.hideTip();
    const m = $('#modal');
    // 모달을 닫는 탭이 아래 화면을 누르지 않게
    if (!m.hidden) UI.lockInput(250);
    m.hidden = true;
    UI.G.setModal(false);
    const cb = UI.onModalClose;
    UI.onModalClose = null;
    if (cb) cb();
  };
  // 모달 안의 다른 모달로 바꿀 때: 닫기 콜백을 부르지 않고 내용만 바꾼다
  UI.swapModal = function (fn) {
    UI.onModalClose = null;
    fn();
  };

  // 확인 창: 취소하면 아무 일도 없다
  UI.confirm = function (title, text, okLabel, onOk, onCancel) {
    UI.modal(title, h('div', { class: 'confirm' },
      h('p', null, text),
      h('div', { class: 'row2' },
        UI.btn('취소', () => UI.closeModal()),
        UI.btn(okLabel, () => {
          UI.onModalClose = null;
          UI.closeModal();
          onOk();
        }, 'gold'),
      ),
    ), onCancel || null);
  };

  // 탭 묶음
  UI.tabs = function (tabs) {
    const head = h('div', { class: 'tabs' });
    const body = h('div', { class: 'tabbody' });
    const sel = (k) => {
      for (const b of head.children) b.classList.toggle('on', b.dataset.k === String(k));
      body.innerHTML = '';
      if (tabs[k].sub) body.appendChild(h('p', { class: 'dim small tabsub' }, tabs[k].sub));
      append(body, tabs[k].render());
    };
    tabs.forEach((t, k) => head.appendChild(h('button', { class: 'tab', 'data-k': String(k), onclick: () => sel(k) }, t.name)));
    sel(0);
    return h('div', null, head, body);
  };

  // 목록 행
  UI.augRow = function (id, count) {
    const a = RS.augDef(id);
    const up = RS.isUpgraded(id);
    return h('div', { class: `lrow r${a.rarity}` }, UI.icon(a.icon, '', 3),
      h('div', null, h('b', null, a.name + (up ? '+' : '') + (count > 1 ? ` ×${count}` : '')), h('p', null, a.desc + (up ? ' (연마: ×1.5)' : '')), a.cost ? h('p', { class: 'cost' }, '대가 · ' + a.cost) : null));
  };
  UI.relicRow = function (id) {
    const r = RS.REL[id];
    return h('div', { class: `lrow rr${r.rarity}` }, UI.icon(r.icon, '', 3),
      h('div', null, h('b', null, `${r.name} · ${RS.RARITY_NAME.relic[r.rarity]}`), h('p', null, r.desc), r.cost ? h('p', { class: 'cost' }, '대가 · ' + r.cost) : null));
  };

  // 보드 미리보기 (칸 고르기용)
  UI.boardPicker = function (run, opts) {
    const grid = h('div', { class: 'bpick' });
    for (let i = 0; i < RS.FIELD.SIZE; i++) {
      const s = run.board[i];
      const rune = run.runes[i] ? RS.RUNE[run.runes[i]] : null;
      const ok = opts.filter(i, s, rune);
      grid.appendChild(h('button', {
        class: 'bcell' + (ok ? '' : ' off') + (opts.selected === i ? ' sel' : '') + (RS.isInner(i) ? ' inner' : ''),
        style: rune ? `--rune:${rune.color}` : null,
        disabled: !ok,
        onclick() {
          RS.sfx('click');
          opts.onPick(i);
        },
      },
      s ? UI.unitImg(s.cls, s.tier) : null,
      s && s.n > 1 ? h('span', { class: 'bn' }, '×' + s.n) : null,
      rune ? h('span', { class: 'brune' + (rune.bad ? ' bad' : '') }, rune.name.replace(' 룬', '').replace('금 간 칸', '금')) : null));
    }
    return grid;
  };

  // ── 획득 요약: 효과를 적용하기 전후를 비교해 무엇을 얻고 잃었는지 보여 준다 ──
  const countOf = (list) => {
    const m = {};
    for (const x of list) m[x] = (m[x] || 0) + 1;
    return m;
  };
  UI.snapGains = function (run) {
    const units = {};
    for (const s of run.board) if (s) units[s.cls + ':' + s.tier] = (units[s.cls + ':' + s.tier] || 0) + s.n;
    return {
      relics: run.relics.slice(), curses: run.curses.slice(), augs: run.augments.slice(), items: run.items.slice(),
      units, gold: run.gold, maxLife: run.maxLife, life: run.life,
      keys: Object.assign({}, run.keys), classLv: Object.assign({}, run.classLv),
    };
  };
  UI.diffGains = function (a, run) {
    const b = UI.snapGains(run);
    const out = [];
    const diffList = (x, y, kind) => {
      const cx = countOf(x);
      const cy = countOf(y);
      for (const id in cy) for (let k = 0; k < cy[id] - (cx[id] || 0); k++) out.push({ k: kind, id, gain: true });
      for (const id in cx) for (let k = 0; k < cx[id] - (cy[id] || 0); k++) out.push({ k: kind, id, gain: false });
    };
    diffList(a.relics, b.relics, 'relic');
    diffList(a.curses, b.curses, 'curse');
    diffList(a.augs, b.augs, 'aug');
    // 연마: 'x'를 잃고 'x+'를 얻었으면 한 장으로 보여 준다
    for (const g of out) {
      if (g.k !== 'aug' || !g.gain || !RS.isUpgraded(g.id)) continue;
      const base = g.id.slice(0, -1);
      const lost = out.find((x) => x.k === 'aug' && !x.gain && x.id === base && !x.paired);
      if (lost) {
        lost.paired = true;
        g.up = true;
      }
    }
    for (let k = out.length - 1; k >= 0; k--) if (out[k].paired) out.splice(k, 1);
    diffList(a.items, b.items, 'item');
    const keys = new Set(Object.keys(a.units).concat(Object.keys(b.units)));
    for (const key of keys) {
      const d = (b.units[key] || 0) - (a.units[key] || 0);
      if (d) {
        const [cls, tier] = key.split(':');
        out.push({ k: 'unit', cls, tier: +tier, n: d });
      }
    }
    for (const kk of ['ruby', 'emerald', 'sapphire']) if (b.keys[kk] && !a.keys[kk]) out.push({ k: 'key', id: kk });
    const cls = Object.keys(b.classLv);
    const dl = cls.map((c) => b.classLv[c] - (a.classLv[c] || 0));
    if (dl.some(Boolean)) {
      if (dl.every((d) => d === dl[0])) out.push({ k: 'lv', n: dl[0] });
      else cls.forEach((c, k) => dl[k] && out.push({ k: 'lv', n: dl[k], cls: c }));
    }
    if (b.maxLife !== a.maxLife) out.push({ k: 'maxLife', n: b.maxLife - a.maxLife });
    else if (Math.round(b.life) !== Math.round(a.life)) out.push({ k: 'life', n: Math.round(b.life - a.life) });
    if (Math.round(b.gold) !== Math.round(a.gold)) out.push({ k: 'gold', n: Math.round(b.gold - a.gold) });
    return out;
  };
  const KEY_NAME = { ruby: '루비', emerald: '에메랄드', sapphire: '사파이어' };
  UI.gainsView = function (list) {
    const sign = (n) => (n > 0 ? '+' + n : String(n));
    return h('div', { class: 'gains' }, list.map((g) => {
      if (g.k === 'relic') return g.gain ? UI.relicCard(g.id, false, () => {}) : h('p', { class: 'lost' }, `잃음 · ${RS.REL[g.id].name}`);
      if (g.k === 'aug') {
        if (!g.gain) return h('p', { class: 'lost' }, `잃음 · ${RS.augDef(g.id).name}${RS.isUpgraded(g.id) ? '+' : ''}`);
        return g.up ? [h('p', { class: 'good' }, `연마 · ${RS.augDef(g.id).name}+`), UI.augCard(g.id, false, () => {})] : UI.augCard(g.id, false, () => {});
      }
      if (g.k === 'curse') {
        const c = RS.CURSE[g.id];
        return g.gain
          ? h('div', { class: 'card curse' }, UI.icon('curse', 'cic', 4), h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, '저주'), h('b', null, c.name)), h('p', null, c.desc)))
          : h('p', { class: 'good' }, `사라짐 · 저주 ${c.name}`);
      }
      if (g.k === 'item') {
        const it = RS.ITEM[g.id];
        return h('div', { class: 'grow-line' + (g.gain ? '' : ' lost') }, UI.icon(it.icon, '', 3), h('span', null, `${g.gain ? '소모품' : '잃음 · 소모품'} ${it.name}`));
      }
      if (g.k === 'unit') {
        return h('div', { class: 'grow-line' + (g.n < 0 ? ' lost' : '') }, UI.unitImg(g.cls, g.tier), h('span', { class: 'tier' + g.tier }, `${RS.TIER[g.tier].name} ${RS.CLASS[g.cls].name} ${sign(g.n)}`));
      }
      if (g.k === 'key') return h('div', { class: 'grow-line' }, UI.icon('key_' + g.id, '', 3), h('span', { class: 'good' }, `${KEY_NAME[g.id]} 열쇠`));
      if (g.k === 'lv') return h('p', { class: g.n > 0 ? 'good' : 'bad' }, g.cls ? `${RS.CLASS[g.cls].name} 강화 ${sign(g.n)}` : `모든 클래스 강화 ${sign(g.n)}`);
      if (g.k === 'maxLife') return h('p', { class: g.n > 0 ? 'good' : 'bad' }, `최대 생명 ${sign(g.n)}`);
      if (g.k === 'life') return h('p', { class: g.n > 0 ? 'good' : 'bad' }, `생명 ${sign(g.n)}`);
      if (g.k === 'gold') return h('p', { class: g.n > 0 ? 'gold-t' : 'bad' }, `골드 ${sign(g.n)}`);
      return null;
    }));
  };
  UI.showGains = function (title, list, onDone, text) {
    if ((!list || !list.length) && !text) {
      if (onDone) onDone();
      return;
    }
    UI.modal(title || '획득', h('div', null,
      text ? h('p', { class: 'gains-text' }, text) : null,
      UI.gainsView(list || []),
      h('div', { class: 'row2 gains-foot' }, UI.btn('계속', () => UI.closeModal(), 'gold')),
    ), onDone || null);
  };
})((globalThis.RS = globalThis.RS || {}));
