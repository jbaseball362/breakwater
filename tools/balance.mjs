// Plays every level headless with the bots and checks each layout. Run with `npm run balance`.
// Exits non-zero if a level fails its checks.

import { LEVELS } from '../src/levels.js';
import { runLevelJobs } from './pool.mjs';

const rows = await runLevelJobs('reportLevel', LEVELS.map((def) => ({ n: def.id })));
const failures = rows.filter((r) => r.problems).length;

const header = ['level', 'room', 'idle', 'casual', 'expert', 'peak', 'secs', 'towers'];
const widths = header.map((h) => Math.max(h.length, ...rows.map((r) => String(r[h]).length)));
const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ');
console.log(line(header));
for (const r of rows) {
  console.log(line(header.map((h) => r[h])));
  if (r.problems) console.log(`   ! ${r.problems}`);
}
console.log(failures ? `\n${failures} level(s) need work.` : '\nAll levels pass.');
process.exit(failures ? 1 : 0);
