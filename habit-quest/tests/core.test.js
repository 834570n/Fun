// Run with: node --test habit-quest/tests
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/core.js');

const TODAY = '2026-10-01'; // a Thursday

function habit(over) {
  return Object.assign({
    id: 'h1', name: 'Test', icon: 'star', stat: 'str', xp: 20, target: 1, unit: '',
    days: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-09-01', archivedAt: null
  }, over);
}

function stateWith(habits, log) {
  const s = C.createState('2026-09-01');
  s.habits = habits;
  s.log = log || {};
  return s;
}

function markDays(state, habitId, keys, count) {
  keys.forEach((k) => C.setCount(state, k, habitId, count || 1));
}

test('date keys round-trip and step across month and year ends', () => {
  assert.equal(C.addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(C.daysBetween('2026-09-01', TODAY), 30);
  assert.equal(C.weekday(TODAY), 4);
  assert.ok(C.isKey('2026-02-28'));
  assert.ok(!C.isKey('2026-02-30'));
  assert.ok(!C.isKey('nope'));
});

test('date keys survive a DST change', () => {
  // US clocks move in March and November; days must still step by one.
  let k = '2026-03-01';
  for (let i = 0; i < 300; i++) k = C.addDays(k, 1);
  assert.equal(C.daysBetween('2026-03-01', k), 300);
});

test('hero level curve', () => {
  assert.deepEqual(C.heroLevel(0), { level: 1, into: 0, need: 100, total: 0 });
  assert.equal(C.heroLevel(99).level, 1);
  assert.equal(C.heroLevel(100).level, 2);
  assert.equal(C.heroLevel(100).need, 150);
  assert.equal(C.heroLevel(250).level, 3);
  assert.equal(C.heroLevel(249).into, 149);
  assert.equal(C.statLevel(50 + 75).level, 3);
  assert.deepEqual([1, 4, 5, 9, 10, 19, 20, 40].map(C.heroTier), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('counter habits pay partial XP and complete at target', () => {
  const h = habit({ target: 8, xp: 10, stat: 'vit' });
  const s = stateWith([h]);
  C.setCount(s, TODAY, 'h1', 4);
  let d = C.dayInfo(s, TODAY);
  assert.equal(d.xp, 5);
  assert.equal(d.done, 0);
  assert.equal(d.ratio, 0.5);
  assert.equal(d.byStat.vit, 5);

  C.setCount(s, TODAY, 'h1', 8);
  d = C.dayInfo(s, TODAY);
  assert.equal(d.done, 1);
  assert.ok(d.perfect);
  assert.equal(d.xp, 10 + C.PERFECT_BONUS);
});

test('setCount removes empty entries', () => {
  const s = stateWith([habit()]);
  C.setCount(s, TODAY, 'h1', 1);
  C.setCount(s, TODAY, 'h1', 0);
  assert.deepEqual(s.log, {});
});

test('current streak ignores an unfinished today but breaks on a missed day', () => {
  const s = stateWith([habit()]);
  markDays(s, 'h1', ['2026-09-28', '2026-09-29', '2026-09-30']);
  assert.equal(C.currentStreak(s, s.habits[0], TODAY), 3);
  C.setCount(s, TODAY, 'h1', 1);
  assert.equal(C.currentStreak(s, s.habits[0], TODAY), 4);
  C.setCount(s, '2026-09-29', 'h1', 0);
  assert.equal(C.currentStreak(s, s.habits[0], TODAY), 2);
});

test('streaks skip days a quest is not due', () => {
  // Mon / Wed / Fri only.
  const s = stateWith([habit({ days: [1, 3, 5] })]);
  markDays(s, 'h1', ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30']);
  assert.equal(C.currentStreak(s, s.habits[0], TODAY), 5);
  assert.equal(C.bestStreak(s, s.habits[0], TODAY), 5);
});

test('best streak remembers the longest run', () => {
  const s = stateWith([habit()]);
  markDays(s, 'h1', ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-10', '2026-09-11']);
  assert.equal(C.bestStreak(s, s.habits[0], TODAY), 4);
  assert.equal(C.currentStreak(s, s.habits[0], TODAY), 0);
});

test('a brand new habit has no streak', () => {
  const s = stateWith([habit({ createdAt: TODAY })]);
  assert.equal(C.currentStreak(s, s.habits[0], TODAY), 0);
  assert.equal(C.bestStreak(s, s.habits[0], TODAY), 0);
});

test('summarize totals XP, perfect days and the activity streak', () => {
  const a = habit({ id: 'a', stat: 'str', xp: 20 });
  const b = habit({ id: 'b', stat: 'int', xp: 10 });
  const s = stateWith([a, b]);
  // Two perfect days, then one half day.
  markDays(s, 'a', ['2026-09-28', '2026-09-29', '2026-09-30']);
  markDays(s, 'b', ['2026-09-28', '2026-09-29']);
  const sum = C.summarize(s, TODAY);
  assert.equal(sum.totalXP, 3 * 20 + 2 * 10 + 2 * C.PERFECT_BONUS);
  assert.equal(sum.statXP.str, 60);
  assert.equal(sum.statXP.int, 20);
  assert.equal(sum.completions, 5);
  assert.equal(sum.perfectTotal, 2);
  assert.equal(sum.perfectBest, 2);
  assert.equal(sum.perfectCurrent, 0);
  assert.equal(sum.activeStreak, 3);
  assert.equal(sum.habits.a.current, 3);
  assert.equal(sum.bestStreakAny, 3);
});

test('range report weights completion by quests due', () => {
  const a = habit({ id: 'a' });
  const b = habit({ id: 'b', days: [1] }); // Mondays only
  const s = stateWith([a, b]);
  markDays(s, 'a', ['2026-09-29', '2026-09-30']);
  const sum = C.summarize(s, TODAY);
  const r = C.rangeReport(s, sum, TODAY, 7);
  assert.equal(r.rows.length, 7);
  assert.equal(r.rows[6].key, TODAY);
  // a is due 7 days, b once (Mon 9/28): 8 due, 2 done.
  assert.equal(r.totals.scheduled, 8);
  assert.equal(r.totals.rate, 2 / 8);
  assert.equal(r.habits.find((h) => h.id === 'b').due, 1);
});

test('weekly buckets cover the range in 7-day chunks', () => {
  const s = stateWith([habit()]);
  const r = C.rangeReport(s, null, TODAY, 91);
  const weeks = C.weeklyBuckets(r.rows);
  assert.equal(weeks.length, 13);
  assert.equal(weeks[12].end, TODAY);
});

test('side quests carry over to today and credit the day they are finished', () => {
  const s = stateWith([habit()]);
  const t = C.addTodo(s, '  Call grandma  ', '2026-09-29');
  assert.equal(t.title, 'Call grandma');
  assert.equal(C.todosFor(s, TODAY, TODAY).length, 1);
  assert.equal(C.todosFor(s, '2026-09-30', TODAY).length, 0);

  C.toggleTodo(s, t.id, TODAY);
  assert.equal(C.dayInfo(s, TODAY).side, 1);
  assert.equal(C.dayInfo(s, TODAY).xp, C.SIDE_XP);
  assert.ok(!C.removeTodo(s, t.id), 'finished side quests keep their credit');

  C.toggleTodo(s, t.id, TODAY);
  assert.equal(C.dayInfo(s, TODAY).side, 0);
  assert.ok(C.removeTodo(s, t.id));
  assert.equal(C.addTodo(s, '   ', TODAY), null);
});

test('finished side quests are pruned after two weeks', () => {
  const s = stateWith([habit()]);
  const old = C.addTodo(s, 'Old', '2026-09-01');
  C.toggleTodo(s, old.id, '2026-09-02');
  C.addTodo(s, 'Open', '2026-09-01');
  assert.equal(C.pruneTodos(s, TODAY), 1);
  assert.equal(s.todos.length, 1);
  assert.equal(C.summarize(s, TODAY).sideTotal, 1, 'credit survives pruning');
});

test('retiring keeps history; deleting only happens without history', () => {
  const s = stateWith([habit({ id: 'a' }), habit({ id: 'b' })]);
  C.setCount(s, '2026-09-30', 'a', 1);
  C.setCount(s, TODAY, 'a', 1);
  assert.equal(C.retireHabit(s, 'a', TODAY), 'retired');
  assert.equal(C.retireHabit(s, 'b', TODAY), 'deleted');
  assert.equal(s.habits.length, 1);
  assert.ok(!C.isScheduled(s.habits[0], TODAY));
  assert.ok(C.isScheduled(s.habits[0], '2026-09-30'));
  assert.equal(C.getCount(s, TODAY, 'a'), 0);
  assert.equal(C.summarize(s, TODAY).statXP.str, 20);
  C.restoreHabit(s, 'a');
  assert.ok(C.isScheduled(s.habits[0], TODAY));
});

test('badges unlock once and stay unlocked', () => {
  const s = stateWith([habit()]);
  C.setCount(s, TODAY, 'h1', 1);
  let sum = C.summarize(s, TODAY);
  const fresh = C.claimBadges(s, sum, TODAY);
  assert.deepEqual(fresh.map((b) => b.id).sort(), ['first', 'flawless']);
  assert.equal(s.badges.first, TODAY);

  C.setCount(s, TODAY, 'h1', 0);
  sum = C.summarize(s, TODAY);
  assert.ok(sum.badges.find((b) => b.id === 'first').earned);
  assert.deepEqual(C.claimBadges(s, sum, TODAY), []);
});

test('normalizeState repairs bad input and keeps valid data', () => {
  const s = C.normalizeState({
    hero: { name: '  Astrid the Brave and Very Long Name ' },
    habits: [
      { id: 'x', name: 'Run', icon: 'rocket', stat: 'luck', xp: 500, target: 0, days: [9, 1, 1, 3] },
      { id: 'x', name: 'Duplicate' },
      'junk'
    ],
    log: { '2026-09-30': { x: 2, ghost: 3, _side: 1 }, 'bad-key': { x: 1 } },
    todos: [{ title: 'Stretch', createdAt: 'yesterday' }, { title: '' }],
    badges: { first: '2026-09-30', fake: '2026-09-30' },
    settings: { sound: false }
  }, TODAY);
  assert.equal(s.hero.name, 'Astrid the Brave');
  assert.equal(s.habits.length, 1);
  assert.deepEqual(s.habits[0].days, [1, 3]);
  assert.equal(s.habits[0].icon, 'star');
  assert.equal(s.habits[0].stat, 'vit');
  assert.equal(s.habits[0].xp, 100);
  assert.equal(s.habits[0].target, 1);
  assert.deepEqual(s.log, { '2026-09-30': { x: 2, _side: 1 } });
  assert.equal(s.todos.length, 1);
  assert.equal(s.todos[0].createdAt, TODAY);
  assert.deepEqual(s.badges, { first: '2026-09-30' });
  assert.equal(s.settings.sound, false);
  assert.equal(s.hero.since, '2026-09-30', 'since moves back to the oldest log day');
});

test('normalizeState gives a fresh hero the starter quests', () => {
  const s = C.normalizeState(null, TODAY);
  assert.equal(s.habits.length, 6);
  assert.ok(s.habits.every((h) => C.ICONS.includes(h.icon)));
  assert.ok(s.habits.every((h) => C.STAT_IDS.includes(h.stat)));
});
