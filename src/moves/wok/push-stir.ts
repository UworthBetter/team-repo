import * as THREE from 'three';
import { defineMove, type StepStart } from '@core/api';

/**
 * 推拌 — 麻婆豆腐's gentle push-stir (C-S1 prototype).
 *
 * Registered by the additive C prototype contract; available in its isolated dev scene.
 *
 * Hold inside the wok and drag slowly to nudge the tofu cubes around the pan —
 * accumulate STIR_NEED meters of gentle contact to finish. Drag too fast and every
 * cube the spatula touches crumbles (碎了, count against quality) — fun fail, the
 * dish still completes. Quality = intact fraction.
 */
const CUBES = 6;
const STIR_NEED = 1.8; // meters of gentle pushing inside the pan
const BREAK_SPEED = 2.2; // spatula m/s that crumbles tofu
const GENTLE_SPEED = 0.9; // spatula speed credited toward the stir
const RADIUS = 0.26; // wok radius cubes live in

type Cube = { mesh: THREE.Mesh; p: THREE.Vector3; v: THREE.Vector3; broken: boolean; spin: number };

export const pushStir = defineMove({
  id: 'push_stir',
  label: '推拌',
  start(ctx, step: StepStart) {
    const center = ctx.world.prop('wok')?.object.position.clone() ?? new THREE.Vector3(0, 0.9, -0.6);
    const top = center.y + 0.09;

    let progress = 0;
    let broken = 0;
    let done = false;
    let t = 0;
    let pushing = false;
    let autoLeg = 0;

    const offs: (() => void)[] = [];
    const root = ctx.world.root;
    const cubes: Cube[] = Array.from({ length: CUBES }, (_, i) => {
      const a = (i / CUBES) * Math.PI * 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshToonMaterial({ color: '#F3EEE2' }));
      mesh.position.set(center.x + Math.cos(a) * 0.15, top + 0.035, center.z + Math.sin(a) * 0.15);
      root.add(mesh);
      return { mesh, p: mesh.position.clone(), v: new THREE.Vector3(), broken: false, spin: 0 };
    });
    const spatula = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.02, 12), new THREE.MeshToonMaterial({ color: '#8A6B4D' }));
    spatula.rotation.x = Math.PI / 2;
    spatula.visible = false;
    root.add(spatula);

    const disposeMeshes = () => {
      for (const c of cubes) {
        root.remove(c.mesh);
        c.mesh.geometry.dispose();
        (c.mesh.material as THREE.Material).dispose();
      }
      root.remove(spatula);
      spatula.geometry.dispose();
      (spatula.material as THREE.Material).dispose();
    };

    const at = () => [center.x, top + 0.25, center.z] as [number, number, number];
    const hint = () =>
      ctx.bus.emit('hint:show', { text: `按住轻轻推豆腐翻拌 · ${Math.min(100, Math.round((progress / STIR_NEED) * 100))}%`, gesture: 'drag' });

    const cleanup = () => {
      offs.forEach((f) => f());
      disposeMeshes();
    };

    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      const intact = (CUBES - broken) / CUBES;
      const quality = Math.max(0.2, 0.3 + intact * 0.7);
      ctx.bus.emit('hint:clear', {});
      if (broken === 0) {
        ctx.bus.emit('fx:pop', { text: '完整嫩滑!', style: 'perfect', at: at() });
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else if (broken <= 2) {
        ctx.bus.emit('fx:pop', { text: '还行…', style: 'good', at: at() });
        ctx.bus.emit('sfx:play', { id: 'step_done' });
      } else {
        ctx.bus.emit('fx:pop', { text: '炒成渣了…', style: 'oops', at: at() });
        ctx.bus.emit('sfx:play', { id: 'oops' });
      }
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags: [] });
    };

    /* ---------------- pushing ---------------- */

    let last: THREE.Vector3 | null = null;
    let lastT = 0;
    let speedSm = 0;

    function touch(lineFrom: THREE.Vector3, lineTo: THREE.Vector3, speed: number) {
      // Nudge (or crumble) every cube near the spatula segment.
      const seg = lineTo.clone().sub(lineFrom);
      const len = Math.max(seg.length(), 1e-4);
      for (const c of cubes) {
        const rel = c.p.clone().sub(lineFrom);
        const along = Math.max(0, Math.min(len, rel.dot(seg) / len));
        const near = rel.sub(seg.clone().multiplyScalar(along / len)).length();
        if (near > 0.12) continue;
        if (speed > BREAK_SPEED && !c.broken) {
          c.broken = true;
          broken++;
          c.mesh.scale.setScalar(0.55);
          (c.mesh.material as THREE.MeshToonMaterial).color.set('#D8C9A8');
          c.v.add(seg.clone().normalize().multiplyScalar(0.25));
          ctx.bus.emit('sfx:play', { id: 'bounce' });
          ctx.bus.emit('fx:pop', { text: '碎了!', style: 'oops', at: at() });
        } else if (speed <= BREAK_SPEED) {
          c.v.add(seg.clone().normalize().multiplyScalar(Math.min(speed, GENTLE_SPEED) * 2.2));
        }
      }
    }

    function onPointer(kind: 'down' | 'move' | 'up') {
      if (done) return;
      if (kind === 'down') {
        const cp = ctx.input.counterPoint();
        if (!cp || Math.hypot(cp.x - center.x, cp.z - center.z) > RADIUS + 0.06) return;
        pushing = true;
        last = null;
        lastT = performance.now();
        speedSm = 0;
        spatula.visible = true;
        return;
      }
      if (kind === 'up') {
        pushing = false;
        spatula.visible = false;
        return;
      }
      if (!pushing) return;
      const cp = ctx.input.counterPoint();
      if (!cp) return;
      cp.y = top;
      if (Math.hypot(cp.x - center.x, cp.z - center.z) > RADIUS) {
        last = null; // leaving the pan breaks the stroke, not the tofu
        return;
      }
      spatula.position.set(cp.x, top + 0.02, cp.z);
      const now = performance.now();
      if (last) {
        const seg = cp.clone().sub(last);
        const dt = Math.max(4, now - lastT) / 1000;
        // Smooth the speed: direction reversals spike instantaneous velocity and would
        // crumble tofu on every stroke turn — judge by the averaged stroke speed.
        speedSm += (seg.length() / dt - speedSm) * 0.45;
        touch(last, cp, speedSm);
        progress = Math.min(STIR_NEED, progress + Math.min(speedSm, GENTLE_SPEED) * dt);
      }
      last = cp.clone();
      lastT = now;
    }

    offs.push(ctx.input.onPointer(onPointer));
    offs.push(
      ctx.input.onKey('KeyO', () => {
        if (done) return;
        broken = CUBES;
        cubes.forEach((c) => {
          c.broken = true;
          c.mesh.scale.setScalar(0.55);
        });
        finish();
      }),
    );
    offs.push(
      ctx.bus.on('kitchen:enter', () => {
        if (done) return;
        done = true;
        cleanup();
      }),
    );

    let lastHintStep = -1;
    offs.push(
      ctx.onFrame((dt: number) => {
        t += dt;

        // ?auto: an invisible spatula sweeps slow legs across the pan, never breaking tofu.
        if (ctx.flags.auto && !done) {
          const legs = Math.ceil(STIR_NEED / 0.5);
          if (autoLeg < legs) {
            const phase = (t * 0.9 - autoLeg) / 1.1;
            if (phase >= 1) autoLeg++;
            else if (phase >= 0) {
              const z = center.z - 0.16 + (autoLeg % 2 === 0 ? 1 : -1) * 0 + (phase - 0.5) * 0.4;
              const from = new THREE.Vector3(center.x - 0.2, top, center.z - 0.16 + (autoLeg % 3) * 0.14);
              const to = new THREE.Vector3(center.x + 0.2, top, z * 0.5 + from.z * 0.5);
              if (Math.floor(t * 60) % 2 === 0) touch(from, to, 0.3);
              spatula.visible = true;
              spatula.position.lerpVectors(from, to, Math.max(0, Math.min(1, phase)));
            }
          } else finish();
        }

        // cube physics: friction, wall bounce, gentle tumble
        for (const c of cubes) {
          c.p.addScaledVector(c.v, dt);
          c.v.multiplyScalar(Math.exp(-dt * 4.5));
          const rel = c.p.clone().sub(center);
          rel.y = 0;
          if (rel.length() > RADIUS - 0.045) {
            rel.setLength(RADIUS - 0.045);
            c.v.multiplyScalar(-0.4);
          }
          c.p.x = center.x + rel.x;
          c.p.z = center.z + rel.z;
          c.spin += c.v.length() * dt * 6;
          c.mesh.position.set(c.p.x, top + 0.035, c.p.z);
          c.mesh.rotation.set(Math.sin(c.spin) * 0.4, c.spin * 0.3, Math.cos(c.spin * 0.7) * 0.3);
        }

        // Manual path: enough gentle pushing finishes the stir.
        if (!ctx.flags.auto && !done && progress >= STIR_NEED) finish();
        if (!ctx.flags.auto && !done) {
          const stepQ = Math.min(4, Math.floor((progress / STIR_NEED) * 4));
          if (stepQ !== lastHintStep) {
            lastHintStep = stepQ;
            hint();
          }
        }
      }),
    );

    if (!ctx.flags.auto) hint();
    return {
      dispose() {
        if (done) return;
        done = true;
        cleanup();
      },
    };
  },
});
