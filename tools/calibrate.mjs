// Sets every level's difficulty by measurement. Run with `npm run calibrate`. Writes src/level-tuning.js.
//
// For each level it finds the strongest waves the expert bot survives with at least half the pump
// house standing, then scales the level down to leave exactly the room targetHeadroom() asks for.
// `npm run calibrate -- 12 13` redoes only those levels and keeps the rest.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BLUEPRINTS } from '../src/levels.js';
import { TUNING } from '../src/level-tuning.js';
import { runLevelJobs } from './pool.mjs';

const OUTPUT = fileURLToPath(new URL('../src/level-tuning.js', import.meta.url));

const only = process.argv.slice(2).map(Number).filter(Boolean);
const levels = BLUEPRINTS.map((_, i) => i + 1).filter((n) => !only.length || only.includes(n));
const started = Date.now();

const results = await runLevelJobs('calibrateLevel', levels.map((n) => ({ n, startFrom: TUNING[n] ?? 1 })));

const tuning = { ...TUNING };
console.log('level                  limit   target room  threat  expert pump house');
for (const r of results) {
  tuning[r.n] = r.threat;
  console.log(
    `${String(r.n).padStart(2)} ${r.name.padEnd(18)}  ${r.limit.toFixed(2).padStart(5)}  ${r.room.toFixed(2).padStart(6)}       ${r.threat.toFixed(2).padStart(5)}   ${Math.round(r.hp * 100)}%`,
  );
}

const header = readFileSync(OUTPUT, 'utf8').split('export const')[0];
const body = Object.keys(tuning).sort((a, b) => a - b).map((k) => `  ${k}: ${tuning[k]},`).join('\n');
writeFileSync(OUTPUT, `${header}export const TUNING = {\n${body}\n};\n`);
console.log(`\nWrote src/level-tuning.js in ${Math.round((Date.now() - started) / 1000)}s.`);
