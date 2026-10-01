# Habit Quest

A pixel-art RPG habit tracker. Your daily healthy habits are quests; clearing
them earns XP, levels up your hero and trains four attributes. Stats, streaks
and badges show how you're doing over time.

## Run it

No build step and no dependencies. Either:

- open `index.html` in a browser, or
- serve the folder: `npx http-server -c-1 .` and visit http://localhost:8080

Progress saves in the browser's `localStorage`. Use **Setup → Export backup**
now and then, and **Import backup** to restore or move to another browser.
When the page runs as a claude.ai artifact it also saves to your Claude
account, so it follows you across devices.

## How it plays

**Daily quests** are your habits. Each one has:

- an **attribute** it trains: STR (exercise and movement), VIT (food, water and
  sleep), INT (learning and focus) or SPI (mindfulness and connection)
- a **difficulty**: Easy 10 XP, Normal 20 XP or Hard 35 XP
- a **goal**: once a day (a checkbox) or a count, like 8 glasses of water.
  Counters pay partial XP as you go.
- the **days it's due**: every day, weekdays, or any set of days

**Side quests** are one-off tasks worth 10 XP. Unfinished ones carry over to
today until you clear them.

Finish every quest due in a day for a **perfect day**: +25 bonus XP, and the
treasure chest next to your hero opens.

**Levels.** Level 2 takes 100 XP and each level after that takes 50 more. At a
typical 70-80 XP a day that's level 5 in about 9 days, level 10 in about five
weeks and level 20 in about five months. Your hero's armor changes at levels
5, 10 (a crown) and 20.

**Streaks** count consecutive days a quest was *due* and done. Days it isn't
due are skipped, and an unfinished today doesn't break a streak until the day
is over.

You can step back to earlier days with the arrows (or tap a day in the stats
charts) to log something you forgot.

## Stats

- completion rate, quests cleared, perfect days and XP for the last 7, 30 or
  90 days, each compared with the period before
- a daily (or weekly) completion chart, also available as a table
- a 26-week quest log heatmap
- XP earned per attribute
- per-quest current and best streaks and completion rate
- lifetime totals and 12 badges to earn

## Project layout

```
index.html      page markup
style.css       pixel UI; dark "night" and light "parchment" themes
js/core.js      game rules: dates, XP, levels, streaks, stats, badges (pure, no DOM)
js/sprites.js   pixel art as character grids, rendered to inline SVG
js/storage.js   localStorage, plus the claude.ai per-person store when available
js/app.js       rendering, input, effects and 8-bit sound
tests/          unit tests for core.js
```

## Tests

```
npm test
```

Runs the `core.js` unit tests with Node's built-in test runner (Node 18+).
