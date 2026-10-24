#!/usr/bin/env node
/**
 * Scaffold a new kitchen so the 11th costs data, not code (owner A).
 *
 *   npm run new:kitchen <id> [--name 中文名]
 *
 * Writes four stubs and refuses to overwrite:
 *   content/kitchens/<id>.json      one counter, two stations, two snaps, a workpiece + plate
 *   content/dishes/<id>_dish.json   two stub steps (reuse the `stack` family) — plays on stubs / ?auto
 *   content/equipment/<id>_key.json the key gear card for the kitchen
 *   content/route.json              appends a reachable node for <id> (if not already present)
 *
 * Then `?kitchen=<id>` boots and plays end to end on stub moves. The captain fleshes out the
 * JSON while watching `?kitchen=<id>&debug`; E adds a mood/ambience preset; D prices the gear.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const nameIdx = args.indexOf('--name');
const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined;
const id = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--name');

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!id) die('usage: npm run new:kitchen <id> [--name 中文名]');
if (!/^[a-z][a-z0-9_]*$/.test(id)) die(`id "${id}" must be lower-case letters, digits and underscores (start with a letter)`);
if (nameIdx >= 0 && (!name || name.startsWith('--'))) die('--name needs a kitchen name');

// Check every destination before writing: a late collision must not leave half a kitchen.
for (const rel of [`content/kitchens/${id}.json`, `content/dishes/${id}_dish.json`, `content/equipment/${id}_key.json`]) {
  if (existsSync(join(ROOT, rel))) die(`${rel} already exists — refusing to overwrite`);
}
const routePath = join(ROOT, 'content/route.json');
const route = JSON.parse(readFileSync(routePath, 'utf8'));
if (!Array.isArray(route.nodes)) die('content/route.json needs a nodes array');

const label = name ?? id;
const write = (rel, obj) => {
  const path = join(ROOT, rel);
  if (existsSync(path)) die(`${rel} already exists — refusing to overwrite. Delete it first if you mean to.`);
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
  console.log(`  wrote ${rel}`);
};

const kitchen = {
  id,
  name: label,
  region: id,
  pacing: { camera: 'calm' },
  ambience: {},
  mood: { background: '#E7E3DC', floor: '#BFB8AC', counter: '#C9BBA2', light: '#FFF6E6', lightIntensity: 1.2 },
  defaultDish: `${id}_dish`,
  overview: { pos: [0.2, 2.6, 3.2], target: [0.2, 0.9, -0.1] },
  counters: [{ pos: [0, 0, -0.7], size: [3.2, 0.9, 0.7] }],
  stations: [
    { id: 'prep', label: '备料', key: 1, anchor: [-0.8, 0.9, -0.7], camera: { pos: [-0.8, 1.65, 0.45], target: [-0.8, 0.9, -0.7] } },
    { id: 'plate', label: '出餐', key: 2, anchor: [0.9, 0.9, -0.7], camera: { pos: [0.9, 1.65, 0.45], target: [0.9, 0.9, -0.7] } },
  ],
  snaps: [
    { id: 'prep_spot', station: 'prep', pos: [-0.8, 0.93, -0.7], radius: 0.2, accepts: ['*'] },
    { id: 'plate_center', station: 'plate', pos: [0.9, 0.93, -0.7], radius: 0.18, accepts: ['*'] },
  ],
  props: [
    { id: 'workpiece', kind: 'workpiece', shape: 'box', size: [0.2, 0.12, 0.2], color: '#E4D2A8', pos: [-0.8, 0.9, -0.7] },
    { id: 'plate', kind: 'plate_serving', shape: 'cylinder', size: [0.36, 0.025, 0.36], color: '#FFFFFF', pos: [0.9, 0.9, -0.7], grabbable: false },
  ],
  slots: [],
  eggs: [],
};

const dish = {
  id: `${id}_dish`,
  name: `${label} 招牌菜`,
  kitchen: id,
  steps: [
    { id: 'prep_step', move: 'stack', station: 'prep', weight: 1, params: {} },
    { id: 'plate_step', move: 'stack', station: 'plate', weight: 1, params: {} },
  ],
  rating: { good: 0.4, great: 0.7, perfect: 0.9 },
  coins: { oops: 5, good: 20, great: 50, perfect: 80 },
  stars: [],
};

const key = {
  id: `${id}_key`,
  name: `${label} 钥匙`,
  kitchen: id,
  price: 500,
  key: true,
  blurb: '关键 · 解锁下一厨房',
  effects: {},
};

console.log(`Scaffolding kitchen "${id}" (${label})…`);
write(`content/kitchens/${id}.json`, kitchen);
write(`content/dishes/${id}_dish.json`, dish);
write(`content/equipment/${id}_key.json`, key);

// Append a route node (idempotent: skip if one already exists for this id).
const routeRel = 'content/route.json';
if (route.nodes.some((n) => n.kitchenId === id)) {
  console.log(`  ${routeRel} already has a node for "${id}" — left as is`);
} else {
  route.nodes.push({ kitchenId: id, name: label, gate: null, region: id, mapPos: [0, 0], blurb: '新厨房占位，待布置' });
  writeFileSync(routePath, JSON.stringify(route, null, 2) + '\n');
  console.log(`  appended a node to ${routeRel}`);
}

console.log(`
✓ done. Next steps:
  1. npm run check                      # the new content must validate
  2. npm run dev  →  ?kitchen=${id}&debug   # it boots and plays on stub moves
  3. Captain: lay out stations, snaps and props in content/kitchens/${id}.json
  4. E: add a mood + ambience preset and hero props
  5. D: price content/equipment/${id}_key.json and place its route node (mapPos/branch)
  6. Compose the dish in content/dishes/${id}_dish.json from existing move families
`);
