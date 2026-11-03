// The game rules. No DOM and no Three.js in here, so tools/balance.mjs can play levels headless.
// The renderer reads this state and drains game.events each frame.

import { CRABS, HERO, SPECIALS, TOWERS, WORLD } from './content.js';

export const STEP = 1 / 60;

const PANEL_GAP = 1.2;
const LANE_SAMPLE = 0.5;
const SHOT_SPEED = 36;
const SHELL_TIME = 0.85;

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function buildLane(spec) {
  // Split long straights first, so corner cutting can't drag the far end of the run sideways.
  let pts = [];
  spec.points.forEach(([x, z], i, all) => {
    if (i === all.length - 1) { pts.push([x, z]); return; }
    const [nx, nz] = all[i + 1];
    const parts = Math.max(1, Math.ceil(Math.hypot(nx - x, nz - z) / 9));
    for (let k = 0; k < parts; k++) pts.push([x + (nx - x) * k / parts, z + (nz - z) * k / parts]);
  });
  for (let pass = 0; pass < 3; pass++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      next.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  // Resample at a fixed spacing so a crab's position is a direct array lookup.
  const xs = [pts[0][0]];
  const zs = [pts[0][1]];
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (seg === 0) continue;
    let d = LANE_SAMPLE - carry;
    while (d <= seg) {
      xs.push(ax + (bx - ax) * d / seg);
      zs.push(az + (bz - az) * d / seg);
      d += LANE_SAMPLE;
    }
    carry = seg - (d - LANE_SAMPLE);
  }
  return { xs, zs, n: xs.length, length: (xs.length - 1) * LANE_SAMPLE, width: spec.width };
}

const at = { x: 0, z: 0, dx: 0, dz: 1 };

export function lanePos(lane, t, lat = 0) {
  const { xs, zs, n } = lane;
  const i = t <= 0 ? 0 : Math.min(n - 2, (t / LANE_SAMPLE) | 0);
  const u = t / LANE_SAMPLE - i;
  const dx = (xs[i + 1] - xs[i]) / LANE_SAMPLE;
  const dz = (zs[i + 1] - zs[i]) / LANE_SAMPLE;
  at.x = xs[i] + (xs[i + 1] - xs[i]) * u + dz * lat;
  at.z = zs[i] + (zs[i + 1] - zs[i]) * u - dx * lat;
  at.dx = dx;
  at.dz = dz;
  return at;
}

function makePanel(belt) {
  const { spec } = belt;
  const index = belt.dealt++;
  const special = spec.specials?.[index];
  const panel = { id: belt.nextId++, s: 0 };
  if (special) {
    panel.kind = special;
    panel.value = 0;
  } else {
    panel.kind = 'parts';
    panel.value = spec.values[belt.valueIndex++ % spec.values.length];
  }
  return panel;
}

function makeBelt(spec, side) {
  const belt = {
    side, spec,
    x: side * WORLD.beltX,
    z: WORLD.hydrantZ,
    cap: spec.cap,
    tank: 0,
    specials: [],
    panels: [],
    // Purely visual: a sparse belt crawls, so its big plates stay in view for longer.
    speed: spec.speed ?? Math.min(4.2, Math.max(1.1, 4 / spec.every)),
    every: spec.every,
    tipEvery: spec.tipEvery ?? 0.4,
    tipT: 0,
    spawnT: spec.every,
    dealt: 0,
    valueIndex: 0,
    nextId: 1,
    open: false,
  };
  // Start with plates already riding the belt instead of an empty conveyor.
  const gap = Math.max(PANEL_GAP, spec.every * belt.speed);
  for (let s = WORLD.beltLen; s >= 0; s -= gap) {
    const panel = makePanel(belt);
    panel.s = s;
    belt.panels.push(panel);
  }
  return belt;
}

export function createGame(def, seed = 1) {
  const [heroX, heroZ] = def.heroStart ?? HERO.start;
  return {
    def,
    rand: makeRng(seed * 7919 + (def.id || 1)),
    lanes: def.lanes.map(buildLane),
    time: 0,
    phase: 'playing',
    hp: def.hp,
    hpMax: def.hp,
    parts: def.start,
    hero: {
      x: heroX, z: heroZ,
      moveX: 0, moveZ: 0,
      yaw: Math.PI, aim: Math.PI,
      moving: false, pinched: false,
      cool: 0, kick: 0, level: 0, target: null,
    },
    belts: [
      def.belts.left ? makeBelt(def.belts.left, -1) : null,
      def.belts.right ? makeBelt(def.belts.right, 1) : null,
    ].filter(Boolean),
    pads: def.pads.map((p) => ({
      type: p.type, x: p.x, z: p.z,
      level: p.built ?? 0, paid: 0,
      armed: true, active: false,
      cool: 0, aim: Math.PI, kick: 0,
      beam: false, target: null,
    })),
    crabs: [],
    shots: [],
    shells: [],
    pending: [],
    events: [],
    waveIndex: 0,
    waveT: def.waves[0].gap,
    fx: { chill: 0, surge: 0 },
    stats: { kills: 0, leaked: 0, peak: 0, collected: 0, stalled: 0 },
  };
}

export function sendNextWave(game) {
  if (game.waveIndex < game.def.waves.length) game.waveT = 0;
}

export function starsFor(game) {
  if (game.phase !== 'won') return 0;
  const share = game.hp / game.hpMax;
  if (share >= 0.9) return 3;
  if (share >= 0.5) return 2;
  return 1;
}

function spawnCrab(game, type, lane, t, lat, group) {
  const def = CRABS[type];
  const hpMul = group?.hpMul ?? 1;
  const hp = def.hp * (game.def.crabHp ?? 1) * hpMul;
  const crab = {
    type, def, lane, t, lat, hp, hpMul,
    wave: game.waveIndex,
    hpMax: hp,
    leak: group?.leak ?? def.leak,
    speedMul: 1,
    molted: false,
    healT: game.rand() * (def.heal?.every ?? 1),
    pending: 0, slow: 0, flash: 0, frost: 0,
    phase: game.rand() * Math.PI * 2,
    dead: false, x: 0, z: 0, dx: 0, dz: 1,
  };
  const p = lanePos(lane, t, lat);
  crab.x = p.x;
  crab.z = p.z;
  game.crabs.push(crab);
  return crab;
}

function spawnGroup(game, group) {
  const def = CRABS[group.type];
  if (group.lane === 'both' || (group.lane === undefined && game.lanes.length > 1)) {
    const half = Math.ceil(group.count / 2);
    spawnGroup(game, { ...group, lane: 0, count: half });
    spawnGroup(game, { ...group, lane: 1, count: group.count - half });
    return;
  }
  const lane = game.lanes[group.lane ?? 0];
  // Crabs arrive as a packed block, which is what makes the horde read as a horde.
  const room = Math.max(0, lane.width - def.size * 0.8);
  const perRow = Math.max(1, Math.floor(room / (def.size * 0.85)));
  const depth = def.size * 0.75 * (group.spread ?? 1);
  for (let i = 0; i < group.count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const t = -row * depth - game.rand() * depth * 0.6;
    const lat = perRow === 1
      ? (game.rand() - 0.5) * room
      : (col + 0.5) / perRow * room - room / 2 + (game.rand() - 0.5) * 0.25;
    spawnCrab(game, group.type, lane, t, lat, group);
  }
}

function updateWaves(game, dt) {
  const { waves } = game.def;
  if (game.waveIndex < waves.length) {
    game.waveT -= dt;
    if (game.waveT <= 0) {
      const wave = waves[game.waveIndex++];
      for (const group of wave.groups) game.pending.push({ group, delay: group.delay ?? 0 });
      game.waveT = game.waveIndex < waves.length ? waves[game.waveIndex].gap : 0;
      game.events.push({ t: 'wave', index: game.waveIndex, total: waves.length });
    }
  }
  for (let i = game.pending.length - 1; i >= 0; i--) {
    const entry = game.pending[i];
    entry.delay -= dt;
    if (entry.delay <= 0) {
      spawnGroup(game, entry.group);
      game.pending.splice(i, 1);
    }
  }
}

function killCrab(game, crab) {
  crab.dead = true;
  game.stats.kills++;
  game.events.push({ t: 'die', x: crab.x, z: crab.z, type: crab.type, size: crab.def.size });
  const brood = crab.def.spawn;
  if (brood) {
    const kid = CRABS[brood.type];
    const room = Math.max(0, crab.lane.width - kid.size);
    for (let i = 0; i < brood.count; i++) {
      const lat = Math.max(-room / 2, Math.min(room / 2, crab.lat + (game.rand() - 0.5) * 2.4));
      spawnCrab(game, brood.type, crab.lane, crab.t + (game.rand() - 0.5) * 2, lat, { hpMul: crab.hpMul });
    }
  }
}

function hurt(game, crab, dmg, ignoreArmor = false) {
  if (crab.dead) return;
  crab.hp -= ignoreArmor ? dmg : dmg * crab.def.armor;
  crab.flash = 0.12;
  if (crab.hp <= 0) {
    killCrab(game, crab);
    return;
  }
  const { molt } = crab.def;
  if (molt && !crab.molted && crab.hp <= crab.hpMax * molt.at) {
    crab.molted = true;
    crab.speedMul = molt.speed;
    game.events.push({ t: 'molt', x: crab.x, z: crab.z });
  }
}

function nearestCrab(game, x, z, range, skipDoomed = true) {
  let best = null;
  let bestD = range * range;
  for (const c of game.crabs) {
    if (c.dead || c.t < 0 || (skipDoomed && c.hp - c.pending <= 0)) continue;
    const dx = c.x - x;
    const dz = c.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// The crab closest to the gate, since that is the one about to cost you.
function firstCrab(game, x, z, range) {
  let best = null;
  let bestLeft = Infinity;
  const r2 = range * range;
  for (const c of game.crabs) {
    if (c.dead || c.t < 0 || c.hp - c.pending <= 0) continue;
    const dx = c.x - x;
    const dz = c.z - z;
    if (dx * dx + dz * dz > r2) continue;
    const left = c.lane.length - c.t;
    if (left < bestLeft) { bestLeft = left; best = c; }
  }
  return best;
}

function stillValid(c, x, z, range) {
  if (!c || c.dead || c.hp - c.pending <= 0) return false;
  const dx = c.x - x;
  const dz = c.z - z;
  return dx * dx + dz * dz <= range * range;
}

// The crabs nearest the source, by the hitKey the caller just set.
function closestHits(hits, max) {
  if (hits.length > max) {
    hits.sort((a, b) => a.hitKey - b.hitKey);
    hits.length = max;
  }
  return hits;
}

function fireShot(game, x, z, target, dmg, from) {
  target.pending += dmg * target.def.armor;
  game.shots.push({
    x, z, target, dmg, from,
    d0: Math.hypot(target.x - x, target.z - z) || 1,
    dist: 0,
    yaw: Math.atan2(target.x - x, target.z - z),
  });
}

function triggerSpecial(game, kind) {
  const def = SPECIALS[kind];
  if (kind === 'chill') game.fx.chill = def.secs;
  if (kind === 'surge') game.fx.surge = def.secs;
  if (kind === 'patch') game.hp = Math.min(game.hpMax, game.hp + def.hp);
  if (kind === 'boom') {
    const n = game.crabs.length;
    for (let i = 0; i < n; i++) {
      const c = game.crabs[i];
      if (c.t >= 0) hurt(game, c, c.hpMax * (c.def.bar ? def.bossShare : def.share), true);
    }
  }
  game.events.push({ t: 'special', kind });
}

function pushOut(hero, x, z, r) {
  const dx = hero.x - x;
  const dz = hero.z - z;
  const d = Math.hypot(dx, dz);
  if (d < r && d > 0.001) {
    hero.x = x + dx / d * r;
    hero.z = z + dz / d * r;
  }
}

function updateHero(game, input, dt) {
  const h = game.hero;
  const mx = input?.mx ?? 0;
  const mz = input?.mz ?? 0;

  // Walking through crabs is allowed, but they grab your boots.
  let pinched = false;
  for (const c of game.crabs) {
    const r = 0.55 + c.def.size * 0.42;
    const dx = c.x - h.x;
    const dz = c.z - h.z;
    if (dx * dx + dz * dz < r * r) { pinched = true; break; }
  }
  h.pinched = pinched;

  const speed = HERO.speed * (pinched ? HERO.pinchedFactor : 1);
  h.moving = Math.hypot(mx, mz) > 0.05;
  if (h.moving) {
    h.x += mx * speed * dt;
    h.z += mz * speed * dt;
    h.yaw = Math.atan2(mx, mz);
  }
  for (const b of game.belts) pushOut(h, b.x, b.z, WORLD.hydrantR);
  for (const p of game.pads) if (p.level > 0) pushOut(h, p.x, p.z, WORLD.towerR);
  h.x = Math.max(WORLD.minX, Math.min(WORLD.maxX, h.x));
  h.z = Math.max(WORLD.minZ, Math.min(WORLD.maxZ, h.z));

  // Hydrant valves: standing in the ring empties the tank into your pocket.
  for (const b of game.belts) {
    const inside = Math.hypot(h.x - b.x, h.z - b.z) < WORLD.ringR;
    b.open = inside;
    if (!inside) continue;
    while (b.specials.length) triggerSpecial(game, b.specials.shift());
    if (b.tank > 0) {
      const amount = Math.min(b.tank, Math.max(45, b.tank * 2) * dt);
      b.tank -= amount;
      game.parts += amount;
      game.stats.collected += amount;
      if (b.tank < 0.001) b.tank = 0;
      game.events.push({ t: 'collect', side: b.side, amount });
    }
  }

  // Pads: standing on one pays into it. Partial payments stay on the pad.
  for (const p of game.pads) {
    const def = TOWERS[p.type];
    const inside = Math.hypot(h.x - p.x, h.z - p.z) < WORLD.padR;
    p.active = inside;
    if (!inside) { p.armed = true; continue; }
    if (!p.armed || p.level >= def.costs.length || game.parts <= 0) continue;
    const cost = def.costs[p.level];
    const pay = Math.min(game.parts, cost - p.paid, Math.max(70, cost * 0.9) * dt);
    game.parts -= pay;
    p.paid += pay;
    if (p.paid >= cost - 1e-6) {
      p.paid = 0;
      p.level++;
      // You have to step off and back on to buy the next level.
      p.armed = false;
      if (p.type === 'bench') h.level = p.level;
      game.events.push({ t: 'built', pad: p });
    }
  }

  // The blaster fires on its own, so moving and shooting are never a trade.
  const stats = HERO.levels[h.level];
  const rate = stats.rate * (game.fx.surge > 0 ? 2 : 1);
  h.cool -= dt;
  h.kick = Math.max(0, h.kick - dt * 8);
  const target = nearestCrab(game, h.x, h.z, stats.range);
  h.target = target;
  if (target) {
    h.aim = Math.atan2(target.x - h.x, target.z - h.z);
    if (h.cool <= 0) {
      h.cool = 1 / rate;
      h.kick = 1;
      fireShot(game, h.x, h.z, target, stats.dmg, 'hero');
      game.events.push({ t: 'shot', from: 'hero' });
    }
  }
}

function updateBelts(game, dt) {
  for (const b of game.belts) {
    b.tipT -= dt;
    if (b.tank >= b.cap) game.stats.stalled += dt;
    let limit = WORLD.beltLen;
    for (const p of b.panels) {
      p.s = Math.min(p.s + b.speed * dt, limit);
      limit = p.s - PANEL_GAP;
    }
    const front = b.panels[0];
    if (front && front.s >= WORLD.beltLen - 1e-3 && b.tipT <= 0 && b.tank < b.cap) {
      b.panels.shift();
      b.tipT = b.tipEvery;
      if (front.kind === 'parts') b.tank += front.value;
      else b.specials.push(front.kind);
      game.events.push({ t: 'tip', side: b.side, panel: front });
    }
    b.spawnT -= dt;
    const last = b.panels[b.panels.length - 1];
    if (b.spawnT <= 0 && (!last || last.s >= PANEL_GAP)) {
      b.panels.push(makePanel(b));
      b.spawnT = b.every;
    }
  }
}

function updateTowers(game, dt) {
  const rateScale = game.fx.surge > 0 ? 2 : 1;
  for (const p of game.pads) {
    p.kick = Math.max(0, p.kick - dt * 6);
    p.beam = false;
    if (p.level <= 0) continue;
    const def = TOWERS[p.type];
    if (def.kind === 'bench') continue;
    const st = def.levels[p.level - 1];
    p.cool -= dt;

    if (def.kind === 'aura') {
      let any = false;
      const r2 = st.range * st.range;
      const n = game.crabs.length;
      for (let i = 0; i < n; i++) {
        const c = game.crabs[i];
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        if (c.t < 0 || dx * dx + dz * dz > r2) continue;
        any = true;
        c.slow = Math.max(c.slow, st.slow * c.def.slowResist);
        if (st.dps) hurt(game, c, st.dps * dt);
      }
      p.busy = any;
      continue;
    }

    if (!stillValid(p.target, p.x, p.z, st.range)) p.target = firstCrab(game, p.x, p.z, st.range);
    const t = p.target;
    if (!t) continue;
    const want = Math.atan2(t.x - p.x, t.z - p.z);

    if (def.kind === 'beam') {
      let diff = want - p.aim;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const turn = st.turn * dt;
      p.aim += Math.max(-turn, Math.min(turn, diff));
      p.beam = true;
      const ax = Math.sin(p.aim);
      const az = Math.cos(p.aim);
      const dps = st.dps * rateScale;
      const hits = [];
      for (const c of game.crabs) {
        if (c.t < 0 || c.dead) continue;
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        const along = dx * ax + dz * az;
        if (along < 0 || along > st.range) continue;
        if (Math.abs(dx * az - dz * ax) < st.width * 0.5 + c.def.size * 0.4) {
          c.hitKey = along;
          hits.push(c);
        }
      }
      for (const c of closestHits(hits, st.maxHits)) hurt(game, c, dps * dt);
      continue;
    }

    p.aim = want;
    if (p.cool > 0) continue;
    p.cool = 1 / (st.rate * rateScale);
    p.kick = 1;

    if (def.kind === 'shot') {
      fireShot(game, p.x, p.z, t, st.dmg, p.type);
      game.events.push({ t: 'shot', from: p.type, pad: p });
    } else if (def.kind === 'splash') {
      // Lead the target so the shell lands where the crowd will be.
      const lead = lanePos(t.lane, t.t + t.def.speed * (1 - t.slow) * SHELL_TIME, t.lat);
      game.shells.push({ x0: p.x, z0: p.z, x: lead.x, z: lead.z, t: 0, T: SHELL_TIME, dmg: st.dmg, radius: st.radius, maxHits: st.maxHits });
      game.events.push({ t: 'shot', from: p.type, pad: p });
    } else if (def.kind === 'pierce') {
      const ax = Math.sin(want);
      const az = Math.cos(want);
      const hits = [];
      for (const c of game.crabs) {
        if (c.t < 0 || c.dead) continue;
        const dx = c.x - p.x;
        const dz = c.z - p.z;
        const along = dx * ax + dz * az;
        if (along < 0 || along > st.range) continue;
        if (Math.abs(dx * az - dz * ax) < 0.45 + c.def.size * 0.4) hits.push({ c, along });
      }
      hits.sort((a, b) => a.along - b.along);
      const struck = hits.slice(0, st.pierce);
      for (const { c } of struck) hurt(game, c, st.dmg, true);
      const reach = struck.length ? struck[struck.length - 1].along + 1 : st.range;
      game.events.push({ t: 'harpoon', pad: p, x1: p.x + ax * reach, z1: p.z + az * reach });
    }
  }
}

function updateProjectiles(game, dt) {
  for (let i = game.shots.length - 1; i >= 0; i--) {
    const s = game.shots[i];
    let t = s.target;
    if (t.dead) {
      t = nearestCrab(game, s.x, s.z, 2, false);
      if (!t) { game.shots[i] = game.shots[game.shots.length - 1]; game.shots.pop(); continue; }
      s.target = t;
    }
    const dx = t.x - s.x;
    const dz = t.z - s.z;
    const d = Math.hypot(dx, dz);
    const move = SHOT_SPEED * dt;
    if (d <= move) {
      t.pending = Math.max(0, t.pending - s.dmg * t.def.armor);
      hurt(game, t, s.dmg);
      game.shots[i] = game.shots[game.shots.length - 1];
      game.shots.pop();
    } else {
      s.x += dx / d * move;
      s.z += dz / d * move;
      s.dist += move;
      s.yaw = Math.atan2(dx, dz);
    }
  }
  for (let i = game.shells.length - 1; i >= 0; i--) {
    const s = game.shells[i];
    s.t += dt;
    if (s.t < s.T) continue;
    const hits = [];
    for (const c of game.crabs) {
      if (c.t < 0 || c.dead) continue;
      const dx = c.x - s.x;
      const dz = c.z - s.z;
      const r = s.radius + c.def.size * 0.3;
      const d = dx * dx + dz * dz;
      if (d < r * r) {
        c.hitKey = d;
        hits.push(c);
      }
    }
    for (const c of closestHits(hits, s.maxHits)) hurt(game, c, s.dmg);
    game.events.push({ t: 'splash', x: s.x, z: s.z, radius: s.radius });
    game.shells[i] = game.shells[game.shells.length - 1];
    game.shells.pop();
  }
}

function healAround(game, medic, dt) {
  medic.healT -= dt;
  if (medic.healT > 0) return;
  const { every, radius, share } = medic.def.heal;
  medic.healT = every;
  const r2 = radius * radius;
  for (const c of game.crabs) {
    if (c === medic || c.dead || c.def.bar) continue;
    const dx = c.x - medic.x;
    const dz = c.z - medic.z;
    if (dx * dx + dz * dz < r2) c.hp = Math.min(c.hpMax, c.hp + c.hpMax * share);
  }
  game.events.push({ t: 'heal', x: medic.x, z: medic.z, radius });
}

function updateCrabs(game, dt) {
  const chill = game.fx.chill > 0 ? SPECIALS.chill.factor : 1;
  for (const c of game.crabs) {
    if (c.dead) continue;
    const pace = (1 - c.slow) * (c.def.slowResist < 1 ? Math.max(chill, 0.7) : chill);
    c.t += c.def.speed * c.speedMul * pace * dt;
    if (c.def.heal && c.t >= 0) healAround(game, c, dt);
    c.lat += Math.sin(game.time * 1.6 + c.phase) * 0.3 * dt;
    const room = Math.max(0, c.lane.width - c.def.size * 0.8) / 2;
    c.lat = Math.max(-room, Math.min(room, c.lat));
    const p = lanePos(c.lane, c.t, c.lat);
    c.x = p.x;
    c.z = p.z;
    c.dx = p.dx;
    c.dz = p.dz;
    c.flash = Math.max(0, c.flash - dt);
    c.frost = c.slow > 0 ? 1 : Math.max(0, c.frost - dt * 4);
    c.slow = 0;
    if (c.t >= c.lane.length) {
      c.dead = true;
      game.hp -= c.leak;
      game.stats.leaked++;
      game.events.push({ t: 'leak', x: c.x, z: c.z, damage: c.leak });
    }
  }
}

function removeDead(game) {
  const { crabs } = game;
  for (let i = crabs.length - 1; i >= 0; i--) {
    if (crabs[i].dead) {
      crabs[i] = crabs[crabs.length - 1];
      crabs.pop();
    }
  }
  game.stats.peak = Math.max(game.stats.peak, crabs.length);
}

export function stepGame(game, input) {
  if (game.phase !== 'playing') return;
  const dt = STEP;
  game.time += dt;
  game.fx.chill = Math.max(0, game.fx.chill - dt);
  game.fx.surge = Math.max(0, game.fx.surge - dt);

  updateWaves(game, dt);
  updateBelts(game, dt);
  updateHero(game, input, dt);
  updateTowers(game, dt);
  updateProjectiles(game, dt);
  updateCrabs(game, dt);
  removeDead(game);

  if (game.hp <= 0) {
    game.hp = 0;
    game.phase = 'lost';
    game.events.push({ t: 'end', won: false });
  } else if (game.waveIndex >= game.def.waves.length && !game.pending.length && !game.crabs.length) {
    game.phase = 'won';
    game.events.push({ t: 'end', won: true });
  }
}
