import { defineMove } from '@core/api';

/**
 * 打蛋 — reference implementation of a guided move (copy this pattern).
 * Now: drag an egg onto the bowl-rim snap → "咔!" → egg disappears → repeat for params.eggs.
 * TODO(B), from sketch board 3: flick-down gesture onto the rim, crack line, pull halves apart,
 * yolk drops; shell bits lower quality; "噗通" funny fail when flicked too hard.
 */
export const eggCrack = defineMove({
  id: 'egg_crack',
  label: '打蛋',
  start(ctx, step) {
    const need = Math.max(1, Number(step.params.eggs ?? 1));
    let cracked = 0;
    let done = false;
    const offs: (() => void)[] = [];
    const hint = () => ctx.bus.emit('hint:show', { text: `把蛋拖到碗沿上松手 · ${cracked}/${need}`, gesture: 'drag' });

    const finish = (quality: number) => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      ctx.bus.emit('hint:clear', {});
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags: [] });
    };

    offs.push(
      ctx.bus.on('grab:end', (e) => {
        if (done || e.snappedTo !== 'bowl_rim') return;
        const egg = ctx.world.prop(e.objectId);
        if (!egg || egg.kind !== 'egg') return;
        cracked++;
        const p = egg.object.position;
        ctx.bus.emit('sfx:play', { id: 'egg_crack', at: [p.x, p.y, p.z] });
        ctx.bus.emit('fx:pop', { text: '咔!', style: 'good', at: [p.x, p.y + 0.1, p.z] });
        egg.object.visible = false;
        if (cracked >= need) finish(0.9);
        else hint();
      }),
    );
    offs.push(ctx.input.onKey('Space', () => finish(0.6))); // demo escape hatch
    if (ctx.flags.auto) offs.push(ctx.after(600, () => finish(0.92)));
    hint();

    return {
      dispose() {
        if (done) return;
        done = true;
        offs.forEach((f) => f());
      },
    };
  },
});
