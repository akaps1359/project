// 이벤트(? 칸). 슬레이 더 스파이어 1·2의 이벤트 구조를 이 게임에 맞게 옮겼다.
// apply 결과: 문장 또는 { text, augRarity, fight, next(다음 단계), again(같은 단계 반복) }
// 선택이 필요한 효과(증강 연마·칸 고르기 등)는 RS.enqueue 로 대기열에 넣는다.
// 규칙: 해낼 수 없는 선택지(없앨 것·연마할 것이 없음, 가방·보드가 가득 참, 회복 불가, 골드 부족,
//       생명이 대가보다 적음)는 cond 로 막고, 단계마다 조건 없는 선택지를 하나 이상 둔다.
//       골드·생명을 먼저 치르고 대기열로 고르는 서비스는 refund/refundLife 를 붙여 그만두면 돌려준다.
(function (RS) {
  'use strict';

  const leave = (label, text) => ({ label: label || '떠난다', desc: '아무 일도 일어나지 않는다', apply: () => text || '발걸음을 돌렸다.' });
  const act = (run) => Math.min(3, run.act);
  const upgradableCount = (run) => run.augments.filter((id) => RS.canUpgradeAug(id)).length;
  const hasUpgradable = (run) => upgradableCount(run) > 0;
  const hasRemovable = (run) => RS.removableCount(run) > 0;
  const hasTransformable = (run) => RS.transformableCount(run) > 0;
  const hasUnit = (run, maxTier) => run.board.some((s) => s && (maxTier == null || s.tier <= maxTier));
  // 회복이 의미 있을 때만 (시든 꽃의 낙인이 없고, 다친 상태)
  const canHeal = (run) => RS.canHeal(run) && run.life < run.maxLife;
  const bagSpace = (run) => !RS.collectMods(run).noItems && run.items.length < RS.itemSlots(run);
  const runeSlot = (run) => run.runes.some((r) => !r || RS.RUNE[r].bad);
  const relicLeft = (run, rar) => RS.relicsLeft(run, rar);
  const q = (run, item) => RS.enqueue(run, item);
  // 생명을 잃고, 실제로 잃은 만큼 적는다 (이벤트로는 생명이 1 아래로 내려가지 않는다)
  const hurt = (run, d) => {
    const lost = RS.damageLife(run, d);
    return lost > 0 ? `생명 -${lost}` : '생명은 더 줄지 않았다';
  };
  const relicName = (id) => (id ? RS.REL[id].name : '먼지');

  RS.EVENTS = [
    // ── 어느 막에서나 ──
    {
      id: 'altar', title: '수상한 제단', art: 'n_event',
      text: '이끼 낀 제단에서 속삭임이 들린다. "피를 바치면 힘을 주마."',
      options: [
        {
          label: '피를 바친다', desc: '생명 -5 · 무작위 유물', cond: (run) => run.life > 5 && relicLeft(run, [1, 2]),
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
          label: '골드 절반을 건다', desc: '50%: 두 배 / 50%: 잃는다', cond: (run) => run.gold >= 20,
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
          label: '교관을 고용한다', desc: (run) => `골드 -${50 * act(run)} · 보드에서 가장 강한 클래스 강화 +3`,
          cond: (run) => run.gold >= 50 * act(run) && hasUnit(run),
          apply(run) {
            RS.addGold(run, -50 * act(run));
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
        { label: '물을 마신다', desc: '최대 생명 +4', apply(run) { RS.changeMaxLife(run, 4); RS.heal(run, 4); return '몸에 힘이 돈다. 최대 생명 +4'; } },
        { label: '몸을 담근다', desc: '생명 모두 회복', cond: canHeal, apply(run) { const h = RS.heal(run, run.maxLife); return `상처가 모두 아물었다. 생명 +${h}`; } },
        {
          label: '균열에 손을 넣는다', desc: '프리즘 증강 선택 · 저주 [균열 오염]',
          apply(run) {
            const got = RS.addCurse(run, 'riftTaint');
            return { text: got ? '차가운 힘이 팔을 타고 오른다. 저주 [균열 오염]을 받았다.' : '액막이 매듭이 저주를 막아 냈다!', augRarity: 3 };
          },
        },
      ],
    },
    {
      id: 'smith', title: '떠돌이 대장장이', art: 'anvil',
      text: '"무기 좀 손봐 줄까? 값은 좀 나가지만 후회는 안 할 거야."',
      options: [
        {
          label: '모든 무기를 맡긴다', desc: (run) => `골드 -${60 * act(run)} · 모든 클래스 강화 +1`,
          cond: (run) => run.gold >= 60 * act(run),
          apply(run) {
            RS.addGold(run, -60 * act(run));
            for (const c of RS.CLASSES) run.classLv[c] += 1;
            return '모든 클래스 강화 +1';
          },
        },
        leave(),
      ],
    },
    {
      id: 'duplicator', title: '장난꾸러기 거울', art: 'mirror',
      text: '금테 두른 거울이 킥킥 웃는다. "네 병사 하나만 빌려줘. 똑같이 하나 더 뽑아 줄게!"',
      options: [
        {
          label: '거울에 손을 댄다', desc: '영웅 이하 유닛 1기를 골라 복제', cond: (run) => hasUnit(run, 2) && RS.hasEmptySlot(run.board),
          apply(run) {
            q(run, { k: 'unit', op: 'dup', maxTier: 2, title: '장난꾸러기 거울' });
            return '거울 표면이 물결친다.';
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
          label: '연다', desc: '60%: 소모품 2개 / 40%: 미믹 (생명 -7, 유물)', cond: (run) => run.life > 7,
          apply(run, rng) {
            if (rng.chance(0.6)) {
              const got = [RS.addItem(run, RS.randomItemId(rng)), RS.addItem(run, RS.randomItemId(rng))].filter(Boolean).length;
              return got === 2 ? '소모품 2개를 얻었다.' : got ? '소모품 2개 중 1개만 가질 수 있었다.' : '소모품이 들어 있었지만 가질 수 없었다.';
            }
            const h = hurt(run, 7);
            const id = RS.grantRandomRelic(run, [1, 2]);
            return id ? `미믹이었다! ${h}. 쓰러뜨린 미믹 속에서 [${RS.REL[id].name}]을(를) 찾았다.` : `미믹이었다! ${h}. 미믹 속은 텅 비어 있었다.`;
          },
        },
        leave('무시한다'),
      ],
    },
    {
      id: 'cleric', title: '약초꾼 할멈', art: 'heart',
      text: '약초 바구니를 멘 할멈이 손짓한다. "어디 다쳤나? 아니면… 떼어 낼 게 붙었나?"',
      options: [
        {
          label: '치유', desc: '골드 -35 · 생명 +8', cond: (run) => run.gold >= 35 && canHeal(run),
          apply(run) {
            RS.addGold(run, -35);
            const h = RS.heal(run, 8);
            return `따뜻한 빛이 감싼다. 생명 +${h}`;
          },
        },
        {
          label: '정화', desc: (run) => `골드 -${50 * act(run)} · 증강이나 저주 하나 제거`,
          cond: (run) => run.gold >= 50 * act(run) && hasRemovable(run),
          apply(run) {
            const g = 50 * act(run);
            RS.addGold(run, -g);
            q(run, { k: 'remove', title: '정화', refund: g });
            return '할멈이 쑥 연기를 훅 불어 준다.';
          },
        },
        leave(),
      ],
    },
    {
      id: 'serpent', title: '금화 뱀', art: 'snake',
      text: '금화 더미 위에 똬리를 튼 뱀이 혀를 날름거린다. "다 가져가도 돼. 대신 머리가 좀 핑 돌 거야."',
      options: [
        {
          label: '받아들인다', desc: (run) => `골드 +${100 * act(run)} · 저주 [현기증]`,
          apply(run) {
            RS.addGold(run, 100 * act(run));
            return RS.addCurse(run, 'doubt') ? `골드 +${100 * act(run)}. 눈앞이 빙글빙글 돈다. 저주 [현기증]` : `골드 +${100 * act(run)}. 액막이 매듭이 저주를 막았다!`;
          },
        },
        leave('거절한다'),
      ],
    },
    {
      id: 'thief', title: '너구리 산적단', art: 'mask',
      text: '너구리 탈을 쓴 무리가 길을 막는다. "이 길은 우리 구역이다! 통행료를 내시지."',
      options: [
        {
          label: '맞서 싸운다', desc: '엘리트 전투 · 이기면 유물 + 골드',
          apply() {
            return { text: '산적들이 몽둥이를 치켜든다!', fight: { as: 'elite', elite: 'darkKnight', relic: [1, 2], relicChoices: 2 } };
          },
        },
        {
          label: '돈을 낸다', desc: '골드를 모두 잃는다',
          apply(run) {
            const g = Math.floor(run.gold);
            run.gold = 0;
            return g > 0 ? `골드 ${g}을(를) 빼앗겼다.` : '빈 주머니를 보여 주자 너구리들이 투덜대며 길을 비켰다.';
          },
        },
      ],
    },
    {
      id: 'goldenIdol', title: '두꺼비 사당', art: 'idol',
      steps: [
        {
          text: '낡은 사당 안에 금두꺼비 상이 입에 동전을 물고 앉아 있다. 바닥에 수상한 홈이 파여 있다.',
          options: [
            {
              label: '두꺼비를 집는다', desc: '유물 [금두꺼비] (함정이 있을지도)',
              apply(run) {
                let got = '';
                if (!RS.hasRelic(run, 'goldIdol')) RS.addRelic(run, 'goldIdol');
                else {
                  RS.addGold(run, 120);
                  got = ' (이미 가진 두꺼비라 녹여서 골드 +120)';
                }
                return { text: `두꺼비를 들어 올리는 순간, 사당이 흔들리며 거대한 바위가 굴러온다!${got}`, next: 1 };
              },
            },
            leave(),
          ],
        },
        {
          text: '바위가 굴러온다! 어떻게 할까?',
          options: [
            { label: '뛴다', desc: '저주 [연약함]', apply(run) { return RS.addCurse(run, 'fragile') ? '간신히 빠져나왔지만 발목을 다쳤다. 저주 [연약함]' : '액막이 매듭 덕분에 다치지 않았다!'; } },
            {
              label: '맞서서 부순다', desc: '생명 -25%(최대 기준)', cond: (run) => run.life > Math.ceil(run.maxLife * 0.25),
              apply(run) { return `바위를 부쉈다. ${hurt(run, Math.ceil(run.maxLife * 0.25))}`; },
            },
            { label: '구덩이로 숨는다', desc: '최대 생명 -2', cond: (run) => run.maxLife > 2, apply(run) { RS.changeMaxLife(run, -2); return '몸을 던져 피했다. 최대 생명 -2'; } },
          ],
        },
      ],
    },
    {
      id: 'wingStatue', title: '깃털 석상', art: 'wing',
      text: '온몸이 깃털로 조각된 새 석상. 부리 밑에 소원 쪽지가 끼워져 있고, 발치 틈새로 금화가 반짝인다.',
      options: [
        {
          label: '기도한다', desc: '생명 -4 · 증강이나 저주 하나 제거', cond: (run) => run.life > 4 && hasRemovable(run),
          apply(run) {
            const lost = RS.damageLife(run, 4);
            q(run, { k: 'remove', title: '깃털 석상', refundLife: lost });
            return `석상의 깃털이 희미하게 빛난다. 생명 -${lost}`;
          },
        },
        {
          label: '부순다', desc: '영웅 이상 유닛이 있으면 골드 +60×막', cond: (run) => run.board.some((s) => s && s.tier >= 2),
          apply(run) {
            RS.addGold(run, 60 * act(run));
            return `강한 병사가 석상을 부쉈다. 골드 +${60 * act(run)}`;
          },
        },
        leave(),
      ],
    },
    {
      id: 'scrapOoze', title: '먹보 슬라임', art: 'slime',
      text: (run) => `뭐든 삼키는 먹보 슬라임이 트림을 한다. 말랑한 뱃속에서 무언가 반짝인다. (다음 시도: 생명 -${run.pending.ooze ? run.pending.ooze.cost : 3}, 성공 확률 ${Math.round((run.pending.ooze ? run.pending.ooze.p : 0.25) * 100)}%)`,
      options: [
        {
          label: '손을 넣는다', desc: '생명을 잃고 확률로 유물. 실패할수록 확률이 오른다', cond: (run) => run.life > (run.pending.ooze ? run.pending.ooze.cost : 3) && relicLeft(run, [1, 2]),
          apply(run, rng) {
            const o = (run.pending.ooze = run.pending.ooze || { cost: 3, p: 0.25 });
            RS.damageLife(run, o.cost);
            if (rng.chance(o.p)) {
              const id = RS.grantRandomRelic(run, [1, 2]);
              return `찾았다! 생명 -${o.cost}, 유물 [${relicName(id)}]`;
            }
            const text = `아무것도 없었다… 생명 -${o.cost}`;
            o.cost++;
            o.p = Math.min(1, o.p + 0.1);
            return { text, again: true };
          },
        },
        leave(),
      ],
    },
    {
      id: 'shiningLight', title: '빛기둥', art: 'sparkle',
      text: '하늘에서 땅까지 곧게 내리꽂힌 빛기둥. 안은 뜨겁겠지만, 나오면 무언가 달라져 있을 것 같다.',
      options: [
        {
          label: '빛 속으로', desc: '생명 -20%(최대 기준) · 무작위 증강 2개 연마', cond: (run) => hasUpgradable(run) && run.life > Math.ceil(run.maxLife * 0.2),
          apply(run, rng) {
            const d = RS.damageLife(run, Math.ceil(run.maxLife * 0.2));
            const idxs = run.augments.map((id, i) => i).filter((i) => RS.canUpgradeAug(run.augments[i]));
            rng.shuffle(idxs);
            const names = idxs.slice(0, 2).map((i) => {
              RS.upgradeAug(run, i);
              return RS.augDef(run.augments[i]).name;
            });
            return `생명 -${d}. [${names.join('], [')}] 연마!`;
          },
        },
        leave(),
      ],
    },
    {
      id: 'livingWall', title: '세 얼굴 석판', art: 'n_event',
      text: '길가의 석판에 웃는 얼굴, 찡그린 얼굴, 조는 얼굴이 새겨져 있다. 셋이 한꺼번에 떠든다. "지울래? 바꿀래? 키울래?"',
      cond: hasRemovable,
      options: [
        { label: '지운다', desc: '증강이나 저주 하나 제거', cond: hasRemovable, apply(run) { q(run, { k: 'remove', title: '세 얼굴 석판' }); return '기억 하나가 흐려진다.'; } },
        { label: '바꾼다', desc: '증강 하나를 같은 등급의 다른 증강으로 변환 (즉시 효과 증강은 제외)', cond: hasTransformable, apply(run) { q(run, { k: 'transform', title: '세 얼굴 석판' }); return '무언가가 뒤틀린다.'; } },
        { label: '키운다', desc: '증강 하나 연마', cond: hasUpgradable, apply(run) { q(run, { k: 'upgrade', title: '세 얼굴 석판' }); return '힘이 자라난다.'; } },
        leave(),
      ],
    },
    {
      id: 'goldenShrine', title: '시주함', art: 'coins',
      text: '길가 돌탑 옆의 낡은 시주함. 자물쇠가 헐겁게 달랑거린다.',
      options: [
        { label: '합장한다', desc: '골드 +100', apply(run) { RS.addGold(run, 100); return '돌탑 틈에서 누군가 두고 간 금화가 굴러 나왔다. 골드 +100'; } },
        {
          label: '털어 간다', desc: '골드 +275 · 저주 [불면]',
          apply(run) {
            RS.addGold(run, 275);
            return RS.addCurse(run, 'regret') ? '골드 +275. 오늘 밤은 잠이 안 올 것 같다. 저주 [불면]' : '골드 +275. 액막이 매듭이 저주를 막았다!';
          },
        },
        leave(),
      ],
    },
    {
      id: 'upgradeShrine', title: '연마의 제단', art: 'whetstone',
      text: '숫돌처럼 거친 제단. 무기를 대면 날이 선다.',
      cond: hasUpgradable,
      options: [
        { label: '기도한다', desc: '증강 하나 연마', cond: hasUpgradable, apply(run) { q(run, { k: 'upgrade', title: '연마의 제단' }); return '제단이 은은하게 울린다.'; } },
        leave(),
      ],
    },
    {
      id: 'purifier', title: '씻김 우물', art: 'drop',
      text: '금줄이 둘린 오래된 우물. 두레박 물을 뒤집어쓰면 붙은 것들이 씻겨 나간다고 한다.',
      cond: hasRemovable,
      options: [
        { label: '씻는다', desc: '증강이나 저주 하나 제거', cond: hasRemovable, apply(run) { q(run, { k: 'remove', title: '씻김 우물' }); return '물이 차갑고 맑다.'; } },
        leave(),
      ],
    },
    {
      id: 'transmogrifier', title: '둔갑 기계', art: 'gear',
      text: '굴뚝 달린 통에 톱니가 덕지덕지 붙은 기계. 무언가를 넣으면 전혀 다른 것으로 둔갑시켜 뱉어 낸다.',
      cond: hasTransformable,
      options: [
        { label: '넣는다', desc: '증강 하나를 같은 등급의 다른 증강으로 변환 (즉시 효과 증강은 제외)', cond: hasTransformable, apply(run) { q(run, { k: 'transform', title: '둔갑 기계' }); return '기계가 덜컹거린다.'; } },
        leave(),
      ],
    },
    {
      id: 'wheel', title: '광대의 돌림판', art: 'wheel',
      text: '방울 모자를 쓴 광대가 알록달록한 돌림판을 가리킨다. "한 번 돌려 봐! 공짜야, 아마도."',
      options: [
        {
          label: '돌린다', desc: '골드 · 유물 · 전부 회복 · 저주 · 증강 제거 · 생명 -10% 중 하나',
          apply(run, rng) {
            const r = rng.int(6);
            if (r === 0) {
              RS.addGold(run, 100 * act(run));
              return `골드 +${100 * act(run)}!`;
            }
            if (r === 1) {
              const id = RS.grantRandomRelic(run, [1, 2]);
              return id ? `유물 [${RS.REL[id].name}]!` : '유물 칸이 나왔지만 상자는 비어 있었다.';
            }
            if (r === 2) {
              if (!RS.canHeal(run)) return '회복 칸이 나왔지만 시든 꽃의 낙인이 빛을 튕겨 냈다.';
              const h = RS.heal(run, run.maxLife);
              return h > 0 ? `생명을 모두 회복했다! 생명 +${h}` : '회복 칸! 하지만 이미 멀쩡하다.';
            }
            if (r === 3) {
              const id = RS.randomCurseId(rng);
              return RS.addCurse(run, id) ? `저주 [${RS.CURSE[id].name}]을(를) 받았다…` : '저주가 나왔지만 액막이 매듭이 막았다!';
            }
            if (r === 4) {
              if (!hasRemovable(run)) return '제거 칸이 나왔지만 없앨 것이 없었다.';
              q(run, { k: 'remove', title: '광대의 돌림판' });
              return '증강이나 저주 하나를 없앨 수 있다.';
            }
            return `돌림판 화살이 튕겨 나왔다! ${hurt(run, Math.ceil(run.maxLife * 0.1))}`;
          },
        },
        leave(),
      ],
    },
    {
      id: 'bonfire', title: '도깨비 화롯불', art: 'flame',
      text: '꼬마 도깨비들이 화롯불 주위에서 방망이를 두드린다. "센 녀석을 넣어 주면 큰 선물을 줄게!"',
      cond: (run) => hasUnit(run),
      options: [
        {
          label: '유닛 1기를 바친다', desc: '일반: 없음 · 희귀: 생명 +5 · 영웅: 최대 생명 +5, 전부 회복 · 전설: 유물 + 최대 생명 +10',
          cond: (run) => hasUnit(run),
          apply(run) {
            q(run, { k: 'unit', op: 'sacrifice', title: '도깨비 화롯불' });
            return '도깨비들이 기대에 찬 눈으로 바라본다.';
          },
        },
        leave(),
      ],
    },
    {
      id: 'deadAdventurer', title: '쓰러진 원정대', art: 'skull',
      text: (run) => `먼저 균열에 들어간 원정대의 짐이 흩어져 있다. 근처에서 무언가 숨 쉬는 소리가 들린다. (습격 확률 ${Math.round((run.pending.dead ? run.pending.dead.p : 0.25) * 100)}%)`,
      options: [
        {
          label: '짐을 뒤진다', desc: '골드·유물을 찾지만, 뒤질수록 엘리트에게 습격당할 확률이 오른다',
          apply(run, rng) {
            const s = (run.pending.dead = run.pending.dead || { p: 0.25, n: 0 });
            if (rng.chance(s.p)) return { text: '짐을 지키던 괴물이 나타났다!', fight: { as: 'elite', relic: [1, 2], relicChoices: 1 } };
            s.n++;
            s.p += 0.25;
            if (s.n === 1) {
              RS.addGold(run, 30 * act(run));
              return { text: `골드 +${30 * act(run)}`, again: true };
            }
            if (s.n === 2) return { text: '아무것도 없었다.', again: true };
            const id = RS.grantRandomRelic(run, [1, 2]);
            return id ? `유물 [${RS.REL[id].name}]을(를) 찾았다!` : '짐 바닥까지 뒤졌지만 먼지뿐이었다.';
          },
        },
        leave(),
      ],
    },
    {
      id: 'mushrooms', title: '형광 버섯밭', art: 'n_event', acts: [1, 2],
      text: '발목까지 오는 형광 버섯이 빽빽하다. 구수한 냄새가 나지만, 건드리면 무언가 튀어나올 것 같다.',
      options: [
        {
          label: '짓밟는다', desc: '전투 · 이기면 유물',
          apply() {
            return { text: '버섯이 꿈틀거리며 일어선다!', fight: { as: 'combat', relic: [1], relicChoices: 1, hpMul: 1.2 } };
          },
        },
        {
          label: '먹는다', desc: '생명 25% 회복 · 저주 [곰팡이 포자]',
          apply(run) {
            const h = RS.heal(run, Math.ceil(run.maxLife * 0.25));
            const ht = !RS.canHeal(run) ? ' (시든 꽃의 낙인 때문에 회복하지 못했다)' : h > 0 ? ` 생명 +${h}.` : '';
            return RS.addCurse(run, 'parasite') ? `배가 부르다…${ht} 몸에서 곰팡이 냄새가 난다. 저주 [곰팡이 포자]` : `배가 부르다.${ht} 액막이 매듭이 저주를 막았다!`;
          },
        },
        leave(),
      ],
    },
    {
      id: 'runeMason', title: '룬 석공', art: 'gem',
      text: '돌에 룬을 새기는 노인. "자네 보드에도 하나 새겨 줄까?"',
      options: [
        {
          label: '룬을 새긴다', desc: (run) => `골드 -${40 * act(run)} · 룬 2개 중 하나를 골라 칸에 새긴다`,
          cond: (run) => run.gold >= 40 * act(run) && runeSlot(run),
          apply(run, rng) {
            const g = 40 * act(run);
            RS.addGold(run, -g);
            const a = RS.randomRune(rng);
            let b = a;
            while (b === a) b = RS.randomRune(rng);
            q(run, { k: 'runeChoice', runes: [a, b], title: '룬 석공', refund: g });
            return '석공이 끌을 집어 든다.';
          },
        },
        {
          label: '금 간 칸을 고친다', desc: '금 간 칸 하나를 되돌린다', cond: (run) => run.runes.indexOf('crack') >= 0,
          apply(run) {
            run.runes[run.runes.indexOf('crack')] = null;
            return '금이 말끔히 메워졌다.';
          },
        },
        leave(),
      ],
    },
    {
      id: 'riftCrack', title: '균열 틈', art: 'shard',
      text: '보드 한가운데에 가느다란 틈이 벌어진다. 틈 너머에서 강한 힘이 느껴진다.',
      options: [
        {
          label: '틈에 손을 넣는다', desc: '프리즘 증강 선택 · 무작위 칸 하나가 [금 간 칸]이 된다',
          apply(run, rng) {
            const free = [];
            for (let i = 0; i < run.runes.length; i++) if (!run.runes[i]) free.push(i);
            if (free.length) run.runes[rng.pick(free)] = 'crack';
            return { text: free.length ? '손끝이 얼어붙는다. 보드 한 칸에 금이 갔다.' : '손끝이 얼어붙는다. 룬이 가득한 보드에는 금이 가지 않았다.', augRarity: 3 };
          },
        },
        leave(),
      ],
    },

    // ── 슬레이 더 스파이어 2에서 착안 ──
    {
      id: 'dummy', title: '낡은 허수아비', art: 'sword',
      text: '"시간 안에 나를 쓰러뜨려 봐라!" 허수아비가 말한다. 튼튼할수록 상이 크다.',
      options: [
        { label: '짚 허수아비', desc: '쉬움 · 30초 안에 쓰러뜨리면 소모품 1개', cond: bagSpace, apply() { return { text: '허수아비가 몸을 푼다.', fight: { as: 'combat', trial: 1, timeLimit: 30 } }; } },
        { label: '나무 허수아비', desc: '보통 · 30초 안에 쓰러뜨리면 증강 2개 연마', cond: hasUpgradable, apply() { return { text: '허수아비가 몸을 푼다.', fight: { as: 'combat', trial: 2, timeLimit: 30 } }; } },
        { label: '강철 허수아비', desc: '어려움 · 30초 안에 쓰러뜨리면 희귀 유물', cond: (run) => relicLeft(run, [2]), apply() { return { text: '허수아비가 몸을 푼다.', fight: { as: 'combat', trial: 3, timeLimit: 30 } }; } },
        leave('지나친다'),
      ],
    },
    {
      id: 'tinker', title: '괴짜 공방', art: 'gear',
      steps: [
        {
          text: '고글을 쓴 괴짜 발명가가 스패너를 돌린다. "네 입맛대로 하나 만들어 주지. 먼저 뼈대를 골라."',
          options: [
            { label: '날카로운 뼈대', desc: '모든 유닛 피해 +15%', apply(run) { run.pending.tinker = { base: 'dmg' }; return { text: '좋아, 날카롭게.', next: 1 }; } },
            { label: '가벼운 뼈대', desc: '모든 유닛 공격 속도 +12%', apply(run) { run.pending.tinker = { base: 'aspd' }; return { text: '좋아, 가볍게.', next: 1 }; } },
            { label: '긴 뼈대', desc: '모든 유닛 사거리 +7', apply(run) { run.pending.tinker = { base: 'range' }; return { text: '좋아, 길게.', next: 1 }; } },
          ],
        },
        {
          text: '"이제 덧붙일 장치를 골라."',
          options: [
            { label: '치명 장치', desc: '치명타 확률 +6%', apply(run) { return RS.buildTinker(run, 'crit'); } },
            { label: '금화 장치', desc: '처치 골드 +12%', apply(run) { return RS.buildTinker(run, 'gold'); } },
            { label: '족쇄 장치', desc: '모든 적 이동 속도 -5%', apply(run) { return RS.buildTinker(run, 'slow'); } },
          ],
        },
      ],
    },
    {
      id: 'wongo', title: '퉁퉁이네 가게', art: 'bag',
      text: '배가 불룩한 상인 퉁퉁이가 주판을 튕긴다. "어서 와! 퉁퉁 포인트는 모험이 끝나도 쌓인다고!"',
      options: [
        { label: '일반 유물', desc: '골드 -100', cond: (run) => run.gold >= 100 && relicLeft(run, [1]), apply(run) { RS.addGold(run, -100); RS.wongoSpend(run, 100); const id = RS.grantRandomRelic(run, [1]); return `[${relicName(id)}]을(를) 샀다.`; } },
        { label: '희귀 유물', desc: '골드 -200', cond: (run) => run.gold >= 200 && relicLeft(run, [2]), apply(run) { RS.addGold(run, -200); RS.wongoSpend(run, 200); const id = RS.grantRandomRelic(run, [2]); return `[${relicName(id)}]을(를) 샀다.`; } },
        {
          label: '퉁퉁 쿠폰', desc: '골드 -300 · 전투 5번 뒤 유물 3개', cond: (run) => run.gold >= 300 && !(run.quests && run.quests.wongo),
          apply(run) {
            RS.addGold(run, -300);
            RS.wongoSpend(run, 300);
            run.quests = run.quests || {};
            run.quests.wongo = { left: 5 };
            return '쿠폰을 받았다. 전투 5번 뒤에 유물 3개!';
          },
        },
        {
          label: '그냥 나간다', desc: '연마된 증강 하나가 원래대로 돌아간다',
          apply(run, rng) {
            const up = run.augments.map((id, i) => i).filter((i) => RS.isUpgraded(run.augments[i]));
            if (!up.length) return '퉁퉁이가 투덜거린다.';
            const i = rng.pick(up);
            run.augments[i] = run.augments[i].slice(0, -1);
            return `퉁퉁이가 투덜거리며 [${RS.augDef(run.augments[i]).name}]의 연마를 떼어 갔다.`;
          },
        },
      ],
    },
    {
      id: 'trial', title: '엉터리 재판', art: 'crest',
      text: '"피고인은 앞으로!" 부엉이 판사가 망치를 두드린다. 무슨 사건인지는 판사도 모르는 눈치다.',
      options: [
        {
          label: '재판을 받는다', desc: '무작위 판결: 저주 하나와 함께 큰 보상',
          apply(run, rng) {
            const r = rng.int(3);
            if (r === 0) {
              const got = RS.addCurse(run, 'regret');
              const ids = [RS.grantRandomRelic(run, [1, 2]), RS.grantRandomRelic(run, [1, 2])].filter(Boolean);
              const loot = ids.length ? `압수품 유물 ${ids.length}개([${ids.map((id) => RS.REL[id].name).join('], [')}])를 챙겼다.` : '압수품 창고는 비어 있었다.';
              return got ? `유죄! 저주 [불면]. 대신 ${loot}` : `유죄! 하지만 액막이 매듭이 저주를 막았다. ${loot}`;
            }
            if (r === 1) {
              const got = RS.addCurse(run, 'doubt');
              RS.addGold(run, 150 * act(run));
              return got ? `무죄! 배상금 골드 +${150 * act(run)}. 하지만 저주 [현기증]이 남았다.` : `무죄! 배상금 골드 +${150 * act(run)}. 액막이 매듭 덕분에 뒤끝도 없다.`;
            }
            const got = RS.addCurse(run, 'guilt');
            const n = Math.min(2, upgradableCount(run));
            for (let k = 0; k < n; k++) q(run, { k: 'upgrade', title: '엉터리 재판' });
            const head = got ? '판결 보류. 저주 [찜찜함](전투 5번 뒤 사라짐).' : '판결 보류. 액막이 매듭이 저주를 막았다.';
            return `${head} ${n ? `증강 ${n}개를 연마할 수 있다.` : '연마할 증강은 없었다.'}`;
          },
        },
        {
          label: '거부한다', desc: '50%: 무사히 빠져나간다 / 50%: 생명 -30%',
          apply(run, rng) {
            if (rng.chance(0.5)) return '법정이 혼란한 틈에 빠져나왔다.';
            return `경비병에게 붙잡혔다. ${hurt(run, Math.ceil(run.life * 0.3))}`;
          },
        },
      ],
    },
    {
      id: 'crystalSphere', title: '안개 구슬', art: 'orb',
      steps: [
        {
          text: '뿌연 안개가 소용돌이치는 유리구슬. 안개 사이로 보물과 저주가 번갈아 비친다. 들여다볼수록 더 많이 보인다.',
          options: [
            { label: '값을 치른다', desc: (run) => `골드 -${60 * act(run)} · 3번 들여다본다`, cond: (run) => run.gold >= 60 * act(run), apply(run) { RS.addGold(run, -60 * act(run)); RS.initSphere(run, 3); return { text: '구슬 속 안개가 걷히기 시작한다.', next: 1 }; } },
            {
              label: '빚을 진다', desc: '저주 [빚] · 6번 들여다본다',
              apply(run) {
                const got = RS.addCurse(run, 'debt');
                RS.initSphere(run, 6);
                return { text: got ? '구슬이 탐욕스럽게 빛난다. 저주 [빚]' : '구슬이 탐욕스럽게 빛난다. 액막이 매듭이 빚을 막았다!', next: 1 };
              },
            },
            leave(),
          ],
        },
        {
          text: (run) => `구슬 속을 들여다본다. (남은 횟수 ${run.pending.sphere ? run.pending.sphere.left : 0})`,
          options: [
            {
              label: '들여다본다', desc: '골드·소모품·증강·유물… 저주도 숨어 있다',
              cond: (run) => run.pending.sphere && run.pending.sphere.left > 0,
              apply(run) { return RS.revealSphere(run); },
            },
            leave('그만둔다', '구슬 속에 다시 안개가 낀다.'),
          ],
        },
      ],
    },
    {
      id: 'nest', title: '거대한 새 둥지', art: 'egg',
      text: '나뭇가지로 엮은 둥지에 따뜻한 알이 하나 있다. 어미는 보이지 않는다.',
      options: [
        {
          label: '알을 가져간다', desc: '퀘스트 [용의 알]: 휴식처에서 [부화]를 고르면 전설 유닛과 유물 [아기 용]', cond: (run) => !(run.quests && run.quests.egg),
          apply(run) {
            run.quests = run.quests || {};
            run.quests.egg = true;
            return '알이 가방 속에서 따뜻하게 꿈틀댄다.';
          },
        },
        { label: '알을 먹는다', desc: '최대 생명 +5', apply(run) { RS.changeMaxLife(run, 5); RS.heal(run, 5); return '든든하다. 최대 생명 +5'; } },
      ],
    },
    {
      id: 'mapVendor', title: '지도 상인', art: 'scroll', acts: [1, 2],
      text: '"다음 지역 보물 지도야. 첫 상자에 금화 400닢이 묻혀 있다고!"',
      options: [
        {
          label: '지도를 산다', desc: (run) => `골드 -${80 * act(run)} · 퀘스트 [보물 지도]: 다음 막 첫 보물 상자에서 골드 +400`,
          cond: (run) => run.gold >= 80 * act(run) && !(run.quests && run.quests.spoilsAct),
          apply(run) {
            RS.addGold(run, -80 * act(run));
            run.quests.spoilsAct = run.act + 1;
            return '낡은 지도를 품에 넣었다.';
          },
        },
        leave(),
      ],
    },
    {
      id: 'wellspring', title: '이끼 샘터', art: 'drop',
      text: '이끼 낀 바위 틈에서 물이 퐁퐁 솟는다. 물병을 채울 수도, 몸을 씻을 수도 있다.',
      options: [
        {
          label: '물병을 채운다', desc: '무작위 소모품 1개', cond: bagSpace,
          apply(run, rng) {
            const id = RS.randomItemId(rng);
            return RS.addItem(run, id) ? `소모품 [${RS.ITEM[id].name}]을(를) 얻었다.` : '가방이 가득 찼다.';
          },
        },
        {
          label: '몸을 씻는다', desc: '증강이나 저주 하나 제거 · 저주 [찜찜함](전투 5번 뒤 사라짐)', cond: hasRemovable,
          apply(run) {
            const charm = !!(run.relicState.omamori && run.relicState.omamori.charges > 0);
            const g0 = run.gold;
            const got = RS.addCurse(run, 'guilt');
            // 업보로 받은 골드 (그만두면 저주와 함께 돌려놓는다)
            const karma = got ? Math.max(0, run.gold - g0) : 0;
            // 제거를 그만두면 찜찜함도(액막이 매듭이 막았다면 그 횟수도) 되돌린다
            q(run, { k: 'remove', title: '이끼 샘터', undoCurse: got ? 'guilt' : null, undoKarma: karma, undoCharm: !got && charm ? 1 : 0 });
            return got ? '물이 차갑다. 어쩐지 개운하지가 않다. 저주 [찜찜함]' : '물이 차갑다. 액막이 매듭이 찜찜함을 막았다!';
          },
        },
        leave(),
      ],
    },
    {
      id: 'morphicGrove', title: '뒤바뀌는 숲', art: 'flower',
      text: '눈을 깜박일 때마다 나무 모양이 바뀌는 숲. 가지 끝에 금빛 열매가 달려 있다.',
      cond: (run) => run.gold >= 100,
      options: [
        {
          label: '숲에 금화를 바친다', desc: '골드를 모두 잃고 증강 2개를 변환 (즉시 효과 증강은 제외)', cond: (run) => run.gold >= 100 && hasTransformable(run),
          apply(run) {
            const paid = run.gold;
            run.gold = 0;
            const n = Math.min(2, RS.transformableCount(run));
            // 첫 변환을 그만두면 바친 골드를 돌려받고 둘째 변환도 취소된다
            q(run, { k: 'transform', title: '뒤바뀌는 숲', refund: paid, group: 'morphicGrove' });
            if (n > 1) q(run, { k: 'transform', title: '뒤바뀌는 숲', group: 'morphicGrove' });
            return n > 1 ? '금화가 흙 속으로 스며든다. 증강 2개를 바꿀 수 있다.' : '금화가 흙 속으로 스며든다. 바꿀 수 있는 증강은 하나뿐이다.';
          },
        },
        { label: '열매를 딴다', desc: '최대 생명 +5', apply(run) { RS.changeMaxLife(run, 5); RS.heal(run, 5); return '달콤하다. 최대 생명 +5'; } },
      ],
    },
    {
      id: 'cheese', title: '생쥐 곳간', art: 'berry',
      text: '곳간 가득 치즈가 쌓여 있다. 생쥐들이 치즈 더미 사이에서 무언가를 지키고 있다.',
      options: [
        { label: '치즈를 고른다', desc: '은빛 증강 6개 중 2개를 고른다', apply(run) { q(run, { k: 'augList', ids: RS.rollAugments(run, 6, [0, 1, 0, 0]), left: 2, title: '생쥐 곳간' }); return '냄새가 지독하지만 쓸 만한 것들이 보인다.'; } },
        {
          label: '쥐들을 쫓아낸다', desc: '생명 -5 · 유물 [쥐구멍 치즈] (전투에서 이기면 최대 생명 +1)', cond: (run) => run.life > 5 && !RS.hasRelic(run, 'cheese'),
          apply(run) {
            RS.damageLife(run, 5);
            RS.addRelic(run, 'cheese');
            return '생쥐에게 물렸지만 구멍이 숭숭 난 커다란 치즈를 얻었다.';
          },
        },
      ],
    },

    // ── 2막 이후 ──
    {
      id: 'knowingSkull', title: '수다쟁이 해골', art: 'skull', acts: [2, 3],
      text: (run) => `쉬지 않고 떠드는 해골이 턱을 딱딱거린다. "원하는 걸 말해 봐. 값은 네 생명으로 받지." (현재 대가: 생명 -${run.pending.skull || 2})`,
      options: [
        {
          label: '부를 원한다', desc: (run) => `골드 +${45 * act(run)}`, cond: (run) => run.life > (run.pending.skull || 2),
          apply(run) {
            const c = run.pending.skull || 2;
            RS.damageLife(run, c);
            RS.addGold(run, 45 * act(run));
            run.pending.skull = c + 1;
            return { text: `골드 +${45 * act(run)}, 생명 -${c}`, again: true };
          },
        },
        {
          label: '도구를 원한다', desc: '무작위 소모품 1개', cond: (run) => run.life > (run.pending.skull || 2) && bagSpace(run),
          apply(run, rng) {
            const c = run.pending.skull || 2;
            RS.damageLife(run, c);
            const id = RS.randomItemId(rng);
            const ok = RS.addItem(run, id);
            run.pending.skull = c + 1;
            return { text: `${ok ? `소모품 [${RS.ITEM[id].name}]을(를) 얻었다` : '가방이 가득 찼다'}, 생명 -${c}`, again: true };
          },
        },
        {
          label: '전사를 원한다', desc: '희귀 유닛 1기 (보드 빈칸 필요)', cond: (run) => run.life > (run.pending.skull || 2) && RS.hasEmptySlot(run.board),
          apply(run) {
            const c = run.pending.skull || 2;
            RS.damageLife(run, c);
            const g = RS.grantUnits(run, 1, 1);
            run.pending.skull = c + 1;
            return { text: `${g && g.placed ? '희귀 유닛이 합류했다' : `보드에 자리가 없어 골드 +${g ? g.gold : 0}`}, 생명 -${c}`, again: true };
          },
        },
        { label: '떠난다', desc: '생명 -2', apply(run) { return `해골이 말을 끊었다고 삐졌다. ${hurt(run, 2)}`; } },
      ],
    },
    {
      id: 'library', title: '먼지 서고', art: 'scroll', acts: [2, 3],
      text: '먼지가 소복한 옛 마법사의 서고. 책장 사이로 따뜻한 햇살이 든다.',
      options: [
        {
          label: '책을 읽는다', desc: '증강 10개 중 하나를 고른다',
          apply(run) {
            q(run, { k: 'augList', ids: RS.rollAugments(run, 10, [0, 40, 42, 18]), title: '먼지 서고' });
            return '흥미로운 책들이 눈에 띈다.';
          },
        },
        { label: '잠을 잔다', desc: '생명 33% 회복', cond: canHeal, apply(run) { const h = RS.heal(run, Math.ceil(run.maxLife * 0.33)); return `푹 잤다. 생명 +${h}`; } },
      ],
    },
    {
      id: 'designer', title: '참견쟁이 목수', art: 'lens', acts: [2, 3],
      text: '"이 보드, 조금만 손보면 훨씬 좋아지겠는데?" 묻지도 않았는데 목수가 대패를 꺼낸다.',
      options: [
        {
          label: '조정', desc: (run) => `골드 -${40 * act(run)} · 증강 하나 연마`,
          cond: (run) => run.gold >= 40 * act(run) && hasUpgradable(run),
          apply(run) {
            const g = 40 * act(run);
            RS.addGold(run, -g);
            q(run, { k: 'upgrade', title: '참견쟁이 목수', refund: g });
            return '목수가 콧노래를 부르며 대패질을 한다.';
          },
        },
        {
          label: '전면 수리', desc: (run) => `골드 -${75 * act(run)} · 증강·저주 하나 제거 + 증강 하나 연마`,
          cond: (run) => run.gold >= 75 * act(run) && hasRemovable(run),
          apply(run) {
            const g = 75 * act(run);
            RS.addGold(run, -g);
            // 제거를 그만두면 골드를 돌려받고 연마도 취소된다
            q(run, { k: 'remove', title: '참견쟁이 목수', refund: g, group: 'designer' });
            if (hasUpgradable(run)) q(run, { k: 'upgrade', title: '참견쟁이 목수', group: 'designer' });
            return '목수가 소매를 걷어붙인다.';
          },
        },
        { label: '쫓아낸다', desc: '생명 -3', apply(run) { return `목수가 망치로 발등을 찍고 도망쳤다. ${hurt(run, 3)}`; } },
      ],
    },
    {
      id: 'vampires', title: '창백한 연회', art: 'fang', acts: [2],
      text: '촛불이 늘어선 긴 식탁에 창백한 귀족들이 앉아 있다. "한 잔 나누지 않겠나? 네 병사들은 더 강해질 거야."',
      cond: (run) => hasUnit(run, 0),
      options: [
        {
          label: '잔을 받는다', desc: '최대 생명 -30% · 보드의 일반 유닛이 모두 같은 클래스의 희귀 유닛이 된다',
          apply(run) {
            RS.changeMaxLife(run, -Math.ceil(run.maxLife * 0.3));
            RS.promoteTier(run, 0);
            return '송곳니가 반짝인다. 일반 유닛이 모두 희귀 유닛이 되었다.';
          },
        },
        leave('거절한다'),
      ],
    },
    {
      id: 'council', title: '유령 무도회', art: 'ghost', acts: [2],
      text: '반투명한 유령들이 빙글빙글 춤을 춘다. "한 곡 추고 가! 몸을 조금 내어 주면, 우리처럼 스쳐 지나가는 법을 알려 주지."',
      options: [
        {
          label: '받아들인다', desc: '최대 생명 -40% · 소모품 [유령 망토] 3개 (소모품 칸 +1)', cond: (run) => !RS.collectMods(run).noItems,
          apply(run) {
            RS.changeMaxLife(run, -Math.ceil(run.maxLife * 0.4));
            run.relicState.ghostSlots = (run.relicState.ghostSlots || 0) + 1;
            let n = 0;
            for (let k = 0; k < 3; k++) if (RS.addItem(run, 'ghostly')) n++;
            return n === 3 ? '몸이 가벼워졌다. 유령 망토 3개' : `몸이 가벼워졌다. 가방에 자리가 없어 유령 망토는 ${n}개만 챙겼다.`;
          },
        },
        leave('거절한다'),
      ],
    },
    {
      id: 'cursedTome', title: '물어뜯는 책', art: 'scroll', acts: [2, 3],
      steps: [
        {
          text: '이빨 달린 가죽 책이 으르렁거리며 저절로 펼쳐진다.',
          options: [
            { label: '읽는다', desc: '생명 -1', cond: (run) => run.life > 1, apply(run) { RS.damageLife(run, 1); return { text: '글자가 꿈틀거린다. 생명 -1', next: 1 }; } },
            leave('덮는다'),
          ],
        },
        {
          text: '두 번째 장. 글자가 피처럼 붉다.',
          options: [
            { label: '계속 읽는다', desc: '생명 -2', cond: (run) => run.life > 2, apply(run) { RS.damageLife(run, 2); return { text: '머리가 지끈거린다. 생명 -2', next: 2 }; } },
            leave('덮는다'),
          ],
        },
        {
          text: '마지막 장. 책이 무언가를 내어 주려 한다.',
          options: [
            {
              label: '끝까지 읽는다', desc: '생명 -5 · 희귀 유물', cond: (run) => run.life > 5 && relicLeft(run, [2]),
              apply(run) {
                RS.damageLife(run, 5);
                const id = RS.grantRandomRelic(run, [2]);
                return `생명 -5. 책이 [${relicName(id)}](으)로 변했다!`;
              },
            },
            { label: '덮는다', desc: '생명 -3', apply(run) { return `책이 손을 물고 놓아 준다. ${hurt(run, 3)}`; } },
          ],
        },
      ],
    },
    {
      id: 'colosseum', title: '균열 투기장', art: 'sword', acts: [2],
      text: '균열 틈새에 지어진 투기장에 함성이 쏟아진다. "도전자! 두 챔피언을 꺾으면 큰 상을 주마!"',
      options: [
        {
          label: '도전한다', desc: '강화된 엘리트 둘과 전투 · 이기면 희귀 유물 3개 중 1개',
          apply() {
            return { text: '관중이 환호한다!', fight: { as: 'elite', elites: 2, hpMul: 1.25, relic: [2], relicChoices: 3 } };
          },
        },
        leave('관중석에 앉는다'),
      ],
    },

    // ── 3막 ──
    {
      id: 'mindBloom', title: '소원의 꽃', art: 'flower', acts: [3],
      text: '사람 키만 한 꽃이 꽃잎을 펼치자 달콤한 향기가 머릿속을 채운다. "소원을 하나만 떠올려 봐. 그대로 피워 줄게."',
      options: [
        {
          label: '싸움을 바란다', desc: '1막 보스(슬라임 킹)와 진짜 보스전 · 지면 모험이 끝난다 · 이기면 프리즘 증강 선택 + 희귀 유물',
          apply() {
            return { text: '눈앞에 거대한 슬라임이 나타난다!', fight: { as: 'boss', boss: 'slimeKing', hpMul: 1.15, relic: [2], relicChoices: 1 } };
          },
        },
        {
          label: '깨달음을 바란다', desc: '모든 증강 연마 · 최대 생명 -30% · 저주 [시든 꽃의 낙인] (회복·휴식 치료 불가, 없앨 수 없다)', cond: hasUpgradable,
          apply(run) {
            let n = 0;
            for (let i = 0; i < run.augments.length; i++) if (RS.upgradeAug(run, i)) n++;
            const lost = Math.round(run.maxLife * 0.3);
            RS.changeMaxLife(run, -lost);
            if (run.curses.indexOf('bloomMark') < 0) {
              run.curses.push('bloomMark');
              RS.curseGained(run, 'bloomMark');
            }
            return `세상이 선명해진다. 증강 ${n}개 연마, 최대 생명 -${lost}. 대신 꽃이 시들며 몸이 더는 아물지 않는다.`;
          },
        },
        {
          label: '금화를 바란다', desc: '골드 +400 · 저주 [세금]',
          apply(run) {
            RS.addGold(run, 400);
            const tail = RS.addCurse(run, 'taxed') ? ', 저주 [세금]' : ' (액막이 매듭이 세금을 막았다)';
            return `금화가 쏟아진다. 골드 +400${tail}`;
          },
        },
      ],
    },
    {
      id: 'secretPortal', title: '숨은 샛길', art: 'shard', acts: [3],
      text: '덩굴에 가려진 좁은 샛길. 그 끝에서 보스의 기척이 느껴진다.',
      cond: (run) => run.floor < RS.bossFloor(run) - 2,
      options: [
        {
          label: '들어간다', desc: '중간 층을 건너뛰고 보스 앞 휴식처 바로 아래까지 이동',
          apply(run) {
            // 휴식처 층 바로 아래 층에 선다. 다음 칸이 휴식처이니 쉬고 나서 보스에 들어갈 수 있다
            const f = RS.bossFloor(run) - 2;
            const row = run.map.floors[f - 1];
            let lane = -1;
            row.forEach((n, l) => {
              if (n && (lane < 0 || Math.abs(l - run.lane) < Math.abs(lane - run.lane))) lane = l;
            });
            run.floor = f;
            run.lane = lane;
            row[lane].visited = true;
            return '어둠을 가로질러 단숨에 올라왔다. 바로 앞에 보스 전 마지막 휴식처가 보인다.';
          },
        },
        leave(),
      ],
    },
    {
      id: 'mysteriousSphere', title: '떠도는 보주', art: 'orb', acts: [3],
      text: '허공을 천천히 떠도는 보주를 돌 수호자 둘이 지키고 있다.',
      options: [
        {
          label: '보주를 깨뜨린다', desc: '엘리트 전투 · 이기면 희귀 유물',
          apply() {
            return { text: '수호자들이 깨어난다!', fight: { as: 'elite', elites: 2, relic: [2], relicChoices: 1 } };
          },
        },
        leave(),
      ],
    },
  ];

  RS.EVENT = {};
  for (const e of RS.EVENTS) RS.EVENT[e.id] = e;
})((globalThis.RS = globalThis.RS || {}));
