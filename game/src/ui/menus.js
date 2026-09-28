// 메뉴: 타이틀, 지휘관 선택, 메뉴(일시정지), 빌드, 도감, 연대기, 도움말
(function (RS) {
  'use strict';

  const UI = RS.UI;
  const { h, append, $, btn, icon, unitImg } = UI;

  // ── 타이틀 ──
  UI.showTitle = function () {
    const G = UI.G;
    RS.bgm('title');
    const scr = $('#scr-title');
    scr.innerHTML = '';
    const meta = G.meta;
    const hasSave = !!G.savedRun();
    const parade = h('div', { class: 'parade' });
    RS.CLASSES.forEach((c, i) => parade.appendChild(unitImg(c, i % 4, 'bob')));
    append(scr, [
      h('div', { class: 'title-wrap' },
        h('p', { class: 'eyebrow' }, '랜덤 디펜스 × 로그라이크'),
        h('h1', { class: 'logo' }, h('span', null, '랜덤'), h('span', { class: 'l2' }, '스파이어')),
        parade,
        h('div', { class: 'title-foes' }, ['slime', 'frog', 'bat', 'golem', 'ghost', 'imp'].map((n) => h('img', { class: 'foe', src: RS.iconURL(n, 3), alt: '' }))),
      ),
      h('div', { class: 'title-menu' },
        hasSave ? btn('이어하기', (e) => { e.currentTarget.disabled = true; G.continueRun(); }, 'big gold') : null,
        btn('새 모험', () => (hasSave ? UI.confirmNew() : UI.showCommanders()), hasSave ? 'big' : 'big gold'),
        h('div', { class: 'row2' },
          btn('게임 방법', () => UI.openHelp()),
          btn('도감', () => UI.openCodex()),
          btn('연대기', () => UI.openChronicle()),
        ),
        h('div', { class: 'row2' },
          btn(RS.isMuted() ? '소리 꺼짐' : '소리 켜짐', (e) => {
            RS.setMuted(!RS.isMuted());
            e.currentTarget.textContent = RS.isMuted() ? '소리 꺼짐' : '소리 켜짐';
          }, 'sm'),
          btn(RS.isBgmOff() ? '음악 꺼짐' : '음악 켜짐', (e) => {
            RS.setBgmOff(!RS.isBgmOff());
            e.currentTarget.textContent = RS.isBgmOff() ? '음악 꺼짐' : '음악 켜짐';
          }, 'sm'),
        ),
        h('p', { class: 'record' }, meta.runs ? `모험 ${meta.runs}회 · 클리어 ${meta.wins}회 · 최고 ${meta.bestAct}막 ${meta.bestFloor}층 · 심연 ${meta.maxAsc || 0}` : '3막 꼭대기의 균열의 군주를 쓰러뜨리세요'),
      ),
    ]);
    UI.show('scr-title');
  };

  UI.confirmNew = function () {
    UI.confirm('새 모험', '진행 중인 모험이 사라집니다. 새로 시작할까요? (지금까지 오른 기록은 남아요)', '새로 시작', () => {
      if (UI.G.abandonSaved) UI.G.abandonSaved();
      UI.showCommanders();
    });
  };

  // ── 지휘관 선택 + 심연 ──
  UI.showCommanders = function () {
    const G = UI.G;
    RS.bgm('title');
    const meta = G.meta;
    const scr = $('#scr-page');
    const prev = scr.querySelector('.page');
    const keep = UI.keepScroll && prev && UI.current === 'scr-page' && scr.dataset.view === 'cmd' ? prev.scrollTop : 0;
    const selOnly = !!UI.keepScroll && UI.current === 'scr-page' && scr.dataset.view === 'cmd';
    UI.keepScroll = false;
    scr.innerHTML = '';
    scr.dataset.view = 'cmd';
    const unlocked = RS.COMMANDERS.filter((c) => RS.commanderUnlocked(c, meta));
    if (!UI.pickCmd || !unlocked.some((c) => c.id === UI.pickCmd)) UI.pickCmd = unlocked[0].id;
    const maxAsc = meta.maxAsc || 0;
    UI.pickAsc = Math.min(UI.pickAsc || 0, maxAsc);
    const list = h('div', { class: 'cards' }, RS.COMMANDERS.map((c) => {
      const ok = RS.commanderUnlocked(c, meta);
      const rel = RS.REL[c.relic];
      return h('button', {
        class: `card cmd${UI.pickCmd === c.id ? ' sel' : ''}${ok ? '' : ' locked'}`,
        disabled: !ok,
        onclick() {
          RS.sfx('click');
          UI.pickCmd = c.id;
          UI.keepScroll = true;
          UI.showCommanders();
        },
      }, h('div', { class: 'cic uwrap' }, unitImg(c.portrait[0], c.portrait[1])),
      h('div', { class: 'cbody' },
        h('div', { class: 'ctop' }, h('span', { class: 'rar' }, c.title), h('b', null, c.name)),
        h('p', null, ok ? c.desc : c.unlock.text),
        ok ? h('p', { class: 'dim small' }, `시작 유물 · ${rel.name}: ${rel.desc}`) : null,
      ));
    }));
    const setAsc = (v) => {
      UI.pickAsc = Math.max(0, Math.min(maxAsc, v));
      UI.keepScroll = true;
      UI.showCommanders();
    };
    const ascBox = h('div', { class: 'ascbox' },
      h('p', { class: 'dim small' }, maxAsc ? `심연 ${UI.pickAsc} · 클리어할 때마다 다음 단계가 열립니다. 높은 단계는 아래 효과를 모두 포함` : '한 번 클리어하면 심연(추가 난이도)이 열립니다'),
      UI.pickAsc > 0 ? h('ol', { class: 'asclist' }, RS.ASCENSION.slice(1, UI.pickAsc + 1).map((t) => h('li', null, t))) : null,
    );
    const ascCtl = h('div', { class: 'ascctl' + (maxAsc ? '' : ' off') },
      btn('−', () => setAsc(UI.pickAsc - 1), 'sm', !maxAsc || UI.pickAsc <= 0),
      h('b', null, `심연 ${UI.pickAsc}`),
      btn('+', () => setAsc(UI.pickAsc + 1), 'sm', !maxAsc || UI.pickAsc >= maxAsc),
    );
    append(scr, [
      h('div', { class: 'topbar' }, h('div', { class: 'tb-title' }, '지휘관 선택'), btn('뒤로', () => UI.showTitle(), 'sm')),
      h('div', { class: 'page scroll' }, h('p', { class: 'page-sub' }, '지휘관에 따라 잘 나오는 클래스와 시작 유물이 다릅니다'), list, ascBox),
      h('div', { class: 'page-foot' }, ascCtl, btn('출발', (e) => {
        e.currentTarget.disabled = true;
        G.newRun(null, { commander: UI.pickCmd, asc: UI.pickAsc });
      }, 'gold grow')),
    ]);
    UI.show('scr-page');
    UI.lockInput(selOnly ? 120 : 300);
    const pg = scr.querySelector('.page');
    pg.scrollTop = keep;
  };

  // ── 메뉴: 전투 중이면 일시정지, 밖이면 일반 메뉴 ──
  UI.openMenu = function () {
    const G = UI.G;
    const inBattle = !!G.battle;
    const back = () => UI.openMenu();
    UI.modal(inBattle ? '일시정지' : '메뉴', h('div', { class: 'menu' },
      btn('계속하기', () => UI.closeModal(), 'gold'),
      btn('게임 방법', () => UI.openHelp(back)),
      btn('도감', () => UI.openCodex(back)),
      G.run ? btn('빌드 보기', () => UI.openBuild(back)) : null,
      h('div', { class: 'row2' },
        btn(RS.isMuted() ? '소리 켜기' : '소리 끄기', (e) => {
          RS.setMuted(!RS.isMuted());
          e.currentTarget.textContent = RS.isMuted() ? '소리 켜기' : '소리 끄기';
        }),
        btn(RS.isBgmOff() ? '음악 켜기' : '음악 끄기', (e) => {
          RS.setBgmOff(!RS.isBgmOff());
          e.currentTarget.textContent = RS.isBgmOff() ? '음악 켜기' : '음악 끄기';
        }),
      ),
      G.run ? btn(inBattle ? '타이틀로 (이 전투는 처음부터)' : '타이틀로 (진행은 자동 저장돼요)', () => {
        UI.onModalClose = null;
        UI.closeModal();
        G.quitToTitle();
      }) : null,
    ));
  };
  UI.openPause = UI.openMenu;

  // ── 빌드 ──
  // 빌드 목록: 희귀도순(높은 것부터) / 얻은 순서 전환. 고른 방식은 기억해 둔다
  UI.buildSort = UI.buildSort || 'rarity';
  function sortable(ids, rank, row) {
    const box = h('div');
    const draw = () => {
      box.innerHTML = '';
      const list = UI.buildSort === 'rarity' ? ids.map((id, i) => ({ id, i })).sort((x, y) => rank(y.id) - rank(x.id) || x.i - y.i).map((x) => x.id) : ids;
      append(box, [
        h('div', { class: 'sortbar' },
          UI.btn('희귀도순', () => { UI.buildSort = 'rarity'; draw(); }, 'sm' + (UI.buildSort === 'rarity' ? ' gold' : '')),
          UI.btn('얻은 순서', () => { UI.buildSort = 'time'; draw(); }, 'sm' + (UI.buildSort === 'time' ? ' gold' : ''))),
        list.map(row),
      ]);
    };
    draw();
    return box;
  }

  UI.openBuild = function (onClose) {
    const run = UI.G.run;
    if (!run) return;
    const counts = {};
    for (const id of run.augments) counts[id] = (counts[id] || 0) + 1;
    const cmd = RS.COMMANDER[run.commander];
    const quests = [];
    if (run.quests.egg) quests.push('용의 알: 휴식처에서 [부화]');
    if (run.quests.spoilsAct) quests.push(`보물 지도: ${run.quests.spoilsAct}막 첫 보물 상자에서 골드 +400`);
    if (run.quests.wongo) quests.push(`퉁퉁 쿠폰: 전투 ${run.quests.wongo.left}번 뒤 유물 3개`);
    UI.modal('빌드', UI.tabs([
      {
        name: `증강 ${run.augments.length}`,
        render: () => (Object.keys(counts).length
          ? sortable(Object.keys(counts), (id) => RS.augDef(id).rarity + (RS.isUpgraded(id) ? 0.5 : 0), (id) => UI.augRow(id, counts[id]))
          : h('p', { class: 'dim' }, '아직 증강이 없습니다. 전투에서 이기면 고를 수 있어요.')),
      },
      {
        name: `유물 ${run.relics.length}`,
        render: () => (run.relics.length ? sortable(run.relics.slice(), (id) => RS.REL[id].rarity, UI.relicRow) : h('p', { class: 'dim' }, '유물은 엘리트·보스·보물·상점에서 얻습니다.')),
      },
      { name: '시너지', render: () => UI.synList(run) },
      {
        name: '진행',
        render: () => [
          h('p', { class: 'dim' }, `${cmd.title} ${cmd.name} · 심연 ${run.asc} · ${RS.actDef(run).name}`),
          h('div', { class: 'lvgrid' }, RS.CLASSES.map((c) => h('div', { class: 'lvcell' }, unitImg(c, 0), h('b', null, RS.CLASS[c].name), h('span', null, `Lv ${run.classLv[c]} · +${Math.round(run.classLv[c] * RS.BAL.upgradePct * 100)}%`)))),
          run.permDmg ? h('p', null, `단련: 모든 유닛 피해 +${Math.round(run.permDmg * 100)}%`) : null,
          h('h3', null, '룬'),
          run.runes.some(Boolean) ? UI.boardPicker(run, { filter: () => false, onPick() {} }) : h('p', { class: 'dim' }, '새긴 룬이 없습니다.'),
          h('h3', null, '퀘스트'),
          quests.length ? quests.map((t) => h('p', null, '· ' + t)) : h('p', { class: 'dim' }, '진행 중인 퀘스트 없음'),
          h('h3', null, '저주'),
          run.curses.length ? run.curses.map((id) => h('div', { class: 'lrow curse' }, icon('curse', '', 3), h('div', null, h('b', null, RS.CURSE[id].name), h('p', null, RS.CURSE[id].desc)))) : h('p', { class: 'dim' }, '저주 없음'),
        ],
      },
    ]), typeof onClose === 'function' ? onClose : null);
  };

  // ── 도감 ──
  UI.openCodex = function (onClose) {
    const enemyRow = (id) => {
      const e = RS.ENEMY[id];
      return h('div', { class: 'lrow' }, h('img', { class: 'ic', src: RS.iconURL(id, 2), alt: '' }),
        h('div', null, h('b', null, e.name + (e.boss ? ' · 보스' : e.elite ? ' · 엘리트' : '')), h('p', null, `체력 ×${e.hp} · 속도 ${e.speed} · 한 바퀴당 생명 -${e.leak}`), e.trait ? h('p', { class: 'cost' }, e.trait) : null));
    };
    UI.modal('도감', UI.tabs([
      { name: '유닛', sub: '같은 유닛 3기 → 다음 등급 무작위 유닛', render: () => RS.CLASSES.map((c) => h('div', { class: 'lrow' }, unitImg(c, 3), h('div', null, h('b', null, `${RS.CLASS[c].name} · ${RS.CLASS[c].role}`), h('p', null, RS.CLASS[c].desc)))) },
      { name: '증강', sub: '전투 보상으로 고르는 영구 효과', render: () => [1, 2, 3].map((r) => RS.AUGMENTS.filter((a) => a.rarity === r).map((a) => UI.augRow(a.id, 1))) },
      { name: '유물', sub: '모험 내내 유지 · 빨간 글씨는 대가', render: () => [1, 2, 3, 4, 5, 6].map((r) => RS.RELICS.filter((x) => x.rarity === r).map((x) => UI.relicRow(x.id))) },
      { name: '시너지', sub: '#태그가 같은 증강·유물은 서로 이어진다 (덱 설계의 뼈대)', render: () => UI.synList(null) },
      { name: '룬', sub: '보드 칸에 새겨 그 칸 유닛에게 적용', render: () => RS.RUNES.map((r) => h('div', { class: 'lrow', style: `--rune:${r.color}` }, h('span', { class: 'runeic' }, '◆'), h('div', null, h('b', null, r.name), h('p', null, r.desc)))) },
      { name: '적', sub: '체력 배율 · 이동 속도 · 한 바퀴당 잃는 생명', render: () => Object.keys(RS.ENEMY).filter((k) => k !== 'dummy').map(enemyRow) },
      {
        name: '차원 방랑자',
        sub: '2·3막을 시작할 때 차원 틈새에서 나타나는 방랑자. 셋 중 하나를 준다',
        render: () => RS.ANCIENTS.map((a) => h('div', { class: 'lrow' }, icon(a.icon, '', 3), h('div', null, h('b', null, `${a.name} · ${a.acts.join('·')}막`), h('p', null, a.text), h('p', { class: 'dim small' }, a.pools.map((p) => p.map((b) => RS.ancientBoon(b).name).join(' / ')).join(' | '))))),
      },
    ]), typeof onClose === 'function' ? onClose : null);
  };

  // ── 연대기 (슬레이 더 스파이어 2의 타임라인처럼 이정표와 해금) ──
  UI.chronicleMiles = function (meta) {
    return [
      { done: meta.runs >= 1, text: '첫 모험을 떠난다', reward: '—' },
      { done: meta.bestAct >= 2, text: '1막 보스를 쓰러뜨린다', reward: '지휘관 엘라(대현자)' },
      { done: meta.bestAct >= 3, text: '2막 보스를 쓰러뜨린다', reward: '지휘관 카이(사냥꾼)' },
      { done: meta.wins >= 1, text: '3막 보스를 쓰러뜨린다', reward: '지휘관 미라(연금술사) · 심연 1' },
      { done: meta.wins >= 2, text: '두 번 클리어한다', reward: '지휘관 아스트라(별의 섭정)' },
      { done: !!meta.heart, text: '세 봉인석으로 4막 고대신을 잠재운다', reward: '진 엔딩' },
      { done: (meta.maxAsc || 0) >= 10, text: '심연 10에 도전한다', reward: '최고 난이도' },
    ];
  };
  UI.openChronicle = function () {
    const meta = UI.G.meta;
    const miles = UI.chronicleMiles(meta);
    UI.modal('연대기', h('div', { class: 'chron' },
      h('p', { class: 'dim' }, `모험 ${meta.runs}회 · 클리어 ${meta.wins}회 · 퉁퉁 포인트 ${meta.wongo || 0}`),
      miles.map((m) => h('div', { class: 'lrow' + (m.done ? ' done' : '') }, h('span', { class: 'check' }, m.done ? '✓' : '·'), h('div', null, h('b', null, m.text), h('p', { class: 'dim small' }, '해금 · ' + m.reward)))),
      h('div', { class: 'row2' }, btn('모든 지휘관 해금 (체험용)', () => {
        meta.unlockAll = true;
        UI.G.saveMeta();
        UI.closeModal();
        UI.toast('모든 지휘관을 해금했어요', 'good');
      }, 'sm', !!meta.unlockAll),
      btn('심연 전체 해금 (테스트용)', () => {
        meta.maxAsc = RS.MAX_ASC;
        UI.G.saveMeta();
        UI.closeModal();
        UI.toast(`심연 ${RS.MAX_ASC}단계까지 모두 열었어요`, 'good');
      }, 'sm', (meta.maxAsc || 0) >= RS.MAX_ASC)),
    ));
  };

  // ── 도움말 ──
  UI.openHelp = function (onClose) {
    const li = (t, d) => h('li', null, h('b', null, t), ' ', d);
    UI.modal('게임 방법', h('div', { class: 'help' },
      h('ol', null,
        li('소환', '골드로 무작위 유닛을 부릅니다. 같은 유닛은 한 칸에 3기까지 쌓입니다. 소환할수록 비용이 1씩 오릅니다.'),
        li('합성', '같은 칸의 같은 유닛 3기(전설은 4기) → 다음 등급 무작위 유닛 1기. 일반 → 희귀 → 영웅 → 전설 → 신화. 소환으로는 영웅까지 나와요.'),
        li('신화 스킬', RS.CLASSES.map((c) => `${RS.CLASS[c].name} [${RS.MYTHIC[c].name}] ${RS.MYTHIC[c].desc}`).join(' / ')),
        li('배치', '유닛을 끌어서 옮깁니다. 전사·도적은 바깥 칸, 궁수·마법사·서리술사는 점선 안쪽 칸에. 사거리가 길에 닿지 않는 칸에는 빨간 x가 뜹니다. 새로 소환한 유닛은 알맞은 빈칸에 놓이지만, 보스가 뒤섞은 자리는 직접 옮겨야 해요.'),
        li('강화', '전투 중 [강화]: 골드로 한 클래스의 레벨을 올려 피해 +15%/Lv. 모험 내내 유지됩니다.'),
        li('판매', '유닛을 누르고 [판매]로 골드를 돌려받습니다. 영웅 이상은 두 번 눌러야 팔립니다.'),
        li('적', '적은 길을 따라 돕니다. 한 바퀴를 돈 일반 적은 균열로 빠져나가며 생명을 1씩 앗아 갑니다(놓친 만큼만 아파요). 엘리트·보스는 균열에서 다시 나와 계속 돌며, 처음엔 조금(엘리트 1, 보스 2)이지만 다시 돌 때마다 두 배로 앗아 갑니다(1→2→4→8). 필드에 적이 60마리가 되면 패배합니다. 전장의 적을 누르면 정보가 나옵니다.'),
        li('강타', '엘리트·보스 머리 위에 ! 와 붉은 숫자가 뜨면 곧 그만큼 생명을 칩니다. 준비하는 동안 몰아쳐서 노란 경직 막대를 채우거나, 기절·빙결(전사 기절·서리술사 빙결·서리 주문서)시키면 끊깁니다. 엘리트의 강타는 막이 오를수록 세집니다.'),
        li('생명 관리', '생명은 전투가 끝나도 이어집니다. 휴식처에서 회복할지 강해질지 고르세요. 생명이 줄수록 강해지는 광전사·붉은 해골 같은 선택도 있습니다.'),
        li('골드', '처치·웨이브 시작 때 들어옵니다. 보유 골드 10당 이자 1(최대 5).'),
        li('엘리트', '마지막 웨이브에 강적. 위험하지만 유물을 줍니다.'),
        li('보스', `각 막의 끝. ${RS.BAL.bossTime}초 안에 못 쓰러뜨리면 폭주: 속도 ×1.8, 잃는 생명 ×2.`),
        li('맵', '막마다 17층 + 보스. 막마다 지형(장터 길·격전지 등)이 달라 방 비율이 바뀌어요. 칸을 한 번 누르면 설명, 한 번 더 누르면 이동합니다. ? 칸은 들어가 봐야 압니다.'),
        li('증강', '전투 보상으로 고르는 영구 효과(모험 내내 유지). 휴식처 [연마]로 효과 ×1.5. 상점·이벤트에서 없애거나 바꿀 수 있습니다.'),
        li('유물', '모험 내내 유지되는 지속 효과. 엘리트·보스·보물·상점·이벤트에서 얻습니다. 빨간 글씨는 대가입니다.'),
        li('소모품', '전투 화면 아래 칸(기본 3개). 눌러서 [사용]. 상점·보상에서 얻습니다.'),
        li('저주', '해로운 지속 효과. 상점 [제거]나 일부 이벤트로 없앱니다.'),
        li('룬', '보드 칸에 새기는 인챈트. 그 칸에 선 유닛에게 효과가 붙습니다.'),
        li('봉인석', '붉은(휴식처 회수)·초록(성난 엘리트)·푸른(보물 대신) 봉인석을 모두 모으면 3막 뒤 4막이 열립니다.'),
        li('차원 방랑자', '2·3막을 시작할 때 강력한 선택 3개 중 하나를 골라야 합니다.'),
        li('상성', '돌골렘·철갑 게·흑기사는 궁수·도적 피해 절반. 유령·리치는 물리 피해에 강합니다.'),
        li('심연', '클리어하면 열리는 추가 난이도. 단계마다 불리한 규칙이 더해집니다.'),
        li('저장', '칸을 옮길 때마다 자동 저장. 전투 도중 나가면 그 전투를 처음부터 다시 합니다.'),
      ),
    ), typeof onClose === 'function' ? onClose : null);
  };
})((globalThis.RS = globalThis.RS || {}));
