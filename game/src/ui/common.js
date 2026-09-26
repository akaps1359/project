// 화면 공용 도구: DOM 만들기, 아이콘, 버튼, 토스트, 툴팁, 모달, 상단 바
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

  UI.show = function (id) {
    for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
    UI.current = id;
  };

  // ── 토스트·툴팁 ──
  UI.toast = function (text, kind) {
    const box = UI.current === 'scr-battle' ? $('#toasts') : $('#ptoasts');
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
        h('p', null, a.desc + (up ? ' (강화: 효과 ×1.5)' : '')),
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
        UI.btn('빌드', () => UI.openBuild(), 'sm'),
      ),
    );
  };

  UI.relicStrip = function (run) {
    if (!run.relics.length && !run.curses.length && !run.items.length) return null;
    return h('div', { class: 'strip scroll-x' },
      run.relics.map((id) => UI.relicChip(id, run)),
      run.curses.map((id) => {
        const c = RS.CURSE[id];
        return h('button', { class: 'chip curse', onclick: (e) => UI.tip(e.currentTarget, `저주 · ${c.name}`, c.desc) }, UI.icon('curse', '', 3));
      }),
      run.items.map((id) => {
        const it = RS.ITEM[id];
        return h('button', { class: 'chip item', onclick: (e) => UI.tip(e.currentTarget, `소모품 · ${it.name}`, it.desc + ' (전투 중 사용)') }, UI.icon(it.icon, '', 3));
      }),
    );
  };

  // 보상·상점·이벤트 같은 페이지 화면
  UI.page = function (title, sub, body, footer) {
    const scr = $('#scr-page');
    const run = UI.G.run;
    scr.innerHTML = '';
    append(scr, [
      run ? UI.topbar(run, title) : h('div', { class: 'topbar' }, h('div', { class: 'tb-title' }, title)),
      run ? UI.relicStrip(run) : null,
      h('div', { class: 'page scroll' }, sub ? h('p', { class: 'page-sub' }, sub) : null, body),
      footer ? h('div', { class: 'page-foot' }, footer) : null,
      h('div', { id: 'ptoasts', class: 'ptoasts' }),
    ]);
    UI.show('scr-page');
    scr.querySelector('.page').scrollTop = 0;
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
    UI.G.setModal(true);
  };
  UI.closeModal = function () {
    $('#modal').hidden = true;
    UI.G.setModal(false);
    const cb = UI.onModalClose;
    UI.onModalClose = null;
    if (cb) cb();
  };

  // 탭 묶음
  UI.tabs = function (tabs) {
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
  };

  // 목록 행
  UI.augRow = function (id, count) {
    const a = RS.augDef(id);
    const up = RS.isUpgraded(id);
    return h('div', { class: `lrow r${a.rarity}` }, UI.icon(a.icon, '', 3),
      h('div', null, h('b', null, a.name + (up ? '+' : '') + (count > 1 ? ` ×${count}` : '')), h('p', null, a.desc + (up ? ' (강화: ×1.5)' : '')), a.cost ? h('p', { class: 'cost' }, '대가 · ' + a.cost) : null));
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
})((globalThis.RS = globalThis.RS || {}));
