// 지휘관(캐릭터), 승천 단계, 시작의 축복
(function (RS) {
  'use strict';

  const W = (k, a, m, r, f) => ({ knight: k, archer: a, mage: m, rogue: r, frost: f });

  // weights: 소환·합성 때 나오는 클래스 가중치. unlock: 메타 기록으로 해금
  RS.COMMANDERS = [
    {
      id: 'leon', name: '레온', title: '용병대장', relic: 'mercContract', weights: W(1, 1, 1, 1, 1), portrait: ['knight', 3],
      desc: '모든 클래스가 고르게 나온다. 전투에서 이길 때마다 골드를 더 받는다.',
    },
    {
      id: 'bron', name: '브론', title: '기사단장', relic: 'ironCrest', weights: W(2, 1, 0.7, 2, 0.7), portrait: ['rogue', 3],
      desc: '전사·도적이 자주 나온다. 바깥 칸 싸움에 강하지만 유령에 약하다.',
    },
    {
      id: 'bel', name: '벨', title: '강령술사', relic: 'soulJar', weights: W(1, 1, 1.2, 1, 1), portrait: ['mage', 2],
      desc: '쓰러진 적의 영혼을 모은다. 적 50마리마다 유닛이 무료로 일어난다.',
    },
    {
      id: 'ella', name: '엘라', title: '대현자', relic: 'manaSpring', weights: W(0.7, 1, 2, 0.7, 1.5), portrait: ['mage', 3],
      desc: '마법사·서리술사가 자주 나온다. 유령·리치에 강하다.',
      unlock: { bestAct: 2, text: '2막에 도달하면 해금' },
    },
    {
      id: 'kai', name: '카이', title: '사냥꾼', relic: 'hawkFeather', weights: W(0.7, 2.5, 0.7, 1, 1.2), portrait: ['archer', 3],
      desc: '궁수 특화. 넓은 사거리로 길 전체를 덮지만 골렘에 약하다.',
      unlock: { bestAct: 3, text: '3막에 도달하면 해금' },
    },
    {
      id: 'mira', name: '미라', title: '연금술사', relic: 'alchemyPot', weights: W(1, 1, 1, 1, 1), portrait: ['frost', 3], startItems: 3,
      desc: '소모품의 달인. 소모품 3개를 들고 시작하고 전투 후 소모품이 더 잘 나온다.',
      unlock: { wins: 1, text: '한 번 클리어하면 해금' },
    },
    {
      id: 'astra', name: '아스트라', title: '별의 섭정', relic: 'starScepter', weights: W(1, 1.2, 1, 1, 1.2), portrait: ['archer', 2],
      desc: '웨이브마다 별을 모아 [별똥별]로 모든 적을 내리친다. 위기를 한 번에 뒤집는 지휘관.',
      unlock: { wins: 2, text: '두 번 클리어하면 해금' },
    },
  ];
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

  // 승천: 클리어할 때마다 한 단계씩 열린다. 높은 단계는 낮은 단계 효과를 모두 포함
  RS.ASCENSION = [
    '기본 난이도',
    '엘리트가 더 자주 나오고 체력 +15%',
    '상점 가격·제거 비용 +15%',
    '일반 적 체력 +10%',
    '막을 넘어갈 때 회복이 절반',
    '엘리트·보스가 한 바퀴를 돌 때 잃는 생명 +1',
    '최대 생명 -4로 시작',
    '보스 체력 +15%',
    '강화 비용 +20%',
    '저주 [승천자의 짐]을 안고 시작 (모든 유닛 피해 -10%, 없앨 수 없다)',
    '3막 보스가 둘이 된다 (균열의 군주 + 리치, 둘 다 온전한 체력)',
  ];
  RS.MAX_ASC = RS.ASCENSION.length - 1;

  // ── 시작의 축복: 균열의 문지기 (슬레이 더 스파이어의 네오) ──
  // 네 줄: 작은 축복 / 중간 축복 / 대가를 치르는 큰 축복 / 시작 유물을 보스 유물로
  const SMALL = [
    { id: 'maxLife', text: '최대 생명 +4', apply(run) { RS.changeMaxLife(run, 4); RS.heal(run, 4); } },
    { id: 'gold', text: '골드 +80', apply(run) { RS.addGold(run, 80); } },
    { id: 'items', text: '무작위 소모품 2개', apply(run) { RS.addItem(run, RS.randomItemId(run.rng)); RS.addItem(run, RS.randomItemId(run.rng)); } },
    { id: 'rareUnit', text: '희귀 유닛 1기', apply(run) { RS.grantUnits(run, 1, 1); } },
    { id: 'lament', text: '문지기의 탄식: 다음 3번의 전투에서 첫 웨이브 적의 체력이 1', apply(run) { run.lament = 3; } },
  ];
  const MID = [
    { id: 'aug', text: '증강 하나 선택 (황금 등급 위주)', apply(run) { RS.enqueue(run, { k: 'aug', w: [0, 20, 70, 10], title: '문지기의 축복' }); } },
    { id: 'rareUnits', text: '희귀 유닛 2기', apply(run) { RS.grantUnits(run, 1, 2); } },
    { id: 'relic', text: '무작위 일반 유물', apply(run) { RS.grantRandomRelic(run, [1]); } },
    { id: 'train', text: '모든 클래스 강화 +1', apply(run) { for (const c of RS.CLASSES) run.classLv[c]++; } },
    { id: 'rune', text: '보드 한 칸에 무작위 룬 새기기', apply(run) { RS.enqueue(run, { k: 'rune', rune: RS.randomRune(run.rng), title: '문지기의 축복' }); } },
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
    { id: 'prism', text: '프리즘 증강 하나 선택', apply(run) { RS.enqueue(run, { k: 'aug', w: [0, 0, 0, 1], title: '문지기의 축복' }); } },
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
