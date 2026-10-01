// 지휘관(캐릭터), 심연 단계, 시작의 축복
(function (RS) {
  'use strict';

  // ── 고유 능력: 지휘관마다 하나 (슬레이 더 스파이어의 캐릭터 고유 메커니즘) ──
  // 유물이 아니라 지휘관 자체의 힘이라, 별점술사에게 시작 유물을 바꿔도 사라지지 않는다.
  // res: 자원 이름. max·cost·start 는 기본값(전용 증강·시작 유물이 늘린다). persist: 전투가 끝나도 자원이 남는다
  RS.ABILITY = {
    charge: {
      name: '방패 돌진', res: '결의', icon: 'shield2', max: 5, cost: 2, start: 2,
      hit: 3, bigPct: 0.07, bigFlat: 1, // 피해: 일반 적 웨이브 레벨 체력 ×3, 엘리트·보스 최대 체력 7% + 레벨 체력 ×1
      gain: '전투를 시작할 때 결의 2, 웨이브마다 +1, 적의 강타를 끊을 때마다 +1',
      tip: '결의 2개로 강타를 준비하는 적을 들이받아 끊어요 (끊을 수 있으면 버튼이 반짝임)',
      desc: '강타를 준비하는 적(없으면 엘리트·보스, 그다음 가장 앞선 적)을 들이받는다: 강타를 끊고 큰 피해, 주변 적 1초 기절',
    },
    stance: {
      name: '원소 전환', res: '태세', icon: 'orb', cd: 12,
      boom: 0.04, bigBoom: 0.004, burn: 0.2, slow: 0.15, // 원소 폭발 = 모든 적 최대 체력의 boom (엘리트·보스는 bigBoom), 화상·둔화 비율
      gain: '태세를 바꾸고 12초가 지나면 다시 바꿀 수 있다',
      tip: '12초마다 화염·냉기 태세를 바꾸며 모든 적에게 원소 폭발',
      desc: '화염 태세: 모든 공격이 화상(초당 그 피해의 20%). 냉기 태세: 모든 공격이 15% 둔화. 태세를 바꾸면 원소 폭발로 모든 적에게 최대 체력의 4% 피해 (엘리트·보스는 0.4%)',
    },
    star: {
      name: '별똥별', res: '별', icon: 'star', max: 5, cost: 3, start: 0, persist: true,
      dmg: 1.5, bossMul: 0.35, // 피해 = 레벨 체력 ×dmg (보스 ×bossMul)
      gain: '웨이브마다 별 +1 (전투가 끝나도 남는다)',
      tip: '별 3개로 모든 적에게 별똥별. 엘리트가 강타를 준비할 때 쓰면 끊겨요 (버튼이 반짝임)',
      desc: '별 3개로 모든 적에게 큰 피해 (보스는 35%). 강타를 준비하는 엘리트에게 떨어뜨리면 강타가 끊긴다',
    },
  };

  // ability: 고유 능력. 모든 지휘관은 다섯 클래스가 고르게 나온다 (클래스 확률로 정체성을 만들지 않는다).
  // 지휘관마다 전용 증강(content.js 의 cmd)이 있어 고유 능력을 키운다. unlock: 메타 기록으로 해금
  RS.COMMANDERS = [
    {
      id: 'bron', name: '브론', title: '기사단장', relic: 'ironCrest', ability: 'charge', portrait: ['knight', 3],
      desc: '강타를 받아치는 기사. [방패 돌진]으로 엘리트·보스의 강타를 끊고, 결의를 쌓아 버틴다.',
    },
    {
      id: 'ella', name: '엘라', title: '대현자', relic: 'manaSpring', ability: 'stance', portrait: ['mage', 3],
      desc: '화염과 냉기를 오가는 마법사. 화상으로 태우거나 둔화로 붙잡고, 태세를 바꿀 때마다 [원소 폭발].',
      unlock: { bestAct: 2, text: '2막에 도달하면 해금' },
    },
    {
      id: 'astra', name: '아스트라', title: '별의 섭정', relic: 'starScepter', ability: 'star', portrait: ['archer', 2],
      desc: '웨이브마다 별을 모아 [별똥별]로 모든 적을 내리친다. 엘리트의 강타를 끊는 데 쓸지, 모아 둘지가 승부.',
      unlock: { wins: 1, text: '한 번 클리어하면 해금' },
    },
  ];
  // 빠진 지휘관(레온·벨·카이·미라)으로 저장된 모험은 가장 가까운 지휘관으로 이어 간다
  RS.COMMANDER_ALIAS = { leon: 'bron', bel: 'ella', kai: 'astra', mira: 'ella' };
  RS.COMMANDER = {};
  for (const c of RS.COMMANDERS) RS.COMMANDER[c.id] = c;

  RS.commanderUnlocked = function (c, meta) {
    const u = c.unlock;
    if (!u) return true;
    if (u.bestAct && (meta.bestAct || 0) >= u.bestAct) return true;
    if (u.wins && (meta.wins || 0) >= u.wins) return true;
    if (meta.unlockAll) return true;
    return false;
  };

  // 심연: 클리어할 때마다 한 단계씩 열린다. 높은 단계는 낮은 단계 효과를 모두 포함
  RS.ASCENSION = [
    '기본 난이도',
    '엘리트가 더 자주 나오고 체력 +15%, 엘리트 강타 피해 +1',
    '상점 가격·제거 비용 +15%',
    '일반 적 체력 +10%',
    '막을 넘어갈 때 잃은 생명의 75%만 회복',
    '엘리트·보스가 한 바퀴를 돌 때 잃는 생명 +1',
    '최대 생명 -4로 시작',
    '보스 체력 +10%',
    '강화 비용 +20%',
    '저주 [심연의 짐]을 안고 시작 (모든 유닛 피해 -10%, 없앨 수 없다)',
    '3막 보스가 둘이 된다 (균열의 군주 + 리치, 둘 다 온전한 체력)',
  ];
  RS.MAX_ASC = RS.ASCENSION.length - 1;

  // ── 시작의 축복: 별점술사 (슬레이 더 스파이어의 네오) ──
  // 네 줄: 작은 축복 / 중간 축복 / 대가를 치르는 큰 축복 / 시작 유물을 보스 유물로
  const SMALL = [
    { id: 'maxLife', text: '최대 생명 +4', apply(run) { RS.changeMaxLife(run, 4); RS.heal(run, 4); } },
    { id: 'gold', text: '골드 +80', apply(run) { RS.addGold(run, 80); } },
    { id: 'items', text: '무작위 소모품 2개', apply(run) { RS.addItem(run, RS.randomItemId(run.rng)); RS.addItem(run, RS.randomItemId(run.rng)); } },
    { id: 'rareUnit', text: '희귀 유닛 1기', apply(run) { RS.grantUnits(run, 1, 1); } },
    { id: 'lament', text: '졸음의 별: 다음 3번의 전투에서 첫 웨이브 적의 체력이 1', apply(run) { run.lament = 3; } },
  ];
  const MID = [
    { id: 'aug', text: '증강 하나 선택 (황금 등급 위주)', apply(run) { RS.enqueue(run, { k: 'aug', w: [0, 20, 70, 10], title: '별점술사의 점괘' }); } },
    { id: 'rareUnits', text: '희귀 유닛 2기', apply(run) { RS.grantUnits(run, 1, 2); } },
    { id: 'relic', text: '무작위 일반 유물', apply(run) { RS.grantRandomRelic(run, [1]); } },
    { id: 'train', text: '모든 클래스 강화 +1', apply(run) { for (const c of RS.CLASSES) run.classLv[c]++; } },
    { id: 'rune', text: '보드 한 칸에 무작위 룬 새기기', apply(run) { RS.enqueue(run, { k: 'rune', rune: RS.randomRune(run.rng), title: '별점술사의 점괘' }); } },
  ];
  const COSTS = [
    { id: 'loseMax', text: '최대 생명 -3', apply(run) { RS.changeMaxLife(run, -3); } },
    { id: 'tax', text: '다음 3번의 전투에서 웨이브 시작 골드를 받지 못한다', apply(run) { run.tax = 3; } },
    { id: 'curse', text: '무작위 저주', apply(run) { RS.addCurse(run, RS.randomCurseId(run.rng)); } },
    { id: 'hurt', text: '생명 -30%', apply(run) { RS.damageLife(run, Math.floor(run.life * 0.3)); } },
  ];
  const BIG = [
    { id: 'rareRelic', text: '무작위 희귀 유물', apply(run) { RS.grantRandomRelic(run, [2]); } },
    { id: 'gold', text: '골드 +200', apply(run) { RS.addGold(run, 200); } },
    { id: 'prism', text: '프리즘 증강 하나 선택', apply(run) { RS.enqueue(run, { k: 'aug', w: [0, 0, 0, 1], title: '별점술사의 점괘' }); } },
    { id: 'epic', text: '영웅 유닛 1기', apply(run) { RS.grantUnits(run, 2, 1); } },
    { id: 'maxLife', text: '최대 생명 +8', clash: 'loseMax', apply(run) { RS.changeMaxLife(run, 8); RS.heal(run, 8); } },
  ];

  RS.rollBlessings = function (run) {
    const rng = run.rng;
    const cost = rng.pick(COSTS);
    const big = rng.pick(BIG.filter((b) => b.clash !== cost.id));
    return [
      { kind: 'small', id: rng.pick(SMALL).id },
      { kind: 'mid', id: rng.pick(MID).id },
      { kind: 'big', id: big.id, cost: cost.id },
      { kind: 'swap' },
    ];
  };

  const find = (list, id) => list.find((x) => x.id === id);
  RS.blessingText = function (b) {
    if (b.kind === 'small') return { text: find(SMALL, b.id).text };
    if (b.kind === 'mid') return { text: find(MID, b.id).text };
    if (b.kind === 'big') return { text: find(BIG, b.id).text, cost: find(COSTS, b.cost).text };
    return { text: '시작 유물을 무작위 보스 유물로 바꾼다' };
  };
  // 시작 유물 교환에서 빼는 보스 유물: 시작할 때는 보드·증강·저주가 비어 있어 아무 일도 하지 않는다
  const NEOW_SWAP_EXCLUDE = ['pandoraBox', 'emptyCage'];
  RS.applyBlessing = function (run, b) {
    if (b.kind === 'small') find(SMALL, b.id).apply(run);
    else if (b.kind === 'mid') find(MID, b.id).apply(run);
    else if (b.kind === 'big') {
      find(COSTS, b.cost).apply(run);
      find(BIG, b.id).apply(run);
    } else {
      // 시작 시점에는 효과가 없는 보스 유물(바꿀 유닛도, 없앨 증강·저주도 없다)은 나오지 않는다
      const ids = RS.rollRelics(run, 1, [3], [1], NEOW_SWAP_EXCLUDE);
      if (!ids.length) return;
      const start = run.relics.find((id) => RS.REL[id].rarity === 5);
      if (start) {
        run.relics.splice(run.relics.indexOf(start), 1);
        delete run.relicState[start];
      }
      RS.addRelic(run, ids[0]);
    }
  };
})((globalThis.RS = globalThis.RS || {}));
