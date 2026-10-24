import * as THREE from 'three';
import { defineMove, type Ctx, type PropHandle } from '@core/api';
import { createPointerSpeed } from './pointer-speed';
import { createTweens, fallAndBounce, groundHeightAt } from './tween';

/**
 * 打蛋 — sketch board 3 panel A (B1). Hold an egg over the bowl-rim snap and flick down to
 * crack it: zigzag crack line + 咔! → drag left/right to pull the two shell halves apart →
 * the yolk drops in. A flick above the second threshold drops the whole egg into the bowl
 * (噗通, step:oops); the player grabs it out and keeps going. Quality: 0.9 clean, 0.4 after
 * an oops; tag 'no_shell' only on a clean run (B6 star).
 */
const FLICK = 750; // px/s downward = a clean crack
const TOO_HARD = 2000; // px/s downward = the whole egg slips in
const PULL_TARGET = 0.13; // meters of shell separation before the yolk drops

export const eggCrack = defineMove({
  id: 'egg_crack',
  label: '打蛋',
  start(ctx, step) {
    const need = Math.max(1, Number(step.params.eggs ?? 1));
    let cracked = 0;
    let done = false;
    let disposed = false;
    let anyOops = false;
    const offs: (() => void)[] = [];
    const visuals = new Set<THREE.Object3D>();
    const tweens = createTweens(ctx);
    const speed = createPointerSpeed(ctx);
    offs.push(speed.dispose);

    let eggId: string | null = null;
    let eggAnchor = new THREE.Vector3();
    let phase: 'whole' | 'cracked' | 'in-bowl' = 'whole';
    let separation = 0;
    let halves: [THREE.Mesh, THREE.Mesh] | null = null;
    const crackLines: THREE.Line[] = [];

    const track = (o: THREE.Object3D) => {
      visuals.add(o);
      ctx.world.root.add(o);
    };

    const removeVisual = (o: THREE.Object3D) => {
      visuals.delete(o);
      o.removeFromParent();
      o.traverse((m) => {
        if (m instanceof THREE.Mesh || m instanceof THREE.Line) {
          m.geometry.dispose();
          const mat = m.material as THREE.Material | THREE.Material[];
          (Array.isArray(mat) ? mat : [mat]).forEach((x) => x.dispose());
        }
      });
    };

    const hintCrack = () =>
      ctx.bus.emit('hint:show', { text: `拿蛋到碗沿上，向下快甩 · ${cracked}/${need}`, gesture: 'flick-down' });
    const hintPull = () => ctx.bus.emit('hint:show', { text: '左右拖开两半蛋壳', gesture: 'pull-apart' });

    /** A clean crack on the held egg: zigzag line on the shell, halves appear once pulled apart. */
    const crackEgg = (egg: PropHandle) => {
      phase = 'cracked';
      separation = 0;
      eggAnchor.copy(egg.object.position);
      egg.object.visible = false;
      ctx.bus.emit('sfx:play', { id: 'egg_crack', at: [eggAnchor.x, eggAnchor.y, eggAnchor.z] });
      ctx.bus.emit('fx:pop', { text: '咔!', style: 'good', at: [eggAnchor.x, eggAnchor.y + 0.08, eggAnchor.z] });

      const r = Math.max(egg.size[0], egg.size[2]) / 2;
      const zig: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        zig.push(new THREE.Vector3(Math.cos(a) * r * 1.05, i % 2 ? 0.012 : -0.012, Math.sin(a) * r * 1.05));
      }
      const crackLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(zig),
        new THREE.LineBasicMaterial({ color: '#3b2a20' }),
      );
      crackLine.position.copy(eggAnchor);
      track(crackLine);
      crackLines.push(crackLine);

      const shellGeo = new THREE.SphereGeometry(r, 14, 8, 0, Math.PI);
      const shellMat = new THREE.MeshToonMaterial({ color: '#FFF7EA', side: THREE.DoubleSide });
      const left = new THREE.Mesh(shellGeo, shellMat);
      const right = new THREE.Mesh(shellGeo, shellMat);
      left.rotation.y = Math.PI / 2;
      right.rotation.y = -Math.PI / 2;
      for (const s of [left, right]) {
        s.position.copy(eggAnchor);
        s.visible = false;
        track(s);
      }
      halves = [left, right];
      hintPull();
    };

    const setSeparation = (v: number) => {
      separation = v;
      if (!halves) return;
      const [left, right] = halves;
      left.visible = right.visible = v > 0.005;
      left.position.set(eggAnchor.x - v / 2, eggAnchor.y, eggAnchor.z);
      right.position.set(eggAnchor.x + v / 2, eggAnchor.y, eggAnchor.z);
      left.rotation.y = Math.PI / 2 - v * 4;
      right.rotation.y = -Math.PI / 2 + v * 4;
    };

    /** Shells drop to the counter, yolk falls into the bowl — one egg done. */
    const completeEgg = () => {
      while (crackLines.length) removeVisual(crackLines.pop()!);
      if (halves) {
        for (const s of halves) {
          const ground = groundHeightAt(ctx, s.position.x, s.position.z) + 0.01;
          tweens.add(fallAndBounce(s, () => ground, 1));
          tweens.go(1.4, (v) => {
            const m = s.material as THREE.MeshToonMaterial;
            m.transparent = true;
            m.opacity = 1 - Math.max(0, v * 2 - 1);
          }, () => removeVisual(s));
        }
        halves = null;
      }
      const yolk = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 16, 12),
        new THREE.MeshToonMaterial({ color: '#F4C842' }),
      );
      const bowl = ctx.world.snapPos('bowl_rim') ?? eggAnchor;
      yolk.position.set(eggAnchor.x, eggAnchor.y, eggAnchor.z);
      track(yolk);
      tweens.go(0.35, (v) => {
        // rest just above the bowl's greybox top cap so the yolk stays visible
        yolk.position.y = eggAnchor.y + (bowl.y - 0.012 - eggAnchor.y) * v;
        yolk.scale.setScalar(1 + 0.25 * Math.sin(v * Math.PI));
      }, () => {
        ctx.bus.emit('sfx:play', { id: 'plop', at: [bowl.x, bowl.y, bowl.z] });
      });
      cracked++;
      eggId = null;
      phase = 'whole';
      if (cracked >= need) finish();
      else hintCrack();
    };

    /** Flicked too hard: the whole egg slips into the bowl; fish it out to continue. */
    const dropWholeEgg = () => {
      anyOops = true;
      const egg = eggId ? ctx.world.prop(eggId) : null;
      if (egg) {
        const bowl = ctx.world.snapPos('bowl_rim');
        if (bowl) egg.object.position.set(bowl.x, bowl.y - 0.05, bowl.z);
      }
      phase = 'in-bowl';
      ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'flicked_too_hard' });
      ctx.bus.emit('sfx:play', { id: 'plop' });
      ctx.bus.emit('fx:pop', { text: '噗通!', style: 'oops', at: [eggAnchor.x, eggAnchor.y + 0.05, eggAnchor.z] });
      ctx.bus.emit('hint:show', { text: '整只掉进去了…把蛋捞出来再试', gesture: 'drag' });
    };

    const finish = () => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      tweens.dispose();
      ctx.bus.emit('hint:clear', {});
      const quality = anyOops ? 0.4 : 0.9;
      ctx.bus.emit('fx:pop', {
        text: quality >= 0.9 ? '打好蛋!' : '蛋打了…',
        style: quality >= 0.9 ? 'perfect' : 'oops',
      });
      ctx.bus.emit('sfx:play', { id: 'step_done' });
      ctx.bus.emit('step:complete', {
        dishId: step.dishId,
        stepId: step.stepId,
        quality,
        tags: anyOops ? [] : ['no_shell'],
      });
    };

    offs.push(
      ctx.bus.on('snap:enter', ({ snapId, objectId }) => {
        if (snapId === 'bowl_rim' && phase === 'whole' && ctx.world.prop(objectId)?.kind === 'egg') eggId = objectId;
      }),
    );
    offs.push(
      ctx.bus.on('snap:exit', ({ snapId, objectId }) => {
        if (snapId === 'bowl_rim' && objectId === eggId && phase === 'whole') eggId = null;
      }),
    );
    // Fish the sunken egg out: releasing it anywhere but the rim puts it back by the carton.
    offs.push(
      ctx.bus.on('grab:end', ({ objectId, snappedTo }) => {
        if (phase !== 'in-bowl' || objectId !== eggId || snappedTo === 'bowl_rim') return;
        ctx.world.resetProp(objectId);
        phase = 'whole';
        eggId = null;
        ctx.bus.emit('fx:pop', { text: '捞回来了', style: 'info' });
        hintCrack();
      }),
    );

    offs.push(
      ctx.input.onPointer((kind) => {
        if (done) return;
        if (kind === 'move' && phase === 'whole' && eggId && ctx.input.pointer.down) {
          const vy = speed.vy();
          if (vy > TOO_HARD) dropWholeEgg();
          else if (vy > FLICK) {
            const egg = ctx.world.prop(eggId);
            if (egg) crackEgg(egg);
          }
        }
        if (kind === 'move' && phase === 'cracked' && ctx.input.pointer.down) {
          const cp = ctx.input.counterPoint();
          if (cp) setSeparation(Math.min(PULL_TARGET, Math.abs(cp.x - eggAnchor.x) * 1.4));
          if (separation >= PULL_TARGET) completeEgg();
        }
      }),
    );
    if (ctx.flags.auto) {
      const eggs = ctx.world.propsOfKind('egg');
      eggs.forEach((egg, i) => {
        ctx.after(700 + i * 1200, () => {
          if (done || !egg.object.visible) return;
          const bowl = ctx.world.snapPos('bowl_rim');
          if (bowl) egg.object.position.set(bowl.x, bowl.y + 0.02, bowl.z);
          crackEgg(egg);
          tweens.go(0.4, (v) => setSeparation(PULL_TARGET * v), () => completeEgg());
        });
      });
    }
    hintCrack();

    return {
      dispose() {
        if (disposed) return;
        disposed = true;
        done = true;
        offs.forEach((f) => f());
        tweens.dispose();
        visuals.forEach((o) => removeVisual(o));
        ctx.bus.emit('hint:clear', {});
      },
    };
  },
});
