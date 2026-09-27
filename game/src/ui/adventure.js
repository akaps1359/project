// 모험 화면: 맵, 축복, 고대 존재, 선택 대기열, 보상, 상점, 이벤트, 휴식처, 보물, 결과
(function (RS) {
  'use strict';

  const UI = RS.UI;
  const { h, append, $, btn, icon, unitImg, fmt, pct } = UI;

  // 긴 이름은 버튼에 들어가도록 줄인다
  const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function bossTimeOf(run, bossId) {
    const M = RS.collectMods(run);
    const def = RS.ENEMY[bossId];
    return RS.BAL.bossTime + (M.bossTimeAdd || 0) + ((def && def.bossTimeAdd) || 0);
  }

  // ── 맵 ──
  UI.showMap = function () {
    const G = UI.G;
    const run = G.run;
    UI.rewardSel = null;
    UI.shopSel = null;
    UI.restTrain = false;
    UI.mapArmed = null;
    const scr = $('#scr-map');
    scr.innerHTML = '';
    const act = RS.actDef(run);
    const box = h('div', { class: 'mapbox scroll' });
    const wings = RS.wingChoices(run);
    const floors = run.map.floors;
    const nF = floors.length;
    const left = nF - run.floor;
    append(scr, [
      UI.topbar(run, `${run.act}막 · ${act.name}`),
      UI.relicStrip(run),
      box,
      h('p', { class: 'hint' },
        left > 0 ? h('span', { class: 'mapchip' }, left === 1 ? '다음은 보스' : `보스까지 ${left}층`) : null,
        '반짝이는 칸을 누르면 설명, 한 번 더 누르면 이동합니다.' + (wings.length ? ` · 점선 칸은 날개 장화로 (${run.relicState.wingBoots.uses}회)` : '')),
    ]);
    UI.show('scr-map');
    const W = RS.MAP_W;
    const avail = RS.nextChoices(run);
    const isAvail = (f, l) => avail.some((c) => c.f === f && c.lane === l);
    const isWing = (f, l) => wings.some((c) => c.f === f && c.lane === l);
    const pad = 46;
    const H = Math.max(box.clientHeight, nF * 70 + pad * 2);
    const rowH = (H - pad * 2) / nF;
    const inner = h('div', { class: 'mapinner', style: `height:${H}px` });
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'maplines');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(H));
    const laneX = (l) => 10 + l * (80 / (W - 1));
    const rowY = (f) => Math.round(pad + (nF - f) * rowH + rowH / 2 - 8);
    for (let f = 1; f < nF; f++) {
      for (let l = 0; l < W; l++) {
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
          if (n.visited && target && target.visited) cls += ' done';
          else if (f === run.floor && l === run.lane) cls += ' open';
          line.setAttribute('class', cls);
          svg.appendChild(line);
        }
      }
    }
    inner.appendChild(svg);
    const bossDef = RS.ENEMY[act.boss];
    for (let f = 1; f <= nF; f++) {
      for (let l = 0; l < W; l++) {
        const n = floors[f - 1][l];
        if (!n) continue;
        const shown = n.resolved || n.type;
        const info = RS.NODE_INFO[shown] || RS.NODE_INFO.combat;
        const here = f === run.floor && l === run.lane;
        const can = isAvail(f, l);
        const wing = !can && isWing(f, l);
        const isBoss = n.type === 'boss';
        let label = n.type === 'unknown' ? (n.resolved ? `?·${RS.NODE_INFO[n.resolved].name}` : null) : info.name;
        if (isBoss && bossDef) label = bossDef.name;
        const title = n.type === 'unknown' ? '? (미지)' : isBoss && bossDef ? `보스 · ${bossDef.name}` : info.name;
        const key = f + ':' + l;
        const enter = () => {
          UI.mapArmed = null;
          UI.hideTip();
          RS.sfx('click');
          G.enterNode(f, l, wing);
        };
        const nodeIcon = isBoss && bossDef
          ? h('img', { class: 'ic', src: RS.iconURL(act.boss, 3), alt: '' })
          : icon(n.type === 'unknown' && !n.resolved ? 'n_event' : info.icon, '', 3);
        inner.appendChild(h('button', {
          class: `node t-${n.type}${n.visited ? ' visited' : ''}${here ? ' here' : ''}${can ? ' avail' : ''}${wing ? ' wing' : ''}`,
          style: `left:${laneX(l)}%;top:${rowY(f)}px`,
          'aria-label': label || '?',
          onclick(e) {
            if (can || wing) {
              // 첫 탭은 설명, 같은 칸을 한 번 더 누르면 이동
              if (UI.mapArmed === key && !$('#tip').hidden) return enter();
              UI.mapArmed = key;
              for (const el of inner.querySelectorAll('.node.armed')) el.classList.remove('armed');
              e.currentTarget.classList.add('armed');
              RS.sfx('click');
              UI.tip(e.currentTarget, title, nodeDesc(n, run), wing ? '날개 장화를 한 번 씁니다' : null, { label: '여기로 이동', onClick: enter });
            } else {
              UI.tip(e.currentTarget, title, nodeDesc(n, run));
            }
          },
        }, nodeIcon,
        n.burning ? h('span', { class: 'burn' }, icon('flameE', '', 3)) : null,
        label ? h('span', { class: 'nlabel' }, label) : null));
      }
    }
    box.appendChild(inner);
    const targetY = rowY(Math.min(nF, run.floor + 1));
    box.scrollTop = Math.max(0, targetY - box.clientHeight * 0.55);
  };

  function nodeDesc(n, run) {
    if (n.burning) return '불타는 엘리트. 무작위 강화를 받은 엘리트가 나온다. 이기면 유물과 함께 에메랄드 열쇠.';
    if (n.type === 'boss') {
      const act = RS.actDef(run);
      const def = RS.ENEMY[act.boss];
      if (def) return `${def.name} · ${def.trait || '막의 보스'}. 마지막 웨이브에 등장하고, ${bossTimeOf(run, act.boss)}초 안에 못 쓰러뜨리면 폭주합니다 (속도 ×1.8, 잃는 생명 ×2).`;
    }
    return {
      combat: '적 웨이브 3개. 이기면 골드와 증강 선택.',
      elite: '마지막 웨이브에 엘리트 등장. 위험하지만 좋은 증강과 유물을 준다.',
      unknown: '들어가 봐야 안다. 대개 이벤트지만 전투·상점·보물일 수도 있다. 이벤트가 나올수록 다른 것이 나올 확률이 오른다.',
      shop: '유물·증강·소모품·용병을 사고, 증강·저주를 없애거나 룬을 새긴다.',
      rest: '회복하거나 수련·연마한다. 열쇠를 회수할 수도 있다.',
      treasure: '유물이 든 상자. 사파이어 열쇠를 대신 가져갈 수도 있다.',
      boss: '막의 보스. 제한 시간 안에 쓰러뜨리세요.',
    }[n.type];
  }

  // ── 시작의 축복 (균열의 문지기): 고른 뒤 확정 ──
  UI.showNeow = function () {
    const G = UI.G;
    const run = G.run;
    const cmd = RS.COMMANDER[run.commander];
    const list = run.pending.blessings;
    const sel = typeof UI.optSel === 'number' && list[UI.optSel] ? UI.optSel : null;
    const body = h('div', { class: 'event' },
      h('div', { class: 'event-art big' }, icon('shard', '', 6)),
      h('p', { class: 'event-text' }, `균열 앞에 선 ${cmd.title} ${cmd.name}에게 문지기가 속삭인다. "올라가려는가? 그렇다면 하나를 골라라."`),
      h('h2', null, '하나를 고르세요'),
    );
    const opts = h('div', { class: 'options' });
    list.forEach((b, k) => {
      const t = RS.blessingText(b);
      opts.appendChild(h('button', {
        class: 'btn option' + (b.kind === 'swap' ? ' swap' : '') + (sel === k ? ' sel' : ''),
        onclick() {
          RS.sfx('click');
          UI.optSel = k;
          UI.keepScroll = true;
          UI.showNeow();
        },
      }, h('b', null, t.text), t.cost ? h('small', { class: 'cost' }, '대가 · ' + t.cost) : h('small', null, { small: '작은 축복', mid: '축복', big: '큰 축복', swap: '시작 유물 교환' }[b.kind])));
    });
    body.appendChild(opts);
    const pickT = sel != null ? RS.blessingText(list[sel]).text : null;
    const footer = [btn(pickT ? `${short(pickT, 14)} 받기` : '하나를 고르세요', (e) => {
      if (sel == null) return;
      e.currentTarget.disabled = true;
      RS.sfx('upgrade');
      const snap = UI.snapGains(run);
      RS.applyBlessing(run, list[sel]);
      const gains = UI.diffGains(snap, run);
      UI.optSel = null;
      G.afterNeow();
      UI.showGains('문지기의 축복', gains);
    }, 'gold grow', sel == null)];
    UI.page('균열의 문지기', null, body, footer);
  };

  // ── 막 시작 (+ 고대 존재): 고른 뒤 확정 ──
  UI.showActStart = function () {
    const G = UI.G;
    const run = G.run;
    const act = RS.actDef(run);
    const anc = run.pending && run.pending.ancient;
    const boss = RS.ENEMY[act.boss];
    const choosing = anc && !anc.done;
    let footer = null;
    let card;
    if (choosing) {
      // 고를 것이 남아 있으면 보스 미리보기를 한 줄로 줄인다
      card = h('div', { class: 'act-card compact' },
        h('div', { class: 'boss-line' }, h('img', { src: RS.iconURL(act.boss, 3), alt: '' }),
          h('div', null, h('b', null, `${act.name} · 이 막의 보스: ${boss.name}`), h('p', { class: 'dim' }, boss.trait || ''),
            h('p', { class: 'good' }, `막을 넘어오며 생명을 회복했습니다 (${Math.ceil(run.life)}/${run.maxLife})`))),
      );
      const A = RS.ANCIENT[anc.id];
      const selIdx = typeof UI.optSel === 'number' && UI.optSel < anc.boons.length ? UI.optSel : null;
      const sel = selIdx != null ? anc.boons[selIdx] : null;
      card.appendChild(h('div', { class: 'ancient' },
        h('div', { class: 'anc-head' }, icon(A.icon, '', 5), h('div', null, h('b', null, A.name), h('p', null, A.text))),
        h('h2', null, `${['', '하나', '둘', '셋', '넷'][anc.boons.length] || anc.boons.length} 중 하나를 고르세요`),
        h('div', { class: 'options' }, anc.boons.map((bid, bi) => {
          const bo = RS.ancientBoon(bid);
          return h('button', {
            class: 'btn option anc' + (selIdx === bi ? ' sel' : ''),
            onclick() {
              RS.sfx('click');
              UI.optSel = bi;
              UI.keepScroll = true;
              UI.showActStart();
            },
          }, h('b', null, bo.name), h('small', null, bo.desc), bo.cost ? h('small', { class: 'cost' }, '대가 · ' + bo.cost) : null);
        })),
      ));
      const bo = sel ? RS.ancientBoon(sel) : null;
      footer = [btn(bo ? `${short(bo.name, 14)} 받기` : '하나를 고르세요', (e) => {
        if (!sel || anc.done) return;
        e.currentTarget.disabled = true;
        RS.sfx('legend');
        const snap = UI.snapGains(run);
        RS.applyAncient(run, sel);
        anc.done = true;
        const gains = UI.diffGains(snap, run);
        UI.optSel = null;
        G.save();
        UI.showActStart();
        UI.showGains(A.name, gains);
      }, 'gold grow', !bo)];
    } else {
      card = h('div', { class: 'act-card' },
        h('p', { class: 'eyebrow' }, `${run.act}막`),
        h('h1', null, act.name),
        h('div', { class: 'boss-preview' }, h('img', { src: RS.iconURL(act.boss, 4), alt: '' })),
        h('p', null, `이 막의 보스: ${boss.name}`),
        h('p', { class: 'dim' }, boss.trait),
        h('p', { class: 'good' }, `막을 넘어오며 생명을 회복했습니다 (${Math.ceil(run.life)}/${run.maxLife})`),
        btn('출발', (e) => {
          e.currentTarget.disabled = true;
          G.startAct();
        }, 'big gold'),
      );
    }
    UI.page(`${run.act}막`, null, card, footer);
  };

  // ── 선택 대기열 (증강 고르기·제거·연마·룬 등) ──
  // 유료 서비스(상점 제거·룬, 유료 이벤트)는 취소하면 환불한다
  function refundOf(item) {
    if (item.undo) {
      const u = item.undo;
      const v = u.price != null ? u.price : u.gold != null ? u.gold : u.item && u.item.price;
      return typeof v === 'number' ? v : 0;
    }
    if (typeof item.refund === 'number') return item.refund;
    if (item.refund && typeof item.refund === 'object') return item.refund.gold || 0;
    return 0;
  }
  UI.cancelQueued = function (run, item) {
    let res = null;
    if (typeof RS.cancelChoice === 'function') {
      try {
        res = RS.cancelChoice(run, item);
      } catch (err) {
        res = null;
      }
    }
    if (res && res.text) UI.toast(res.text, 'good');
    else if (res && res.refund > 0) UI.toast(`환불했어요 (+${res.refund}G)`, 'good');
    return res;
  };

  UI.showChoice = function () {
    const G = UI.G;
    const run = G.run;
    const item = run.queue[0];
    if (!item) return G.finishChoice();
    const sel = UI.choiceSel;
    const done = () => {
      UI.choiceSel = null;
      G.finishChoice();
    };
    const pickSel = (v) => {
      UI.choiceSel = v;
      UI.keepScroll = true;
      UI.showChoice();
    };
    const title = item.title || '선택';
    const cancel = () => {
      UI.cancelQueued(run, item);
      done();
    };
    const paid = !!(item.undo || item.refund || item.refundLife || item.undoCurse || item.undoCharm);
    // 취소 버튼: 유료면 '구매 취소 (+NG)', 고를 대상이 없으면 '계속', 그 밖에는 확인을 거친다
    const cancelBtn = (label, hasTargets) => {
      if (paid) {
        const amt = refundOf(item);
        return btn(amt > 0 ? `구매 취소 (+${amt}G)` : '취소하고 되돌리기', cancel, hasTargets ? 'sm' : 'gold grow');
      }
      if (!hasTargets) return btn('계속', cancel, 'gold grow');
      return btn(label, () => UI.confirm('그만둘까요?', `[${title}] 효과를 쓰지 않고 넘어갑니다. 되돌릴 수 없어요.`, label, cancel), 'sm');
    };
    const confirmBtn = (label, onOk, disabled) => btn(label, (e) => {
      e.currentTarget.disabled = true;
      onOk();
    }, 'gold grow', disabled);
    let body;
    let footer;
    switch (item.k) {
      case 'aug':
      case 'augList': {
        if (!item.ids) {
          if (typeof RS.choiceAugIds === 'function') RS.choiceAugIds(run, item);
          else item.ids = RS.rollAugments(run, item.n || RS.augChoiceCount(run), item.w);
          G.save();
        }
        const ok = item.ids.indexOf(sel) >= 0 ? sel : null;
        const left = item.left || 1;
        const has = item.ids.length > 0;
        body = h('div', null, h('h2', null, left > 1 ? `증강을 고르세요 (${left}개 더)` : '증강을 하나 고르세요'), h('div', { class: 'cards' }, item.ids.map((id) => UI.augCard(id, ok === id, () => pickSel(id)))));
        footer = [cancelBtn(left > 1 ? '그만 고르기' : '건너뛰기', has)];
        // 운명의 주사위: 대기열 증강 선택도 새로고침할 수 있다
        if (has && item.rerolls > 0 && typeof RS.choiceReroll === 'function') {
          footer.push(btn(`새로고침 ${item.rerolls}`, () => {
            RS.choiceReroll(run, item);
            UI.choiceSel = null;
            G.save();
            UI.showChoice();
          }, 'sm'));
        }
        if (has) {
          footer.push(confirmBtn(ok ? `${short(RS.augDef(ok).name, 12)} 선택` : '카드를 누르세요', () => {
            RS.pickAugment(run, ok);
            RS.sfx('upgrade');
            // 치즈 방처럼 여러 개를 고르는 목록은 남은 횟수만큼 다시 보여 준다
            if (left > 1) {
              item.left = left - 1;
              item.ids = item.ids.filter((x) => x !== ok);
              UI.choiceSel = null;
              G.save();
              UI.showChoice();
              return;
            }
            done();
          }, !ok));
        }
        break;
      }
      case 'relicList': {
        const ok = item.ids.indexOf(sel) >= 0 ? sel : null;
        body = h('div', { class: 'cards' }, item.ids.map((id) => UI.relicCard(id, ok === id, () => pickSel(id))));
        footer = [item.ids.length
          ? confirmBtn(ok ? `${short(RS.REL[ok].name, 12)} 가져가기` : '유물을 누르세요', () => {
            RS.addRelic(run, ok);
            done();
          }, !ok)
          : btn('계속', cancel, 'gold grow')];
        break;
      }
      case 'remove': {
        const rows = [];
        run.augments.forEach((id, i) => rows.push({ key: 'a' + i, el: UI.augCard(id, sel === 'a' + i, () => pickSel('a' + i)) }));
        run.curses.forEach((id, i) => {
          const c = RS.CURSE[id];
          if (c.permanent) return;
          rows.push({ key: 'c' + i, el: h('button', { class: `card curse${sel === 'c' + i ? ' sel' : ''}`, onclick() { pickSel('c' + i); } }, icon('curse', 'cic', 4), h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, '저주'), h('b', null, c.name)), h('p', null, c.desc))) });
        });
        const ok = typeof sel === 'string' && rows.some((r) => r.key === sel) ? sel : null;
        body = h('div', null, h('h2', null, rows.length ? '없앨 것을 고르세요 (저주가 위에 있어요)' : '없앨 수 있는 것이 없습니다.'), h('div', { class: 'cards' }, rows.filter((r) => r.key[0] === 'c').map((r) => r.el), rows.filter((r) => r.key[0] === 'a').map((r) => r.el)));
        footer = [cancelBtn('그만두기', rows.length > 0)];
        if (rows.length) {
          footer.push(confirmBtn(ok ? '없애기' : '고르세요', () => {
            if (ok[0] === 'a') RS.removeAug(run, +ok.slice(1));
            else run.curses.splice(+ok.slice(1), 1);
            RS.sfx('coin');
            done();
          }, !ok));
        }
        break;
      }
      case 'upgrade':
      case 'transform': {
        const up = item.k === 'upgrade';
        const list = h('div', { class: 'cards' });
        const valid = [];
        run.augments.forEach((id, i) => {
          if (up ? !RS.canUpgradeAug(id) : !!RS.augDef(id).onPick) return;
          valid.push(i);
          list.appendChild(UI.augCard(id, sel === i, () => pickSel(i)));
        });
        const ok = valid.indexOf(sel) >= 0 ? sel : null;
        body = h('div', null, h('h2', null, up ? '연마할 증강을 고르세요 (이로운 효과 ×1.5)' : '다른 증강으로 바꿀 증강을 고르세요 (같은 등급)'), valid.length ? list : h('p', { class: 'dim center' }, '고를 수 있는 증강이 없습니다.'));
        footer = [cancelBtn('그만두기', valid.length > 0)];
        if (valid.length) {
          footer.push(confirmBtn(ok != null ? (up ? '연마하기' : '바꾸기') : '고르세요', () => {
            if (up) RS.upgradeAug(run, ok);
            else {
              const nid = RS.transformAug(run, ok);
              if (nid) UI.toast(`[${RS.AUG[nid].name}]이(가) 되었다!`, 'good');
            }
            RS.sfx('upgrade');
            done();
          }, ok == null));
        }
        break;
      }
      case 'runeChoice':
      case 'rune': {
        const runeId = item.rune;
        if (item.k === 'runeChoice' && !runeId) {
          body = h('div', null, h('h2', null, '새길 룬을 고르세요'), h('div', { class: 'options' }, item.runes.map((rid) => {
            const r = RS.RUNE[rid];
            return h('button', { class: 'btn option', style: `--rune:${r.color}`, onclick() { item.rune = rid; RS.sfx('click'); UI.showChoice(); } }, h('b', { class: 'runename' }, r.name), h('small', null, r.desc));
          })));
          footer = [cancelBtn('그만두기', item.runes.length > 0)];
          break;
        }
        const r = RS.RUNE[runeId];
        const filter = (i, s, rune) => !rune || rune.bad;
        let any = false;
        for (let i = 0; i < RS.FIELD.SIZE; i++) {
          const rr = run.runes[i] ? RS.RUNE[run.runes[i]] : null;
          if (filter(i, run.board[i], rr)) any = true;
        }
        const ok = typeof sel === 'number' ? sel : null;
        body = h('div', null,
          h('h2', null, `${r.name}을(를) 새길 칸을 고르세요`),
          h('p', { class: 'dim center' }, r.desc + ' · 룬은 칸에 남아 그 자리에 선 유닛에게 적용됩니다'),
          UI.boardPicker(run, { selected: ok, filter, onPick: (i) => pickSel(i) }),
        );
        footer = [cancelBtn('그만두기', any)];
        if (any) {
          footer.push(confirmBtn(ok != null ? '여기에 새기기' : '칸을 고르세요', () => {
            RS.setRune(run, ok, runeId);
            RS.sfx('upgrade');
            done();
          }, ok == null));
        }
        break;
      }
      case 'unit': {
        const op = item.op;
        const maxTier = item.maxTier == null ? 3 : item.maxTier;
        const desc = { dup: '복제할 유닛을 고르세요 (같은 칸에 1기 추가, 칸이 차면 다른 칸)', sacrifice: '모닥불에 바칠 유닛 1기를 고르세요' }[op] || '유닛을 고르세요';
        const filter = (i, s) => !!s && s.tier <= maxTier;
        const any = run.board.some((s, i) => filter(i, s));
        const ok = typeof sel === 'number' && filter(sel, run.board[sel]) ? sel : null;
        body = h('div', null, h('h2', null, any ? desc : '고를 수 있는 유닛이 없습니다.'), UI.boardPicker(run, { selected: ok, filter, onPick: (i) => pickSel(i) }));
        footer = [cancelBtn('그만두기', any)];
        if (any) {
          footer.push(confirmBtn(ok != null ? '결정' : '칸을 고르세요', () => {
            const s = run.board[ok];
            const snap = UI.snapGains(run);
            let msg = null;
            if (op === 'dup') {
              if (RS.addUnit(run.board, s.cls, s.tier, ok) < 0) UI.toast('빈자리가 없어 복제가 흩어졌다', 'warn');
              else UI.toast(`${RS.TIER[s.tier].name} ${RS.CLASS[s.cls].name} 복제!`, 't' + s.tier);
            } else if (op === 'sacrifice') {
              msg = RS.sacrificeUnit(run, ok);
            }
            const gains = UI.diffGains(snap, run).filter((g) => g.k !== 'unit' || g.n > 0);
            RS.sfx('upgrade');
            done();
            if (msg) UI.showGains('모닥불 정령', gains, null, msg);
          }, ok == null));
        }
        break;
      }
      default:
        return done();
    }
    UI.page(title, null, body, footer);
  };

  function skipGoldOf(run) {
    if (typeof RS.skipGoldAmount === 'function') return RS.skipGoldAmount(run);
    const M = RS.collectMods(run);
    return RS.BAL.skipGold[Math.min(3, run.act)] * (1 + (M.skipGoldMul || 0));
  }

  // ── 보상 ──
  UI.showReward = function () {
    const G = UI.G;
    const run = G.run;
    const r = run.pending.reward;
    const offered = !r.augDone ? r.aug : r.relics || [];
    const sel = offered.indexOf(UI.rewardSel) >= 0 ? UI.rewardSel : null;
    const body = h('div', { class: 'reward' });
    const summary = r.gold ? [`골드 +${r.gold}`] : [];
    if (r.heal) summary.push(`생명 +${r.heal}`);
    if (r.item) summary.push(`소모품 [${RS.ITEM[r.item].name}]`);
    if (r.key) body.appendChild(h('div', { class: 'keygot' }, icon('key_emerald', '', 4), h('b', null, '에메랄드 열쇠를 얻었다!')));
    const pickCard = (id) => {
      RS.sfx('click');
      UI.rewardSel = id;
      UI.keepScroll = true;
      UI.showReward();
    };
    const lockFoot = (e) => {
      const foot = e.currentTarget.closest('.page-foot');
      UI.lockAll(foot);
    };
    let footer;
    if (r.trial) {
      const T = ['', '소모품', '증강 2개 연마', '희귀 유물'];
      body.appendChild(h('p', { class: 'event-result' }, r.trial.ok ? `시험 통과! 보상: ${r.trial.text || T[r.trial.tier]}` : '시간 안에 쓰러뜨리지 못했다. 허수아비가 비웃는 것 같다.'));
    }
    if (RS.rewardComplete(run)) {
      footer = [btn('계속', (e) => {
        lockFoot(e);
        G.afterReward();
      }, 'gold grow')];
    } else if (!r.augDone) {
      body.appendChild(h('h2', null, '증강을 하나 고르세요'));
      const list = h('div', { class: 'cards' });
      for (const id of r.aug) list.appendChild(UI.augCard(id, sel === id, () => pickCard(id)));
      body.appendChild(list);
      const sg = Math.round(skipGoldOf(run));
      const bowl = !!RS.collectMods(run).singingBowl;
      body.appendChild(h('p', { class: 'dim small center skipnote' }, `건너뛰면 골드 +${sg}${bowl ? ' · 노래하는 그릇: 최대 생명 +2' : ''}`));
      footer = [
        r.rerolls > 0 || r.hadRerolls ? btn(`새로고침 ${r.rerolls}`, () => {
          if (!(r.rerolls > 0)) return;
          r.hadRerolls = true;
          RS.rewardReroll(run);
          UI.rewardSel = null;
          G.save();
          UI.keepScroll = true;
          UI.showReward();
        }, 'sm', !(r.rerolls > 0)) : null,
        UI.btn2(`건너뛰기 +${sg}G`, '한 번 더: 건너뛰기', (e) => {
          lockFoot(e);
          RS.rewardSkipAug(run);
          UI.rewardSel = null;
          RS.sfx('coin');
          G.afterReward();
        }, 'sm'),
        btn(sel ? `${short(RS.augDef(sel).name, 12)} 선택` : '카드를 누르세요', (e) => {
          lockFoot(e);
          RS.rewardPickAug(run, sel);
          UI.rewardSel = null;
          RS.sfx('upgrade');
          G.afterReward();
        }, 'gold grow', !sel),
      ];
    } else if (r.relics && r.relics.length && !r.relicDone) {
      body.appendChild(h('h2', null, r.takeAll ? '검은 별: 유물을 모두 가져갑니다' : run.nodeType === 'boss' ? '보스 유물 · 하나를 고르세요 (강력하지만 대가가 있는 것이 많다)' : '유물 · 하나를 고르세요'));
      const list = h('div', { class: 'cards' });
      for (const id of r.relics) list.appendChild(UI.relicCard(id, sel === id || r.takeAll, () => pickCard(id)));
      body.appendChild(list);
      footer = [
        run.nodeType === 'boss' ? UI.btn2('건너뛰기', '한 번 더: 건너뛰기', (e) => {
          lockFoot(e);
          RS.rewardPickRelic(run, null);
          G.afterReward();
        }, 'sm') : null,
        btn(r.takeAll ? '모두 가져가기' : sel ? `${short(RS.REL[sel].name, 12)} 가져가기` : '유물을 누르세요', (e) => {
          lockFoot(e);
          RS.rewardPickRelic(run, sel);
          UI.rewardSel = null;
          RS.sfx('upgrade');
          G.afterReward();
        }, 'gold grow', !sel && !r.takeAll),
      ];
    } else {
      footer = [btn('계속', () => G.afterReward(), 'gold grow')];
    }
    UI.page(r.trial ? '허수아비 시험' : run.nodeType === 'boss' ? '보스 격파!' : '승리!', summary.join(' · '), body, footer);
  };

  // ── 상점 ──
  UI.shopItemName = function (it) {
    if (it.kind === 'relic') return RS.REL[it.id].name;
    if (it.kind === 'aug') return RS.augDef(it.id).name;
    if (it.kind === 'item') return RS.ITEM[it.id].name;
    if (it.kind === 'unit') return `${RS.TIER[it.tier].name} 용병`;
    if (it.kind === 'rune') return RS.RUNE[it.id].name;
    return '제거 서비스';
  };

  UI.showShop = function () {
    const G = UI.G;
    const run = G.run;
    const shop = run.pending.shop;
    RS.repriceShop(run, shop);
    const sel = UI.shopSel != null && shop.list[UI.shopSel] && !shop.list[UI.shopSel].sold ? UI.shopSel : null;
    const groups = { relic: [], aug: [], item: [], unit: [], service: [] };
    shop.list.forEach((it, idx) => {
      const selected = sel === idx;
      const onclick = () => {
        if (it.sold) return;
        RS.sfx('click');
        UI.shopSel = idx;
        UI.keepScroll = true;
        UI.showShop();
      };
      const priceEl = h('span', { class: 'price' }, icon('coin', '', 2), it.price);
      let card;
      if (it.kind === 'relic') {
        card = UI.relicCard(it.id, selected, onclick, it.price);
        groups.relic.push(card);
      } else if (it.kind === 'aug') {
        card = UI.augCard(it.id, selected, onclick, it.sale ? h('p', { class: 'good' }, '할인 50%') : null);
        card.appendChild(priceEl);
        groups.aug.push(card);
      } else if (it.kind === 'item') {
        const d = RS.ITEM[it.id];
        card = h('button', { class: `card item${selected ? ' sel' : ''}`, onclick }, icon(d.icon, 'cic', 4),
          h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, '소모품'), h('b', null, d.name)), h('p', null, d.desc)), priceEl);
        groups.item.push(card);
      } else if (it.kind === 'unit') {
        card = h('button', { class: `card unit${selected ? ' sel' : ''}`, onclick }, h('div', { class: 'cic uwrap' }, UI.unitImg(RS.CLASSES[(idx + run.floor) % 5], it.tier)),
          h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar t' + it.tier }, '용병'), h('b', null, `${RS.TIER[it.tier].name} 유닛 1기`)), h('p', null, '지휘관의 성향에 따라 무작위 클래스. 보드 빈칸이 필요하다')), priceEl);
        groups.unit.push(card);
      } else if (it.kind === 'rune') {
        const r = RS.RUNE[it.id];
        card = h('button', { class: `card rune${selected ? ' sel' : ''}`, style: `--rune:${r.color}`, onclick }, h('div', { class: 'cic runeic' }, '◆'),
          h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, '룬 새기기'), h('b', null, r.name)), h('p', null, r.desc + ' · 산 뒤 칸을 고른다')), priceEl);
        groups.service.push(card);
      } else {
        card = h('button', { class: `card curse${selected ? ' sel' : ''}`, onclick }, icon('cage', 'cic', 4),
          h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, '서비스'), h('b', null, '제거')), h('p', null, `증강이나 저주 하나를 없앤다. 한 상점에서 한 번 (쓸수록 비싸진다)`)), priceEl);
        groups.service.push(card);
      }
      if (it.sold) card.classList.add('sold');
      else if (run.gold < it.price) card.classList.add('poor');
    });
    const sect = (name, list) => (list.length ? [h('h2', null, name), h('div', { class: 'cards shop' }, list)] : null);
    const body = h('div', null, sect('유물', groups.relic), sect('증강', groups.aug), sect('소모품', groups.item), sect('용병', groups.unit), sect('서비스', groups.service));
    const it = sel != null ? shop.list[sel] : null;
    const leave = () => {
      UI.shopSel = null;
      G.leaveNode();
    };
    const canAfford = shop.list.some((x) => !x.sold && run.gold >= x.price);
    const footer = [
      canAfford ? UI.btn2('떠나기', '정말 떠날까요?', leave, 'sm') : btn('떠나기', leave, 'sm'),
      btn(it ? `${short(UI.shopItemName(it), 10)} 구매 · ${it.price}G` : '물건을 누르세요', (e) => {
        if (sel == null) return;
        const r = RS.shopBuy(run, sel);
        const MSG = { gold: '골드가 부족해요', full: '소모품을 더 가질 수 없어요', board: '보드에 빈칸이 없어요', none: '없앨 것이 없어요', noslot: '룬을 새길 칸이 없어요' };
        if (r.err && MSG[r.err]) {
          RS.sfx('error');
          UI.toast(MSG[r.err], 'warn');
        } else if (r.ok) {
          e.currentTarget.disabled = true;
          RS.sfx('coin');
          UI.shopSel = null;
          if (run.queue.length) {
            RS.flushQueue(run);
            G.save();
            G.route();
            return;
          }
          UI.toast(`${UI.shopItemName(it)} 구매!`, 'good');
          G.save();
          UI.keepScroll = true;
          UI.showShop();
        }
      }, 'gold grow', !it || run.gold < (it ? it.price : 0)),
    ];
    UI.page('상점', '떠돌이 상인이 물건을 펼쳐 놓았다.', body, footer);
  };

  // ── 이벤트 ──
  UI.showEvent = function () {
    const G = UI.G;
    const run = G.run;
    const ev = RS.EVENT[run.pending.event];
    const res = run.pending.result;
    const gains = run.pending.gains;
    const body = h('div', { class: 'event' },
      h('div', { class: 'event-art' }, icon(ev.art, '', 6)),
      h('p', { class: 'event-text' }, RS.eventText(run)),
    );
    let footer = null;
    if (!res) {
      const opts = h('div', { class: 'options' });
      let anyOn = false;
      RS.eventOptions(run).forEach((o, i) => {
        const ok = RS.optionEnabled(run, o);
        if (ok) anyOn = true;
        opts.appendChild(h('button', {
          class: 'btn option',
          disabled: !ok,
          onclick() {
            // 한 번 고르면 다시 그릴 때까지 모든 선택지를 잠근다
            UI.lockAll(opts);
            RS.sfx('click');
            const snap = UI.snapGains(run);
            const pend = run.pending;
            RS.eventChoose(run, i);
            if (run.pending === pend && pend) pend.gains = UI.diffGains(snap, run);
            G.save();
            if (run.phase !== 'event') G.route();
            else UI.showEvent();
          },
        }, h('b', null, RS.optionLabel(run, o)), h('small', null, RS.optionDesc(run, o))));
      });
      body.appendChild(opts);
      // 지난 단계의 결과는 선택지 아래에 (선택지가 손가락 밑에서 밀리지 않게)
      if (run.pending.log) {
        body.appendChild(h('p', { class: 'event-log' }, run.pending.log));
        if (gains && gains.length) body.appendChild(UI.gainsView(gains));
      }
      // 안전망: 고를 수 있는 선택지가 하나도 없으면 떠날 수 있게
      if (!anyOn) footer = [btn('떠난다', () => G.leaveNode(), 'gold grow')];
    } else {
      body.appendChild(h('p', { class: 'event-result' }, res.text));
      if (gains && gains.length) body.appendChild(UI.gainsView(gains));
      if (run.pending.fight) footer = [btn('전투 시작', (e) => { e.currentTarget.disabled = true; G.startEventFight(); }, 'gold grow')];
      else footer = [btn('계속', (e) => { e.currentTarget.disabled = true; G.leaveNode(); }, 'gold grow')];
    }
    UI.page(ev.title, null, body, footer);
  };

  // ── 휴식처 ──
  UI.showRest = function () {
    const G = UI.G;
    const run = G.run;
    const body = h('div', { class: 'rest' },
      h('div', { class: 'event-art' }, icon('n_rest', '', 6)),
      h('p', { class: 'event-text' }, '모닥불이 따뜻하게 타오른다. 한 가지만 할 수 있다.'),
    );
    let footer = null;
    const DESC = { recall: '루비 열쇠를 얻는다 (휴식·수련 대신) · 세 열쇠를 모으면 4막이 열린다' };
    const SHOW_GAINS = { dig: '발굴', hatch: '부화', clone: '복제' };
    if (!UI.restTrain) {
      const opts = RS.restOptions(run);
      // 유물 때문에 할 수 있는 것이 하나도 없으면 그냥 지나간다
      if (!opts.some((o) => !o.off)) footer = [btn('그냥 지나간다', () => G.leaveNode(), 'gold grow')];
      const box = h('div', { class: 'options' });
      opts.forEach((o) => box.appendChild(h('button', {
        class: 'btn option',
        disabled: !!o.off,
        onclick() {
          if (o.id === 'train') {
            RS.sfx('click');
            UI.restTrain = true;
            UI.showRest();
            return;
          }
          UI.lockAll(box);
          RS.sfx('upgrade');
          const snap = UI.snapGains(run);
          const said = RS.restDo(run, o.id);
          const gains = SHOW_GAINS[o.id] ? UI.diffGains(snap, run) : null;
          if (o.id === 'recall') UI.toast('루비 열쇠를 얻었다!', 'good');
          else if (typeof said === 'string' && said) UI.toast(said, 'good');
          G.leaveNode();
          if (gains && gains.length) UI.showGains(SHOW_GAINS[o.id], gains);
        },
      }, h('b', null, o.label), h('small', null, o.off || DESC[o.id] || o.desc))));
      body.appendChild(box);
    } else {
      const train = RS.restTrainAmount(run);
      const grid = h('div', { class: 'upg-grid wide' });
      for (const c of RS.CLASSES) {
        grid.appendChild(h('button', {
          class: 'upg',
          onclick() {
            UI.lockAll(grid);
            RS.sfx('upgrade');
            RS.restDo(run, 'train', c);
            UI.restTrain = false;
            UI.toast(`${RS.CLASS[c].name} Lv ${run.classLv[c]}`, 'good');
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
    UI.page('휴식처', null, body, footer);
  };

  // ── 보물: 열기 전에 안에 든 유물을 보여 준다 ──
  UI.showTreasure = function () {
    const G = UI.G;
    const run = G.run;
    const p = run.pending;
    const body = h('div', { class: 'rest' });
    let footer;
    if (!p.opened) {
      body.appendChild(h('div', { class: 'event-art' }, icon('n_treasure', '', 8)));
      body.appendChild(h('p', { class: 'event-text' }, '낡은 보물 상자가 놓여 있다.'));
      const canKey = run.act <= 3 && !run.keys.sapphire;
      if (p.relics && p.relics.length) {
        body.appendChild(h('h2', null, '상자 안'));
        body.appendChild(h('div', { class: 'cards relics' }, p.relics.map((id) => UI.relicCard(id, false, () => {}))));
      }
      if (canKey) body.appendChild(h('p', { class: 'dim small keynote' }, '사파이어 열쇠를 가져가면 이 유물은 두고 갑니다. 루비·에메랄드·사파이어를 모두 모으면 3막 보스 뒤 숨겨진 4막이 열립니다.'));
      const open = (takeKey) => (e) => {
        UI.lockAll(e.currentTarget.closest('.page-foot'));
        RS.sfx('coin');
        RS.openChest(run, takeKey);
        G.save();
        UI.showTreasure();
      };
      footer = [
        canKey ? btn('사파이어 열쇠 (유물 포기)', open(true), 'sm') : null,
        btn(p.relics && p.relics.length ? '유물 가져가기' : '상자를 연다', open(false), 'gold grow'),
      ];
    } else {
      if (p.gotKey) body.appendChild(h('div', { class: 'keygot' }, icon('key_sapphire', '', 4), h('b', null, '사파이어 열쇠를 얻었다! (유물은 두고 간다)')));
      else {
        body.appendChild(h('h2', null, p.got && p.got.length ? '유물을 얻었다!' : '상자는 비어 있었다'));
        body.appendChild(h('div', { class: 'cards relics' }, (p.got || []).map((id) => UI.relicCard(id, false, () => {}))));
      }
      if (p.spoils) body.appendChild(h('p', { class: 'good' }, `보물 지도가 가리킨 곳이다! 골드 +${p.spoils}`));
      if (p.curse) body.appendChild(h('p', { class: 'cost' }, `저주받은 열쇠: 저주 [${RS.CURSE[p.curse].name}]`));
      footer = [btn('계속', (e) => { e.currentTarget.disabled = true; G.leaveNode(); }, 'gold grow')];
    }
    UI.page('보물', null, body, footer);
  };

  // 패배했을 때 한 줄 팁
  function lossTip(run) {
    const reason = run.pending && run.pending.reason;
    const st = run.stats;
    if (reason === 'cap') return '적이 60마리 쌓이면 패배해요. 소환을 늘리고 [강화]로 화력을 올리세요.';
    if (!st.merges) return '같은 유닛 3기를 합성하면 훨씬 강한 다음 등급이 나와요.';
    let lv = 0;
    for (const c of RS.CLASSES) lv += run.classLv[c] || 0;
    if (!lv) return '[강화]로 클래스 피해를 레벨당 15% 올릴 수 있어요.';
    return '엘리트는 위험하지만 유물을 줘요. 생명이 적을 땐 피하세요.';
  }

  // ── 결과 ──
  UI.showEnd = function (victory, unlocks) {
    const G = UI.G;
    const run = G.run;
    const scr = $('#scr-page');
    scr.innerHTML = '';
    delete scr.dataset.view;
    const st = run.stats;
    const tot = RS.CLASSES.reduce((s, c) => s + st.clsDmg[c], 0) || 1;
    const cmd = RS.COMMANDER[run.commander];
    const bars = h('div', { class: 'dmgbars' }, RS.CLASSES.map((c) => h('div', { class: 'dmgrow' },
      unitImg(c, 0),
      h('span', null, RS.CLASS[c].name),
      h('div', { class: 'bar' }, h('i', { style: `width:${((100 * st.clsDmg[c]) / tot).toFixed(1)}%` })),
      h('b', null, pct(st.clsDmg[c] / tot)),
    )));
    const reason = run.pending && run.pending.reason === 'cap' ? '필드의 적이 상한에 도달했습니다.' : '생명이 모두 떨어졌습니다.';
    // 3막 보스를 쓰러뜨리고 4막에서 쓰러지면 클리어로 기록된다
    const heartFail = !victory && run.act >= 4;
    const title = victory ? (run.act === 4 ? '균열의 심장을 부쉈다!' : '균열을 닫았다!') : heartFail ? '클리어 · 심장 도전 실패' : '쓰러졌다…';
    const sub = victory
      ? (run.act === 4 ? '세 개의 열쇠로 균열의 심장부까지 올라 모든 것을 끝냈습니다.' : '균열의 군주를 쓰러뜨렸습니다.')
      : heartFail ? `3막 보스를 쓰러뜨려 클리어로 기록했어요. 4막 ${run.floor}층 · ${reason}` : `${run.act}막 ${run.floor}층 · ${reason}`;
    const miles = UI.chronicleMiles ? UI.chronicleMiles(G.meta) : [];
    const next = miles.find((m) => !m.done);
    append(scr, h('div', { class: 'page scroll end' },
      h('p', { class: 'eyebrow' }, `${cmd.title} ${cmd.name} · 승천 ${run.asc}`),
      h('h1', { class: victory || heartFail ? 'good' : 'bad' }, title),
      h('p', { class: 'dim' }, sub),
      unlocks && unlocks.length ? h('div', { class: 'unlocks' }, unlocks.map((u) => h('p', { class: 'good' }, '해금 · ' + u))) : null,
      !victory && !heartFail ? h('p', { class: 'endtip' }, '팁 · ' + lossTip(run)) : null,
      next ? h('p', { class: 'dim small nextmile' }, `다음 해금 · ${next.text} → ${next.reward}`) : null,
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
        run.relics.map((id) => UI.relicChip(id, run)),
        run.augments.map((id) => {
          const a = RS.augDef(id);
          return h('button', { class: 'chip aug r' + a.rarity, 'aria-label': a.name, onclick: (e) => UI.tip(e.currentTarget, a.name + (RS.isUpgraded(id) ? '+' : ''), a.desc, a.cost ? '대가 · ' + a.cost : null) }, icon(a.icon, '', 3));
        }),
      ),
      h('p', { class: 'dim small' }, `시드 ${run.seed}`),
    ));
    // 버튼은 스크롤 밖 아래에 고정 (내용이 길어도 바로 누를 수 있게)
    append(scr, h('div', { class: 'page-foot end-foot' }, btn('타이틀로', () => UI.showTitle()), btn('새 모험', () => UI.showCommanders(), 'gold')));
    UI.show('scr-page');
    UI.lockInput(400);
  };
})((globalThis.RS = globalThis.RS || {}));
