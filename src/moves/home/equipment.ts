import type { Ctx } from '@core/api';

/**
 * Live view of D's installed equipment, from meta:state (published on kitchen:ready and after
 * every purchase). Moves read tuning from ctx.content.equipment — brief B M3.
 */
export function watchInstalled(ctx: Ctx): Set<string> {
  const set = new Set<string>();
  ctx.bus.on('meta:state', (s) => {
    set.clear();
    for (const id of s.installed) set.add(id);
  });
  return set;
}

/** The effects record of an installed item, e.g. nonstick_pan.effects.pancake_flip — null when not installed. */
export function effectOf(
  ctx: Ctx,
  installed: Set<string>,
  itemId: string,
  move: string,
): Record<string, unknown> | null {
  if (!installed.has(itemId)) return null;
  const fx = ctx.content.equipment.get(itemId)?.effects[move];
  return fx && typeof fx === 'object' ? (fx as Record<string, unknown>) : null;
}
