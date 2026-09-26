// 모험 화면: 맵, 축복, 고대 존재, 선택 대기열, 보상, 상점, 이벤트, 휴식처, 보물, 결과
(function (RS) {
  'use strict';

  const UI = RS.UI;
  const { h, append, $, btn, icon, unitImg, fmt, pct } = UI;

  // ── 맵 ──
  UI.showMap = function () {
    const G = UI.G;
    const run = G.run;
    UI.rewardSel = null;
    UI.shopSel = null;
    UI.restTrain = false;
    const scr = $('#scr-map');
    scr.innerHTML = '';
    const act = RS.actDef(run);
    const box = h('div', { class: 'mapbox scroll' });
    const wings = RS.wingChoices(run);
    append(scr, [
      UI.topbar(run, `${run.act}막 · ${act.name}`),
      UI.relicStrip(run),
      box,
      h('p', { class: 'hint' }, wings.length ? `반짝이는 칸으로 이동 · 점선 칸은 날개 장화로 (${run.relicState.wingBoots.uses}회)` : '반짝이는 칸으로 이동하세요. 칸을 누르면 설명이 나옵니다.'),
    ]);
    UI.show('scr-map');
    const floors = run.map.floors;
    const nF = floors.length;
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
    for (let f = 1; f <= nF; f++) {
      for (let l = 0; l < W; l++) {
        const n = floors[f - 1][l];
        if (!n) continue;
        const shown = n.resolved || n.type;
        const info = RS.NODE_INFO[shown] || RS.NODE_INFO.combat;
        const here = f === run.floor && l === run.lane;
        const can = isAvail(f, l);
        const wing = !can && isWing(f, l);
        const label = n.type === 'unknown' ? (n.resolved ? `?·${RS.NODE_INFO[n.resolved].name}` : '?') : info.name;
        inner.appendChild(h('button', {
          class: `node t-${n.type}${n.visited ? ' visited' : ''}${here ? ' here' : ''}${can ? ' avail' : ''}${wing ? ' wing' : ''}`,
          style: `left:${laneX(l)}%;top:${rowY(f)}px`,
          'aria-label': label,
          onclick(e) {
            if (can || wing) {
              RS.sfx('click');
              G.enterNode(f, l, wing);
            } else {
              UI.tip(e.currentTarget, n.type === 'unknown' ? '? (미지)' : info.name, nodeDesc(n));
            }
          },
        }, icon(n.type === 'unknown' && !n.resolved ? 'n_event' : info.icon, '', 3),
        n.burning ? h('span', { class: 'burn' }, icon('flameE', '', 3)) : null,
        h('span', { class: 'nlabel' }, label)));
      }
    }
    box.appendChild(inner);
    const targetY = rowY(Math.min(nF, run.floor + 1));
    box.scrollTop = Math.max(0, targetY - box.clientHeight * 0.55);
  };

  function nodeDesc(n) {
    if (n.burning) return '불타는 엘리트. 무작위 강화를 받은 엘리트가 나온다. 이기면 유물과 함께 에메랄드 열쇠.';
    return {
      combat: '적 웨이브 3개. 이기면 골드와 증강 선택.',
      elite: '마지막 웨이브에 엘리트 등장. 좋은 증강과 유물.',
      unknown: '들어가 봐야 안다. 대개 이벤트지만 전투·상점·보물일 수도 있다. 이벤트가 나올수록 다른 것이 나올 확률이 오른다.',
      shop: '유물·증강·소모품·용병을 사고, 증강·저주를 없애거나 룬을 새긴다.',
      rest: '회복하거나 수련·연마한다. 열쇠를 회수할 수도 있다.',
      treasure: '유물이 든 상자. 사파이어 열쇠를 대신 가져갈 수도 있다.',
      boss: '막의 보스. 제한 시간 안에 쓰러뜨리세요.',
    }[n.type];
  }

  // ── 시작의 축복 (균열의 문지기) ──
  UI.showNeow = function () {
    const G = UI.G;
    const run = G.run;
    const cmd = RS.COMMANDER[run.commander];
    const body = h('div', { class: 'event' },
      h('div', { class: 'event-art big' }, icon('shard', '', 6)),
      h('p', { class: 'event-text' }, `균열 앞에 선 ${cmd.title} ${cmd.name}에게 문지기가 속삭인다. "올라가려는가? 그렇다면 하나를 골라라."`),
    );
    const opts = h('div', { class: 'options' });
    run.pending.blessings.forEach((b) => {
      const t = RS.blessingText(b);
      opts.appendChild(h('button', {
        class: 'btn option' + (b.kind === 'swap' ? ' swap' : ''),
        onclick() {
          RS.sfx('upgrade');
          RS.applyBlessing(run, b);
          G.afterNeow();
        },
      }, h('b', null, t.text), t.cost ? h('small', { class: 'cost' }, '대가 · ' + t.cost) : h('small', null, { small: '작은 축복', mid: '축복', big: '큰 축복', swap: '시작 유물 교환' }[b.kind])));
    });
    body.appendChild(opts);
    UI.page('균열의 문지기', null, body, null);
  };

  // ── 막 시작 (+ 고대 존재) ──
  UI.showActStart = function () {
    const G = UI.G;
    const run = G.run;
    const act = RS.actDef(run);
    const anc = run.pending && run.pending.ancient;
    const card = h('div', { class: 'act-card' },
      h('p', { class: 'eyebrow' }, `${run.act}막`),
      h('h1', null, act.name),
      h('div', { class: 'boss-preview' }, h('img', { src: RS.iconURL(act.boss, 4), alt: '' })),
      h('p', null, `이 막의 보스: ${RS.ENEMY[act.boss].name}`),
      h('p', { class: 'dim' }, RS.ENEMY[act.boss].trait),
      h('p', { class: 'good' }, `막을 넘어오며 생명을 회복했습니다 (${Math.ceil(run.life)}/${run.maxLife})`),
    );
    if (anc && !anc.done) {
      const A = RS.ANCIENT[anc.id];
      card.appendChild(h('div', { class: 'ancient' },
        h('div', { class: 'anc-head' }, icon(A.icon, '', 5), h('div', null, h('b', null, A.name), h('p', null, A.text))),
        h('div', { class: 'options' }, anc.boons.map((bid) => {
          const bo = RS.ancientBoon(bid);
          return h('button', {
            class: 'btn option anc',
            onclick() {
              RS.sfx('legend');
              RS.applyAncient(run, bid);
              anc.done = true;
              G.save();
              UI.showActStart();
            },
          }, h('b', null, bo.name), h('small', null, bo.desc), bo.cost ? h('small', { class: 'cost' }, '대가 · ' + bo.cost) : null);
        })),
      ));
    } else {
      card.appendChild(btn('출발', () => G.startAct(), 'big gold'));
    }
    UI.page(`${run.act}막`, null, card, null);
  };

  // ── 선택 대기열 (증강 고르기·제거·강화·룬 등) ──
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
    const title = item.title || '선택';
    let body;
    let footer;
    switch (item.k) {
      case 'aug':
      case 'augList': {
        if (!item.ids) {
          item.ids = RS.rollAugments(run, item.n || RS.augChoiceCount(run), item.w);
          G.save();
        }
        const ok = item.ids.indexOf(sel) >= 0 ? sel : null;
        const left = item.left || 1;
        body = h('div', null, h('h2', null, left > 1 ? `증강을 고르세요 (${left}개 더)` : '증강을 하나 고르세요'), h('div', { class: 'cards' }, item.ids.map((id) => UI.augCard(id, ok === id, () => {
          UI.choiceSel = id;
          UI.showChoice();
        }))));
        footer = [
          btn(left > 1 ? '그만 고르기' : '건너뛰기', () => done(), 'sm'),
          btn(ok ? `${RS.augDef(ok).name} 선택` : '카드를 누르세요', () => {
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
          }, 'gold grow', !ok),
        ];
        break;
      }
      case 'relicList': {
        const ok = item.ids.indexOf(sel) >= 0 ? sel : null;
        body = h('div', { class: 'cards' }, item.ids.map((id) => UI.relicCard(id, ok === id, () => {
          UI.choiceSel = id;
          UI.showChoice();
        })));
        footer = [btn(ok ? `${RS.REL[ok].name} 가져가기` : '유물을 누르세요', () => {
          RS.addRelic(run, ok);
          done();
        }, 'gold grow', !ok)];
        break;
      }
      case 'remove': {
        const rows = [];
        run.augments.forEach((id, i) => rows.push({ key: 'a' + i, el: UI.augCard(id, sel === 'a' + i, () => { UI.choiceSel = 'a' + i; UI.showChoice(); }) }));
        run.curses.forEach((id, i) => {
          const c = RS.CURSE[id];
          if (c.permanent) return;
          rows.push({ key: 'c' + i, el: h('button', { class: `card curse${sel === 'c' + i ? ' sel' : ''}`, onclick() { UI.choiceSel = 'c' + i; UI.showChoice(); } }, icon('curse', 'cic', 4), h('div', { class: 'cbody' }, h('div', { class: 'ctop' }, h('span', { class: 'rar' }, '저주'), h('b', null, c.name)), h('p', null, c.desc))) });
        });
        body = h('div', null, h('h2', null, '없앨 것을 고르세요 (저주가 위에 있어요)'), h('div', { class: 'cards' }, rows.filter((r) => r.key[0] === 'c').map((r) => r.el), rows.filter((r) => r.key[0] === 'a').map((r) => r.el)));
        footer = [
          btn('그만두기', () => done(), 'sm'),
          btn(sel ? '없애기' : '고르세요', () => {
            if (sel[0] === 'a') RS.removeAug(run, +sel.slice(1));
            else run.curses.splice(+sel.slice(1), 1);
            RS.sfx('coin');
            done();
          }, 'gold grow', !sel),
        ];
        break;
      }
      case 'upgrade':
      case 'transform': {
        const up = item.k === 'upgrade';
        const list = h('div', { class: 'cards' });
        run.augments.forEach((id, i) => {
          if (up ? !RS.canUpgradeAug(id) : !!RS.augDef(id).onPick) return;
          list.appendChild(UI.augCard(id, sel === i, () => { UI.choiceSel = i; UI.showChoice(); }));
        });
        body = h('div', null, h('h2', null, up ? '강화할 증강을 고르세요 (이로운 효과 ×1.5)' : '다른 증강으로 바꿀 증강을 고르세요 (같은 등급)'), list.children.length ? list : h('p', { class: 'dim' }, '고를 수 있는 증강이 없습니다.'));
        footer = [
          btn('그만두기', () => done(), 'sm'),
          btn(sel != null ? (up ? '강화하기' : '바꾸기') : '고르세요', () => {
            if (up) RS.upgradeAug(run, sel);
            else {
              const nid = RS.transformAug(run, sel);
              if (nid) UI.toast(`[${RS.AUG[nid].name}]이(가) 되었다!`, 'good');
            }
            RS.sfx('upgrade');
            done();
          }, 'gold grow', sel == null),
        ];
        break;
      }
      case 'runeChoice':
      case 'rune': {
        let runeId = item.rune;
        if (item.k === 'runeChoice' && !runeId) {
          body = h('div', null, h('h2', null, '새길 룬을 고르세요'), h('div', { class: 'options' }, item.runes.map((rid) => {
            const r = RS.RUNE[rid];
            return h('button', { class: 'btn option', style: `--rune:${r.color}`, onclick() { item.rune = rid; RS.sfx('click'); UI.showChoice(); } }, h('b', { class: 'runename' }, r.name), h('small', null, r.desc));
          })));
          footer = [btn('그만두기', () => done(), 'sm')];
          break;
        }
        const r = RS.RUNE[runeId];
        body = h('div', null,
          h('h2', null, `${r.name}을(를) 새길 칸을 고르세요`),
          h('p', { class: 'dim center' }, r.desc + ' · 룬은 칸에 남아 그 자리에 선 유닛에게 적용됩니다'),
          UI.boardPicker(run, { selected: sel, filter: (i, s, rune) => !rune || rune.bad, onPick: (i) => { UI.choiceSel = i; UI.showChoice(); } }),
        );
        footer = [
          btn('그만두기', () => done(), 'sm'),
          btn(sel != null ? '여기에 새기기' : '칸을 고르세요', () => {
            RS.setRune(run, sel, runeId);
            RS.sfx('upgrade');
            done();
          }, 'gold grow', sel == null),
        ];
        break;
      }
      case 'unit': {
        const op = item.op;
        const maxTier = item.maxTier == null ? 3 : item.maxTier;
        const desc = { dup: '복제할 유닛을 고르세요 (같은 칸에 1기 추가, 칸이 차면 다른 칸)', sacrifice: '모닥불에 바칠 유닛 1기를 고르세요' }[op];
        body = h('div', null, h('h2', null, desc), UI.boardPicker(run, { selected: sel, filter: (i, s) => !!s && s.tier <= maxTier, onPick: (i) => { UI.choiceSel = i; UI.showChoice(); } }));
        footer = [
          btn('그만두기', () => done(), 'sm'),
          btn(sel != null ? '결정' : '칸을 고르세요', () => {
            const s = run.board[sel];
            if (op === 'dup') {
              if (RS.addUnit(run.board, s.cls, s.tier, sel) < 0) UI.toast('빈자리가 없어 복제가 흩어졌다', 'warn');
              else UI.toast(`${RS.TIER[s.tier].name} ${RS.CLASS[s.cls].name} 복제!`, 't' + s.tier);
            } else if (op === 'sacrifice') {
              UI.toast(RS.sacrificeUnit(run, sel), 'good');
            }
            RS.sfx('upgrade');
            done();
          }, 'gold grow', sel == null),
        ];
        break;
      }
      default:
        return done();
    }
    UI.page(title, null, body, footer);
  };

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
    let footer;
    if (r.trial) {
      const T = ['', '소모품', '증강 2개 강화', '희귀 유물'];
      body.appendChild(h('p', { class: 'event-result' }, r.trial.ok ? `시험 통과! 보상: ${T[r.trial.tier]}` : '시간 안에 쓰러뜨리지 못했다. 허수아비가 비웃는 것 같다.'));
    }
    if (RS.rewardComplete(run)) {
      footer = [btn('계속', () => G.afterReward(), 'gold grow')];
    } else if (!r.augDone) {
      body.appendChild(h('h2', null, '증강을 하나 고르세요'));
      const list = h('div', { class: 'cards' });
      for (const id of r.aug) {
        list.appendChild(UI.augCard(id, sel === id, () => {
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
        btn(`건너뛰기 +${RS.BAL.skipGold[Math.min(3, run.act)]}G`, () => {
          RS.rewardSkipAug(run);
          UI.rewardSel = null;
          RS.sfx('coin');
          G.afterReward();
        }, 'sm'),
        btn(sel ? `${RS.augDef(sel).name} 선택` : '카드를 누르세요', () => {
          RS.rewardPickAug(run, sel);
          UI.rewardSel = null;
          RS.sfx('upgrade');
          G.afterReward();
        }, 'gold grow', !sel),
      ];
    } else if (r.relics && r.relics.length && !r.relicDone) {
      body.appendChild(h('h2', null, r.takeAll ? '검은 별: 유물을 모두 가져갑니다' : run.nodeType === 'boss' ? '보스 유물 · 하나를 고르세요 (강력하지만 대가가 있는 것이 많다)' : '유물 · 하나를 고르세요'));
      const list = h('div', { class: 'cards' });
      for (const id of r.relics) {
        list.appendChild(UI.relicCard(id, sel === id || r.takeAll, () => {
          RS.sfx('click');
          UI.rewardSel = id;
          UI.showReward();
        }));
      }
      body.appendChild(list);
      footer = [
        run.nodeType === 'boss' ? btn('건너뛰기', () => {
          RS.rewardPickRelic(run, null);
          G.afterReward();
        }, 'sm') : null,
        btn(r.takeAll ? '모두 가져가기' : sel ? `${RS.REL[sel].name} 가져가기` : '유물을 누르세요', () => {
          RS.rewardPickRelic(run, sel);
          UI.rewardSel = null;
          RS.sfx('upgrade');
          G.afterReward();
        }, 'gold grow', !sel && !r.takeAll),
      ];
    }
    UI.page(r.trial ? '허수아비 시험' : run.nodeType === 'boss' ? '보스 격파!' : '승리!', summary.join(' · '), body, footer);
  };

  // ── 상점 ──
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
    const footer = [
      btn('떠나기', () => {
        UI.shopSel = null;
        G.leaveNode();
      }, 'sm'),
      btn(it ? `구매 · ${it.price}G` : '물건을 누르세요', () => {
        const r = RS.shopBuy(run, sel);
        const MSG = { gold: '골드가 부족해요', full: '소모품을 더 가질 수 없어요', board: '보드에 빈칸이 없어요', none: '없앨 것이 없어요' };
        if (r.err && MSG[r.err]) {
          RS.sfx('error');
          UI.toast(MSG[r.err], 'warn');
        } else if (r.ok) {
          RS.sfx('coin');
          UI.shopSel = null;
          if (run.queue.length) {
            RS.flushQueue(run);
            G.save();
            G.route();
            return;
          }
          G.save();
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
    const body = h('div', { class: 'event' },
      h('div', { class: 'event-art' }, icon(ev.art, '', 6)),
      h('p', { class: 'event-text' }, RS.eventText(run)),
      run.pending.log && !res ? h('p', { class: 'event-log' }, run.pending.log) : null,
    );
    let footer = null;
    if (!res) {
      const opts = h('div', { class: 'options' });
      RS.eventOptions(run).forEach((o, i) => {
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
        }, h('b', null, RS.optionLabel(run, o)), h('small', null, RS.optionDesc(run, o))));
      });
      body.appendChild(opts);
    } else {
      body.appendChild(h('p', { class: 'event-result' }, res.text));
      if (run.pending.fight) footer = [btn('전투 시작', () => G.startEventFight(), 'gold grow')];
      else footer = [btn('계속', () => G.leaveNode(), 'gold grow')];
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
    if (!UI.restTrain) {
      const opts = RS.restOptions(run);
      // 유물 때문에 할 수 있는 것이 하나도 없으면 그냥 지나간다
      if (!opts.some((o) => !o.off)) footer = [btn('그냥 지나간다', () => G.leaveNode(), 'gold grow')];
      body.appendChild(h('div', { class: 'options' }, opts.map((o) => h('button', {
        class: 'btn option',
        disabled: !!o.off,
        onclick() {
          if (o.id === 'train') {
            RS.sfx('click');
            UI.restTrain = true;
            UI.showRest();
            return;
          }
          RS.sfx('upgrade');
          RS.restDo(run, o.id);
          if (o.id === 'recall') UI.toast('루비 열쇠를 얻었다!', 'good');
          G.leaveNode();
        },
      }, h('b', null, o.label), h('small', null, o.off || o.desc)))));
    } else {
      const train = RS.restTrainAmount(run);
      const grid = h('div', { class: 'upg-grid wide' });
      for (const c of RS.CLASSES) {
        grid.appendChild(h('button', {
          class: 'upg',
          onclick() {
            RS.sfx('upgrade');
            RS.restDo(run, 'train', c);
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
    UI.page('휴식처', null, body, footer);
  };

  // ── 보물 ──
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
      footer = [
        canKey ? btn('사파이어 열쇠를 가져간다', () => {
          RS.sfx('coin');
          RS.openChest(run, true);
          G.save();
          UI.showTreasure();
        }, 'sm') : null,
        btn('상자를 연다', () => {
          RS.sfx('coin');
          RS.openChest(run, false);
          G.save();
          UI.showTreasure();
        }, 'gold grow'),
      ];
    } else {
      if (p.gotKey) body.appendChild(h('div', { class: 'keygot' }, icon('key_sapphire', '', 4), h('b', null, '사파이어 열쇠를 얻었다! (유물은 두고 간다)')));
      else {
        body.appendChild(h('h2', null, p.got && p.got.length ? '유물을 얻었다!' : '상자는 비어 있었다'));
        for (const id of p.got || []) body.appendChild(UI.relicCard(id, false, () => {}));
      }
      if (p.spoils) body.appendChild(h('p', { class: 'good' }, `보물 지도가 가리킨 곳이다! 골드 +${p.spoils}`));
      if (p.curse) body.appendChild(h('p', { class: 'cost' }, `저주받은 열쇠: 저주 [${RS.CURSE[p.curse].name}]`));
      footer = [btn('계속', () => G.leaveNode(), 'gold grow')];
    }
    UI.page('보물', null, body, footer);
  };

  // ── 결과 ──
  UI.showEnd = function (victory, unlocks) {
    const G = UI.G;
    const run = G.run;
    const scr = $('#scr-page');
    scr.innerHTML = '';
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
    const title = victory ? (run.act === 4 ? '균열의 심장을 부쉈다!' : '균열을 닫았다!') : '쓰러졌다…';
    append(scr, h('div', { class: 'page scroll end' },
      h('p', { class: 'eyebrow' }, `${cmd.title} ${cmd.name} · 승천 ${run.asc}`),
      h('h1', { class: victory ? 'good' : 'bad' }, title),
      h('p', { class: 'dim' }, victory ? (run.act === 4 ? '세 개의 열쇠로 균열의 심장부까지 올라 모든 것을 끝냈습니다.' : '균열의 군주를 쓰러뜨렸습니다.') : `${run.act}막 ${run.floor}층 · ${reason}`),
      unlocks && unlocks.length ? h('div', { class: 'unlocks' }, unlocks.map((u) => h('p', { class: 'good' }, '해금 · ' + u))) : null,
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
          return h('button', { class: 'chip aug r' + a.rarity, onclick: (e) => UI.tip(e.currentTarget, a.name + (RS.isUpgraded(id) ? '+' : ''), a.desc, a.cost ? '대가 · ' + a.cost : null) }, icon(a.icon, '', 3));
        }),
      ),
      h('p', { class: 'dim small' }, `시드 ${run.seed}`),
      h('div', { class: 'row2' }, btn('타이틀로', () => UI.showTitle()), btn('새 모험', () => UI.showCommanders(), 'gold')),
    ));
    UI.show('scr-page');
  };
})((globalThis.RS = globalThis.RS || {}));
