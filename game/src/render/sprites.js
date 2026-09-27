// 도트 스프라이트. 채우기 색만 그리고 외곽선은 굽는 과정에서 자동으로 두른다.
(function (RS) {
  'use strict';

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
  ]);
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
    '.......wwkpwwwkpww..ppp.',
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
  ]);
  def('riftLord', [
    '........................',
    '......v.........v.......',
    '......vv.......vv.......',
    '.......kkkkkkkkk........',
    '......kkkkkkkkkkk.......',
    '......kKKKKKKKKKk.......',
    '......kKvvKKKvvKk.......',
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
  ]);

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
  ]);
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
  def('riftHeart', [
    '........................',
    '.......RR.......RR......',
    '......RrrR.....RrrR.....',
    '.....RrrrrR...RrrrrR....',
    '....RrrvvrrR.RrrrrrrR...',
    '...RrrvvvrrrRrrrrrrrrR..',
    '...RrrvvrrrrrrrrrrrrrR..',
    '...RrrrrrrrrkkkrrrrrrR..',
    '...RrrrrrrrkvvvkrrrrrR..',
    '...RrrrrrrrkvVvkrrrrrR..',
    '....RrrrrrrkvvvkrrrrR...',
    '....RrrrrrrrkkkrrrrrR...',
    '.....RrrrrrrrrrrrrrR....',
    '......RrrrrrrrrrrrR.....',
    '.......RrrrrrrrrrR......',
    '..v.....RrrrrrrrR.....v.',
    '...v.....RrrrrrR.....v..',
    '....v.....RrrrR.....v...',
    '...........RR...........',
    '........................',
  ]);

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
  I('fish', ['........', '...uuu..u', '..uuuuuuu', '.uuwuuuu.', 'uuuuuuuuu', '..uuuuu.u', '...uuu...', '.........']);
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
  I('vial', ['..ww....', '..bb....', '.wttw...', 'wtttnw..', 'wtntttw.', 'wttttnw.', 'wtttttw.', '.wwwww..']);
  I('altar', ['...r....', '..rrr...', '...r....', '.wwwww..', 'wwwwwww.', '.w.w.w..', '.w.w.w..', 'wwwwwww.']);
  I('fist', ['.rrrr...', 'rrrrrr..', 'rsrsrsr.', 'rsrsrsr.', 'rrrrrrr.', '.rrrrrr.', '..rrrr..', '..rrrr..']);
  I('key_ruby', ['.rr.....', 'r..r....', 'r..r....', '.rrrrrr.', '....r.r.', '....r...']);
  I('key_emerald', ['.nn.....', 'n..n....', 'n..n....', '.nnnnnn.', '....n.n.', '....n...']);
  I('key_sapphire', ['.uu.....', 'u..u....', 'u..u....', '.uuuuuu.', '....u.u.', '....u...']);
  I('flameE', ['...r....', '..rar...', '.rayar..', '.ayyya..', '..aya...']);
  I('egg', ['...ww...', '..wwWw..', '.wwwwtw.', '.wtwwww.', '.wwwwtW.', '.wwtwwW.', '..wWWW..']);

  // ── 굽기 ──
  function parse(rows, pal) {
    const h = rows.length;
    let w = 0;
    for (const r of rows) w = Math.max(w, r.length);
    const px = new Array(w * h).fill(null);
    for (let y = 0; y < h; y++) {
      const r = rows[y];
      for (let x = 0; x < r.length; x++) {
        const ch = r[x];
        if (ch === '.') continue;
        px[y * w + x] = pal[ch] || PAL[ch] || '#ff00ff';
      }
    }
    return { w, h, px };
  }

  // 1px 여백을 두고 외곽선을 두른다
  function withOutline(img) {
    const W = img.w + 2;
    const H = img.h + 2;
    const out = new Array(W * H).fill(null);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) out[(y + 1) * W + x + 1] = img.px[y * img.w + x];
    const filled = out.map((c) => c !== null);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (filled[y * W + x]) continue;
        if ((x > 0 && filled[y * W + x - 1]) || (x < W - 1 && filled[y * W + x + 1]) || (y > 0 && filled[(y - 1) * W + x]) || (y < H - 1 && filled[(y + 1) * W + x])) {
          out[y * W + x] = OUTLINE;
        }
      }
    }
    return { w: W, h: H, px: out };
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function toCanvas(img, tint) {
    const c = document.createElement('canvas');
    c.width = img.w;
    c.height = img.h;
    const ctx = c.getContext('2d');
    const data = ctx.createImageData(img.w, img.h);
    const tc = tint ? hexRgb(tint) : null;
    for (let i = 0; i < img.px.length; i++) {
      const col = img.px[i];
      if (!col) continue;
      const rgb = tc || hexRgb(col);
      data.data[i * 4] = rgb[0];
      data.data[i * 4 + 1] = rgb[1];
      data.data[i * 4 + 2] = rgb[2];
      data.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    return c;
  }

  const SPR = (RS.SPR = {});
  // 스프라이트의 대표 색 두 가지 (외곽선 제외, 많이 쓰인 순). 쓰러질 때 파편 색으로 쓴다
  const SPR_COL = (RS.SPR_COL = {});
  function mainColors(img) {
    const cnt = {};
    for (const c of img.px) if (c && c !== OUTLINE) cnt[c] = (cnt[c] || 0) + 1;
    const list = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
    return list.length ? [list[0], list[1] || list[0]] : ['#ffffff', '#ffffff'];
  }
  RS.bakeSprites = function () {
    const tierPal = (t) => ({ c: t.color, C: t.dark, l: t.light });
    for (const cls of RS.CLASSES) {
      for (let tier = 0; tier < RS.TIER.length; tier++) {
        const img = withOutline(parse(SRC[cls].rows, tierPal(RS.TIER[tier])));
        SPR[cls + tier] = toCanvas(img);
        SPR[cls + tier + '_w'] = toCanvas(img, '#ffffff'); // 소환·합성 순간 번쩍임
      }
    }
    for (const name in SRC) {
      if (RS.CLASSES.indexOf(name) >= 0) continue;
      const img = withOutline(parse(SRC[name].rows, {}));
      SPR[name] = toCanvas(img);
      if (!name.startsWith('i_')) {
        SPR[name + '_w'] = toCanvas(img, '#ffffff');
        SPR[name + '_i'] = toCanvas(img, '#8fe3ff');
        SPR_COL[name] = mainColors(img);
      }
    }
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
        const img = withOutline(parse(rows, { [ck]: colors[ck] }));
        GLYPH[ck][ch] = toCanvas(img);
      }
    }
  };

  RS.fmtNum = function (v) {
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
