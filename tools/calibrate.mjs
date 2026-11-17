// Sets every level's difficulty by measurement. Run with `npm run calibrate`. Writes src/level-tuning.js.
//
// For each level it finds the strongest waves the expert bot survives with at least half the pump
// house standing, then scales the level down to leave exactly the room targetHeadroom() asks for.
// That's Hard. Easy and Medium come from what the casual and slow bots survive (EASIER in level-jobs.mjs).
// `npm run calibrate -- 12 13` redoes only those levels and keeps the rest.
// `npm run calibrate -- --keep-hard` leaves Hard alone and redoes only Easy and Medium.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BLUEPRINTS } from '../src/levels.js';
import { TUNING } from '../src/level-tuning.js';
import { runLevelJobs } from './pool.mjs';

const OUTPUT = fileURLToPath(new URL('../src/level-tuning.js', import.meta.url));

const args = process.argv.slice(2);
const keepHard = args.includes('--keep-hard');
const only = args.map(Number).filter(Boolean);
const levels = BLUEPRINTS.map((_, i) => i + 1).filter((n) => !only.length || only.includes(n));
const started = Date.now();

const results = await runLevelJobs('calibrateLevel', levels.map((n) => ({ n, startFrom: TUNING.hard[n] ?? 1, keepHard })));

const tuning = { easy: { ...TUNING.easy }, medium: { ...TUNING.medium }, hard: { ...TUNING.hard } };
const num = (v, width) => (v === null ? '-' : v.toFixed(2)).padStart(width);
console.log('level                  limit  target room   hard  expert pump house  casual limit  slow limit  medium   easy');
for (const r of results) {
  tuning.hard[r.n] = r.threat;
  tuning.medium[r.n] = r.medium;
  tuning.easy[r.n] = r.easy;
  console.log(
    `${String(r.n).padStart(2)} ${r.name.padEnd(18)}  ${num(r.limit, 5)}  ${num(r.room, 11)}  ${num(r.threat, 5)}  ${String(Math.round(r.hp * 100)).padStart(16)}%  ${num(r.casualLimit, 12)}  ${num(r.slowLimit, 10)}  ${num(r.medium, 6)}  ${num(r.easy, 5)}`,
  );
}

const header = readFileSync(OUTPUT, 'utf8').split('export const')[0];
const block = (set) => Object.keys(set).sort((a, b) => a - b).map((k) => `    ${k}: ${set[k]},`).join('\n');
const body = Object.keys(tuning).map((key) => `  ${key}: {\n${block(tuning[key])}\n  },`).join('\n');
writeFileSync(OUTPUT, `${header}export const TUNING = {\n${body}\n};\n`);
console.log(`\nWrote src/level-tuning.js in ${Math.round((Date.now() - started) / 1000)}s.`);
