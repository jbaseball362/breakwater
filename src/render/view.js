// Draws a game: reads sim state each frame and turns sim events into effects.

import * as THREE from 'three';
import { CRABS, SPECIALS, TOWERS, WORLD } from '../content.js';
import { applyPalette, buildWorld } from './world.js';
import { buildHero, buildHydrant, buildTower, crabGeometry, crabMaterial, lambert, netGeometry, ringMesh } from './models.js';

const CRAB_CAPACITY = { scuttler: 1400, runner: 600, hermit: 240, brood: 120, king: 6, medic: 150, molter: 500, flea: 900, bull: 150, jammer: 150 };
const CRAB_SHAPES = {
  scuttler: { detail: 0 },
  runner: { detail: 0, claw: 0.75 },
  hermit: { detail: 0, shell: true },
  brood: { detail: 1, kneed: true, spikes: true },
  king: { detail: 2, kneed: true, spikes: true, claw: 1.5 },
  medic: { detail: 0, tendrils: true },
  molter: { detail: 0, spikes: true },
  flea: { detail: 0, claw: 0.6 },
  bull: { detail: 1, kneed: true, horns: true, claw: 1.3 },
  jammer: { detail: 0, antenna: true },
};
// Shots change color and grow with level, so an upgrade shows up in the middle of a fight.
const SHOT_COLORS = {
  hero: [0xdffaff, 0x9fecff, 0xffe27a, 0xff9d5c],
  spitter: [0x8ff5e6, 0x62e6ff, 0xffe27a],
};
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

class Particles {
  constructor(scene, capacity = 1600) {
    this.capacity = capacity;
    this.mesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ fog: false }), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.items = [];
    this.color = new THREE.Color();
  }

  burst(x, y, z, count, { color = 0xffffff, speed = 3, up = 3, gravity = 12, life = 0.5, size = 0.12, spread = 0 }) {
    for (let i = 0; i < count && this.items.length < this.capacity; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.items.push({
        x: x + (Math.random() - 0.5) * spread,
        y,
        z: z + (Math.random() - 0.5) * spread,
        vx: Math.cos(a) * v,
        vy: up * (0.5 + Math.random() * 0.8),
        vz: Math.sin(a) * v,
        g: gravity,
        life: life * (0.6 + Math.random() * 0.6),
        max: life,
        size: size * (0.7 + Math.random() * 0.6),
        hex: color,
      });
    }
  }

  // A single particle thrown in an arc that lands on the given point.
  toss(x, y, z, tx, ty, tz, life, color, size) {
    if (this.items.length >= this.capacity) return;
    const g = 14;
    this.items.push({
      x, y, z,
      vx: (tx - x) / life,
      vy: (ty - y) / life + g * life / 2,
      vz: (tz - z) / life,
      g, life, max: life, size, hex: color, keep: true,
    });
  }

  update(dt) {
    const arr = this.mesh.instanceMatrix.array;
    const col = this.mesh.instanceColor.array;
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.items[i] = this.items[this.items.length - 1];
        this.items.pop();
        continue;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.04 && !p.keep) { p.y = 0.04; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      const s = p.size * (p.keep ? 1 : Math.min(1, p.life / p.max * 1.6));
      const o = n * 16;
      arr[o] = s; arr[o + 1] = 0; arr[o + 2] = 0; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = s; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = 0; arr[o + 9] = 0; arr[o + 10] = s; arr[o + 11] = 0;
      arr[o + 12] = p.x; arr[o + 13] = p.y; arr[o + 14] = p.z; arr[o + 15] = 1;
      this.color.set(p.hex);
      col[n * 3] = this.color.r; col[n * 3 + 1] = this.color.g; col[n * 3 + 2] = this.color.b;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.items.length = 0; }
}

// A stamped metal plate face. Bigger values get brighter metal, so a +99 stands out on the belt.
function plateCanvas(text, plate, ink) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 168;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 168);
  grad.addColorStop(0, plate.hi);
  grad.addColorStop(1, plate.lo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 168);
  ctx.strokeStyle = 'rgba(30,40,46,.5)';
  ctx.lineWidth = 6;
  ctx.strokeRect(9, 9, 238, 150);
  ctx.fillStyle = 'rgba(30,40,46,.55)';
  for (const [x, y] of [[22, 22], [234, 22], [22, 146], [234, 146]]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, 7);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${text.length > 4 ? 84 : 112}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.fillText(text, 128, 92);
  ctx.fillStyle = ink;
  ctx.fillText(text, 128, 88);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color();
    this.scene.fog = new THREE.Fog(0xffffff, 70, 170);
    this.camera = new THREE.PerspectiveCamera(40, 1, 5, 800);
    this.camTarget = new THREE.Vector3(0, 0, 0);
    this.camBase = new THREE.Vector3(0, 40, 30);
    this.shake = 0;
    this.projected = new THREE.Vector3();

    const hemi = new THREE.HemisphereLight(0xffffff, 0x666666, 1.3);
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    sun.position.set(-18, 34, 12);
    sun.target.position.set(0, 0, -4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -32;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    this.scene.add(hemi, sun, sun.target);
    this.lights = { hemi, sun };

    this.time = { value: 0 };
    this.world = buildWorld(this.scene);
    this.levelGroup = new THREE.Group();
    this.scene.add(this.levelGroup);

    this.buildCrabs();
    this.buildPanels();
    this.buildProjectiles();

    this.particles = new Particles(this.scene);
    this.rings = Array.from({ length: 18 }, () => {
      const ring = ringMesh(1, 0xffffff, 0.14);
      ring.visible = false;
      ring.material.uniforms.uFill.value = 0;
      this.scene.add(ring);
      return { mesh: ring, life: 0, max: 1, radius: 1 };
    });

    this.hero = buildHero();
    this.scene.add(this.hero);
    this.heroRing = ringMesh(1.15, 0x7dff8e, 0.16);
    this.heroRing.material.uniforms.uFill.value = 0;
    this.scene.add(this.heroRing);
    this.rangeRing = ringMesh(1, 0xffffff, 0.02);
    this.rangeRing.material.uniforms.uFill.value = 0.04;
    this.rangeRing.visible = false;
    this.scene.add(this.rangeRing);

    this.floaters = [];
    this.collectGather = {};
    this.heroYaw = Math.PI;
    this.color = new THREE.Color();
    this.white = new THREE.Color(0xffffff);
    this.frostColor = new THREE.Color(0xbfeeff);
    this.netColor = new THREE.Color(0xcbb56a);
    this.onSound = null;

    this.resize();
  }

  buildCrabs() {
    const material = crabMaterial(this.time);
    this.crabMeshes = {};
    for (const [type, def] of Object.entries(CRABS)) {
      const capacity = CRAB_CAPACITY[type];
      const mesh = new THREE.InstancedMesh(crabGeometry(CRAB_SHAPES[type]), material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.count = 0;
      this.scene.add(mesh);
      this.crabMeshes[type] = { mesh, capacity, base: new THREE.Color(def.color), count: 0 };
    }
  }

  buildPanels() {
    this.plateMaterials = new Map();
    this.plateSide = lambert(0x7d868b);
    const geo = new THREE.BoxGeometry(2.3, 1.5, 0.12).translate(0, 0.75, 0);
    this.panelPools = {};
    for (const side of [-1, 1]) {
      this.panelPools[side] = Array.from({ length: 44 }, () => {
        const mesh = new THREE.Mesh(geo, this.plateSide);
        mesh.rotation.x = -0.5;
        mesh.castShadow = true;
        mesh.visible = false;
        this.scene.add(mesh);
        return mesh;
      });
    }
    this.tips = [];
  }

  plateFor(panel) {
    const key = panel.kind === 'parts' ? `+${panel.value}` : panel.kind;
    let mats = this.plateMaterials.get(key);
    if (!mats) {
      let tex;
      if (panel.kind === 'parts') {
        const v = panel.value;
        const plate = v >= 99
          ? { hi: '#ffe27a', lo: '#e7b320' }
          : v >= 50 ? { hi: '#f0e3b4', lo: '#c8b070' }
            : v >= 10 ? { hi: '#e0e6e8', lo: '#a9b3b7' } : { hi: '#bfc7cb', lo: '#8c969b' };
        tex = plateCanvas(key, plate, '#25313a');
      } else {
        const def = SPECIALS[panel.kind];
        tex = plateCanvas(def.label, { hi: def.plate, lo: def.plate }, def.ink);
      }
      const face = lambert(0xffffff, { map: tex });
      mats = [this.plateSide, this.plateSide, this.plateSide, this.plateSide, face, this.plateSide];
      this.plateMaterials.set(key, mats);
    }
    return mats;
  }

  buildProjectiles() {
    this.tracers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), 500);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(1500), 3);
    this.tracers.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    this.scene.add(this.tracers);

    const shellGeo = new THREE.SphereGeometry(0.34, 8, 6);
    const shellMat = lambert(0x2f3b42);
    this.shellPool = Array.from({ length: 24 }, () => {
      const m = new THREE.Mesh(shellGeo, shellMat);
      m.visible = false;
      m.castShadow = true;
      this.scene.add(m);
      return m;
    });

    const streakGeo = new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2);
    const streakMat = new THREE.MeshBasicMaterial({ color: 0xf2f7f5 });
    this.streaks = Array.from({ length: 12 }, () => {
      const mesh = new THREE.Mesh(streakGeo, streakMat);
      mesh.visible = false;
      this.scene.add(mesh);
      return { mesh, life: 0 };
    });

    const arcMat = new THREE.MeshBasicMaterial({ color: 0xbfe9ff });
    this.arcs = Array.from({ length: 60 }, () => {
      const mesh = new THREE.Mesh(streakGeo, arcMat);
      mesh.visible = false;
      this.scene.add(mesh);
      return { mesh, life: 0, len: 1, r: 0.07 };
    });

    const netGeo = netGeometry();
    const netMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const makeNet = () => {
      const mesh = new THREE.Mesh(netGeo, netMat);
      mesh.visible = false;
      mesh.castShadow = true;
      this.scene.add(mesh);
      return mesh;
    };
    this.flyingNets = Array.from({ length: 10 }, makeNet);
    this.drapedNets = Array.from({ length: 14 }, () => ({ mesh: makeNet(), life: 0, radius: 1 }));

    this.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8).rotateX(Math.PI / 2);
    this.beamOuter = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.4, depthWrite: false });
    this.beamInner = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    // Pull back until the whole yard fits. A phone needs more distance than a monitor.
    const elevation = THREE.MathUtils.degToRad(56);
    const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const checks = [[-9.8, 0, 16.5], [9.8, 0, 16.5], [0, 0, 19]];
    const v = new THREE.Vector3();
    let distance = 46;
    for (; distance < 160; distance++) {
      this.camera.position.copy(this.camTarget).addScaledVector(dir, distance);
      this.camera.lookAt(this.camTarget);
      this.camera.updateMatrixWorld();
      const fits = checks.every(([x, y, z]) => {
        v.set(x, y, z).project(this.camera);
        return Math.abs(v.x) <= 0.99 && v.y >= -0.97;
      });
      if (fits) break;
    }
    this.camBase.copy(this.camera.position);
    this.scene.fog.near = distance * 1.35;
    this.scene.fog.far = distance * 3.2;
    const u = this.world.water.material.uniforms;
    u.uFogNear.value = this.scene.fog.near;
    u.uFogFar.value = this.scene.fog.far;
  }

  project(x, y, z) {
    this.projected.set(x, y, z).project(this.camera);
    return { x: (this.projected.x + 1) / 2 * this.width, y: (1 - this.projected.y) / 2 * this.height };
  }

  clearLevel() {
    this.levelGroup.traverse((o) => {
      if (o.geometry && o.geometry !== this.beamGeo) o.geometry.dispose();
    });
    this.levelGroup.clear();
    this.particles.clear();
    this.floaters.length = 0;
    this.tips.length = 0;
    for (const ring of this.rings) { ring.life = 0; ring.mesh.visible = false; }
    for (const s of [...this.streaks, ...this.arcs, ...this.drapedNets]) { s.life = 0; s.mesh.visible = false; }
    this.shake = 0;
  }

  loadLevel(game) {
    this.clearLevel();
    this.palette = applyPalette(this.world, this.scene, this.lights, game.def.zone);
    this.game = game;
    for (const lane of game.lanes) this.buildLaneDecor(lane);
    this.beltViews = game.belts.map((belt) => this.buildBeltView(belt));
    this.padViews = game.pads.map((pad) => this.buildPadView(pad));
    this.heroYaw = game.hero.yaw;
  }

  buildLaneDecor(lane) {
    const { xs, zs, n, width } = lane;
    const samples = [];
    for (let i = 0; i < n - 1; i++) {
      const tx = xs[i + 1] - xs[i];
      const tz = zs[i + 1] - zs[i];
      const len = Math.hypot(tx, tz) || 1;
      samples.push({ x: xs[i], z: zs[i], nx: tz / len, nz: -tx / len, yaw: Math.atan2(tx, tz) });
    }
    const inYard = samples.filter((s) => s.z >= -2);

    // A darker ribbon of road through the yard, so the lane reads at a glance.
    // Tight bends make the inner edge fold over itself, so each triangle is wound upward by hand.
    const pos = [];
    const addTri = (a, b, c) => {
      const up = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const [p1, p2] = up < 0 ? [b, c] : [c, b];
      pos.push(a[0], 0.02, a[1], p1[0], 0.02, p1[1], p2[0], 0.02, p2[1]);
    };
    for (let k = 1; k < inYard.length; k++) {
      const s0 = inYard[k - 1];
      const s1 = inYard[k];
      const hw = width / 2;
      const a = [s0.x + s0.nx * hw, s0.z + s0.nz * hw];
      const b = [s0.x - s0.nx * hw, s0.z - s0.nz * hw];
      const c = [s1.x + s1.nx * hw, s1.z + s1.nz * hw];
      const d = [s1.x - s1.nx * hw, s1.z - s1.nz * hw];
      addTri(a, b, c);
      addTri(b, d, c);
    }
    const ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ribbonGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    const ribbon = new THREE.Mesh(ribbonGeo, lambert(0x4e5255));
    ribbon.receiveShadow = true;
    this.levelGroup.add(ribbon);

    // Hazard-striped curbs on both sides. A curb that lands inside the lane is on the
    // inner edge of a bend and gets dropped, so curbs never cross the road.
    const clearOfLane = (x, z) => samples.every((s) => Math.hypot(s.x - x, s.z - z) >= width / 2 - 0.15);
    const curbSpots = [];
    inYard.forEach((s, k) => {
      if (k % 2) return;
      for (const sign of [-1, 1]) {
        const x = s.x + sign * s.nx * width / 2;
        const z = s.z + sign * s.nz * width / 2;
        if (clearOfLane(x, z)) curbSpots.push({ x, z, yaw: s.yaw, stripe: k / 2 });
      }
    });
    const curbs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, 0.2, 0.98), lambert(0xffffff), curbSpots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yUp = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const yellow = new THREE.Color(0xf6c21c);
    const ink = new THREE.Color(0x2b3338);
    curbSpots.forEach((s, k) => {
      q.setFromAxisAngle(yUp, s.yaw);
      p.set(s.x, 0.1, s.z);
      m.compose(p, q, one);
      curbs.setMatrixAt(k, m);
      curbs.setColorAt(k, s.stripe % 2 ? yellow : ink);
    });
    curbs.castShadow = true;
    curbs.receiveShadow = true;
    this.levelGroup.add(curbs);

    // White dashes down the middle, continuing north past the spawn point.
    const dashes = [];
    for (let k = 0; k < samples.length; k += 10) dashes.push(samples[k]);
    for (let z = zs[0] - 5; z > -96; z -= 5) dashes.push({ x: xs[0], z, yaw: 0 });
    const dashMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.02, 2), new THREE.MeshLambertMaterial({ color: 0xe8eced }), dashes.length);
    dashes.forEach((s, k) => {
      q.setFromAxisAngle(yUp, s.yaw);
      p.set(s.x, 0.02, s.z);
      m.compose(p, q, one);
      dashMesh.setMatrixAt(k, m);
    });
    dashMesh.receiveShadow = true;
    this.levelGroup.add(dashMesh);

    // Painted stop line at the gate.
    const stop = new THREE.Mesh(new THREE.BoxGeometry(width, 0.03, 0.5), lambert(0xd9262c));
    stop.position.set(xs[n - 1], 0.02, zs[n - 1] - 0.2);
    this.levelGroup.add(stop);
  }

  buildBeltView(belt) {
    const hydrant = buildHydrant();
    hydrant.position.set(belt.x, 0, belt.z);
    this.levelGroup.add(hydrant);

    const top = this.world.pierTop;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(belt.x, top - 0.4, WORLD.beltEndZ + 0.7),
      new THREE.Vector3(belt.x, top + 0.5, -1.7),
      new THREE.Vector3(belt.x, top + 0.95, -0.2),
      new THREE.Vector3(belt.x, top + 0.75, 0.95),
      new THREE.Vector3(belt.x, 1.75, belt.z),
    ]);
    const pipeMat = lambert(0xc4cbce);
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.36, 10), pipeMat);
    pipe.castShadow = true;
    this.levelGroup.add(pipe);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.22, 12), lambert(0x8d979b));
    collar.position.set(belt.x, 1.82, belt.z);
    this.levelGroup.add(collar);
    const bulge = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), pipeMat);
    bulge.visible = false;
    bulge.castShadow = true;
    this.levelGroup.add(bulge);

    const ring = ringMesh(WORLD.ringR, 0xffffff, 0.09);
    ring.position.set(belt.x, 0.04, belt.z);
    this.levelGroup.add(ring);

    const tipGeo = new THREE.BoxGeometry(2.3, 1.5, 0.12).translate(0, 0.75, 0);
    const tipper = new THREE.Mesh(tipGeo, this.plateSide);
    tipper.visible = false;
    this.levelGroup.add(tipper);

    return {
      belt, hydrant, curve, bulge, ring, tipper,
      wheel: hydrant.userData.wheel,
      tipT: -1,
      bulges: [],
      wobble: 0,
      gather: 0,
      flyT: 0,
    };
  }

  buildPadView(pad) {
    const ring = ringMesh(WORLD.padR, pad.type ? TOWERS[pad.type].color : 0xffffff, 0.13);
    ring.position.set(pad.x, 0.03, pad.z);
    ring.material.uniforms.uFill.value = 0.2;
    this.levelGroup.add(ring);
    const view = { pad, type: pad.type, ring, tower: null, level: 0, pop: 0, beam: null };
    if (pad.level > 0) this.setTower(view);
    return view;
  }

  setTower(view) {
    if (view.tower) this.levelGroup.remove(view.tower);
    const { pad } = view;
    const def = TOWERS[pad.type];
    view.tower = buildTower(pad.type, pad.level, def.color);
    view.tower.position.set(pad.x, 0, pad.z);
    view.level = pad.level;
    this.levelGroup.add(view.tower);
    view.tower.userData.head.rotation.y = pad.aim;

    if (def.kind === 'beam' && !view.beam) {
      const outer = new THREE.Mesh(this.beamGeo, this.beamOuter);
      const inner = new THREE.Mesh(this.beamGeo, this.beamInner);
      this.levelGroup.add(outer, inner);
      view.beam = { outer, inner };
    }
    if (!view.marker) {
      view.marker = ringMesh(1.3, 0xffffff, 0.14);
      view.marker.position.set(pad.x, 0.045, pad.z);
      view.marker.material.uniforms.uFill.value = 0;
      view.marker.visible = false;
      this.levelGroup.add(view.marker);
    }
    if ((def.kind === 'aura' || def.kind === 'mast') && !view.aura) {
      view.aura = ringMesh(1, def.kind === 'mast' ? def.color : 0xffffff, 0.03);
      view.aura.position.set(pad.x, 0.035, pad.z);
      view.aura.material.uniforms.uFill.value = 0.1;
      this.levelGroup.add(view.aura);
    }
  }

  spawnRing(x, z, radius, color, life = 0.45) {
    const ring = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    ring.life = life;
    ring.max = life;
    ring.radius = radius;
    ring.mesh.material.uniforms.uColor.value.set(color);
    ring.mesh.position.set(x, 0.1, z);
    ring.mesh.visible = true;
  }

  // Lightning between each pair of points, with a kink halfway so it doesn't look like a laser.
  spawnArc(points, level) {
    const r = 0.06 * (1 + (level - 1) * 0.4);
    const addSegment = (x0, z0, y0, x1, z1, y1) => {
      const arc = this.arcs.find((a) => a.life <= 0);
      if (!arc) return;
      const dx = x1 - x0;
      const dz = z1 - z0;
      arc.life = 0.13;
      arc.len = Math.hypot(dx, dz) || 0.1;
      arc.r = r;
      arc.mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
      arc.mesh.rotation.y = Math.atan2(dx, dz);
      arc.mesh.scale.set(r, r, arc.len);
      arc.mesh.visible = true;
    };
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const y0 = i === 0 ? 2 : 0.7;
      const midX = (a.x + b.x) / 2 + (Math.random() - 0.5) * 0.8;
      const midZ = (a.z + b.z) / 2 + (Math.random() - 0.5) * 0.8;
      addSegment(a.x, a.z, y0, midX, midZ, 0.8);
      addSegment(midX, midZ, 0.8, b.x, b.z, 0.7);
      this.particles.burst(b.x, 0.7, b.z, 2, { color: 0xbfe9ff, speed: 2, up: 2, size: 0.09, life: 0.2 });
    }
  }

  floatText(x, y, z, text, color = '#ffffff', size = 1) {
    this.floaters.push({ x, y, z, text, color, size, life: 0.9, max: 0.9 });
    if (this.floaters.length > 40) this.floaters.shift();
  }

  addShake(amount) {
    if (!reduceMotion) this.shake = Math.min(1.2, this.shake + amount);
  }

  // Burst size is rationed per frame so a mass kill doesn't drown everything else.
  handleEvents(game, events, sound = true) {
    let dieBudget = 26;
    const play = (name, opts) => { if (sound && this.onSound) this.onSound(name, opts); };

    for (const e of events) {
      switch (e.t) {
        case 'die': {
          const color = CRABS[e.type].color;
          const big = e.size > 2;
          const amount = big ? 90 : dieBudget > 0 ? (e.size > 1 ? 16 : 6) : 1;
          dieBudget--;
          this.particles.burst(e.x, 0.5, e.z, amount, {
            color, speed: 2.6 + e.size, up: 3.2 + e.size, size: 0.1 + e.size * 0.06, life: 0.55 + e.size * 0.1,
          });
          if (dieBudget > 12) this.particles.burst(e.x, 0.5, e.z, 2, { color: 0xffc9b8, speed: 2, up: 4, size: 0.07, life: 0.4 });
          if (e.size > 1) { play('crunch'); this.addShake(big ? 1 : 0.06); }
          if (big) { this.spawnRing(e.x, e.z, 9, 0xffffff, 0.8); play('boom'); this.floatText(e.x, 3, e.z, 'King down', '#ffd23f', 1.6); }
          break;
        }
        case 'shot': {
          play(e.from === 'mortar' ? 'thunk' : 'shot');
          break;
        }
        case 'splash': {
          // Higher levels throw up a visibly bigger column of water and a hotter flash.
          const power = 1 + (e.level - 1) * 0.6;
          this.spawnRing(e.x, e.z, e.radius * 1.15, e.level >= 3 ? 0xffe27a : 0xdff7ff);
          this.particles.burst(e.x, 0.3, e.z, Math.round(26 * power), { color: 0xeafcff, speed: 3.4 * (1 + (e.level - 1) * 0.2), up: 9 * (1 + (e.level - 1) * 0.15), gravity: 20, size: 0.17 * (1 + (e.level - 1) * 0.2), life: 0.75, spread: e.radius });
          this.particles.burst(e.x, 0.3, e.z, Math.round(8 * power), { color: e.level >= 3 ? 0xffe27a : 0xffb341, speed: 5, up: 5, size: 0.13 * (1 + (e.level - 1) * 0.25), life: 0.35 });
          this.addShake(0.08);
          play('boom', { soft: true });
          break;
        }
        case 'harpoon': {
          const s = this.streaks.find((k) => k.life <= 0);
          if (s) {
            const { pad } = e;
            const dx = e.x1 - pad.x;
            const dz = e.z1 - pad.z;
            s.life = 0.16;
            s.r = 0.12 * (1 + (pad.level - 1) * 0.45);
            s.mesh.position.set(pad.x + dx / 2, 1.5, pad.z + dz / 2);
            s.mesh.rotation.y = Math.atan2(dx, dz);
            s.len = Math.hypot(dx, dz);
            s.mesh.visible = true;
          }
          play('thunk', { high: true });
          break;
        }
        case 'tip': {
          const view = this.beltViews.find((b) => b.belt.side === e.side);
          if (view) {
            view.tipT = 0;
            view.tipper.material = this.plateFor(e.panel);
            view.tipper.visible = true;
            view.bulges.push(0);
            play('tick');
          }
          break;
        }
        case 'collect': {
          const view = this.beltViews.find((b) => b.belt.side === e.side);
          if (view) view.gather += e.amount;
          break;
        }
        case 'built': {
          const view = this.padViews.find((p) => p.pad === e.pad);
          this.setTower(view);
          view.pop = 1;
          this.spawnRing(e.pad.x, e.pad.z, 3, 0xf6c21c, 0.5);
          this.particles.burst(e.pad.x, 1, e.pad.z, 26, { color: 0xf6c21c, speed: 4, up: 7, size: 0.13, life: 0.6 });
          this.floatText(e.pad.x, 3.2, e.pad.z, e.pad.level > 1 ? `Level ${e.pad.level}` : 'Built', '#ffd23f', 1.1);
          play('build');
          break;
        }
        case 'leak': {
          this.world.gateFlash.emissive.setHex(0xff2020);
          this.world.gateFlash.emissiveIntensity = 1;
          this.addShake(0.16);
          this.floatText(e.x, 2, e.z - 1, `−${e.damage}`, '#ff5a52', 1.2);
          play('leak');
          break;
        }
        case 'special': {
          if (e.kind === 'boom') {
            this.addShake(0.9);
            for (const c of game.crabs) if (c.t >= 0 && Math.random() < 0.25) this.particles.burst(c.x, 0.3, c.z, 4, { color: 0xeafcff, speed: 2.5, up: 10, gravity: 18, size: 0.2, life: 0.8 });
            this.spawnRing(0, 2, 14, 0xffffff, 0.7);
            play('boom');
          } else {
            play('chime');
          }
          break;
        }
        case 'chosen':
          play('tick');
          break;
        case 'arc': {
          this.spawnArc(e.points, e.pad.level);
          play('shot');
          break;
        }
        case 'netFire':
          play('thunk', { high: true });
          break;
        case 'net': {
          // The net stays on the crabs for as long as they're held.
          const net = this.drapedNets.find((n) => n.life <= 0);
          if (net) {
            net.life = e.hold;
            net.radius = Math.max(e.radius, e.size * 0.85);
            net.mesh.position.set(e.x, Math.max(0.75, e.size * 0.72), e.z);
            net.mesh.rotation.y = Math.random() * Math.PI;
            net.mesh.scale.setScalar(net.radius);
            net.mesh.visible = true;
          }
          this.spawnRing(e.x, e.z, e.radius + 0.4, 0xf0e2b0, 0.45);
          this.particles.burst(e.x, 0.8, e.z, 14 + e.level * 4, { color: 0xf0e2b0, speed: 2.6, up: 3, size: 0.1, life: 0.4, spread: e.radius });
          play('crunch');
          break;
        }
        case 'pump':
          this.floatText(e.pad.x, 2.4, e.pad.z, `+${e.amount}`, '#8ef0a0', 0.8);
          break;
        case 'heal':
          // Plenty of medics can pulse at once, so only some get a visible ring.
          if (Math.random() < 0.5) this.spawnRing(e.x, e.z, e.radius, 0x7dffcf, 0.4);
          break;
        case 'molt':
          this.particles.burst(e.x, 0.6, e.z, 10, { color: CRABS.molter.color, speed: 3, up: 4, size: 0.14, life: 0.45 });
          play('crunch');
          break;
        case 'wave':
          play('horn');
          break;
        case 'end':
          play(e.won ? 'win' : 'lose');
          break;
        default:
      }
    }
    events.length = 0;
  }

  syncCrabs(game, frameTime) {
    for (const slot of Object.values(this.crabMeshes)) slot.count = 0;
    const chilled = game.fx.chill > 0;
    for (const c of game.crabs) {
      const slot = this.crabMeshes[c.type];
      const i = slot.count;
      if (i >= slot.capacity) continue;
      slot.count++;
      const S = c.def.size * (c.molted ? 0.82 : 1);
      const yaw = Math.atan2(c.dx, c.dz) + Math.sin(frameTime * 3 + c.phase) * 0.14;
      const sin = Math.sin(yaw);
      const cos = Math.cos(yaw);
      const bob = Math.abs(Math.sin(frameTime * 9 + c.phase)) * 0.05;
      const arr = slot.mesh.instanceMatrix.array;
      const o = i * 16;
      arr[o] = cos * S; arr[o + 1] = 0; arr[o + 2] = -sin * S; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = S; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = sin * S; arr[o + 9] = 0; arr[o + 10] = cos * S; arr[o + 11] = 0;
      arr[o + 12] = c.x; arr[o + 13] = bob; arr[o + 14] = c.z; arr[o + 15] = 1;

      this.color.copy(slot.base);
      if (c.molted) this.color.lerp(this.white, 0.45);
      if (c.netT > 0) this.color.lerp(this.netColor, 0.6);
      const frost = Math.max(c.frost, chilled ? 0.75 : 0);
      if (frost > 0) this.color.lerp(this.frostColor, frost * 0.6);
      if (c.flash > 0) this.color.lerp(this.white, 0.7);
      const col = slot.mesh.instanceColor.array;
      col[i * 3] = this.color.r;
      col[i * 3 + 1] = this.color.g;
      col[i * 3 + 2] = this.color.b;
    }
    for (const slot of Object.values(this.crabMeshes)) {
      slot.mesh.count = slot.count;
      slot.mesh.instanceMatrix.needsUpdate = true;
      slot.mesh.instanceColor.needsUpdate = true;
    }
  }

  syncBelts(game, dt) {
    const top = this.world.pierTop + 0.08;
    for (const view of this.world.belts) view.moving = false;
    for (const belt of game.belts) {
      const pool = this.panelPools[belt.side];
      const flowing = !belt.panels.length || belt.panels[0].s < WORLD.beltLen - 1e-3 || belt.tank < belt.cap;
      const worldBelt = this.world.belts.find((b) => b.side === belt.side);
      if (flowing) worldBelt.tex.offset.y += belt.speed * dt / 2.6;

      let shown = 0;
      for (const p of belt.panels) {
        if (shown >= pool.length) break;
        const mesh = pool[shown++];
        mesh.position.set(belt.x, top, WORLD.beltEndZ - (WORLD.beltLen - p.s));
        mesh.material = this.plateFor(p);
        mesh.visible = true;
      }
      for (; shown < pool.length; shown++) pool[shown].visible = false;
    }
    for (const side of [-1, 1]) {
      if (!game.belts.some((b) => b.side === side)) for (const m of this.panelPools[side]) m.visible = false;
    }

    for (const view of this.beltViews) {
      const { belt } = view;
      // The plate at the head of the belt pitches forward into the hopper.
      if (view.tipT >= 0) {
        view.tipT += dt / 0.28;
        const k = Math.min(1, view.tipT);
        view.tipper.position.set(belt.x, top - k * 1.1, WORLD.beltEndZ + k * 0.25);
        view.tipper.rotation.x = -0.5 + k * 1.5;
        view.tipper.scale.setScalar(1 - k * 0.3);
        if (k >= 1) { view.tipT = -1; view.tipper.visible = false; }
      }
      // Each plate is a lump that travels down the pipe to the hydrant.
      view.bulge.visible = false;
      for (let i = view.bulges.length - 1; i >= 0; i--) {
        view.bulges[i] += dt / 0.65;
        if (view.bulges[i] >= 1) {
          view.bulges.splice(i, 1);
          view.wobble = 1;
          continue;
        }
        view.bulge.visible = true;
        view.curve.getPointAt(view.bulges[i], view.bulge.position);
      }
      view.wobble = Math.max(0, view.wobble - dt * 4);
      const w = view.wobble * 0.14;
      view.hydrant.scale.set(1 + w, 1 - w * 0.7, 1 + w);

      const draining = belt.open && (belt.tank > 0 || view.gather > 0);
      view.wheel.rotation.z -= dt * (draining ? 14 : belt.open ? 2 : 0);

      const u = view.ring.material.uniforms;
      const fill = Math.min(1, belt.tank / belt.cap);
      u.uProgress.value = fill;
      u.uColor.value.set(belt.open ? 0x7dff8e : belt.tank >= belt.cap ? 0xff7a52 : 0xffffff);
      u.uBack.value = 0.35;
      u.uFill.value = belt.open ? 0.22 : 0.08;
    }
  }

  syncPads(game, dt) {
    let rangeShown = false;
    for (const view of this.padViews) {
      const { pad, ring } = view;
      const u = ring.material.uniforms;
      const def = pad.type ? TOWERS[pad.type] : null;
      if (pad.type !== view.type) {
        view.type = pad.type;
        u.uColor.value.set(def ? def.color : 0xffffff);
      }
      if (!def) {
        // An empty pad stays plain white until the player picks something.
        u.uProgress.value = 0;
        u.uBack.value = 0.6;
        u.uOpacity.value = 1;
        u.uFill.value = pad.active ? 0.4 : 0.1;
        continue;
      }
      if (pad.level !== view.level && pad.level > 0) this.setTower(view);
      const maxed = pad.level >= def.costs.length;
      if (maxed) {
        u.uOpacity.value = 0;
      } else {
        const cost = def.costs[pad.level];
        u.uProgress.value = pad.paid / cost;
        const ready = game.parts >= cost - pad.paid;
        u.uOpacity.value = pad.level === 0 ? 1 : pad.active || ready ? 0.8 : 0.3;
        u.uBack.value = pad.level === 0 && ready ? 0.75 : 0.35;
        u.uFill.value = pad.active ? 0.4 : 0.16;
      }

      const st = def.levels[Math.min(pad.level, def.levels.length - 1)];
      if (pad.active && st.range) {
        this.rangeRing.visible = true;
        this.rangeRing.position.set(pad.x, 0.05, pad.z);
        this.rangeRing.scale.setScalar(st.range);
        this.rangeRing.material.uniforms.uThick.value = 0.12 / st.range;
        rangeShown = true;
      }

      if (!view.tower) continue;
      view.pop = Math.max(0, view.pop - dt * 3.2);
      const s = 1 + Math.sin(view.pop * Math.PI) * 0.35 - view.pop * 0.3;
      // Towers also get physically bigger with each level.
      view.tower.scale.setScalar(s * (1 + (pad.level - 1) * 0.1));
      const boosted = pad.boost > 0;
      const jammed = pad.jam < 1;
      view.marker.visible = boosted || jammed;
      if (view.marker.visible) view.marker.material.uniforms.uColor.value.set(jammed ? 0xff5a52 : TOWERS.mast.color);

      const { head, muzzle } = view.tower.userData;
      if (def.kind === 'aura') {
        const st = def.levels[pad.level - 1];
        if (head.userData.spin) head.userData.spin.rotation.y += dt * (pad.busy ? 9 : 2);
        view.aura.scale.setScalar(st.range);
        const a = view.aura.material.uniforms;
        a.uThick.value = 0.1 / st.range;
        a.uOpacity.value += ((pad.busy ? 0.75 : 0.18) - a.uOpacity.value) * Math.min(1, dt * 5);
        if (pad.busy && Math.random() < dt * 40) {
          const ang = Math.random() * Math.PI * 2;
          const r = Math.random() * st.range;
          this.particles.burst(pad.x + Math.cos(ang) * r, 0.2, pad.z + Math.sin(ang) * r, 1, { color: 0xffffff, speed: 0.4, up: 1, gravity: 2, size: 0.17, life: 0.7 });
        }
        continue;
      }
      if (def.kind === 'mast') {
        const mast = def.levels[pad.level - 1];
        head.userData.spin.rotation.y += dt * 3;
        view.aura.scale.setScalar(mast.range);
        const a = view.aura.material.uniforms;
        a.uThick.value = 0.1 / mast.range;
        a.uOpacity.value = 0.4 + Math.sin(this.time.value * 3) * 0.12;
        continue;
      }
      if (def.kind === 'pump') {
        head.userData.piston.position.y = 1.02 + Math.abs(Math.sin(this.time.value * 5)) * 0.3;
        continue;
      }
      if (def.kind === 'bench') continue;

      const diff = Math.atan2(Math.sin(pad.aim - head.rotation.y), Math.cos(pad.aim - head.rotation.y));
      head.rotation.y += diff * Math.min(1, dt * 16);
      const k = pad.kick;
      head.position.z = -Math.cos(head.rotation.y) * k * 0.14;
      head.position.x = -Math.sin(head.rotation.y) * k * 0.14;

      if (view.beam) {
        const st = def.levels[pad.level - 1];
        const on = pad.beam;
        view.beam.outer.visible = on;
        view.beam.inner.visible = on;
        if (on) {
          const ax = Math.sin(pad.aim);
          const az = Math.cos(pad.aim);
          const start = 1.7;
          const len = st.range - start;
          const mx = pad.x + ax * (start + len / 2);
          const mz = pad.z + az * (start + len / 2);
          const y = 1.0;
          const flicker = 1 + Math.sin(this.time.value * 40) * 0.1;
          for (const [mesh, r] of [[view.beam.outer, st.width * 0.42 * flicker], [view.beam.inner, st.width * 0.16]]) {
            mesh.position.set(mx, y, mz);
            mesh.rotation.y = pad.aim;
            mesh.scale.set(r, r, len);
          }
          if (Math.random() < dt * 60) {
            const t = 0.25 + Math.random() * 0.75;
            this.particles.burst(pad.x + ax * (start + len * t), 0.5, pad.z + az * (start + len * t), 1, { color: 0xeafcff, speed: 1.6, up: 3, gravity: 12, size: 0.14, life: 0.4 });
          }
        }
      } else if (k > 0.92 && def.kind !== 'pierce') {
        muzzle.getWorldPosition(this.projected);
        this.particles.burst(this.projected.x, this.projected.y, this.projected.z, 1 + pad.level, { color: def.kind === 'splash' ? 0xffb341 : 0xdffaff, speed: 2, up: 1.5, gravity: 2, size: 0.12 * (1 + (pad.level - 1) * 0.3), life: 0.14 });
      }
    }
    if (!rangeShown) this.rangeRing.visible = false;
  }

  syncHero(game, dt) {
    const h = game.hero;
    const { body, legs, gun } = this.hero.userData;
    this.hero.position.set(h.x, 0, h.z);
    const diff = Math.atan2(Math.sin(h.yaw - this.heroYaw), Math.cos(h.yaw - this.heroYaw));
    this.heroYaw += diff * Math.min(1, dt * 14);
    this.hero.rotation.y = this.heroYaw;

    const t = this.time.value;
    const swing = h.moving ? Math.sin(t * 13) * 0.75 : 0;
    legs[0].rotation.x = swing;
    legs[1].rotation.x = -swing;
    body.position.y = h.moving ? Math.abs(Math.cos(t * 13)) * 0.09 : Math.sin(t * 2.4) * 0.015;
    body.rotation.x = h.moving ? 0.12 : 0;

    const aim = h.target ? h.aim : h.yaw;
    const local = Math.atan2(Math.sin(aim - this.heroYaw), Math.cos(aim - this.heroYaw));
    gun.rotation.y += (local - gun.rotation.y) * Math.min(1, dt * 22);
    gun.position.y = 1.28 + body.position.y;
    gun.position.z = -Math.cos(gun.rotation.y) * h.kick * 0.12;
    gun.position.x = -Math.sin(gun.rotation.y) * h.kick * 0.12;

    this.heroRing.position.set(h.x, 0.05, h.z);
    this.heroRing.material.uniforms.uColor.value.set(h.pinched ? 0xff5a52 : 0x7dff8e);
    if (h.pinched && Math.random() < dt * 6) this.floatText(h.x, 3, h.z, 'Pinched', '#ff8d84', 0.8);
  }

  syncProjectiles(game, dt) {
    const arr = this.tracers.instanceMatrix.array;
    const col = this.tracers.instanceColor.array;
    let n = 0;
    for (const s of game.shots) {
      if (n >= 500) break;
      const u = Math.min(1, s.dist / s.d0);
      const y = 1.45 + (0.5 - 1.45) * u;
      const sin = Math.sin(s.yaw);
      const cos = Math.cos(s.yaw);
      const level = s.level ?? 1;
      const w = (s.from === 'hero' ? 0.11 : 0.1) * (1 + (level - 1) * 0.4);
      const l = 0.55 * (1 + (level - 1) * 0.25);
      const o = n * 16;
      arr[o] = cos * w; arr[o + 1] = 0; arr[o + 2] = -sin * w; arr[o + 3] = 0;
      arr[o + 4] = 0; arr[o + 5] = w; arr[o + 6] = 0; arr[o + 7] = 0;
      arr[o + 8] = sin * l; arr[o + 9] = 0; arr[o + 10] = cos * l; arr[o + 11] = 0;
      arr[o + 12] = s.x; arr[o + 13] = y; arr[o + 14] = s.z; arr[o + 15] = 1;
      const colors = SHOT_COLORS[s.from];
      this.color.set(colors ? colors[Math.min(level, colors.length) - 1] : 0xffffff);
      col[n * 3] = this.color.r; col[n * 3 + 1] = this.color.g; col[n * 3 + 2] = this.color.b;
      n++;
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
    this.tracers.instanceColor.needsUpdate = true;

    this.flyingNets.forEach((mesh, i) => {
      const net = game.nets[i];
      mesh.visible = !!net;
      if (!net) return;
      // Bundled up as it leaves the launcher, opening out to full size as it comes down.
      const u = Math.min(1, net.t / net.T);
      mesh.position.set(net.x0 + (net.x - net.x0) * u, 1.3 + (0.8 - 1.3) * u + 4 * 2.4 * u * (1 - u), net.z0 + (net.z - net.z0) * u);
      mesh.rotation.y = u * 8;
      mesh.scale.setScalar(net.st.radius * (0.3 + 0.7 * u));
    });
    for (const net of this.drapedNets) {
      if (net.life <= 0) continue;
      net.life -= dt;
      if (net.life <= 0) { net.mesh.visible = false; continue; }
      net.mesh.scale.setScalar(net.radius * Math.min(1, 0.3 + net.life / 0.25));
    }

    this.shellPool.forEach((mesh, i) => {
      const s = game.shells[i];
      mesh.visible = !!s;
      if (!s) return;
      const u = s.t / s.T;
      mesh.position.set(s.x0 + (s.x - s.x0) * u, 1.6 + (0.3 - 1.6) * u + 4 * 5 * u * (1 - u), s.z0 + (s.z - s.z0) * u);
      mesh.scale.setScalar(1 + (s.level - 1) * 0.25);
    });

    for (const s of this.streaks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      const r = s.r * (s.life / 0.16);
      s.mesh.scale.set(r, r, s.len);
    }
    for (const a of this.arcs) {
      if (a.life <= 0) continue;
      a.life -= dt;
      if (a.life <= 0) a.mesh.visible = false;
    }
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      if (ring.life <= 0) { ring.mesh.visible = false; continue; }
      const k = 1 - ring.life / ring.max;
      ring.mesh.scale.setScalar(ring.radius * (0.25 + 0.75 * Math.sqrt(k)));
      ring.mesh.material.uniforms.uOpacity.value = 1 - k;
    }
  }

  syncCollecting(game, dt) {
    const h = game.hero;
    for (const view of this.beltViews) {
      const { belt } = view;
      view.flyT -= dt;
      if (view.gather > 0 && view.flyT <= 0) {
        view.flyT = 0.05;
        this.particles.toss(belt.x, 1.5, belt.z, h.x, 1.4, h.z, 0.28, 0xdfe5e7, 0.2);
        if (this.onSound) this.onSound('collect', { fill: 1 - belt.tank / Math.max(belt.cap, 1) });
      }
      // Pop the running total over the hero's head a few times a second, not every frame.
      view.popT = (view.popT ?? 0) - dt;
      if (view.gather >= 1 && (view.popT <= 0 || belt.tank <= 0)) {
        this.floatText(h.x, 3, h.z, `+${Math.round(view.gather)}`, '#ffd23f', 1);
        view.gather = 0;
        view.popT = 0.3;
      }
    }
  }

  // Runs once per displayed frame. dt is real seconds, scaled by game speed.
  update(game, dt) {
    this.time.value += dt;
    const t = this.time.value;
    this.world.water.material.uniforms.uTime.value = t;
    for (const b of this.world.buoys) {
      b.mesh.position.y = -3.9 + Math.sin(t * 1.3 + b.phase) * 0.14;
      b.mesh.rotation.z = Math.sin(t * 0.9 + b.phase) * 0.08;
    }

    this.syncCrabs(game, t);
    this.syncBelts(game, dt);
    this.syncPads(game, dt);
    this.syncHero(game, dt);
    this.syncProjectiles(game, dt);
    this.syncCollecting(game, dt);
    this.particles.update(dt);

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += dt * 2;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }

    const gate = this.world.gateFlash;
    gate.emissiveIntensity = Math.max(0, gate.emissiveIntensity - dt * 3);

    this.shake = Math.max(0, this.shake - dt * 2.4);
    const follow = game.hero.x * 0.05;
    const amp = this.shake * this.shake * 0.8;
    this.camera.position.set(
      this.camBase.x + follow + Math.sin(t * 61) * amp,
      this.camBase.y + Math.sin(t * 47) * amp,
      this.camBase.z + Math.cos(t * 53) * amp,
    );
    this.camera.lookAt(this.camTarget.x + follow, 0, this.camTarget.z);
    this.camera.updateMatrixWorld();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
