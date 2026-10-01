// 도트 스프라이트. 채우기 색만 그리고 외곽선은 굽는 과정에서 자동으로 두른다.
//
// ── ART 계약 (gfx2) ──────────────────────────────────────────────────────────
// 필드 스프라이트는 논리 1px 당 원본 2px(RS.ART = 2) 격자로 굽는다.
// 구운 캔버스(RS.SPR[id], RS.GLYPH[c][ch])는 모두 아래 세 값을 가진다.
//   c.lw, c.lh : 논리 크기 (게임 px). 배치·충돌·그림자·HP 막대는 이 값만 쓴다.
//   c.u        : 논리 1px 당 원본 px. 필드 스프라이트 2, 8×8 아이콘(i_*)·숫자 1.
//                c.width === c.lw * c.u, c.height === c.lh * c.u (lw 는 .5 일 수 있다)
// 렌더러가 그리는 법 (S = 장치 px / 논리 px):
//   평범하게   : ctx.drawImage(c, x, y, c.lw, c.lh)          ← PixelCtx 의 기본 w/h 를 lw/lh 로
//   변형 그리기: raw.scale(flip * sx * S / c.u, sy * S / c.u); raw.drawImage(c, -c.width / 2, -c.height)
//                (= scale(sx*S) 뒤 drawImage(c, -c.lw/2, -c.lh, c.lw, c.lh) 와 같다)
//   u 를 모르는 렌더러도 lw/lh 로 그리면 크기가 예전과 같다. width/height 는 쓰지 않는다.
// 크기 (예전과 같은 화면 크기):
//   유닛  knight0..4 등: 32×32 손그림 + 여백 → 36×36 원본, lw = lh = 18 (예전 18×18).
//   적·엘리트: 맵을 Scale2x → lw = 맵 폭 + 2 (예전과 같다). 엘리트는 렌더러가 계속 1.3배.
//   보스 (RS.ENEMY[*].boss): 맵을 Scale3x → lw = (맵 폭 + 2) × 1.5. 예전 bigScale 1.5 를
//        캔버스에 이미 담았다 → 렌더러는 보스에게 bigScale 1 을 써야 한다 (엘리트는 1.3 유지).
//   발 위치: 모든 스프라이트는 예전처럼 캔버스 바닥(ay - lh)에 맞춰 그리면 된다.
// 변형 id (모두 바탕 스프라이트와 크기·기준점이 같다):
//   id+'_w' 하얀 실루엣, id+'_i' 얼음빛 실루엣 (적만), riftHeart_z 잠든 모습 (+ _w/_i).
//   id+'_e' (선택) 빛나는 픽셀만 남긴 마스크: 전설·신화 유닛(보석·눈·후광), 일부 보스의 눈.
//          바탕을 그린 뒤 같은 변형으로 'lighter' 로 덧그리면 블룸이 된다. 없으면 건너뛴다.
//   id+'_s0'..'_s5' (전설·신화 유닛만) 대각선 광택 띠 6프레임. 바탕 위에 source-over 로
//          덧그린다 (알파가 구워져 있다). 3초마다 0.3초 동안 0→5 로 넘기면 된다.
// DOM: RS.iconURL(name, scale) / RS.unitURL(cls, tier, scale) 는 원본 px × scale 로 굽는다
//      (HD 는 예전보다 2배 촘촘). CSS 가 너비를 정하므로 화면 크기는 그대로.
// 맵 형식: def(name, rows, { pal, hd, k, layers, patch, emis, hard, noshade }) — 아래 굽기 참고.
// ────────────────────────────────────────────────────────────────────────────
(function (RS) {
  'use strict';

  RS.ART = 2;

  const PAL = {
    o: '#1d1428', s: '#f6caa5', S: '#d99b7e', e: '#22192e',
    m: '#d3dbe6', M: '#8b97ab', w: '#f6f1e8', W: '#b8c2d3',
    b: '#8d5b3d', B: '#5e3b29', g: '#f5c44a', G: '#b5832b',
    r: '#e04a52', R: '#95283a', n: '#62c35f', N: '#2f7a3e',
    i: '#a8ecff', I: '#52b6e0', p: '#a061e8', P: '#5e3593',
    y: '#ffe46b', h: '#7a4a32', H: '#4f2d20', k: '#3d3158', K: '#282040',
    u: '#4c7fe0', U: '#2d4a9e', v: '#f07fb0', V: '#b04779',
    t: '#9ee06a', T: '#5a9e3a', a: '#ff9a3d', A: '#c2601e',
  };
  RS.PAL = PAL;
  const OUTLINE = PAL.o;

  const SRC = {};
  const def = (name, rows, opts) => (SRC[name] = Object.assign({ rows }, opts || {}));
  // sprites_hd.js 가 손그림 마스터(hd: true)로 덮어쓴다
  RS.defSprite = def;
  RS.SPRITE_SRC = SRC;

  // ── 유닛 (c/C/l = 등급 색) ──
  def('knight', [
    '................',
    '.......lc.......',
    '......lcc.......',
    '....mmmmmmm.....',
    '...mmmmmmmmm..w.',
    '...mMMMMMMMm..w.',
    '...mMyMMMyMm..w.',
    '...mmmmmmmmm..w.',
    '....MmmmmmM...w.',
    '...mccccccm..ggg',
    '..mmccgcccmm.sb.',
    '...ccccccccc..b.',
    '...cCcccccCc....',
    '....MM...MM.....',
    '....MM...MM.....',
    '................',
  ]);
  def('archer', [
    '................',
    '......ccc.......',
    '.....cllcc......',
    '....cclcccc..b..',
    '...cchhhhhcc.Wb.',
    '...chssssshc.Wb.',
    '...csesssesc.Wb.',
    '...cSsssssSc.Wb.',
    '....cSSSSSc..Wb.',
    '...cnnnnnnc.sb..',
    '..ccnnbnnncc....',
    '...cnnnnnnc.....',
    '...cNnnnnNc.....',
    '....bb..bb......',
    '....BB..BB......',
    '................',
  ]);
  def('mage', [
    '....c...........',
    '....cc..........',
    '.....ccc.....pp.',
    '.....clcc....pP.',
    '....ccccc.....b.',
    '...cccgggcc...b.',
    '.cccccccccccccb.',
    '...hsssssssh..b.',
    '...hsesssesh..b.',
    '...hSsssssSh..b.',
    '....ccSSScc..sb.',
    '...ccccgcccc..b.',
    '...cccccccccc.b.',
    '..cCcccccccCc.b.',
    '..CCCCCCCCCC....',
    '................',
  ]);
  def('rogue', [
    '................',
    '....h..h..h.....',
    '....hhhhhhh.....',
    '...hhhhhhhhh....',
    '...hhssssshh....',
    '...hsesssesh....',
    '...ccccccccc....',
    '.w..cCcccCc..w..',
    '.w..kkkkkkk..w..',
    '..skkkkckkkks...',
    '...kkkkkkkkk....',
    '....kKkkkKk.....',
    '....kk...kk.....',
    '....KK...KK.....',
    '................',
    '................',
  ]);
  def('frost', [
    '................',
    '......iiii......',
    '.....iiiiii..i..',
    '....iiwiiiii.iI.',
    '....igyggygi.Ii.',
    '....issssssi..b.',
    '....isessesi..b.',
    '....iSssssSi..b.',
    '...iicSSSScii.b.',
    '...iccccccccisb.',
    '...icccllccci.b.',
    '....cccccccc..b.',
    '...cCccccccCc.b.',
    '...CCCCCCCCCC...',
    '................',
    '................',
  ]);

  // ── 적 ──
  def('slime', [
    '............',
    '.....nn.....',
    '....nnnn....',
    '...nnwnnn...',
    '..nnwnnnnn..',
    '..nennnnen..',
    '.nnnnnnnnnn.',
    '.nNnnnnnnNn.',
    '..NNNNNNNN..',
    '............',
  ]);
  def('slime2', [
    '............',
    '............',
    '.....nn.....',
    '...nnwnnn...',
    '..nnwnnnnn..',
    '.nnennnnenn.',
    '.nnnnnnnnnn.',
    'nNnnnnnnnnNn',
    '.NNNNNNNNNN.',
    '............',
  ]);
  def('bat', [
    '..............',
    '.p..........p.',
    '.pp...pp...pp.',
    '.ppp.pppp.ppp.',
    '..pppppppppp..',
    '..pPpyppypPp..',
    '...P.pppp.P...',
    '......PP......',
    '..............',
  ]);
  def('bat2', [
    '..............',
    '..............',
    '......pp......',
    '.....pppp.....',
    '.pppppppppppp.',
    'pPppypppypppPp',
    'P..ppppppp...P',
    '......PP......',
    '..............',
  ]);
  def('golem', [
    '................',
    '.....mmmmmm.....',
    '....mmmmmmmm....',
    '....mymmmmym....',
    '....mmmMMmmm....',
    '..nnmmmmmmmmnn..',
    '.mmmmmmmmmmmmmm.',
    '.mMmmMMmmMMmmMm.',
    '.mm.mmmmmmmm.mm.',
    '.MM.mmmnmmmm.MM.',
    '.mm.mmmmmmmm.mm.',
    '....MMmmmmMM....',
    '....mmm..mmm....',
    '....MMM..MMM....',
    '................',
  ]);
  def('ghost', [
    '..............',
    '.....wwww.....',
    '....wwwwww....',
    '...wwwwwwww...',
    '...weewweew...',
    '...weewweew...',
    '...wwwwwwww...',
    '..wwwwkkwwww..',
    '..wwwwwwwwww..',
    '..wWwwwwwwWw..',
    '..wWwWwwWwWw..',
    '..w.W.ww.W.w..',
    '..............',
  ]);
  def('skeleton', [
    '............',
    '....wwww....',
    '...wwwwww...',
    '...wkwwkw...',
    '...wwWWww...',
    '....wkkw....',
    '.....ww.....',
    '...wwwwww...',
    '..w.wWWw.w..',
    '..W.wwww.W..',
    '....wWWw....',
    '....w..w....',
    '....W..W....',
    '............',
  ], { hard: 'ek' });
  def('imp', [
    '............',
    '..r......r..',
    '..rr....rr..',
    '...rrrrrr...',
    '..rryrryrr..',
    '..rrrrrrrr..',
    'R.rrRwwRrr.R',
    'RR.rrrrrr.RR',
    '.RRrrrrrrRR.',
    '...rrRRrr...',
    '...rr..rr...',
    '...RR..RR...',
    '............',
  ]);
  def('shaman', [
    '..............',
    '....y.yy.y....',
    '....yyrryy....',
    '.....tttt...g.',
    '....tttttt..b.',
    '....tetete..b.',
    '....tttttt..b.',
    '.....TwwT..sb.',
    '....bbbbbb..b.',
    '...bbbrrbbb.b.',
    '....bbbbbb..b.',
    '....tt..tt....',
    '..............',
  ]);
  // 엘리트
  def('ogre', [
    '..................',
    '......tttttt......',
    '.....tttttttt.....',
    '.....tettttet.....',
    '.....tttTTttt.....',
    '.....tTwTTwTt.....',
    '...ttttttttttttt..',
    '..ttbbbbbbbbbbtt..',
    '..tt.bbbbbbbb.tt..',
    '..tt.bbbBBbbb.tt..',
    '.TTT.bbbbbbbb.TTT.',
    '.....bbbbbbbb.....',
    '.....tttt.tttt....',
    '.....tttt.tttt....',
    '.....TTTT.TTTT....',
    '..................',
  ]);
  def('darkKnight', [
    '................',
    '....k.....k.....',
    '....kkkkkkk.....',
    '...kkkkkkkkk....',
    '...kKKKKKKKk....',
    '...kKrKKKrKk..W.',
    '...kkkkkkkkk..W.',
    '....KkkkkkK...W.',
    '..kkRRRRRRRkk.W.',
    '.kkkRRRgRRRkkkg.',
    '.kk.RRRRRRR.ksK.',
    '....kkkkkkk.....',
    '....kk...kk.....',
    '....KK...KK.....',
    '................',
  ]);
  def('witch', [
    '..........P.....',
    '.........PP.....',
    '........PPP.....',
    '.......PPPP.....',
    '......PPgPP.....',
    '..PPPPPPPPPPPP..',
    '....hhtttthh....',
    '....htettteh....',
    '....hTttttTh....',
    '....hPPtTPPh....',
    '...PPPPPPPPPP...',
    '...PPpPPPPpPP...',
    '..PPPPPPPPPPPP..',
    '..PPPPPPPPPPPP..',
    '................',
  ]);
  def('bigSlime', [
    '................',
    '.......nn.......',
    '.....nnnnnn.....',
    '....nnwwnnnn....',
    '...nnwnnnnnnn...',
    '..nnwnnnnnnnnn..',
    '..nnneennneennn.',
    '.nnnneennneennn.',
    '.nnnnnnnnnnnnnn.',
    '.nnnnnnkkknnnnn.',
    'nNnnnnnnnnnnnNn.',
    'nNNnnnnnnnnnNNn.',
    '.NNNNNNNNNNNNN..',
    '................',
  ]);
  // 보스
  def('slimeKing', [
    '........................',
    '.........g..g..g........',
    '.........gg.gg.gg.......',
    '.........ggggggggg......',
    '.........grgggugrg......',
    '........nnnnnnnnnnn.....',
    '......nnnnnnnnnnnnnnn...',
    '.....nnnwwnnnnnnnnnnnn..',
    '....nnnwnnnnnnnnnnnnnn..',
    '....nnwnnnnnnnnnnnnnnnn.',
    '...nnnnneeennnnneeennnn.',
    '...nnnnneeennnnneeennnn.',
    '..nnnnnnnnnnnnnnnnnnnnnn',
    '..nnnnnnnnnnnnnnnnnnnnnn',
    '..nnnnnnnnkkkkkknnnnnnnn',
    '..nnnnnnnnnkkkknnnnnnnnn',
    '.nNnnnnnnnnnnnnnnnnnnnNn',
    '.nNNnnnnnnnnnnnnnnnnnNNn',
    '..NNNNNNNNNNNNNNNNNNNNN.',
    '........................',
  ]);
  def('lich', [
    '........................',
    '.........g.g.g.g........',
    '.........ggggggg........',
    '........wwwwwwwww.......',
    '.......wwwwwwwwwww......',
    '.......wwkkwwwkkww...p..',
    '.......wwkEwwwkEww..ppp.',
    '.......wwwwwkwwwww...p..',
    '........wwkwkwkww....b..',
    '.........wwwwwww.....b..',
    '.......PPPPPPPPPPP...b..',
    '.....PPPPPpPPPpPPPPP.b..',
    '....PPPPPPPpppPPPPPPsb..',
    '....PP.PPPPPPPPPPP.PPb..',
    '....ww.PPPPpPPPPPP.ww...',
    '.......PPPPPPPPPPP...b..',
    '.......PPPPPPPPPPP......',
    '......PPPPPPPPPPPPP.....',
    '......PPpPPPPPPPpPP.....',
    '.....PPPPPPPPPPPPPPP....',
    '....PPPPPPPPPPPPPPPPP...',
    '........................',
  ], { hard: 'ekE', pal: { E: '#c890ff' }, emis: 'E' });
  def('riftLord', [
    '........................',
    '......v.........v.......',
    '......vv.......vv.......',
    '.......kkkkkkkkk........',
    '......kkkkkkkkkkk.......',
    '......kKKKKKKKKKk.......',
    '......kKEEKKKEEKk.......',
    '......kkkkkkkkkkk.......',
    '.......kKkkkkkKk........',
    '...kkkkkkkkkkkkkkkkk....',
    '..kkKkkvvvvvvvvvkkKkk...',
    '..kk.kkvVVVVVVVvkk.kk...',
    '..kk.kkvVvvvvvVvkk.kk...',
    '..vv.kkvVVVVVVVvkk.vv...',
    '..vv.kkvvvvvvvvvkk.vv...',
    '.....kkkkkkkkkkkkk......',
    '.....kkkkk...kkkkk......',
    '.....kkkk.....kkkk......',
    '.....KKKK.....KKKK......',
    '........................',
  ], { hard: 'eE', pal: { E: '#ff8fc8' }, emis: 'E' });

  // ── 아이콘 (UI) ──
  // ── 2.0 지역 적: 안개 늪 · 가라앉은 항구 · 시험 ──
  def('frog', [
    '............',
    '..ww....ww..',
    '.wwkw..wkww.',
    '.nnnnnnnnnn.',
    'nnnnnnnnnnnn',
    'nnNkkkkkkNnn',
    'nnnnnnnnnnnn',
    '.nttttttttn.',
    'NNnttttttnNN',
    'NN.NN..NN.NN',
    '............',
  ]);
  def('frog2', [
    '............',
    '............',
    '..ww....ww..',
    '.wwkw..wkww.',
    '.nnnnnnnnnn.',
    'nnnnnnnnnnnn',
    'nnNkkkkkkNnn',
    'nnnnnnnnnnnn',
    'NnttttttttnN',
    'NNNNN..NNNNN',
    '............',
  ]);
  def('crab', [
    '..............',
    '.rr........rr.',
    'r..r......r..r',
    'rr.r.w..w.r.rr',
    '.rr.rkrrkr.rr.',
    '...rrrrrrrr...',
    '..rmmmmmmmmr..',
    '.rrMMMMMMMMrr.',
    '.RrrrrrrrrrrR.',
    'R.R.R....R.R.R',
    '..............',
  ]);
  def('bogQueen', [
    '........................',
    '..........g..g..g.......',
    '..........ggggggg.......',
    '..www.....grgugrg..www..',
    '.wwkkw....ggggggg.wkkww.',
    '.wwkkwnnnnnnnnnnnnwkkww.',
    '..wwwnnnnnnnnnnnnnnwww..',
    '..nnnnnnpnnnnnnpnnnnnn..',
    '.nnnnnnnnnnnnnnnnnnnnnn.',
    '.nnnNkkkkkkkkkkkkkkNnnn.',
    '.nnnnNNkkkkkkkkkkNNnnnn.',
    'nnnnnnnNNNNNNNNNNnnnnnnn',
    'nnpnnnnnnnnnnnnnnnnnnpnn',
    'nnnnttttttttttttttttnnnn',
    'nnnttttttttttttttttttnnn',
    'Nnnttttttttttttttttttnnn',
    'NNnnttttttttttttttttnnNN',
    'NNNnnnnnnnnnnnnnnnnnnNNN',
    '.NNN.NNNN......NNNN.NNN.',
    '........................',
  ]);
  def('captain', [
    '....................',
    '......kkkkkkkk......',
    '....kkkkkkkkkkkk....',
    '...kkkkkkwwkkkkkk...',
    '..kkkkkkkkkkkkkkkk..',
    '.....gggggggggg.....',
    '.....wwwwwwwwww.....',
    '.....wkkwwwwkkw.....',
    '.....wkkwwwwkkw.....',
    '.....wwwwkkwwww.....',
    '......wkwkwkwkw.....',
    '.......wwwwww.......',
    '....rrrrwwwwrrrr....',
    '...rrrrrrggrrrrrr...',
    '..rrrRrrrrrrrrRrrr..',
    '..rr.RrrrggrrrR.rr..',
    '..ww.RrrrrrrrrR.m...',
    '.....RrrrggrrrR..m..',
    '.....RRRRRRRRRR.mm..',
    '......MM....MM......',
    '......MM....MM......',
    '.....MMM....MMM.....',
  ], { hard: 'ek' });
  def('dummy', [
    '............',
    '....gggg....',
    '...gyyyyg...',
    '...ykyyky...',
    '...yyyyyy...',
    '....gyyg....',
    '.bbbbbbbbbb.',
    '.b.gyrryg.b.',
    '...grwwrg...',
    '...grrrrg...',
    '....gyyg....',
    '.....bb.....',
    '.....bb.....',
    '....BBBB....',
  ]);

  const I = (name, rows) => def('i_' + name, rows);
  I('sword', ['.......ww', '......wWw', '.....wWw.', '....wWw..', '.g.wWw...', '..gWw....', '..bg.....', '.b..g....', 'b........']);
  I('wing', ['......ww.', '....wwwW.', '...wwwWW.', '..wwwWW..', '.wwwWW...', '.wwWW....', 'wwWW.....', 'wWW......', 'W........']);
  I('eye', ['.........', '..wwwww..', '.wwuuuww.', 'wwuuoouww', 'wwuuoouww', '.wwuuuww.', '..wwwww..', '.........']);
  I('pig', ['.........', '.v.vvvv..', 'vvvvvvvv.', 'vvevvvvvv', 'vvvvvVVv.', 'vvvvvVVv.', '.vvvvvv..', '.V.V.V.V.']);
  I('coin', ['..ggggg..', '.gyyyyyg.', 'gyygGgyyg', 'gyyGyyyyg', 'gyygGgyyg', 'gyyyyGyyg', 'gyygGgyyg', '.gyyyyyg.', '..GGGGG..']);
  I('coins', ['....ggg..', '...gyyyg.', '...gyGyg.', 'ggggyyyg.', 'gyyygGGG.', 'gyGyg....', 'gyyyg....', 'GGGGG....']);
  I('star', ['....y....', '....y....', '...yyy...', 'yyyyyyyyy', '.yyyyyyy.', '..yyyyy..', '..yy.yy..', '.yy...yy.']);
  I('heart', ['.rr...rr.', 'rwrr.rrrr', 'rwrrrrrrr', 'rrrrrrrrr', '.rrrrrrR.', '..rrrrR..', '...rrR...', '....R....']);
  I('flag', ['b........', 'brrrrr...', 'brrrrrrr.', 'brrwrrrr.', 'brrrrrr..', 'bRRR.....', 'b........', 'b........', 'B........']);
  I('bag', ['...BB....', '..b..b...', '.bbbbbb..', 'bbbbbbbb.', 'bbbggbbb.', 'bbbggbbb.', 'bbbbbbbb.', '.BBBBBB..']);
  I('anvil', ['.........', 'MMMMMMMM.', '.mmmmmmmM', '..mmmmmM.', '...mmmM..', '...mmm...', '..mmmmm..', '.MMMMMMM.']);
  I('bolt', ['.....yy..', '....yy...', '...yy....', '..yyyyy..', '....yy...', '...yy....', '..yy.....', '.y.......']);
  I('gear', ['...MM....', '.M.mm.M..', '..mmmmm..', 'Mmm..mmM.', 'Mmm..mmM.', '..mmmmm..', '.M.mm.M..', '...MM....']);
  I('clock', ['..wwwww..', '.wwwkwww.', 'wwwwkwwww', 'wwwwkwwww', 'wwwwkkkww', 'wwwwwwwww', '.wwwwwww.', '..wwwww..']);
  I('hourglass', ['bbbbbbb', '.wyyyw.', '..wyw..', '...y...', '..wyw..', '.wyyyw.', 'bbbbbbb']);
  I('clover', ['..nn.nn..', '.nnnnnnn.', '.nnnnnnn.', '..nnnnn..', '.nnnnnnn.', '.nnn.nnn.', '..n.b....', '....b....']);
  I('recycle', ['...nnn...', '..n...n..', '.n.....N.', 'nnn...NNN', '.........', 'NNN...nnn', '.N.....n.', '..n...n..', '...nnn...']);
  I('rainbow', ['..rrrrr..', '.raaaaar.', 'rayyyyyar', 'aynnnnnya', 'ynuuuuuny', 'nu.....un', 'u.......u']);
  I('crest', ['uuuuuuuu', 'uyuuuuyu', 'uuyuuyuu', 'uuuyyuuu', 'uuuyyuuu', '.uuuuuu.', '..uuuu..', '...uu...']);
  I('medal', ['.r...r.', '.rr.rr.', '..rrr..', '..ggg..', '.gyyyg.', '.gyGyg.', '.gyyyg.', '..ggg..']);
  I('crown', ['.........', 'y...y...y', 'yy.yyy.yy', 'yyyyyyyyy', 'yrryuyrry', 'yyyyyyyyy', 'GGGGGGGGG']);
  I('dagger', ['.......w', '......wW', '.....wW.', '....wW..', '..gwW...', '...g....', '..b.g...', '.b......']);
  I('burst', ['....a....', '.a..a..a.', '..aayaa..', '..ayyya..', 'aayyyyyaa', '..ayyya..', '..aayaa..', '.a..a..a.', '....a....']);
  I('drop', ['....i....', '...iii...', '..iiiii..', '.iiwiiii.', '.iwiiiiI.', '.iiiiiII.', '..iiiII..', '...III...']);
  I('axe', ['..MMM....', '.MmmmM...', 'MmmmmmM..', 'MmmbmmM..', '.MmbmM...', '...b.....', '...b.....', '...b.....', '...B.....']);
  I('up', ['....n....', '...nnn...', '..nnnnn..', '.nnnnnnn.', '...nnn...', '...nnn...', '...nnn...', '...NNN...']);
  I('fang', ['w.......w', 'ww.....ww', 'www...www', 'wwww.wwww', '.www.www.', '..ww.ww..', '..w...w..', '..r...r..']);
  I('blood', ['....r....', '...rrr...', '..rrrrr..', '.rrwrrrr.', '.rwrrrrR.', '.rrrrrRR.', '..rrrRR..', '...RRR...']);
  I('dice', ['wwwwwww.', 'wkwwwkwW', 'wwwwwwwW', 'wwwkwwwW', 'wwwwwwwW', 'wkwwwkwW', 'wwwwwwwW', '.WWWWWWW']);
  I('twin', ['.y....y..', 'yyy..yyy.', '.y....y..', '.........', '....y....', '...yyy...', '..yyyyy..', '...yyy...', '....y....']);
  I('sparkle', ['....w....', '....w....', '...wyw...', 'wwwyyywww', '...wyw...', '....w....', '.w.....w.', 'www...www', '.w.....w.']);
  I('rage', ['r.r.r.r.', 'rrrrrrrr', 'rrrrrrrr', 'rrRrrRrr', 'rrrrrrrr', '.rRRRRr.', '..rrrr..']);
  I('cannon', ['.........', '.kkkkkkk.', 'kkkkkkkkk', 'kKKKKKKkk', '.kkkkkkk.', '..bbbbb..', '.bB...Bb.', '.B.....B.']);
  I('skull', ['..wwwww..', '.wwwwwww.', 'wwkkwkkww', 'wwkkwkkww', 'wwwwkwwww', '.wwwwwww.', '..wkwkw..', '..wwwww..']);
  I('chalice', ['ggggggg', 'grrrrrg', 'grrrrrg', '.grrrg.', '..ggg..', '...g...', '..ggg..', '.GGGGG.']);
  I('idol', ['..ggg..', '.gyyyg.', '.gkykg.', '.gyyyg.', '..ggg..', '.gyyyg.', 'gygyggg', '.gg.gg.', 'GGGGGGG']);
  I('iceheart', ['.ii...ii.', 'iwii.iiii', 'iwiiiiiii', 'iiiiiiiii', '.iiiiiiI.', '..iiiiI..', '...iiI...', '....I....']);
  I('armor', ['.MM...MM.', 'MmmmMmmmM', 'MmmmmmmmM', '.mmmmmmm.', '.mmmrmmm.', '.mmmmmmm.', '.mmmmmmm.', '..MMMMM..']);
  I('belt', ['.........', 'bbbbbbbbb', 'brbbgggbb', 'bbbbgbgbb', 'bnbbgggbb', 'bbbbbbbbb', '.........']);
  I('whetstone', ['......W.', '.....W..', '..mmW...', '.mmmmm..', 'MmmmmmM.', 'MMMMMMM.', '........']);
  I('watch', ['...g.....', '..ggg....', '.gyyyg...', 'gywkwyg..', 'gyykwyg..', 'gyyywyg..', '.gyyyg...', '..ggg....']);
  I('lens', ['.bbbb....', 'biiiib...', 'biwiib...', 'biiiib...', 'biiiib...', '.bbbbb...', '....bB...', '.....bB..', '......B..']);
  I('scroll', ['.wwwwww.', 'bwkkkkwb', '.wwwwww.', '.wkkkkw.', '.wwwwww.', '.wkkkw..', 'bwwwwwwb', '.WWWWWW.']);
  I('keg', ['.bbbbb..', 'bBbbbBb.', 'bbbbbbb.', 'MMMMMMM.', 'bbbrbbb.', 'bbbbbbb.', 'MMMMMMM.', '.BBBBB..']);
  I('gem', ['.ppppp.', 'ppwpppp', 'pwppppp', 'ppppppP', '.pppPP.', '..pPP..', '...P...']);
  I('flame', ['....r....', '...rr....', '..rrar...', '..raar.r.', '.rrayarr.', '.raayyar.', '.raayyar.', '..rayar..', '...rrr...']);
  I('orb', ['..iiii..', '.iwiiii.', 'iwiiiiiI', 'iiiiiiiI', 'iiiiiiII', '.iiiIII.', '..bbbb..', '.BBBBBB.']);
  I('mirror', ['..ggg..', '.giiig.', 'giwiiig', 'giwiiig', 'giiiiig', 'giiiiig', '.giiig.', '..ggg..', '...g...', '..GGG..']);
  I('shard', ['....v...', '...vv...', '..vvvv..', '..vVvv..', '.vvVVvv.', '.vvvVvv.', '..vvvv..', '...vv...']);
  I('horn', ['........g', '.......gg', 'wwwwwwgg.', 'wwwwwWg..', 'WwwwWW...', '.WWW.....', '.........']);
  I('bomb', ['......y.', '.....a..', '...kka..', '..kkkkk.', '.kwkkkkk', '.kkkkkkk', '.kkkkkkk', '..kkkkk.']);
  I('snow', ['....i....', '.i..i..i.', '..i.i.i..', '...iii...', 'iiiiiiiii', '...iii...', '..i.i.i..', '.i..i..i.', '....i....']);
  I('potion', ['...ww...', '...bb...', '..wWWw..', '.wrrrrw.', 'wrwrrrrw', 'wrrrrrrw', 'wrrrrrRw', '.wRRRRw.']);
  I('drum', ['w.....w.', '.w...w..', '.rrrrrr.', 'rwwwwwwr', 'rrRrRrRr', 'rRrRrRrr', 'rrrrrrrr', '.RRRRRR.']);
  I('curse', ['..ppppp..', '.ppppppp.', 'ppkkpkkpp', 'ppkkpkkpp', 'pppppppp.', '.ppkpkpp.', '..ppppp..']);
  I('heal', ['...rr...', '...rr...', '.rrrrrr.', '.rrrrrr.', '...rr...', '...rr...']);
  // 맵 노드
  I('n_combat', ['w......w', 'Ww....wW', '.Ww..wW.', '..WwwW..', '...WW...', '..gWWg..', '.bg..gb.', 'bb....bb']);
  I('n_elite', ['r.......r', 'rr.....rr', '.rwwwwwr.', '.wwwwwww.', '.wrrwrrw.', '.wwwwwww.', '..wkwkw..', '..wwwww..']);
  I('n_event', ['..yyyy..', '.yy..yy.', '.....yy.', '....yy..', '...yy...', '...yy...', '........', '...yy...']);
  I('n_shop', ['..gggg...', '.g....g..', 'ggggggggg', 'gyyyyyyyg', 'gyyGGyyyg', 'gyyyyyyyg', 'gyyyyyyyg', '.GGGGGGG.']);
  I('n_rest', ['...a.....', '..aya.a..', '..ayyaya.', '.aayyyya.', '.ayyyyya.', 'bBbBbBbBb', '.bBbBbBb.']);
  I('n_treasure', ['.bbbbbbb.', 'bbbbbbbbb', 'bgggggggb', 'BBBByBBBB', 'bbbbybbbb', 'bbbbbbbbb', 'BBBBBBBBB']);
  I('n_boss', ['y..y..y..y', 'yy.yyyy.yy', 'yyyyyyyyyy', '.rwwwwwwr.', '.wwwwwwww.', '.wkkwwkkw.', '.wwwkkwww.', '..wkwkww..', '..wwwwww..']);

  // 4막 적
  def('spireShield', [
    '................',
    '.....mmmmmm.....',
    '....mmmmmmmm....',
    '....mMvMMvMm....',
    '....mmmmmmmm....',
    '..uuUmmmmmmm....',
    '.uuuuUkkkkkkk...',
    '.uuvuUkkkkkkkk..',
    '.uvvvUkkvvkkkk..',
    '.uuvuUkkkkkkkk..',
    '.uuuuUkkkkkkk...',
    '..uuUkkkkkkk....',
    '.....kk...kk....',
    '.....KK...KK....',
    '................',
  ]);
  def('spireSpear', [
    '.............w..',
    '............wW..',
    '.....mmmmm.wW...',
    '....mmmmmmwW....',
    '....mMvMvbW.....',
    '....mmmmbm......',
    '...kkkkbkk......',
    '..kkkkbkkkk.....',
    '..kkvbvvkkk.....',
    '..kkbkkkkkk.....',
    '...bkkkkkk......',
    '..b.kk..kk......',
    '....KK..KK......',
    '................',
  ]);
  // 고대신: 촉수를 늘어뜨린 거대한 눈
  def('riftHeart', [
    '........................',
    '........PPPPPPPP........',
    '......PPkkkkkkkkPP......',
    '.....PkkkKKKKKKkkkP.....',
    '....PkkKwwwwwwwwKkkP....',
    '....PkKwwwyyyywwwKkP....',
    '...PkkwwyyrrrryywwkkP...',
    '...PkkwwyrreerryywkkP...',
    '...PkkwwyrreerryywkkP...',
    '...PkkwwyyrrrryywwkkP...',
    '....PkKwwwyyyywwwKkP....',
    '....PkkKwwwwwwwwKkkP....',
    '.....PkkkKKKKKKkkkP.....',
    '......PPkkkkkkkkPP......',
    '.....nN.PkkPPkkP.Nn.....',
    '....nN..nPkkkkPn..Nn....',
    '...nN..nN.nkkn.Nn..Nn...',
    '...N..nN..nN.Nn.Nn..N...',
    '......N...N...N...N.....',
    '........................',
  ], { emis: 'yre' });

  // 잠든 고대신: 눈꺼풀이 내려와 감긴 눈
  def('riftHeart_z', [
    '........................',
    '........PPPPPPPP........',
    '......PPkkkkkkkkPP......',
    '.....PkkkkkkkkkkkkP.....',
    '....PkkkkkkkkkkkkkkP....',
    '....PkkkkkkkkkkkkkkP....',
    '...PkkkkkkkkkkkkkkkkP...',
    '...PkkKKKKKKKKKKKKkkP...',
    '...PkkkKPkPkkPkPKkkkP...',
    '...PkkkkkkkkkkkkkkkkP...',
    '....PkkkkkkkkkkkkkkP....',
    '....PkkkkkkkkkkkkkkP....',
    '.....PkkkkkkkkkkkkP.....',
    '......PPkkkkkkkkPP......',
    '.....nN.PkkPPkkP.Nn.....',
    '....nN..nPkkkkPn..Nn....',
    '...nN..nN.nkkn.Nn..Nn...',
    '...N..nN..nN.Nn.Nn..N...',
    '......N...N...N...N.....',
    '........................',
  ], { hard: 'eK' });

  // 새 아이콘 (유물·증강·열쇠)
  I('anchor', ['...mm....', '..m..m...', '...mm....', 'mmmmmmmm.', '...mm....', 'm..mm..m.', 'mm.mm.mm.', '.mmmmmm..']);
  I('pack', ['..bbbb..', '.b....b.', 'bbbbbbbb', 'bBbggbBb', 'bbbggbbb', 'bbbbbbbb', 'bBBBBBBb', '.bbbbbb.']);
  I('lantern', ['...kk...', '..k..k..', '.kkkkkk.', '.kyyyyk.', '.kyaayk.', '.kyyyyk.', '.kkkkkk.', '..kkkk..']);
  I('berry', ['...nn....', '..nNn....', '.rrrrr...', 'rryrrrr..', 'rrrrryr..', 'rryrrrr..', '.rrrrr...', '..rrr....']);
  I('pen', ['.......k', '......kk', '.....kk.', '....bk..', '...bb...', '..gb....', '.gg.....', 'y.......']);
  I('flower', ['..y.y...', '.yyyyy..', 'yyaaayy.', '.yyayy..', 'yyyyyyy.', '..nn....', '.n.n....', '...n....']);
  I('meat', ['......ww', '.....ww.', '..rrrw..', '.rrrrr..', 'rrRrrr..', 'rrrrRr..', '.rrrr...', '..rr....']);
  I('pillow', ['........', '.pppppp.', 'pwppppPp', 'pppppppp', 'ppppppPp', 'pPppppPp', '.pppppp.', '........']);
  I('charm', ['..rrrr..', '.r....r.', '..rrrr..', '.rrrrrr.', '.rryyrr.', '.rryyrr.', '.rrrrrr.', '..r..r..']);
  I('mask', ['.wwwwww.', 'wwwwwwww', 'wkwwwwkw', 'wwwwwwww', 'wwkwwkww', 'wwwkkwww', '.wwwwww.', '..wwww..']);
  I('beads', ['..bbb...', '.b...b..', 'b.....b.', 'b.....b.', '.b...b..', '..bbb...', '...g....', '..ggg...']);
  I('chest', ['.bbbbbbb.', 'bbbbbbbbb', 'bgggggggb', 'BBBByBBBB', 'bbbbybbbb', 'bbbbbbbbb', 'BBBBBBBBB']);
  I('fish', ['.........', '...uuu..u', '..uuuuuuu', '.uuwuuuu.', 'uuuuuuuuu', '..uuuuu.u', '...uuu...', '.........']);
  I('rod', ['......M', '.....MM', '....MM.', '...MM..', '..MM...', '.MM....', 'MM.....']);
  I('mango', ['...n....', '..aaaa..', '.aayaaa.', 'aayaaaaa', 'aaaaaaaa', 'aaaaaaAa', '.aaaaAa.', '..aaaa..']);
  I('sling', ['b.....b.', '.b...b..', '..b.b...', '...b....', '...b....', '...b....', '..bbb...', '........']);
  I('insect', ['.a....a.', '..a..a..', '..yyyy..', '.yyyyyy.', 'y.yyyy.y', '.yyyyyy.', 'y.yyyy.y', '..yyyy..']);
  I('wheel', ['..yyyy..', '.y.bb.y.', 'y.b..b.y', 'ybb..bby', 'ybb..bby', 'y.b..b.y', '.y.bb.y.', '..yyyy..']);
  I('bowl', ['........', '..y..y..', '...yy...', 'gggggggg', 'gyyyyyyg', '.gyyyyg.', '..gggg..', '........']);
  I('dream', ['..bbbb..', '.b.ww.b.', 'b.w..w.b', 'b.w..w.b', '.b.ww.b.', '..bbbb..', '.w..w...', '.u..u...']);
  I('pipe', ['..w.w...', '...w....', '........', 'bbbb....', 'bBBbbbbb', 'bbbb...b', '.bb.....', '........']);
  I('shovel', ['.......b', '......b.', '.....b..', '....b...', '.MMb....', 'MmmM....', 'MmmM....', '.MM.....']);
  I('kettle', ['..MMMM..', '.M....M.', '.M....M.', 'kkkkkkkk', 'kkkkkkkk', 'kKkkkkKk', 'kkkkkkkk', '.kkkkkk.']);
  I('doll', ['..rrrr..', '.rsssrr.', '.rseser.', '.rsssrr.', 'rrrrrrrr', 'rryyyyrr', 'rrrrrrrr', '.rrrrrr.']);
  I('card', ['........', 'gggggggg', 'gkkkkkkg', 'gggggggg', 'gwwwgggg', 'gggggggg', 'GGGGGGGG', '........']);
  I('box', ['.bbbbbb.', 'bBbbbbBb', 'bbbbbbbb', 'bbwwwwbb', 'bbbbbbbb', 'bBbbbbBb', 'bbbbbbbb', '.BBBBBB.']);
  I('boots', ['..w.....', '.www....', 'wwbb....', '..bb....', '..bb....', '..bbbb..', '..bbbbb.', '..BBBBB.']);
  I('compass', ['..gggg..', '.gwwwwg.', 'gwwrwwwg', 'gwwrwwwg', 'gwwkwwwg', 'gwwkwwwg', '.gwwwwg.', '..gggg..']);
  I('shell', ['...ww...', '..wWww..', '.wWwwWw.', 'wwwWwwWw', 'wWwwWwww', 'wwWwwwWw', '.wwwwww.', '..WWWW..']);
  I('ecto', ['..nn.nn..', '.ntnnntn.', '.nnnnnnn.', '.nnnnnnN.', '..nnnnN..', '...nnN...', '....N....', '.........']);
  I('cup', ['.w.w....', '..w.w...', 'bbbbbb..', 'bBBBBbbb', 'bBBBBb.b', 'bBBBBbbb', 'bbbbbb..', '.bbbb...']);
  I('hammer', ['MMMMMM..', 'MmmmmM..', 'MMMMMM..', '..b.....', '..b.....', '..b.....', '..b.....', '..B.....']);
  I('gourd', ['...b....', '..nn....', '.nnnn...', '..nn....', '.nnnnn..', 'nnnnnnn.', 'nnnnnnN.', '.nnnnN..']);
  I('crown2', ['.........', 'y...y....', 'yy.yy..y.', 'yyyyy.yy.', 'yryy.yyry', 'yyyy.yyyy', 'GGG..GGGG']);
  I('blind', ['........', '........', 'kkkkkkkk', 'kKkkkkKk', 'kkkkkkkk', '........', '........', '........']);
  I('redgem', ['.rrrrr.', 'rrwrrrr', 'rwrrrrr', 'rrrrrrR', '.rrrRR.', '..rRR..', '...R...']);
  I('choker', ['........', 'pppppppp', 'p......p', '.p....p.', '..pyyp..', '...yy...', '........', '........']);
  I('snake', ['..nnnn..', '.nnnnnn.', 'nnyknnnn', 'nnnnnnnn', '.nnnnnn.', '...nn.r.', '..nn..r.', '.nn.....']);
  I('key', ['.gg.....', 'g..g....', 'g..g....', '.gggggg.', '....g.g.', '....g...', '........', '........']);
  I('brand', ['..rrrr..', '.r....r.', 'r..rr..r', 'r.r..r.r', 'r.r..r.r', 'r..rr..r', '.r....r.', '..rrrr..']);
  I('collar', ['........', 'MMMMMMMM', 'M......M', 'M......M', '.M....M.', '..MggM..', '...gg...', '........']);
  I('blackstar', ['....k....', '....k....', '...kkk...', 'kkkkpkkkk', '.kkkkkkk.', '..kkkkk..', '..kk.kk..', '.kk...kk.']);
  I('bell', ['...gg...', '..gyyg..', '.gyyyyg.', '.gyyyyg.', '.gyyyyg.', 'gyyyyyyg', 'gggggggg', '...gg...']);
  I('pandora', ['.pppppp.', 'pPPPPPPp', 'pppyyppp', 'pppyyppp', 'pppppppp', 'pPppppPp', 'pppppppp', '.PPPPPP.']);
  I('house', ['...rr...', '..rrrr..', '.rrrrrr.', 'rrrrrrrr', '.bbbbbb.', '.bybbyb.', '.bbbybb.', '.bbbybb.']);
  I('planet', ['......y.', '..uuuu..', '.uuuuuu.', 'yyuuuuyy', '.yyyyyy.', '.uuuuuu.', '..uuuu..', '.y......']);
  I('bark', ['..bb....', '.bBbb...', '.bbBbb..', 'bbbbBbb.', '.bbbbbBb', '..bbbbb.', '...bbb..', '....n...']);
  I('cage', ['...MM...', '..M..M..', '.MMMMMM.', '.M.M.MM.', '.M.M.MM.', '.M.M.MM.', '.MMMMMM.', '........']);
  I('horns', ['r......r', 'rr....rr', '.rr..rr.', '.rrrrrr.', 'rryrryrr', 'rrrrrrrr', '.rrkkrr.', '..rrrr..']);
  I('echo', ['..pp....', '.p..p...', 'p.pp.p..', 'p.p.p.p.', 'p.p.p.p.', 'p.pp.p..', '.p..p...', '..pp....']);
  I('halo', ['.yyyyyy.', 'y......y', '.yyyyyy.', '........', '...ww...', '..wwww..', '.wwwwww.', '..wwww..']);
  I('ghost2', ['..wwww..', '.wwwwww.', 'wwkwwkww', 'wwwwwwww', 'wwwkkwww', 'wwwwwwww', 'wWwwwwWw', 'w.W..W.w']);
  I('corrupt', ['..pppp..', '.ppkkpp.', 'ppkppkpp', 'pkpvvpkp', 'pkpvvpkp', 'ppkppkpp', '.ppkkpp.', '..pppp..']);
  I('chip', ['.n.n.n..', 'nnnnnnn.', '.kkkkk..', 'nkyykkn.', '.kyykk..', 'nkkkkkn.', '.nnnnn..', '.n.n.n..']);
  I('gas', ['...t....', '..ttt.t.', '.ttTtttt', 'tttTTttt', '.tTttTt.', '..ttttt.', '...t.t..', '........']);
  // 시너지 키워드 아이콘
  I('shield2', ['.GGGGGG.', 'GggggggG', 'GgyggggG', 'GggggggG', 'GggggggG', '.GggggG.', '..GggG..', '...GG...']);
  I('firearrow', ['......ay', '.....aya', '....bra.', '...b.r..', '..b.....', '.b......', 'bw......', 'ww......']);
  I('icecrack', ['..iiii..', '.iwiiIi.', 'iwikIiiI', 'iiiIkiiI', 'iiikiIiI', 'iIkiiiII', '.iiIIII.', '..IIII..']);
  I('bloodrush', ['.......w', '......wW', '..r..wW.', '.rr.wW..', 'rrrrW...', '.rrg....', '..r.g...', '.b......']);
  I('plague', ['..nnnn..', '.nNnnnn.', 'nnaNnnNn', 'nNnnanNn', 'nnnNnnnn', '.nnnnNn.', '..nnnn..', '.a..a..a']);
  I('ring', ['..pppp..', '.pwppPp.', '..pPPp..', '.g....g.', 'g......g', 'g......g', '.g....g.', '..gggg..']);
  I('voodoo', ['..bbbb..', '.bkbbkb.', '.bbbbbb.', '..bbbb..', 'wbbbbbbw', '.rbbbbw.', '..b..b..', '.bb..bb.']);
  I('vial', ['..ww....', '..bb....', '.wttw...', 'wtttnw..', 'wtntttw.', 'wttttnw.', 'wtttttw.', '.wwwww..']);
  I('altar', ['...r....', '..rrr...', '...r....', '.wwwww..', 'wwwwwww.', '.w.w.w..', '.w.w.w..', 'wwwwwww.']);
  I('fist', ['.rrrr...', 'rrrrrr..', 'rsrsrsr.', 'rsrsrsr.', 'rrrrrrr.', '.rrrrrr.', '..rrrr..', '..rrrr..']);
  I('key_ruby', ['.rr.....', 'r..r....', 'r..r....', '.rrrrrr.', '....r.r.', '....r...']);
  I('key_emerald', ['.nn.....', 'n..n....', 'n..n....', '.nnnnnn.', '....n.n.', '....n...']);
  I('key_sapphire', ['.uu.....', 'u..u....', 'u..u....', '.uuuuuu.', '....u.u.', '....u...']);
  I('flameE', ['...r....', '..rar...', '.rayar..', '.ayyya..', '..aya...']);
  I('egg', ['...ww...', '..wwWw..', '.wwwwtw.', '.wtwwww.', '.wwwwtW.', '.wwtwwW.', '..wWWW..']);

  // ── 굽기 ──
  // 맵 옵션 (def 의 세 번째 인자)
  //   pal     : 이 맵에서만 쓰는 글자 → 색 (전역 PAL 보다 먼저). 함수면 pal(tier, TIER[tier]).
  //   hd      : true 면 rows 가 이미 2× 격자(원본 px)인 손그림 (명암도 손으로). 자동 확대·명암 없음.
  //   size    : hd 맵의 [폭, 높이] (짧은 줄은 '.' 로 채운다)
  //   k       : 자동 확대 배율 (기본 2, 보스 3)
  //   layers  : [{ min, x, y, rows, under }] 등급 min 이상에서 덧그리는 장비 층 (원본 px 좌표).
  //             under 면 빈 칸에만 그린다 (망토·날개). '.' 는 그대로, '_' 는 지운다.
  //   patch   : [{ x, y, rows }] 확대 뒤(원본 px 좌표)에 덧그리는 손질 (얼굴·눈)
  //   emis    : '_e' 마스크로 갈 빛나는 글자. 문자열, 또는 { 등급: 글자 } (유닛)
  //   hard    : 확대할 때 모서리를 깎지 않을 글자 (기본 'e' — 마름모 눈 방지)
  //   noshade : 자동 명암에서 뺄 글자 (기본 'eysSl' 에 더한다 — 피부·눈·보석)
  const warned = {};
  function warn(msg) {
    if (warned[msg]) return;
    warned[msg] = 1;
    if (typeof console !== 'undefined') console.warn('[sprites] ' + msg);
  }

  // 글자 격자. '.' 는 빈 칸
  function grid(rows, name, size, pal) {
    const h = size ? size[1] : rows.length;
    let w = size ? size[0] : 0;
    if (!size) for (const r of rows) w = Math.max(w, r.length);
    const g = new Array(w * h).fill('.');
    for (let y = 0; y < rows.length && y < h; y++) {
      const r = rows[y];
      if (!size && r.length !== w) warn(name + ': ' + y + '번 줄 길이 ' + r.length + ' ≠ ' + w);
      if (r.length > w) warn(name + ': ' + y + '번 줄이 ' + w + '칸을 넘는다');
      for (let x = 0; x < r.length && x < w; x++) {
        const ch = r[x];
        if (ch === '.') continue;
        if (pal && !pal[ch] && !PAL[ch]) warn(name + ': 모르는 글자 ' + ch);
        g[y * w + x] = ch;
      }
    }
    if (rows.length > h) warn(name + ': 줄 수 ' + rows.length + ' > ' + h);
    return { w, h, g };
  }

  // 덧그리기 (layers·patch). '.' 는 그대로, '_' 는 지운다
  function stamp(img, L, name, pal) {
    const ox = L.x || 0;
    const oy = L.y || 0;
    for (let y = 0; y < L.rows.length; y++) {
      const r = L.rows[y];
      for (let x = 0; x < r.length; x++) {
        const ch = r[x];
        if (ch === '.') continue;
        const X = ox + x;
        const Y = oy + y;
        if (X < 0 || Y < 0 || X >= img.w || Y >= img.h) {
          warn(name + ': 덧그림이 격자 밖 (' + X + ',' + Y + ')');
          continue;
        }
        const i = Y * img.w + X;
        if (L.under && img.g[i] !== '.') continue;
        if (ch !== '_' && pal && !pal[ch] && !PAL[ch]) warn(name + ': 모르는 글자 ' + ch);
        img.g[i] = ch === '_' ? '.' : ch;
      }
    }
  }

  // Scale2x / Scale3x (EPX). hard 글자는 모서리를 깎지도, 남에게 번지지도 않는다
  function scaleK(img, k, hard) {
    const { w, h, g } = img;
    const W = w * k;
    const out = new Array(W * h * k).fill('.');
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? g[y * w + x] : '.');
    const pick = (E, c) => (c !== E && (hard.has(E) || hard.has(c)) ? E : c);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const E = g[y * w + x];
        const B = at(x, y - 1), D = at(x - 1, y), F = at(x + 1, y), H = at(x, y + 1);
        let e;
        if (k === 2) {
          e = [
            D === B && B !== H && D !== F ? D : E,
            B === F && B !== H && D !== F ? F : E,
            D === H && D !== B && H !== F ? D : E,
            H === F && D !== H && B !== F ? F : E,
          ];
        } else {
          const A = at(x - 1, y - 1), C = at(x + 1, y - 1), G = at(x - 1, y + 1), I = at(x + 1, y + 1);
          if (B !== H && D !== F) {
            e = [
              D === B ? D : E,
              (D === B && E !== C) || (B === F && E !== A) ? B : E,
              B === F ? F : E,
              (D === B && E !== G) || (D === H && E !== A) ? D : E,
              E,
              (B === F && E !== I) || (H === F && E !== C) ? F : E,
              D === H ? D : E,
              (D === H && E !== I) || (H === F && E !== G) ? H : E,
              H === F ? F : E,
            ];
          } else e = [E, E, E, E, E, E, E, E, E];
        }
        for (let j = 0; j < k * k; j++) out[(y * k + ((j / k) | 0)) * W + x * k + (j % k)] = pick(E, e[j]);
      }
    }
    return { w: W, h: h * k, g: out };
  }

  // ── 색 ──
  const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const RGB = {};
  function hexRgb(hex) {
    let c = RGB[hex];
    if (!c) {
      const n = parseInt(hex.slice(1), 16);
      c = RGB[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return c;
  }
  const rgbHex = (r, g, b) => '#' + ((1 << 24) | (clamp8(r) << 16) | (clamp8(g) << 8) | clamp8(b)).toString(16).slice(1);
  function mix(a, b, t) {
    const A = hexRgb(a);
    const B = hexRgb(b);
    return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function toHls(r, g, b) {
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const l = (mx + mn) / 2;
    if (mx === mn) return [0, l, 0];
    const d = mx - mn;
    const s = l <= 0.5 ? d / (mx + mn) : d / (2 - mx - mn);
    const rc = (mx - r) / d, gc = (mx - g) / d, bc = (mx - b) / d;
    let h = r === mx ? bc - gc : g === mx ? 2 + rc - bc : 4 + gc - rc;
    h = (((h / 6) % 1) + 1) % 1;
    return [h, l, s];
  }
  function fromHls(h, l, s) {
    if (!s) return [l, l, l];
    const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
    const m1 = 2 * l - m2;
    const v = (hh) => {
      hh = ((hh % 1) + 1) % 1;
      if (hh < 1 / 6) return m1 + (m2 - m1) * hh * 6;
      if (hh < 0.5) return m2;
      if (hh < 2 / 3) return m1 + (m2 - m1) * (2 / 3 - hh) * 6;
      return m1;
    };
    return [v(h + 1 / 3), v(h), v(h - 1 / 3)];
  }
  // 밝기 dl, 색상 dh (+ 는 노랑 쪽, - 는 보라 쪽으로), 채도 ds 만큼 옮긴 색
  function shift(hex, dl, dh, ds) {
    const c = hexRgb(hex);
    let [H, L, S] = toHls(c[0] / 255, c[1] / 255, c[2] / 255);
    const tgt = dh > 0 ? 1 / 6 : 0.72;
    const d = ((((tgt - H + 0.5) % 1) + 1) % 1) - 0.5;
    H = (((H + Math.sign(d) * Math.min(Math.abs(d), Math.abs(dh))) % 1) + 1) % 1;
    L = Math.max(0, Math.min(1, L + dl));
    S = Math.max(0, Math.min(1, S + ds));
    const o = fromHls(H, L, S);
    return rgbHex(o[0] * 255, o[1] * 255, o[2] * 255);
  }
  RS.shiftColor = shift;
  // 4단 램프: [밝은 면, 바탕, 그늘, 깊은 그늘]. 빛은 왼쪽 위에서
  const RAMP = {};
  const ramp = (hex) => RAMP[hex] || (RAMP[hex] = [shift(hex, 0.1, 0.03, -0.02), hex, shift(hex, -0.1, -0.025, 0.02), shift(hex, -0.2, -0.045, 0.03)]);

  // ── 자동 명암 (적·엘리트·보스) ──
  function boxBlur(src, w, h, r) {
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let d = -r; d <= r; d++) {
          const xx = x + d;
          if (xx >= 0 && xx < w) s += src[y * w + xx];
        }
        tmp[y * w + x] = s / n;
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let d = -r; d <= r; d++) {
          const yy = y + d;
          if (yy >= 0 && yy < h) s += tmp[yy * w + x];
        }
        out[y * w + x] = s / n;
      }
    }
    return out;
  }
  // 빛 쪽(왼쪽 위)을 향한 기울기. 바깥 → 안쪽으로 차오르는 왼쪽 위 가장자리가 + 가 된다
  function lightGrad(f, w, h) {
    const o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const gx = w < 2 ? 0 : x === 0 ? f[i + 1] - f[i] : x === w - 1 ? f[i] - f[i - 1] : (f[i + 1] - f[i - 1]) / 2;
        const gy = h < 2 ? 0 : y === 0 ? f[i + w] - f[i] : y === h - 1 ? f[i] - f[i - w] : (f[i + w] - f[i - w]) / 2;
        o[i] = 0.55 * gx + 0.83 * gy;
      }
    }
    return o;
  }
  // 글자 격자 → 색 격자 (4단 명암). 피부·눈·보석·작은 부분은 그대로 둔다
  function autoShade(img, pal, noshade) {
    const { w, h, g } = img;
    const n = w * h;
    const A = new Float32Array(n);
    const cnt = {};
    for (let i = 0; i < n; i++) {
      if (g[i] === '.') continue;
      A[i] = 1;
      cnt[g[i]] = (cnt[g[i]] || 0) + 1;
    }
    const form = lightGrad(boxBlur(A, w, h, 3), w, h);
    const col = new Array(n).fill(null);
    for (const ch in cnt) {
      const base = pal[ch] || PAL[ch] || '#ff00ff';
      if (noshade.has(ch) || cnt[ch] < 10) {
        for (let i = 0; i < n; i++) if (g[i] === ch) col[i] = base;
        continue;
      }
      const M = new Float32Array(n);
      for (let i = 0; i < n; i++) if (g[i] === ch) M[i] = 1;
      const loc = lightGrad(boxBlur(M, w, h, 1), w, h);
      const R = ramp(base);
      for (let i = 0; i < n; i++) {
        if (g[i] !== ch) continue;
        const v = 0.9 * form[i] + 0.9 * loc[i] - 0.1 * (((i / w) | 0) / h);
        col[i] = R[v > 0.1 ? 0 : v < -0.17 ? 3 : v < -0.06 ? 2 : 1];
      }
    }
    return col;
  }

  // ── 테두리 ──
  // 여백 m 을 두고 옮긴다. ch(글자)도 같이 옮겨 '_e' 마스크에 쓴다
  function frame(col, ch, w, h, m) {
    const W = w + 2 * m;
    const H = h + 2 * m;
    const c2 = new Array(W * H).fill(null);
    const g2 = new Array(W * H).fill('.');
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!col[i]) continue;
        c2[(y + m) * W + x + m] = col[i];
        g2[(y + m) * W + x + m] = ch[i];
      }
    }
    return { W, H, col: c2, ch: g2 };
  }
  // 오른쪽(과 오른쪽 위) 가장자리에 등급 역광
  function rimLight(img, rim) {
    const { W, H, col } = img;
    const out = col.slice();
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!col[i]) continue;
        if (!col[i + 1] && y < H * 0.85) out[i] = mix(col[i], rim, 0.7);
        else if (!col[i - W] && x > W * 0.45) out[i] = mix(col[i], rim, 0.55);
      }
    }
    img.col = out;
  }
  // 원본 1px 외곽선. 위로 열린 가장자리는 sel-out (외곽선 65% + 아래 색 35%), 아래는 진하게
  function outline(img) {
    const { W, H, col, ch } = img;
    const out = col.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (col[i]) continue;
        const dn = y < H - 1 && col[i + W];
        const up = y > 0 && col[i - W];
        const lf = x > 0 && col[i - 1];
        const rt = x < W - 1 && col[i + 1];
        if (!dn && !up && !lf && !rt) continue;
        out[i] = dn && !up && !lf && !rt ? mix(OUTLINE, col[i + W], 0.35) : OUTLINE;
        ch[i] = 'o';
      }
    }
    img.col = out;
  }

  // ── 캔버스 ──
  let bytes = 0;
  function toCanvas(img, u, tint, keep) {
    const c = document.createElement('canvas');
    c.width = img.W;
    c.height = img.H;
    const ctx = c.getContext('2d');
    const data = ctx.createImageData(img.W, img.H);
    const d = data.data;
    const tc = tint ? hexRgb(tint) : null;
    for (let i = 0; i < img.col.length; i++) {
      const col = img.col[i];
      if (!col) continue;
      if (keep && !keep(i)) continue;
      const rgb = tc || hexRgb(col);
      d[i * 4] = rgb[0];
      d[i * 4 + 1] = rgb[1];
      d[i * 4 + 2] = rgb[2];
      d[i * 4 + 3] = img.alpha ? img.alpha[i] : 255;
    }
    ctx.putImageData(data, 0, 0);
    c.u = u;
    c.lw = img.W / u;
    c.lh = img.H / u;
    bytes += img.W * img.H * 4;
    return c;
  }

  // 옛 방식 (u = 1): 8×8 아이콘·숫자
  function bakeFlat(rows, pal, name) {
    const im = grid(rows, name, null, pal);
    const col = im.g.map((c) => (c === '.' ? null : pal[c] || PAL[c] || '#ff00ff'));
    const img = frame(col, im.g, im.w, im.h, 1);
    outline(img);
    // 아이콘은 sel-out 없이 예전처럼 진한 외곽선만
    for (let i = 0; i < img.col.length; i++) if (img.ch[i] === 'o') img.col[i] = OUTLINE;
    return img;
  }

  const isBoss = (name) => {
    const b = name.replace(/_z$/, '');
    return !!(RS.ENEMY && RS.ENEMY[b] && RS.ENEMY[b].boss);
  };
  const NOSHADE = 'eysSl';
  // 자동 HD: Scale2x(보스 3x) → 손질 → 4단 명암 → 눈 반짝임 → 여백·외곽선
  function bakeAuto(name, src, pal) {
    const k = src.k || (isBoss(name) ? 3 : 2);
    const g0 = grid(src.rows, name, null, pal);
    const hard = new Set((src.hard != null ? src.hard : 'e').split(''));
    const up = scaleK(g0, k, hard);
    for (const p of src.patch || []) stamp(up, p, name, pal);
    const col = autoShade(up, pal, new Set((NOSHADE + (src.noshade || '')).split('')));
    // 눈 반짝임: 눈 덩어리마다 오른쪽 위 한 점
    if (src.glint !== false) {
      for (let y = 0; y < g0.h; y++) {
        for (let x = 0; x < g0.w; x++) {
          if (g0.g[y * g0.w + x] !== 'e') continue;
          if (y > 0 && g0.g[(y - 1) * g0.w + x] === 'e') continue;
          if (x < g0.w - 1 && g0.g[y * g0.w + x + 1] === 'e') continue;
          const i = y * k * up.w + x * k + k - 1;
          if (up.g[i] === 'e') col[i] = '#ffffff';
        }
      }
    }
    // 여백: 예전 1px 외곽선 자리만큼 (논리 1px). 보스는 1.5배 크기라 원본 3px
    const img = frame(col, up.g, up.w, up.h, k === 3 ? 3 : 2);
    outline(img);
    return { img, g0, k };
  }

  // 손그림 HD 유닛 (32×32): 등급 장비 층 → 팔레트 → 역광 → 외곽선
  function bakeHD(name, src, tier, T) {
    const pal = Object.assign({ c: T.color, C: T.dark, l: T.light }, typeof src.pal === 'function' ? src.pal(tier, T) : src.pal || {});
    const im = grid(src.rows, name, src.size, pal);
    for (const L of src.layers || []) if (tier >= (L.min || 0)) stamp(im, L, name, pal);
    for (const p of src.patch || []) stamp(im, p, name, pal);
    const col = im.g.map((c) => (c === '.' ? null : pal[c] || PAL[c] || '#ff00ff'));
    const img = frame(col, im.g, im.w, im.h, 2);
    if (tier >= 2) rimLight(img, T.light);
    outline(img);
    return img;
  }

  function emisSet(src, tier) {
    const e = src.emis;
    if (!e) return null;
    const s = typeof e === 'string' ? e : e[tier] || '';
    return s ? new Set(s.split('')) : null;
  }

  // 대각선 광택 띠 6프레임 (전설·신화 유닛)
  function shineFrames(img, col) {
    const out = [];
    const { W, H } = img;
    for (let f = 0; f < 6; f++) {
      const c = 0.12 + f * 0.152;
      const alpha = new Uint8ClampedArray(W * H);
      const cols = new Array(W * H).fill(null);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = y * W + x;
          if (!img.col[i] || img.ch[i] === 'o') continue;
          const d = Math.abs((x + y) / (W + H) - c);
          if (d > 0.07) continue;
          cols[i] = col;
          alpha[i] = d < 0.035 ? 150 : 70;
        }
      }
      out.push({ W, H, col: cols, alpha });
    }
    return out;
  }

  const SPR = (RS.SPR = {});
  // 스프라이트의 대표 색 두 가지 (외곽선 제외, 많이 쓰인 순). 쓰러질 때 파편 색으로 쓴다
  const SPR_COL = (RS.SPR_COL = {});
  function mainColors(g0, pal) {
    const cnt = {};
    for (const ch of g0.g) if (ch !== '.') cnt[ch] = (cnt[ch] || 0) + 1;
    const list = Object.keys(cnt)
      .sort((a, b) => cnt[b] - cnt[a])
      .map((ch) => pal[ch] || PAL[ch] || '#ffffff');
    return list.length ? [list[0], list[1] || list[0]] : ['#ffffff', '#ffffff'];
  }
  RS.SPR_STATS = { ms: 0, bytes: 0, count: 0 };
  RS.bakeSprites = function () {
    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    bytes = 0;
    const ART = RS.ART;
    for (const cls of RS.CLASSES) {
      const src = SRC[cls];
      for (let tier = 0; tier < RS.TIER.length; tier++) {
        const T = RS.TIER[tier];
        const id = cls + tier;
        const img = src.hd ? bakeHD(cls, src, tier, T) : bakeAuto(cls, src, { c: T.color, C: T.dark, l: T.light }).img;
        SPR[id] = toCanvas(img, ART);
        SPR[id + '_w'] = toCanvas(img, ART, '#ffffff'); // 소환·합성 순간 번쩍임
        const em = emisSet(src, tier);
        if (em) SPR[id + '_e'] = toCanvas(img, ART, null, (i) => em.has(img.ch[i]));
        if (tier >= 3) {
          const fr = shineFrames(img, tier >= 4 ? '#fff0f6' : '#fff8dc');
          for (let f = 0; f < fr.length; f++) SPR[id + '_s' + f] = toCanvas(fr[f], ART);
        }
      }
    }
    for (const name in SRC) {
      if (RS.CLASSES.indexOf(name) >= 0) continue;
      const src = SRC[name];
      const pal = src.pal || {};
      if (name.startsWith('i_')) {
        SPR[name] = toCanvas(bakeFlat(src.rows, pal, name), 1);
        continue;
      }
      const { img, g0 } = bakeAuto(name, src, pal);
      SPR[name] = toCanvas(img, ART);
      SPR[name + '_w'] = toCanvas(img, ART, '#ffffff');
      SPR[name + '_i'] = toCanvas(img, ART, '#8fe3ff');
      const em = emisSet(src, 0);
      if (em) SPR[name + '_e'] = toCanvas(img, ART, null, (i) => em.has(img.ch[i]));
      SPR_COL[name] = mainColors(g0, pal);
    }
    const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    RS.SPR_STATS = { ms: t1 - t0, bytes, count: Object.keys(SPR).length };
  };

  // DOM 용 아이콘 (data URL, 확대해서 굽는다)
  const urlCache = {};
  RS.iconURL = function (name, scale) {
    scale = scale || 4;
    const key = name + '@' + scale;
    if (urlCache[key]) return urlCache[key];
    let src = SPR['i_' + name] || SPR[name] || SPR[name + '3'] || SPR.i_star;
    const c = document.createElement('canvas');
    c.width = src.width * scale;
    c.height = src.height * scale;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return (urlCache[key] = c.toDataURL());
  };
  RS.unitURL = function (cls, tier, scale) {
    return RS.iconURL(cls + tier, scale || 3);
  };

  // ── 도트 숫자 (3×5) ──
  const DIGITS = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
    k: ['100', '101', '110', '101', '101'], m: ['000', '110', '111', '101', '101'],
    '.': ['000', '000', '000', '000', '010'], '+': ['000', '010', '111', '010', '000'],
    '-': ['000', '000', '111', '000', '000'], x: ['000', '101', '010', '101', '000'],
    '!': ['010', '010', '010', '000', '010'],
  };
  const GLYPH = (RS.GLYPH = {});
  RS.bakeDigits = function () {
    const colors = { w: '#fff6e6', y: '#ffe46b', r: '#ff6b6b', g: '#f5c44a', b: '#9fdcff', m: '#c9c2d6' };
    for (const ck in colors) {
      GLYPH[ck] = {};
      for (const ch in DIGITS) {
        const rows = DIGITS[ch].map((r) => r.replace(/1/g, ck).replace(/0/g, '.'));
        GLYPH[ck][ch] = toCanvas(bakeFlat(rows, { [ck]: colors[ck] }, 'glyph'), 1);
      }
    }
  };

  RS.fmtNum = function (v) {
    if (v >= 1e12) return (v / 1e12).toFixed(v >= 1e13 ? 0 : 1) + 't';
    if (v >= 1e9) return (v / 1e9).toFixed(v >= 1e10 ? 0 : 1) + 'b';
    if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'm';
    if (v >= 1e4) return Math.round(v / 1e3) + 'k';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return String(Math.max(0, Math.round(v)));
  };

  // 글자 폭 4px(외곽선 겹침 포함). 가운데 정렬로 그린다. scale 을 주면 가운데를 기준으로 키운다 (튀어 오르는 숫자)
  RS.drawNum = function (ctx, str, x, y, color, scale) {
    const set = GLYPH[color || 'w'];
    const k = scale || 1;
    const w = (str.length * 4 + 1) * k;
    let cx = k === 1 ? Math.round(x - w / 2) : x - w / 2;
    const cy = k === 1 ? Math.round(y) : y + 3.5 - 3.5 * k;
    for (const ch of str) {
      const g = set[ch];
      if (g) {
        if (k === 1) ctx.drawImage(g, cx, cy);
        else ctx.drawImage(g, cx, cy, g.width * k, g.height * k);
      }
      cx += 4 * k;
    }
  };
})((globalThis.RS = globalThis.RS || {}));
