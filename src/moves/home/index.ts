import * as THREE from 'three';
import { defineModule, devStep, stubMove, type Ctx } from '@core/api';
import { eggCrack } from './egg-crack';
import { whisk } from './whisk';
import { pancakeFlip } from './pancake-flip';
import { stack } from './stack';
import { syrupDrizzle } from './syrup-drizzle';
import { spawnDishItem, clearDishItems } from './dish-items';

/**
 * Owner: B. Home Kitchen moves — one real file per move (brief B), each with a dev scene:
 * ?scene=egg_crack · whisk · pancake_flip · stack · syrup_drizzle. Backspace restarts a scene.
 */

/** Dummy pancakes for the stack / syrup_drizzle dev scenes, where no flip step ran before. */
function spawnPancakes(ctx: Ctx, dishId: string, n: number, cx: number, cz: number) {
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.022, 30),
      new THREE.MeshToonMaterial({ color: '#D9A05B' }),
    );
    mesh.position.set(cx, 0.925 + 0.023 + i * 0.026, cz);
    spawnDishItem(ctx, dishId, 'pancake', mesh);
  }
}

const cleanupFor = (ctx: Ctx, dispose: () => void) => () => {
  dispose();
  clearDishItems(ctx, 'dev');
};

export default defineModule({
  id: 'moves-home',
  owner: 'B',
  setup(ctx) {
    [eggCrack, whisk, pancakeFlip, stack, syrupDrizzle].forEach((m) => ctx.moves.register(m));

    // B6: core resets props on dish:start (app.ts); meshes this module spawned are dish items
    // in ctx.world.root, cleared here so pancakes never leak across runs.
    ctx.bus.on('dish:start', ({ dishId }) => clearDishItems(ctx, dishId));

    ctx.dev.scene('egg_crack', { kitchen: 'home', station: 'bowl' }, (c) =>
      cleanupFor(c, eggCrack.start(c, devStep('egg_crack', 'bowl', { eggs: 2 })).dispose),
    );
    ctx.dev.scene('whisk', { kitchen: 'home', station: 'bowl' }, (c) => {
      const inst = whisk.start(c, devStep('whisk', 'bowl', { circles: 6 }));
      return () => inst.dispose();
    });
    ctx.dev.scene('pancake_flip', { kitchen: 'home', station: 'stove' }, (c) =>
      cleanupFor(c, pancakeFlip.start(c, devStep('pancake_flip', 'stove', { count: 3 })).dispose),
    );
    ctx.dev.scene('stack', { kitchen: 'home', station: 'plate' }, (c) => {
      spawnPancakes(c, 'dev', 3, 0.5, -0.7); // pancakes sit in the pan until dragged over
      return cleanupFor(c, stack.start(c, devStep('stack', 'plate', { layers: 3, itemKind: 'pancake' })).dispose);
    });
    ctx.dev.scene('syrup_drizzle', { kitchen: 'home', station: 'plate' }, (c) => {
      spawnPancakes(c, 'dev', 5, 1.5, -0.65); // an already-stacked tower on the plate
      return cleanupFor(c, syrupDrizzle.start(c, devStep('syrup_drizzle', 'plate', {})).dispose);
    });
  },
  stub(ctx) {
    [
      stubMove('egg_crack', '打蛋'),
      stubMove('whisk', '搅拌'),
      stubMove('pancake_flip', '翻面'),
      stubMove('stack', '叠放'),
      stubMove('syrup_drizzle', '淋酱'),
    ].forEach((m) => ctx.moves.register(m));
  },
});
