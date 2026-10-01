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
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (el.classList.contains('arm')) {
          // 빠른 두 번 탭(실수)은 확인으로 치지 않는다
          if (now - (el._armedAt || 0) < 400) return;
          clearTimeout(timer);
          el.classList.remove('arm');
          RS.sfx('click');
          onConfirm(e);
          return;
        }
        RS.sfx('click');
        el._armedAt = now;
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

  // force 없이 부르면(스크롤 등) 방금 맵을 스스로 굴려 띄운 툴팁은 남긴다
  UI.tipPinUntil = 0;
  UI.hideTip = function (force) {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!force && now < UI.tipPinUntil) return;
    const tip = $('#tip');
    if (tip) tip.hidden = true;
  };

  // ── 설정 (메타 기록에 저장). RS.settings.reduceFx 는 렌더러가 읽는다 ──
  function settingsObj() {
    const meta = UI.G && UI.G.meta;
    if (!meta) return {};
    if (!meta.settings || typeof meta.settings !== 'object') meta.settings = {};
    return meta.settings;
  }
  RS.settings = {
    get reduceFx() { return !!settingsObj().reduceFx; },
    set reduceFx(v) { settingsObj().reduceFx = !!v; },
  };
  UI.setReduceFx = function (on) {
    RS.settings.reduceFx = on;
    UI.applySettings();
    if (UI.G && UI.G.saveMeta) UI.G.saveMeta();
  };
  UI.applySettings = function () {
    if (document.body) document.body.classList.toggle('rfx', RS.settings.reduceFx);
  };
  // 설정 토글 버튼 (타이틀·메뉴 공용)
  UI.fxBtn = function (cls) {
    // 누르면 일어날 일을 쓴다 (켜져 있으면 금색 테두리로 표시)
    const sync = () => {
      const on = RS.settings.reduceFx;
      el.textContent = on ? '효과 되돌리기' : '효과 줄이기';
      el.classList.toggle('fxon', on);
      el.setAttribute('aria-pressed', String(on));
    };
    const el = UI.btn('효과 줄이기', () => {
      UI.setReduceFx(!RS.settings.reduceFx);
      sync();
    }, cls || '');
    el.setAttribute('aria-label', '효과 줄이기');
    sync();
    return el;
  };

  // 받침 조사: 브론으로 · 엘라로 · 아스트라로
  UI.josaRo = function (word) {
    const c = word.charCodeAt(word.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return word + '로';
    const jong = (c - 0xac00) % 28;
    return word + (jong === 0 || jong === 8 ? '로' : '으로');
  };

  UI.show = function (id) {
    UI.hideTip(true);
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
  // 전투 중 강타 띠가 떠 있으면(좁은 화면에서는 토스트가 그 위에 겹친다) 짧은 좋은 소식만 띄우고,
  // 긴 안내는 패널의 안내 카드로 미룬다 (UI.tipQueue)
  UI.tipQueue = UI.tipQueue || [];
  UI.queueTip = function (k, text) {
    if (UI.tipQueue.some((t) => t.k === k)) return;
    UI.tipQueue.push({ k, text, shown: 0 });
  };
  UI.toast = function (text, kind) {
    const inBattle = UI.current === 'scr-battle';
    const box = inBattle ? $('#toasts') : $('#ptoasts');
    if (!box || !text) return;
    const long = text.length > 28;
    if (inBattle) {
      const sb = $('#strikebar');
      const strike = sb && !sb.hidden && !$('#scr-battle').classList.contains('roomy');
      if (strike && !(kind === 'good' && !long)) {
        if (long) UI.queueTip('t:' + text, text);
        return;
      }
    }
    // 전투 중 긴 안내는 한 번에 하나만 (겹쳐 쌓이면 읽을 수 없다)
    // 강타 띠가 아래 띠를 차지하고 있으면 토스트는 그 위에 하나만
    const sbEl = inBattle && $('#strikebar');
    const crowded = !!(sbEl && !sbEl.hidden && sbEl.parentElement === $('#lane'));
    const max = inBattle ? (crowded || long || box.querySelector('.toast.long') ? 1 : 2) : 3;
    while (box.children.length >= max) box.firstChild.remove();
    const t = h('div', { class: 'toast ' + (kind || '') + (long ? ' long' : '') }, text);
    let dur = 1700;
    if (inBattle && UI.G && UI.G.speed >= 2) {
      dur = 1100;
      t.style.animationDuration = '1.1s';
    } else if (!inBattle) {
      dur = 2400;
      t.style.animationDuration = '2.4s';
    }
    // 긴 설명(보스 기술 첫 안내 등)은 읽을 시간을 더 준다
    if (text.length > 28) {
      dur = Math.min(4200, Math.max(dur, text.length * 60));
      t.style.animationDuration = dur / 1000 + 's';
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

  UI.tip = function (anchor, title, desc, extra, action, opts) {
    const tip = $('#tip');
    tip.innerHTML = '';
    tip.dataset.owner = ''; // 누가 연 툴팁인지 (맵 칸 두 번 누르기 확인용, 연 쪽이 다시 적는다)
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
    tip.classList.toggle('sheet', !!(opts && opts.sheet));
    if (opts && opts.sheet) {
      // 아래쪽에 가로로 꽉 찬 시트 (맵: 고를 칸을 가리지 않게). bottom 은 기준 요소 위
      tip.style.width = '';
      tip.style.left = '';
      tip.style.top = '';
      const base = opts.above ? opts.above.getBoundingClientRect().top : window.innerHeight;
      tip.style.bottom = Math.max(8, window.innerHeight - base + 6) + 'px';
      return;
    }
    tip.style.bottom = '';
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
    $('#tip').classList.remove('sheet');
    const rect = { left: x - 10, right: x + 10, top: y - 14, bottom: y + 14, width: 20, height: 28 };
    UI.tip({ getBoundingClientRect: () => rect }, title, desc, extra, action);
  };

  // ── 선택지 글의 대가(붉게)와 이득(금빛)을 표시: 문장 전체가 아니라 그 토막만 ──
  const COST_RE = /(최대 생명|생명|골드) -\d+%?(\(최대 기준\))?|저주 \[[^\]]+\]|골드를 모두 잃는다|\[금 간 칸\]이 된다/g;
  const GAIN_RE = /(최대 생명|생명|골드) \+\d+/g;
  UI.markCosts = function (desc) {
    if (!desc) return desc;
    const marks = [];
    const scan = (re, cls) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(desc))) marks.push({ a: m.index, b: m.index + m[0].length, cls });
    };
    scan(COST_RE, 'cost');
    scan(GAIN_RE, 'gold-t');
    if (!marks.length) return desc;
    marks.sort((x, y) => x.a - y.a);
    const out = [];
    let at = 0;
    for (const mk of marks) {
      if (mk.a < at) continue;
      if (mk.a > at) out.push(desc.slice(at, mk.a));
      out.push(h('span', { class: mk.cls }, desc.slice(mk.a, mk.b)));
      at = mk.b;
    }
    if (at < desc.length) out.push(desc.slice(at));
    return out;
  };
  // 고를 수 없는 선택지의 이유 한 줄
  UI.optionBlockReason = function (run, desc) {
    const m = desc && /골드 -(\d+)(?!%)/.exec(desc);
    if (m && run && run.gold < +m[1]) return `골드 부족 (${Math.floor(run.gold)}/${m[1]})`;
    const lm = desc && /^생명 -(\d+)(?![%\d])/.exec(desc);
    if (lm && run && run.life <= +lm[1]) return `생명 부족 (${Math.ceil(run.life)}/${lm[1]})`;
    if (desc && /회복|생명 \+/.test(desc) && run && RS.canHeal && !RS.canHeal(run)) return '시든 꽃의 낙인: 회복할 수 없어요';
    if (desc && /금 간 칸 하나를 되돌린다/.test(desc) && run && run.runes && run.runes.indexOf('crack') < 0) return '금 간 칸이 없어요';
    return '지금은 고를 수 없어요';
  };

  // ── 저주 설명: 글 속 '저주 [이름]' 과 '무작위 저주' 를 찾아 무엇인지 풀어 준다 ──
  UI.curseRefs = function (text) {
    const list = [];
    let random = false;
    if (!text) return null;
    const re = /저주 \[([^\]]+)\]/g;
    let m;
    while ((m = re.exec(text))) {
      const c = RS.CURSES.find((x) => x.name === m[1]);
      if (c && list.indexOf(c) < 0) list.push(c);
    }
    if (/무작위 저주|저주 하나와|저주도 숨어|· 저주 ·|저주를 받는다/.test(text)) random = true;
    return list.length || random ? { list, random } : null;
  };
  const RANDOM_POOL = () => RS.CURSES.filter((c) => !c.permanent);
  // 카드·선택지 안에 넣는 짧은 설명
  UI.curseNote = function (text) {
    const r = UI.curseRefs(text);
    if (!r) return null;
    return h('div', { class: 'cursenote' },
      r.list.map((c) => h('p', null, h('b', null, `저주 [${c.name}]`), ' ' + c.desc)),
      r.random ? h('p', null, h('b', null, '무작위 저주'), ` 1개: ${RANDOM_POOL().map((c) => c.name).join('·')} 중 하나`) : null,
    );
  };
  // 툴팁용 글: '저주 [불면]' → '저주 [불면: 전투를 시작할 때 생명 -1]'
  UI.curseText = function (text) {
    if (!text) return text;
    return text.replace(/저주 \[([^\]]+)\]/g, (all, name) => {
      const c = RS.CURSES.find((x) => x.name === name);
      return c ? `저주 [${name}: ${c.desc}]` : all;
    });
  };
  // 저주가 걸린 선택: 고르기 전에 저주를 자세히 보여 주고 한 번 더 묻는다
  UI.curseConfirm = function (label, text, onOk) {
    const r = UI.curseRefs(text);
    if (!r) return onOk();
    const cards = r.list.map((c) => h('div', { class: 'card curse' }, UI.icon('curse', 'cic', 4),
      h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, c.permanent ? '저주 · 없앨 수 없음' : c.fades ? '저주 · 저절로 사라짐' : '저주'), h('b', null, c.name)), h('p', null, c.desc))));
    const pool = r.random ? h('div', { class: 'cursepool' }, h('p', { class: 'dim' }, '무작위 저주는 아래 중 하나가 나옵니다'),
      RANDOM_POOL().map((c) => h('p', null, h('b', null, c.name), ' · ' + c.desc))) : null;
    UI.modal('저주 확인', h('div', { class: 'confirm' },
      h('p', null, `[${label}] 을(를) 고르면 아래 저주를 받습니다.`),
      h('div', { class: 'cards' }, cards), pool,
      h('p', { class: 'dim small' }, '저주는 상점의 [제거]나 일부 이벤트로 없앨 수 있어요' + (r.list.some((c) => c.permanent) ? ' (없앨 수 없는 것 제외)' : '') + '. 액막이 매듭이 있으면 막아 줘요.'),
      h('div', { class: 'row2' },
        UI.btn('취소', () => UI.closeModal()),
        UI.btn('그래도 고른다', () => {
          UI.onModalClose = null;
          UI.closeModal();
          onOk();
        }, 'gold'),
      ),
    ));
  };

  // ── 연마 미리보기: 연마하면 어떤 수치가 얼마로 바뀌는지 ──
  const MOD_LABEL = {
    dmgPct: '모든 유닛 피해', aspdPct: '공격 속도', rangeAdd: ['사거리', 'n'], critChance: '치명타 확률', critMult: ['치명타 배율', 'x'],
    killGoldPct: '처치 골드', waveGoldPct: '웨이브 골드', interestCap: ['이자 한도', 'n'], interestBonus: ['이자', 'n'],
    rareChance: '희귀 소환 확률', twinChance: '한 기 더 소환 확률', mergeRefund: '재료 반환 확률', mergeDouble: '2단계 상승 확률',
    mergeMirror: '결과 2기 확률', enemySpeedPct: ['적 이동 속도', 'neg'], eliteDmgPct: '엘리트·보스에게 피해', firstStrike: '첫 공격 피해',
    shrapnel: '파편 피해', freezeChance: '빙결 확률', diversity: '클래스당 피해', purity: '조건 충족 시 피해', eliteSquad: '조건 충족 시 피해',
    rich: '골드 100 이상일 때 피해', legendAura: '전설 1기당 피해', demonForm: '웨이브마다 쌓이는 피해', noxious: '초당 독안개 피해',
    poison: '독 피해', eliteKillHeal: ['엘리트 처치 시 회복', 'n'], karmaGold: ['저주당 골드(×막)', 'n'], sellPct: '판매 가격', summonCostPct: '소환 비용', upgradeCostPct: '강화 비용',
    // 지휘관 고유 능력 (abMax·abStart 는 지휘관마다 자원 이름이 달라 아래에서 붙인다)
    burnArrow: '궁수 화상', shatter: '얼음 깨기 피해', critHaste: '치명타 뒤 공격 속도', dotAmp: '지속 피해',
    chargeHeal: ['강타를 끊으면 생명', 'n'], chargeTaunt: '도발한 적이 받는 피해', resolveDmg: '결의 1개당 피해',
    stanceBurn: '화염 태세 화상', stanceSlow: '냉기 태세 둔화', stanceFreeze: '빙결 확률', stanceCd: ['원소 전환 대기', 's'],
    stanceBoom: '원소 폭발 피해', stanceHaste: '전환 뒤 공격 속도', burnVuln: '화상 입은 적이 받는 피해',
    starKill: ['별 +1 에 필요한 처치', 'per'], starSlow: '별똥별 둔화', starHoard: '별 5개 이상일 때 피해', starTwice: '두 번째 별똥별 피해',
    starStack: '별똥별마다 쌓이는 피해',
  };
  const CLS_LABEL = { dmg: '피해', aspd: '공격 속도', range: ['사거리', 'n'], crit: '치명타 확률', splash: ['폭발 범위', 'n'], slow: '둔화', stun: '기절 확률' };
  function fmtMod(v, kind) {
    if (kind === 'n') return (v >= 0 ? '+' : '') + Math.round(v * 10) / 10;
    if (kind === 's') return '-' + Math.round(v * 10) / 10 + '초';
    if (kind === 'per') return Math.round(1 / v) + '마리';
    if (kind === 'x') return '+' + Math.round(v * 100) / 100 + '배';
    if (kind === 'neg') return '-' + Math.round(v * 1000 + 1e-6) / 10 + '%';
    const p = Math.round(v * 1000 + (v >= 0 ? 1e-6 : -1e-6)) / 10;
    return (p >= 0 ? '+' : '') + p + '%';
  }
  // [{ label, from, to }] (바뀌는 수치만)
  UI.upgradeLines = function (id) {
    const def = RS.augDef(id);
    const up = RS.upgradeScale(def.mods || {}, 1.5);
    if (!up) return [];
    const out = [];
    const add = (lab, a, b) => {
      if (a === b) return;
      const [name, kind] = Array.isArray(lab) ? lab : [lab, '%'];
      out.push({ label: name, from: fmtMod(a, kind), to: fmtMod(b, kind) });
    };
    // 결의·별처럼 지휘관마다 이름이 다른 자원
    const cmd = def.cmd && RS.COMMANDER[def.cmd];
    const res = (cmd && RS.ABILITY[cmd.ability] && RS.ABILITY[cmd.ability].res) || '자원';
    const labels = Object.assign({}, MOD_LABEL, { abMax: [res + ' 최대', 'n'], abStart: ['전투 시작 ' + res, 'n'] });
    for (const k in def.mods) {
      if (k === 'cls') {
        for (const c in def.mods.cls) for (const s in def.mods.cls[c]) if (CLS_LABEL[s]) {
          const lab = CLS_LABEL[s];
          add(Array.isArray(lab) ? [`${RS.CLASS[c].name} ${lab[0]}`, lab[1]] : `${RS.CLASS[c].name} ${lab}`, def.mods.cls[c][s], up.cls[c][s]);
        }
      } else if (labels[k] && typeof def.mods[k] === 'number') add(labels[k], def.mods[k], up[k]);
    }
    return out;
  };
  UI.upgradeView = function (id, done) {
    const lines = UI.upgradeLines(id);
    if (!lines.length) return h('p', { class: 'upnote' }, done ? '연마됨: 이로운 효과 ×1.5' : '연마하면 이로운 효과 ×1.5');
    return h('div', { class: 'upnote' }, h('b', null, done ? '연마됨' : '연마하면'),
      lines.map((l) => h('p', null, done ? `${l.label} ${l.to}` : `${l.label} ${l.from} → `, done ? null : h('em', null, l.to))));
  };

  // ── 카드·칩 ──
  UI.relicTitle = (r) => `${r.name} · ${RS.RARITY_NAME.relic[r.rarity]} 유물`;

  UI.relicChip = function (id, run) {
    const r = RS.REL[id];
    let extra = r.cost ? '대가 · ' + UI.curseText(r.cost) : null;
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

  // 시너지 태그 줄: #치명타 #도적 … (이미 가진 것과 겹치면 밝게 + 개수)
  UI.synRow = function (def, owned) {
    const tags = RS.synTags(def);
    const run = UI.G && UI.G.run;
    const cnt = run && !owned ? RS.synCounts(run) : null;
    if (!tags.length) return h('div', { class: 'syn' }, h('span', { class: 'tag gen' }, '#범용'));
    return h('div', { class: 'syn' }, tags.map((t) => {
      const n = cnt && cnt[t] ? cnt[t] : 0;
      return h('span', { class: 'tag' + (n ? ' hit' : ''), style: `--tc:${RS.SYN[t].col}`, title: RS.SYN[t].desc }, `#${RS.SYN[t].name}${n ? ` ×${n}` : ''}`);
    }));
  };
  const ownedAug = (a) => { const run = UI.G && UI.G.run; return !!run && run.augments.some((x) => RS.augDef(x).id === a.id); };
  const ownedRel = (id) => { const run = UI.G && UI.G.run; return !!run && run.relics.indexOf(id) >= 0; };

  UI.augCard = function (id, selected, onclick, extra) {
    const a = RS.augDef(id);
    const up = RS.isUpgraded(id);
    return h('button', { class: `card r${a.rarity}${selected ? ' sel' : ''}`, onclick },
      UI.icon(a.icon, 'cic', 4),
      h('div', { class: 'cbody' },
        h('div', { class: 'ctop' }, h('span', { class: 'rar' }, RS.RARITY_NAME.aug[a.rarity]), h('b', null, a.name + (up ? '+' : '')), a.cmd ? h('small', { class: 'cmdtag' }, `${RS.COMMANDER[a.cmd].name} 전용`) : a.unique ? null : h('small', { class: 'stack' }, '중첩 가능')),
        h('p', null, a.desc),
        UI.synRow(a, ownedAug(a)),
        up ? UI.upgradeView(id, true) : null,
        a.cost ? h('p', { class: 'cost' }, '대가 · ' + a.cost) : null,
        a.cost ? UI.curseNote(a.cost) : null,
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
        UI.synRow(r, ownedRel(id)),
        r.cost ? h('p', { class: 'cost' }, '대가 · ' + r.cost) : null,
        r.cost ? UI.curseNote(r.cost) : null,
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
      'aria-label': '봉인석',
      onclick(e) {
        UI.tip(e.currentTarget, '균열의 봉인석', '붉은(휴식처에서 회수)·초록(성난 엘리트 처치)·푸른(보물 상자에서 유물 대신) 봉인석 세 개를 모으면 3막 보스 뒤에 4막이 열린다.');
      },
    }, one('key_ruby', k.ruby, '붉은 봉인석'), one('key_emerald', k.emerald, '초록 봉인석'), one('key_sapphire', k.sapphire, '푸른 봉인석'));
  };

  UI.topbar = function (run, title) {
    return h('div', { class: 'topbar' },
      h('div', { class: 'tb-title' }, title),
      h('div', { class: 'tb-stats' },
        UI.keysEl(run),
        // 상처는 생명 옆에 작은 배지로만 (좁은 폰에서 제목 폭을 먹지 않게). 탭하면 설명.
        run.injury > 0 ? h('button', {
          class: 'stat life hurt', 'aria-label': `생명, 상처 ${run.injury}`,
          onclick(e) { UI.tip(e.currentTarget, `상처 ${run.injury} · 피해 −${Math.round((1 - RS.injuryMul(run)) * 100)}%`, `강타에 맞으면 생긴다. 하나당 전투를 시작할 때 모든 유닛 피해 -${Math.round(RS.BAL.injuryPer * 100)}%. 일반 전투를 이기면 1씩 아물고, 휴식처에서 쉬면 모두 낫는다. 새 막에서는 사라진다.`); },
        }, UI.icon('heart', '', 3), h('b', null, `${Math.ceil(run.life)}/${run.maxLife}`), h('small', { class: 'inj-badge' }, `상처 ${run.injury}`))
          : h('span', { class: 'stat life' }, UI.icon('heart', '', 3), h('b', null, `${Math.ceil(run.life)}/${run.maxLife}`)),
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
    UI.hideTip(true);
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
    UI.hideTip(true);
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
  UI.tabs = function (tabs, cls) {
    const head = h('div', { class: 'tabs' + (cls ? ' ' + cls : '') });
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
      h('div', null, h('b', null, a.name + (up ? '+' : '') + (count > 1 ? ` ×${count}` : '')), a.cmd ? h('small', { class: 'cmdtag' }, `${RS.COMMANDER[a.cmd].name} 전용`) : null, h('p', null, a.desc), UI.synRow(a, true), up ? UI.upgradeView(id, true) : null, a.cost ? h('p', { class: 'cost' }, '대가 · ' + UI.curseText(a.cost)) : null));
  };
  UI.relicRow = function (id) {
    const r = RS.REL[id];
    return h('div', { class: `lrow rr${r.rarity}` }, UI.icon(r.icon, '', 3),
      h('div', null, h('b', null, `${r.name} · ${RS.RARITY_NAME.relic[r.rarity]}`), h('p', null, r.desc), UI.synRow(r, true), r.cost ? h('p', { class: 'cost' }, '대가 · ' + UI.curseText(r.cost)) : null));
  };
  // 시너지 한눈에 보기: 태그마다 설명과 해당 증강·유물 (run 이 있으면 가진 것만, 없으면 전부)
  UI.synList = function (run) {
    const pool = [];
    if (run) {
      const seen = {};
      for (const id of run.augments) {
        const a = RS.augDef(id);
        if (!seen['a' + a.id]) pool.push({ def: a, name: a.name });
        seen['a' + a.id] = 1;
      }
      for (const id of run.relics) pool.push({ def: RS.REL[id], name: RS.REL[id].name });
    } else {
      for (const a of RS.AUGMENTS) pool.push({ def: a, name: `${a.name}(${RS.RARITY_NAME.aug[a.rarity]})` });
      for (const r of RS.RELICS) if (r.rarity !== 6) pool.push({ def: r, name: `${r.name}(${RS.RARITY_NAME.relic[r.rarity]} 유물)` });
    }
    const rows = Object.keys(RS.SYN).map((t) => ({ t, items: pool.filter((x) => RS.synTags(x.def).indexOf(t) >= 0) })).filter((x) => x.items.length);
    rows.sort((a, b) => b.items.length - a.items.length);
    if (!rows.length) return h('p', { class: 'dim' }, '아직 시너지가 없습니다. 증강·유물의 #태그가 겹칠수록 빌드가 단단해져요.');
    return h('div', { class: 'synlist' }, rows.map((x) => h('div', { class: 'lrow', style: `--tc:${RS.SYN[x.t].col}` },
      h('div', null, h('b', null, `#${RS.SYN[x.t].name}`), h('span', { class: 'n' }, ` ${x.items.length}개`), h('p', { class: 'dim small' }, RS.SYN[x.t].desc), h('p', null, x.items.map((i) => i.name).join(' · '))))));
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
  const KEY_NAME = { ruby: '붉은', emerald: '초록', sapphire: '푸른' };
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
      if (g.k === 'key') return h('div', { class: 'grow-line' }, UI.icon('key_' + g.id, '', 3), h('span', { class: 'good' }, `${KEY_NAME[g.id]} 봉인석`));
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
