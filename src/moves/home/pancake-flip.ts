import * as THREE from 'three';
import { defineMove } from '@core/api';
import { watchInstalled, effectOf } from './equipment';
import { createPointerSpeed } from './pointer-speed';
import { createTweens, fallAndBounce } from './tween';
import { spawnDishItem } from './dish-items';

/**
 * 翻面 (B3, sketch board 3 panel B). A pancake disc cooks in the pan: bubbles + darkening
 * color are the ready cue (no meters). Hold and flick up → scripted arc with a 180° flip,
 * landing with 啪. Flipping early or late lowers quality; a flick that is too strong sticks
 * the pancake to the ceiling for 1 s, then it drops and bounces (step:oops). Repeats
 * params.count times; landed pancakes persist as dish items for the stack step (B4).
 */
const FLICK = 900; // px/s upward = a flip attempt
const TOO_HARD = 2200; // px/s upward = sticks to the ceiling
const READY = 5; // seconds from raw to ready (card: 4–6 s)
const COOK_COLORS = ['#F7E3B0', '#D9A05B', '#6B4A2A'] as const;

interface Pancake {
  mesh: THREE.Mesh;
  mat: THREE.MeshToonMaterial;
  bubbles: THREE.Mesh[];
  t: number;
  state: 'cooking' | 'flying' | 'ceiling' | 'landed';
  q: number;
}

export const pancakeFlip = defineMove({
  id: 'pancake_flip',
  label: '翻面',
  start(ctx, step) {
    const count = Math.max(1, Number(step.params.count ?? 1));
    let landed = 0;
    let done = false;
    let announcedReady = false;
    const offs: (() => void)[] = [];
    const tweens = createTweens(ctx);
    const speed = createPointerSpeed(ctx);
    const installed = watchInstalled(ctx, offs);
    offs.push(speed.dispose);

    const pan = () => ctx.world.prop('pan');
    const colors = COOK_COLORS.map((c) => new THREE.Color(c));
    const score: number[] = [];
    let current: Pancake | null = null;

    const panTop = (i: number) => {
      const p = pan();
      if (!p) return new THREE.Vector3(0.5, 0.95, -0.7);
      return new THREE.Vector3(
        p.object.position.x,
        p.object.position.y + p.size[1] / 2 + 0.012 + i * 0.024,
        p.object.position.z,
      );
    };

    const setDoneness = (p: Pancake, d: number) => {
      const c = d <= 1 ? colors[0]!.clone().lerp(colors[1]!, d) : colors[1]!.clone().lerp(colors[2]!, Math.min(1, (d - 1) / 0.6));
      p.mat.color.copy(c);
      p.bubbles.forEach((b, i) => {
        const s = d > 0.25 ? Math.max(0, Math.sin(p.t * 4 + i * 2.1)) * Math.min(1, (d - 0.25) * 2) : 0;
        b.scale.setScalar(0.4 + s * 0.9);
      });
    };

    const hint = () =>
      ctx.bus.emit('hint:show', {
        text: announcedReady ? `按住往上甩翻面 · ${landed}/${count}` : `等面糊起泡变色，再按住往上甩 · ${landed}/${count}`,
        gesture: 'flick-up',
      });

    const spawn = () => {
      const mat = new THREE.MeshToonMaterial({ color: COOK_COLORS[0] });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.022, 30), mat);
      const bubbles = [0, 1, 2].map(() => {
        const b = new THREE.Mesh(
          new THREE.SphereGeometry(0.013, 8, 6),
          new THREE.MeshToonMaterial({ color: '#FFFDF5' }),
        );
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 0.06;
        b.position.set(Math.cos(a) * r, 0.014, Math.sin(a) * r);
        b.scale.setScalar(0.001);
        mesh.add(b);
        return b;
      });
      mesh.position.copy(panTop(landed));
      spawnDishItem(ctx, step.dishId, 'pancake', mesh);
      current = { mesh, mat, bubbles, t: 0, state: 'cooking', q: 0 };
      setDoneness(current, 0);
      hint();
    };

    /** Flip timing quality: generous window around "just ready", wider with the nonstick pan. */
    const timingQuality = (d: number) => {
      const assist = effectOf(ctx, installed, 'nonstick_pan', 'pancake_flip')?.assist;
      const win = 0.15 + (typeof assist === 'number' ? assist : 0);
      const dist = Math.max(0, Math.abs(d - 1.05) - win);
      let q = Math.max(0.35, 1 - dist * 1.4);
      if (d > 1.6) q = Math.min(q, 0.45); // burnt: dark, sad, still edible
      return q;
    };

    const land = (p: Pancake) => {
      p.state = 'landed';
      p.mesh.position.copy(panTop(landed));
      p.mesh.rotation.x = 0;
      p.bubbles.forEach((b) => b.removeFromParent());
      p.bubbles = [];
      score.push(p.q);
      landed++;
      current = null;
      ctx.bus.emit('fx:pop', { text: '啪!', style: 'good', at: [p.mesh.position.x, p.mesh.position.y + 0.08, p.mesh.position.z] });
      ctx.bus.emit('sfx:play', { id: 'flip' });
      if (landed >= count) finish();
      else ctx.after(350, () => !done && spawn());
    };

    const launch = (p: Pancake, q: number) => {
      p.q = q;
      p.state = 'flying';
      const from = p.mesh.position.clone();
      const to = panTop(landed);
      let t = 0;
      tweens.add({
        update(dt: number) {
          t += dt;
          const k = Math.min(1, t / 0.55);
          p.mesh.position.lerpVectors(from, to, k);
          p.mesh.position.y += 4 * 0.45 * k * (1 - k); // scripted parabola, not physics
          p.mesh.rotation.x = Math.PI * k;
          if (k >= 1) {
            land(p);
            return false;
          }
          return true;
        },
      });
    };

    const stickToCeiling = (p: Pancake) => {
      p.q = 0.3;
      p.state = 'ceiling';
      ctx.bus.emit('step:oops', { dishId: step.dishId, stepId: step.stepId, reason: 'stuck_to_ceiling' });
      ctx.bus.emit('sfx:play', { id: 'oops' });
      ctx.bus.emit('fx:pop', { text: '粘天花板上了!', style: 'oops', at: [p.mesh.position.x, 1.6, p.mesh.position.z] });
      const start = p.mesh.position.y;
      tweens.go(0.18, (v) => (p.mesh.position.y = start + (2.3 - start) * v), () => {
        ctx.after(1000, () => {
          if (done) return;
          const ground = () => panTop(landed).y;
          tweens.add(fallAndBounce(p.mesh, ground, 2));
          ctx.after(900, () => {
            if (p.state === 'ceiling') land(p);
          });
        });
      });
    };

    const finish = () => {
      if (done) return;
      done = true;
      offs.forEach((f) => f());
      tweens.dispose();
      ctx.bus.emit('hint:clear', {});
      const quality = score.reduce((a, b) => a + b, 0) / Math.max(1, score.length);
      ctx.bus.emit('fx:pop', { text: quality >= 0.9 ? '张张完美!' : '翻完咯!', style: quality >= 0.9 ? 'perfect' : 'good' });
      ctx.bus.emit('sfx:play', { id: 'step_done' });
      ctx.bus.emit('step:complete', { dishId: step.dishId, stepId: step.stepId, quality, tags: [] });
    };

    offs.push(
      ctx.onFrame((dt) => {
        const p = current;
        if (!p || p.state !== 'cooking') return;
        p.t += dt;
        const d = p.t / READY;
        setDoneness(p, d);
        if (d >= 1 && !announcedReady) {
          announcedReady = true;
          ctx.bus.emit('fx:pop', { text: '可以翻了!', style: 'info', at: [p.mesh.position.x, p.mesh.position.y + 0.1, p.mesh.position.z] });
          hint();
        }
      }),
    );
    offs.push(
      ctx.input.onPointer((kind) => {
        if (done) return;
        if (kind !== 'move' || !ctx.input.pointer.down) return;
        const p = current;
        if (!p || p.state !== 'cooking') return;
        const vy = speed.vy();
        if (vy < -TOO_HARD) stickToCeiling(p);
        else if (vy < -FLICK) {
          const d = p.t / READY;
          if (d < 0.55) {
            ctx.bus.emit('fx:pop', { text: '还没好，再等等', style: 'info' });
            const y0 = p.mesh.position.y;
            tweens.go(0.25, (v) => (p.mesh.position.y = y0 + 0.05 * Math.sin(v * Math.PI)));
          } else launch(p, timingQuality(d));
        }
      }),
    );
    offs.push(ctx.input.onKey('Space', () => current && current.state === 'cooking' && launch(current, 0.85)));
    if (ctx.flags.auto) {
      for (let i = 0; i < count; i++) {
        ctx.after(600 + i * (READY * 1000 + 900), () => {
          if (!done && current && current.state === 'cooking') launch(current, 0.95);
        });
      }
    }
    spawn();

    return {
      dispose() {
        if (!done) ctx.bus.emit('hint:clear', {});
        done = true;
        // Landed pancakes stay (stack step needs them); the one still cooking is removed.
        if (current && current.state !== 'landed') {
          current.mesh.removeFromParent();
          current.mat.dispose();
          current.mesh.geometry.dispose();
        }
        offs.forEach((f) => f());
      },
    };
  },
});
