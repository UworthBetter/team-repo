/**
 * Known ids. FROZEN CONTRACT — owner A. Append new ids at the END of a list, never rename.
 */
import type { OwnerLetter } from './types';

/** Every move a dish step may reference. Adding one = a "contract:" PR (append only). */
export const MOVE_IDS = [
  // Home Kitchen (B)
  'egg_crack',
  'whisk',
  'pancake_flip',
  'stack',
  'syrup_drizzle',
  // Wok Station (C)
  'wok_toss',
  'flare',
  'dome_scoop',
] as const;
export type MoveId = (typeof MOVE_IDS)[number];

/** Feature modules auto-discovered from src/<module>/index.ts and src/moves/<kitchen>/index.ts. */
export const MODULE_IDS = ['moves-home', 'moves-wok', 'dishes', 'meta', 'ui', 'fx', 'audio'] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export const MODULE_OWNERS: Record<ModuleId, OwnerLetter> = {
  'moves-home': 'B',
  'moves-wok': 'C',
  dishes: 'B',
  meta: 'D',
  ui: 'D',
  fx: 'E',
  audio: 'E',
};
