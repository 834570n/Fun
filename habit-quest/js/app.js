/*
 * Habit Quest — the app: rendering, input, effects and sound.
 * Game rules live in core.js; saving lives in storage.js.
 */
(function () {
  'use strict';

  var C = window.HQCore;
  var S = window.HQSprites;
  var Store = window.HQStorage;

  var UI_KEY = 'habit-quest:ui';
  var RANGES = [7, 30, 90];
  var HEAT_WEEKS = 26;
  var STAT = {};
  C.STATS.forEach(function (s) { STAT[s.id] = s; });

  var state, summary, today;
  var celebrated = 1; // highest level shown with the level-up screen this visit
  var ui = {
    tab: 'quests', date: null, range: 7,
    editing: null, confirmReset: false, pendingImport: null, heatKey: null,
    sync: 'local', syncDetail: ''
  };

  // ------------------------------------------------------------ helpers

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  function pct(x) { return Math.round(x * 100); }
  function num(n) { return n.toLocaleString(); }

  var fmt = {
    weekday: new Intl.DateTimeFormat(undefined, { weekday: 'long' }),
    weekdayShort: new Intl.DateTimeFormat(undefined, { weekday: 'short' }),
    weekdayNarrow: new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }),
    short: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }),
    long: new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
    month: new Intl.DateTimeFormat(undefined, { month: 'short' })
  };
  function f(kind, key) { return fmt[kind].format(C.fromKey(key)); }

  // Sun..Sat names for the day pickers (Jan 4 2026 is a Sunday).
  var DAY_SHORT = [], DAY_NARROW = [];
  for (var di = 0; di < 7; di++) {
    var dd = new Date(2026, 0, 4 + di);
    DAY_SHORT.push(fmt.weekdayShort.format(dd));
    DAY_NARROW.push(fmt.weekdayNarrow.format(dd));
  }

  function habitById(id) { return state.habits.find(function (h) { return h.id === id; }); }
  function activeHabits() { return state.habits.filter(function (h) { return !h.archivedAt; }); }

  function dayOf(key) { return summary.days[key] || C.dayInfo(state, key); }

  function heroTitle(level) {
    if (level >= 20) return 'Legend';
    if (level >= 15) return 'Paladin';
    if (level >= 10) return 'Champion';
    if (level >= 7) return 'Knight';
    if (level >= 5) return 'Adventurer';
    if (level >= 3) return 'Squire';
    return 'Novice';
  }

  function daysLabel(days) {
    var k = days.join(',');
    if (k === '0,1,2,3,4,5,6') return 'Every day';
    if (k === '1,2,3,4,5') return 'Weekdays';
    if (k === '0,6') return 'Weekends';
    return days.map(function (d) { return DAY_SHORT[d]; }).join(', ');
  }

  function readUi() {
    try {
      var saved = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
      if (['quests', 'stats', 'badges', 'setup'].indexOf(saved.tab) !== -1) ui.tab = saved.tab;
      if (RANGES.indexOf(saved.range) !== -1) ui.range = saved.range;
    } catch (e) { /* storage blocked */ }
  }
  function writeUi() {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ tab: ui.tab, range: ui.range })); } catch (e) { /* storage blocked */ }
  }

  // ------------------------------------------------------------ sound

  var Sfx = (function () {
    var ctx = null;
    function audio() {
      try {
        if (!ctx) {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return null;
          ctx = new AC();
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
      } catch (e) { return null; }
    }
    function play(notes, wave) {
      if (!state.settings.sound) return;
      var a = audio();
      if (!a) return;
      var t = a.currentTime + 0.01;
      notes.forEach(function (n) {
        var o = a.createOscillator(), g = a.createGain();
        o.type = wave || 'square';
        o.frequency.setValueAtTime(n[0], t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n[1]);
        o.connect(g);
        g.connect(a.destination);
        o.start(t);
        o.stop(t + n[1] + 0.02);
        t += n[1] * 0.85;
      });
    }
    return {
      clear: function () { play([[660, 0.07], [880, 0.07], [1320, 0.14]]); },
      tick: function () { play([[784, 0.06]]); },
      undo: function () { play([[440, 0.07], [311, 0.12]], 'triangle'); },
      perfect: function () { play([[784, 0.08], [988, 0.08], [1175, 0.08], [1568, 0.22]]); },
      level: function () { play([[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.22], [784, 0.08], [1047, 0.32]]); },
      badge: function () { play([[1047, 0.08], [1319, 0.08], [1568, 0.16]], 'triangle'); },
      add: function () { play([[523, 0.05], [784, 0.08]], 'triangle'); }
    };
  })();

  // ------------------------------------------------------------ effects

  function burst(rect, text, opts) {
    opts = opts || {};
    var layer = $('#fx');
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    if (text) {
      var fl = document.createElement('div');
      fl.className = 'float' + (opts.minus ? ' minus' : '');
      fl.textContent = text;
      fl.style.left = cx + 'px';
      fl.style.top = (cy - (opts.lift || 0)) + 'px';
      layer.appendChild(fl);
      setTimeout(function () { fl.remove(); }, 1200);
    }
    if (opts.sparks) {
      for (var i = 0; i < 10; i++) {
        var sp = document.createElement('div');
        var ang = (Math.PI * 2 * i) / 10, dist = 28 + Math.random() * 22;
        sp.className = 'spark';
        sp.style.left = cx + 'px';
        sp.style.top = cy + 'px';
        sp.style.setProperty('--dx', Math.round(Math.cos(ang) * dist / 4) * 4 + 'px');
        sp.style.setProperty('--dy', Math.round(Math.sin(ang) * dist / 4) * 4 + 'px');
        layer.appendChild(sp);
        (function (node) { setTimeout(function () { node.remove(); }, 700); })(sp);
      }
    }
  }

  function toast(title, text, icon) {
    var wrap = $('#toasts');
    var t = document.createElement('div');
    t.className = 'win toast';
    t.innerHTML = (icon ? S.icon(icon) : '') + '<div><b></b><span></span></div>';
    t.querySelector('b').textContent = title;
    t.querySelector('span').textContent = text;
    wrap.appendChild(t);
    while (wrap.children.length > 3) wrap.firstChild.remove();
    setTimeout(function () { t.remove(); }, 3400);
  }

  var cheering = null;
  function jumpHero() {
    var a = $('#hero-actor');
    if (!a) return;
    var tier = C.heroTier(summary.hero.level);
    a.innerHTML = S.hero(tier, 'cheer');
    a.classList.remove('jump');
    void a.offsetWidth;
    a.classList.add('jump');
    clearTimeout(cheering);
    cheering = setTimeout(function () {
      cheering = null;
      if (a.isConnected) a.innerHTML = S.hero(tier, 'idle');
    }, 900);
  }

  var blinkTimer = null;
  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(function () {
      var a = $('#hero-actor');
      if (a && !cheering) {
        var tier = C.heroTier(summary.hero.level);
        a.innerHTML = S.hero(tier, 'blink');
        setTimeout(function () { if (a.isConnected && !cheering) a.innerHTML = S.hero(tier, 'idle'); }, 160);
      }
      scheduleBlink();
    }, 3200 + Math.random() * 2600);
  }

  function showLevelUp(level, tierChanged) {
    var tier = C.heroTier(level);
    $('#levelup-root').innerHTML =
      '<div class="levelup" data-act="levelup-close">' +
        '<div class="win" role="dialog" aria-modal="true" aria-labelledby="lu-title">' +
          '<h2 id="lu-title">Level up!</h2>' +
          '<div class="lu-hero">' + S.hero(tier, 'cheer') + '</div>' +
          '<p>' + esc(state.hero.name) + ' reached <b>level ' + level + '</b>. Title: ' + heroTitle(level) + '.</p>' +
          (tierChanged ? '<p>New armor unlocked.</p>' : '') +
          '<button class="btn primary" type="button" id="lu-ok" data-act="levelup-close">Onward</button>' +
        '</div>' +
      '</div>';
    $('#lu-ok').focus();
    Sfx.level();
  }

  function closeLevelUp() {
    var root = $('#levelup-root');
    if (!root.firstChild) return;
    root.innerHTML = '';
    var tab = $('#tab-' + ui.tab);
    if (tab) tab.focus();
  }

  // ------------------------------------------------------------ tooltip

  function showTip(el) {
    var tip = $('#tip');
    tip.textContent = '';
    var title = el.getAttribute('data-tip-title');
    if (title) {
      var b = document.createElement('b');
      b.textContent = title;
      tip.appendChild(b);
    }
    tip.appendChild(document.createTextNode(el.getAttribute('data-tip')));
    tip.hidden = false;
    var r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
    var x = Math.min(window.innerWidth - tr.width - 8, Math.max(8, r.left + r.width / 2 - tr.width / 2));
    var y = r.top - tr.height - 12;
    if (y < 8) y = r.bottom + 12;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { $('#tip').hidden = true; }

  // ------------------------------------------------------------ state changes

  function recompute() { summary = C.summarize(state, today); }

  /** Levels already reached don't get the level-up screen again. */
  function resetCelebrated() { celebrated = summary.hero.level; }

  /** Apply a change: save, re-render, and celebrate anything earned. */
  function commit(opts) {
    opts = opts || {};
    var before = summary.hero.level;
    state.updatedAt = Date.now();
    recompute();
    var fresh = C.claimBadges(state, summary, today);
    Store.save(state);
    render();
    var levelled = summary.hero.level > before && summary.hero.level > celebrated;
    if (levelled) {
      showLevelUp(summary.hero.level, C.heroTier(summary.hero.level) > C.heroTier(celebrated));
      celebrated = summary.hero.level;
    }
    if (fresh.length === 1) {
      toast('Badge earned', fresh[0].name + ': ' + fresh[0].desc, fresh[0].icon);
      if (!levelled) Sfx.badge();
    } else if (fresh.length > 1) {
      toast(fresh.length + ' badges earned', fresh.map(function (b) { return b.name; }).join(', '), 'trophy');
      if (!levelled) Sfx.badge();
    }
    if (opts.jump) jumpHero();
  }

  function setHabitCount(id, next, origin) {
    var h = habitById(id);
    if (!h) return;
    var key = ui.date;
    var prev = C.getCount(state, key, id);
    next = Math.max(0, Math.min(99, next));
    if (next === prev) return;
    var beforeDay = C.dayInfo(state, key);
    C.setCount(state, key, id, next);
    var afterDay = C.dayInfo(state, key);
    var gained = afterDay.xp - beforeDay.xp;
    var rect = origin ? origin.getBoundingClientRect() : null;
    var cleared = prev < h.target && next >= h.target;

    if (afterDay.perfect && !beforeDay.perfect) Sfx.perfect();
    else if (cleared) Sfx.clear();
    else if (gained < 0) Sfx.undo();
    else Sfx.tick();

    commit({ jump: cleared });

    if (rect) {
      if (gained) burst(rect, (gained > 0 ? '+' : '') + gained + ' XP', { minus: gained < 0, sparks: cleared });
      if (afterDay.perfect && !beforeDay.perfect) {
        burst(rect, 'Perfect day!', { lift: 34 });
        toast('Perfect day!', 'Every quest cleared. +' + C.PERFECT_BONUS + ' bonus XP and the chest is open.', 'star');
      }
    }
  }

  // ------------------------------------------------------------ scene

  var SCENE = (function () {
    var W = 64, out = [];
    function r(x, y, w, h, c) { out.push('<rect class="' + c + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"/>'); }
    r(0, 0, W, 12, 's1'); r(0, 12, W, 9, 's2'); r(0, 21, W, 9, 's3');
    for (var x = 0; x < W; x += 2) { r(x, 11, 1, 1, 's2'); r(x + 1, 20, 1, 1, 's3'); }

    out.push('<g class="night">');
    [[3, 3], [9, 8], [15, 2], [21, 6], [27, 3], [33, 9], [38, 1], [44, 5], [6, 15], [19, 13], [31, 16], [40, 12], [60, 9]].forEach(function (s) { r(s[0], s[1], 1, 1, 'st'); });
    r(52, 2, 3, 1, 'sn'); r(51, 3, 5, 3, 'sn'); r(52, 6, 3, 1, 'sn'); r(54, 3, 1, 1, 's2'); r(52, 5, 1, 1, 's2');
    out.push('</g><g class="day">');
    r(52, 2, 3, 1, 'sn'); r(51, 3, 5, 1, 'sn'); r(50, 4, 7, 3, 'sn'); r(51, 7, 5, 1, 'sn'); r(52, 8, 3, 1, 'sn');
    [[53, 0], [47, 5], [59, 5], [48, 1], [58, 1], [48, 9], [58, 9]].forEach(function (s) { r(s[0], s[1], 1, 1, 'sn'); });
    r(9, 5, 4, 1, 'st'); r(7, 6, 9, 1, 'st'); r(8, 7, 6, 1, 'st');
    r(27, 10, 3, 1, 'st'); r(25, 11, 8, 1, 'st');
    out.push('</g>');

    for (x = 0; x < W; x++) {
      var far = 23 + Math.round(2.5 * Math.sin(x / 7) + 1.2 * Math.sin(x / 3 + 1));
      r(x, far, 1, 30 - far, 'hf');
    }
    // A far-off castle with one lit window.
    r(6, 14, 5, 10, 'hf'); r(6, 13, 1, 1, 'hf'); r(8, 13, 1, 1, 'hf'); r(10, 13, 1, 1, 'hf');
    r(11, 17, 4, 7, 'hf'); r(11, 16, 1, 1, 'hf'); r(13, 16, 1, 1, 'hf');
    r(8, 17, 1, 2, 'sn');
    for (x = 0; x < W; x++) {
      var near = 27 + Math.round(1.4 * Math.sin(x / 5 + 2));
      r(x, near, 1, 30 - near, 'hn');
    }
    r(0, 30, W, 6, 'gd'); r(0, 30, W, 1, 'gr');
    [2, 7, 13, 23, 29, 36, 47, 55, 61].forEach(function (t) { r(t, 29, 1, 1, 'gr'); });
    [[4, 33], [12, 34], [20, 32], [33, 34], [39, 33], [50, 35], [58, 32]].forEach(function (p) { r(p[0], p[1], 2, 1, 'hn'); });
    return '<svg class="backdrop" viewBox="0 0 64 36" shape-rendering="crispEdges" aria-hidden="true">' + out.join('') + '</svg>';
  })();

  // ------------------------------------------------------------ render: hero

  function meter(label, value, frac, extraClass) {
    return '<div class="meter">' +
      '<div class="meter-label"><span>' + label + '</span><b>' + value + '</b></div>' +
      '<div class="bar ' + (extraClass || '') + '" role="progressbar" aria-label="' + label + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct(frac) + '"><i style="width:' + (frac * 100).toFixed(1) + '%"></i></div>' +
    '</div>';
  }

  function renderHero() {
    var h = summary.hero;
    var tier = C.heroTier(h.level);
    var todayInfo = summary.days[today];
    var chestOpen = !!(todayInfo && todayInfo.perfect);
    var attrs = C.STATS.map(function (s) {
      var lv = summary.stats[s.id];
      return '<li class="attr" style="--stat: var(--' + s.id + ')" title="' + s.name + ': ' + s.blurb + '">' +
        '<span class="tag">' + s.label + '</span>' +
        '<div class="bar slim" role="progressbar" aria-label="' + s.name + ' progress to next level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct(lv.into / lv.need) + '"><i style="width:' + (lv.into / lv.need * 100).toFixed(1) + '%"></i></div>' +
        '<span class="attr-lv">LV ' + lv.level + '</span>' +
      '</li>';
    }).join('');

    $('#hero-card').innerHTML =
      '<div class="scene inset" aria-hidden="true">' + SCENE +
        '<div class="actor hero-actor" id="hero-actor">' + S.hero(tier) + '</div>' +
        '<div class="actor chest-actor">' + S.chest(chestOpen) + '</div>' +
      '</div>' +
      '<div class="hero-id">' +
        '<h2 class="hero-name">' + esc(state.hero.name) + '<span class="hero-title">' + heroTitle(h.level) + '</span></h2>' +
        '<span class="lv-chip" aria-label="Level ' + h.level + '">LV ' + h.level + '</span>' +
      '</div>' +
      meter('XP to level ' + (h.level + 1), num(h.into) + ' / ' + num(h.need), h.into / h.need) +
      '<div class="streak-row">' +
        '<span>' + S.glyph('flame') + '<span><b>' + summary.activeStreak + '</b> day streak</span></span>' +
        '<span><span><b>' + num(summary.completions) + '</b> quests cleared</span></span>' +
      '</div>' +
      '<ul class="attrs" aria-label="Attributes">' + attrs + '</ul>' +
      '<p class="sync" id="sync" data-status="' + ui.sync + '">' + esc(syncText()) + '</p>';
  }

  function syncText() {
    if (ui.sync === 'error') return ui.syncDetail || 'Couldn\'t save to your account. Progress is kept in this browser.';
    if (ui.sync === 'saving') return 'Saving to your Claude account…';
    if (ui.sync === 'cloud') return 'Saved to your Claude account';
    return 'Saved in this browser';
  }

  // ------------------------------------------------------------ render: quests

  function pips(h, c) {
    if (h.target > 12) {
      return '<div class="bar slim"><i style="width:' + (C.fraction(h, c) * 100).toFixed(1) + '%"></i></div>';
    }
    var out = '';
    for (var i = 0; i < h.target; i++) out += '<i' + (i < c ? ' class="on"' : '') + '></i>';
    return '<div class="pips" aria-hidden="true">' + out + '</div>';
  }

  function questCard(h, key) {
    var c = C.getCount(state, key, h.id);
    var done = c >= h.target;
    var streak = summary.habits[h.id];
    var counter = h.target > 1;
    var name = esc(h.name);
    var ctrl = counter
      ? '<button class="btn icon small" type="button" data-act="dec" data-id="' + h.id + '" data-focus="dec-' + h.id + '" aria-label="One less for ' + name + '"' + (c === 0 ? ' disabled' : '') + '>' + S.glyph('minus') + '</button>' +
        '<span class="count" aria-live="polite">' + c + '/' + h.target + '</span>' +
        '<button class="btn icon small' + (done ? '' : ' primary') + '" type="button" data-act="inc" data-id="' + h.id + '" data-focus="inc-' + h.id + '" aria-label="One more for ' + name + '">' + S.glyph('plus') + '</button>'
      : '<button class="chk" type="button" role="checkbox" aria-checked="' + done + '" data-act="toggle" data-id="' + h.id + '" data-focus="tog-' + h.id + '" aria-label="' + name + '">' + S.glyph('check') + '</button>';

    return '<li class="quest' + (done ? ' done' : '') + (counter ? ' counter' : '') + '" style="--stat: var(--' + h.stat + ')">' +
      '<span class="slot inset">' + S.icon(h.icon) + '</span>' +
      '<div class="q-main">' +
        '<p class="q-name">' + name + '</p>' +
        '<div class="q-meta">' +
          '<span class="tag" title="' + STAT[h.stat].name + '">' + STAT[h.stat].label + '</span>' +
          '<span class="xp">' + h.xp + ' XP</span>' +
          (counter ? '<span>' + h.target + ' ' + esc(h.unit || 'times') + '</span>' : '') +
          (streak && streak.current ? '<span class="streak" title="Current streak">' + S.glyph('flame') + streak.current + '</span>' : '') +
          (done ? '<span class="chip good">Clear</span>' : '') +
          '<button class="meta-edit" type="button" data-act="edit" data-id="' + h.id + '" data-focus="edit-' + h.id + '" aria-label="Edit ' + name + '">' + S.glyph('edit') + 'Edit</button>' +
        '</div>' +
        (counter ? pips(h, c) : '') +
      '</div>' +
      '<div class="q-ctrl">' + ctrl + '</div>' +
    '</li>';
  }

  function todoItem(t) {
    var title = esc(t.title);
    var carried = !t.doneAt && t.createdAt < ui.date;
    return '<li class="todo' + (t.doneAt ? ' done' : '') + '">' +
      '<button class="chk small" type="button" role="checkbox" aria-checked="' + !!t.doneAt + '" data-act="todo-toggle" data-id="' + t.id + '" data-focus="todo-' + t.id + '" aria-label="' + title + '">' + S.glyph('check') + '</button>' +
      '<span class="todo-title">' + title + (carried ? '<span class="chip">From ' + f('short', t.createdAt) + '</span>' : '') + '</span>' +
      (t.doneAt
        ? '<span class="chip gold">+' + C.SIDE_XP + ' XP</span>'
        : '<button class="btn icon small ghost" type="button" data-act="todo-del" data-id="' + t.id + '" aria-label="Delete ' + title + '">' + S.glyph('close') + '</button>') +
    '</li>';
  }

  function renderQuests() {
    var key = ui.date;
    var isToday = key === today;
    var info = dayOf(key);
    var due = [], rest = [];
    activeHabits().forEach(function (h) {
      if (C.isScheduled(h, key)) due.push(h);
      else if (C.isActive(h, key)) rest.push(h);
    });
    var todos = C.todosFor(state, key, today);
    var canPrev = key > state.hero.since;
    var when = isToday ? 'today' : 'that day';

    return '' +
      '<div class="day-nav">' +
        '<button class="btn icon" type="button" data-act="day-prev" data-focus="day-prev" aria-label="Previous day"' + (canPrev ? '' : ' disabled') + '>' + S.glyph('left') + '</button>' +
        '<div class="day-title">' +
          '<h2>' + (isToday ? 'Today' : key === C.addDays(today, -1) ? 'Yesterday' : f('weekday', key)) + '</h2>' +
          '<p>' + f('long', key) + (isToday ? '' : ' <button class="btn small ghost" type="button" data-act="day-today">Back to today</button>') + '</p>' +
        '</div>' +
        '<button class="btn icon" type="button" data-act="day-next" data-focus="day-next" aria-label="Next day"' + (isToday ? ' disabled' : '') + '>' + S.glyph('right') + '</button>' +
      '</div>' +

      '<div class="day-progress">' +
        '<div class="bar' + (info.perfect ? ' good' : '') + '" role="progressbar" aria-label="Daily quests done ' + when + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct(info.ratio) + '"><i style="width:' + (info.ratio * 100).toFixed(1) + '%"></i></div>' +
        '<div class="day-meta">' +
          '<span><b>' + info.done + ' of ' + info.scheduled + '</b> daily quests cleared' + (info.perfect ? ' <span class="chip gold">Perfect day</span>' : '') + '</span>' +
          '<span><b>+' + num(info.xp) + ' XP</b> ' + when + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="sec-head"><h2 class="sec-title">Daily quests</h2><p class="sec-note">' + (isToday ? 'Tick them off as you go' : 'Fix up a past day') + '</p></div>' +
      (due.length
        ? '<ul class="quest-list">' + due.map(function (h) { return questCard(h, key); }).join('') + '</ul>'
        : '<p class="empty">' + (state.habits.length ? 'Nothing is due ' + when + '. A rest day still counts toward your streaks.' : 'Your quest log is empty. Add a habit to start earning XP.') + '</p>') +
      (rest.length
        ? '<details class="rest inset"' + (ui.restOpen ? ' open' : '') + ' id="rest-details"><summary>Not due ' + when + ': <b>' + rest.length + '</b> (bonus XP, no streak)</summary>' +
            '<ul class="quest-list">' + rest.map(function (h) { return questCard(h, key); }).join('') + '</ul></details>'
        : '') +
      '<div class="quest-tools"><button class="btn primary" type="button" data-act="new-quest" data-focus="new-quest">' + S.glyph('plus') + 'New quest</button></div>' +

      '<div class="sec-head"><h2 class="sec-title">Side quests</h2><p class="sec-note">One-off tasks, ' + C.SIDE_XP + ' XP each</p></div>' +
      '<form class="todo-form" id="todo-form" autocomplete="off">' +
        '<label class="sr-only" for="todo-input">New side quest</label>' +
        '<input class="field" id="todo-input" maxlength="80" placeholder="Return the library books" data-focus="todo-input">' +
        '<button class="btn" type="submit">Add</button>' +
      '</form>' +
      (todos.length
        ? '<ul class="todo-list">' + todos.map(todoItem).join('') + '</ul>'
        : '<p class="empty">No side quests ' + (isToday ? 'yet' : 'on this day') + '. Unfinished ones carry over to today until you clear them.</p>');
  }

  // ------------------------------------------------------------ render: stats

  function delta(cur, prev, unit, hasPrev) {
    if (!hasPrev) return '<span class="tile-delta">No earlier data yet</span>';
    var d = cur - prev;
    if (d === 0) return '<span class="tile-delta">Same as the previous ' + ui.range + ' days</span>';
    return '<span class="tile-delta"><span class="' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '+' : '−') + num(Math.abs(d)) + unit + '</span> vs previous ' + ui.range + ' days</span>';
  }

  function tile(label, value, deltaHtml) {
    return '<div class="tile"><span class="tile-label">' + label + '</span><span class="tile-value">' + value + '</span>' + deltaHtml + '</div>';
  }

  function heatLevel(info) {
    if (!info) return 0;
    if (info.scheduled === 0 || info.ratio === 0) return info.completions > 0 ? 1 : 0;
    if (info.perfect) return 4;
    if (info.ratio < 0.34) return 1;
    if (info.ratio < 0.67) return 2;
    return 3;
  }

  function dayTip(info) {
    if (!info) return 'Before your adventure began';
    if (info.scheduled === 0) return info.completions ? 'Rest day · ' + info.completions + ' bonus clears · +' + info.xp + ' XP' : 'Rest day: nothing due';
    return pct(info.ratio) + '% done · ' + info.done + ' of ' + info.scheduled + ' quests · +' + info.xp + ' XP';
  }

  function columnChart(rows, weekly) {
    var n = rows.length;
    var cols = '', labels = '';
    rows.forEach(function (r, i) {
      var last = i === n - 1;
      var rest = r.scheduled === 0;
      var p = pct(r.ratio);
      var key = weekly ? r.end : r.key;
      var title = weekly ? 'Week of ' + f('short', r.key) : f('long', r.key);
      var tip = weekly
        ? (rest ? 'Nothing was due' : p + '% of quests done · +' + num(r.xp) + ' XP')
        : dayTip(summary.days[r.key]);
      var canGo = key >= state.hero.since;
      cols += '<button class="col' + (rest ? ' rest' : '') + (last ? ' is-today' : '') + '" type="button" tabindex="-1"' +
        (canGo ? ' data-act="goto-day" data-key="' + key + '"' : '') +
        ' data-tip-title="' + esc(title) + '" data-tip="' + esc(tip) + '" aria-label="' + esc(title + ': ' + tip) + '">' +
        '<i style="height:' + (rest ? 0 : p) + '%"></i>' +
        (last && !rest ? '<span class="val" style="bottom:' + p + '%">' + p + '%</span>' : '') +
      '</button>';

      var text = '';
      if (weekly) { if ((n - 1 - i) % 3 === 0) text = f('short', r.key); }
      else if (n <= 7) text = DAY_NARROW[C.weekday(r.key)];
      else if ((n - 1 - i) % 5 === 0) text = String(C.fromKey(r.key).getDate());
      labels += '<span' + (last ? ' class="today"' : '') + '>' + esc(text) + '</span>';
    });

    return '<div class="chart" style="--n:' + n + '">' +
      '<div class="y-axis" aria-hidden="true"><span style="bottom:100%">100%</span><span style="bottom:50%">50%</span><span style="bottom:0">0%</span></div>' +
      '<div class="plot">' +
        '<div class="grid" style="bottom:100%"></div><div class="grid" style="bottom:50%"></div><div class="grid base" style="bottom:0"></div>' +
        '<div class="cols">' + cols + '</div>' +
      '</div>' +
      '<div class="x-axis" aria-hidden="true">' + labels + '</div>' +
    '</div>';
  }

  function chartTable(rows, weekly) {
    var head = weekly
      ? '<tr><th>Week of</th><th class="num">Done</th><th class="num">XP</th></tr>'
      : '<tr><th>Day</th><th class="num">Cleared</th><th class="num">Done</th><th class="num">XP</th></tr>';
    var body = rows.slice().reverse().map(function (r) {
      var p = r.scheduled ? pct(r.ratio) + '%' : 'Rest';
      return weekly
        ? '<tr><td>' + f('short', r.key) + '</td><td class="num">' + p + '</td><td class="num">' + num(r.xp) + '</td></tr>'
        : '<tr><td>' + f('long', r.key) + '</td><td class="num">' + r.done + ' / ' + r.scheduled + '</td><td class="num">' + p + '</td><td class="num">' + num(r.xp) + '</td></tr>';
    }).join('');
    return '<details class="table-toggle"><summary>Show as a table</summary><div class="table-wrap"><table class="data"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></details>';
  }

  function heatmap() {
    var start = C.addDays(today, -C.weekday(today) - 7 * (HEAT_WEEKS - 1));
    var focusKey = ui.heatKey && ui.heatKey >= start && ui.heatKey <= today ? ui.heatKey : today;
    var cells = '', months = '', lastMonth = -1;
    for (var w = 0; w < HEAT_WEEKS; w++) {
      var weekStart = C.addDays(start, w * 7);
      var m = C.fromKey(weekStart).getMonth();
      if (m !== lastMonth && (w === 0 || C.fromKey(weekStart).getDate() <= 7)) {
        if (w < HEAT_WEEKS - 1) months += '<span style="left:calc((var(--cell) + var(--gap)) * ' + w + ')">' + f('month', weekStart) + '</span>';
        lastMonth = m;
      }
      for (var d = 0; d < 7; d++) {
        var key = C.addDays(weekStart, d);
        if (key > today) { cells += '<span class="cell future"></span>'; continue; }
        var info = key >= state.hero.since ? summary.days[key] : null;
        var tip = dayTip(info);
        var label = f('long', key);
        cells += '<button type="button" class="cell' + (key === today ? ' today' : '') + '" data-l="' + heatLevel(info) + '"' +
          ' tabindex="' + (key === focusKey ? 0 : -1) + '" data-key="' + key + '"' + (info ? ' data-act="goto-day"' : '') +
          ' data-tip-title="' + esc(label) + '" data-tip="' + esc(tip) + '" aria-label="' + esc(label + ': ' + tip) + '"></button>';
      }
    }
    var dayLabels = '';
    for (var i = 0; i < 7; i++) dayLabels += '<span>' + (i % 2 ? esc(DAY_NARROW[i]) : '') + '</span>';
    return '<div class="heat-wrap"><div class="heat">' +
      '<span></span><div class="heat-months" aria-hidden="true">' + months + '</div>' +
      '<div class="heat-days" aria-hidden="true">' + dayLabels + '</div>' +
      '<div class="heat-grid" id="heat-grid" role="group" aria-label="Daily completion for the last ' + HEAT_WEEKS + ' weeks. Use arrow keys to move, Enter to open a day.">' + cells + '</div>' +
    '</div></div>' +
    '<div class="heat-legend" aria-hidden="true">Less <span class="cell" data-l="0"></span><span class="cell" data-l="1"></span><span class="cell" data-l="2"></span><span class="cell" data-l="3"></span><span class="cell" data-l="4"></span> Perfect</div>';
  }

  function renderStats() {
    var days = ui.range;
    var rep = C.rangeReport(state, summary, today, days);
    var prevEnd = C.addDays(today, -days);
    var hasPrev = prevEnd >= state.hero.since;
    var prev = hasPrev ? C.rangeReport(state, summary, prevEnd, days) : null;
    var t = rep.totals;
    var weekly = days === 90;
    var rows = weekly ? C.weeklyBuckets(rep.rows) : rep.rows;

    var filters = RANGES.map(function (r) {
      return '<button class="btn small' + (r === days ? ' primary' : '') + '" type="button" data-act="range" data-range="' + r + '" aria-pressed="' + (r === days) + '">' + r + ' days</button>';
    }).join('');

    var maxStat = Math.max(1, Math.max.apply(null, C.STAT_IDS.map(function (id) { return t.byStat[id]; })));
    var hbars = C.STATS.map(function (s) {
      var v = t.byStat[s.id];
      return '<li class="hbar" style="--stat: var(--' + s.id + ')">' +
        '<span class="tag">' + s.label + ' <span class="hbar-name">' + s.name + '</span></span>' +
        '<div class="hbar-track"><div class="hbar-fill" style="width:calc((100% - 74px) * ' + (v / maxStat).toFixed(3) + ')"></div><span class="hbar-val">' + num(v) + ' XP</span></div>' +
      '</li>';
    }).join('');

    var recRows = state.habits.map(function (h, i) {
      var r = rep.habits[i];
      if (h.archivedAt && !r.due) return '';
      var st = summary.habits[h.id];
      return '<tr><td><span class="rec-quest">' + S.icon(h.icon) + '<span>' + esc(h.name) + (h.archivedAt ? ' <span class="chip">Retired</span>' : '') + '</span></span></td>' +
        '<td class="num">' + (h.archivedAt ? '–' : st.current) + '</td>' +
        '<td class="num">' + st.best + '</td>' +
        '<td class="num">' + (r.due
          ? '<span class="rate"><span class="bar slim good" aria-hidden="true"><i style="width:' + (r.rate * 100).toFixed(1) + '%"></i></span>' + pct(r.rate) + '%</span>'
          : 'Not due') + '</td></tr>';
    }).join('');

    var adventureDays = C.daysBetween(state.hero.since, today) + 1;

    return '' +
      (summary.completions === 0 ? '<p class="empty">Clear your first quest and this page starts filling in: charts, streaks and records.</p>' : '') +
      '<div class="filters" role="group" aria-label="Time range">' + filters + '</div>' +
      '<div class="tiles">' +
        tile('Completion', pct(t.rate) + '%', delta(pct(t.rate), prev ? pct(prev.totals.rate) : 0, ' pts', hasPrev && prev.totals.scheduled > 0)) +
        tile('Quests cleared', num(t.completions), delta(t.completions, prev ? prev.totals.completions : 0, '', hasPrev)) +
        tile('Perfect days', num(t.perfect) + '<span style="font-size:.55em;color:var(--ink-3)"> / ' + days + '</span>', delta(t.perfect, prev ? prev.totals.perfect : 0, '', hasPrev)) +
        tile('XP earned', num(t.xp), delta(t.xp, prev ? prev.totals.xp : 0, '', hasPrev)) +
      '</div>' +

      '<section class="card"><div class="card-head"><h3>' + (weekly ? 'Weekly' : 'Daily') + ' completion</h3><p>Share of due quests finished. Tap a bar to open that ' + (weekly ? 'week' : 'day') + '.</p></div>' +
        columnChart(rows, weekly) + chartTable(rows, weekly) + '</section>' +

      '<section class="card"><div class="card-head"><h3>Quest log</h3><p>Last ' + HEAT_WEEKS + ' weeks</p></div>' + heatmap() + '</section>' +

      '<section class="card"><div class="card-head"><h3>XP by attribute</h3><p>Last ' + days + ' days</p></div><ul class="hbars">' + hbars + '</ul></section>' +

      '<section class="card"><div class="card-head"><h3>Quest records</h3><p>Streaks count days a quest was due</p></div>' +
        '<div class="table-wrap"><table class="data"><thead><tr><th>Quest</th><th class="num">Streak</th><th class="num">Best</th><th class="num">Done, ' + days + 'd</th></tr></thead><tbody>' + recRows + '</tbody></table></div></section>' +

      '<section class="card"><div class="card-head"><h3>Lifetime</h3><p>Since ' + f('short', state.hero.since) + '</p></div>' +
        '<dl class="lifetime">' +
          '<div><dt>Total XP</dt><dd>' + num(summary.totalXP) + '</dd></div>' +
          '<div><dt>Quests cleared</dt><dd>' + num(summary.completions) + '</dd></div>' +
          '<div><dt>Perfect days</dt><dd>' + num(summary.perfectTotal) + '</dd></div>' +
          '<div><dt>Best perfect run</dt><dd>' + summary.perfectBest + 'd</dd></div>' +
          '<div><dt>Longest streak</dt><dd>' + summary.bestStreakAny + 'd</dd></div>' +
          '<div><dt>Side quests done</dt><dd>' + num(summary.sideTotal) + '</dd></div>' +
          '<div><dt>Badges</dt><dd>' + summary.badges.filter(function (b) { return b.earned; }).length + ' / ' + summary.badges.length + '</dd></div>' +
          '<div><dt>Days adventuring</dt><dd>' + num(adventureDays) + '</dd></div>' +
        '</dl></section>';
  }

  // ------------------------------------------------------------ render: badges

  function renderBadges() {
    var earned = summary.badges.filter(function (b) { return b.earned; }).length;
    var items = summary.badges.map(function (b) {
      return '<li class="badge' + (b.earned ? ' earned' : '') + '">' +
        '<span class="medal">' + S.icon(b.icon) + '</span>' +
        '<div><h3>' + b.name + '</h3><p>' + b.desc + '</p>' +
          (b.earned
            ? '<span class="got">' + (b.earnedAt ? 'Earned ' + f('short', b.earnedAt) : 'Earned') + '</span>'
            : '<div class="prog"><div class="bar slim" aria-hidden="true"><i style="width:' + (b.value / b.goal * 100).toFixed(1) + '%"></i></div><span>' + b.value + ' / ' + b.goal + '</span></div>') +
        '</div></li>';
    }).join('');
    return '<div class="sec-head"><h2 class="sec-title">Badges</h2><p class="sec-note">' + earned + ' of ' + summary.badges.length + ' earned</p></div>' +
      '<ul class="badge-grid">' + items + '</ul>';
  }

  // ------------------------------------------------------------ render: setup

  function manageRow(h, i, list) {
    var st = STAT[h.stat];
    var detail = st.label + ' · ' + h.xp + ' XP · ' + daysLabel(h.days) + (h.target > 1 ? ' · ' + h.target + ' ' + (h.unit || 'times') : '');
    var name = esc(h.name);
    var tools = h.archivedAt
      ? '<button class="btn small" type="button" data-act="restore" data-id="' + h.id + '">Restore</button>'
      : '<button class="btn icon small ghost" type="button" data-act="move-up" data-id="' + h.id + '" data-focus="up-' + h.id + '" aria-label="Move ' + name + ' up"' + (i === 0 ? ' disabled' : '') + '>' + S.glyph('up') + '</button>' +
        '<button class="btn icon small ghost" type="button" data-act="move-down" data-id="' + h.id + '" data-focus="down-' + h.id + '" aria-label="Move ' + name + ' down"' + (i === list.length - 1 ? ' disabled' : '') + '>' + S.glyph('down') + '</button>' +
        '<button class="btn icon small ghost" type="button" data-act="edit" data-id="' + h.id + '" aria-label="Edit ' + name + '">' + S.glyph('edit') + '</button>';
    return '<li class="' + (h.archivedAt ? 'retired' : '') + '" style="--stat: var(--' + h.stat + ')">' + S.icon(h.icon) +
      '<span class="m-name">' + name + '<small>' + esc(detail) + '</small></span><span class="m-tools">' + tools + '</span></li>';
  }

  function renderSetup() {
    var active = activeHabits();
    var retired = state.habits.filter(function (h) { return h.archivedAt; });
    var cloud = Store.hasCloud();
    var imp = ui.pendingImport;

    return '' +
      '<section class="setup-block"><div class="sec-head"><h2 class="sec-title">Hero</h2></div>' +
        '<form class="inline-form" id="hero-form" autocomplete="off">' +
          '<label class="sr-only" for="hero-name">Hero name</label>' +
          '<input class="field" id="hero-name" maxlength="16" value="' + esc(state.hero.name) + '">' +
          '<button class="btn" type="submit">Rename</button>' +
        '</form></section>' +

      '<section class="setup-block"><div class="sec-head"><h2 class="sec-title">Daily quests</h2><p class="sec-note">This order is your quest list order</p></div>' +
        (active.length ? '<ul class="manage">' + active.map(manageRow).join('') + '</ul>' : '<p class="empty">No daily quests yet.</p>') +
        '<div class="row"><button class="btn primary" type="button" data-act="new-quest">' + S.glyph('plus') + 'New quest</button></div>' +
        (retired.length
          ? '<p class="help">Retired quests keep their history. Restore one to bring it back.</p><ul class="manage">' + retired.map(manageRow).join('') + '</ul>'
          : '') +
      '</section>' +

      '<section class="setup-block"><div class="sec-head"><h2 class="sec-title">Sound</h2></div>' +
        '<div class="row"><button class="btn" type="button" data-act="sound" aria-pressed="' + state.settings.sound + '">' + S.glyph(state.settings.sound ? 'sound' : 'mute') + (state.settings.sound ? 'Sound on' : 'Sound off') + '</button></div>' +
      '</section>' +

      '<section class="setup-block"><div class="sec-head"><h2 class="sec-title">Save data</h2></div>' +
        '<p class="help">' + (cloud
          ? 'Progress saves to your Claude account, so it follows you to any device where you open this page. Only you can see it.'
          : 'Progress saves in this browser only. Export a backup now and then so you never lose your hero.') + '</p>' +
        '<div class="row">' +
          '<button class="btn" type="button" data-act="export">Export backup</button>' +
          '<button class="btn" type="button" data-act="import">Import backup</button>' +
        '</div>' +
        (imp
          ? '<div class="confirm" role="alert"><p>Replace your current hero with <b>' + esc(imp.hero.name) + '</b> from this backup? It has ' + imp.habits.length + ' quests and ' + Object.keys(imp.log).length + ' logged days. Your current progress will be overwritten.</p>' +
              '<div class="row"><button class="btn danger" type="button" data-act="import-confirm">Replace my hero</button><button class="btn ghost" type="button" data-act="import-cancel">Cancel</button></div></div>'
          : '') +
      '</section>' +

      '<section class="setup-block"><div class="sec-head"><h2 class="sec-title">Start over</h2></div>' +
        (ui.confirmReset
          ? '<div class="confirm" role="alert"><p>This erases your hero, quests, badges and history. It can\'t be undone.</p>' +
              '<div class="row"><button class="btn danger" type="button" data-act="reset-confirm" id="reset-confirm">Erase everything</button><button class="btn ghost" type="button" data-act="reset-cancel">Keep my hero</button></div></div>'
          : '<p class="help">Erase everything and begin a new adventure with the starter quests.</p><div class="row"><button class="btn danger" type="button" data-act="reset">Reset everything</button></div>') +
      '</section>';
  }

  // ------------------------------------------------------------ render: shell

  function renderTabs() {
    $$('.tab').forEach(function (t) {
      var on = t.getAttribute('data-tab') === ui.tab;
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
    });
    $('#panel').setAttribute('aria-labelledby', 'tab-' + ui.tab);
  }

  function renderPanel() {
    var html = ui.tab === 'stats' ? renderStats()
      : ui.tab === 'badges' ? renderBadges()
      : ui.tab === 'setup' ? renderSetup()
      : renderQuests();
    var draft = $('#todo-input') ? $('#todo-input').value : '';
    $('#panel').innerHTML = html;
    if (draft && $('#todo-input')) $('#todo-input').value = draft;
    // Keep the newest weeks of the quest log in view on narrow screens.
    var heat = $('.heat-wrap');
    if (heat) heat.scrollLeft = heat.scrollWidth;
  }

  function renderSoundButton() {
    var b = $('#btn-sound');
    b.setAttribute('aria-pressed', state.settings.sound);
    b.setAttribute('aria-label', state.settings.sound ? 'Sound effects on' : 'Sound effects off');
    $('#sound-glyph').innerHTML = S.glyph(state.settings.sound ? 'sound' : 'mute');
  }

  function render() {
    var active = document.activeElement;
    var focusKey = active && active.getAttribute && active.getAttribute('data-focus');
    hideTip();
    renderHero();
    renderTabs();
    renderPanel();
    renderSoundButton();
    if (focusKey) {
      var again = $('[data-focus="' + focusKey + '"]');
      if (again && !again.disabled) again.focus();
    }
  }

  // ------------------------------------------------------------ quest dialog

  function buildDialogOptions() {
    $('#q-icons').innerHTML = C.ICONS.map(function (name) {
      return '<label class="opt icon-opt" title="' + name + '"><input type="radio" name="icon" id="q-icon-' + name + '" value="' + name + '"><span>' + S.icon(name) + '<span class="sr-only">' + name + '</span></span></label>';
    }).join('');
    $('#q-stats').innerHTML = C.STATS.map(function (s) {
      return '<label class="opt stat-opt" style="--stat: var(--' + s.id + ')" title="' + s.blurb + '"><input type="radio" name="stat" id="q-stat-' + s.id + '" value="' + s.id + '"><span>' + s.label + ' · ' + s.name + '</span></label>';
    }).join('');
    $('#q-diffs').innerHTML = C.DIFFICULTY.map(function (d) {
      return '<label class="opt"><input type="radio" name="xp" id="q-xp-' + d.id + '" value="' + d.xp + '"><span>' + d.label + ' · ' + d.xp + ' XP</span></label>';
    }).join('');
    $('#q-days').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (d) {
      return '<label class="opt day-opt" title="' + DAY_SHORT[d] + '"><input type="checkbox" name="days" id="q-day-' + d + '" value="' + d + '"><span>' + esc(DAY_NARROW[d]) + '</span></label>';
    }).join('');
  }

  function setDays(list) {
    $$('#q-days input').forEach(function (i) { i.checked = list.indexOf(+i.value) !== -1; });
  }

  function syncGoalFields() {
    $('#q-count-fields').hidden = !$('#q-goal-count').checked;
  }

  function openQuestDialog(id) {
    var h = id ? habitById(id) : null;
    ui.editing = h ? h.id : 'new';
    $('#q-heading').textContent = h ? 'Edit quest' : 'New quest';
    $('#q-submit').textContent = h ? 'Save quest' : 'Add quest';
    $('#q-retire').hidden = !h;
    $('#q-retire').textContent = h && C.hasHistory(state, h.id) ? 'Retire quest' : 'Delete quest';
    $('#q-error').hidden = true;
    $('#q-name').value = h ? h.name : '';
    var icon = h ? h.icon : 'star';
    $('#q-icon-' + icon).checked = true;
    $('#q-stat-' + (h ? h.stat : 'str')).checked = true;
    var xp = h ? h.xp : 20;
    var diff = C.DIFFICULTY.reduce(function (best, d) { return Math.abs(d.xp - xp) < Math.abs(best.xp - xp) ? d : best; });
    $('#q-xp-' + diff.id).checked = true;
    var counter = h && h.target > 1;
    $('#q-goal-once').checked = !counter;
    $('#q-goal-count').checked = !!counter;
    $('#q-target').value = counter ? h.target : 8;
    $('#q-unit').value = counter ? h.unit : '';
    syncGoalFields();
    setDays(h ? h.days : [0, 1, 2, 3, 4, 5, 6]);

    var note = $('#q-history-note');
    if (h && C.hasHistory(state, h.id)) {
      if (!note) {
        note = document.createElement('p');
        note.id = 'q-history-note';
        note.className = 'help';
        $('#q-error').before(note);
      }
      note.textContent = 'Changes to the goal or due days also apply when scoring past days.';
      note.hidden = false;
    } else if (note) {
      note.hidden = true;
    }

    var dlg = $('#quest-dialog');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    $('#q-name').focus();
  }

  function closeQuestDialog() {
    var dlg = $('#quest-dialog');
    if (dlg.open) {
      if (typeof dlg.close === 'function') dlg.close();
      else dlg.removeAttribute('open');
    }
    ui.editing = null;
  }

  function submitQuest(e) {
    e.preventDefault();
    var err = $('#q-error');
    var name = $('#q-name').value.replace(/\s+/g, ' ').trim();
    var days = $$('#q-days input:checked').map(function (i) { return +i.value; }).sort();
    var counter = $('#q-goal-count').checked;
    var target = counter ? Math.round(+$('#q-target').value) : 1;
    var problem = !name ? 'Give your quest a name.'
      : !days.length ? 'Pick at least one day the quest is due.'
      : counter && !(target >= 2 && target <= 99) ? 'Set a daily count between 2 and 99.'
      : '';
    if (problem) {
      err.textContent = problem;
      err.hidden = false;
      return;
    }
    var data = {
      name: name.slice(0, 60),
      icon: ($('#q-icons input:checked') || {}).value || 'star',
      stat: ($('#q-stats input:checked') || {}).value || 'str',
      xp: +(($('#q-diffs input:checked') || {}).value || 20),
      target: target,
      unit: counter ? $('#q-unit').value.trim().slice(0, 12) : '',
      days: days
    };
    var isNew = ui.editing === 'new';
    if (isNew) {
      state.habits.push(Object.assign({ id: C.makeId('h'), createdAt: today, archivedAt: null }, data));
    } else {
      var h = habitById(ui.editing);
      if (h) Object.assign(h, data);
    }
    closeQuestDialog();
    Sfx.add();
    commit();
    toast(isNew ? 'Quest added' : 'Quest saved', data.name, data.icon);
  }

  // ------------------------------------------------------------ actions

  function goToDay(key, scroll) {
    if (!key || key > today || key < state.hero.since) return;
    ui.date = key;
    ui.tab = 'quests';
    writeUi();
    render();
    if (scroll) $('#panel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function moveHabit(id, dir) {
    var active = activeHabits();
    var i = active.findIndex(function (h) { return h.id === id; });
    var j = i + dir;
    if (i === -1 || j < 0 || j >= active.length) return;
    var a = state.habits.indexOf(active[i]), b = state.habits.indexOf(active[j]);
    var tmp = state.habits[a];
    state.habits[a] = state.habits[b];
    state.habits[b] = tmp;
    commit();
  }

  function exportBackup() {
    var json = JSON.stringify(state, null, 2);
    var filename = 'habit-quest-' + today + '.json';
    function copyInstead() {
      if (!navigator.clipboard) { toast('Export unavailable', 'This view blocks downloads and the clipboard.'); return; }
      navigator.clipboard.writeText(json).then(
        function () { toast('Backup copied', 'Paste it into a .json file to keep it safe.', 'scroll'); },
        function () { toast('Export unavailable', 'This view blocks downloads and the clipboard.'); }
      );
    }
    if (window.claude && typeof window.claude.use === 'function') {
      window.claude.use('downloads').then(function (dl) {
        if (!dl) return copyInstead();
        dl.save({ filename: filename, data: json }).then(
          function () { toast('Backup saved', filename, 'scroll'); },
          function (e) { if (!e || e.code !== 'declined') copyInstead(); }
        );
      });
      return;
    }
    var url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    toast('Backup saved', filename, 'scroll');
  }

  function readImport(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var raw = JSON.parse(reader.result);
        if (!raw || !Array.isArray(raw.habits)) throw new Error('not a backup');
        ui.pendingImport = C.normalizeState(raw, today);
        render();
      } catch (e) {
        toast('Import failed', 'That file isn\'t a Habit Quest backup. Choose a .json file made with Export backup.');
      }
    };
    reader.readAsText(file);
  }

  function replaceState(next, message) {
    state = next;
    state.updatedAt = Date.now();
    C.pruneTodos(state, today);
    ui.date = today;
    ui.pendingImport = null;
    ui.confirmReset = false;
    recompute();
    resetCelebrated();
    C.claimBadges(state, summary, today);
    Store.save(state);
    render();
    toast(message[0], message[1], 'potion');
  }

  function handleAction(el, e) {
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    switch (act) {
      case 'tab':
        ui.tab = el.getAttribute('data-tab');
        ui.confirmReset = false;
        writeUi();
        render();
        break;
      case 'day-prev': goToDay(C.addDays(ui.date, -1)); break;
      case 'day-next': goToDay(C.addDays(ui.date, 1)); break;
      case 'day-today': goToDay(today); break;
      case 'goto-day':
        ui.heatKey = el.getAttribute('data-key');
        goToDay(el.getAttribute('data-key'), true);
        break;
      case 'toggle': {
        var h = habitById(id);
        if (h) setHabitCount(id, C.getCount(state, ui.date, id) >= h.target ? 0 : h.target, el);
        break;
      }
      case 'inc': setHabitCount(id, C.getCount(state, ui.date, id) + 1, el); break;
      case 'dec': setHabitCount(id, C.getCount(state, ui.date, id) - 1, el); break;
      case 'edit': openQuestDialog(id); break;
      case 'new-quest': openQuestDialog(null); break;
      case 'dialog-cancel': closeQuestDialog(); break;
      case 'retire-from-dialog': {
        var hid = ui.editing, habit = habitById(hid);
        closeQuestDialog();
        var result = C.retireHabit(state, hid, today);
        commit();
        toast(result === 'retired' ? 'Quest retired' : 'Quest deleted',
          result === 'retired' ? habit.name + ' keeps its history. Restore it from Setup.' : habit.name, habit.icon);
        break;
      }
      case 'days-all': setDays([0, 1, 2, 3, 4, 5, 6]); break;
      case 'days-weekdays': setDays([1, 2, 3, 4, 5]); break;
      case 'days-weekends': setDays([0, 6]); break;
      case 'todo-toggle': {
        var rect = el.getBoundingClientRect();
        var t = C.toggleTodo(state, id, ui.date);
        if (!t) break;
        if (t.doneAt) Sfx.clear(); else Sfx.undo();
        commit({ jump: !!t.doneAt });
        burst(rect, (t.doneAt ? '+' : '-') + C.SIDE_XP + ' XP', { minus: !t.doneAt, sparks: !!t.doneAt });
        break;
      }
      case 'todo-del':
        if (C.removeTodo(state, id)) { commit(); var inp = $('#todo-input'); if (inp) inp.focus(); }
        break;
      case 'range':
        ui.range = +el.getAttribute('data-range');
        writeUi();
        render();
        break;
      case 'move-up': moveHabit(id, -1); break;
      case 'move-down': moveHabit(id, 1); break;
      case 'restore':
        C.restoreHabit(state, id);
        commit();
        break;
      case 'sound':
        state.settings.sound = !state.settings.sound;
        state.updatedAt = Date.now();
        Store.save(state);
        render();
        Sfx.tick();
        break;
      case 'export': exportBackup(); break;
      case 'import': $('#import-file').click(); break;
      case 'import-confirm':
        if (ui.pendingImport) replaceState(ui.pendingImport, ['Backup restored', 'Welcome back, ' + ui.pendingImport.hero.name + '.']);
        break;
      case 'import-cancel': ui.pendingImport = null; render(); break;
      case 'reset': ui.confirmReset = true; render(); $('#reset-confirm').focus(); break;
      case 'reset-cancel': ui.confirmReset = false; render(); break;
      case 'reset-confirm':
        replaceState(C.createState(today), ['New adventure', 'A fresh hero sets out with the starter quests.']);
        break;
      case 'levelup-close':
        if (e.target === el || el.id === 'lu-ok') closeLevelUp();
        break;
    }
  }

  // ------------------------------------------------------------ events

  function onHeatKey(e) {
    var cells = $$('#heat-grid button.cell');
    var i = cells.indexOf(document.activeElement);
    if (i === -1) return;
    var step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 7, ArrowLeft: -7 }[e.key];
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (cells[i].hasAttribute('data-act')) handleAction(cells[i], e);
      return;
    }
    if (!step) return;
    e.preventDefault();
    // Cells are laid out week by week; future days are spans, so map by key.
    var key = C.addDays(cells[i].getAttribute('data-key'), step);
    var next = cells.find(function (c) { return c.getAttribute('data-key') === key; });
    if (!next) return;
    cells[i].tabIndex = -1;
    next.tabIndex = 0;
    ui.heatKey = key;
    next.focus();
  }

  function onTabKey(e) {
    var tabs = $$('.tab');
    var i = tabs.indexOf(document.activeElement);
    if (i === -1) return;
    var j = e.key === 'ArrowRight' ? (i + 1) % tabs.length
      : e.key === 'ArrowLeft' ? (i + tabs.length - 1) % tabs.length
      : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (j === -1) return;
    e.preventDefault();
    tabs[j].focus();
    handleAction(tabs[j], e);
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      handleAction(el, e);
    });

    document.addEventListener('submit', function (e) {
      if (e.target.id === 'todo-form') {
        e.preventDefault();
        var input = $('#todo-input');
        var t = C.addTodo(state, input.value, ui.date);
        if (!t) { input.focus(); return; }
        input.value = '';
        Sfx.add();
        commit();
        $('#todo-input').focus();
      } else if (e.target.id === 'hero-form') {
        e.preventDefault();
        var name = $('#hero-name').value.replace(/\s+/g, ' ').trim().slice(0, 16);
        if (!name) { $('#hero-name').focus(); return; }
        state.hero.name = name;
        commit();
        toast('Renamed', 'Your hero is now ' + name + '.', 'sword');
      } else if (e.target.id === 'quest-form') {
        submitQuest(e);
      }
    });

    document.addEventListener('change', function (e) {
      if (e.target.name === 'goal') syncGoalFields();
      if (e.target.closest && e.target.closest('#quest-form')) $('#q-error').hidden = true;
      if (e.target.id === 'import-file' && e.target.files[0]) {
        readImport(e.target.files[0]);
        e.target.value = '';
      }
    });

    $('#q-name').addEventListener('input', function () { $('#q-error').hidden = true; });

    document.addEventListener('toggle', function (e) {
      if (e.target.id === 'rest-details') ui.restOpen = e.target.open;
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#levelup-root').firstChild) { closeLevelUp(); return; }
      if (e.target.closest && e.target.closest('#heat-grid')) onHeatKey(e);
      else if (e.target.classList && e.target.classList.contains('tab')) onTabKey(e);
    });

    $('#quest-dialog').addEventListener('close', function () { ui.editing = null; });

    document.addEventListener('pointerover', function (e) {
      var el = e.target.closest && e.target.closest('[data-tip]');
      if (el) showTip(el);
    });
    document.addEventListener('pointerout', function (e) {
      var el = e.target.closest && e.target.closest('[data-tip]');
      if (el && !el.contains(e.relatedTarget)) hideTip();
    });
    document.addEventListener('focusin', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-tip')) showTip(e.target);
      else hideTip();
    });
    window.addEventListener('scroll', hideTip, { passive: true });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { Store.flush(); return; }
      tick();
      Store.refresh().then(function (remote) {
        if (!remote || (remote.updatedAt || 0) <= state.updatedAt) return;
        adopt(remote);
      });
    });
    window.addEventListener('pagehide', function () { Store.flush(); });
  }

  /** Midnight rollover: if the page stays open, move to the new day. */
  function tick() {
    var now = C.todayKey();
    if (now === today) return;
    var wasToday = ui.date === today;
    today = now;
    if (wasToday) ui.date = today;
    C.pruneTodos(state, today);
    recompute();
    render();
  }

  /** Take a saved game from elsewhere (cloud) as the current one. */
  function adopt(raw) {
    state = C.normalizeState(raw, today);
    C.pruneTodos(state, today);
    if (ui.date < state.hero.since) ui.date = today;
    recompute();
    resetCelebrated();
    C.claimBadges(state, summary, today);
    Store.writeLocal(state);
    render();
  }

  // ------------------------------------------------------------ boot

  function boot() {
    today = C.todayKey();
    ui.date = today;
    readUi();
    state = C.normalizeState(Store.readLocal(), today);
    C.pruneTodos(state, today);
    recompute();
    resetCelebrated();
    C.claimBadges(state, summary, today);

    $('#brand-icon').innerHTML = S.icon('sword');
    buildDialogOptions();
    render();
    bindEvents();
    scheduleBlink();
    setInterval(tick, 30000);

    Store.onStatus(function (status, detail) {
      ui.sync = status;
      ui.syncDetail = detail || '';
      var el = $('#sync');
      if (el) {
        el.setAttribute('data-status', status);
        el.textContent = syncText();
      }
    });

    Store.connect().then(function (res) {
      if (!res) return;
      if (res.state) {
        if ((res.state.updatedAt || 0) >= state.updatedAt) adopt(res.state);
        else Store.save(state); // this browser holds newer progress
      } else if (res.empty && state.updatedAt > 0) {
        Store.save(state); // first cloud save of progress made in this browser
      }
      if (ui.tab === 'setup') render();
    });
  }

  boot();
})();
