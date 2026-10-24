import type { Object3D } from 'three';
import type { Ctx } from '@core/api';

/**
 * Ground height under (x, z), computed from content counters — same rule as core's internal
 * groundAt, which is not on the public World contract (TODO(contract): ask A to expose it).
 */
export function groundHeightAt(ctx: Ctx, x: number, z: number): number {
  let h = 0;
  for (const c of ctx.content.kitchens.get(ctx.world.kitchenId ?? '')?.counters ?? []) {
    if (Math.abs(x - c.pos[0]) <= c.size[0] / 2 && Math.abs(z - c.pos[2]) <= c.size[2] / 2) h = Math.max(h, c.pos[1] + c.size[1]);
  }
  return h;
}

/**
 * Minimal per-frame tween list, driven by ctx.onFrame (respects ?fast). go() animates 0→1;
 * add() runs a raw updater that returns false when it is done. dispose() drops everything.
 */
export function createTweens(ctx: Ctx) {
  const live = new Set<{ update(dt: number): boolean }>();
  const off = ctx.onFrame((dt) => {
    for (const t of [...live]) if (!t.update(dt)) live.delete(t);
  });
  const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);
  return {
    add(t: { update(dt: number): boolean }) {
      live.add(t);
    },
    go(dur: number, onUpdate: (v: number) => void, onDone?: () => void, ease: (v: number) => number = easeOut) {
      let t = 0;
      live.add({
        update(dt: number) {
          t = Math.min(1, t + dt / dur);
          onUpdate(ease(t));
          if (t >= 1) {
            onDone?.();
            return false;
          }
          return true;
        },
      });
    },
    dispose() {
      live.clear();
      off();
    },
  };
}

/** Scripted gravity fall for a mesh; bounces when it lands. Returns the updater for createTweens.add. */
export function fallAndBounce(obj: Object3D, groundY: () => number, bounces = 1): { update(dt: number): boolean } {
  let vy = -0.4;
  let left = bounces;
  return {
    update(dt: number) {
      vy -= 9.8 * dt;
      obj.position.y += vy * dt;
      const g = groundY();
      if (obj.position.y <= g) {
        obj.position.y = g;
        if (left-- > 0 && Math.abs(vy) > 0.8) {
          vy = -vy * 0.38;
          return true;
        }
        return false;
      }
      return true;
    },
  };
}
