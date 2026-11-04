// Compares towers and crabs on one level, so balance problems show up as numbers.
// Run with `npm run towers`. Bigger numbers mean surviving stronger waves.
//
// Fighters: every pad is one tower. A good set of towers has no column that wins every row.
// Support: two pads of a mixed team swapped for a support tower. Compare each number with "base".
// Crab danger: how much harder a wave budget spent on this crab is than scuttlers, with a mixed team.
// Above 1 means raise that crab's number in DANGER in src/levels.js, and below 1 means lower it.

import { availableParallelism } from 'node:os';
import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { buildLevel } from '../src/levels.js';
import { hpShare, playStyle } from './bots.mjs';

const LEVEL = 25;
const FIGHTERS = { spitter: 'S', mortar: 'M', hose: 'H', harpoon: 'P', eel: 'E' };
const SUPPORT = { foam: 'F', net: 'N', mast: 'A', pump: 'W' };
const CRABS = { runner: 'r', hermit: 'h', brood: 'b', medic: 'm', molter: 'o', flea: 'f', bull: 'x', jammer: 'j', king: 'k' };
const MIXED_TEAM = 'MHPEMHPB';
const WAVES = {
  swarm: 's s s s s s s',
  runners: 'r r s+r r r s+r r',
  armor: 'h h s+h h h+s h h',
  fleas: 'f f f+s f f f+s f',
  brood: 'b b s+b b b b b',
  bulls: 'x x s+x x x x x',
  medics: 's+m s+m h+m s+m s+m h+m s+m',
  mixed: 's+r h+s b+s o+r x+s m+h j+s',
  kings: 's+r h+s b+s k+s s+r h+s k+s',
};

function strongestSurvivable(towers, waves) {
  const survives = (threat) => {
    const def = buildLevel({ name: 'test', layout: 'straight', towers, waves }, LEVEL, threat);
    return ['buildAllFirst', 'cheapest'].some((order) => (
      hpShare(playStyle(def, { think: 0.1, walk: 1, minTank: 12, order }, 1)) >= 0.5
    ));
  };
  let lo = 0.05;
  let hi = 0.05;
  while (hi < 200 && survives(hi)) { lo = hi; hi *= 1.6; }
  for (let i = 0; i < 5; i++) {
    const mid = Math.sqrt(lo * hi);
    if (survives(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

function buildJobs() {
  const jobs = [];
  for (const [row, waves] of Object.entries(WAVES)) {
    for (const [col, letter] of Object.entries(FIGHTERS)) jobs.push({ table: 'fighters', row, col, towers: `${letter.repeat(7)}B`, waves });
  }
  for (const row of ['swarm', 'mixed', 'kings', 'bulls', 'runners']) {
    jobs.push({ table: 'support', row, col: 'base', towers: MIXED_TEAM, waves: WAVES[row] });
    for (const [col, letter] of Object.entries(SUPPORT)) {
      jobs.push({ table: 'support', row, col, towers: letter + letter + MIXED_TEAM.slice(2), waves: WAVES[row] });
    }
  }
  const crabWaves = (letter) => (letter === 'k' ? 's k s k s k' : Array(7).fill(`s+${letter}`).join(' '));
  jobs.push({ table: 'crabs', row: 'danger', col: 'scuttler', towers: MIXED_TEAM, waves: Array(7).fill('s').join(' ') });
  for (const [col, letter] of Object.entries(CRABS)) jobs.push({ table: 'crabs', row: 'danger', col, towers: MIXED_TEAM, waves: crabWaves(letter) });
  return jobs;
}

function printTable(title, results, table) {
  const rows = results.filter((r) => r.table === table);
  const cols = [...new Set(rows.map((r) => r.col))];
  console.log(`\n${title}`);
  console.log(`${''.padEnd(10)}${cols.map((c) => c.padStart(9)).join('')}`);
  for (const row of new Set(rows.map((r) => r.row))) {
    const cells = cols.map((col) => rows.find((r) => r.row === row && r.col === col).value.toFixed(1).padStart(9));
    console.log(`${row.padEnd(10)}${cells.join('')}`);
  }
}

async function main() {
  const jobs = buildJobs();
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, availableParallelism() - 1) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      results.push(await new Promise((resolve, reject) => {
        const worker = new Worker(fileURLToPath(import.meta.url), { workerData: job });
        worker.once('message', resolve);
        worker.once('error', reject);
      }));
    }
  }));

  printTable('Fighters', results, 'fighters');
  printTable('Support', results, 'support');
  const crabs = results.filter((r) => r.table === 'crabs');
  const base = crabs.find((r) => r.col === 'scuttler').value;
  for (const r of crabs) r.value = base / r.value;
  printTable('Crab danger', crabs, 'crabs');
}

if (isMainThread) {
  await main();
} else {
  parentPort.postMessage({ ...workerData, value: strongestSurvivable(workerData.towers, workerData.waves) });
}
