import * as THREE from 'three';
import { defineMove } from '@core/api';
import type { MetaState } from '@contracts/types';

/**
 * slice_lines (B7) — guided knife work shared by the regional kitchens. N dashed guide lines
 * across the target block; each stroke landing near a guide splits off one sheet with a small
 * gap. Quality = mean straightness × spacing evenness. The first cut dolleys in with
 * camera:push (A3) for a blade close-up, then glides back with camera:release.
 */
export const sliceLines = defineMove({
  id: 'slice_lines',
  label: '刀工',
  start(ctx, step) {
    const strokes = Math.max(1, Number(step.params.strokes ?? 4));
    const axis = step.params.axis === 'z' ? 'z' : 'x';
    const latestMeta = [...ctx.bus.log].reverse().find((event) => event.name === 'meta:state')?.payload as MetaState | undefined;
    const sharpening = latestMeta?.installed.includes('whetstone') ? ctx.content.equipment.get('whetstone')?.effects.slice_lines as { tolerance?: number } | undefined : undefined;
    const tol = 0.035 * (sharpening?.tolerance ?? 1); // meters: allowed distance from the guide
    const minTravel = 0.07; // meters: a stroke must travel along the guide direction
    const sheetKind = typeof step.params.sheetKind === 'string' ? step.params.sheetKind : 'slice_sheet';
    const sheetColor = typeof step.params.sheetColor === 'string' ? step.params.sheetColor : '#FFF8F0';
    let done = false;
    let disposed = false;
    let cuts = 0;
    const strokeQ: number[] = [];
    const offs: (() => void)[] = [];

    // Target block: a kitchen prop (params.target) or an explicit box from params.
    const prop = typeof step.params.target === 'string' ? ctx.world.prop(step.params.target) : undefined;
    const targets: THREE.Object3D[] = [];
    if (typeof step.params.targetKind === 'string') {
      ctx.world.root.traverse((object) => {
        const tag = object.userData.dishItem as { dishId?: string; kind?: string } | undefined;
        if (tag?.dishId === step.dishId && tag.kind === step.params.targetKind) targets.push(object);
      });
    }
    ctx.world.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3();
    targets.forEach((object) => bounds.expandByObject(object));
    const center = targets.length ? bounds.getCenter(new THREE.Vector3()) : prop
      ? prop.object.position.clone()
      : new THREE.Vector3(...(Array.isArray(step.params.blockCenter) ? (step.params.blockCenter as [number, number, number]) : [0, 0.9, 0]));
    if (targets.length) center.y = bounds.min.y;
    const size = targets.length ? bounds.getSize(new THREE.Vector3()).toArray() : prop ? prop.size : (Array.isArray(step.params.blockSize) ? (step.params.blockSize as [number, number, number]) : [0.12, 0.11, 0.12]);
    const topY = center.y + size[1] + 0.006;
    const wasGrabbable = prop?.grabbable;
    if (prop) prop.grabbable = false; // the ingredient stays put while you slice it

    // Guide lines: dashed marks across the block top, one per planned cut.
    const lat = axis === 'x' ? 'x' : 'z';
    const along = axis === 'x' ? 'z' : 'x';
    const span = axis === 'x' ? size[2] : size[0];
    const along0 = (axis === 'x' ? center.z : center.x) - span / 2 - 0.04;
    const along1 = (axis === 'x' ? center.z : center.x) + span / 2 + 0.04;
    interface Guide {
      at: number;
      line: THREE.Line;
      used: boolean;
    }
    const guides: Guide[] = [];
    for (let i = 0; i < strokes; i++) {
      const at = (axis === 'x' ? center.x : center.z) - size[lat === 'x' ? 0 : 2] / 2 + ((i + 1) * size[lat === 'x' ? 0 : 2]) / (strokes + 1);
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      a.y = topY;
      a[lat] = at;
      a[along] = along0;
      b.y = topY;
      b[lat] = at;
      b[along] = along1;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineDashedMaterial({ color: '#2a8c9a', dashSize: 0.022, gapSize: 0.016 }),
      );
      line.computeLineDistances();
      ctx.world.root.add(line);
      guides.push({ at, line, used: false });
    }

    const hint = () =>
      ctx.bus.emit('hint:show', { text: `沿虚线慢慢下刀 · ${cuts}/${strokes}`, gesture: 'drag' });

    /** One sheet, offset outward along the slicing axis with a small gap. */
    const cutSheet = (at: number, straight: number) => {
      strokeQ.push(straight);
      cuts++;
      const g = guides.find((x) => x.at === at);
      if (g) {
        g.used = true;
        g.line.removeFromParent();
        g.line.geometry.dispose();
        (g.line.material as THREE.Material).dispose();
      }
      const thickness = (size[lat === 'x' ? 0 : 2] / (strokes + 1)) * 0.82;
      const sheet = new THREE.Mesh(
        new THREE.BoxGeometry(
          axis === 'x' ? thickness : size[0] * 0.9,
          Number(step.params.sheetHeight ?? size[1] * 0.9),
          axis === 'x' ? size[2] * 0.9 : thickness,
        ),
        new THREE.MeshToonMaterial({ color: sheetColor }),
      );
      const outward = size[lat === 'x' ? 0 : 2] / 2 + 0.02 + cuts * (thickness + 0.008);
      sheet.position.copy(center);
      sheet.position[lat] += outward;
      sheet.position.y = center.y + (size[1] * 0.9) / 2;
      // Same per-dish item convention as src/moves/home/dish-items.ts (no cross-module import).
      sheet.userData.dishItem = { dishId: step.dishId, kind: sheetKind, order: cuts };
      ctx.world.root.add(sheet);
      if (prop) prop.object.scale[lat] = Math.max(0.4, 1 - (0.55 * cuts) / strokes);

      if (cuts === 1) {
        // A3: slow-motion blade close-up on the first cut, then glide back.
        ctx.bus.emit('camera:push', { at: [sheet.position.x, topY, sheet.position.z], zoom: 1.6, ms: 700 });
        offs.push(ctx.after(900, () => ctx.bus.emit('camera:release', {})));
      }
      ctx.bus.emit('sfx:play', { id: 'slice', at: [sheet.position.x, topY, sheet.position.z] });
      ctx.bus.emit('fx:pop', { text: '唰!', style: 'good', at: [sheet.position.x, topY + 0.05, sheet.position.z] });
      if (cuts >= strokes) finish();
      else hint();
    };

    const finish = () => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      ctx.bus.emit('hint:clear', {});
      // Card formula: mean straightness × spacing evenness of the consumed guides.
      const meanStraight = strokeQ.reduce((a, b) => a + b, 0) / Math.max(1, strokeQ.length);
      const used = guides.filter((g) => g.used).map((g) => g.at);
      let evenness = 1;
      if (used.length >= 3) {
        const gaps: number[] = [];
        for (let i = 1; i < used.length; i++) gaps.push(used[i]! - used[i - 1]!);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const variance = gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length;
        evenness = Math.max(0, 1 - Math.sqrt(variance) / Math.max(mean, 1e-4) / 0.8);
      }
      const q = Math.max(0.15, Math.min(1, meanStraight * evenness));
      if (cuts > 0) {
        if (prop) prop.object.visible = false;
        targets.forEach((object) => { object.visible = false; });
      }
      ctx.bus.emit('fx:pop', { text: q >= 0.85 ? '好刀工!' : '切好了', style: q >= 0.85 ? 'perfect' : 'good' });
      ctx.bus.emit('sfx:play', { id: 'step_done' });
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality: q, tags: q >= 0.85 ? ['even_threads'] : [] });
    };

    // One stroke = pointer down → travel along the guides → up. Evaluated on release.
    let path: THREE.Vector3[] = [];
    offs.push(
      ctx.input.onPointer((kind) => {
        if (done) return;
        if (kind === 'down') path = [];
        if (kind === 'move' && ctx.input.pointer.down) {
          const cp = ctx.input.counterPoint();
          if (cp && (!path.length || cp.distanceTo(path[path.length - 1]!) > 0.008)) path.push(cp);
          return;
        }
        if (kind !== 'up' || path.length < 3) return;
        const first = path[0]!;
        const lastP = path[path.length - 1]!;
        const travel = Math.abs(lastP[along] - first[along]);
        if (travel < minTravel) {
          ctx.bus.emit('fx:pop', { text: '顺着虚线滑刀', style: 'info' });
          return;
        }
        // Lateral position of the stroke and how steadily it stayed there (straightness).
        const latMean = path.reduce((a, p) => a + p[lat], 0) / path.length;
        const selfDev = path.reduce((a, p) => a + Math.abs(p[lat] - latMean), 0) / path.length;
        let best: Guide | null = null;
        let bd = tol;
        for (const g of guides) {
          if (g.used) continue;
          const d = Math.abs(g.at - latMean);
          if (d < bd) {
            bd = d;
            best = g;
          }
        }
        if (!best) {
          ctx.bus.emit('fx:pop', { text: '刀要落在虚线上', style: 'info' });
          return;
        }
        const aimDev = bd + selfDev; // aim error + wobble both read as a crooked cut
        cutSheet(best.at, Math.max(0, 1 - aimDev / tol));
      }),
    );
    if (ctx.flags.auto) {
      guides.forEach((g, i) => offs.push(ctx.after(500 + i * 450, () => !done && !g.used && cutSheet(g.at, 0.95))));
    }
    hint();

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        if (!done) ctx.bus.emit('hint:clear', {});
        done = true;
        ctx.bus.emit('camera:release', {}); // no-op unless the close-up is still active
        if (prop) prop.grabbable = wasGrabbable ?? true;
        for (const g of guides) {
          g.line.removeFromParent();
          g.line.geometry.dispose();
          (g.line.material as THREE.Material).dispose();
        }
        offs.forEach((f) => f());
      },
    };
  },
});
