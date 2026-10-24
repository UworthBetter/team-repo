import type { MetaState } from '@contracts/types';
import type { Ctx } from '@core/api';

/** Moves start after kitchen:ready publishes state; include that initial equipment snapshot. */
export function watchMeta(ctx: Ctx, apply: (state: MetaState) => void): () => void {
  const latest = [...ctx.bus.log].reverse().find((event) => event.name === 'meta:state');
  if (latest) apply(latest.payload as MetaState);
  return ctx.bus.on('meta:state', apply);
}
