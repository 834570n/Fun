// Circuit geometry, surface lookup, barrier collisions and lap timing.
(function (root) {
  'use strict';

  const D2R = Math.PI / 180;

  // Turtle description of the circuit (clockwise). 'S' = straight (m),
  // 'A' = arc (radius m, turn deg; negative = right). Two straights are
  // marked `solve` and get their lengths adjusted so the loop closes exactly.
  const LAYOUT = [
    ['S', 600, 'solve'],     // main straight (east)
    ['A', 30, -90],          // T1 heavy-braking right
    ['S', 160],
    ['A', 70, 45],           // T2 left kink
    ['A', 50, -90],          // T3 right
    ['S', 220],
    ['A', 150, -45],         // T4 fast right sweeper
    ['S', 380],              // back straight (west)
    ['A', 16, -55],          // T5/T6 chicane
    ['A', 16, 55],
    ['S', 120],
    ['A', 20, -90],          // T7 tight right
    ['S', 60],
    ['A', 70, 35],           // T8/T9 esses
    ['A', 70, -35],
    ['S', 120, 'solve'],     // run north
    ['A', 60, 60],           // T10 left
    ['A', 35, -120],         // T11 long right
    ['S', 100],
    ['A', 60, -30],          // T12 onto the straight
  ];

  const HALF_WIDTH = 6;      // asphalt half width (m)
  const CURB_WIDTH = 1.2;
  const RUNOFF = 17;         // grass between asphalt edge and barrier

  function buildCenterline(layout) {
    // returns dense points (0.5 m) after closing the loop
    function trace(segs) {
      const pts = [];
      let x = 0, y = 0, h = 0;
      pts.push([x, y]);
      for (const sg of segs) {
        if (sg[0] === 'S') {
          const n = Math.max(1, Math.ceil(sg[1] / 0.5));
          const ds = sg[1] / n;
          for (let i = 0; i < n; i++) { x += Math.cos(h) * ds; y += Math.sin(h) * ds; pts.push([x, y]); }
        } else {
          const R = sg[1], ang = sg[2] * D2R;
          const len = Math.abs(ang) * R;
          const n = Math.max(2, Math.ceil(len / 0.5));
          const dth = ang / n, ds = len / n;
          for (let i = 0; i < n; i++) {
            h += dth / 2; x += Math.cos(h) * ds; y += Math.sin(h) * ds; h += dth / 2; pts.push([x, y]);
          }
        }
      }
      return { pts, x, y, h };
    }
    const segs = layout.map(s => s.slice());
    const solveIdx = segs.map((s, i) => s[2] === 'solve' ? i : -1).filter(i => i >= 0);
    // heading at each solve straight
    function headingAt(idx) {
      let h = 0;
      for (let i = 0; i < idx; i++) if (segs[i][0] === 'A') h += segs[i][2] * D2R;
      return h;
    }
    const h1 = headingAt(solveIdx[0]), h2 = headingAt(solveIdx[1]);
    const end = trace(segs);
    // L1*d1 + L2*d2 = -err
    const ex = -end.x, ey = -end.y;
    const a = Math.cos(h1), b = Math.cos(h2), c = Math.sin(h1), d = Math.sin(h2);
    const det = a * d - b * c;
    const dl1 = (ex * d - b * ey) / det, dl2 = (a * ey - c * ex) / det;
    segs[solveIdx[0]][1] += dl1; segs[solveIdx[1]][1] += dl2;
    const res = trace(segs);
    res.pts.pop(); // last point == first
    return { pts: res.pts, solved: [segs[solveIdx[0]][1], segs[solveIdx[1]][1]] };
  }

  function resample(pts, spacing) {
    const n = pts.length;
    const cum = [0];
    for (let i = 1; i <= n; i++) {
      const p0 = pts[i - 1], p1 = pts[i % n];
      cum.push(cum[i - 1] + Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
    }
    const total = cum[n];
    const m = Math.round(total / spacing);
    const out = [];
    let j = 0;
    for (let k = 0; k < m; k++) {
      const s = k * total / m;
      while (cum[j + 1] < s) j++;
      const t = (s - cum[j]) / (cum[j + 1] - cum[j]);
      const p0 = pts[j], p1 = pts[(j + 1) % n];
      out.push([p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t]);
    }
    return out;
  }

  function smooth(pts, passes) {
    let a = pts;
    const n = a.length;
    for (let p = 0; p < passes; p++) {
      const b = new Array(n);
      for (let i = 0; i < n; i++) {
        const q0 = a[(i - 1 + n) % n], q1 = a[i], q2 = a[(i + 1) % n];
        b[i] = [0.25 * q0[0] + 0.5 * q1[0] + 0.25 * q2[0], 0.25 * q0[1] + 0.5 * q1[1] + 0.25 * q2[1]];
      }
      a = b;
    }
    return a;
  }

  class Track {
    constructor() {
      const cl = buildCenterline(LAYOUT);
      this.solved = cl.solved;
      let pts = resample(cl.pts, 1.0);
      pts = smooth(pts, 30);           // eases straight->arc transitions
      pts = resample(pts, 2.0);
      // put the start/finish line 150 m down the main straight
      const shift = 75;
      pts = pts.slice(shift).concat(pts.slice(0, shift));
      this.halfWidth = HALF_WIDTH;
      this.curbWidth = CURB_WIDTH;
      this.wall = HALF_WIDTH + RUNOFF;
      const n = pts.length;
      this.n = n;
      this.px = new Float64Array(n); this.py = new Float64Array(n);
      this.tx = new Float64Array(n); this.ty = new Float64Array(n);
      this.s = new Float64Array(n); this.k = new Float64Array(n);
      this.curbL = new Uint8Array(n); this.curbR = new Uint8Array(n);
      for (let i = 0; i < n; i++) { this.px[i] = pts[i][0]; this.py[i] = pts[i][1]; }
      let s = 0;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, h = (i - 1 + n) % n;
        const dx = this.px[j] - this.px[h], dy = this.py[j] - this.py[h];
        const l = Math.hypot(dx, dy);
        this.tx[i] = dx / l; this.ty[i] = dy / l;
        this.s[i] = s;
        s += Math.hypot(this.px[j] - this.px[i], this.py[j] - this.py[i]);
      }
      this.length = s;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, h = (i - 1 + n) % n;
        const a1 = Math.atan2(this.ty[i], this.tx[i]) - Math.atan2(this.ty[h], this.tx[h]);
        const a2 = Math.atan2(this.ty[j], this.tx[j]) - Math.atan2(this.ty[i], this.tx[i]);
        const w = x => Math.atan2(Math.sin(x), Math.cos(x));
        this.k[i] = (w(a1) + w(a2)) / 2 / 2.0;
      }
      // curbs where the corner is tight enough, extended a bit on both ends
      const raw = new Int8Array(n);
      for (let i = 0; i < n; i++) raw[i] = Math.abs(this.k[i]) > 1 / 130 ? Math.sign(this.k[i]) : 0;
      for (let i = 0; i < n; i++) {
        let c = 0;
        for (let d = -6; d <= 6; d++) c += raw[(i + d + n) % n];
        if (c !== 0) { this.curbL[i] = 1; this.curbR[i] = 1; }
      }
      // sector boundaries (indices)
      this.sectors = [0, Math.floor(n / 3), Math.floor(2 * n / 3)];
      this.surfaces = {
        0: { id: 0, mu: 1.0, rr: 0.013, name: 'asphalt' },
        1: { id: 1, mu: 0.92, rr: 0.02, name: 'curb' },
        2: { id: 2, mu: 0.55, rr: 0.07, name: 'grass' },
      };
    }

    // nearest centerline point, searching locally around `hint` if given
    nearest(x, y, hint) {
      const n = this.n;
      let best = -1, bd = Infinity;
      if (hint === undefined || hint < 0) {
        for (let i = 0; i < n; i++) {
          const d = (this.px[i] - x) ** 2 + (this.py[i] - y) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      } else {
        for (let o = -30; o <= 30; o++) {
          const i = (hint + o + n) % n;
          const d = (this.px[i] - x) ** 2 + (this.py[i] - y) ** 2;
          if (d < bd) { bd = d; best = i; }
        }
      }
      return best;
    }

    // projection: {i, s, lat} (lat positive = left of travel direction)
    project(x, y, hint) {
      const i = this.nearest(x, y, hint);
      const n = this.n;
      const dx = x - this.px[i], dy = y - this.py[i];
      const along = dx * this.tx[i] + dy * this.ty[i];
      const lat = -dx * this.ty[i] + dy * this.tx[i];
      let s = this.s[i] + along;
      if (s < 0) s += this.length; else if (s >= this.length) s -= this.length;
      return { i, s, lat };
    }

    surfaceAt(x, y, hint) {
      const pr = this.project(x, y, hint);
      const a = Math.abs(pr.lat);
      if (a <= this.halfWidth) return this.surfaces[0];
      const curb = pr.lat > 0 ? this.curbL[pr.i] : this.curbR[pr.i];
      if (curb && a <= this.halfWidth + this.curbWidth) return this.surfaces[1];
      return this.surfaces[2];
    }

    // pose on the centerline at distance s (for spawning)
    poseAt(s) {
      s = ((s % this.length) + this.length) % this.length;
      let i = 0;
      while (i < this.n - 1 && this.s[i + 1] <= s) i++;
      const f = s - this.s[i];
      return { x: this.px[i] + this.tx[i] * f, y: this.py[i] + this.ty[i] * f, yaw: Math.atan2(this.ty[i], this.tx[i]), i };
    }

    // barrier contact for the car body corners (impulse based)
    collide(car, hint) {
      const halfL = 2.05, halfW = 0.88;
      const corners = [[halfL, halfW], [halfL, -halfW], [-halfL, halfW], [-halfL, -halfW]];
      const m = car.p.mass, I = car.p.izz;
      let hit = 0;
      for (const [cx, cy] of corners) {
        const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
        const wx = car.x + cx * c - cy * s, wy = car.y + cx * s + cy * c;
        const pr = this.project(wx, wy, hint);
        const pen = Math.abs(pr.lat) - this.wall;
        if (pen <= 0) continue;
        const i = pr.i;
        const sgn = Math.sign(pr.lat);
        // normal pointing back toward the track (world)
        const nx = sgn * this.ty[i], ny = -sgn * this.tx[i];
        car.x += nx * pen; car.y += ny * pen;
        // velocity of the contact point (world)
        const vwx = car.vx * c - car.vy * s, vwy = car.vx * s + car.vy * c;
        const rx = wx - car.x, ry = wy - car.y;
        const pvx = vwx - car.r * ry, pvy = vwy + car.r * rx;
        const vn = pvx * nx + pvy * ny;
        if (vn >= 0) continue;
        const rn = rx * ny - ry * nx;
        const jn = -(1 + 0.25) * vn / (1 / m + rn * rn / I);
        // friction along the wall
        const tx = -ny, ty = nx;
        const vt = pvx * tx + pvy * ty;
        const rt = rx * ty - ry * tx;
        let jt = -vt / (1 / m + rt * rt / I);
        jt = Math.max(-0.45 * jn, Math.min(0.45 * jn, jt));
        const jx = nx * jn + tx * jt, jy = ny * jn + ty * jt;
        const nvx = vwx + jx / m, nvy = vwy + jy / m;
        car.r += (rx * jy - ry * jx) / I;
        car.vx = nvx * c + nvy * s;
        car.vy = -nvx * s + nvy * c;
        hit = Math.max(hit, -vn);
      }
      if (hit > 0) car.updateWheelWorld();
      return hit;
    }
  }

  // Lap timer driven by track progress
  class LapTimer {
    constructor(track) {
      this.track = track; this.reset();
      try { this.best = parseFloat(localStorage.getItem('rs_best')) || null; } catch (e) { this.best = null; }
    }
    reset() {
      this.lapStart = null; this.current = 0; this.last = null;
      this.sectorFlags = [false, false, false]; this.lastS = null; this.valid = true;
      this.splits = []; this.bestSplits = this.bestSplits || null;
      this.lapCount = 0;
    }
    update(t, s, offTrack) {
      const L = this.track.length;
      if (this.lastS !== null) {
        const crossedLine = this.lastS > L - 60 && s < 60;
        if (crossedLine) {
          if (this.lapStart !== null && this.sectorFlags[1] && this.sectorFlags[2]) {
            const lap = t - this.lapStart;
            this.last = lap; this.lastValid = this.valid; this.lapCount++;
            if (this.valid && (this.best === null || lap < this.best)) {
              this.best = lap;
              try { localStorage.setItem('rs_best', String(lap)); } catch (e) { /* ignore */ }
            }
          }
          this.lapStart = t; this.sectorFlags = [true, false, false]; this.valid = true;
        }
        if (s > L / 3 && s < L / 3 + 100 && this.sectorFlags[0]) this.sectorFlags[1] = true;
        if (s > 2 * L / 3 && s < 2 * L / 3 + 100 && this.sectorFlags[1]) this.sectorFlags[2] = true;
      }
      if (offTrack) this.valid = false;
      this.lastS = s;
      this.current = this.lapStart === null ? 0 : t - this.lapStart;
    }
  }

  const api = { Track, LapTimer, LAYOUT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, { RaceTrack: api });
})(this);
