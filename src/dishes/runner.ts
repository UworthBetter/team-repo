import type { Dish } from '@contracts/schemas';
import type { Ctx, MoveInstance } from '@core/api';

/**
 * Walks a dish's steps: step:start → the move runs → step:complete → next step → dish:complete.
 * Owner: B (C uses it unchanged for wok dishes). Quality = weighted mean of step qualities.
 */
export function createRunner(ctx: Ctx) {
  let dish: Dish | null = null;
  let lastDishId: string | null = null;
  let idx = -1;
  let inst: MoveInstance | null = null;
  const results: { stepId: string; quality: number }[] = [];
  const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

  ctx.onFrame((dt) => inst?.update?.(dt));

  function stop() {
    const old = inst;
    inst = null;
    dish = null;
    old?.dispose();
  }

  function start(dishId: string) {
    const d = ctx.content.dishes.get(dishId);
    if (!d) {
      ctx.ui.toast(`dish "${dishId}" not found in content/dishes`, 'error');
      return;
    }
    stop();
    dish = d;
    lastDishId = d.id;
    idx = -1;
    results.length = 0;
    ctx.bus.emit('dish:start', { dishId: d.id, kitchenId: d.kitchen });
    next();
  }

  function next() {
    if (!dish) return;
    idx++;
    if (idx >= dish.steps.length) return finish(dish);
    const s = dish.steps[idx]!;
    const step = { dishId: dish.id, stepId: s.id, move: s.move, station: s.station, params: s.params };
    ctx.bus.emit('station:focus', { stationId: s.station });
    ctx.bus.emit('step:start', step);
    try {
      inst = ctx.moves.get(s.move).start(ctx, step);
    } catch (err) {
      console.error(`[runner] move "${s.move}" threw on start — skipping with quality 0.5`, err);
      ctx.bus.emit('step:complete', { dishId: dish.id, stepId: s.id, quality: 0.5, tags: ['crashed'] });
    }
  }

  function finish(d: Dish) {
    const total = d.steps.reduce((a, s) => a + s.weight, 0);
    const q = results.reduce((a, r) => a + r.quality * (d.steps.find((s) => s.id === r.stepId)?.weight ?? 1), 0) / total;
    dish = null;
    ctx.bus.emit('dish:complete', { dishId: d.id, kitchenId: d.kitchen, quality: clamp01(q), steps: [...results] });
  }

  ctx.bus.on('step:complete', (e) => {
    if (!dish || e.dishId !== dish.id || e.stepId !== dish.steps[idx]?.id) return;
    results.push({ stepId: e.stepId, quality: clamp01(e.quality) });
    const old = inst;
    inst = null;
    old?.dispose();
    ctx.after(250, next);
  });

  ctx.bus.on('kitchen:ready', ({ kitchenId }) => {
    stop();
    if (ctx.flags.scene) return; // dev scenes drive moves themselves
    const kitchen = ctx.content.kitchens.get(kitchenId);
    if (!kitchen) return;
    const wanted = ctx.flags.dish && ctx.content.dishes.get(ctx.flags.dish)?.kitchen === kitchenId ? ctx.flags.dish : kitchen.defaultDish;
    ctx.after(400, () => start(wanted));
  });

  ctx.bus.on('result:closed', ({ next: n }) => {
    if (n === 'again' && lastDishId) start(lastDishId);
  });
  ctx.bus.on('dish:restart', () => lastDishId && start(lastDishId));

  return { start, stop };
}
