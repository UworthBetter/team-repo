import * as THREE from 'three';
import { defineMove } from '@core/api';
import { findDishItems } from './dish-items';
import { createTweens, fallAndBounce, groundHeightAt } from './tween';
import { effectOf, watchInstalled } from './equipment';

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
    const ghostR = Math.max(0.03, Number(step.params.ghostSize ?? 0.15));
    const layerH = Math.max(0.003, Number(step.params.layerHeight ?? 0.026));
    const spread = step.params.layout === 'fan' ? Number(step.params.spread ?? 0.03) : 0;
    let layers = Math.max(1, Number(step.params.layers ?? 3));
    let done = false;
    let placed = 0;
    const quality: number[] = [];
    const offs: (() => void)[] = [];
    const tweens = createTweens(ctx);
    const installed = watchInstalled(ctx, offs);
    const snapMultiplier = Number(effectOf(ctx, installed, 'celadon_bowl', 'stack')?.snapRadius ?? 1);

    let items = findDishItems(ctx, step.dishId, kind);
    if (step.params.bundle === true && items.length) {
      ctx.world.root.updateMatrixWorld(true);
      const bounds = new THREE.Box3();
      items.forEach((item) => bounds.expandByObject(item));
      const bundle = new THREE.Group();
      bundle.position.copy(bounds.getCenter(new THREE.Vector3()));
      bundle.userData.dishItem = { dishId: step.dishId, kind: `${kind}_bundle`, order: 0 };
      ctx.world.root.add(bundle);
      for (const item of items) {
        bundle.attach(item);
        delete item.userData.dishItem;
      }
      items = [bundle];
    }
    const placedItems = new Set<THREE.Object3D>();
    let placing = false;
    // Fewer items than layers would dead-end the dish; clamp (B9 tuning keeps them equal).
    layers = Math.min(layers, items.length);
    const snapId = typeof step.params.snapId === 'string' ? step.params.snapId : 'plate_center';
    const plate = ctx.world.snapPos(snapId) ?? new THREE.Vector3(1.5, 0.925, -0.65);

    const tower = new THREE.Group();
    tower.position.set(plate.x, plate.y, plate.z);
    ctx.world.root.add(tower);

    const ghost = new THREE.Mesh(
      new THREE.CylinderGeometry(ghostR, ghostR, 0.01, 28),
      new THREE.MeshBasicMaterial({ color: '#2a8c9a', transparent: true, opacity: 0.4, depthWrite: false }),
    );
    ghost.renderOrder = 2;
    tower.add(ghost);

    const slotY = (i: number) => 0.023 + (spread ? 0 : i * layerH);
    const targetAt = (i: number) => new THREE.Vector3((i - (layers - 1) / 2) * spread, slotY(i), 0);
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
      ctx.bus.emit('hint:show', { text: `把${label}拖到虚影上 · ${placed}/${layers}`, gesture: 'drag' });

    const wobble = (offset: number) => {
      wobbleAmp = Math.min(0.12, offset * 2.5);
      wobbleT = 0;
    };

    const place = (item: THREE.Object3D, target: THREE.Vector3, q: number) => {
      placing = true;
      placedItems.add(item);
      tower.attach(item);
      const from = item.position.clone();
      tweens.go(0.16, (v) => item.position.lerpVectors(from, target, v), () => {
        quality.push(q);
        placed++;
        placing = false;
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
        else {
          hint();
          if (ctx.flags.auto) offs.push(ctx.after(220, autoPlace));
        }
      });
    };

    function autoPlace() {
      if (done || placing || placed >= layers) return;
      const item = items[placed];
      if (item) place(item, targetAt(placed), 0.94);
    }

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
      const successTags = q >= 0.9 && Array.isArray(step.params.successTags)
        ? step.params.successTags.filter((tag): tag is string => typeof tag === 'string') : [];
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality: q, tags: [`stack${layers}`, ...successTags] });
    };

    // Custom drag (core grab only handles props; dish items are module meshes).
    let dragging: THREE.Object3D | null = null;
    const screenPos = new THREE.Vector3();
    offs.push(
      ctx.input.onPointer((kindP) => {
        if (done || layers === 0 || placing) return;
        if (kindP === 'down') {
          let best: THREE.Object3D | null = null;
          let bd = 70;
          for (const item of items.filter((candidate) => !placedItems.has(candidate))) {
            item.getWorldPosition(screenPos);
            const s = ctx.world.toScreen(screenPos);
            if (!s.visible) continue;
            const d = Math.hypot(s.x - ctx.input.pointer.x, s.y - ctx.input.pointer.y);
            if (d < bd) {
              bd = d;
              best = item;
            }
          }
          if (best) {
            ctx.world.root.attach(best);
            dragging = best;
          }
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
          if (cp && d < ghostR * 1.9 * snapMultiplier) {
            const offset = Math.min(d, ghostR);
            const q = Math.max(0.25, 1 - offset / 0.09);
            // 落点取盘心正上方（松手偏移只影响评分与摇晃），煎饼塔始终叠在盘子中心
            const target = spread ? targetAt(placed) : new THREE.Vector3(0, slotY(placed), 0);
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
    if (ctx.flags.auto) {
      // Chain placements after their animation completes; a slow frame must not drop a layer.
      offs.push(ctx.after(500, autoPlace));
    }
    if (layers === 0) finish();
    else hint();

    return {
      dispose() {
        if (!done) ctx.bus.emit('hint:clear', {});
        done = true;
        ghost.removeFromParent();
        ghost.geometry.dispose();
        (ghost.material as THREE.Material).dispose();
        offs.forEach((f) => f());
        tweens.dispose();
      },
    };
  },
});
