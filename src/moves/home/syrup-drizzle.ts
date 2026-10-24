import * as THREE from 'three';
import { defineMove } from '@core/api';
import { effectOf, watchInstalled } from './equipment';
import { findDishItems } from './dish-items';

/**
 * 淋酱 (B5). Hold to extrude an amber line that follows the pointer over the stack top;
 * score = coverage of the top face. With the syrup_pot installed (effects.syrup_drizzle
 * .patterns), a spiral guide appears — staying near it earns the pattern bonus.
 */
const R = 0.16; // drizzle zone radius over the stack
const GRID = 7; // coverage grid (7×7 cells over the zone)
const SPIRAL_TURNS = 2.5;

export const syrupDrizzle = defineMove({
  id: 'syrup_drizzle',
  label: '淋酱',
  start(ctx, step) {
    let done = false;
    const offs: (() => void)[] = [];
    const installed = watchInstalled(ctx, offs);

    const plate = ctx.world.snapPos('plate_center') ?? new THREE.Vector3(1.5, 0.925, -0.65);
    const layers = findDishItems(ctx, step.dishId, 'pancake').length;
    const topY = plate.y + 0.03 + layers * 0.026;
    const cell = (2 * R) / GRID;
    const covered = new Set<string>();

    // Spiral guide, shown only with the syrup pot (pattern mode).
    const spiral: THREE.Vector3[] = [];
    for (let i = 0; i <= 90; i++) {
      const t = i / 90;
      const r = 0.025 + (0.12 - 0.025) * t;
      const a = t * SPIRAL_TURNS * Math.PI * 2;
      spiral.push(new THREE.Vector3(plate.x + r * Math.cos(a), topY + 0.006, plate.z + r * Math.sin(a)));
    }
    const fx = effectOf(ctx, installed, 'syrup_pot', 'syrup_drizzle');
    const patternMode = Boolean(fx?.patterns);
    if (patternMode) {
      const guide = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(spiral),
        new THREE.LineDashedMaterial({ color: '#D98A1E', dashSize: 0.02, gapSize: 0.016, transparent: true, opacity: 0.6 }),
      );
      guide.computeLineDistances();
      ctx.world.root.add(guide);
      offs.push(() => {
        guide.removeFromParent();
        guide.geometry.dispose();
        (guide.material as THREE.Material).dispose();
      });
    }

    const drops: THREE.Mesh[] = [];
    let last: THREE.Vector3 | null = null;
    let points = 0;
    let patternHits = 0;

    const coverage = () => covered.size / (GRID * GRID);

    const addPoint = (p: THREE.Vector3) => {
      if (last && p.distanceTo(last) < 0.014) return;
      last = p.clone();
      points++;
      const gx = Math.floor((p.x - (plate.x - R)) / cell);
      const gz = Math.floor((p.z - (plate.z - R)) / cell);
      if (gx >= 0 && gx < GRID && gz >= 0 && gz < GRID) covered.add(`${gx},${gz}`);
      if (patternMode) {
        let md = Infinity;
        for (const s of spiral) {
          const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
          if (d < md) md = d;
        }
        if (md < 0.03 * 0.03) patternHits++;
      }
      if (drops.length < 140) {
        const d = new THREE.Mesh(
          new THREE.SphereGeometry(0.011, 8, 6),
          new THREE.MeshToonMaterial({ color: '#D98A1E' }),
        );
        d.position.set(p.x, topY, p.z);
        drops.push(d);
        ctx.world.root.add(d);
      }
      ctx.bus.emit('hint:show', {
        text: `按住在塔顶绕圈淋酱 · 覆盖 ${Math.round(coverage() * 100)}%`,
        gesture: 'drag',
      });
    };

    const finish = () => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      ctx.bus.emit('hint:clear', {});
      const patternOK = patternMode && points > 0 && patternHits / points >= 0.6;
      const q = Math.min(1, coverage() / 0.75) + (patternOK ? 0.08 : 0);
      ctx.bus.emit('fx:pop', {
        text: patternOK ? '花纹完美!' : coverage() > 0.5 ? '甜!' : '淋上了',
        style: q >= 0.9 ? 'perfect' : 'good',
      });
      ctx.bus.emit('sfx:play', { id: 'step_done' });
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality: q, tags: patternOK ? ['pattern'] : [] });
    };

    offs.push(
      ctx.input.onPointer((kind) => {
        if (done) return;
        if (kind === 'up') {
          if (points >= 10 && coverage() >= 0.25) finish();
          else ctx.bus.emit('hint:show', { text: '再多绕几圈，覆盖整个塔顶', gesture: 'drag' });
          return;
        }
        if (kind !== 'move' || !ctx.input.pointer.down) return;
        const cp = ctx.input.counterPoint();
        if (!cp) return;
        if (Math.hypot(cp.x - plate.x, cp.z - plate.z) < R) addPoint(new THREE.Vector3(cp.x, topY, cp.z));
      }),
    );
    if (ctx.flags.auto) {
      spiral.forEach((p, i) => ctx.after(400 + i * 12, () => !done && addPoint(p)));
      ctx.after(400 + spiral.length * 12 + 200, () => !done && finish());
    }

    return {
      dispose() {
        done = true;
        if (!done) ctx.bus.emit('hint:clear', {});
        for (const d of drops) {
          d.removeFromParent();
          d.geometry.dispose();
          (d.material as THREE.Material).dispose();
        }
        offs.forEach((f) => f());
      },
    };
  },
});
