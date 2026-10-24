#!/usr/bin/env node
/**
 * Which owners does this branch touch?  npm run check:owners [-- base] [--strict] [--as B]
 *   base     defaults to origin/main
 *   --as X   you are owner X: anything outside X's paths (and "shared") is flagged
 *   --strict exit 1 when flagged (CI uses this only for contract files)
 * Run it before you commit: an AI agent that wandered outside your folder shows up here.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asIdx = args.indexOf('--as');
const me = asIdx >= 0 ? args[asIdx + 1] : process.env.SIZZLE_OWNER ?? null;
const base = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--as') ?? 'origin/main';

const owners = JSON.parse(readFileSync(new URL('./owners.json', import.meta.url), 'utf8'));
const table = Object.entries(owners)
  .filter(([k]) => !k.startsWith('_'))
  .flatMap(([who, prefixes]) => prefixes.map((p) => ({ who, p })))
  .sort((a, b) => b.p.length - a.p.length);
const ownerOf = (f) => table.find(({ p }) => f === p || f.startsWith(p))?.who ?? 'unowned';

let files;
try {
  const git = (...params) => execFileSync('git', params, { encoding: 'utf8' });
  const committed = git('diff', '--name-only', `${base}...HEAD`, '--');
  const working = git('diff', '--name-only', 'HEAD', '--');
  const staged = git('diff', '--name-only', '--cached', '--');
  const untracked = git('ls-files', '--others', '--exclude-standard');
  files = [...new Set([committed, working, staged, untracked].join('\n').split('\n').filter(Boolean))];
} catch {
  console.log(`(could not diff against ${base} — fetch it first, or pass another base)`);
  process.exit(1);
}

const byOwner = {};
for (const f of files) (byOwner[ownerOf(f)] ??= []).push(f);
for (const [who, list] of Object.entries(byOwner)) console.log(`${who.padEnd(8)} ${list.length} file(s)\n  ${list.join('\n  ')}`);

const contractTouched = files.some((f) => f.startsWith('src/contracts/') || f === 'src/core/api.ts' || f === 'package.json');
const foreign = me ? files.filter((f) => !['shared', me].includes(ownerOf(f))) : [];

if (contractTouched) console.log('\n⚠ touches a CONTRACT (src/contracts, src/core/api.ts or package.json): open a separate "contract:" PR, A merges it.');
if (foreign.length) console.log(`\n⚠ outside owner ${me}'s area:\n  ${foreign.join('\n  ')}\n  Revert these (git checkout ${base} -- <file>) or hand them to their owner.`);
if (strict && (foreign.length || contractTouched)) process.exit(1);
