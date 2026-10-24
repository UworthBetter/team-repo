import * as THREE from 'three';
import { defineMove } from '@core/api';
import { findDishItems } from './dish-items';
import { createTweens, fallAndBounce, groundHeightAt } from './tween';

/**
 * 叠放 (B4, reusable). Drag each item onto a ghost disc above the plate-center snap; score
 * alignment, wobble the tower when off-center. Params: layers, itemKind, ghostSize, label.
 * Items come from the per-dish mesh pool (dish-items.ts) — pancake_flip spawns pancakes,
 * and the moves-knife module can spawn tofu sheets with the same convention, so any dish
 * JSON can reuse this move with params.itemKind.
 */
export const stack = defineMove({
  id: 'stack',
  label: '叠放',
  start(ctx, step) {
    const kind = typeof step.params.itemKind === 'string' ? step.params.itemKind : 'pancake';
    const label = typeof step.params.label === 'string' ? step.params.label : '煎饼';
    const ghostR = 0.15;
    const layerH = 0.026;
    let layers = Math.max(1, Number(step.params.layers ?? 3));
    let done = false;
    let placed = 0;
    const quality: number[] = [];
    const offs: (() => void)[] = [];
    const tweens = createTweens(ctx);

    const items = findDishItems(ctx, step.dishId, kind);
    // Fewer items than layers would dead-end the dish; clamp (B9 tuning keeps them equal).
    layers = Math.min(layers, items.length);
    const plate = ctx.world.snapPos('plate_center') ?? new THREE.Vector3(1.5, 0.925, -0.65);

    const tower = new THREE.Group();
    tower.position.set(plate.x, plate.y, plate.z);
    ctx.world.root.add(tower);

    const ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(ghostR, ghostR, 0.01, 28),
      new THREE.MeshBasicMaterial({ color: '#2a8c9a', transparent: true, opacity: 0.4, depthWrite: false }),
    );
    ghost.renderOrder = 2;
    tower.add(ghost);

    const slotY = (i: number) => 0.012 + i * layerH + 0.011;
    const syncGhost = () => (ghost.position.y = slotY(placed) + 0.02);
    syncGhost();

    let wobbleAmp = 0;
    let wobbleT = 0;
    offs.push(
      ctx.onFrame((dt) => {
        if (wobbleAmp > 0.0005) {
          wobbleT += dt;
          const decay = Math.exp(-3 * wobbleT);
          tower.rotation.z = Math.sin(wobbleT * 13) * wobbleAmp * decay;
          tower.rotation.x = Math.cos(wobbleT * 11) * wobbleAmp * 0.7 * decay;
          if (wobbleT > 2) {
            wobbleAmp = 0;
            tower.rotation.set(0, 0, 0);
          }
        }
        ghost.scale.setScalar(1 + 0.05 * Math.sin(performance.now() / 240));
      }),
    );

    const hint = () =>
      ctx.bus.emit('hint:show', { text: `把${label}拖到盘子的虚影上 · ${placed}/${layers}`, gesture: 'drag' });

    const wobble = (offset: number) => {
      wobbleAmp = Math.min(0.12, offset * 2.5);
      wobbleT = 0;
    };

    const place = (item: THREE.Object3D, target: THREE.Vector3, q: number) => {
      item.removeFromParent();
      tower.add(item);
      const from = tower.worldToLocal(item.position.clone());
      item.position.copy(from);
      tweens.go(0.16, (v) => item.position.lerpVectors(from, target, v), () => {
        quality.push(q);
        placed++;
        syncGhost();
        if (q < 0.85) {
          wobble(1 - q);
          ctx.bus.emit('sfx:play', { id: 'bounce' });
          ctx.bus.emit('fx:pop', { text: '晃~', style: 'info' });
        } else {
          ctx.bus.emit('sfx:play', { id: 'snap' });
          ctx.bus.emit('fx:pop', { text: '稳!', style: 'good' });
        }
        if (placed >= layers) finish();
        else hint();
      });
    };

    const finish = () => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      tweens.dispose();
      ctx.bus.emit('hint:clear', {});
      const q = quality.reduce((a, b) => a + b, 0) / Math.max(1, quality.length);
      ctx.bus.emit('fx:pop', { text: q >= 0.9 ? '叠好了!' : '歪歪塔!', style: q >= 0.9 ? 'perfect' : 'good' });
      ctx.bus.emit('sfx:play', { id: 'step_done' });
      // Star tag: the demo dish's star id is 'stack5' (叠满 5 层) — D5 matches tags to star ids.
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality: q, tags: [`stack${layers}`] });
    };

    // Custom drag (core grab only handles props; dish items are module meshes).
    let dragging: THREE.Object3D | null = null;
    const screenPos = new THREE.Vector3();
    offs.push(
      ctx.input.onPointer((kindP) => {
        if (done || layers === 0) return;
        if (kindP === 'down') {
          let best: THREE.Object3D | null = null;
          let bd = 70;
          for (const item of items.slice(placed)) {
            item.getWorldPosition(screenPos);
            const s = ctx.world.toScreen(screenPos);
            if (!s.visible) continue;
            const d = Math.hypot(s.x - ctx.input.pointer.x, s.y - ctx.input.pointer.y);
            if (d < bd) {
              bd = d;
              best = item;
            }
          }
          if (best) dragging = best;
          return;
        }
        if (!dragging) return;
        const cp = ctx.input.counterPoint();
        if (kindP === 'move' && cp && ctx.input.pointer.down) {
          dragging.position.set(cp.x, ctx.world.counterTop + 0.09, cp.z);
          return;
        }
        if (kindP === 'up') {
          const item = dragging;
          dragging = null;
          if (!item) return;
          const d = cp ? Math.hypot(cp.x - plate.x, cp.z - plate.z) : 1;
          if (cp && d < ghostR * 1.9) {
            const offset = Math.min(d, ghostR);
            const q = Math.max(0.25, 1 - offset / 0.09);
            const target = new THREE.Vector3(cp.x - plate.x, slotY(placed), cp.z - plate.z);
            place(item, target, q);
          } else if (cp) {
            // missed the plate: it falls where it was released and can be picked up again
            const item2 = item;
            const ground = () => groundHeightAt(ctx, item2.position.x, item2.position.z) + 0.012;
            tweens.add(fallAndBounce(item2, ground, 1));
            ctx.bus.emit('fx:pop', { text: '掉啦，捡起来', style: 'info' });
          }
        }
      }),
    );
    offs.push(ctx.input.onKey('Space', () => finish())); // demo escape hatch
    if (ctx.flags.auto) {
      items.slice(0, layers).forEach((item, i) => {
        ctx.after(500 + i * 380, () => {
          if (done || placed !== i) return;
          const target = new THREE.Vector3((i % 2 ? 0.008 : -0.006), slotY(i), i % 3 ? 0.005 : -0.007);
          place(item, target, 0.94);
        });
      });
    }
    if (layers === 0) finish();
    else hint();

    return {
      dispose() {
        if (!done) ctx.bus.emit('hint:clear', {});
        ghost.removeFromParent();
        ghost.geometry.dispose();
        (ghost.material as THREE.Material).dispose();
        offs.forEach((f) => f());
      },
    };
  },
});
