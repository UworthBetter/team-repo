import type { MoveId } from '@contracts/ids';
import type { MoveDef } from './api';

/**
 * Placeholder move: Space = done (quality 0.8), O = funny fail (0.2).
 * With ?auto it finishes by itself. Replace with the real move; keep it for ?stub=.
 */
export function stubMove(id: MoveId, label: string, opts: { quality?: number } = {}): MoveDef {
  return {
    id,
    label,
    start(ctx, step) {
      let finished = false;
      const offs: (() => void)[] = [];
      const cleanup = () => {
        if (finished) return;
        finished = true;
        offs.forEach((f) => f());
        ctx.bus.emit('hint:clear', {});
      };
      const done = (quality: number, oops = false) => {
        if (finished) return;
        cleanup();
        if (oops) {
          ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'stub' });
          ctx.bus.emit('fx:pop', { text: '哎呀!', style: 'oops' });
          ctx.bus.emit('sfx:play', { id: 'oops' });
        } else {
          ctx.bus.emit('fx:pop', { text: quality >= 0.9 ? '完美!' : '好!', style: quality >= 0.9 ? 'perfect' : 'good' });
          ctx.bus.emit('sfx:play', { id: 'step_done' });
        }
        ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags: ['stub'] });
      };
      ctx.bus.emit('hint:show', { text: `${label}（占位）· 空格 完成 · O 失误`, gesture: 'click' });
      offs.push(ctx.input.onKey('Space', () => done(opts.quality ?? 0.8)));
      offs.push(ctx.input.onKey('KeyO', () => done(0.2, true)));
      if (ctx.flags.auto) offs.push(ctx.after(500, () => done(0.95)));
      return { dispose: cleanup };
    },
  };
}
