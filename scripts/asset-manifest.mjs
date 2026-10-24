#!/usr/bin/env node
/**
 * Writes public/models/manifest.json and public/sfx/manifest.json from the files present.
 * Core only loads models listed there, audio only plays listed sounds — no 404 noise.
 * Also enforces naming and size budgets.   npm run assets:manifest   |   npm run check:assets (CI)
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const check = process.argv.includes('--check');
const MAX_FILE_MB = 3;
const MAX_TOTAL_MB = 80;
const groups = [
  { dir: 'public/models', ext: '.glb', re: /^([a-z0-9]+)_(room|prop|food|tool|eq|ui)_[a-z0-9_]+$/ },
  { dir: 'public/sfx', ext: '.ogg', re: /^(sfx|mus)_[a-z0-9_]+$/ },
];

let failed = false;
let total = 0;
for (const g of groups) {
  const dir = join(ROOT, g.dir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const names = [];
  for (const f of readdirSync(dir).sort()) {
    if (!f.endsWith(g.ext)) continue;
    const name = f.slice(0, -g.ext.length);
    const mb = statSync(join(dir, f)).size / 1e6;
    total += mb;
    if (!g.re.test(name)) {
      console.error(`✗ ${g.dir}/${f}: name must match ${g.re}`);
      failed = true;
    }
    if (mb > MAX_FILE_MB) {
      console.error(`✗ ${g.dir}/${f}: ${mb.toFixed(1)} MB > ${MAX_FILE_MB} MB (compress: gltf-transform optimize / ffmpeg -q:a 3)`);
      failed = true;
    }
    names.push(name);
  }
  const path = join(dir, 'manifest.json');
  const next = JSON.stringify({ files: names }, null, 2) + '\n';
  const prev = existsSync(path) ? readFileSync(path, 'utf8') : '';
  if (check && prev !== next) {
    console.error(`✗ ${g.dir}/manifest.json is out of date — run npm run assets:manifest and commit it`);
    failed = true;
  } else if (!check && prev !== next) {
    writeFileSync(path, next);
    console.log(`wrote ${g.dir}/manifest.json (${names.length} files)`);
  }
}
if (total > MAX_TOTAL_MB) {
  console.error(`✗ assets total ${total.toFixed(1)} MB > ${MAX_TOTAL_MB} MB`);
  failed = true;
}
if (failed) process.exit(1);
console.log(`✓ assets OK (${total.toFixed(1)} MB)`);
