/**
 * Loads and validates everything under content/ at build time (Vite glob).
 * One JSON file per entity, file name === id, so two people never edit the same file.
 */
import type { z, ZodTypeAny } from 'zod';
import {
  DishSchema,
  EquipmentSchema,
  KitchenSchema,
  RouteSchema,
  type Dish,
  type Equipment,
  type Kitchen,
  type Route,
} from '@contracts/schemas';

export interface Content {
  kitchens: Map<string, Kitchen>;
  dishes: Map<string, Dish>;
  equipment: Map<string, Equipment>;
  route: Route;
}

export class ContentError extends Error {
  constructor(readonly problems: string[]) {
    super(`content/ has ${problems.length} problem(s):\n` + problems.join('\n'));
  }
}

const kitchenFiles = import.meta.glob('../../content/kitchens/*.json', { eager: true, import: 'default' });
const dishFiles = import.meta.glob('../../content/dishes/*.json', { eager: true, import: 'default' });
const equipmentFiles = import.meta.glob('../../content/equipment/*.json', { eager: true, import: 'default' });
const routeFiles = import.meta.glob('../../content/route.json', { eager: true, import: 'default' });

function parseAll<S extends ZodTypeAny>(files: Record<string, unknown>, schema: S, problems: string[]) {
  const out = new Map<string, z.output<S>>();
  for (const [path, raw] of Object.entries(files)) {
    const short = path.replace(/^(\.\.\/)+/, '');
    const r = schema.safeParse(raw);
    if (!r.success) {
      problems.push(`${short}:\n` + r.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n'));
      continue;
    }
    const id = (r.data as { id: string }).id;
    const fileId = path.split('/').pop()!.replace(/\.json$/, '');
    if (id !== fileId) problems.push(`${short}: id "${id}" must match the file name "${fileId}"`);
    out.set(id, r.data);
  }
  return out;
}

/** Cross-file references. Every message says which file to fix. */
export function crossCheck(c: Content): string[] {
  const p: string[] = [];
  const routeIds = new Set(c.route.nodes.map((n) => n.kitchenId));
  for (const k of c.kitchens.values()) {
    const where = `content/kitchens/${k.id}.json`;
    const stationIds = new Set(k.stations.map((s) => s.id));
    const propIds = new Set(k.props.map((pr) => pr.id));
    const keys = new Set<number>();
    for (const s of k.stations) {
      if (keys.has(s.key)) p.push(`${where}: station key ${s.key} used twice`);
      keys.add(s.key);
    }
    const dd = c.dishes.get(k.defaultDish);
    if (!dd) p.push(`${where}: defaultDish "${k.defaultDish}" has no content/dishes file`);
    else if (dd.kitchen !== k.id) p.push(`${where}: defaultDish "${k.defaultDish}" belongs to kitchen "${dd.kitchen}"`);
    for (const s of k.snaps) if (!stationIds.has(s.station)) p.push(`${where}: snap "${s.id}" uses unknown station "${s.station}"`);
    for (const e of k.eggs) if (!propIds.has(e.propId)) p.push(`${where}: easter egg "${e.id}" uses unknown prop "${e.propId}"`);
    for (const s of k.slots) if (!c.equipment.has(s.itemId)) p.push(`${where}: slot for unknown equipment "${s.itemId}"`);
    if (!routeIds.has(k.id)) p.push(`content/route.json: kitchen "${k.id}" is missing from the route`);
  }
  for (const d of c.dishes.values()) {
    const k = c.kitchens.get(d.kitchen);
    if (!k) {
      p.push(`content/dishes/${d.id}.json: unknown kitchen "${d.kitchen}"`);
      continue;
    }
    const stationIds = new Set(k.stations.map((s) => s.id));
    for (const s of d.steps)
      if (!stationIds.has(s.station)) p.push(`content/dishes/${d.id}.json: step "${s.id}" uses station "${s.station}" not in ${k.id}.json`);
  }
  for (const e of c.equipment.values()) {
    const where = `content/equipment/${e.id}.json`;
    if (!c.kitchens.has(e.kitchen)) p.push(`${where}: unknown kitchen "${e.kitchen}"`);
    if (e.unlocks && !routeIds.has(e.unlocks)) p.push(`${where}: unlocks "${e.unlocks}" which is not on content/route.json`);
  }
  for (const n of c.route.nodes) {
    if (!n.placeholder && !c.kitchens.has(n.kitchenId)) p.push(`content/route.json: "${n.kitchenId}" has no kitchen file (mark it placeholder?)`);
    if (n.gate && !c.equipment.has(n.gate)) p.push(`content/route.json: gate "${n.gate}" is not an equipment id`);
  }
  return p;
}

export function loadContent(): Content {
  const problems: string[] = [];
  const kitchens = parseAll(kitchenFiles, KitchenSchema, problems);
  const dishes = parseAll(dishFiles, DishSchema, problems);
  const equipment = parseAll(equipmentFiles, EquipmentSchema, problems);
  const routeRaw = Object.values(routeFiles)[0];
  const route = RouteSchema.safeParse(routeRaw);
  if (!route.success) problems.push('content/route.json: ' + route.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  if (problems.length) throw new ContentError(problems);
  const content: Content = { kitchens, dishes, equipment, route: route.data! };
  const refs = crossCheck(content);
  if (refs.length) throw new ContentError(refs);
  return content;
}
