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
    K: '#1a1426', W: '#ffffff', c: '#fff3c4', e: '#8d86a3',
    b: '#8fdcff', B: '#2f7fe0', D: '#1d4f9e',
    r: '#ff6464', R: '#b8283a',
    g: '#9be86f', G: '#2f9e44',
    y: '#ffd23f', Y: '#e8961c', o: '#ff8a3d',
    p: '#f7a1c4', P: '#7b5cd6', v: '#c0aaff',
    n: '#a8714a', N: '#5a3a28',
    s: '#f6c8a0', m: '#e6ebf2', M: '#8a94a6',
    C: 'currentColor'
  };

  var ICONS = {
    water: [
      '...KK...',
      '..KbbK..',
      '.KbbBBK.',
      '.KbBBBK.',
      'KbWBBBBK',
      'KbWBBBDK',
      '.KbBBDK.',
      '..KKKK..'
    ],
    shoe: [
      '........',
      '.KKK....',
      '.KrrK...',
      '.KrWKKK.',
      '.KrrrrrK',
      'KrrrrrrK',
      'KmmmmmmK',
      '.KKKKKK.'
    ],
    dumbbell: [
      '........',
      'KK....KK',
      'KmK..KmK',
      'KmKKKKmK',
      'KmMMMMmK',
      'KmKKKKmK',
      'KmK..KmK',
      'KK....KK'
    ],
    leaf: [
      '......KK',
      '....KKgK',
      '...KgGGK',
      '..KgGGGK',
      '.KgGGGK.',
      '.KGGGK..',
      'KNKKK...',
      'K.......'
    ],
    apple: [
      '....KK..',
      '...KN.KK',
      '.KKKNKgK',
      'KrWrrKKK',
      'KrWrrrrK',
      'KrrrrrRK',
      '.KrrrRK.',
      '..KKKK..'
    ],
    book: [
      '.KKKKKK.',
      'KDPPPPPK',
      'KDPvvPPK',
      'KDPPPPPK',
      'KDPPPPPK',
      'KDPPPPPK',
      'KDccccWK',
      '.KKKKKK.'
    ],
    lotus: [
      '...KK...',
      '..KpvK..',
      'K.KpvK.K',
      'KpKpvKpK',
      'KppKKvpK',
      '.KppppK.',
      '.KGGGGK.',
      '..KKKK..'
    ],
    moon: [
      '..KKK...',
      '.KyyK...',
      'KyyK....',
      'KyK.....',
      'KyK...KK',
      'KyyK.KyK',
      '.KyyyyK.',
      '..KKKK..'
    ],
    sun: [
      '...yy...',
      '.y.KK.y.',
      '..KyyK..',
      'yKyyyYKy',
      'yKyyYYKy',
      '..KYYK..',
      '.y.KK.y.',
      '...yy...'
    ],
    heart: [
      '........',
      '.KK.KK..',
      'KrrKrrK.',
      'KrWrrrK.',
      'KrrrrRK.',
      '.KrrRK..',
      '..KRK...',
      '...K....'
    ],
    tooth: [
      '.KK..KK.',
      'KWWKKWWK',
      'KWWWWWmK',
      'KWWWWWmK',
      '.KWWWmK.',
      '.KWmKmK.',
      '.KWK.KK.',
      '.KK.....'
    ],
    pill: [
      '....KKK.',
      '...KrrrK',
      '..KrrWrK',
      '.KcKrrK.',
      'KcccKK..',
      'KcWcK...',
      'KccK....',
      '.KK.....'
    ],
    pencil: [
      '......KK',
      '.....KpK',
      '....KyKK',
      '...KyYK.',
      '..KyYK..',
      '.KcYK...',
      '.KKK....',
      'K.......'
    ],
    chat: [
      '........',
      '.KKKKKK.',
      'KWWWWWWK',
      'KWBWBWBK',
      'KWWWWWWK',
      '.KKWKKK.',
      '..KWK...',
      '..KK....'
    ],
    star: [
      '...KK...',
      '..KyyK..',
      'KKKyyKKK',
      'KyyyyyYK',
      '.KyyyYK.',
      '.KyKKYK.',
      '.KK..KK.',
      '........'
    ],
    potion: [
      '..KNNK..',
      '..KccK..',
      '..KmmK..',
      '.KvvvvK.',
      'KvWvvvvK',
      'KPWPPPPK',
      'KPPPPPPK',
      '.KKKKKK.'
    ],
    // Badge-only art
    flame: [
      '...K....',
      '..KoK...',
      '.KooK.K.',
      '.KoyoKoK',
      'KoyyyooK',
      'KoyccyoK',
      'KoyccyoK',
      '.KKKKKK.'
    ],
    trophy: [
      'KKKKKKKK',
      'YKyWyyKY',
      'YKyWyyKY',
      '.KyyyYK.',
      '..KyYK..',
      '...KK...',
      '..KYYK..',
      '.KKKKKK.'
    ],
    crown: [
      '........',
      '.K.KK.K.',
      'KyKyyKyK',
      'KyyyyyyK',
      'KyryyByK',
      'KyyyyyyK',
      'KYYYYYYK',
      '.KKKKKK.'
    ],
    sword: [
      '......KK',
      '.....KmK',
      '....KmMK',
      '.K.KmMK.',
      '.KKmMK..',
      '..KYK...',
      '.KNKKK..',
      'KNK..K..'
    ],
    shield: [
      'KKKKKKKK',
      'KBBmmBBK',
      'KBBmmBBK',
      'KmmmmmmK',
      'KBBmmBBK',
      '.KBmmBK.',
      '..KmmK..',
      '...KK...'
    ],
    scroll: [
      '.KKKKKK.',
      'KcKccccK',
      '.KceeecK',
      '.KcccccK',
      '.KceeecK',
      '.KcccccK',
      'KcKccccK',
      '.KKKKKK.'
    ],
    gem: [
      '........',
      '.KKKKKK.',
      'KbWbbBBK',
      'KbbbbBDK',
      '.KbbBDK.',
      '..KbDK..',
      '...KK...',
      '........'
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

  // The hero, 16x18. Rows 0-1 are headroom for the crown.
  var HERO = [
    '................',
    '................',
    '.....KKKKKK.....',
    '....KHHHHHHK....',
    '...KHHHHHHHHK...',
    '..KHHHHHHHHHHK..',
    '..KHHSSSSSSHHK..',
    '..KHSSSSSSSSHK..',
    '..KSSKSSSSKSSK..',
    '..KSSKSSSSKSSK..',
    '..KSppSSSSppSK..',
    '...KSSSRRSSSK...',
    '....KKKKKKKK....',
    '...KAAAAAAAAK...',
    '..KSKAAaaAAKSK..',
    '..KSKBBYYBBKSK..',
    '...KKAAKKAAKK...',
    '....KNNK.KNNK...'
  ];
  var HERO_CROWN = ['....KyKyyKyK....', '....KyyyyyyK....'];

  // Tunic colours by tier (level 1, 5, 10, 20).
  var HERO_TIERS = [
    { A: '#46b25a', a: '#2b7d3c' },
    { A: '#3d86f0', a: '#2456b0' },
    { A: '#9467f2', a: '#5f3cb8' },
    { A: '#e5484f', a: '#a12a33' }
  ];
  var HERO_BASE = { K: '#1a1426', H: '#7a4a2a', S: '#f6c8a0', p: '#f29aa0', R: '#9c3040', B: '#5a3a28', Y: '#ffd23f', N: '#4a2f22', y: '#ffd23f' };

  // Treasure chest, 10x10: shut, and open (spilling gold) on a perfect day.
  var CHEST = {
    shut: [
      '..........',
      '..........',
      '.KKKKKKKK.',
      'KnnnnnnnnK',
      'KnNNNNNNnK',
      'KKKKyyKKKK',
      'KnnnyYnnnK',
      'KnnnnnnnnK',
      'KNNNNNNNNK',
      'KKKKKKKKKK'
    ],
    open: [
      '.KKKKKKKK.',
      'KNNNNNNNNK',
      'KKKKKKKKKK',
      'KyWyyyWyyK',
      'KyyyYyyyyK',
      'KKKKyyKKKK',
      'KnnnyYnnnK',
      'KnnnnnnnnK',
      'KNNNNNNNNK',
      'KKKKKKKKKK'
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

  /** The hero at a tier; `blink` closes the eyes. */
  function hero(tier, blink) {
    var key = 'h:' + tier + ':' + !!blink;
    if (cache[key]) return cache[key];
    var rows = HERO.slice();
    if (tier >= 2) { rows[0] = HERO_CROWN[0]; rows[1] = HERO_CROWN[1]; }
    if (blink) rows[8] = '..KSSSSSSSSSSK..';
    var pal = Object.assign({}, HERO_BASE, HERO_TIERS[Math.min(tier, 3)]);
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
