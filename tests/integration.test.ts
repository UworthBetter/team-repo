import { afterEach, describe, expect, it, vi } from 'vitest';
import { Bus } from '@core/bus';
import { loadContent } from '@core/content';
import { readFlags } from '@core/flags';
import type { Ctx, MoveDef } from '@core/api';
import { createRunner } from '../src/dishes/runner';
import { payout } from '../src/meta/score';
import { watchInstalled } from '../src/moves/home/equipment';

afterEach(() => vi.useRealTimers());

function runnerFixture(synchronous = false) {
  vi.useFakeTimers();
  const bus = new Bus();
  const content = loadContent();
  const dispose = vi.fn();
  const ctx = {
    bus, content, flags: readFlags(''),
    onFrame: () => () => {},
    after(ms: number, fn: () => void) {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
    moves: {
      get: (id: MoveDef['id']): MoveDef => ({ id, label: '测试动作', start(_ctx, step) {
        if (synchronous) bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality: 0.95, tags: [] });
        return { dispose };
      } }),
    },
    ui: { toast: vi.fn() },
  } as unknown as Ctx;
  return { bus, content, dispose, runner: createRunner(ctx) };
}

describe('integrated progression', () => {
  it('affords the knives after two perfect fried-rice dishes without repeat star bonuses', () => {
    const content = loadContent();
    const pancake = content.dishes.get('pancake_tower')!;
    const rice = content.dishes.get('fried_rice')!;
    const sum = (lines: ReturnType<typeof payout>) => lines.reduce((total, line) => total + line.amount, 0);
    let coins = 600 + sum(payout(pancake, 'perfect', { newStars: 3, firstDishInNewKitchen: false }));
    coins -= content.equipment.get('wok_burner')!.price;
    coins += sum(payout(rice, 'perfect', { newStars: 3, firstDishInNewKitchen: true }));
    expect(coins).toBeLessThan(content.equipment.get('pro_knives')!.price);
    coins += sum(payout(rice, 'perfect', { newStars: 0, firstDishInNewKitchen: false }));
    expect(coins).toBe(content.equipment.get('pro_knives')!.price);
  });

  it('cancels a pending next step when the same dish is restarted', () => {
    const f = runnerFixture();
    f.runner.start('pancake_tower');
    f.bus.emit('step:complete', { dishId: 'pancake_tower', stepId: 'crack', quality: 0.9, tags: [] });
    f.runner.start('pancake_tower');
    vi.advanceTimersByTime(300);
    const starts = f.bus.log.filter((event) => event.name === 'step:start');
    expect(starts.map((event) => (event.payload as { stepId: string }).stepId)).toEqual(['crack', 'crack']);
  });

  it('disposes synchronous moves and records exactly one result per step', () => {
    const f = runnerFixture(true);
    const dish = f.content.dishes.get('pancake_tower')!;
    f.content.dishes.set('instant', { ...dish, id: 'instant', steps: dish.steps.slice(0, 2), stars: [] });
    f.runner.start('instant');
    vi.advanceTimersByTime(600);
    expect(f.dispose).toHaveBeenCalledTimes(2);
    const result = f.bus.log.find((event) => event.name === 'dish:complete')?.payload as { steps: unknown[] };
    expect(result.steps).toHaveLength(2);
  });

  it('initializes gear effects from existing state and removes the subscription on disposal', () => {
    const bus = new Bus();
    const state = { coins: 0, owned: ['syrup_pot'], installed: ['syrup_pot'], unlocked: ['home'], stars: {}, stickers: [] };
    bus.emit('meta:state', state);
    const cleanups: (() => void)[] = [];
    const installed = watchInstalled({ bus } as Ctx, cleanups);
    expect(installed.has('syrup_pot')).toBe(true);
    cleanups.forEach((off) => off());
    bus.emit('meta:state', { ...state, installed: [] });
    expect(installed.has('syrup_pot')).toBe(true);
  });
});
