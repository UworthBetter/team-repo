import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from '@core/api';
import { Bus } from '@core/bus';
import { loadContent } from '@core/content';
import { readFlags } from '@core/flags';
import { pancakeFlip } from '../src/moves/home/pancake-flip';

afterEach(() => vi.useRealTimers());

describe('auto flip under slow rendering', () => {
  it('finishes every pancake when timers run far ahead of animation frames', () => {
    vi.useFakeTimers();
    const bus = new Bus();
    const root = new THREE.Group();
    const frames = new Set<(dt: number) => void>();
    const ctx = {
      bus, content: loadContent(), flags: readFlags('?auto'),
      world: { root, prop: () => undefined },
      input: { onPointer: () => () => {}, onKey: () => () => {} },
      onFrame(fn: (dt: number) => void) { frames.add(fn); return () => frames.delete(fn); },
      after(ms: number, fn: () => void) { const id = setTimeout(fn, ms); return () => clearTimeout(id); },
    } as unknown as Ctx;
    const move = pancakeFlip.start(ctx, { dishId: 'slow_flip', stepId: 'flip', move: 'pancake_flip', station: 'stove', params: { count: 3 } });
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(100000);
      for (const frame of [...frames]) frame(1);
    }
    const completed = bus.log.filter((event) => event.name === 'step:complete');
    expect(completed).toHaveLength(1);
    expect(root.children.filter((object) => object.userData.dishItem?.kind === 'pancake')).toHaveLength(3);
    move.dispose();
    expect(frames.size).toBe(0);
  });
});
