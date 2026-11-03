// Checks the things that would quietly break offline play. Run with `npm run check:offline`.
// A file missing from the service worker's list isn't available offline, and a listed file that
// doesn't exist stops the offline copy from installing at all.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(join(root, file), 'utf8');

function walk(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

const listBlock = read('sw.js').match(/const FILES = \[([\s\S]*?)\];/)[1];
const listed = [...listBlock.matchAll(/'([^']+)'/g)].map((m) => m[1]);

const shipped = ['index.html', 'styles.css', 'manifest.webmanifest', ...walk('src'), ...walk('vendor'), ...walk('icons')]
  .map((file) => relative('.', file))
  .filter((file) => !file.endsWith('.md'));

const problems = [];
for (const file of shipped) {
  if (!listed.includes(file)) problems.push(`${file} isn't in the FILES list in sw.js`);
}
for (const file of listed) {
  if (file !== './' && !existsSync(join(root, file))) problems.push(`sw.js lists ${file}, which doesn't exist`);
}
// Anything loaded from another host would still need a connection.
for (const file of ['index.html', 'styles.css', 'manifest.webmanifest', ...walk('src')]) {
  for (const [, url] of read(file).matchAll(/["'(](https?:\/\/[^"')\s]+)/g)) {
    problems.push(`${file} loads ${url} from another host`);
  }
}

for (const problem of problems) console.log(`! ${problem}`);
console.log(problems.length ? `\n${problems.length} problem(s).` : `Offline check passes: ${listed.length} files listed.`);
process.exit(problems.length ? 1 : 0);
