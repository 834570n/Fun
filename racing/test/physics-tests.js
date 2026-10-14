// Headless physics checks: node racing/test/physics-tests.js
const { Car } = require('../physics.js');
const DT = 1 / 1000;
const aids = { abs: true, tc: false, autoClutch: true };
const kmh = v => (v * 3.6).toFixed(1);

function run(car, seconds, inputFn, every) {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    let inp = inputFn(car, i * DT);
    inp = car.autoShift(inp);
    car.step(DT, inp, inp.aids || aids, null);
    if (every && i % every === 0) every.cb && every.cb(car, i * DT);
    if (!isFinite(car.vx) || !isFinite(car.r)) throw new Error('NaN at t=' + i * DT);
  }
}

// 1. Standing still: no drift
{
  const car = new Car();
  run(car, 5, () => ({ steerAngle: 0, throttle: 0, brake: 0 }));
  console.log(`idle 5s: pos=(${car.x.toFixed(4)}, ${car.y.toFixed(4)}) v=${car.speed.toFixed(4)} rpm=${car.rpm.toFixed(0)} gear=${car.gearLabel}`);
}

// 2. Acceleration 0-100, 0-200, quarter-mile, top speed
{
  for (const tc of [false, true]) {
    const car = new Car();
    let t100 = null, t200 = null, tq = null, vq = 0, t = 0, maxV = 0;
    const shifts = [];
    let lastG = car.gear;
    const n = 60 / DT;
    for (let i = 0; i < n; i++) {
      t = i * DT;
      let inp = car.autoShift({ steerAngle: 0, throttle: 1, brake: 0 });
      car.step(DT, inp, { abs: true, tc, autoClutch: true }, null);
      if (car.gear !== lastG) { shifts.push(`${car.gearLabel}@${t.toFixed(2)}s/${kmh(car.vx)}`); lastG = car.gear; }
      if (!t100 && car.vx >= 100 / 3.6) t100 = t;
      if (!t200 && car.vx >= 200 / 3.6) t200 = t;
      if (!tq && car.x >= 402.3) { tq = t; vq = car.vx; }
      maxV = Math.max(maxV, car.vx);
    }
    console.log(`accel tc=${tc}: 0-100 ${t100 && t100.toFixed(2)}s, 0-200 ${t200 && t200.toFixed(2)}s, 1/4mi ${tq && tq.toFixed(2)}s @${kmh(vq)}, top ${kmh(maxV)} km/h, |y|=${Math.abs(car.y).toFixed(2)}`);
    console.log('  shifts: ' + shifts.join(' '));
  }
}

// 3. Braking 100-0
{
  for (const abs of [true, false]) {
    const car = new Car();
    run(car, 30, (c) => ({ steerAngle: 0, throttle: c.vx < 100 / 3.6 ? 1 : 0, brake: 0 }));
    // hold to exactly 100
    car.vx = 100 / 3.6; for (const w of car.wheels) w.omega = car.vx / car.p.wheelRadius;
    const x0 = car.x; let t = 0, peakDecel = 0;
    while (car.vx > 0.05 && t < 20) {
      let inp = car.autoShift({ steerAngle: 0, throttle: 0, brake: 1 });
      car.step(DT, inp, { abs, tc: false, autoClutch: true }, null);
      peakDecel = Math.max(peakDecel, -car.ax);
      t += DT;
    }
    console.log(`brake 100-0 abs=${abs}: ${(car.x - x0).toFixed(1)} m in ${t.toFixed(2)}s, peak ${(peakDecel / 9.81).toFixed(2)} g, yaw ${(car.yaw * 57.3).toFixed(2)} deg`);
  }
}

// 4. Skidpad: constant-radius 40 m circle, find max steady speed with a simple controller
{
  const radius = 40;
  const car = new Car();
  let vTarget = 8, phase = 0;
  let best = 0;
  for (let i = 0; i < 120 / DT; i++) {
    const t = i * DT;
    // steer: path-following on a circle centered (0, radius)
    const dx = car.x, dy = car.y - radius;
    const dist = Math.hypot(dx, dy);
    const err = dist - radius; // >0 outside
    const tang = Math.atan2(dy, dx) + Math.PI / 2;
    let hdgErr = tang - car.yaw; hdgErr = Math.atan2(Math.sin(hdgErr), Math.cos(hdgErr));
    const steer = Math.atan(car.L / radius) + 1.2 * hdgErr + 0.08 * err;
    vTarget = 8 + t * 0.12;
    const thr = Math.max(0, Math.min(1, (vTarget - car.vx) * 0.6));
    let inp = car.autoShift({ steerAngle: steer, throttle: thr, brake: 0 });
    car.step(DT, inp, aids, null);
    if (Math.abs(err) < 1.0 && Math.abs(hdgErr) < 0.15) best = Math.max(best, Math.abs(car.ay));
    if (Math.abs(err) > 5) break;
  }
  console.log(`skidpad R40: max lateral ${(best / 9.81).toFixed(3)} g`);
}

// 5. Step steer at 100 km/h: yaw response
{
  const car = new Car();
  run(car, 30, (c) => ({ steerAngle: 0, throttle: Math.max(0, Math.min(1, (100 / 3.6 - c.vx) * 0.5)), brake: 0 }));
  const log = [];
  run(car, 3, (c, t) => ({ steerAngle: 0.03, throttle: Math.max(0, Math.min(1, (100 / 3.6 - c.vx) * 0.5)), brake: 0 }),
    { valueOf() { return 1; } });
  console.log(`step steer 0.03rad @100: r=${car.r.toFixed(3)} rad/s ay=${(car.ay / 9.81).toFixed(2)}g beta=${(Math.atan2(car.vy, car.vx) * 57.3).toFixed(2)}deg roll=${(car.roll * 57.3).toFixed(2)}deg`);
  console.log('  loads: ' + car.wheels.map(w => w.fz.toFixed(0)).join(' '));
}

// 6. Power oversteer: steady R40 corner at ~50 km/h, then full throttle with fixed steering
{
  for (const [name, a] of [['off', { abs: false, tc: false, esc: false }], ['tc', { abs: true, tc: true, esc: false }], ['esc', { abs: true, tc: true, esc: true }]]) {
    const car = new Car();
    const radius = 40;
    let steer = 0, maxBeta = 0;
    for (let i = 0; i < 25000; i++) {
      const t = i * DT;
      if (t < 20) {
        const dx = car.x, dy = car.y - radius, err = Math.hypot(dx, dy) - radius;
        let he = Math.atan2(dy, dx) + Math.PI / 2 - car.yaw; he = Math.atan2(Math.sin(he), Math.cos(he));
        steer = Math.atan(car.L / radius) + 1.2 * he + 0.08 * err;
      }
      const thr = t < 20 ? Math.max(0, Math.min(1, (13.5 - car.vx) * 0.6)) : 1;
      let inp = car.autoShift({ steerAngle: steer, throttle: thr, brake: 0 });
      if (t >= 20 && car.gear > 3) car.gear = 3;
      car.step(DT, inp, Object.assign({ autoClutch: true }, a), null);
      if (t > 20) maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(car.vy, Math.abs(car.vx))));
    }
    console.log(`power-on in corner [${name}]: max body slip ${(maxBeta * 57.3).toFixed(1)} deg, final v ${kmh(car.vx)} gear ${car.gearLabel}`);
  }
}

// 7. Brake hard mid-corner (R60, ~75 km/h) with steering held
{
  for (const [name, a] of [['off', { abs: false, tc: false, esc: false }], ['abs', { abs: true, tc: true, esc: false }], ['esc', { abs: true, tc: true, esc: true }]]) {
    const car = new Car();
    const radius = 60;
    let steer = 0, maxBeta = 0, dist = 0;
    for (let i = 0; i < 30000; i++) {
      const t = i * DT;
      if (t < 25) {
        const dx = car.x, dy = car.y - radius, err = Math.hypot(dx, dy) - radius;
        let he = Math.atan2(dy, dx) + Math.PI / 2 - car.yaw; he = Math.atan2(Math.sin(he), Math.cos(he));
        steer = Math.atan(car.L / radius) + 1.2 * he + 0.08 * err;
      }
      const thr = t < 25 ? Math.max(0, Math.min(1, (21 - car.vx) * 0.6)) : 0;
      let inp = car.autoShift({ steerAngle: steer, throttle: thr, brake: t >= 25 ? 1 : 0 });
      car.step(DT, inp, Object.assign({ autoClutch: true }, a), null);
      if (t > 25 && car.vx > 3) maxBeta = Math.max(maxBeta, Math.abs(Math.atan2(car.vy, Math.abs(car.vx))));
      if (t > 25) dist += car.speed * DT;
    }
    console.log(`brake in corner [${name}]: max body slip ${(maxBeta * 57.3).toFixed(1)} deg, stopping distance ${dist.toFixed(1)} m`);
  }
}
