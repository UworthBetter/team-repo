#!/usr/bin/env node
/**
 * Import boundaries — the rule that lets 5 AI agents work in parallel without breaking each other.
 *
 *   contracts/  may import: contracts, zod
 *   core/       may import: contracts, core, npm packages
 *   modules     (moves/home, moves/wok, dishes, meta, ui, fx, audio, any new folder)
 *               may import: contracts, @core/api ONLY, their own folder, npm packages
 *   main.ts     may import anything
 *
 * Modules talk to each other through ctx.bus events (src/contracts/events.ts), never by import.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SRC = join(ROOT, 'src');
const IMPORT_RE = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

/** Area of a path relative to src/. */
function areaOf(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.length === 1) return 'root';
  if (parts[0] === 'moves') return `moves/${parts[1]}`;
  return parts[0];
}

function classify(spec, fromFile) {
  if (spec.startsWith('@contracts/')) return { area: 'contracts' };
  if (spec === '@core/api') return { area: 'core', api: true };
  if (spec.startsWith('@core/')) return { area: 'core', api: false };
  if (spec.startsWith('.')) {
    const abs = resolve(dirname(fromFile), spec);
    const rel = relative(SRC, abs);
    if (rel.startsWith('..')) return { area: 'outside', path: relative(ROOT, abs) };
    const area = areaOf(rel);
    return { area, api: area === 'core' && /core[\\/]api(\.ts)?$/.test(rel) };
  }
  return { area: 'npm', pkg: spec };
}

const problems = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const from = areaOf(rel);
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(IMPORT_RE)) {
    const spec = m[1] ?? m[2];
    if (!spec || spec.endsWith('.css')) continue;
    const to = classify(spec, file);
    let ok = true;
    let why = '';
    if (from === 'root') ok = true;
    else if (from === 'contracts') {
      ok = to.area === 'contracts' || (to.area === 'npm' && to.pkg === 'zod');
      why = 'contracts may only import other contracts and zod';
    } else if (from === 'core') {
      ok = ['contracts', 'core', 'npm'].includes(to.area) || (to.area === 'outside' && to.path?.startsWith('content'));
      why = 'core may not import feature modules — listen to events instead';
    } else {
      ok = to.area === 'contracts' || to.area === 'npm' || to.area === from || (to.area === 'core' && to.api);
      if (to.area === 'core' && !to.api) why = 'feature modules may only import @core/api from core';
      else if (to.area === 'outside') why = 'read content through ctx.content, not by importing JSON';
      else why = `"${from}" may not import "${to.area}" — talk through ctx.bus events (src/contracts/events.ts)`;
    }
    if (!ok) problems.push(`src/${rel.split(sep).join('/')}: import "${spec}"\n    → ${why}`);
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} import boundary violation(s):\n`);
  for (const p of problems) console.error('  ' + p);
  console.error('\nSee AGENTS.md → "Boundaries".');
  process.exit(1);
}
console.log('✓ import boundaries OK');
