// Runs one job per level on worker threads, leaving a core free for the rest of the machine.

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';

export function runLevelJobs(job, argsList, onDone) {
  const size = Math.max(1, Math.min(argsList.length, availableParallelism() - 1));
  const results = new Array(argsList.length);
  let next = 0;
  let finished = 0;

  return new Promise((resolve, reject) => {
    const workers = Array.from({ length: size }, () => new Worker(new URL('./level-jobs.mjs', import.meta.url)));
    const give = (worker) => {
      if (next >= argsList.length) return;
      const id = next++;
      worker.postMessage({ id, job, args: argsList[id] });
    };
    for (const worker of workers) {
      worker.on('error', reject);
      worker.on('message', ({ id, result }) => {
        results[id] = result;
        onDone?.(result);
        finished++;
        if (finished === argsList.length) {
          for (const w of workers) w.terminate();
          resolve(results);
        } else {
          give(worker);
        }
      });
      give(worker);
    }
  });
}
