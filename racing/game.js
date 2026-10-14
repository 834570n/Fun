/* global THREE, RacePhysics, RaceTrack */
(function () {
  'use strict';
  const { Car, clamp } = RacePhysics;
  const { Track, LapTimer } = RaceTrack;
  const DT = 1 / 1000;
  const $ = id => document.getElementById(id);

  // ---------------- settings ----------------
  const settings = { aids: 'full', box: 'auto', sens: 1.0, cam: 0 };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('rs_settings') || '{}')); } catch (e) { /* ignore */ }
  function saveSettings() { try { localStorage.setItem('rs_settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }
  const AID_TEXT = {
    full: 'ABS, traction control, stability control, speed-sensitive steering and counter-steer help.',
    sport: 'ABS and traction control only. Steering is speed-sensitive. The rear can step out under power.',
    off: 'No electronic help and direct steering. Expect wheelspin, lock-ups and snap oversteer.',
  };
  function aidFlags() {
    return {
      abs: settings.aids !== 'off', tc: settings.aids !== 'off', esc: settings.aids === 'full',
      autoClutch: true, steerAssist: settings.aids !== 'off', counterSteer: settings.aids === 'full',
    };
  }

  // ---------------- simulation objects ----------------
  const track = new Track();
  const car = new Car();
  const timer = new LapTimer(track);
  let hint = 0;
  function placeAtStart() {
    const pose = track.poseAt(-25);
    car.reset(pose.x, pose.y, pose.yaw);
    hint = pose.i;
    timer.reset();
  }
  function resetToTrack() {
    const pr = track.project(car.x, car.y, hint);
    const pose = track.poseAt(pr.s - 5);
    car.reset(pose.x, pose.y, pose.yaw);
    hint = pose.i;
    timer.valid = false;
    flash('RESET');
  }
  placeAtStart();

  // ---------------- three.js scene ----------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  $('view').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const sky = new THREE.Color(0x9cc4dd);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 250, 1300);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3000);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x445533, 0.75));
  const sun = new THREE.DirectionalLight(0xfff4e0, 0.75);
  sun.position.set(-300, 500, 200);
  scene.add(sun);

  const W = (x, y, h) => new THREE.Vector3(x, h || 0, -y); // physics -> three

  function noiseTexture(size, base, vary, lines) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const n = (Math.random() - 0.5) * vary;
      img.data[i * 4] = clamp(base[0] + n, 0, 255);
      img.data[i * 4 + 1] = clamp(base[1] + n, 0, 255);
      img.data[i * 4 + 2] = clamp(base[2] + n, 0, 255);
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    if (lines) lines(g, size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t;
  }

  // ground
  {
    const tex = noiseTexture(256, [78, 120, 58], 26, (g, s) => {
      g.fillStyle = 'rgba(40,80,30,0.25)';
      for (let i = 0; i < 40; i++) g.fillRect(Math.random() * s, Math.random() * s, 30, 3);
    });
    tex.repeat.set(400, 400);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(300, 0, 300);
    flat(ground, -3);
    scene.add(ground);
  }

  // Flat ground layers are drawn first, in order, without depth writes:
  // no z-fighting regardless of depth-buffer precision.
  function flat(mesh, order) { mesh.renderOrder = order; mesh.material.depthWrite = false; return mesh; }

  // ribbon helper along the centreline between two lateral offsets
  function ribbon(lat0, lat1, h, opts) {
    const n = track.n, pos = [], uv = [], col = [], idx = [];
    const step = opts.step || 1;
    let vi = 0;
    for (let k = 0; k <= n; k += step) {
      const i = k % n;
      const nx = -track.ty[i], ny = track.tx[i];
      const a = W(track.px[i] + nx * lat0, track.py[i] + ny * lat0, h);
      const b = W(track.px[i] + nx * lat1, track.py[i] + ny * lat1, opts.h1 !== undefined ? opts.h1 : h);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      const v = (k === n ? track.length : track.s[i]) / (opts.uvLen || 10);
      uv.push(0, v, 1, v);
      if (opts.color) { const c = opts.color(i, k); col.push(c[0], c[1], c[2], c[0], c[1], c[2]); }
      if (k > 0 && (!opts.include || opts.include(i))) idx.push(vi - 2, vi, vi - 1, vi - 1, vi, vi + 1);
      vi += 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (opts.color) geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, opts.material);
    if (opts.layer !== undefined) flat(mesh, opts.layer);
    scene.add(mesh);
    return mesh;
  }

  const hw = track.halfWidth;
  {
    const asphalt = noiseTexture(256, [74, 76, 80], 22);
    asphalt.repeat.set(1, 1);
    ribbon(-hw - 0.3, hw + 0.3, 0.02, { material: new THREE.MeshLambertMaterial({ map: asphalt }), uvLen: 12, layer: -2 });
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2ee });
    ribbon(hw - 0.45, hw - 0.2, 0.03, { material: white, step: 1, layer: -1 });
    ribbon(-hw + 0.2, -hw + 0.45, 0.03, { material: white, step: 1, layer: -1 });
    // curbs (alternating red/white every 2 points = 4 m)
    const curbMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const cc = (i, k) => (Math.floor(k / 2) % 2 ? [0.85, 0.12, 0.1] : [0.95, 0.95, 0.95]);
    ribbon(hw, hw + track.curbWidth, 0.05, { material: curbMat, color: cc, include: i => track.curbL[i], h1: 0.02, layer: -1 });
    ribbon(-hw - track.curbWidth, -hw, 0.02, { material: curbMat, color: cc, include: i => track.curbR[i], h1: 0.05, layer: -1 });
    // barriers: vertical ribbons
    const barMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const bc = (i, k) => (Math.floor(k / 3) % 2 ? [0.9, 0.9, 0.9] : [0.15, 0.35, 0.75]);
    for (const sgn of [1, -1]) {
      const n = track.n, pos = [], col = [], idx = [];
      for (let k = 0; k <= n; k++) {
        const i = k % n;
        const nx = -track.ty[i], ny = track.tx[i], l = sgn * (track.wall + 0.6);
        const p = W(track.px[i] + nx * l, track.py[i] + ny * l, 0);
        pos.push(p.x, 0, p.z, p.x, 1.0, p.z);
        const c = bc(i, k); col.push(...c, ...c);
        if (k > 0) { const v = k * 2; idx.push(v - 2, v - 1, v, v - 1, v + 1, v); }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx); geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, barMat));
    }
    // start/finish line
    const c = document.createElement('canvas'); c.width = 128; c.height = 16;
    const g = c.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); }
    const sf = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 1.6), new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) }));
    const p0 = track.poseAt(0);
    sf.rotation.x = -Math.PI / 2; sf.rotation.z = p0.yaw + Math.PI / 2;
    sf.position.copy(W(p0.x, p0.y, 0.04));
    flat(sf, -1);
    scene.add(sf);
    // gantry over the line
    const gm = new THREE.MeshLambertMaterial({ color: 0x333a40 });
    const nx = -Math.sin(p0.yaw), ny = Math.cos(p0.yaw);
    for (const sgn of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5), gm);
      post.position.copy(W(p0.x + nx * sgn * (hw + 2), p0.y + ny * sgn * (hw + 2), 3.5));
      scene.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, hw * 2 + 4.5), gm);
    beam.position.copy(W(p0.x, p0.y, 7)); beam.rotation.y = p0.yaw;
    scene.add(beam);
  }

  // brake marker boards before corners
  {
    const mk = {};
    function boardMat(t) {
      if (mk[t]) return mk[t];
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#111'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(t, 32, 34);
      return (mk[t] = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(c) }));
    }
    const n = track.n;
    for (let i = 0; i < n; i++) {
      const k0 = Math.abs(track.k[(i - 1 + n) % n]), k1 = Math.abs(track.k[i]);
      if (k1 >= 1 / 60 && k0 < 1 / 60) {
        // need ~120 m of fairly straight track before
        let straight = true;
        for (let d = 10; d < 75; d++) if (Math.abs(track.k[(i - d + n) % n]) > 1 / 200) { straight = false; break; }
        if (!straight) continue;
        const side = -Math.sign(track.k[i]);
        for (const dist of [150, 100, 50]) {
          const pose = track.poseAt(track.s[i] - dist);
          const lx = -Math.sin(pose.yaw), ly = Math.cos(pose.yaw), off = side * (hw + 4);
          const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 1.2), boardMat(String(dist)));
          b.position.copy(W(pose.x + lx * off, pose.y + ly * off, 1.3));
          b.rotation.y = pose.yaw;
          scene.add(b);
          const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), boardMat('|'));
          pole.position.copy(W(pose.x + lx * off, pose.y + ly * off, 0.35));
          scene.add(pole);
        }
      }
    }
  }

  // trees and a grandstand, for a sense of speed
  {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const spots = [];
    let tries = 0;
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < track.n; i++) { minx = Math.min(minx, track.px[i]); maxx = Math.max(maxx, track.px[i]); miny = Math.min(miny, track.py[i]); maxy = Math.max(maxy, track.py[i]); }
    while (spots.length < 420 && tries < 20000) {
      tries++;
      const x = minx - 150 + rnd() * (maxx - minx + 300), y = miny - 150 + rnd() * (maxy - miny + 300);
      const i = track.nearest(x, y);
      const d = Math.hypot(x - track.px[i], y - track.py[i]);
      if (d < track.wall + 6 || d > track.wall + 120) continue;
      spots.push([x, y, 0.7 + rnd() * 0.8]);
    }
    const trunkG = new THREE.CylinderGeometry(0.25, 0.35, 3, 6);
    const crownG = new THREE.ConeGeometry(2.4, 7, 7);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: 0x5a4030 }), spots.length);
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: 0x2f5a2c }), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    spots.forEach(([x, y, s], i) => {
      sc.set(s, s, s);
      m.compose(W(x, y, 1.5 * s), q, sc); trunks.setMatrixAt(i, m);
      m.compose(W(x, y, (3 + 3.5) * s), q, sc); crowns.setMatrixAt(i, m);
    });
    scene.add(trunks, crowns);
    // grandstand along the main straight, outside
    const p = track.poseAt(80);
    const lx = -Math.sin(p.yaw), ly = Math.cos(p.yaw);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(120, 8, 12), new THREE.MeshLambertMaterial({ color: 0x8a8f99 }));
    const off = track.wall + 10;
    stand.position.copy(W(p.x + lx * off, p.y + ly * off, 4));
    stand.rotation.y = p.yaw;
    scene.add(stand);
  }

  // ---------------- car model ----------------
  const carGroup = new THREE.Group();
  const body = new THREE.Group();
  carGroup.add(body);
  {
    const paint = new THREE.MeshLambertMaterial({ color: 0xd8342c });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1b1f24 });
    const glass = new THREE.MeshLambertMaterial({ color: 0x2a3540 });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.4, 1.56), paint);
    lower.position.set(-0.05, 0.66, 0); body.add(lower);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.25, 1.5), dark);
    sill.position.set(-0.05, 0.36, 0); body.add(sill);
    for (const s of [1, -1]) for (const x of [car.p.a, -car.p.b]) {
      const arch = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.3), paint);
      arch.position.set(x, 0.72, s * 0.83); body.add(arch);
    }
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.7), paint);
    nose.position.set(1.45, 0.88, 0); body.add(nose);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.5), glass);
    cabin.position.set(-0.45, 1.07, 0); body.add(cabin);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 1.42), paint);
    roof.position.set(-0.55, 1.34, 0); body.add(roof);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 1.6), dark);
    wing.position.set(-1.95, 0.98, 0); body.add(wing);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x550000 });
    body.userData.lightMat = lightMat;
    for (const s of [1, -1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.35), lightMat);
      tl.position.set(-2.11, 0.7, s * 0.62); body.add(tl);
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.32), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }));
      hl.position.set(2.0, 0.7, s * 0.6); body.add(hl);
    }
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.0), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.045; flat(shadow, -1); carGroup.add(shadow);
  }
  const wheelMeshes = [];
  {
    const tyre = new THREE.MeshLambertMaterial({ color: 0x151515 });
    const rim = new THREE.MeshLambertMaterial({ color: 0xb8bcc2 });
    const R = car.p.wheelRadius;
    for (const w of car.wheels) {
      const pivot = new THREE.Group();
      pivot.position.set(w.x, R, -w.y);
      const spin = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.24, 18), tyre);
      t.rotation.x = Math.PI / 2;
      spin.add(t);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(R * 1.5, 0.08, 0.26), rim);
      spin.add(spoke);
      const spoke2 = spoke.clone(); spoke2.rotation.z = Math.PI / 2; spin.add(spoke2);
      pivot.add(spin);
      carGroup.add(pivot);
      wheelMeshes.push({ pivot, spin });
    }
  }
  scene.add(carGroup);

  // ---------------- skid marks ----------------
  const SKID_MAX = 3000;
  const skidPos = new Float32Array(SKID_MAX * 6 * 3);
  const skidAlpha = new Float32Array(SKID_MAX * 6);
  const skidGeo = new THREE.BufferGeometry();
  skidGeo.setAttribute('position', new THREE.BufferAttribute(skidPos, 3));
  const skidMesh = new THREE.Mesh(skidGeo, new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.55, depthWrite: false }));
  skidMesh.frustumCulled = false;
  flat(skidMesh, -1);
  scene.add(skidMesh);
  let skidHead = 0;
  const skidLast = [null, null, null, null];
  function addSkid(i, x, y, nx, ny) {
    const last = skidLast[i];
    if (last && Math.hypot(x - last[0], y - last[1]) < 0.35) return;
    if (last && Math.hypot(x - last[0], y - last[1]) < 3) {
      const hwid = 0.11;
      const a = W(last[0] + last[2] * hwid, last[1] + last[3] * hwid, 0.045), b = W(last[0] - last[2] * hwid, last[1] - last[3] * hwid, 0.045);
      const c = W(x + nx * hwid, y + ny * hwid, 0.045), d = W(x - nx * hwid, y - ny * hwid, 0.045);
      const o = skidHead * 18;
      const verts = [a, b, c, b, d, c];
      for (let k = 0; k < 6; k++) { skidPos[o + k * 3] = verts[k].x; skidPos[o + k * 3 + 1] = verts[k].y; skidPos[o + k * 3 + 2] = verts[k].z; }
      skidHead = (skidHead + 1) % SKID_MAX;
      skidGeo.attributes.position.needsUpdate = true;
    }
    skidLast[i] = [x, y, nx, ny];
  }

  // ---------------- input ----------------
  const input = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
  const keys = {};
  let steerTouch = null, steerOrigin = 0;
  const pedalTouch = { gasP: null, brakeP: null };
  const ring = $('touchring');

  function steerRange() { return clamp(window.innerWidth * 0.16, 70, 150); }
  const sz = $('steerzone');
  sz.addEventListener('pointerdown', e => {
    if (steerTouch !== null) return;
    steerTouch = e.pointerId; steerOrigin = e.clientX;
    sz.setPointerCapture(e.pointerId);
    ring.style.display = 'block'; ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px';
    $('steerhint').style.display = 'none';
  });
  sz.addEventListener('pointermove', e => {
    if (e.pointerId !== steerTouch) return;
    let dx = e.clientX - steerOrigin;
    const r = steerRange();
    // let the anchor follow if the finger overshoots, so returning the finger re-centres quickly
    if (dx > r) { steerOrigin = e.clientX - r; dx = r; }
    if (dx < -r) { steerOrigin = e.clientX + r; dx = -r; }
    input.steer = dx / r;
    ring.style.left = steerOrigin + 'px';
  });
  const endSteer = e => { if (e.pointerId === steerTouch) { steerTouch = null; input.steer = 0; ring.style.display = 'none'; } };
  sz.addEventListener('pointerup', endSteer); sz.addEventListener('pointercancel', endSteer);

  for (const id of ['gasP', 'brakeP']) {
    const el = $(id);
    const fill = el.querySelector('.fill');
    const setFrom = e => {
      const r = el.getBoundingClientRect();
      const v = clamp(0.3 + 0.7 * (1 - (e.clientY - r.top) / (r.height * 0.85)), 0.3, 1);
      if (id === 'gasP') input.throttle = v; else input.brake = v;
      fill.style.height = (v * 100) + '%';
    };
    el.addEventListener('pointerdown', e => { pedalTouch[id] = e.pointerId; el.setPointerCapture(e.pointerId); setFrom(e); });
    el.addEventListener('pointermove', e => { if (pedalTouch[id] === e.pointerId) setFrom(e); });
    const end = e => {
      if (pedalTouch[id] !== e.pointerId) return;
      pedalTouch[id] = null;
      if (id === 'gasP') input.throttle = 0; else input.brake = 0;
      fill.style.height = '0';
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  function holdButton(id, on, off) {
    const el = $(id);
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('down'); on(); });
    const end = () => { el.classList.remove('down'); if (off) off(); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('pointerleave', end);
  }
  holdButton('hbBtn', () => { input.handbrake = 1; }, () => { input.handbrake = 0; });
  holdButton('upBtn', () => car.requestShift(+1));
  holdButton('dnBtn', () => car.requestShift(-1));
  holdButton('camBtn', () => { settings.cam = (settings.cam + 1) % 3; saveSettings(); });
  holdButton('resetBtn', () => resetToTrack());
  holdButton('menuBtn', () => openMenu());

  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyE' || e.code === 'ShiftRight') car.requestShift(+1);
    if (e.code === 'KeyQ' || e.code === 'ControlRight') car.requestShift(-1);
    if (e.code === 'KeyR') resetToTrack();
    if (e.code === 'KeyC') { settings.cam = (settings.cam + 1) % 3; saveSettings(); }
    if (e.code === 'Escape') openMenu();
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  let kbSteer = 0;
  function keyboardInput(dt) {
    const l = keys.ArrowLeft || keys.KeyA, r = keys.ArrowRight || keys.KeyD;
    const target = (l ? 1 : 0) - (r ? 1 : 0); // + = left
    const rate = target === 0 ? 4 : 2.2;
    kbSteer += clamp(target - kbSteer, -rate * dt, rate * dt);
    const anyKey = l || r || keys.ArrowUp || keys.KeyW || keys.ArrowDown || keys.KeyS || keys.Space;
    return anyKey || Math.abs(kbSteer) > 0.01 ? {
      steer: -kbSteer, // touch convention: + = right
      throttle: (keys.ArrowUp || keys.KeyW) ? 1 : 0,
      brake: (keys.ArrowDown || keys.KeyS) ? 1 : 0,
      handbrake: keys.Space ? 1 : 0,
    } : null;
  }

  // steering: driver input -> road wheel angle with a speed-sensitive range and a rate limit
  let roadAngle = 0;
  function computeSteer(rawRight, dt, aids) {
    const s = clamp(rawRight * settings.sens, -1, 1);
    const shaped = Math.sign(s) * Math.pow(Math.abs(s), 1.35);
    const v = Math.max(car.vx, 0);
    let maxA = car.p.maxSteer;
    if (aids.steerAssist) maxA = clamp(car.L * 1.25 * 9.81 / Math.max(v * v, 1) + 0.075, 0.075, car.p.maxSteer);
    let target = -shaped * maxA; // physics: + = left
    if (aids.counterSteer && v > 4) {
      const beta = Math.atan2(car.vy, v);
      target += clamp(beta * 0.85, -0.35, 0.35);
    }
    const rate = 2.6; // rad/s at the road wheel
    roadAngle += clamp(target - roadAngle, -rate * dt, rate * dt);
    return roadAngle;
  }

  // ---------------- audio ----------------
  let audio = null;
  function startAudio() {
    if (audio) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      // engine: two detuned saws + square sub, low-passed
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5; lp.connect(master);
      const eg = ctx.createGain(); eg.gain.value = 0.0; eg.connect(lp);
      const o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 9;
      const o3 = ctx.createOscillator(); o3.type = 'square';
      const g3 = ctx.createGain(); g3.gain.value = 0.5;
      o1.connect(eg); o2.connect(eg); o3.connect(g3); g3.connect(eg);
      [o1, o2, o3].forEach(o => o.start());
      // noise source for tyres and wind
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true; noise.start();
      const sq = ctx.createBiquadFilter(); sq.type = 'bandpass'; sq.frequency.value = 900; sq.Q.value = 6;
      const sqg = ctx.createGain(); sqg.gain.value = 0; noise.connect(sq); sq.connect(sqg); sqg.connect(master);
      const wind = ctx.createBiquadFilter(); wind.type = 'lowpass'; wind.frequency.value = 500;
      const wg = ctx.createGain(); wg.gain.value = 0; noise.connect(wind); wind.connect(wg); wg.connect(master);
      const rumble = ctx.createBiquadFilter(); rumble.type = 'lowpass'; rumble.frequency.value = 120;
      const rg = ctx.createGain(); rg.gain.value = 0; noise.connect(rumble); rumble.connect(rg); rg.connect(master);
      audio = { ctx, o1, o2, o3, eg, lp, sqg, sq, wg, rg };
    } catch (e) { audio = null; }
  }
  function updateAudio() {
    if (!audio) return;
    const t = audio.ctx.currentTime, k = 0.04;
    const rpm = car.rpm;
    const f = rpm / 60 * 2; // 4-cylinder firing frequency
    audio.o1.frequency.setTargetAtTime(f, t, 0.015);
    audio.o2.frequency.setTargetAtTime(f, t, 0.015);
    audio.o3.frequency.setTargetAtTime(f / 2, t, 0.015);
    const load = car.throttleOut;
    audio.eg.gain.setTargetAtTime(0.10 + 0.16 * load, t, k);
    audio.lp.frequency.setTargetAtTime(300 + rpm * 0.25 + load * 1600, t, k);
    let sl = 0;
    for (const w of car.wheels) if (w.surface !== 2) sl = Math.max(sl, w.slide);
    const speed = car.speed;
    audio.sqg.gain.setTargetAtTime(clamp((sl - 0.85) * 0.5, 0, 0.22) * clamp(speed / 6, 0, 1), t, 0.05);
    audio.sq.frequency.setTargetAtTime(700 + clamp(sl, 0, 3) * 150, t, 0.05);
    audio.wg.gain.setTargetAtTime(clamp(speed * speed / 6000, 0, 0.18), t, 0.1);
    const onRough = car.wheels.some(w => w.surface > 0);
    audio.rg.gain.setTargetAtTime(onRough ? clamp(speed / 20, 0, 0.6) : 0, t, 0.05);
  }

  // ---------------- HUD ----------------
  function fmt(t) {
    if (t === null || t === undefined) return '–';
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(3);
  }
  let msgTimer = 0;
  function flash(text, dur) { const el = $('msg'); el.textContent = text; el.style.opacity = 1; msgTimer = dur || 1.5; }
  const mm = $('minimap'), mg = mm.getContext('2d');
  const mmBase = document.createElement('canvas'); mmBase.width = mm.width; mmBase.height = mm.height;
  let mmScale, mmOx, mmOy;
  {
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < track.n; i++) { minx = Math.min(minx, track.px[i]); maxx = Math.max(maxx, track.px[i]); miny = Math.min(miny, track.py[i]); maxy = Math.max(maxy, track.py[i]); }
    const pad = 14;
    mmScale = Math.min((mm.width - 2 * pad) / (maxx - minx), (mm.height - 2 * pad) / (maxy - miny));
    mmOx = (mm.width - (maxx - minx) * mmScale) / 2 - minx * mmScale;
    mmOy = (mm.height - (maxy - miny) * mmScale) / 2 + maxy * mmScale;
    const g = mmBase.getContext('2d');
    g.strokeStyle = 'rgba(238,241,234,0.85)'; g.lineWidth = 5; g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i <= track.n; i++) { const k = i % track.n; const x = mmOx + track.px[k] * mmScale, y = mmOy - track.py[k] * mmScale; i ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    const p = track.poseAt(0);
    g.fillStyle = '#ffcf3a'; g.fillRect(mmOx + p.x * mmScale - 2, mmOy - p.y * mmScale - 7, 4, 14);
  }
  const els = {
    tCur: $('tCur'), tLast: $('tLast'), tBest: $('tBest'), tLap: $('tLap'), spd: $('spd'), gear: $('gear'),
    rpmTxt: $('rpmTxt'), rpmfill: $('rpmfill'), rpmbar: $('rpmbar'), steerdot: $('steerdot'),
    ty: [0, 1, 2, 3].map(i => $('ty' + i)), aAbs: $('aAbs'), aTc: $('aTc'), aEsc: $('aEsc'),
  };
  let hudCache = {};
  function setText(key, el, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }
  function tyreColor(w) {
    if (w.fz < 50) return '#555';
    const s = w.slide;
    if (s < 0.75) return '#3fae5a';
    if (s < 1.05) return '#e8c43a';
    return '#ff4a3a';
  }
  function updateHud(aids) {
    setText('cur', els.tCur, timer.lapStart === null ? 'Out lap' : fmt(timer.current) + (timer.valid ? '' : ' ✕'));
    setText('last', els.tLast, timer.last === null ? '–' : fmt(timer.last) + (timer.lastValid ? '' : ' ✕'));
    setText('best', els.tBest, fmt(timer.best));
    setText('lap', els.tLap, String(timer.lapCount));
    setText('spd', els.spd, String(Math.round(Math.abs(car.vx) * 3.6)));
    setText('gear', els.gear, car.gearLabel);
    setText('rpm', els.rpmTxt, Math.round(car.rpm / 50) * 50 + ' rpm');
    const frac = clamp(car.rpm / 8000, 0, 1);
    els.rpmfill.style.width = (frac * 100).toFixed(1) + '%';
    els.rpmbar.classList.toggle('shift', car.rpm > car.p.redline - 300);
    els.steerdot.style.left = (50 - car.steer / car.p.maxSteer * 50) + '%';
    car.wheels.forEach((w, i) => { const c = tyreColor(w); if (hudCache['ty' + i] !== c) { hudCache['ty' + i] = c; els.ty[i].style.background = c; } });
    els.aAbs.className = aids.abs ? (car.wheels.some(w => w.absFactor < 0.95) ? 'on' : '') : '';
    els.aTc.className = aids.tc && car.tcCut > 0.05 ? 'on' : '';
    els.aEsc.className = aids.esc && car.escActive ? 'on' : '';
    els.aAbs.style.opacity = aids.abs ? 1 : 0.3; els.aTc.style.opacity = aids.tc ? 1 : 0.3; els.aEsc.style.opacity = aids.esc ? 1 : 0.3;
    // minimap
    mg.clearRect(0, 0, mm.width, mm.height);
    mg.drawImage(mmBase, 0, 0);
    mg.fillStyle = '#ff5a4a';
    mg.beginPath(); mg.arc(mmOx + car.x * mmScale, mmOy - car.y * mmScale, 5, 0, Math.PI * 2); mg.fill();
  }

  // ---------------- camera ----------------
  const camState = { yaw: car.yaw, pos: new THREE.Vector3(), init: false };
  // keep the horizontal field of view sensible on tall (portrait) screens
  function fovFor(base) {
    const ref = 1.6;
    if (camera.aspect >= ref) return base;
    const h = 2 * Math.atan(Math.tan(base * Math.PI / 360) * ref);
    return Math.min(100, 2 * Math.atan(Math.tan(h / 2) / camera.aspect) * 180 / Math.PI);
  }
  function updateCamera(dt) {
    const mode = settings.cam;
    // follow the direction of travel a little when sliding, like a real chase cam
    const velYaw = car.speed > 3 ? Math.atan2(car.vx * Math.sin(car.yaw) + car.vy * Math.cos(car.yaw), car.vx * Math.cos(car.yaw) - car.vy * Math.sin(car.yaw)) : car.yaw;
    let desired = car.yaw;
    if (car.vx > 3) { let d = velYaw - car.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); desired = car.yaw + d * 0.35; }
    let dy = desired - camState.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camState.yaw += dy * (1 - Math.exp(-dt * (mode === 1 ? 30 : 7)));
    const cy = Math.cos(camState.yaw), sy = Math.sin(camState.yaw);
    if (mode === 0) { // chase
      const dist = 6.2, height = 2.15;
      const target = W(car.x - cy * dist, car.y - sy * dist, height);
      if (!camState.init) { camState.pos.copy(target); camState.init = true; }
      camState.pos.lerp(target, 1 - Math.exp(-dt * 18));
      camera.position.copy(camState.pos);
      camera.fov = fovFor(62);
      camera.lookAt(W(car.x + cy * 3, car.y + sy * 3, 0.9));
    } else if (mode === 1) { // bonnet
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      camera.position.copy(W(car.x + c * 0.2, car.y + s * 0.2, 1.22));
      camera.fov = fovFor(70);
      camera.lookAt(W(car.x + c * 20, car.y + s * 20, 0.9));
      camera.rotateZ(-car.roll * 0.6);
    } else { // high chase
      const target = W(car.x - cy * 12, car.y - sy * 12, 6.5);
      camState.pos.lerp(target, 1 - Math.exp(-dt * 10));
      camera.position.copy(camState.pos);
      camera.fov = fovFor(58);
      camera.lookAt(W(car.x + cy * 6, car.y + sy * 6, 0));
    }
    camera.updateProjectionMatrix();
    carGroup.visible = mode !== 1;
  }

  // ---------------- main loop ----------------
  let running = false, acc = 0, last = performance.now(), simTime = 0, wallHitCooldown = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    const aids = aidFlags();
    if (running) {
      const kb = keyboardInput(dt);
      const raw = kb || input;
      const steerAngle = computeSteer(raw.steer, dt, aids);
      acc += dt;
      let steps = 0;
      while (acc >= DT && steps < 120) {
        let inp = { steerAngle, throttle: raw.throttle, brake: raw.brake, handbrake: raw.handbrake };
        if (settings.box === 'auto') inp = car.autoShift(inp);
        else if (car.gear === 1 && raw.throttle > 0.1 && car.shiftTimer === 0) car.requestShift(+1);
        car.step(DT, inp, aids, (x, y) => track.surfaceAt(x, y, hint));
        const pr = track.project(car.x, car.y, hint);
        hint = pr.i;
        const hit = track.collide(car, hint);
        if (hit > 3 && wallHitCooldown <= 0) { wallHitCooldown = 0.5; if (audio) thump(hit); }
        simTime += DT;
        const off = car.wheels.every(w => w.surface === 2) || car.wheels.filter(w => w.surface === 2).length >= 4;
        const prevLast = timer.lapCount;
        timer.update(simTime, pr.s, off);
        if (timer.lapCount !== prevLast) flash((timer.lastValid ? 'LAP ' : 'INVALID ') + fmt(timer.last) + (timer.lastValid && timer.best === timer.last ? '  BEST' : ''), 2.5);
        acc -= DT; steps++;
      }
      if (steps === 120) acc = 0;
      wallHitCooldown -= dt;
      // skid marks
      const c = Math.cos(car.yaw), s = Math.sin(car.yaw);
      car.wheels.forEach((w, i) => {
        const sliding = w.slide > 1.15 && w.fz > 300 && car.speed > 2 && w.surface !== 2;
        if (sliding) {
          const hdg = car.yaw + w.steer;
          addSkid(i, w.wx, w.wy, -Math.sin(hdg), Math.cos(hdg));
        } else skidLast[i] = null;
      });
      void c; void s;
      updateAudio();
    }
    // car visuals
    carGroup.position.copy(W(car.x, car.y, 0));
    carGroup.rotation.y = car.yaw;
    body.rotation.set(car.roll, 0, car.pitch);
    body.position.y = 0;
    body.userData.lightMat.color.setHex(car.wheels && input.brake + (keys.ArrowDown || keys.KeyS ? 1 : 0) > 0.05 ? 0xff2a20 : 0x550000);
    car.wheels.forEach((w, i) => {
      wheelMeshes[i].pivot.rotation.y = w.steer;
      wheelMeshes[i].spin.rotation.z = -w.angle;
    });
    updateCamera(dt);
    renderer.render(scene, camera);
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) $('msg').style.opacity = 0; }
    updateHud(aids);
    $('upBtn').style.display = $('dnBtn').style.display = settings.box === 'manual' ? 'flex' : 'none';
  }
  function thump(v) {
    const ctx = audio.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.2);
    g.gain.setValueAtTime(clamp(v / 15, 0.1, 0.8), t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + 0.3);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------------- menu ----------------
  function syncMenu() {
    document.querySelectorAll('.seg').forEach(seg => {
      const key = seg.dataset.key;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b.dataset.v === settings[key]));
    });
    $('sens').value = settings.sens;
    $('aidsDesc').textContent = AID_TEXT[settings.aids];
  }
  document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
    settings[b.parentElement.dataset.key] = b.dataset.v; saveSettings(); syncMenu();
  }));
  $('sens').addEventListener('input', e => { settings.sens = parseFloat(e.target.value); saveSettings(); });
  function openMenu() {
    running = false; $('menu').hidden = false; syncMenu();
    if (audio) audio.ctx.suspend();
    $('go').textContent = simTime > 0 ? 'RESUME' : 'DRIVE';
  }
  $('go').addEventListener('click', () => {
    $('menu').hidden = true; running = true; last = performance.now(); acc = 0;
    startAudio();
    if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && running) openMenu(); });
  syncMenu();

  // for automated testing
  window.__race = { scene, camera, car, track, timer, input, settings, start: () => $('go').click() };
  requestAnimationFrame(frame);
})();
