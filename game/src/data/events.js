// 이벤트(❓ 칸). apply 는 결과 문장이나 { text, augRarity } 를 돌려준다.
(function (RS) {
  'use strict';

  const leave = (text) => ({ label: text || '떠난다', desc: '아무 일도 일어나지 않는다', apply: () => '발걸음을 돌렸다.' });

  RS.EVENTS = [
    {
      id: 'altar', title: '수상한 제단', art: 'altar',
      text: '이끼 낀 제단에서 속삭임이 들린다. "피를 바치면 힘을 주마."',
      options: [
        {
          label: '피를 바친다', desc: '생명 -5 · 무작위 유물',
          cond: (run) => run.life > 5,
          apply(run) {
            RS.damageLife(run, 5);
            const id = RS.grantRandomRelic(run, [1, 2]);
            return id ? `생명 5를 바치고 유물 [${RS.REL[id].name}]을 얻었다.` : '제단이 침묵한다. 생명만 잃었다.';
          },
        },
        leave(),
      ],
    },
    {
      id: 'gambler', title: '떠돌이 도박사', art: 'dice',
      text: '주사위를 굴리던 사내가 씩 웃는다. "한 판 어때? 딴 만큼 두 배로 쳐 주지."',
      options: [
        {
          label: '골드 절반을 건다', desc: '50%: 두 배 / 50%: 잃는다',
          cond: (run) => run.gold >= 20,
          apply(run, rng) {
            const bet = Math.floor(run.gold / 2);
            if (rng.chance(0.5)) {
              RS.addGold(run, bet);
              return `이겼다! 골드 +${bet}`;
            }
            RS.addGold(run, -bet);
            return `졌다… 골드 -${bet}`;
          },
        },
        leave('거절한다'),
      ],
    },
    {
      id: 'dojo', title: '버려진 훈련장', art: 'sword',
      text: '녹슨 허수아비들이 줄지어 서 있다. 누군가 수련하던 흔적이 남아 있다.',
      options: [
        {
          label: '혼자 수련한다', desc: '무작위 클래스 강화 +2',
          apply(run, rng) {
            const c = rng.pick(RS.CLASSES);
            run.classLv[c] += 2;
            return `${RS.CLASS[c].name} 강화 +2`;
          },
        },
        {
          label: '교관을 고용한다', desc: (run) => `골드 -${50 * run.act} · 보드에 가장 많은 클래스 강화 +3`,
          cond: (run) => run.gold >= 50 * run.act,
          apply(run) {
            RS.addGold(run, -50 * run.act);
            const c = RS.mostCommonClass(run);
            run.classLv[c] += 3;
            return `${RS.CLASS[c].name} 강화 +3`;
          },
        },
      ],
    },
    {
      id: 'spring', title: '균열의 샘', art: 'drop',
      text: '보랏빛으로 일렁이는 샘이다. 바닥에 가느다란 균열이 보인다.',
      options: [
        {
          label: '물을 마신다', desc: '최대 생명 +4',
          apply(run) {
            RS.changeMaxLife(run, 4);
            RS.heal(run, 4);
            return '몸에 힘이 돈다. 최대 생명 +4';
          },
        },
        {
          label: '몸을 담근다', desc: '생명 모두 회복',
          apply(run) {
            RS.heal(run, run.maxLife);
            return '상처가 모두 아물었다.';
          },
        },
        {
          label: '균열에 손을 넣는다', desc: '프리즘 증강 선택 · 저주 [균열 오염]',
          apply(run) {
            RS.addCurse(run, 'riftTaint');
            return { text: '차가운 힘이 팔을 타고 오른다. 저주 [균열 오염]을 받았다.', augRarity: 3 };
          },
        },
      ],
    },
    {
      id: 'smith', title: '떠돌이 대장장이', art: 'anvil',
      text: '"무기 좀 손봐 줄까? 값은 좀 나가지만 후회는 안 할 거야."',
      options: [
        {
          label: '모든 무기를 맡긴다', desc: (run) => `골드 -${60 * run.act} · 모든 클래스 강화 +1`,
          cond: (run) => run.gold >= 60 * run.act,
          apply(run) {
            RS.addGold(run, -60 * run.act);
            for (const c of RS.CLASSES) run.classLv[c] += 1;
            return '모든 클래스 강화 +1';
          },
        },
        leave(),
      ],
    },
    {
      id: 'mirrorRoom', title: '거울의 방', art: 'mirror',
      text: '끝없이 이어진 거울 속에서 당신의 병사들이 웃고 있다.',
      options: [
        {
          label: '거울에 손을 댄다', desc: '가장 높은 등급 유닛 1기 복제 · 저주 [불운]',
          cond: (run) => RS.boardUnitCount(run.board) > 0,
          apply(run) {
            const best = RS.bestUnit(run.board);
            RS.addCurse(run, 'unlucky');
            if (best && RS.addUnit(run.board, best.cls, best.tier) >= 0) {
              return `${RS.TIER[best.tier].name} ${RS.CLASS[best.cls].name}이(가) 하나 더 생겼다. 저주 [불운]을 받았다.`;
            }
            return '빈칸이 없어 복제가 흩어졌다. 저주 [불운]만 남았다.';
          },
        },
        leave(),
      ],
    },
    {
      id: 'chest', title: '수상한 상자', art: 'chest',
      text: '길 한가운데 덩그러니 놓인 상자. 살짝 움직인 것 같기도 하다.',
      options: [
        {
          label: '연다', desc: '60%: 소모품 2개 / 40%: 미믹 (생명 -7, 유물)',
          apply(run, rng) {
            if (rng.chance(0.6)) {
              const a = RS.randomItemId(rng);
              const b = RS.randomItemId(rng);
              const got = [RS.addItem(run, a), RS.addItem(run, b)].filter(Boolean).length;
              return got ? `소모품 ${got}개를 얻었다.` : '소모품이 들어 있었지만 가방이 꽉 찼다.';
            }
            RS.damageLife(run, 7);
            const id = RS.grantRandomRelic(run, [1, 2]);
            return `미믹이었다! 생명 -7. 쓰러뜨린 미믹 속에서 [${id ? RS.REL[id].name : '먼지'}]를 찾았다.`;
          },
        },
        leave('무시한다'),
      ],
    },
    {
      id: 'pilgrim', title: '순례자', art: 'heart',
      text: '지친 순례자가 기도를 올려 주겠다고 한다. 대신 여비가 조금 필요하다고.',
      options: [
        {
          label: '골드를 기부한다', desc: (run) => `골드 -${30 * run.act} · 생명 +8`,
          cond: (run) => run.gold >= 30 * run.act,
          apply(run) {
            RS.addGold(run, -30 * run.act);
            RS.heal(run, 8);
            return '따뜻한 빛이 감싼다. 생명 +8';
          },
        },
        leave('지나친다'),
      ],
    },
    {
      id: 'cursedMerchant', title: '저주받은 상인', art: 'coin',
      text: '두건 아래 눈이 번뜩인다. "금화를 잔뜩 주지. 대신 작은 짐 하나만 져 줘."',
      options: [
        {
          label: '거래한다', desc: (run) => `골드 +${100 * run.act} · 저주 [세금]`,
          apply(run) {
            RS.addGold(run, 100 * run.act);
            RS.addCurse(run, 'taxed');
            return `골드 +${100 * run.act}. 어깨가 무거워졌다. 저주 [세금]`;
          },
        },
        leave('거절한다'),
      ],
    },
    {
      id: 'thief', title: '고블린 도둑', art: 'bag',
      text: '고블린이 골드 주머니를 낚아채 달아난다!',
      options: [
        {
          label: '쫓아간다', desc: '생명 -4 · 골드를 지키고 +20% 더',
          cond: (run) => run.life > 4,
          apply(run) {
            RS.damageLife(run, 4);
            const bonus = Math.floor(run.gold * 0.2);
            RS.addGold(run, bonus);
            return `붙잡았다! 생명 -4, 골드 +${bonus}`;
          },
        },
        {
          label: '보내 준다', desc: '골드 -25%',
          apply(run) {
            const loss = Math.floor(run.gold * 0.25);
            RS.addGold(run, -loss);
            return `골드 -${loss}`;
          },
        },
      ],
    },
  ];

  RS.EVENT = {};
  for (const e of RS.EVENTS) RS.EVENT[e.id] = e;
})((globalThis.RS = globalThis.RS || {}));
