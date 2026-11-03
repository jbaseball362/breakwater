// Plays every level headless with the bots and checks each layout. Run with `npm run balance`.
// Exits non-zero if a level fails its checks.

import { CRABS, HERO, WORLD } from '../src/content.js';
import { LEVELS, targetHeadroom } from '../src/levels.js';
import { buildLane, starsFor } from '../src/sim.js';
import { bestExpert, BOTS, hpShare, playLevel } from './bots.mjs';

const PEAK_LIMIT = 900;
const SEEDS = [1, 2];

function checkLayout(def) {
  const problems = [];
  const lanes = def.lanes.map(buildLane);
  const spots = [];
  if (def.belts.left) spots.push({ name: 'left hydrant', x: -WORLD.beltX, z: WORLD.hydrantZ, r: WORLD.ringR });
  if (def.belts.right) spots.push({ name: 'right hydrant', x: WORLD.beltX, z: WORLD.hydrantZ, r: WORLD.ringR });
  for (const p of def.pads) spots.push({ name: `${p.type} (${p.x}, ${p.z})`, x: p.x, z: p.z, r: 1.2, pad: true });

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
  return problems;
}

const rows = [];
let failures = 0;

for (const def of LEVELS) {
  const row = { level: `${String(def.id).padStart(2)} ${def.name}`, room: targetHeadroom(def.id).toFixed(2) };
  const problems = checkLayout(def);

  const summarize = (games) => {
    const wins = games.filter((g) => g.phase === 'won').length;
    const hp = games.reduce((sum, g) => sum + hpShare(g), 0) / games.length;
    const stars = Math.max(...games.map(starsFor));
    return { wins, text: `${wins}/${games.length} ${String(Math.round(hp * 100)).padStart(3)}% ${'*'.repeat(stars).padEnd(3)}` };
  };

  for (const bot of Object.keys(BOTS)) {
    const result = summarize(SEEDS.map((seed) => playLevel(def, bot, seed)));
    row[bot] = result.text;
    if (bot === 'idle' && result.wins > 0) problems.push('wins without doing anything');
  }

  const experts = SEEDS.map((seed) => bestExpert(def, seed));
  const expert = summarize(experts);
  row.expert = expert.text;
  row.peak = Math.max(...experts.map((g) => g.stats.peak));
  row.secs = Math.round(experts[0].time);
  row.style = `${experts[0].style.order}/${experts[0].style.minTank}`;
  if (expert.wins < experts.length) problems.push('the expert bot cannot reliably win');
  if (row.peak > PEAK_LIMIT) problems.push(`${row.peak} crabs at once may be too many for phones`);
  rows.push(row);
  if (problems.length) {
    failures++;
    row.problems = problems.join('; ');
  }
}

const header = ['level', 'room', 'idle', 'casual', 'expert', 'style', 'peak', 'secs'];
const widths = header.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h]).length)));
const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
console.log(line(header));
for (const r of rows) {
  console.log(line(header.map((h) => r[h])));
  if (r.problems) console.log(`   ! ${r.problems}`);
}
console.log(failures ? `\n${failures} level(s) need work.` : '\nAll levels pass.');
process.exit(failures ? 1 : 0);
