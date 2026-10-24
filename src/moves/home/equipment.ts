import type { Ctx } from '@core/api';
import type { MetaState } from '@contracts/types';

/**
 * Live view of D's installed equipment, from meta:state (published on kitchen:ready and after
 * every purchase). Moves read tuning from ctx.content.equipment — brief B M3.
 */
export function watchInstalled(ctx: Ctx, cleanups: (() => void)[]): Set<string> {
  const set = new Set<string>();
  const apply = (s: MetaState) => {
    set.clear();
    for (const id of s.installed) set.add(id);
  };
  const latest = [...ctx.bus.log].reverse().find((event) => event.name === 'meta:state');
  if (latest) apply(latest.payload as MetaState);
  cleanups.push(ctx.bus.on('meta:state', apply));
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
