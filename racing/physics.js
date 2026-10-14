// Vehicle dynamics for a rear-wheel-drive sports car.
// Planar chassis (x, y, yaw) + 4 independently spinning wheels, transient
// (relaxation-length) tyre model with a Magic-Formula combined-slip curve,
// sprung-mass roll/pitch dynamics for load transfer, engine/clutch/gearbox and
// a clutch-pack limited-slip differential solved as friction constraints.
// Units: SI. Body frame: x forward, y left, yaw counter-clockwise positive.
(function (root) {
  'use strict';

  const G = 9.81;
  const RHO = 1.225;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smoothstep(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
  function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        const [x0, y0] = table[i - 1], [x1, y1] = table[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return table[table.length - 1][1];
  }

  const RPM = 60 / (2 * Math.PI); // rad/s -> rpm

  const DEFAULTS = {
    mass: 1250,           // kg incl. driver
    izz: 1850,            // yaw inertia kg m^2
    a: 1.18,              // CG to front axle (m)
    b: 1.27,              // CG to rear axle (m)
    h: 0.47,              // CG height (m)
    trackF: 1.50, trackR: 1.50,
    rollCentreF: 0.06, rollCentreR: 0.10,
    rollStiffness: 140000, // Nm/rad total (about 2 deg/g)
    rollFrontShare: 0.57,
    rollInertia: 420, rollDampingRatio: 0.65,
    pitchStiffness: 290000, pitchInertia: 1650, pitchDampingRatio: 0.65,
    cdA: 0.62,            // drag coefficient * frontal area
    clA: 0.18,            // lift (downforce) coefficient * area
    aeroFront: 0.45,

    // wheels / tyres
    wheelRadius: 0.312,
    wheelInertia: 1.1,
    mu: 1.08,             // peak friction coefficient (performance road tyre)
    loadSens: 0.09,       // friction loss per unit of Fz/Fz0 above 1
    fz0: 3000,
    slipRatioPeak: 0.09,
    slipAnglePeak: 0.115, // rad (~6.6 deg)
    mfC: 1.45, mfE: 0.25,
    relaxX: 0.18, relaxY: 0.42, // relaxation lengths (m)
    rollingResist: 0.013,

    // steering
    maxSteer: 0.58,       // road-wheel lock (rad)
    ackermann: 0.5,

    // brakes
    brakeTorque: 5400,    // total Nm at full pedal
    brakeBias: 0.66,
    handbrakeTorque: 2400,

    // engine (net torque at wide-open throttle, Nm, vs rpm)
    torqueCurve: [[800, 120], [1500, 150], [2500, 172], [3500, 190], [4500, 203],
      [5500, 207], [6500, 198], [7200, 184], [7600, 168], [8000, 120]],
    engineInertia: 0.17,
    idleRpm: 900, redline: 7500, limiterRpm: 7600,
    engineFriction: [18, 0.0045, 0.0000012], // Nm: c0 + c1*rpm + c2*rpm^2
    gears: [-3.44, 0, 3.63, 2.19, 1.54, 1.21, 1.00, 0.80], // R, N, 1..6
    finalDrive: 4.10,
    drivetrainEff: 0.90,
    clutchTorque: 480,
    shiftTime: 0.16,
    lsdPreload: 60, lsdPowerLock: 0.45, lsdCoastLock: 0.30,
  };

  // Magic Formula on normalised slip (peak at s = 1).
  function makeMF(C, E) {
    const X = Math.tan(Math.PI / (2 * C));
    let B = X;
    for (let i = 0; i < 40; i++) {
      const f = B * (1 - E) + E * Math.atan(B) - X;
      const df = (1 - E) + E / (1 + B * B);
      B -= f / df;
    }
    return function (s) {
      const bs = B * s;
      return Math.sin(C * Math.atan(bs - E * (bs - Math.atan(bs))));
    };
  }

  class Car {
    constructor(params) {
      this.p = Object.assign({}, DEFAULTS, params || {});
      const p = this.p;
      this.mf = makeMF(p.mfC, p.mfE);
      this.L = p.a + p.b;
      this.wheels = [];
      const pos = [[p.a, p.trackF / 2], [p.a, -p.trackF / 2], [-p.b, p.trackR / 2], [-p.b, -p.trackR / 2]];
      for (let i = 0; i < 4; i++) {
        this.wheels.push({
          x: pos[i][0], y: pos[i][1], front: i < 2,
          omega: 0, angle: 0, steer: 0,
          u: 0, v: 0,            // tyre carcass deflections (m)
          fz: 0, fx: 0, fy: 0,
          slipRatio: 0, slipAngle: 0, slide: 0, // diagnostics
          load: 0, mu: p.mu, rr: p.rollingResist, surface: 0,
          absFactor: 1, wx: 0, wy: 0, vxw: 0,
        });
      }
      this.reset(0, 0, 0);
    }

    reset(x, y, yaw) {
      this.x = x; this.y = y; this.yaw = yaw;
      this.vx = 0; this.vy = 0; this.r = 0;
      this.ax = 0; this.ay = 0;
      this.roll = 0; this.rollRate = 0; this.pitch = 0; this.pitchRate = 0;
      this.steer = 0;
      this.engineOmega = this.p.idleRpm / RPM;
      this.gear = 2; // index into gears: 0=R, 1=N, 2=1st
      this.clutch = 0; this.clutchLocked = false;
      this.shiftTimer = 0; this.pendingGear = -1; this.shiftDir = 0;
      this.lastShift = 0; this.time = 0;
      this.limiterCut = false;
      this.throttleOut = 0; this.tcCut = 0;
      this.engineTorque = 0;
      for (const w of this.wheels) { w.omega = 0; w.u = 0; w.v = 0; w.absFactor = 1; }
      this.updateWheelWorld();
    }

    get speed() { return Math.hypot(this.vx, this.vy); }
    get rpm() { return this.engineOmega * RPM; }
    get gearLabel() { return this.gear === 0 ? 'R' : this.gear === 1 ? 'N' : String(this.gear - 1); }
    ratio(gear) { return this.p.gears[gear] * this.p.finalDrive; }

    requestShift(dir) {
      if (this.shiftTimer > 0) return;
      const target = this.gear + dir;
      if (target < 0 || target >= this.p.gears.length) return;
      // do not over-rev on a downshift
      if (target >= 2 && dir < 0) {
        const wheelOmega = (this.wheels[2].omega + this.wheels[3].omega) / 2;
        if (Math.abs(wheelOmega * this.ratio(target)) * RPM > this.p.limiterRpm + 300) return;
      }
      this.pendingGear = target;
      this.shiftDir = dir;
      this.shiftTimer = this.p.shiftTime;
      this.lastShift = this.time;
    }

    // Automatic gearbox logic. Returns the (possibly swapped) pedals so that
    // holding the brake at a standstill selects reverse, like most games.
    autoShift(input) {
      const p = this.p;
      if (this.shiftTimer > 0) return input;
      const fwd = this.vx;
      const out = Object.assign({}, input);
      if (this.gear === 0) {
        // reverse: brake pedal drives backwards, throttle brakes
        out.throttle = input.brake; out.brake = input.throttle;
        if (fwd > -0.5 && input.throttle > 0.1 && input.brake < 0.05) this.requestShift(+2);
        return out;
      }
      if (this.gear === 1) { this.requestShift(+1); return out; }
      if (fwd < 0.8 && input.brake > 0.3 && input.throttle < 0.05 && this.gear === 2) {
        this.stopTimer = (this.stopTimer || 0) + 1;
        if (this.stopTimer > 300) { this.stopTimer = 0; this.requestShift(-2); }
        return out;
      }
      this.stopTimer = 0;
      if (this.time - this.lastShift < 0.45) return out;
      const rearOmega = (this.wheels[2].omega + this.wheels[3].omega) / 2;
      const rpm = this.rpm;
      const top = p.gears.length - 1;
      const upAt = p.redline - 250 - (1 - input.throttle) * 2800;
      // judge the shift point on road speed (front wheels) so wheelspin does not trigger early upshifts
      const groundRpm = Math.abs((this.wheels[0].omega + this.wheels[1].omega) / 2 * this.ratio(this.gear)) * RPM;
      if (this.gear < top && groundRpm > upAt && rpm > upAt && this.clutchLocked && input.throttle > 0.05) { this.requestShift(+1); return out; }
      if (this.gear < top && groundRpm > p.redline + 50) { this.requestShift(+1); return out; }
      if (this.gear > 2) {
        const lowerRpm = Math.abs(rearOmega * this.ratio(this.gear - 1)) * RPM;
        const braking = input.brake > 0.1;
        if ((braking && lowerRpm < p.redline - 900) || (lowerRpm < 3000) || (input.throttle > 0.9 && lowerRpm < p.redline - 1800 && rpm < 3400 && Math.abs(this.ay) < 4)) {
          this.requestShift(-1);
        }
      }
      return out;
    }

    updateWheelWorld() {
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      for (const w of this.wheels) {
        w.wx = this.x + w.x * c - w.y * s;
        w.wy = this.y + w.x * s + w.y * c;
      }
    }

    // input: {steer[-1..1 => road wheel angle fraction], throttle, brake, handbrake, clutch(optional)}
    // aids: {abs, tc, autoClutch}
    // surfaceAt(x, y, wheel) -> {mu: factor, rr: rolling resist coefficient, id}
    step(dt, input, aids, surfaceAt) {
      const p = this.p, m = p.mass, ws = this.wheels;
      this.time += dt;

      // ---- steering geometry (Ackermann) ----
      const delta = clamp(input.steerAngle, -p.maxSteer, p.maxSteer);
      this.steer = delta;
      if (Math.abs(delta) > 1e-4) {
        const R = this.L / Math.tan(delta);
        const dl = Math.atan(this.L / (R - p.trackF / 2));
        const dr = Math.atan(this.L / (R + p.trackF / 2));
        ws[0].steer = lerp(delta, dl, p.ackermann);
        ws[1].steer = lerp(delta, dr, p.ackermann);
      } else { ws[0].steer = ws[1].steer = delta; }
      ws[2].steer = ws[3].steer = 0;

      // ---- vertical loads: static + aero + geometric + elastic (roll/pitch states) ----
      const v2 = this.vx * this.vx;
      const down = 0.5 * RHO * p.clA * v2;
      const staticF = m * G * p.b / this.L / 2 + down * p.aeroFront / 2;
      const staticR = m * G * p.a / this.L / 2 + down * (1 - p.aeroFront) / 2;
      const kRollF = p.rollStiffness * p.rollFrontShare, kRollR = p.rollStiffness * (1 - p.rollFrontShare);
      const latF = kRollF * this.roll / p.trackF + m * this.ay * (p.b / this.L) * p.rollCentreF / p.trackF;
      const latR = kRollR * this.roll / p.trackR + m * this.ay * (p.a / this.L) * p.rollCentreR / p.trackR;
      const lon = p.pitchStiffness * this.pitch / this.L / 2; // + = rear loaded
      ws[0].fz = staticF - latF - lon; ws[1].fz = staticF + latF - lon;
      ws[2].fz = staticR - latR + lon; ws[3].fz = staticR + latR + lon;
      for (const w of ws) if (w.fz < 0) w.fz = 0;

      // ---- tyre forces ----
      const R = p.wheelRadius;
      let fxSum = 0, fySum = 0, mz = 0;
      for (let i = 0; i < 4; i++) {
        const w = ws[i];
        const surf = surfaceAt ? surfaceAt(w.wx, w.wy, i) : null;
        const muS = surf ? surf.mu : 1, rr = surf ? surf.rr : p.rollingResist;
        w.surface = surf ? surf.id : 0; w.rr = rr;
        // contact patch velocity in body frame then wheel frame
        const vbx = this.vx - this.r * w.y;
        const vby = this.vy + this.r * w.x;
        const cs = Math.cos(w.steer), sn = Math.sin(w.steer);
        const vx = vbx * cs + vby * sn;
        const vy = -vbx * sn + vby * cs;
        w.vxw = vx;
        const vsx = vx - w.omega * R; // longitudinal slip velocity
        const vsy = vy;
        const avx = Math.abs(vx);
        // carcass deflection, implicit first-order relaxation
        w.u = (w.u - vsx * dt) / (1 + avx * dt / p.relaxX);
        w.v = (w.v - vsy * dt) / (1 + avx * dt / p.relaxY);
        const uMax = p.relaxX * 1.2, vMax = p.relaxY * 1.2;
        w.u = clamp(w.u, -uMax, uMax); w.v = clamp(w.v, -vMax, vMax);
        const kappa = w.u / p.relaxX;       // transient slip ratio
        const tanA = w.v / p.relaxY;        // transient tan(slip angle), sign = force dir
        const loadRatio = w.fz / p.fz0;
        const mu = p.mu * muS * (1 - p.loadSens * (loadRatio - 1));
        const peakScale = Math.pow(Math.max(loadRatio, 0.2), 0.25);
        const sx = kappa / p.slipRatioPeak;
        const sy = tanA / (Math.tan(p.slipAnglePeak) * peakScale);
        const s = Math.hypot(sx, sy);
        let fx = 0, fy = 0;
        if (s > 1e-9) {
          const f = mu * w.fz * this.mf(s);
          fx = f * sx / s; fy = f * sy / s;
        }
        // low-speed damping so the car settles without jitter
        const lowW = Math.max(0, 1 - avx / 3);
        if (lowW > 0) {
          fx += -2400 * vsx * lowW * Math.min(1, w.fz / p.fz0);
          fy += -3500 * vsy * lowW * Math.min(1, w.fz / p.fz0);
          const lim = mu * w.fz, mag = Math.hypot(fx, fy);
          if (mag > lim) { fx *= lim / mag; fy *= lim / mag; }
        }
        w.fx = fx; w.fy = fy; w.load = w.fz;
        w.slipRatio = avx > 0.5 ? -vsx / avx : 0;
        w.slipAngle = Math.atan2(-vsy, Math.max(avx, 0.5));
        w.slide = s; // >1 means past peak grip
        // to body frame
        const bx = fx * cs - fy * sn;
        const by = fx * sn + fy * cs;
        fxSum += bx; fySum += by;
        mz += w.x * by - w.y * bx;
      }

      // ---- aerodynamic drag ----
      const spd = this.speed;
      const drag = 0.5 * RHO * p.cdA * spd;
      fxSum -= drag * this.vx;
      fySum -= drag * this.vy;

      // ---- driver aids: ABS / TC ----
      const throttleIn = clamp(input.throttle, 0, 1);
      const brake = clamp(input.brake, 0, 1);
      for (const w of ws) {
        if (aids.abs && (brake > 0.05 || this.escActive) && Math.abs(w.vxw) > 2) {
          const k = (w.omega * R - w.vxw) / Math.abs(w.vxw);
          const target = -p.slipRatioPeak * 0.95;
          w.absFactor = clamp(w.absFactor + dt * 30 * (k - target) / p.slipRatioPeak, 0.05, 1);
        } else {
          w.absFactor = Math.min(1, w.absFactor + dt * 8);
        }
      }
      let throttle = throttleIn;
      if (aids.tc && this.gear >= 2) {
        const vRef = Math.max(Math.abs((ws[0].vxw + ws[1].vxw) / 2), 1.5);
        const slipL = (ws[2].omega * R - vRef) / vRef, slipR = (ws[3].omega * R - vRef) / vRef;
        const sl = Math.max(slipL, slipR); // longitudinal wheelspin
        const target = p.slipRatioPeak * 0.95 + 0.3 / vRef; // looser at very low speed
        let e = (sl - target) / p.slipRatioPeak;
        // driven tyre already saturated by cornering + drive: trim torque too
        for (const w of [ws[2], ws[3]]) if (w.u > 0.002 && w.fz > 500) e = Math.max(e, (w.slide - 1.0) * 1.5);
        this.tcInt = clamp((this.tcInt || 0) + dt * 15 * e, 0, 1);
        this.tcCut = clamp(this.tcInt + 0.6 * e, 0, 1);
      } else { this.tcCut = 0; this.tcInt = 0; }
      if (this.tcCut > 0) {
        // cut torque, but not into engine braking (which would unsettle the rear)
        const rpm0 = this.rpm, ef0 = p.engineFriction;
        const fr0 = ef0[0] + ef0[1] * rpm0 + ef0[2] * rpm0 * rpm0;
        const thZero = fr0 / (interp(p.torqueCurve, rpm0) + fr0);
        throttle = Math.max(throttle * (1 - this.tcCut), Math.min(throttleIn, thZero));
      }
      // stability control: brake the outside front wheel when the car yaws
      // faster than the driver asks for (oversteer), and trim throttle.
      this.escBrake = [0, 0, 0, 0];
      this.escActive = false;
      if (aids.esc && this.vx > 5) {
        const vxs = this.vx;
        const rRef = clamp(vxs * delta / (this.L + 0.001 * vxs * vxs), -1.1 * p.mu * G / vxs, 1.1 * p.mu * G / vxs);
        const beta = Math.atan2(this.vy, vxs);
        // oversteer: yawing harder than requested in the same direction, or yawing against the request
        let over = 0;
        if (this.r * rRef > 0 && Math.abs(this.r) > Math.abs(rRef)) over = Math.abs(this.r) - Math.abs(rRef) * 1.12 - 0.07;
        else if (this.r * rRef < 0 && Math.abs(this.r) > 0.05) over = Math.abs(this.r) - 0.05;
        over = Math.max(over, Math.abs(beta) - 0.1);
        if (over > 0) {
          const amt = clamp(over * 3.5, 0, 1);
          // r>0 = turning left: outside front is the right one (index 1)
          const dir = Math.abs(beta) > 0.1 ? -Math.sign(beta) : Math.sign(this.r);
          this.escBrake[dir > 0 ? 1 : 0] = amt * 1800;
          throttle *= 1 - clamp(amt * 1.2, 0, 0.7);
          this.escActive = true;
        }
      }

      // ---- gearbox / clutch management ----
      if (this.shiftTimer > 0) {
        this.shiftTimer -= dt;
        const half = p.shiftTime * 0.5;
        if (this.pendingGear >= 0 && this.shiftTimer < half) { this.gear = this.pendingGear; this.pendingGear = -1; }
        if (this.shiftTimer <= 0) { this.shiftTimer = 0; }
      }
      const rearOmega = (ws[2].omega + ws[3].omega) / 2;
      const ratio = this.ratio(this.gear);
      const rpm = this.rpm;
      let clutch;
      if (this.shiftTimer > 0) {
        clutch = this.shiftTimer > p.shiftTime * 0.35 ? 0 : 1 - this.shiftTimer / (p.shiftTime * 0.35);
        if (this.shiftDir > 0) throttle = 0;
        else if (this.gear >= 2 || this.pendingGear >= 2) { // rev-match blip on downshift
          const g = this.pendingGear >= 0 ? this.pendingGear : this.gear;
          const target = Math.abs(rearOmega * this.ratio(g)) * RPM;
          throttle = clamp((target - rpm) / 800, 0, 1);
        }
        this.clutchLocked = this.gear !== 1 && clutch > 0.99;
      } else if (input.clutch !== undefined && !aids.autoClutch) {
        clutch = 1 - clamp(input.clutch, 0, 1);
      } else {
        // automatic clutch: launch control by rpm, stays closed once locked
        if (this.gear === 1) { clutch = 0; this.clutchLocked = false; }
        else {
          const slip = Math.abs(this.engineOmega - rearOmega * ratio) * RPM;
          if (this.clutchLocked) {
            if (rpm < p.idleRpm + 150) this.clutchLocked = false;
          } else if (slip < 60 && rpm > p.idleRpm + 350) this.clutchLocked = true;
          if (this.clutchLocked) clutch = 1;
          else {
            const lo = p.idleRpm + 250 + 2200 * throttleIn;
            clutch = smoothstep(lo, lo + 1300, rpm);
            // brake held at a stop: keep the clutch open
            if (brake > 0.1 && throttleIn < 0.05) clutch = 0;
          }
        }
      }
      this.clutch = clutch;

      // ---- engine torque ----
      const ef = p.engineFriction;
      const fric = ef[0] + ef[1] * rpm + ef[2] * rpm * rpm;
      // idle controller
      const idleThrottle = clamp((p.idleRpm + 150 - rpm) / 250, 0, 1) * 0.3;
      let th = Math.max(throttle, idleThrottle);
      if (rpm > p.limiterRpm) this.limiterCut = true;
      else if (rpm < p.limiterRpm - 150) this.limiterCut = false;
      if (this.limiterCut) th = 0;
      this.throttleOut = th;
      const wot = interp(p.torqueCurve, rpm) + fric;
      const te = th * wot - fric;
      this.engineTorque = te;

      // ---- wheel/drivetrain velocity update with friction constraints ----
      // free velocity update: tyre reaction + rolling resistance
      const Iw = p.wheelInertia, Ie = p.engineInertia;
      for (const w of ws) {
        const rrT = w.rr * w.fz * R * Math.tanh(w.omega * R / 0.5);
        w.omega += (-w.fx * R - rrT) * dt / Iw;
      }
      this.engineOmega += te * dt / Ie;

      // brake capacities (impulse)
      const bt = p.brakeTorque * brake;
      const cap = [
        (bt * p.brakeBias / 2 + this.escBrake[0]) * ws[0].absFactor,
        (bt * p.brakeBias / 2 + this.escBrake[1]) * ws[1].absFactor,
        bt * (1 - p.brakeBias) / 2 * ws[2].absFactor + clamp(input.handbrake || 0, 0, 1) * p.handbrakeTorque / 2,
        bt * (1 - p.brakeBias) / 2 * ws[3].absFactor + clamp(input.handbrake || 0, 0, 1) * p.handbrakeTorque / 2,
      ];
      // front wheels: independent friction clamp
      for (let i = 0; i < 2; i++) {
        const w = ws[i], c = cap[i] * dt / Iw;
        w.omega = Math.abs(w.omega) <= c ? 0 : w.omega - Math.sign(w.omega) * c;
      }
      // rear axle + engine: sequential impulses on clutch, LSD and brakes
      const wl = ws[2], wr = ws[3];
      const Gr = this.gear === 1 ? 0 : ratio;
      const clutchCap = p.clutchTorque * clutch * dt;
      const driveT = Math.abs(te * Gr);
      const lockCoef = te >= 0 ? p.lsdPowerLock : p.lsdCoastLock;
      const lsdCap = (p.lsdPreload + lockCoef * driveT) * dt;
      let lc = 0, ld = 0, lb2 = 0, lb3 = 0;
      const mClutch = Gr !== 0 ? 1 / (1 / Ie + Gr * Gr / (2 * Iw)) : 0;
      const mDiff = Iw / 2;
      for (let it = 0; it < 10; it++) {
        if (Gr !== 0 && clutchCap > 0) {
          const cdot = this.engineOmega - Gr * (wl.omega + wr.omega) / 2;
          let d = -cdot * mClutch;
          const nl = clamp(lc + d, -clutchCap, clutchCap); d = nl - lc; lc = nl;
          this.engineOmega += d / Ie;
          wl.omega -= d * Gr / 2 / Iw; wr.omega -= d * Gr / 2 / Iw;
        }
        {
          const cdot = wl.omega - wr.omega;
          let d = -cdot * mDiff;
          const nl = clamp(ld + d, -lsdCap, lsdCap); d = nl - ld; ld = nl;
          wl.omega += d / Iw; wr.omega -= d / Iw;
        }
        {
          const c2 = cap[2] * dt, c3 = cap[3] * dt;
          // effective inertia of a rear wheel includes the coupled engine when locked
          let d = -wl.omega * Iw;
          let nl = clamp(lb2 + d, -c2, c2); d = nl - lb2; lb2 = nl; wl.omega += d / Iw;
          d = -wr.omega * Iw;
          nl = clamp(lb3 + d, -c3, c3); d = nl - lb3; lb3 = nl; wr.omega += d / Iw;
        }
      }
      if (this.engineOmega < 0) this.engineOmega = 0;
      // stall protection is handled by the auto clutch; keep a minimum to avoid a dead engine
      if (this.engineOmega * RPM < 450) this.engineOmega = 450 / RPM;
      this.clutchTorque = lc / dt;
      for (const w of ws) w.angle += w.omega * dt;

      // ---- chassis integration (semi-implicit Euler) ----
      const axb = fxSum / m, ayb = fySum / m;
      this.vx += (axb + this.r * this.vy) * dt;
      this.vy += (ayb - this.r * this.vx) * dt;
      this.r += mz / p.izz * dt;
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      this.x += (this.vx * c - this.vy * s) * dt;
      this.y += (this.vx * s + this.vy * c) * dt;
      this.yaw += this.r * dt;
      // smoothed accelerations for load transfer (sensor-like)
      this.ax = axb; this.ay = ayb;

      // ---- sprung mass roll / pitch ----
      const hr = this.h_roll || (this.h_roll = p.h - (p.rollCentreF * p.b + p.rollCentreR * p.a) / this.L);
      const cr = 2 * p.rollDampingRatio * Math.sqrt(p.rollStiffness * p.rollInertia);
      this.rollRate += (m * this.ay * hr - p.rollStiffness * this.roll - cr * this.rollRate) / p.rollInertia * dt;
      this.roll += this.rollRate * dt;
      const cp = 2 * p.pitchDampingRatio * Math.sqrt(p.pitchStiffness * p.pitchInertia);
      this.pitchRate += (m * this.ax * p.h - p.pitchStiffness * this.pitch - cp * this.pitchRate) / p.pitchInertia * dt;
      this.pitch += this.pitchRate * dt;

      this.updateWheelWorld();
    }
  }

  const api = { Car, DEFAULTS, clamp, lerp, smoothstep, RPM, G };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RacePhysics = api;
})(this);
