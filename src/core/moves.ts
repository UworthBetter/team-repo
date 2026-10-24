import type { MoveId } from '@contracts/ids';
import type { MoveDef, MoveRegistry } from './api';
import { stubMove } from './stub-move';

export function createMoveRegistry(): MoveRegistry {
  const defs = new Map<MoveId, MoveDef>();
  const warned = new Set<MoveId>();
  return {
    register(def) {
      if (defs.has(def.id)) console.warn(`[moves] "${def.id}" registered twice — the last one wins`);
      defs.set(def.id, def);
    },
    get(id) {
      const def = defs.get(id);
      if (def) return def;
      if (!warned.has(id)) {
        warned.add(id);
        console.warn(`[moves] "${id}" is not registered — using a fallback stub`);
      }
      return stubMove(id, id);
    },
    has: (id) => defs.has(id),
    list: () => [...defs.keys()],
  };
}
