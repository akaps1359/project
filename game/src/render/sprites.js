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
  RS.bakeSprites = function () {
    const tierPal = (t) => ({ c: t.color, C: t.dark, l: t.light });
    for (const cls of RS.CLASSES) {
      for (let tier = 0; tier < 4; tier++) {
        const img = withOutline(parse(SRC[cls].rows, tierPal(RS.TIER[tier])));
        SPR[cls + tier] = toCanvas(img);
      }
    }
    for (const name in SRC) {
      if (RS.CLASSES.indexOf(name) >= 0) continue;
      const img = withOutline(parse(SRC[name].rows, {}));
      SPR[name] = toCanvas(img);
      if (!name.startsWith('i_')) {
        SPR[name + '_w'] = toCanvas(img, '#ffffff');
        SPR[name + '_i'] = toCanvas(img, '#8fe3ff');
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

  // 글자 폭 4px(외곽선 겹침 포함). 가운데 정렬로 그린다.
  RS.drawNum = function (ctx, str, x, y, color) {
    const set = GLYPH[color || 'w'];
    const w = str.length * 4 + 1;
    let cx = Math.round(x - w / 2);
    const cy = Math.round(y);
    for (const ch of str) {
      const g = set[ch];
      if (g) ctx.drawImage(g, cx, cy);
      cx += 4;
    }
  };
})((globalThis.RS = globalThis.RS || {}));
