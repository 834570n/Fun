// Robot driver laps the circuit: node racing/test/lap-test.js [gripFactor]
const { Car } = require('../physics.js');
const { Track, LapTimer } = require('../track.js');
const DT = 1 / 1000;
const track = new Track();
const car = new Car();
const grip = parseFloat(process.argv[2] || '0.92');
const start = track.poseAt(-40);
car.reset(start.x, start.y, start.yaw);
const timer = new LapTimer(track);
timer.best = null;

// speed profile
const n = track.n, vmax = new Float64Array(n);
for (let i = 0; i < n; i++) {
  let k = 0; for (let d = -3; d <= 3; d++) k = Math.max(k, Math.abs(track.k[(i + d + n) % n]));
  vmax[i] = Math.min(70, Math.sqrt(1.0 * 9.81 * grip / Math.max(k, 1e-4)));
}
for (let pass = 0; pass < 3; pass++) {
  for (let i = n - 1; i >= 0; i--) { // braking
    const j = (i + 1) % n; const v = Math.sqrt(vmax[j] ** 2 + 2 * 9.81 * 0.95 * grip * 2.0);
    if (v < vmax[i]) vmax[i] = v;
  }
}

let hint = start.i, t = 0, laps = [], offs = 0, maxSlide = 0, hits = 0;
const surf = (x, y) => track.surfaceAt(x, y, hint);
while (t < 400 && laps.length < 3) {
  const pr = track.project(car.x, car.y, hint); hint = pr.i;
  const look = Math.max(7, car.vx * 0.55);
  const tgt = track.poseAt(pr.s + look);
  const dx = tgt.x - car.x, dy = tgt.y - car.y;
  const lx = dx * Math.cos(car.yaw) + dy * Math.sin(car.yaw);
  const ly = -dx * Math.sin(car.yaw) + dy * Math.cos(car.yaw);
  const beta = Math.atan2(car.vy, Math.max(car.vx, 1));
  const steer = Math.atan(2 * car.L * ly / (lx * lx + ly * ly)) + 0.9 * beta;
  const vt = vmax[track.nearest(tgt.x, tgt.y, pr.i)] ;
  const vTarget = Math.min(vt, vmax[(pr.i + Math.round(car.vx * 0.25)) % n]);
  const e = vTarget - car.vx;
  let inp = { steerAngle: steer, throttle: Math.max(0, Math.min(1, e * 0.8)), brake: Math.max(0, Math.min(1, -e * 0.5)) };
  inp = car.autoShift(inp);
  car.step(DT, inp, { abs: true, tc: true, esc: process.argv[3] === 'esc', autoClutch: true }, surf);
  if (track.collide(car, hint) > 0) hits++;
  t += DT;
  const off = car.wheels.filter(w => w.surface === 2).length >= 4;
  if (off) offs++;
  for (const w of car.wheels) maxSlide = Math.max(maxSlide, w.slide);
  const prevLast = timer.last;
  timer.update(t, pr.s, off);
  if (timer.last !== prevLast && timer.last) laps.push(timer.last.toFixed(2) + (timer.lastValid ? '' : '*'));
  if (!isFinite(car.x)) { console.log('NaN!'); break; }
}
console.log(`grip ${grip}: laps ${laps.join(', ')} | offtrack ms ${offs} | wall hits ${hits} | max slide ${maxSlide.toFixed(2)} | t=${t.toFixed(1)}`);
