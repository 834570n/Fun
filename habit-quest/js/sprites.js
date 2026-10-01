/*
 * Habit Quest — pixel sprites.
 *
 * Each sprite is a list of equal-length strings, one character per pixel.
 * '.' is transparent; every other character is a key into PALETTE. The key
 * 'C' paints with currentColor, so UI glyphs follow the surrounding text.
 * Sprites render to inline SVG, merging horizontal runs into one <rect>.
 */
(function (root) {
  'use strict';

  var PALETTE = {
    K: '#1a1426', W: '#ffffff', c: '#fff3c4', e: '#a39cb8',
    b: '#9fe2ff', B: '#3a8ee6', D: '#1f56a8',
    r: '#ff6b6b', R: '#c4283a', q: '#ffb3b3',
    g: '#a6ec7a', G: '#3aa64a', H: '#1f6e33',
    y: '#ffe066', Y: '#f2b322', O: '#b8740f', o: '#ff8a3d',
    v: '#d4c4ff', P: '#8a66e0', Q: '#4f34a3', p: '#ff9ccc',
    n: '#c08a5c', N: '#6b4429',
    m: '#eef2f7', M: '#9aa4b8', L: '#5d6680',
    C: 'currentColor'
  };

  // 16x16 icons, lit from the top left.
  var ICONS = {
    water: [
      '................',
      '.......KK.......',
      '......KbbK......',
      '......KbBK......',
      '.....KbBBBK.....',
      '.....KbBBBK.....',
      '....KbBBBBBK....',
      '...KbBBBBBBBK...',
      '...KbWBBBBBBK...',
      '..KbWWBBBBBBDK..',
      '..KbWBBBBBBBDK..',
      '..KbbBBBBBBBDK..',
      '..KbBBBBBBBDDK..',
      '...KBBBBBBDDK...',
      '....KDDDDDDK....',
      '.....KKKKKK.....'
    ],
    shoe: [
      '................',
      '................',
      '....KKKK........',
      '...KrrrrK.......',
      '...KrWWrK.......',
      '...KrrrrKKK.....',
      '...KrWWrrrrKK...',
      '..KrrrrrWWrrrK..',
      '..KrrrrrrrrrrrK.',
      '.KqqqrrrrrrrrRK.',
      '.KrrqqqqqrrrRRK.',
      '.KrrrrrrrrrRRRK.',
      '.KWWWWWWWWWWWWK.',
      '.KMMMMMMMMMMMMK.',
      '..KKKKKKKKKKKK..',
      '................'
    ],
    dumbbell: [
      '................',
      '................',
      '..KKKK....KKKK..',
      '..KMLK....KMLK..',
      'KKKMLK....KMLKKK',
      'KMKMLK....KMLKLK',
      'KMKMLKKKKKKMLKLK',
      'KMKMLKmmmmKMLKLK',
      'KMKMLKMMMMKMLKLK',
      'KMKMLKKKKKKMLKLK',
      'KMKMLK....KMLKLK',
      'KKKMLK....KMLKKK',
      '..KMLK....KMLK..',
      '..KKKK....KKKK..',
      '................',
      '................'
    ],
    leaf: [
      '................',
      '............KKK.',
      '..........KKggK.',
      '........KKggGGK.',
      '.......KggGGGGK.',
      '......KgGGGGGHK.',
      '.....KgGGGGgGHK.',
      '....KgGGGGgGHK..',
      '....KgGGGgGGHK..',
      '...KgGGGgGGHK...',
      '...KgGGgGGHK....',
      '...KGGgGGHK.....',
      '...KGgHHKK......',
      '..KNKKKK........',
      '.KNK............',
      '.KK.............'
    ],
    apple: [
      '................',
      '........KK......',
      '........KNK.KK..',
      '.........KNKgK..',
      '...KKKK..KKgGK..',
      '..KrrrrKKrrKK...',
      '.KrqqrrrrrrrRK..',
      '.KrqrrrrrrrrRK..',
      'KrqrrrrrrrrrrRK.',
      'KrqrrrrrrrrrrRK.',
      'KrrrrrrrrrrrRRK.',
      'KrrrrrrrrrrrRRK.',
      '.KrrrrrrrrrRRK..',
      '.KRrrrrrrrRRRK..',
      '..KRRKKKKRRRK...',
      '...KK....KKK....'
    ],
    book: [
      '................',
      '..KKKKKKKKKKKK..',
      '.KQPPPPPPPPPPPK.',
      '.KQPvvvvvvvvPPK.',
      '.KQPvKKKKKKvPPK.',
      '.KQPvvvvvvvvPPK.',
      '.KQPvKKKKvvvPPK.',
      '.KQPvvvvvvvvPPK.',
      '.KQPPPPPPPPPPPK.',
      '.KQPPPPPPPPPPPK.',
      '.KQPPPPPPPPPPPK.',
      '.KQPPPPPPPPPPQK.',
      '.KQKKKKKKKKKKKK.',
      '.KQccccccccccMK.',
      '..KKKKKKKKKRKKK.',
      '...........RR...'
    ],
    lotus: [
      '................',
      '.......KK.......',
      '......KqpK......',
      '.....KqppPK.....',
      '.....KqppPK.....',
      '.KK..KqppPK..KK.',
      '.KqK.KqppPK.KPK.',
      '.KqpKKqppPKKpPK.',
      '..KqpKqppPKpPK..',
      '..KqppKqpKppPK..',
      '...KqppKKppPK...',
      'KK..KqppppPK..KK',
      'KgKKKKKKKKKKKKgK',
      '.KggGGGGGGGGGHK.',
      '..KKKKKKKKKKKK..',
      '................'
    ],
    moon: [
      '................',
      '....KKKKK.......',
      '...KcyyyK.......',
      '..KcyyyK........',
      '.KcyyyK.........',
      '.KcyyyK.....y...',
      'KcyyyyK.....y...',
      'KcyyyyK...yycyy.',
      'KcyyyyyK....y...',
      'KcyyyyyyK...y...',
      '.KyyyyyyyKK...K.',
      '.KyyyyyyyyyKKKYK',
      '..KYyyyyyyyyyYK.',
      '...KYYyyyyyYYK..',
      '....KKYYYYYKK...',
      '......KKKKK.....'
    ],
    sun: [
      '.......YY.......',
      '.......oo.......',
      '..Y..........Y..',
      '...o..KKKK..o...',
      '....KKccyyKK....',
      '...KccyyyyyyK...',
      '...KcyyyyyyyK...',
      'YoKcyyyyyyyyYKoY',
      'YoKyyyyyyyyyYKoY',
      '...KyyyyyyyYK...',
      '...KyyyyyyYYK...',
      '....KKyYYYKK....',
      '...o..KKKK..o...',
      '..Y..........Y..',
      '.......oo.......',
      '.......YY.......'
    ],
    heart: [
      '................',
      '................',
      '..KKKK....KKKK..',
      '.KqqrrK..KrrrrK.',
      'KqWqrrrKKrrrrrRK',
      'KqqrrrrrrrrrrrRK',
      'KqrrrrrrrrrrrrRK',
      'KrrrrrrrrrrrrRRK',
      '.KrrrrrrrrrrrRK.',
      '..KrrrrrrrrrRK..',
      '...KrrrrrrrRK...',
      '....KrrrrrRK....',
      '.....KrrrRK.....',
      '......KrRK......',
      '.......KK.......',
      '................'
    ],
    tooth: [
      '................',
      '...KKKK..KKKK...',
      '..KWWmmKKmmmmK..',
      '.KWWmmmmmmmmmMK.',
      '.KWmmmmmmmmmmMK.',
      '.KWmmmmmmmmmmMK.',
      '.KmmmmmmmmmmmMK.',
      '.KmmmmmmmmmmMMK.',
      '..KmmmmmmmmmMK..',
      '..KmmmmmmmmmMK..',
      '..KmmmMKKmmmMK..',
      '..KmmMK..KmmMK..',
      '..KmmMK..KmmMK..',
      '...KmK....KmK...',
      '...KK......KK...',
      '................'
    ],
    pill: [
      '................',
      '.........KKKKK..',
      '........KqqrrrK.',
      '.......KqqrrrrK.',
      '......KqqrrrrRK.',
      '.....KqqrrrrRRK.',
      '....KWWrrrrRRRK.',
      '...KWWmmrrRRRK..',
      '..KWWmmmmRRRK...',
      '.KWWmmmmMMRK....',
      '.KWmmmmMMMK.....',
      '.KmmmmMMMK......',
      '.KmmmMMMK.......',
      '.KmmMMMK........',
      '..KKKKK.........',
      '................'
    ],
    pencil: [
      '............K...',
      '...........KpK..',
      '..........KpppK.',
      '.........KmmpppK',
      '........KymMMpK.',
      '.......KyYYMMK..',
      '......KyYYYOK...',
      '.....KyYYYOK....',
      '....KyYYYOK.....',
      '...KyYYYOK......',
      '...KYYYOK.......',
      '..KcnYOK........',
      '..KnnKK.........',
      '..KKK...........',
      '................',
      '................'
    ],
    chat: [
      '................',
      '................',
      '..KKKKKKKKKKKK..',
      '.KWWWWWWWWWWWmK.',
      'KWWWWWWWWWWWWWmK',
      'KWWBBWWBBWWBBWmK',
      'KWWBBWWBBWWBBWmK',
      'KWWWWWWWWWWWWWmK',
      'KmWWWWWWWWWWWmmK',
      '.KmmmmmmmmmmmmK.',
      '..KKKmmKKKKKKK..',
      '....KmK.........',
      '...KmK..........',
      '...KK...........',
      '................',
      '................'
    ],
    star: [
      '................',
      '.......KK.......',
      '......KcyK......',
      '......KcyK......',
      '.....KcyyyK.....',
      'KKKKKKcyyyKKKKKK',
      'KccyyyyyyyyyyyYK',
      '.KcyyyyyyyyyyYK.',
      '..KyyyyyyyyyYK..',
      '...KyyyyyyyYK...',
      '...KyyyyyyyYK...',
      '..KyyyyKKyyyYK..',
      '..KyyyK..KyyYK..',
      '.KyyK......KYYK.',
      '.KKK........KKK.',
      '................'
    ],
    potion: [
      '.....KKKKKK.....',
      '.....KnnNNK.....',
      '.....KnnNNK.....',
      '......KmmK......',
      '......KmmK......',
      '.....KmmmmK.....',
      '....KmWmmmmK....',
      '...KmmWmmmmmK...',
      '...KmmmmmmmmK...',
      '..KpppvvvvvvvK..',
      '..KvvWPPPPvPPK..',
      '...KWPPPPPPPK...',
      '...KWPPPPvPPK...',
      '...KPPPPPPPPK...',
      '....KKQQQQKK....',
      '......KKKK......'
    ],
    // Badge art
    flame: [
      '.......K........',
      '......KoK.......',
      '......KooK......',
      '.....KoooK...K..',
      '.....KooyoK.KoK.',
      '....KooyyoK.KoK.',
      '...KooyyyooKooK.',
      '...KoyyyyyoooK..',
      '..KooyyccyyooK..',
      '..KoyyccccyyoK..',
      '..KoyccWWccyoK..',
      '..KoyccWWccyoK..',
      '..KRoyccccyoRK..',
      '...KRooyyooRK...',
      '....KKRRRRKK....',
      '......KKKK......'
    ],
    trophy: [
      '..KKKKKKKKKKKK..',
      '..KyWyyyyyyyYK..',
      'KKKyWyyyyyyyYKKK',
      'KYKyWyyyyyyyYKYK',
      'KYKyyyyyyyyyYKYK',
      '.KYKyyyyyyyYKYK.',
      '..KKKyyyyyYYKK..',
      '....KyyyyYYK....',
      '.....KKyYKK.....',
      '......KyYK......',
      '......KyYK......',
      '.....KKyYKK.....',
      '....KOOOOOOK....',
      '...KYYYYYYYYK...',
      '...KOOOOOOOOK...',
      '...KKKKKKKKKK...'
    ],
    crown: [
      '................',
      '................',
      '.......KK.......',
      '.K....KrrK....K.',
      'KyK...KrRK...KyK',
      'KyyK.KyyyyK.KyyK',
      'KyyyKyyyyyyKyyyK',
      'KcyyyyyyyyyyyyYK',
      'KcyyyyyyyyyyyyYK',
      'KKKKKKKKKKKKKKKK',
      'KYbbYYYrrYYYbbYK',
      'KYbBYYYRrYYYbBYK',
      'KOOOOOOOOOOOOOOK',
      '.KKKKKKKKKKKKKK.',
      '................',
      '................'
    ],
    sword: [
      '.............KKK',
      '............KWmK',
      '...........KWmMK',
      '..........KWmMK.',
      '.........KWmMK..',
      '........KWmMK...',
      '.......KWmMK....',
      '......KWmMK.....',
      '..KK.KWmMK......',
      '..KYKWmMK.......',
      '...KYymK........',
      '...KNKYK........',
      '..KNK.KYK.......',
      '.KNK...KK.......',
      'KYK.............',
      'KK..............'
    ],
    shield: [
      '................',
      '.KKKKKKKKKKKKKK.',
      '.KmmmmmmMMMMMMK.',
      '.KmbbbbyyBBBBMK.',
      '.KmbbbbyyBBBBMK.',
      '.KmbbbbyyBBBBMK.',
      '.KmyyyyyyyyyyMK.',
      '.KmyyyyyYYYYYMK.',
      '.KmBBBByYDDDDMK.',
      '..KMBBByYDDDMK..',
      '..KMBBByYDDDMK..',
      '..KMBBByYDDDMK..',
      '...KMBByYDDMK...',
      '...KKMMyYMMKK...',
      '.....KKMMKK.....',
      '.......KK.......'
    ],
    scroll: [
      '................',
      '.KKKKKKKKKKKKKK.',
      'KnccccccccccccnK',
      'KNnnnnnnnnnnnnNK',
      '.KKccccccccccKK.',
      '..KcceeeeeeccK..',
      '..KccccccccccK..',
      '..KceeeeeeeccK..',
      '..KccccccccccK..',
      '..KceeeeeccccK..',
      '..KccccccccccK..',
      '.KKccccccccccKK.',
      'KnccccccccccccnK',
      'KNnnnnnnnnnnnnNK',
      '.KKKKKKKKKKKKKK.',
      '................'
    ],
    gem: [
      '................',
      '................',
      '...KKKKKKKKKK...',
      '..KbWbbBBbbBDK..',
      '.KbWbbBBBBbbBDK.',
      'KDDDDDDDDDDDDDDK',
      'KbWbbbBBBBBBBDDK',
      '.KbbbbBBBBBBDDK.',
      '..KbbbBBBBBDDK..',
      '...KbbBBBBDDK...',
      '....KbBBBBDK....',
      '.....KbBBDK.....',
      '......KbDK......',
      '.......KK.......',
      '................',
      '................'
    ]
  };

  // Single-colour UI glyphs (painted with currentColor).
  var GLYPHS = {
    left: ['....C...', '...CC...', '..CCC...', '.CCCC...', '..CCC...', '...CC...', '....C...', '........'],
    right: ['...C....', '...CC...', '...CCC..', '...CCCC.', '...CCC..', '...CC...', '...C....', '........'],
    up: ['...CC...', '..CCCC..', '.CCCCCC.', 'CCCCCCCC', '...CC...', '...CC...', '...CC...', '........'],
    down: ['........', '...CC...', '...CC...', '...CC...', 'CCCCCCCC', '.CCCCCC.', '..CCCC..', '...CC...'],
    check: ['........', '......CC', '.....CC.', 'C...CC..', 'CC.CC...', '.CCC....', '..C.....', '........'],
    plus: ['...CC...', '...CC...', '...CC...', 'CCCCCCCC', 'CCCCCCCC', '...CC...', '...CC...', '...CC...'],
    minus: ['........', '........', '........', 'CCCCCCCC', 'CCCCCCCC', '........', '........', '........'],
    close: ['CC....CC', '.CC..CC.', '..CCCC..', '...CC...', '..CCCC..', '.CC..CC.', 'CC....CC', '........'],
    edit: ['......C.', '.....CCC', '....CCC.', '...CCC..', '..CCC...', '.CCC....', '.CC.....', 'C.......'],
    sound: ['...C....', '..CC.C..', 'CCCC..C.', 'CCCC..C.', 'CCCC..C.', '..CC.C..', '...C....', '........'],
    mute: ['...C....', '..CC....', 'CCCC.C.C', 'CCCC..C.', 'CCCC.C.C', '..CC....', '...C....', '........'],
    gear: ['...CC...', '.C.CC.C.', '..CCCC..', 'CCC..CCC', 'CCC..CCC', '..CCCC..', '.C.CC.C.', '...CC...'],
    flame: ['...C....', '..CC....', '..CCC.C.', '.CCCCCC.', 'CCC.CCCC', 'CC...CCC', 'CC...CC.', '.CCCCC..']
  };

  // The hero, 16x20. Rows 0-1 are headroom for the crown.
  var HERO = [
    '................',
    '................',
    '.....KKKKKK.....',
    '....KHHhhHHK....',
    '...KHhhhHHHHK...',
    '..KHHhHHHHHHHK..',
    '..KHHHHHHHHHHK..',
    '..KHHHssssHHHK..',
    '..KHssssssssHK..',
    '..KsWKssssWKsK..',
    '..KsKKssssKKsK..',
    '..KppssssssppK..',
    '...KSssRRssSK...',
    '....KKKKKKKK....',
    '...KAAAAAAAaK...',
    '..KsKAAAAAaKsK..',
    '..KsKBBYYBBKsK..',
    '...KKAAAAAaKK...',
    '....KLLKKLLK....',
    '...KNNNKKNNNK...'
  ];
  // Cheering: happy eyes, open smile and sparkles (rows replace the idle ones).
  var HERO_CHEER = {
    3: '.y..KHHhhHHK..y.',
    4: 'yyyKHhhhHHHHKyyy',
    5: '.yKHHhHHHHHHHKy.',
    9: '..KsKKssssKKsK..',
    10: '..KKssKssKssKK..',
    12: '...KSsRRRRsSK...'
  };
  var HERO_BLINK = { 9: '..KssssssssssK..' };
  var HERO_CROWN = ['....KyKyyKyK....', '....KyyyyyyK....'];

  // Tunic colours by tier (level 1, 5, 10, 20).
  var HERO_TIERS = [
    { A: '#46b25a', a: '#2b7d3c' },
    { A: '#3d86f0', a: '#2456b0' },
    { A: '#9467f2', a: '#5f3cb8' },
    { A: '#e5484f', a: '#a12a33' }
  ];
  var HERO_BASE = {
    K: '#1a1426', H: '#7a4a2a', h: '#a8693c', s: '#f6c8a0', S: '#e0a07a', W: '#ffffff',
    p: '#f29aa0', R: '#9c3040', B: '#5a3a28', Y: '#ffd23f', L: '#3b3250', N: '#4a2f22',
    y: '#ffe066', M: '#c9d2e0'
  };

  // Treasure chest, 12x12: shut, and open (spilling gold) on a perfect day.
  var CHEST = {
    shut: [
      '............',
      '............',
      '.KKKKKKKKKK.',
      'KcnnnMMnnnnK',
      'KnnnnMMnnnNK',
      'KNNNNMMNNNNK',
      'KKKKKyyKKKKK',
      'KnnnKyYKnnNK',
      'KnnnnKKnnnNK',
      'KnnnnMMnnnNK',
      'KNNNNMMNNNNK',
      'KKKKKKKKKKKK'
    ],
    open: [
      '..y......c..',
      '.KKKKKKKKKK.',
      'KNNNNMMNNNNK',
      'KNnnnMMnnnNK',
      'KKKKKKKKKKKK',
      'KyWyyYyyWyYK',
      'KKKKKyyKKKKK',
      'KnnnKyYKnnNK',
      'KnnnnKKnnnNK',
      'KnnnnMMnnnNK',
      'KNNNNMMNNNNK',
      'KKKKKKKKKKKK'
    ]
  };

  var cache = {};

  function svg(rows, palette, className, title) {
    var h = rows.length, w = rows[0].length, out = [];
    for (var y = 0; y < h; y++) {
      var row = rows[y], x = 0;
      while (x < w) {
        var ch = row.charAt(x);
        if (ch === '.') { x++; continue; }
        var end = x + 1;
        while (end < w && row.charAt(end) === ch) end++;
        out.push('<rect x="' + x + '" y="' + y + '" width="' + (end - x) + '" height="1" fill="' + (palette[ch] || PALETTE[ch] || '#ff00ff') + '"/>');
        x = end;
      }
    }
    var a11y = title ? ' role="img" aria-label="' + title + '"' : ' aria-hidden="true" focusable="false"';
    return '<svg class="' + className + '" viewBox="0 0 ' + w + ' ' + h + '" shape-rendering="crispEdges"' + a11y + '>' + out.join('') + '</svg>';
  }

  function icon(name, className) {
    var key = 'i:' + name + ':' + (className || '');
    if (!cache[key]) cache[key] = svg(ICONS[name] || ICONS.star, PALETTE, 'px ' + (className || 'icon'));
    return cache[key];
  }

  function glyph(name, className) {
    var key = 'g:' + name + ':' + (className || '');
    if (!cache[key]) cache[key] = svg(GLYPHS[name], PALETTE, 'px glyph ' + (className || ''));
    return cache[key];
  }

  /** The hero at a tier; `pose` is 'idle', 'blink' or 'cheer'. */
  function hero(tier, pose) {
    pose = pose === true ? 'blink' : pose || 'idle';
    var key = 'h:' + tier + ':' + pose;
    if (cache[key]) return cache[key];
    var rows = HERO.slice();
    var swap = pose === 'cheer' ? HERO_CHEER : pose === 'blink' ? HERO_BLINK : {};
    Object.keys(swap).forEach(function (r) { rows[+r] = swap[r]; });
    if (tier >= 1) rows[14] = '...KMAAAAAAMK...';
    if (tier >= 2) { rows[0] = HERO_CROWN[0]; rows[1] = HERO_CROWN[1]; }
    var pal = Object.assign({}, HERO_BASE, HERO_TIERS[Math.min(tier, 3)]);
    if (tier >= 2) pal.M = '#ffd23f';
    if (tier >= 3) pal.B = '#c98a12';
    cache[key] = svg(rows, pal, 'px hero-sprite');
    return cache[key];
  }

  function chest(open) {
    var key = 'c:' + !!open;
    if (!cache[key]) cache[key] = svg(open ? CHEST.open : CHEST.shut, PALETTE, 'px chest-sprite');
    return cache[key];
  }

  root.HQSprites = {
    icon: icon, glyph: glyph, hero: hero, chest: chest,
    ICON_NAMES: Object.keys(ICONS), ICONS: ICONS, GLYPHS: GLYPHS, HERO: HERO
  };
})(typeof self !== 'undefined' ? self : this);
