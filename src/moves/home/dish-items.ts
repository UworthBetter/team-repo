import * as THREE from 'three';
import type { Ctx } from '@core/api';

/**
 * Per-dish spawned meshes (pancakes, tofu sheets …) tagged with userData so ANY module can
 * contribute or consume them through ctx.world.root without a cross-module import (B6; the
 * moves-knife module reuses the same convention for its sheets). Cleared on every dish:start.
 * Convention: obj.userData.dishItem = { dishId, kind, order }.
 */
export interface DishItemTag {
  dishId: string;
  kind: string;
  order: number;
}

let seq = 0;

export function spawnDishItem(ctx: Ctx, dishId: string, kind: string, obj: THREE.Object3D): void {
  obj.userData.dishItem = { dishId, kind, order: seq++ } satisfies DishItemTag;
  ctx.world.root.add(obj);
}

/** All dish items of a kind for this dish, in spawn order. */
export function findDishItems(ctx: Ctx, dishId: string, kind: string): THREE.Object3D[] {
  const out: { o: THREE.Object3D; order: number }[] = [];
  ctx.world.root.traverse((o) => {
    const t = o.userData.dishItem as DishItemTag | undefined;
    if (t && t.dishId === dishId && t.kind === kind) out.push({ o, order: t.order });
  });
  return out.sort((a, b) => a.order - b.order).map((x) => x.o);
}

/** Remove and dispose every dish item of this dish (the dish:start reset, B6). */
export function clearDishItems(ctx: Ctx, dishId: string): void {
  const dead: THREE.Object3D[] = [];
  ctx.world.root.traverse((o) => {
    const t = o.userData.dishItem as DishItemTag | undefined;
    if (t?.dishId === dishId) dead.push(o);
  });
  for (const o of dead) {
    o.removeFromParent();
    o.traverse((m) => {
      if (m instanceof THREE.Mesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[];
        (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
      }
    });
  }
}
