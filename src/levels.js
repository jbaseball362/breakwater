// The levels and the difficulty system.
//
// Each level is one line in BLUEPRINTS: its name, road, towers, and wave rhythm. buildLevel turns
// that into numbers, in three steps, so that a level's difficulty comes from a formula.
// A level's tower string sets how many pads it has and what the player may choose from. Players
// pick for themselves, and the bots also try other combinations when measuring difficulty.
//
//   1. Economy: income is set so you can afford a fixed share of the level's towers and upgrades.
//      There's never enough for everything, so what you buy first matters.
//   2. Waves: each wave is sized to what you could have bought by the time it arrives.
//      So early waves are fair, and the last ones don't get easy once you've built up.
//   3. Calibration: tools/calibrate.mjs plays each level with the expert bot to find how much it
//      can survive, then scales the waves so the level lands on targetHeadroom() below.
//
// To add a level, add a line to BLUEPRINTS and run `npm run calibrate`, then `npm run balance`.

import { CRABS, TOWERS, WORLD } from './content.js';
import { TUNING } from './level-tuning.js';

const { spawnZ: N, gateZ: S } = WORLD;

// How much stronger the waves could get before the expert bot loses. 2 means it could handle twice
// as much, 1.1 means it has almost nothing to spare. This is the difficulty curve.
export function targetHeadroom(n) {
  return 1.03 + 0.67 * Math.exp(-(n - 1) / 10);
}

// A casual player has to be able to get through the opening levels, however the expert does.
// The share of the pump house the casual bot must keep. Past level 20 it's allowed to lose.
export function casualFloor(n) {
  if (n <= 10) return 0.5;
  if (n <= 20) return 0.01;
  return 0;
}

const SCARCITY_START = 0.62;
const SCARCITY_END = 0.52;
const COLLECT_EFFICIENCY = 0.85;
const LAST_LEVEL = 50;
const MAX_GROUP = 320;
const FINAL_WAVE_BOOST = 1.3;

const crabToughness = (n) => 1 + (n - 1) * 0.012;
const scarcity = (n) => SCARCITY_START + (SCARCITY_END - SCARCITY_START) * (n - 1) / (LAST_LEVEL - 1);
const baseGap = (n) => 23 - 8 * (n - 1) / (LAST_LEVEL - 1);
const PREP_SECONDS = 14;
const CLEAR_SECONDS = 30;

// What a wave should add up to, given the parts a player could have earned by then.
const waveBudget = (parts) => 8 + 0.3 * parts;

// How much more dangerous a wave budget is when spent on this crab than on scuttlers, measured
// against a mixed team by `npm run towers`. Without this, whichever crab is underpriced decides how
// hard every level containing it is.
const DANGER = { scuttler: 1, runner: 1.51, hermit: 0.65, brood: 1.1, medic: 1.71, molter: 0.88, flea: 1.99, bull: 1.08, jammer: 1.24, king: 1.66 };

function basePoints(type) {
  const def = CRABS[type];
  const points = (def.hp / def.armor) * (def.speed / 2.2) ** 0.8;
  return def.spawn ? points + def.spawn.count * basePoints(def.spawn.type) : points;
}

const pointsOf = (type) => basePoints(type) * DANGER[type];

const mirror = (points) => points.map(([x, z]) => [-x, z]);

// Each road has its pads listed best spot first, so a level with few towers gets the good ones.
const LAYOUTS = {
  straight: {
    lanes: [{ width: 7, points: [[0, N], [0, S]] }],
    slots: [[-5.3, 5.8], [5.3, 5.8], [-5.3, 9.6], [5.3, 9.6], [-7.9, 7.6], [7.9, 7.6], [-5.3, 13.4], [5.3, 13.4], [-7.9, 11.5], [7.9, 11.5]],
  },
  narrow: {
    lanes: [{ width: 4.6, points: [[0, N], [0, S]] }],
    slots: [[-4.2, 5.8], [4.2, 5.8], [-4.2, 9.6], [4.2, 9.6], [-7, 7.6], [7, 7.6], [-4.2, 13.4], [4.2, 13.4], [-7, 11.5], [7, 11.5]],
  },
  bend: {
    lanes: [{ width: 4.4, points: [[0, N], [0, -3], [-3.6, 3.5], [-3.6, 6], [3.6, 10], [3.6, 12.2], [0, S]] }],
    slots: [[3.2, 4.6], [-3.2, 11.8], [7.9, 6.2], [-7.9, 8.4], [7.6, 13.4], [-7.6, 13.4], [7.9, 9.6], [-7.9, 10.9], [3.4, 1.4], [-3.2, 15]],
  },
  bendBack: {
    hero: [7.6, 4.6],
    lanes: [{ width: 4.4, points: mirror([[0, N], [0, -3], [-3.6, 3.5], [-3.6, 6], [3.6, 10], [3.6, 12.2], [0, S]]) }],
    slots: mirror([[3.2, 4.6], [-3.2, 11.8], [7.9, 6.2], [-7.9, 8.4], [7.6, 13.4], [-7.6, 13.4], [7.9, 9.6], [-7.9, 10.9], [3.4, 1.4], [-3.2, 15]]),
  },
  twin: {
    lanes: [
      { width: 3.2, points: [[-1.95, N], [-1.95, -1], [-3.7, 5], [-3.7, S]] },
      { width: 3.2, points: [[1.95, N], [1.95, -1], [3.7, 5], [3.7, S]] },
    ],
    slots: [[0, 6.4], [0, 10], [0, 13.6], [-7, 6.6], [7, 6.6], [-7, 10.4], [7, 10.4], [-7, 13.8], [7, 13.8]],
  },
  merge: {
    lanes: [
      { width: 3.2, points: [[-1.95, N], [-1.95, -1], [0, 7], [0, S]] },
      { width: 3.2, points: [[1.95, N], [1.95, -1], [0, 7], [0, S]] },
    ],
    slots: [[-3.6, 9], [3.6, 9], [-3.6, 12.8], [3.6, 12.8], [-6.6, 6.4], [6.6, 6.4], [-6.6, 10.4], [6.6, 10.4], [-6.6, 14.2], [6.6, 14.2]],
  },
  fork: {
    lanes: [
      { width: 3.2, points: [[0, N], [0, 0], [-4.2, 6.5], [-4.2, S]] },
      { width: 3.2, points: [[0, N], [0, 0], [4.2, 6.5], [4.2, S]] },
    ],
    slots: [[0, 7.5], [0, 11], [0, 14.5], [-7.7, 7.4], [7.7, 7.4], [-7.7, 11], [7.7, 11], [-7.7, 14.4], [7.7, 14.4]],
  },
  hookLeft: {
    hero: [3.5, 3.4],
    lanes: [{ width: 4, points: [[0, N], [0, 1.5], [-5.6, 8.5], [-5.6, S]] }],
    slots: [[1.2, 9], [4.4, 6], [1.2, 13], [4.4, 10], [7.6, 7.2], [7.6, 11], [4.4, 14], [-1.6, 11], [-7.7, 5.6], [-1.6, 14.8]],
  },
  hookRight: {
    hero: [-3.5, 3.4],
    lanes: [{ width: 4, points: mirror([[0, N], [0, 1.5], [-5.6, 8.5], [-5.6, S]]) }],
    slots: mirror([[1.2, 9], [4.4, 6], [1.2, 13], [4.4, 10], [7.6, 7.2], [7.6, 11], [4.4, 14], [-1.6, 11], [-7.7, 5.6], [-1.6, 14.8]]),
  },
  slalom: {
    lanes: [{ width: 3.6, points: [[0, N], [0, -3], [-4.2, 2.2], [-4.2, 3.6], [4.2, 7.4], [4.2, 8.8], [-4.2, 12.6], [-4.2, 13.6], [0, S]] }],
    slots: [[-1.5, 8.2], [3.4, 2.6], [3.2, 12.8], [7.6, 5], [-7.7, 7.4], [7.7, 8.2], [-7.7, 11], [7.6, 12], [6.4, 15.1]],
  },
};

const TOWER_LETTERS = { S: 'spitter', M: 'mortar', F: 'foam', H: 'hose', P: 'harpoon', E: 'eel', N: 'net', A: 'mast', W: 'pump', B: 'bench' };
const CRAB_LETTERS = { s: 'scuttler', r: 'runner', h: 'hermit', b: 'brood', k: 'king', m: 'medic', o: 'molter', f: 'flea', x: 'bull', j: 'jammer' };
const GROUP_SPREAD = { hermit: 2, brood: 2.2, medic: 1.6, king: 6, flea: 1.5, bull: 1.8, jammer: 1.6 };
const MIN_COUNT = { scuttler: 3, runner: 3, molter: 3, flea: 6 };

// name, road, towers, waves, options.
// Towers: one letter per pad, S spitter, M mortar, F foamer, H fire hose, P harpoon, E eel coil,
// N net launcher, A signal mast, W bilge pump, B blaster bench. The letters used become the level's
// choices, so keep to six or fewer. Their order is a good default that the bots start from.
// Waves are space separated. s scuttler, r runner, h hermit, b brood, k king, m medic, o molter,
// f flea, x bull, j jammer. + joins groups in one wave. < and > pick a lane on two-lane roads.
// kk is two kings. Options: intro, belts (both, trickle, jackpot, left, right), tanks (small),
// tempo (shorter gaps below 1), plates (special plates on the belts), glass (pump house strength).
const lv = (name, layout, towers, waves, options = {}) => ({ name, layout, towers, waves, ...options });

const BLUEPRINTS = [
  // Morning shift: one lane, learning the towers.
  lv('First shift', 'straight', 'SSS', 's s s'),
  lv('Two belts', 'straight', 'SSMSB', 's s s s', { intro: 'You choose what each pad builds now. Stand on an empty pad and tap a tower. Mortars burst across a crowd, and the Bench upgrades your blaster.' }),
  lv('Fast feet', 'straight', 'FSSMFS', 'r s r s+r r', { intro: 'Runners are twice as fast. A Foamer slows anything that walks past it.' }),
  lv('Shell game', 'straight', 'PSMPFS', 's h s+h h s+h', { intro: 'Hermit shells shrug off most damage. Harpoons punch straight through.' }),
  lv('Tight squeeze', 'narrow', 'MSSFMP', 's s+r h s r+s s+h', { intro: 'A narrow lane. Quicker to cross, and the crabs pack in tighter.' }),
  lv('Small tanks', 'straight', 'SMSFSM', 'r s s+r h s+h s', { tanks: 'small', intro: 'These hydrants fill fast. Empty them often or the belts stop.' }),
  lv('Jackpot', 'straight', 'MSPMFS', 's s+r h s+h r s+h', { belts: 'jackpot', intro: 'Almost everything is on the right belt. Build on the far side when you can afford the walk.' }),
  lv('Sand fleas', 'straight', 'EEMFSEPB', 'f s f+s h f+r s+h f+s', { belts: 'trickle', intro: 'Sand fleas are tiny and spread out, so shells waste themselves on them. The Eel coil\'s lightning jumps from crab to crab.' }),
  lv('Morning rush', 'straight', 'MMFSEPSB', 'r s f+r s r+h s f+r', { tempo: 0.75, plates: 'chill boom chill', intro: 'Colored plates are power-ups. They fire when you open the valve they landed in, so pick your moment.' }),
  lv('Shift change', 'narrow', 'MSPFMESB', 's+r h f+r h+s r s+h f+s h+s'),

  // Evening shift: bent roads, new tools, and the brood.
  lv('The long way', 'bend', 'SMHFEH', 's r f h+s r+s s+h', { intro: 'The lane bends through the yard. A Fire hose hits everything along its jet, up to a limit.' }),
  lv('Brood season', 'straight', 'MSMPEHB', 'b s+b b r+b s+b b+h', { intro: 'Kill a Brood and seven scuttlers burst out. Plan where they die.' }),
  lv('Back road', 'bendBack', 'MEHFPEB', 's+r h f+h b r+s s+b h+f', { intro: 'The bend runs the other way, and you start on the right.' }),
  lv('Left hook', 'hookLeft', 'SMHWFPM', 's r f+r h+s b s+r h+s', { intro: 'The lane hugs the left side. A Bilge pump earns parts over time, so build it early or not at all.' }),
  lv('Right hook', 'hookRight', 'MEHWFPME', 'r+s h f+r b+s h+s r+f s+b', { plates: 'surge chill' }),
  lv('Nursery', 'narrow', 'MMEHFPMB', 'b b+s b+r b b+h s+b b', { plates: 'boom', intro: 'Brood crabs in a narrow lane. The middle of the yard is going to get crowded.' }),
  lv('Dry left', 'straight', 'MNFHNMPB', 's x+s h+r s+x r+s x+h s+x', { belts: 'right', intro: 'The left belt is out, and Bulls barge through foam. A Net launcher pins them in place.' }),
  lv('Slalom', 'slalom', 'MNHEEPMB', 's r+s x+s b s+r h+x s+b r+h', { intro: 'Three bends. The crabs walk further, and you have to cross more often.' }),
  lv('Second wind', 'straight', 'MSPHFSMB', 'o s+o r+o h+o f+o s+o o+b', { intro: 'Molters shed their shells at half health and bolt for the gate. Finish them quickly.' }),
  lv('Golden hour', 'bend', 'MHPMNEHB', 's+r h+s b+s o+r x+b s+o b+h x+r', { plates: 'chill surge boom' }),

  // Storm shift: two lanes, medics, jammers, and the first king.
  lv('Split decision', 'twin', 'SMAMHFFP', '<s >s <s+>r <r+>s <h+>s <s+>h s+b', { intro: 'Two lanes now, and the middle strip reaches both. A Signal mast makes nearby towers fire faster.' }),
  lv('Forked road', 'fork', 'MAHEEPMB', 's r s+h b f+s h+s s+o b+x', { intro: 'The crabs split at the top of the yard, one half down each side.' }),
  lv('Field medics', 'straight', 'MPSHFSMB', 's+m h+m f+m r+m b+m x+m h+m', { intro: 'Teal crabs heal everything around them. Harpoons can reach them through a crowd.' }),
  lv('Low pressure', 'straight', 'MWFHEMPW', 's+r h+s b o+s f+h s+m s+b h+o', { belts: 'left', plates: 'patch chill', intro: 'Only the left belt works today, in small plates. A pump or two could help.' }),
  lv('Bottleneck', 'merge', 'MMAHFPAB', 's r+s x+s b s+o r+h s+b h+m', { intro: 'Two lanes join into one tight road. Hit them while they are stuck in the crush.' }),
  lv('Thin walls', 'straight', 'MPNHFNMB', 's r+s x+s b+s o+r h+m s+b', { glass: 0.45, intro: 'The pump house is cracked and can take very few hits.' }),
  lv('Rush hour', 'narrow', 'MMFHEEPB', 's r f+r h s+o r+s b f+r h+s', { tempo: 0.65, plates: 'boom chill surge boom', intro: 'Short gaps and big crowds. Save your plates for when the lane is full.' }),
  lv('Crosswind', 'twin', 'MHAFFPMB', '<s+>r >s+<j <h+>s >h+<j <b+>o >b+<j <s+>m >s+<j', { plates: 'chill patch', intro: 'Yellow Jammers slow every tower near them. Kill them from long range.' }),
  lv('Whitecaps', 'bendBack', 'MHPMFEHB', 'o+s m+s h+o j+m s+o r+h m+b x+h', { plates: 'surge boom patch' }),
  lv('King tide', 'straight', 'PMPHNHMB', 's+r h+s b+s o+j k+s x+h m+s', { plates: 'surge boom patch', intro: 'A King crab is coming. If it reaches the gate it does huge damage. Harpoons and Nets help.' }),

  // Night shift: a limited toolbox, then kings.
  lv('Night watch', 'straight', 'SSSSSSSSB', 's r s+r f+s s+o r+j s+m', { intro: 'Spitters only tonight. Upgrade your blaster early.' }),
  lv('Mortar line', 'straight', 'MMMMFFB', 'r r+s s+o r+s h+r o+j s+r', { intro: 'Mortars only. Fast crabs will run out from under the shells, so slow them down.' }),
  lv('Hose down', 'straight', 'HHHFHFB', 's+r h+s s+o b+s j+h s+m o+h', { intro: 'Fire hoses only. They lose reach in a thick crowd, so aim for coverage.' }),
  lv('Harpoon alley', 'narrow', 'PPPSPFB', 'h h+s h+r b+h h+m j+h h+s', { intro: 'Harpoons and a wall of shells. Small crabs will slip past if you ignore them.' }),
  lv('Blackout', 'hookLeft', 'MEHWFPMW', 's+r h+s b+s o+r m+j h+o s+b x+m', { belts: 'right', tanks: 'small', intro: 'One belt, small tanks, and a long walk back from the far pads.' }),
  lv('Two fronts', 'twin', 'PMPHNHMB', '<s+>r >s+<h <b+>o >j+<m <k+>s >s+<x <s+>o', { plates: 'surge chill patch', intro: 'A King down one lane while the other keeps coming.' }),
  lv('Graveyard shift', 'straight', 'MPHFAMHPB', 's r+s h+s b+j o+r m+s h+o b+m x+r h+b o+j s+h', { plates: 'chill boom surge patch', intro: 'Twelve waves. Pace yourself and keep the belts moving.' }),
  lv('Sleepers', 'fork', 'MEHFEFPB', 'r+m f+s r+m o+f r+j h+r f+m o+j', { tempo: 0.8, plates: 'chill chill boom', intro: 'Runners and fleas with medics behind them, down both sides.' }),
  lv('Undertow', 'slalom', 'MHPMNEHB', 'o+h s+o h+m o+x j+o h+o m+o b+x', { plates: 'surge boom patch', intro: 'Three bends full of shells, Bulls and Molters.' }),
  lv('Midnight king', 'bend', 'PPMHNHMB', 's+r b+s h+j o+x k+s m+h s+b k+o', { plates: 'surge boom chill patch', intro: 'Two Kings tonight, one after the other. Keep some strength back for the second.' }),

  // The red tide: everything at once.
  lv('Red dawn', 'merge', 'MMHPNHAPB', 's+r h+j b+o m+s x+h k+s o+m b+j s+r', { plates: 'surge boom chill patch' }),
  lv('Spring tide', 'twin', 'MPHAFHMPB', '<s+>r >h+<j <b+>o >m+<s <k+>r >k+<s x+m h+o', { tempo: 0.85, plates: 'chill boom surge patch' }),
  lv('Landslide', 'hookRight', 'MHPMNEHPB', 'r+s h+m j+s o+x k+s h+j s+b r+o m+x', { plates: 'surge chill boom patch' }),
  lv('Breach', 'twin', 'MPHFAHMPB', '<s+>r >s+<h <b+>x >j+<s <s+>h >o+<m s+r h+b', { glass: 0.5, plates: 'patch chill patch boom', intro: 'The pump house is cracked again, with two lanes to watch.' }),
  lv('Heavy swell', 'slalom', 'MHPMNHPB', 's+o h+j b+r k+s o+m x+b s+r m+o k+h', { plates: 'surge boom patch chill' }),
  lv('Two kings', 'straight', 'PPMHNHMPB', 's+r h+j b+o kk+s x+r m+h o+b kk+j', { plates: 'surge boom chill patch surge', intro: 'Two Kings side by side, twice.' }),
  lv('Flash flood', 'narrow', 'MMFHPEHPB', 's+r o+s f+r b+s m+r j+o x+m r+b f+o', { tempo: 0.6, plates: 'boom chill boom surge boom', intro: 'Almost no gap between waves. The lane never empties.' }),
  lv('Hold fast', 'straight', 'MPHNWMHPB', 's+o h+j b+s x+o k+m s+h o+b j+r x+h', { belts: 'right', glass: 0.5, plates: 'patch chill patch surge', intro: 'One belt and a cracked pump house. Everything has to go right.' }),
  lv('High water', 'fork', 'MHPAMPHNB', 's+r h+o j+m k+s r+o x+h s+b kk+j h+m f+r', { plates: 'surge chill boom patch surge' }),
  lv('The red tide', 'bend', 'MMHPNHPAB', 's+r h+j b+m x+s k+r m+h f+b kk+o j+m x+r kk+s', { plates: 'surge boom chill patch surge boom', intro: 'The whole beach is walking. Hold the gate and the causeway is yours.' }),
];

// The first level each tower appears on, so the pad menu can mark it as new.
const firstOffered = {};
BLUEPRINTS.forEach((bp, i) => {
  for (const letter of bp.towers) firstOffered[TOWER_LETTERS[letter]] ??= i + 1;
});

export const ZONES = [
  { key: 'morning', name: 'Morning shift' },
  { key: 'evening', name: 'Evening shift' },
  { key: 'storm', name: 'Storm shift' },
  { key: 'night', name: 'Night shift' },
  { key: 'redtide', name: 'The red tide' },
];

function plateValues(mean, pattern) {
  return pattern.map((k) => Math.max(1, Math.min(99, Math.round(mean * k))));
}

function makeBelts(bp, rate) {
  const style = bp.belts ?? 'both';
  const leftShare = { both: 0.35, trickle: 0.72, jackpot: 0.14, left: 1, right: 0 }[style];
  const capSeconds = bp.tanks === 'small' ? 9 : 24;

  const leftRate = rate * leftShare;
  const rightRate = rate - leftRate;
  let left = null;
  let right = null;

  if (leftRate > 0) {
    const mean = Math.max(1, Math.min(14, leftRate * 0.9));
    const values = plateValues(mean, [1, 1, 1.4, 0.8, 1, 1.8]);
    left = { every: Math.max(0.45, mean / leftRate), values, cap: Math.max(...values, Math.round(leftRate * capSeconds)) };
  }
  if (rightRate > 0) {
    const mean = Math.max(10, Math.min(62, rightRate * 6));
    const values = plateValues(mean, [0.8, 1, 0.7, 1.6]);
    right = { every: mean / rightRate, values, cap: Math.max(...values, Math.round(rightRate * capSeconds)) };
  }
  return { left, right };
}

// Spreads a level's special plates evenly through the level, on whichever belt has the big plates.
function placePlates(bp, belts, seconds) {
  if (!bp.plates) return;
  const belt = belts.right ?? belts.left;
  const kinds = bp.plates.split(' ');
  const total = seconds / belt.every;
  belt.specials = {};
  kinds.forEach((kind, i) => {
    belt.specials[Math.round((i + 1) / (kinds.length + 1) * total)] = kind;
  });
}

function parseWave(token) {
  return token.split('+').map((part) => {
    const lane = part[0] === '<' ? 0 : part[0] === '>' ? 1 : undefined;
    const letters = lane === undefined ? part : part.slice(1);
    return { type: CRAB_LETTERS[letters[0]], lane, copies: letters.length };
  });
}

function makeWaveGroups(parsed, budget, toughness) {
  const hasKing = parsed.some((g) => g.type === 'king');
  const shares = hasKing
    ? parsed.map((g) => (g.type === 'king' ? 0.6 : 0.4 / Math.max(1, parsed.length - 1)))
    : { 1: [1], 2: [0.6, 0.4], 3: [0.5, 0.3, 0.2] }[parsed.length];

  return parsed.map((g, i) => {
    const points = pointsOf(g.type) * toughness;
    const group = { type: g.type, spread: GROUP_SPREAD[g.type], delay: i * 6 };
    if (g.lane !== undefined) group.lane = g.lane;
    const share = budget * shares[i];
    if (g.type === 'king') {
      // A King is always one crab, so its share of the wave goes into its health.
      group.count = g.copies;
      group.hpMul = Math.max(0.1, share / g.copies / points);
    } else {
      const wanted = share / points;
      group.count = Math.max(MIN_COUNT[g.type] ?? 1, Math.min(MAX_GROUP, Math.round(wanted)));
      if (wanted > MAX_GROUP) group.hpMul = wanted / MAX_GROUP;
    }
    return group;
  });
}

export function buildLevel(bp, n, threat = 1) {
  const layout = LAYOUTS[bp.layout];
  const pads = [...bp.towers].map((letter, i) => {
    const [x, z] = layout.slots[i];
    return { authored: TOWER_LETTERS[letter], x, z };
  });
  const offer = [...new Set(pads.map((p) => p.authored))];

  const tokens = bp.waves.split(' ');
  const gap = baseGap(n) * (bp.tempo ?? 1);
  const arrivals = tokens.map((_, i) => PREP_SECONDS + i * gap);
  const seconds = arrivals[arrivals.length - 1] + CLEAR_SECONDS;

  const allCosts = pads.reduce((sum, p) => sum + TOWERS[p.authored].costs.reduce((a, b) => a + b, 0), 0);
  const start = Math.round(Math.max(TOWERS[pads[0].authored].costs[0] * 0.6, allCosts * 0.06) / 5) * 5;
  const rate = Math.max(2, (allCosts * scarcity(n) - start) / (seconds * COLLECT_EFFICIENCY));

  const belts = makeBelts(bp, rate);
  placePlates(bp, belts, seconds);

  const toughness = crabToughness(n);
  const waves = tokens.map((token, i) => {
    const parts = start + rate * COLLECT_EFFICIENCY * (arrivals[i] + 8);
    // You spend the first waves walking and building, so what you could afford overstates your defense.
    const settling = Math.min(1, 0.6 + 0.2 * i);
    const finale = i === tokens.length - 1 ? FINAL_WAVE_BOOST : 1;
    const groups = makeWaveGroups(parseWave(token), waveBudget(parts) * settling * finale * threat, toughness);
    return { gap: i === 0 ? PREP_SECONDS : gap, groups };
  });

  // Big enough that falling a little short on the biggest wave hurts instead of ending the level.
  const worstLeak = Math.max(...waves.map((w) => w.groups.reduce((sum, g) => sum + (g.type === 'king' ? 0 : g.count * CRABS[g.type].leak), 0)));
  const hp = Math.max(6, Math.round(Math.min(120, 20 + worstLeak * 0.1) * (bp.glass ?? 1)));
  for (const wave of waves) {
    for (const group of wave.groups) if (group.type === 'king') group.leak = Math.ceil(hp * 0.35);
  }

  return {
    id: n,
    name: bp.name,
    zone: ZONES[Math.min(ZONES.length - 1, Math.floor((n - 1) / 10))].key,
    intro: bp.intro,
    heroStart: layout.hero,
    hp,
    start,
    crabHp: toughness,
    threat,
    lanes: layout.lanes,
    belts,
    pads,
    offer,
    newTowers: offer.filter((type) => firstOffered[type] === n),
    waves,
  };
}

export { BLUEPRINTS };

export const LEVELS = BLUEPRINTS.map((bp, i) => buildLevel(bp, i + 1, TUNING[i + 1] ?? 1));

const ONE_LANE = LAYOUTS.straight.lanes;

// Runs behind the title screen: towers already built, and a gate that never floods.
export const ATTRACT = {
  id: 0, name: 'Attract', zone: 'morning', hp: 1e9, start: 0,
  lanes: ONE_LANE,
  belts: {
    left: { every: 0.9, cap: 30, values: [1, 2, 1, 5] },
    right: { every: 3, cap: 99, values: [25, 40, 99] },
  },
  pads: [
    { type: 'mortar', x: -5.3, z: 5.8, built: 2 }, { type: 'spitter', x: 5.3, z: 5.8, built: 2 },
    { type: 'spitter', x: -5.3, z: 9.6, built: 1 }, { type: 'hose', x: 5.3, z: 13.4, built: 1 },
  ],
  waves: Array.from({ length: 40 }, (_, i) => ({ gap: i ? 16 : 1, groups: [{ type: 'scuttler', count: 70 }] })),
};
