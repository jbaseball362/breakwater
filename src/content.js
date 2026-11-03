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
export const CRABS = {
  scuttler: { name: 'Scuttler', hp: 3, speed: 2.2, leak: 1, size: 0.8, armor: 1, slowResist: 1, color: 0xe0262b },
  runner: { name: 'Runner', hp: 2.5, speed: 4.6, leak: 1, size: 0.7, armor: 1, slowResist: 1, color: 0xff7a2e },
  hermit: { name: 'Hermit', hp: 20, speed: 1.6, leak: 2, size: 1.15, armor: 0.45, slowResist: 1, color: 0xa81628 },
  brood: { name: 'Brood', hp: 40, speed: 1.4, leak: 3, size: 1.6, armor: 1, slowResist: 1, color: 0xd11c66, spawn: { type: 'scuttler', count: 7 } },
  king: { name: 'King', hp: 1200, speed: 0.8, leak: 20, size: 4.2, armor: 0.7, slowResist: 0.4, color: 0x7d0d1c, bar: true },
  // Heals everything around it, so it's worth picking out of a crowd.
  medic: { name: 'Medic', hp: 14, speed: 1.7, leak: 2, size: 1, armor: 1, slowResist: 1, color: 0x19b8a6, heal: { every: 1.2, radius: 3.4, share: 0.08 } },
  // Sheds its shell at half health and bolts for the gate.
  molter: { name: 'Molter', hp: 12, speed: 1.8, leak: 1, size: 0.9, armor: 1, slowResist: 1, color: 0x8a3fd1, molt: { at: 0.5, speed: 2.3 } },
};

// costs[i] buys level i + 1. A pad's first cost builds it.
// maxHits caps splash and beams. Without it a packed block makes them far better than anything else.
export const TOWERS = {
  spitter: {
    name: 'Spitter', kind: 'shot', color: 0x18a999,
    blurb: 'Fast shots at one crab',
    costs: [40, 70, 130],
    levels: [
      { range: 8.5, rate: 2.6, dmg: 1.6 },
      { range: 9.5, rate: 3.2, dmg: 2.4 },
      { range: 10.5, rate: 4, dmg: 3.4 },
    ],
  },
  mortar: {
    name: 'Mortar', kind: 'splash', color: 0xf08a24,
    blurb: 'Slow shells that burst across a crowd',
    costs: [120, 160, 260],
    levels: [
      { range: 13, rate: 0.5, dmg: 5, radius: 2.2, maxHits: 10 },
      { range: 14, rate: 0.6, dmg: 7, radius: 2.6, maxHits: 14 },
      { range: 15, rate: 0.7, dmg: 10, radius: 3, maxHits: 20 },
    ],
  },
  foam: {
    name: 'Foamer', kind: 'aura', color: 0x7fd8f0,
    blurb: 'Slows every crab nearby',
    costs: [70, 90, 150],
    levels: [
      { range: 6, slow: 0.35, dps: 0 },
      { range: 7, slow: 0.45, dps: 0.3 },
      { range: 8, slow: 0.55, dps: 0.7 },
    ],
  },
  hose: {
    name: 'Fire hose', kind: 'beam', color: 0xd9262c,
    blurb: 'A jet that hits everything in line',
    costs: [190, 220, 340],
    levels: [
      { range: 11, width: 1, dps: 6, turn: 2.6, maxHits: 8 },
      { range: 12, width: 1.2, dps: 10, turn: 2.8, maxHits: 12 },
      { range: 13, width: 1.5, dps: 16, turn: 3, maxHits: 18 },
    ],
  },
  harpoon: {
    name: 'Harpoon', kind: 'pierce', color: 0x5d6b73,
    blurb: 'Punches through armor and several crabs',
    costs: [140, 170, 280],
    levels: [
      { range: 16, rate: 0.5, dmg: 24, pierce: 3 },
      { range: 17, rate: 0.6, dmg: 38, pierce: 4 },
      { range: 18, rate: 0.7, dmg: 60, pierce: 6 },
    ],
  },
  bench: {
    name: 'Bench', kind: 'bench', color: 0xf6c21c,
    blurb: 'Upgrades your own blaster',
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
