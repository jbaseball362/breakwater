// The per-level work behind `npm run calibrate` and `npm run balance`. Levels run on worker threads.

import { parentPort } from 'node:worker_threads';
import { CRABS, HERO, WORLD } from '../src/content.js';
import { BLUEPRINTS, buildLevel, casualFloor, LEVELS, targetHeadroom } from '../src/levels.js';
import { buildLane, starsFor } from '../src/sim.js';
import { bestExpert, BOTS, expertStyles, hpShare, playLevel, playStyle } from './bots.mjs';

const CALIBRATE_SEEDS = [1, 2];
const REPORT_SEEDS = [1, 2];
const REFINE_STEPS = 6;
const MIN_THREAT = 0.05;
const MAX_THREAT = 40;
const PEAK_LIMIT = 900;
const MAX_CHOICES = 6;

// Tries the style that last worked first, because most checks succeed or fail on the same one.
function makeSurvivalCheck(bp, n) {
  let lead = null;
  return (threat) => {
    const def = buildLevel(bp, n, threat);
    const styles = expertStyles(def);
    styles.sort((a, b) => (b.key === lead) - (a.key === lead));
    for (const style of styles) {
      if (CALIBRATE_SEEDS.every((seed) => hpShare(playStyle(def, style, seed)) >= 0.5)) {
        lead = style.key;
        return true;
      }
    }
    return false;
  };
}

function strongestSurvivable(survives, startFrom) {
  let lo;
  let hi;
  if (survives(startFrom)) {
    lo = startFrom;
    hi = lo * 1.5;
    while (hi < MAX_THREAT && survives(hi)) { lo = hi; hi *= 1.5; }
  } else {
    hi = startFrom;
    lo = hi / 1.5;
    while (lo > MIN_THREAT && !survives(lo)) { hi = lo; lo /= 1.5; }
  }
  for (let i = 0; i < REFINE_STEPS; i++) {
    const mid = Math.sqrt(lo * hi);
    if (survives(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function casualCopes(bp, n, threat) {
  const def = buildLevel(bp, n, threat);
  return CALIBRATE_SEEDS.every((seed) => hpShare(playLevel(def, 'casual', seed)) >= casualFloor(n));
}

function calibrateLevel({ n, startFrom }) {
  const bp = BLUEPRINTS[n - 1];
  const survives = makeSurvivalCheck(bp, n);
  const limit = strongestSurvivable(survives, startFrom);
  // Waves come in whole crabs, and the early levels also have to suit a casual player.
  let threat = limit / targetHeadroom(n);
  while (threat > MIN_THREAT && !(survives(threat) && casualCopes(bp, n, threat))) threat *= 0.96;
  threat = Math.round(threat * 1000) / 1000;
  const check = bestExpert(buildLevel(bp, n, threat), 1);
  return { n, name: bp.name, limit, room: targetHeadroom(n), threat, hp: hpShare(check) };
}

function checkLayout(def) {
  const problems = [];
  const lanes = def.lanes.map(buildLane);
  const spots = [];
  if (def.belts.left) spots.push({ name: 'left hydrant', x: -WORLD.beltX, z: WORLD.hydrantZ, r: WORLD.ringR });
  if (def.belts.right) spots.push({ name: 'right hydrant', x: WORLD.beltX, z: WORLD.hydrantZ, r: WORLD.ringR });
  for (const p of def.pads) spots.push({ name: `pad (${p.x}, ${p.z})`, x: p.x, z: p.z, r: 1.2, pad: true });

  for (const s of spots) {
    if (s.pad && (Math.abs(s.x) > 8.6 || s.z < 0.5 || s.z > 15.4)) problems.push(`${s.name} is off the yard`);
    for (const lane of lanes) {
      for (let i = 0; i < lane.n; i++) {
        const d = Math.hypot(lane.xs[i] - s.x, lane.zs[i] - s.z);
        const clear = lane.width / 2 + (s.pad ? WORLD.towerR : WORLD.hydrantR);
        if (d < clear) { problems.push(`${s.name} sits in a lane`); break; }
      }
    }
    for (const other of spots) {
      if (other === s) continue;
      if (Math.hypot(other.x - s.x, other.z - s.z) < s.r + other.r && s.name < other.name) {
        problems.push(`${s.name} overlaps ${other.name}`);
      }
    }
  }
  const [startX, startZ] = def.heroStart ?? HERO.start;
  for (const s of spots) {
    if (Math.hypot(startX - s.x, startZ - s.z) < (s.pad ? WORLD.padR : WORLD.ringR)) problems.push(`hero starts on ${s.name}`);
  }
  for (const lane of lanes) {
    for (let i = 0; i < lane.n; i++) {
      if (Math.hypot(lane.xs[i] - startX, lane.zs[i] - startZ) < lane.width / 2) { problems.push('hero starts in a lane'); break; }
    }
  }
  for (const wave of def.waves) {
    for (const g of wave.groups) {
      if (!CRABS[g.type]) problems.push(`wave uses unknown crab ${g.type}`);
      if (typeof g.lane === 'number' && g.lane >= lanes.length) problems.push(`wave uses missing lane ${g.lane}`);
    }
  }
  if (def.offer.length > MAX_CHOICES) problems.push(`offers ${def.offer.length} towers, which won't fit the pad menu`);
  if (def.pads.filter((p) => p.authored === 'bench').length > 1) problems.push('suggests more than one Bench');
  return problems;
}

function summarize(games) {
  const wins = games.filter((g) => g.phase === 'won').length;
  const hp = games.reduce((sum, g) => sum + hpShare(g), 0) / games.length;
  const stars = Math.max(...games.map(starsFor));
  return { wins, text: `${wins}/${games.length} ${String(Math.round(hp * 100)).padStart(3)}% ${'*'.repeat(stars).padEnd(3)}` };
}

function reportLevel({ n }) {
  const def = LEVELS[n - 1];
  const row = { level: `${String(n).padStart(2)} ${def.name}`, room: targetHeadroom(n).toFixed(2) };
  const problems = checkLayout(def);

  for (const bot of Object.keys(BOTS)) {
    const result = summarize(REPORT_SEEDS.map((seed) => playLevel(def, bot, seed)));
    row[bot] = result.text;
    if (bot === 'idle' && result.wins > 0) problems.push('wins without doing anything');
  }

  const experts = REPORT_SEEDS.map((seed) => bestExpert(def, seed));
  const expert = summarize(experts);
  row.expert = expert.text;
  row.peak = Math.max(...experts.map((g) => g.stats.peak));
  row.secs = Math.round(experts[0].time);
  row.towers = [...new Set(experts[0].pads.map((p) => p.type))].join('+');
  if (expert.wins < experts.length) problems.push('the expert bot cannot reliably win');
  if (row.peak > PEAK_LIMIT) problems.push(`${row.peak} crabs at once may be too many for phones`);
  row.problems = problems.join('; ');
  return row;
}

const JOBS = { calibrateLevel, reportLevel };

parentPort?.on('message', ({ id, job, args }) => {
  parentPort.postMessage({ id, result: JOBS[job](args) });
});
