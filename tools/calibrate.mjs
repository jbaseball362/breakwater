// Sets every level's difficulty by measurement. Run with `npm run calibrate`. Writes src/level-tuning.js.
//
// For each level it finds the strongest waves the expert bot survives with at least half the pump
// house standing, then scales the level down to leave exactly the room targetHeadroom() asks for.
// `npm run calibrate -- 12 13` redoes only those levels and keeps the rest.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BLUEPRINTS, buildLevel, casualFloor, targetHeadroom } from '../src/levels.js';
import { TUNING } from '../src/level-tuning.js';
import { bestExpert, EXPERT_STYLES, hpShare, playLevel, playStyle } from './bots.mjs';

const OUTPUT = fileURLToPath(new URL('../src/level-tuning.js', import.meta.url));
const SEEDS = [1, 2];
const REFINE_STEPS = 7;
const MIN_THREAT = 0.05;
const MAX_THREAT = 40;

function survives(bp, n, threat) {
  const def = buildLevel(bp, n, threat);
  return EXPERT_STYLES.some((style) => SEEDS.every((seed) => hpShare(playStyle(def, style, seed)) >= 0.5));
}

function casualCopes(bp, n, threat) {
  const def = buildLevel(bp, n, threat);
  return SEEDS.every((seed) => hpShare(playLevel(def, 'casual', seed)) >= casualFloor(n));
}

function strongestSurvivable(bp, n, startFrom) {
  let lo;
  let hi;
  if (survives(bp, n, startFrom)) {
    lo = startFrom;
    hi = lo * 1.5;
    while (hi < MAX_THREAT && survives(bp, n, hi)) { lo = hi; hi *= 1.5; }
  } else {
    hi = startFrom;
    lo = hi / 1.5;
    while (lo > MIN_THREAT && !survives(bp, n, lo)) { hi = lo; lo /= 1.5; }
  }
  for (let i = 0; i < REFINE_STEPS; i++) {
    const mid = Math.sqrt(lo * hi);
    if (survives(bp, n, mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

const only = process.argv.slice(2).map(Number).filter(Boolean);
const tuning = { ...TUNING };
const started = Date.now();

console.log('level                  limit   target room  threat  expert pump house');
BLUEPRINTS.forEach((bp, i) => {
  const n = i + 1;
  if (only.length && !only.includes(n)) return;
  const limit = strongestSurvivable(bp, n, TUNING[n] ?? 1);
  // Waves come in whole crabs, and the early levels also have to suit a casual player.
  let threat = limit / targetHeadroom(n);
  while (threat > MIN_THREAT && !(survives(bp, n, threat) && casualCopes(bp, n, threat))) threat *= 0.96;
  tuning[n] = Math.round(threat * 1000) / 1000;
  const check = bestExpert(buildLevel(bp, n, tuning[n]), 1);
  console.log(
    `${String(n).padStart(2)} ${bp.name.padEnd(18)}  ${limit.toFixed(2).padStart(5)}  ${targetHeadroom(n).toFixed(2).padStart(6)}       ${tuning[n].toFixed(2).padStart(5)}   ${Math.round(hpShare(check) * 100)}%`,
  );
});

const header = readFileSync(OUTPUT, 'utf8').split('export const')[0];
const body = Object.entries(tuning).map(([k, v]) => `  ${k}: ${v},`).join('\n');
writeFileSync(OUTPUT, `${header}export const TUNING = {\n${body}\n};\n`);
console.log(`\nWrote src/level-tuning.js in ${Math.round((Date.now() - started) / 1000)}s.`);
