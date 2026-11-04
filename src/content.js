// Every tunable number that isn't specific to one level.

export const WORLD = {
  // The yard is where the hero can walk.
  minX: -9.2, maxX: 9.2, minZ: -1.2, maxZ: 15.8,
  spawnZ: -34,
  gateZ: 16.5,
  roadHalf: 3.9,
  beltX: 7,
  beltEndZ: -3.6,
  beltLen: 46,
  hydrantZ: 1.6,
  hydrantR: 0.8,
  ringR: 2.2,
  padR: 1.6,
  towerR: 0.85,
};

export const HERO = {
  speed: 8.5,
  pinchedFactor: 0.42,
  start: [-7.6, 4.6],
  // Index is the Blaster Bench level.
  levels: [
    { range: 8.5, rate: 4.5, dmg: 1.4 },
    { range: 9.5, rate: 5.5, dmg: 2.1 },
    { range: 10.5, rate: 6.5, dmg: 3.0 },
    { range: 11.5, rate: 8, dmg: 4.0 },
  ],
};

// armor is the share of damage that gets through. Harpoons ignore it.
// counters: the towers that help most against this crab, best first, as measured by
// `npm run towers -- counters`. The results screen suggests the first two a level offers.
export const CRABS = {
  scuttler: { name: 'Scuttler', hp: 3, speed: 2.2, leak: 1, size: 0.8, armor: 1, slowResist: 1, color: 0xe0262b, counters: ['mortar', 'foam', 'hose', 'eel'] },
  runner: { name: 'Runner', hp: 2.5, speed: 4.6, leak: 1, size: 0.7, armor: 1, slowResist: 1, color: 0xff7a2e, counters: ['foam', 'hose', 'mortar'] },
  hermit: { name: 'Hermit', hp: 20, speed: 1.6, leak: 2, size: 1.15, armor: 0.45, slowResist: 1, color: 0xa81628, counters: ['harpoon', 'eel', 'mortar'] },
  brood: { name: 'Brood', hp: 40, speed: 1.4, leak: 3, size: 1.6, armor: 1, slowResist: 1, color: 0xd11c66, spawn: { type: 'scuttler', count: 7 }, counters: ['harpoon', 'eel'] },
  king: { name: 'King', hp: 1200, speed: 0.8, leak: 20, size: 4.2, armor: 0.7, slowResist: 0.4, color: 0x7d0d1c, bar: true, counters: ['net', 'harpoon'] },
  // Heals everything around it, so it's worth picking out of a crowd.
  medic: { name: 'Medic', hp: 14, speed: 1.7, leak: 2, size: 1, armor: 1, slowResist: 1, color: 0x19b8a6, heal: { every: 1.2, radius: 3.4, share: 0.08 }, counters: ['harpoon', 'mortar'] },
  // Sheds its shell at half health and bolts for the gate.
  molter: { name: 'Molter', hp: 12, speed: 1.8, leak: 1, size: 0.9, armor: 1, slowResist: 1, color: 0x8a3fd1, molt: { at: 0.5, speed: 2.3 }, counters: ['mortar', 'eel', 'foam', 'harpoon'] },
  // Tiny and quick, and it comes in huge numbers. Towers that cover an area do best.
  flea: { name: 'Flea', hp: 1.2, speed: 3.6, leak: 1, size: 0.5, armor: 1, slowResist: 1, color: 0xffb347, counters: ['hose', 'foam', 'mortar', 'eel'] },
  // Fast and heavy, and foam barely slows it. A net stops it dead.
  bull: { name: 'Bull', hp: 70, speed: 2.6, leak: 4, size: 1.5, armor: 0.5, slowResist: 0.15, color: 0x6b3320, counters: ['harpoon', 'net'] },
  // Slows every tower near it, so it's worth killing from long range.
  jammer: { name: 'Jammer', hp: 16, speed: 1.7, leak: 2, size: 1, armor: 1, slowResist: 1, color: 0xc9c02e, jam: { radius: 4.5, factor: 0.6 }, counters: ['foam', 'mortar', 'harpoon', 'eel'] },
};

// costs[i] buys level i + 1. A pad's first cost builds it.
// maxHits caps splash and beams. Without it a packed block makes them far better than anything else.
export const TOWERS = {
  spitter: {
    name: 'Spitter', kind: 'shot', color: 0x18a999,
    blurb: 'Fast shots at one crab', role: 'Good all-rounder',
    costs: [40, 70, 130],
    levels: [
      { range: 8.5, rate: 2.8, dmg: 2 },
      { range: 9.5, rate: 3.6, dmg: 3.2 },
      { range: 10.5, rate: 4.6, dmg: 4.8 },
    ],
  },
  mortar: {
    name: 'Mortar', kind: 'splash', color: 0xf08a24,
    blurb: 'Slow shells that burst across a crowd', role: 'Bursts on crowds',
    costs: [120, 160, 260],
    levels: [
      { range: 13, rate: 0.5, dmg: 6.5, radius: 2.2, maxHits: 12 },
      { range: 14, rate: 0.6, dmg: 9.5, radius: 2.6, maxHits: 16 },
      { range: 15, rate: 0.7, dmg: 14, radius: 3, maxHits: 22 },
    ],
  },
  foam: {
    name: 'Foamer', kind: 'aura', color: 0x7fd8f0,
    blurb: 'Slows every crab nearby', role: 'Slows crabs',
    costs: [90, 120, 190],
    levels: [
      { range: 6, slow: 0.35, dps: 0 },
      { range: 7, slow: 0.45, dps: 0.3 },
      { range: 8, slow: 0.55, dps: 0.7 },
    ],
  },
  hose: {
    name: 'Fire hose', kind: 'beam', color: 0xd9262c,
    blurb: 'A jet that hits everything in line', role: 'Sprays crowds',
    costs: [190, 220, 340],
    levels: [
      { range: 11, width: 1, dps: 3.6, turn: 2.6, maxHits: 5 },
      { range: 12, width: 1.2, dps: 5.6, turn: 2.8, maxHits: 7 },
      { range: 13, width: 1.5, dps: 9, turn: 3, maxHits: 10 },
    ],
  },
  harpoon: {
    name: 'Harpoon', kind: 'pierce', color: 0x5d6b73,
    blurb: 'Hunts the biggest crab and ignores armor', role: 'Hunts big crabs',
    costs: [140, 170, 280],
    levels: [
      { range: 13, rate: 0.5, dmg: 22, pierce: 3 },
      { range: 14, rate: 0.6, dmg: 34, pierce: 3 },
      { range: 15, rate: 0.7, dmg: 54, pierce: 4 },
    ],
  },
  eel: {
    name: 'Eel coil', kind: 'chain', color: 0x3f6fe0,
    blurb: 'Lightning that jumps from crab to crab', role: 'Chain lightning',
    costs: [110, 150, 240],
    levels: [
      { range: 8, rate: 0.8, dmg: 3, jumps: 4, reach: 3 },
      { range: 9, rate: 0.9, dmg: 4.6, jumps: 6, reach: 3.3 },
      { range: 10, rate: 1, dmg: 7, jumps: 8, reach: 3.6 },
    ],
  },
  net: {
    name: 'Net launcher', kind: 'net', color: 0x8f7d3a,
    blurb: 'Pins the toughest crab in place', role: 'Stops big crabs',
    costs: [100, 130, 200],
    levels: [
      { range: 12, rate: 0.25, hold: 3, radius: 1.4, maxHits: 4, bossHold: 0.6 },
      { range: 13, rate: 0.3, hold: 3.5, radius: 1.7, maxHits: 6, bossHold: 0.6 },
      { range: 14, rate: 0.36, hold: 4, radius: 2, maxHits: 9, bossHold: 0.6 },
    ],
  },
  mast: {
    name: 'Signal mast', kind: 'mast', color: 0xd94f9b,
    blurb: 'Makes nearby towers fire faster', role: 'Boosts towers',
    costs: [90, 120, 200],
    levels: [
      { range: 6.5, boost: 0.3 },
      { range: 7.5, boost: 0.45 },
      { range: 8.5, boost: 0.65 },
    ],
  },
  pump: {
    name: 'Bilge pump', kind: 'pump', color: 0x2f9e6e,
    blurb: 'Earns parts over time, so build it early', role: 'Earns parts',
    costs: [100, 140, 220],
    levels: [{ rate: 1.6 }, { rate: 3.2 }, { rate: 5.5 }],
  },
  bench: {
    name: 'Bench', kind: 'bench', color: 0xf6c21c,
    blurb: 'Upgrades your own blaster', role: 'Your blaster',
    costs: [50, 110, 220],
    levels: [{}, {}, {}],
  },
};

// Special plates ride the belts. They fire when you open the valve they reached.
export const SPECIALS = {
  chill: { label: 'Chill', plate: '#7fe3ff', ink: '#06404f', banner: 'Chill: crabs slowed', secs: 7, factor: 0.35 },
  surge: { label: 'Surge', plate: '#ffd23f', ink: '#4a3500', banner: 'Surge: everything fires twice as fast', secs: 8 },
  boom: { label: 'Boom', plate: '#ff8a3d', ink: '#4a1c00', banner: 'Boom: depth charge', share: 0.6, bossShare: 0.12 },
  patch: { label: 'Patch', plate: '#8ef0a0', ink: '#0d4420', banner: 'Patch: pump house repaired', hp: 4 },
};

// The numbers a player sees when choosing or upgrading a tower.
const percent = (v) => `${Math.round(v * 100)}%`;
const seconds = (v) => `${v}s`;
const reload = (rate) => `${(1 / rate).toFixed(1)}s`;

const STAT_ROWS = {
  shot: [['Damage', 'dmg'], ['Shots per second', 'rate'], ['Range', 'range']],
  splash: [['Damage', 'dmg'], ['Crabs hit', 'maxHits'], ['Blast size', 'radius'], ['Shots per second', 'rate'], ['Range', 'range']],
  aura: [['Slows crabs by', 'slow', percent], ['Damage per second', 'dps'], ['Range', 'range']],
  beam: [['Damage per second', 'dps'], ['Crabs hit', 'maxHits'], ['Range', 'range']],
  pierce: [['Damage', 'dmg'], ['Crabs pierced', 'pierce'], ['Shots per second', 'rate'], ['Range', 'range']],
  chain: [['Damage', 'dmg'], ['Crabs hit', 'jumps'], ['Shots per second', 'rate'], ['Range', 'range']],
  net: [['Holds for', 'hold', seconds], ['Crabs held', 'maxHits'], ['Reloads in', 'rate', reload], ['Range', 'range']],
  mast: [['Speeds up towers by', 'boost', percent], ['Range', 'range']],
  pump: [['Parts per second', 'rate']],
  bench: [['Damage', 'dmg'], ['Shots per second', 'rate'], ['Range', 'range']],
};

// Level 0 means not built. The Bench upgrades the blaster, which starts with its own stats.
function statsAt(type, level) {
  const def = TOWERS[type];
  if (def.kind === 'bench') return HERO.levels[level];
  return level > 0 ? def.levels[level - 1] : null;
}

// One { label, now, next } per stat. now is null before a tower exists, next is null at max level.
export function statLines(type, level) {
  const def = TOWERS[type];
  const now = statsAt(type, level);
  const next = level < def.costs.length ? statsAt(type, level + 1) : null;
  return STAT_ROWS[def.kind].map(([label, key, format = String]) => ({
    label,
    now: now ? format(now[key]) : null,
    next: next ? format(next[key]) : null,
  }));
}
