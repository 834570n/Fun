/*
 * Habit Quest — game rules.
 *
 * Pure functions over a plain JSON state object. The browser app and the
 * Node tests both load this file, so it must not touch the DOM.
 *
 * Dates are local calendar days written as 'YYYY-MM-DD' strings ("keys").
 * Keys sort lexically in date order, so plain string comparison works.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HQCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATS = [
    { id: 'str', label: 'STR', name: 'Strength', blurb: 'Exercise and movement' },
    { id: 'vit', label: 'VIT', name: 'Vitality', blurb: 'Food, water and sleep' },
    { id: 'int', label: 'INT', name: 'Intellect', blurb: 'Learning and focus' },
    { id: 'spi', label: 'SPI', name: 'Spirit', blurb: 'Mindfulness and connection' }
  ];
  var STAT_IDS = STATS.map(function (s) { return s.id; });

  var DIFFICULTY = [
    { id: 'easy', label: 'Easy', xp: 10 },
    { id: 'normal', label: 'Normal', xp: 20 },
    { id: 'hard', label: 'Hard', xp: 35 }
  ];

  var ICONS = [
    'water', 'shoe', 'dumbbell', 'leaf', 'apple', 'book', 'lotus', 'moon',
    'sun', 'heart', 'tooth', 'pill', 'pencil', 'chat', 'star', 'potion'
  ];

  var SIDE_XP = 10;        // XP for each finished side quest
  var PERFECT_BONUS = 25;  // XP for finishing every scheduled quest in a day
  var MAX_LOOKBACK = 4000; // days; guards every backwards walk

  // ---------------------------------------------------------------- dates

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function toKey(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fromKey(key) {
    var p = key.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function isKey(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    return toKey(fromKey(v)) === v;
  }

  function todayKey(now) { return toKey(now || new Date()); }

  function addDays(key, n) {
    var d = fromKey(key);
    d.setDate(d.getDate() + n);
    return toKey(d);
  }

  /** Whole days from a to b (b - a). Rounding absorbs DST hour shifts. */
  function daysBetween(a, b) {
    return Math.round((fromKey(b) - fromKey(a)) / 86400000);
  }

  function weekday(key) { return fromKey(key).getDay(); }

  // ---------------------------------------------------------------- state

  function makeId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  var ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

  function defaultHabits(today) {
    var rows = [
      ['Drink water', 'water', 'vit', 10, 8, 'glasses'],
      ['Move for 30 minutes', 'shoe', 'str', 20, 1, ''],
      ['Eat your greens', 'leaf', 'vit', 10, 1, ''],
      ['Read 10 pages', 'book', 'int', 20, 1, ''],
      ['Meditate 5 minutes', 'lotus', 'spi', 10, 1, ''],
      ['Lights out by 11pm', 'moon', 'vit', 20, 1, '']
    ];
    return rows.map(function (r, i) {
      return {
        id: 'h' + (i + 1), name: r[0], icon: r[1], stat: r[2], xp: r[3],
        target: r[4], unit: r[5], days: ALL_DAYS.slice(), createdAt: today, archivedAt: null
      };
    });
  }

  function createState(today) {
    return {
      version: 1,
      hero: { name: 'Hero', since: today },
      habits: defaultHabits(today),
      log: {},
      todos: [],
      badges: {},
      settings: { sound: true },
      updatedAt: 0
    };
  }

  function str(v, max, fallback) {
    if (typeof v !== 'string') return fallback;
    v = v.replace(/\s+/g, ' ').trim().slice(0, max);
    return v || fallback;
  }

  function int(v, lo, hi, fallback) {
    v = Math.round(Number(v));
    if (!isFinite(v)) return fallback;
    return Math.min(hi, Math.max(lo, v));
  }

  /**
   * Coerce anything (an old save, an imported backup) into a valid state.
   * Unknown fields are dropped; missing ones get defaults.
   */
  function normalizeState(raw, today) {
    var base = createState(today);
    if (!raw || typeof raw !== 'object') return base;

    var hero = raw.hero && typeof raw.hero === 'object' ? raw.hero : {};
    var state = {
      version: 1,
      hero: {
        name: str(hero.name, 16, 'Hero'),
        since: isKey(hero.since) ? hero.since : today
      },
      habits: [],
      log: {},
      todos: [],
      badges: {},
      settings: { sound: !(raw.settings && raw.settings.sound === false) },
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0
    };

    var seen = {};
    (Array.isArray(raw.habits) ? raw.habits : base.habits).forEach(function (h) {
      if (!h || typeof h !== 'object') return;
      var id = str(h.id, 40, '');
      if (!id || seen[id] || id.charAt(0) === '_') return;
      seen[id] = true;
      var days = Array.isArray(h.days)
        ? h.days.map(Number).filter(function (d, i, a) { return d >= 0 && d <= 6 && d % 1 === 0 && a.indexOf(d) === i; }).sort()
        : ALL_DAYS.slice();
      state.habits.push({
        id: id,
        name: str(h.name, 60, 'Quest'),
        icon: ICONS.indexOf(h.icon) !== -1 ? h.icon : 'star',
        stat: STAT_IDS.indexOf(h.stat) !== -1 ? h.stat : 'vit',
        xp: int(h.xp, 1, 100, 20),
        target: int(h.target, 1, 99, 1),
        unit: str(h.unit, 12, ''),
        days: days.length ? days : ALL_DAYS.slice(),
        createdAt: isKey(h.createdAt) ? h.createdAt : today,
        archivedAt: isKey(h.archivedAt) ? h.archivedAt : null
      });
    });

    if (raw.log && typeof raw.log === 'object') {
      Object.keys(raw.log).forEach(function (key) {
        var day = raw.log[key];
        if (!isKey(key) || !day || typeof day !== 'object') return;
        var clean = {};
        Object.keys(day).forEach(function (id) {
          var n = int(day[id], 0, 999, 0);
          if (n > 0 && (id === '_side' || seen[id])) clean[id] = n;
        });
        if (Object.keys(clean).length) state.log[key] = clean;
      });
    }

    if (Array.isArray(raw.todos)) {
      raw.todos.forEach(function (t) {
        if (!t || typeof t !== 'object') return;
        var title = str(t.title, 80, '');
        if (!title) return;
        state.todos.push({
          id: str(t.id, 40, makeId('t')),
          title: title,
          createdAt: isKey(t.createdAt) ? t.createdAt : today,
          doneAt: isKey(t.doneAt) ? t.doneAt : null
        });
      });
    }

    if (raw.badges && typeof raw.badges === 'object') {
      BADGES.forEach(function (b) {
        if (isKey(raw.badges[b.id])) state.badges[b.id] = raw.badges[b.id];
      });
    }

    var earliest = state.hero.since;
    state.habits.forEach(function (h) { if (h.createdAt < earliest) earliest = h.createdAt; });
    Object.keys(state.log).forEach(function (k) { if (k < earliest) earliest = k; });
    state.hero.since = earliest;
    return state;
  }

  // ---------------------------------------------------------------- log

  function getCount(state, key, habitId) {
    var day = state.log[key];
    return day && day[habitId] ? day[habitId] : 0;
  }

  function setCount(state, key, habitId, n) {
    var day = state.log[key] || (state.log[key] = {});
    if (n > 0) day[habitId] = n;
    else delete day[habitId];
    if (!Object.keys(day).length) delete state.log[key];
  }

  /** The habit exists on this day (created, not yet retired). */
  function isActive(h, key) {
    return key >= h.createdAt && (!h.archivedAt || key < h.archivedAt);
  }

  /** The habit is due on this day. */
  function isScheduled(h, key) {
    return isActive(h, key) && h.days.indexOf(weekday(key)) !== -1;
  }

  function fraction(h, count) { return Math.min(count / h.target, 1); }

  function isDone(state, h, key) { return getCount(state, key, h.id) >= h.target; }

  /** XP a habit pays for a day's count. Counters pay partial credit. */
  function habitXP(h, count) { return Math.floor(h.xp * fraction(h, count)); }

  function emptyByStat() { return { str: 0, vit: 0, int: 0, spi: 0 }; }

  /** Everything the app knows about one day. */
  function dayInfo(state, key) {
    var info = {
      key: key, scheduled: 0, done: 0, progress: 0, ratio: 0, perfect: false,
      xp: 0, byStat: emptyByStat(), completions: 0, side: 0
    };
    state.habits.forEach(function (h) {
      var c = getCount(state, key, h.id);
      if (isScheduled(h, key)) {
        info.scheduled++;
        info.progress += fraction(h, c);
        if (c >= h.target) info.done++;
      }
      if (c > 0) {
        var x = habitXP(h, c);
        info.xp += x;
        info.byStat[h.stat] += x;
        if (c >= h.target) info.completions++;
      }
    });
    info.side = getCount(state, key, '_side');
    info.completions += info.side;
    info.xp += info.side * SIDE_XP;
    info.ratio = info.scheduled ? info.progress / info.scheduled : 0;
    info.perfect = info.scheduled > 0 && info.done === info.scheduled;
    if (info.perfect) info.xp += PERFECT_BONUS;
    return info;
  }

  // ---------------------------------------------------------------- levels

  function levelCurve(xp, base, step) {
    var level = 1, need = base, rest = xp;
    while (rest >= need) {
      rest -= need;
      level++;
      need = base + (level - 1) * step;
    }
    return { level: level, into: rest, need: need, total: xp };
  }

  /**
   * Hero level: 100 XP for level 2, then 50 more per level. At a typical
   * 70-80 XP a day that is level 5 in about 9 days, level 10 in about five
   * weeks and level 20 in about five months.
   */
  function heroLevel(xp) { return levelCurve(xp, 100, 50); }

  /** Attribute level: 50 XP for level 2, then 25 more per level. */
  function statLevel(xp) { return levelCurve(xp, 50, 25); }

  /** Armour tier for the hero sprite (new look at level 5, 10 and 20). */
  function heroTier(level) {
    if (level >= 20) return 3;
    if (level >= 10) return 2;
    if (level >= 5) return 1;
    return 0;
  }

  // ---------------------------------------------------------------- streaks

  /**
   * Consecutive scheduled days completed, counting back from today.
   * An unfinished today does not break the streak (the day isn't over),
   * and days the quest isn't due are skipped.
   */
  function currentStreak(state, h, today) {
    var k = today, n = 0, guard = 0;
    if (isScheduled(h, k) && !isDone(state, h, k)) k = addDays(k, -1);
    while (k >= h.createdAt && guard++ < MAX_LOOKBACK) {
      if (isScheduled(h, k)) {
        if (isDone(state, h, k)) n++;
        else break;
      }
      k = addDays(k, -1);
    }
    return n;
  }

  function bestStreak(state, h, today) {
    var best = 0, run = 0;
    var end = h.archivedAt ? addDays(h.archivedAt, -1) : today;
    if (end > today) end = today;
    var k = h.createdAt;
    if (daysBetween(k, end) > MAX_LOOKBACK) k = addDays(end, -MAX_LOOKBACK);
    for (; k <= end; k = addDays(k, 1)) {
      if (!isScheduled(h, k)) continue;
      if (isDone(state, h, k)) {
        run++;
        if (run > best) best = run;
      } else if (k !== today) {
        run = 0;
      }
    }
    return best;
  }

  function earliestKey(state, today) {
    var e = state.hero.since && state.hero.since < today ? state.hero.since : today;
    if (daysBetween(e, today) > MAX_LOOKBACK) e = addDays(today, -MAX_LOOKBACK);
    return e;
  }

  // ---------------------------------------------------------------- summary

  /** Totals, levels, streaks and badges in one pass over history. */
  function summarize(state, today) {
    var s = {
      today: today,
      totalXP: 0,
      statXP: emptyByStat(),
      completions: 0,
      sideTotal: 0,
      perfectTotal: 0,
      perfectBest: 0,
      perfectCurrent: 0,
      activeStreak: 0,
      bestStreakAny: 0,
      habits: {},
      days: {}
    };

    var start = earliestKey(state, today);
    var perfectRun = 0;
    for (var k = start; k <= today; k = addDays(k, 1)) {
      var info = dayInfo(state, k);
      s.days[k] = info;
      s.totalXP += info.xp;
      s.completions += info.completions;
      s.sideTotal += info.side;
      STAT_IDS.forEach(function (id) { s.statXP[id] += info.byStat[id]; });
      if (info.scheduled === 0) continue;
      if (info.perfect) {
        s.perfectTotal++;
        perfectRun++;
        if (perfectRun > s.perfectBest) s.perfectBest = perfectRun;
      } else if (k !== today) {
        perfectRun = 0;
      }
    }
    // Log entries that predate the walk (a very old import) still pay XP.
    Object.keys(state.log).forEach(function (key) {
      if (key >= start) return;
      var info = dayInfo(state, key);
      s.totalXP += info.xp;
      s.completions += info.completions;
      s.sideTotal += info.side;
      STAT_IDS.forEach(function (id) { s.statXP[id] += info.byStat[id]; });
    });
    s.perfectCurrent = perfectRun;

    var k2 = today;
    if (!s.days[k2] || s.days[k2].completions === 0) k2 = addDays(k2, -1);
    while (s.days[k2] && s.days[k2].completions > 0) {
      s.activeStreak++;
      k2 = addDays(k2, -1);
    }

    state.habits.forEach(function (h) {
      var cur = h.archivedAt ? 0 : currentStreak(state, h, today);
      var best = bestStreak(state, h, today);
      s.habits[h.id] = { current: cur, best: best };
      if (best > s.bestStreakAny) s.bestStreakAny = best;
    });

    s.hero = heroLevel(s.totalXP);
    s.stats = {};
    STAT_IDS.forEach(function (id) { s.stats[id] = statLevel(s.statXP[id]); });
    s.minStatLevel = Math.min.apply(null, STAT_IDS.map(function (id) { return s.stats[id].level; }));
    s.badges = evaluateBadges(state, s);
    return s;
  }

  /**
   * Per-day rows for the `days` ending at `end`, plus range totals.
   * Completion rate weights each day by how many quests were due.
   */
  function rangeReport(state, summary, end, days) {
    var rows = [];
    var totals = { scheduled: 0, progress: 0, completions: 0, perfect: 0, xp: 0, byStat: emptyByStat() };
    for (var i = days - 1; i >= 0; i--) {
      var key = addDays(end, -i);
      var info = (summary && summary.days[key]) || dayInfo(state, key);
      rows.push(info);
      totals.scheduled += info.scheduled;
      totals.progress += info.progress;
      totals.completions += info.completions;
      totals.xp += info.xp;
      if (info.perfect) totals.perfect++;
      STAT_IDS.forEach(function (id) { totals.byStat[id] += info.byStat[id]; });
    }
    totals.rate = totals.scheduled ? totals.progress / totals.scheduled : 0;

    var habits = state.habits.map(function (h) {
      var due = 0, got = 0;
      rows.forEach(function (r) {
        if (!isScheduled(h, r.key)) return;
        due++;
        got += fraction(h, getCount(state, r.key, h.id));
      });
      return { id: h.id, due: due, rate: due ? got / due : 0 };
    });

    return { rows: rows, totals: totals, habits: habits };
  }

  /** Collapse daily rows into 7-day buckets (oldest first). */
  function weeklyBuckets(rows) {
    var out = [];
    for (var i = rows.length % 7; i < rows.length; i += 7) {
      var chunk = rows.slice(i, i + 7);
      var sched = 0, prog = 0, xp = 0;
      chunk.forEach(function (r) { sched += r.scheduled; prog += r.progress; xp += r.xp; });
      out.push({ key: chunk[0].key, end: chunk[chunk.length - 1].key, scheduled: sched, ratio: sched ? prog / sched : 0, xp: xp });
    }
    return out;
  }

  // ---------------------------------------------------------------- badges

  var BADGES = [
    { id: 'first', name: 'First Steps', desc: 'Complete your first quest.', icon: 'shoe', goal: 1, metric: 'completions' },
    { id: 'flawless', name: 'Flawless', desc: 'Finish every daily quest in one day.', icon: 'star', goal: 1, metric: 'perfectTotal' },
    { id: 'kindling', name: 'Kindling', desc: 'Keep any quest going 3 days in a row.', icon: 'flame', goal: 3, metric: 'bestStreakAny' },
    { id: 'week', name: 'Week Warrior', desc: 'Keep any quest going 7 days in a row.', icon: 'flame', goal: 7, metric: 'bestStreakAny' },
    { id: 'iron', name: 'Iron Will', desc: 'Keep any quest going 30 days in a row.', icon: 'trophy', goal: 30, metric: 'bestStreakAny' },
    { id: 'pweek', name: 'Perfect Week', desc: 'Seven perfect days in a row.', icon: 'crown', goal: 7, metric: 'perfectBest' },
    { id: 'adventurer', name: 'Adventurer', desc: 'Complete 50 quests.', icon: 'sword', goal: 50, metric: 'completions' },
    { id: 'veteran', name: 'Veteran', desc: 'Complete 250 quests.', icon: 'shield', goal: 250, metric: 'completions' },
    { id: 'oddjobs', name: 'Odd Jobs', desc: 'Finish 10 side quests.', icon: 'scroll', goal: 10, metric: 'sideTotal' },
    { id: 'lv5', name: 'Rising Hero', desc: 'Reach hero level 5.', icon: 'gem', goal: 5, metric: 'heroLevel' },
    { id: 'lv10', name: 'Champion', desc: 'Reach hero level 10.', icon: 'crown', goal: 10, metric: 'heroLevel' },
    { id: 'rounded', name: 'Well-Rounded', desc: 'Raise every attribute to level 3.', icon: 'heart', goal: 3, metric: 'minStatLevel' }
  ];

  function evaluateBadges(state, s) {
    var values = {
      completions: s.completions,
      perfectTotal: s.perfectTotal,
      perfectBest: s.perfectBest,
      bestStreakAny: s.bestStreakAny,
      sideTotal: s.sideTotal,
      heroLevel: s.hero.level,
      minStatLevel: s.minStatLevel
    };
    return BADGES.map(function (b) {
      var value = values[b.metric] || 0;
      var earnedAt = state.badges[b.id] || null;
      return {
        id: b.id, name: b.name, desc: b.desc, icon: b.icon, goal: b.goal,
        value: Math.min(value, b.goal),
        earned: !!earnedAt || value >= b.goal,
        earnedAt: earnedAt
      };
    });
  }

  /**
   * Stamp newly earned badges with today's date. Returns the new ones.
   * A badge stays earned even if the history behind it is later undone.
   */
  function claimBadges(state, summary, today) {
    var fresh = [];
    summary.badges.forEach(function (b) {
      if (b.earned && !state.badges[b.id]) {
        state.badges[b.id] = today;
        b.earnedAt = today;
        fresh.push(b);
      }
    });
    return fresh;
  }

  // ---------------------------------------------------------------- side quests

  function addTodo(state, title, key) {
    title = str(title, 80, '');
    if (!title) return null;
    var t = { id: makeId('t'), title: title, createdAt: key, doneAt: null };
    state.todos.push(t);
    return t;
  }

  /** Finish or reopen a side quest; finishing credits the given day. */
  function toggleTodo(state, id, key) {
    var t = state.todos.find(function (x) { return x.id === id; });
    if (!t) return null;
    if (t.doneAt) {
      setCount(state, t.doneAt, '_side', getCount(state, t.doneAt, '_side') - 1);
      t.doneAt = null;
    } else {
      t.doneAt = key;
      setCount(state, key, '_side', getCount(state, key, '_side') + 1);
    }
    return t;
  }

  /** Open side quests may be deleted; finished ones keep their credit. */
  function removeTodo(state, id) {
    var i = state.todos.findIndex(function (x) { return x.id === id; });
    if (i === -1 || state.todos[i].doneAt) return false;
    state.todos.splice(i, 1);
    return true;
  }

  /**
   * Side quests for a day. Today also shows every unfinished quest from
   * earlier days, so nothing silently drops off the list.
   */
  function todosFor(state, key, today) {
    var list = state.todos.filter(function (t) {
      if (t.doneAt) return t.doneAt === key;
      if (key === today) return t.createdAt <= today;
      return t.createdAt === key;
    });
    return list.sort(function (a, b) {
      if (!!a.doneAt !== !!b.doneAt) return a.doneAt ? 1 : -1;
      return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
    });
  }

  /** Finished side quests leave the list two weeks after their day. */
  function pruneTodos(state, today) {
    var cutoff = addDays(today, -14);
    var before = state.todos.length;
    state.todos = state.todos.filter(function (t) { return !t.doneAt || t.doneAt >= cutoff; });
    return before - state.todos.length;
  }

  // ---------------------------------------------------------------- habits

  function hasHistory(state, habitId) {
    return Object.keys(state.log).some(function (k) { return state.log[k][habitId] > 0; });
  }

  /**
   * Retire a habit from `today` on. Its past days stay in the log so stats
   * and XP don't change. A habit with no history is simply removed.
   */
  function retireHabit(state, habitId, today) {
    var i = state.habits.findIndex(function (h) { return h.id === habitId; });
    if (i === -1) return 'missing';
    if (!hasHistory(state, habitId)) {
      state.habits.splice(i, 1);
      return 'deleted';
    }
    state.habits[i].archivedAt = today;
    // Today's partial progress on a retired quest no longer counts.
    setCount(state, today, habitId, 0);
    return 'retired';
  }

  function restoreHabit(state, habitId) {
    var h = state.habits.find(function (x) { return x.id === habitId; });
    if (h) h.archivedAt = null;
    return h;
  }

  return {
    STATS: STATS, STAT_IDS: STAT_IDS, DIFFICULTY: DIFFICULTY, ICONS: ICONS, BADGES: BADGES,
    SIDE_XP: SIDE_XP, PERFECT_BONUS: PERFECT_BONUS,
    toKey: toKey, fromKey: fromKey, isKey: isKey, todayKey: todayKey, addDays: addDays,
    daysBetween: daysBetween, weekday: weekday, makeId: makeId,
    createState: createState, normalizeState: normalizeState, defaultHabits: defaultHabits,
    getCount: getCount, setCount: setCount, isActive: isActive, isScheduled: isScheduled,
    isDone: isDone, fraction: fraction, habitXP: habitXP, dayInfo: dayInfo,
    heroLevel: heroLevel, statLevel: statLevel, heroTier: heroTier,
    currentStreak: currentStreak, bestStreak: bestStreak,
    summarize: summarize, rangeReport: rangeReport, weeklyBuckets: weeklyBuckets,
    claimBadges: claimBadges,
    addTodo: addTodo, toggleTodo: toggleTodo, removeTodo: removeTodo, todosFor: todosFor, pruneTodos: pruneTodos,
    hasHistory: hasHistory, retireHabit: retireHabit, restoreHabit: restoreHabit
  };
});
